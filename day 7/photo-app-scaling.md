# SnapShare Scaling Plan

SnapShare is a photo-sharing app: users upload photos and scroll a feed of photos from people they follow.

## 1. Assumptions

| Item | Value |
|---|---|
| Registered users | 10,000,000 |
| Daily active users (DAU) | 10% of registered |
| Uploads per active user per day | 1 photo |
| Feed page views per active user per day | 50 |
| Average original photo size | 2 MB |
| Thumbnail size (one per photo) | 50 KB |
| Seconds in a day | 86,400 |
| Peak multiplier | 5x the average |
| Units | Decimal (1 TB = 1,000,000 MB) |
| Traffic shape | Spread evenly over the day for the average; peak covers busy hours |

**Daily active users:** 10,000,000 x 10% = **1,000,000 DAU**.

## 2. Estimates

### Uploads per second
- Uploads per day = 1,000,000 users x 1 photo = 1,000,000
- Average = 1,000,000 / 86,400 = **about 12 uploads/s**
- Peak (5x) = **about 58 uploads/s**

### Feed views per second
- Feed views per day = 1,000,000 users x 50 = 50,000,000
- Average = 50,000,000 / 86,400 = **about 579 views/s**
- Peak (5x) = **about 2,900 views/s**

### Storage per year
- Per photo = 2 MB original + 0.05 MB thumbnail = 2.05 MB
- Per day = 1,000,000 x 2.05 MB = 2.05 TB
- Per year = 2.05 TB x 365 = **about 748 TB (roughly 0.75 PB)**
  - Originals: 730 TB
  - Thumbnails: 18.25 TB

| Metric | Average | Peak (5x) |
|---|---|---|
| Uploads/s | ~12 | ~58 |
| Feed views/s | ~579 | ~2,900 |
| New storage | ~2.05 TB/day | n/a |
| Storage/year | ~748 TB | n/a |

## 3. Read-heavy or write-heavy?

**SnapShare is read-heavy.** Feed views outnumber uploads 50 to 1 (50 million vs 1 million per day), and that is before counting that every feed view loads many images.

What this means for the design:
- **Cache aggressively.** Feed results and hot photo metadata go in an in-memory cache so most reads never reach the database.
- **Use a CDN for images.** Popular photos and thumbnails are served from edge locations, not from our servers.
- **Add read replicas.** Reads go to replicas while the primary handles the comparatively few writes.
- **Use thumbnails in the feed.** A 50 KB thumbnail is 40x smaller than the 2 MB original, which saves bandwidth on the most common action.
- **Keep the write path simple.** Writes are rare (~12/s), so one primary database is enough for now; do heavy work (thumbnails) asynchronously so uploads stay fast.

## 4. Why photos do not go in the database

Photos should **not** be stored as blobs in the database because:
- At ~748 TB per year they would make the database enormous, slow to back up, slow to restore, and expensive (database storage costs far more per GB than object storage).
- Large binary reads compete with small, fast metadata queries for memory, disk I/O and connections, slowing the whole app.
- Replicating the database would copy every photo to every replica.
- Databases cannot serve files through a CDN directly.

**Instead:** store photo files in **object storage** (e.g. Amazon S3 or equivalent), which is cheap, durable and effectively unlimited. The database stores only the **metadata and a reference**: photo ID, owner, caption, timestamp, and the object-storage keys for the original and the thumbnail.

## 5. Architecture diagram

```
                          +-----------+
                          |   Users   |
                          | (mobile / |
                          |   web)    |
                          +-----+-----+
                                |
              +-----------------+------------------+
              | (photo/thumbnail reads)            | (API: upload, feed)
              v                                    v
        +-----------+                      +---------------+
        |    CDN    |                      | Load Balancer |
        +-----+-----+                      +-------+-------+
              | (cache miss)                       |
              |                      +-------------+-------------+
              |                      |             |             |
              |                      v             v             v
              |                +-----------+ +-----------+ +-----------+
              |                | App Server| | App Server| | App Server|
              |                +-----+-----+ +-----+-----+ +-----+-----+
              |                      |             |             |
              |        +-------------+------+------+-------------+
              |        |             |      |                    |
              |        v             v      v                    v
              |   +---------+   +--------+ +------------+   +-----------+
              |   |  Cache  |   |Primary | | Read       |   |   Queue   |
              |   | (Redis) |   |   DB   | | Replica DB |   | (thumb    |
              |   +---------+   |(writes)|-> (reads)     |   |  jobs)    |
              |                 +--------+ +------------+   +-----+-----+
              |                                                   |
              |                                                   v
              |                                            +-------------+
              |                                            |   Worker    |
              |                                            | (thumbnails)|
              |                                            +------+------+
              |                                                   |
              v                                                   v
        +---------------------------------------------------------------+
        |              Object Storage (originals + thumbnails)          |
        +---------------------------------------------------------------+
```

