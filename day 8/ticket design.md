# TicketHub: System Design

TicketHub is a website that sells tickets for concerts and events. This document follows the six-part framework: requirements, estimates, API, data model, architecture, and trade-offs. The hardest problem is the "big sale", when a popular concert goes on sale and far more people than seats arrive at once.

## 1. Requirements

### Functional
- Users register, log in and manage their account.
- Users browse and search upcoming events and view an event's details.
- Users view the seat map of an event with each seat's availability and price.
- Users select seats and **hold** them temporarily (5 minutes) while they pay.
- Users pay for held seats and receive a confirmation and e-tickets (by email and in "My tickets").
- Users view their tickets and past orders.
- Admins create events, set prices and open the sale at a given time.
- Held seats that are not paid for are released automatically.

### Non-functional
- **Correctness (most important):** a seat is **never sold to two people**. A user is never charged without getting a ticket, and never gets a ticket without paying. Every confirmed ticket survives crashes (durability).
- **Speed:** browsing pages respond in under 1 second (p95); the seat map loads in under 1 second; a hold request answers in under 500 ms (p95), even during a big sale.
- **Fairness:** during a big sale, access is first-come-first-served through a queue; one person cannot grab hundreds of seats (limit of 4 tickets per order and per event per user); bots are slowed by rate limits and verification.
- **Availability:** 99.9% overall, and the sale must not crash when 10 times more people than seats show up; the system degrades gracefully (waiting room, "sold out" message) instead of failing.
- **Scalability:** handle about 500 times normal traffic for short bursts, scaling out before the sale.
- **Security:** HTTPS, hashed passwords, card details handled only by the payment provider (never stored by us), users can see only their own orders.
- **Observability:** metrics, logs and alerts for errors, latency, queue length and seat-hold failures.

## 2. Estimates

### Assumptions
- 2,000,000 registered users.
- Normal day: 50,000 visitors, each viewing 10 pages; 5,000 tickets sold.
- Big sale: 200,000 people try to buy 20,000 seats in the first 10 minutes (600 seconds).
- Peak on a normal day = 5x the average. A day has 86,400 seconds.
- During the big sale each person makes about 10 requests in the 10 minutes (event page, seat map refreshes, a hold attempt, payment). Order size about 1 KB in the database.

### Normal day
| Metric | Working | Result |
|---|---|---|
| Page views per day | 50,000 x 10 | 500,000 |
| Page views per second (average) | 500,000 / 86,400 | **about 6/s** |
| Page views per second (5x peak) | 6 x 5 | **about 29/s** |
| Ticket purchases per second (average) | 5,000 / 86,400 | **about 0.06/s** (one every 17 s) |
| Ticket purchases per second (5x peak) | 0.058 x 5 | **about 0.3/s** |
| Order storage per year | 5,000 x 365 = 1.8 million tickets x about 1 KB | **about 2 GB** |

### Big sale (20,000 seats, 200,000 buyers, 10 minutes)
| Metric | Working | Result |
|---|---|---|
| People arriving per second | 200,000 / 600 | **about 333/s** |
| Requests per second (average over the window) | 200,000 x 10 / 600 | **about 3,300/s** |
| Requests per second (first-minute burst, about 3x) | 3,300 x 3 | **about 10,000/s** |
| Seat hold attempts per second | 200,000 / 600 | **about 333/s** (most will fail) |
| Successful purchases per second | 20,000 / 600 | **about 33/s** |
| Demand vs supply | 200,000 / 20,000 | **10 people per seat**, so 90% leave without a ticket |

### Comparison
| Measure | Normal day | Big sale | Ratio |
|---|---|---|---|
| Requests per second (average) | about 6 | about 3,300 | **about 575x** |
| Purchases per second | about 0.06 | about 33 | **about 575x** |
| Competition for the same rows | almost none | 10 people per seat | extreme |

The big sale is roughly **500 to 1,000 times** the normal load, but only for about 10 minutes, and the contention is on the same 20,000 seat rows. The average daily load would fit on one server; the design is driven entirely by this short spike. Storage is not a concern (a few GB per year). The real danger is not raw volume (about 333 hold attempts per second is manageable for a database), but **many people trying to take the same seats at the same moment**.

## 3. API

Base URL `/v1`, JSON, `Authorization: Bearer <token>` on everything except browsing and login.

