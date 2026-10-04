# Library Books REST API

## 1. List All Books

* **Method:** GET
* **Path:** `/books`
* **Description:** Returns a list of all books.
* **Success status:** `200 OK`

Example request:

```http
GET /books
```

## 2. Get One Book

* **Method:** GET
* **Path:** `/books/:id`
* **Description:** Returns one book using its ID.
* **Success status:** `200 OK`

Example request:

```http
GET /books/42
```

## 3. Create a Book

* **Method:** POST
* **Path:** `/books`
* **Description:** Creates a new book.
* **Success status:** `201 Created`

Example request body:

```json
{
  "title": "Things Fall Apart",
  "author": "Chinua Achebe",
  "year": 1958
}
```

## 4. Update a Book

* **Method:** PUT
* **Path:** `/books/:id`
* **Description:** Updates an existing book using its ID.
* **Success status:** `200 OK`

Example request:

```http
PUT /books/42
```

Example request body:

```json
{
  "title": "Things Fall Apart",
  "author": "Chinua Achebe",
  "year": 1958
}
```

## 5. Delete a Book

* **Method:** DELETE
* **Path:** `/books/:id`
* **Description:** Deletes a book using its ID.
* **Success status:** `204 No Content`

Example request:

```http
DELETE /books/42
```

## 6. List Books by Author

* **Method:** GET
* **Path:** `/books?author=Chinua%20Achebe`
* **Description:** Returns books written by the specified author.
* **Success status:** `200 OK`

Example request:

```http
GET /books?author=Chinua%20Achebe
```

## Error Codes

### 400 Bad Request

* The request is invalid or contains missing/incorrect data.
* Example: Creating a book without providing a required title.

### 404 Not Found

* The requested book does not exist.
* Example: Requesting `GET /books/9999` when book 9999 does not exist.