Notes on the diagram:
- Users fetch image files through the CDN, which pulls from object storage on a cache miss.
- API calls go through the load balancer to the app servers.
- App servers check the cache first, then the read replica for reads; they write to the primary DB, which replicates to the read replica.
- On upload, app servers put the original in object storage and a job on the queue; the worker reads the original, creates the thumbnail and writes it back to object storage.

## 6. Components, one sentence each

- **CDN:** Delivers photos and thumbnails from servers close to the user, which cuts latency and keeps most image traffic off our own servers.
- **Load balancer:** Spreads incoming requests across many app servers so no single server is overloaded and a failed server can be skipped.
- **App servers:** Run the stateless application logic (authentication, upload, feed building) and can be added or removed to match traffic.
- **Cache:** Holds frequently requested feed pages and metadata in memory so repeated reads are fast and the database is protected from the ~2,900 views/s peak.
- **Primary database:** Stores users, follows, and photo metadata durably and handles all writes consistently.
- **Read replica:** Serves read queries from a copy of the primary, so the read-heavy load is spread out and the primary is not overwhelmed.
- **Object storage:** Stores the large photo files cheaply and durably at ~748 TB per year, which a database cannot do economically.
- **Queue:** Holds thumbnail jobs so the upload request can return immediately and traffic spikes are absorbed instead of dropped.
- **Worker:** Pulls jobs from the queue and generates thumbnails in the background, so heavy image processing never slows the user-facing request.

## 7. Upload flow, step by step

1. The user picks a photo in the app and taps upload; the client sends it to the API (it may be sent directly to object storage via a pre-signed URL to spare the app servers).
2. The **load balancer** forwards the request to a healthy **app server**.
3. The app server authenticates the user and validates the file (type, size limit).
4. The app server saves the **original photo (~2 MB)** to **object storage** and receives its storage key.
5. The app server writes a metadata row to the **primary database**: photo ID, user ID, caption, timestamp, original key, and a status of "processing".
6. The app server puts a **"create thumbnail" job** (photo ID and original key) on the **queue**.
7. The app server returns "success" to the user right away, without waiting for the thumbnail.
8. A **worker** takes the job from the queue, downloads the original from object storage, and generates the **50 KB thumbnail**.
9. The worker saves the thumbnail to **object storage** and updates the database row with the thumbnail key and status "ready". If the job fails, it is retried; after several failures it goes to a dead-letter queue for investigation.
10. The relevant **cache** entries (e.g. followers' feeds) are invalidated or updated so the new photo appears.
11. Followers' feed requests now show the thumbnail, served through the **CDN**.

## 8. Trade-offs

1. **Cache speed vs freshness.** Caching feeds makes reads fast and cheap, but users may see slightly stale feeds (a new photo can take seconds to appear). We accept eventual consistency because feeds don't need to be instant, and keep short cache expiry times to limit staleness.
2. **Read replica scale vs replication lag.** Replicas let us scale reads, but a replica may lag behind the primary, so a user might not see their own photo immediately after posting. A mitigation is to read the user's own recent posts from the primary or the cache.
3. **Async thumbnails vs immediate availability.** Using a queue and worker makes uploads fast and resilient to spikes, but the thumbnail is not ready instantly, so the feed may briefly show a placeholder or the photo may be delayed. It also adds more moving parts (queue, workers, retries) to run and monitor.
4. **CDN cost and freshness vs speed.** A CDN greatly cuts latency and origin load but adds cost, and deleted or changed photos can remain cached until they expire or are purged.
5. **Storing thumbnails separately vs extra storage.** Keeping a 50 KB thumbnail costs about 18 TB per year extra, but saves far more bandwidth because the feed loads thumbnails instead of 2 MB originals.

## 9. Possible next steps when the app grows

- Shard the database (e.g. by user ID) when the primary can no longer handle writes.
- Precompute feeds for users (fan-out on write), with special handling for accounts with huge follower counts.
- Move old originals to cheaper cold storage tiers.