| # | Method | Path | Description | Success |
|---|--------|------|-------------|---------|
| 1 | POST | `/auth/login` | Log in and get a token | 200 OK |
| 2 | GET | `/events` | Browse and search events (`?q=`, `?city=`, `?cursor=`) | 200 OK |
| 3 | GET | `/events/{id}` | Event details (name, venue, date, sale status) | 200 OK |
| 4 | GET | `/events/{id}/seats` | Seat map with availability and prices | 200 OK |
| 5 | POST | `/events/{id}/holds` | Hold chosen seats for 5 minutes; creates a pending order | 201 Created |
| 6 | DELETE | `/orders/{orderId}/hold` | Release a hold early | 204 No Content |
| 7 | POST | `/orders/{orderId}/payment` | Pay for the held seats | 200 OK |
| 8 | GET | `/me/tickets` | List my tickets | 200 OK |
| 9 | GET | `/orders/{orderId}` | Check an order's status | 200 OK |

### Example: hold seats
`POST /v1/events/55/holds`, header `Idempotency-Key: 7c1e...`
```json
{ "seat_ids": [1201, 1202] }
```
Response `201 Created`:
```json
{
  "order_id": 9001,
  "status": "pending",
  "seats": [1201, 1202],
  "total_cents": 24000,
  "hold_expires_at": "2026-10-10T20:05:00Z"
}
```
If someone else got a seat first: `409 Conflict`
```json
{ "error": { "code": "SEAT_UNAVAILABLE", "message": "Seat 1202 was just taken.", "unavailable_seat_ids": [1202] } }
```

### Example: pay
`POST /v1/orders/9001/payment`, header `Idempotency-Key: 3b9d...`
```json
{ "payment_token": "tok_from_payment_provider" }
```
Response `200 OK`: `{ "order_id": 9001, "status": "paid", "tickets": [{ "ticket_id": 7001, "seat_id": 1201 }, { "ticket_id": 7002, "seat_id": 1202 }] }`

### Other status codes
`400` bad input (for example more than 4 seats), `401` not logged in, `403` order belongs to someone else, `404` event/order not found, `409` seat already taken, `410 Gone` hold expired, `402` payment declined, `429` rate limit or waiting-room "come back later", `503` overloaded. `Idempotency-Key` makes retried hold and payment requests safe: repeating a request returns the original result and never charges or reserves twice.

## 4. Data model

```
users 1 ---< orders 1 ---< tickets >--- 1 seats >---1 events
                 ^                                      
                 +---- seats.hold_order_id (current hold, optional)
```

- **users to orders:** one-to-many (a user places many orders).
- **orders to tickets:** one-to-many (an order contains one to four tickets).
- **events to seats:** one-to-many (an event has thousands of seats).
- **seats to tickets:** one-to-one at most (a seat can have **at most one ticket**, enforced by a unique constraint).
- Users and events are linked through orders and tickets (many-to-many).

```sql
CREATE TABLE users (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email         VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  name          VARCHAR(100) NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE events (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name        VARCHAR(200) NOT NULL,
  venue       VARCHAR(200) NOT NULL,
  starts_at   TIMESTAMPTZ NOT NULL,
  sale_opens_at TIMESTAMPTZ NOT NULL,
  status      VARCHAR(20) NOT NULL DEFAULT 'scheduled'  -- scheduled, on_sale, sold_out, cancelled
);

CREATE TABLE orders (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id         BIGINT NOT NULL REFERENCES users(id),
  event_id        BIGINT NOT NULL REFERENCES events(id),
  status          VARCHAR(20) NOT NULL DEFAULT 'pending',  -- pending, paid, expired, cancelled
  total_cents     INTEGER NOT NULL CHECK (total_cents >= 0),
  idempotency_key VARCHAR(64) NOT NULL,
  payment_ref     VARCHAR(100),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, idempotency_key)
);

CREATE TABLE seats (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_id        BIGINT NOT NULL REFERENCES events(id),
  section         VARCHAR(20) NOT NULL,
  row_label       VARCHAR(10) NOT NULL,
  seat_number     INTEGER NOT NULL,
  price_cents     INTEGER NOT NULL CHECK (price_cents >= 0),
  status          VARCHAR(10) NOT NULL DEFAULT 'available'
                  CHECK (status IN ('available', 'held', 'sold')),
  hold_order_id   BIGINT REFERENCES orders(id),
  hold_expires_at TIMESTAMPTZ,
  UNIQUE (event_id, section, row_label, seat_number)
);

CREATE TABLE tickets (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id   BIGINT NOT NULL REFERENCES orders(id),
  seat_id    BIGINT NOT NULL UNIQUE REFERENCES seats(id),  -- one seat, one ticket, ever
  issued_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_seats_event_status ON seats (event_id, status);
CREATE INDEX idx_orders_user ON orders (user_id, created_at DESC);
CREATE INDEX idx_seats_hold_expiry ON seats (hold_expires_at) WHERE status = 'held';
```

