# School Database Design

## Entities

The database contains three main entities:

### Students

Stores information about students.

- `id` - Primary key
- `name` - Student's name

### Courses

Stores information about courses.

- `id` - Primary key
- `name` - Course name

### Enrolments

Connects students to courses and stores their grades.

- `student_id` - Foreign key referencing students
- `course_id` - Foreign key referencing courses
- `grade` - Student's grade

## Relationships

A student can enrol in many courses.

A course can have many students.

Therefore, students and courses have a many-to-many relationship.

The `enrolments` table resolves this many-to-many relationship by storing pairs of `student_id` and `course_id`.

## Primary Key

The `students.id` column uniquely identifies each student.

The `courses.id` column uniquely identifies each course.

The combination of `student_id` and `course_id` uniquely identifies an enrolment.

## Foreign Keys

`enrolments.student_id` references `students.id`.

`enrolments.course_id` references `courses.id`.

## SQL Concepts Used

The assignment uses:

- CREATE TABLE
- INSERT
- JOIN
- LEFT JOIN
- GROUP BY
- WHERE
- COUNT
- CASE
- Primary keys
- Foreign keys