## 5. How the design prevents two people buying the same seat

Double-booking happens when two requests read "seat is available" at the same time and both write "sold". The design stops this with **four layers**, and the database (not the cache or app server) has the final say.

**Layer 1: an atomic conditional update in one transaction.** A hold is a single `UPDATE` whose `WHERE` clause checks the seat is still free. The check and the change are one atomic step, so there is no gap between "read" and "write":

```sql
BEGIN;
INSERT INTO orders (user_id, event_id, total_cents, idempotency_key)
VALUES ($user, $event, 0, $key) RETURNING id;           -- pending order, say 9001

UPDATE seats
SET status = 'held', hold_order_id = 9001,
    hold_expires_at = now() + interval '5 minutes'
WHERE event_id = $event
  AND id = ANY($seat_ids)
  AND (status = 'available'
       OR (status = 'held' AND hold_expires_at < now()));  -- expired holds can be retaken
-- the application checks: rows updated = number of seats requested
-- if fewer: ROLLBACK and return 409 SEAT_UNAVAILABLE   (all or nothing)
COMMIT;
```

When two people click seat 1201 at the same moment, PostgreSQL takes a **row lock** for the first `UPDATE`. The second waits, then re-checks the `WHERE` condition against the committed row: the seat is now `held`, so it matches zero rows, and that user gets a clean `409`. Because it is one transaction, either all the requested seats are held or none are (no half-held orders). To avoid deadlocks when two orders want overlapping seats, seats are always updated in ascending `id` order.

**Layer 2: the unique constraint is the safety net.** `tickets.seat_id` is `UNIQUE`. Even if a bug or a race somewhere above let two orders try to issue the same seat, the database rejects the second `INSERT` and the transaction fails. Correctness does not rely only on application code being perfect.

**Layer 3: payment re-checks the hold in a transaction.** When the payment succeeds, one transaction confirms the seat is still held by this order and has not expired, then marks it sold and inserts the tickets:

```sql
BEGIN;
UPDATE seats SET status = 'sold'
WHERE hold_order_id = 9001 AND status = 'held' AND hold_expires_at > now();
-- rows updated must equal the order's seat count, otherwise ROLLBACK and refund
INSERT INTO tickets (order_id, seat_id) SELECT 9001, id FROM seats WHERE hold_order_id = 9001;
UPDATE orders SET status = 'paid', payment_ref = $ref WHERE id = 9001;
COMMIT;
```

If the hold expired while the user was paying and someone else took the seat, the update matches too few rows, the transaction rolls back, and the payment is refunded automatically. We also charge the card only **after** the hold is confirmed valid and keep the hold at 5 minutes, longer than a normal checkout.

**Layer 4: expiry and idempotency.** A worker runs every 30 seconds to release expired holds (`status = 'available'`), and the hold query also treats an expired hold as free, so a stuck seat can never stay locked. `Idempotency-Key` values mean a double-click or network retry returns the same order instead of creating a second one.

The Redis cache and the waiting room only reduce traffic; they never decide who gets a seat. A stale cache can only cause a user to see a seat as free that is taken, which ends in a harmless `409`.

## 6. Architecture

```
                         +------------------+
                         |      Client      |
                         |  (web / mobile)  |
                         +---------+--------+
                                   |
                                   v
                         +------------------+
                         |       DNS        |
                         +---------+--------+
                                   |
                                   v
                         +------------------+
          static files,  |       CDN        |  cached event pages
          images, JS     +---------+--------+  (+ bot protection / rate limit)
                                   |
                                   v
                         +------------------+
                         |  Waiting Room    |  admits users at a safe rate
                         | (virtual queue)  |  during a big sale
                         +---------+--------+
                                   |
                                   v
                         +------------------+
                         |  Load Balancer   |  (active + standby)
                         +---------+--------+
                                   |
            +----------------------+----------------------+
            |                      |                      |
            v                      v                      v
     +-------------+        +-------------+        +-------------+
     | App Server 1|        | App Server 2|  ...   | App Server N|   (auto-scaled)
     +------+------+        +------+------+        +------+------+
            |                      |                      |
   +--------+----------+-----------+-----------+----------+
   |                   |                       |          |
   v                   v                       v          v
+---------+     +-------------+        +-------------+  +-----------+
|  Cache  |     | Primary DB  |------->| Read Replica|  |   Queue   |
| (Redis) |     | (seats,     |  repl. | (browsing,  |  +-----+-----+
|         |     |  orders:    |        |  event info)|        |
+---------+     |  all holds  |        +-------------+        v
                |  and sales) |                         +------------+     +-----------+
                +-------------+                         |  Workers   |---->|  Payment  |
                                                        | (expiry,   |     |  Provider |
                                                        |  email,    |     | (external)|
                                                        |  e-tickets)|     +-----------+
                                                        +------------+
```

### Components, one sentence each
- **Client:** The web or mobile app that shows events and the seat map, and tells users clearly when a seat was just taken or they are waiting in the queue.
- **DNS:** Directs users to the nearest healthy entry point and lets us fail over if one location goes down.
- **CDN (with bot protection and rate limiting):** Serves images, scripts and cached event pages from the edge so most of the sale traffic never reaches our servers, and it blocks abusive bots.
- **Waiting room (virtual queue):** Puts the 200,000 arrivals into a fair first-come-first-served line and lets them in at a rate the backend can handle, which protects the system and keeps the sale fair.
- **Load balancer:** Spreads admitted requests across app servers and removes unhealthy ones, so no single server is overloaded.
- **App servers (many, auto-scaled):** Run the stateless API (validation, holds, payments) and are added before and during the sale to absorb the burst.
- **Cache (Redis):** Holds event details and a seat-availability snapshot refreshed every second or two, so the thousands of seat-map views per second do not hit the database.
- **Primary database:** The single source of truth for seats, holds, orders and tickets, where transactions and constraints guarantee no double-booking.
- **Read replica:** Serves browsing and "my tickets" reads so the primary can focus on the hold and payment writes.
- **Queue:** Accepts follow-up jobs instantly so a purchase request returns quickly and spikes are absorbed rather than dropped.
- **Workers:** Release expired holds, send confirmation emails, generate e-ticket PDFs and reconcile payments in the background.
- **Payment provider (external):** Handles card details and charging, so we never store card data and need not build payment processing.

### How it survives the big sale
1. **Before the sale:** pre-scale app servers and cache, warm the cache with the event and seat map, and open the waiting room 30 minutes early so the crowd lines up instead of all hitting at second zero.
2. **Absorb the crowd at the edge:** the CDN serves everything static, and the waiting room releases users at a controlled rate, for example 300 to 500 a second. The core only sees traffic it can handle, not the full 10,000 requests per second burst.
3. **Reads from cache, writes to the database:** the seat map comes from Redis (stale by a second at most); only holds and payments touch the primary. About 333 hold attempts per second, a single-row `UPDATE` each, is well within one PostgreSQL primary, and the seat rows are spread across 20,000 different rows so locks rarely collide except on the most popular seats.
4. **Fail fast on sold-out seats:** once a seat or section is sold, the cache marks it unavailable and a "remaining seats" counter lets the API return "sold out" without a database call. When all 20,000 seats are gone, the waiting room tells everyone still in line the event is sold out, so 180,000 disappointed users stop retrying.
5. **Protect fairness:** a limit of 4 tickets per user, per-account and per-IP rate limits, and bot checks.
6. **Stay up if something fails:** at least two of every component across availability zones, a standby database that can be promoted, and the system can pause new admissions from the waiting room if the error rate rises.

## 7. Trade-offs

1. **Strong consistency vs raw speed.** Using database transactions and row locks for seats is slower and harder to scale than a "best effort" cache, but a double-sold seat means an angry customer and refunds, so we accept it. The price is that all seat writes go through one primary; at about 33 purchases per second and 333 hold attempts per second this is comfortably affordable, and we could later split by event.
2. **Cached seat map (stale) vs always-fresh seat map.** A one to two second old cache lets thousands of users view the map without overloading the database, but users sometimes click a seat that was just taken and get a `409`. The UI handles this gracefully ("that seat was just taken, please pick another") and the database always has the final word.
3. **Waiting room fairness vs user convenience.** A queue protects the system and gives everyone a fair turn, but people must wait and some will lose in the queue even though they are fast on the seat map. Without it, the fastest bots would win and the site could crash.
4. **Hold duration: long vs short.** A 5-minute hold gives people time to pay but leaves seats locked, so inventory is unavailable to others while the 90% who lose watch the map; a shorter hold frees seats faster but causes more failed payments. Five minutes is a middle ground and can be tuned per event.
5. **Single SQL primary vs sharding.** One primary keeps transactions simple, but it is a write bottleneck and a failure risk. We reduce the risk with a standby and accept the limit because the numbers fit; sharding by event is the next step if we outgrow it.
