CREATE TABLE students (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL
);

CREATE TABLE courses (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL
);

CREATE TABLE enrolments (
    student_id INTEGER,
    course_id INTEGER,
    grade TEXT,
    PRIMARY KEY (student_id, course_id),
    FOREIGN KEY (student_id) REFERENCES students(id),
    FOREIGN KEY (course_id) REFERENCES courses(id)
);

INSERT INTO students (id, name) VALUES
(1, 'Alice'),
(2, 'Brian'),
(3, 'Carol'),
(4, 'David');

INSERT INTO courses (id, name) VALUES
(1, 'Database Systems'),
(2, 'Web Development'),
(3, 'Python Programming');

INSERT INTO enrolments (student_id, course_id, grade) VALUES
(1, 1, 'A'),
(1, 2, 'B'),
(2, 1, 'B'),
(2, 3, 'A'),
(3, 2, 'A');
SELECT students.name AS student, courses.name AS course, enrolments.grade
FROM enrolments
JOIN students ON enrolments.student_id = students.id
JOIN courses ON enrolments.course_id = courses.id;
SELECT courses.name AS course, COUNT(enrolments.student_id) AS student_count
FROM courses
LEFT JOIN enrolments ON courses.id = enrolments.course_id
GROUP BY courses.id, courses.name;
SELECT students.name AS student, COUNT(enrolments.course_id) AS course_count
FROM students
LEFT JOIN enrolments ON students.id = enrolments.student_id
GROUP BY students.id, students.name;
SELECT students.name AS student, courses.name AS course
FROM enrolments
JOIN students ON enrolments.student_id = students.id
JOIN courses ON enrolments.course_id = courses.id
WHERE enrolments.grade = 'A';
SELECT courses.name AS course,
       COUNT(enrolments.student_id) AS total_students,
       SUM(CASE WHEN enrolments.grade = 'A' THEN 1 ELSE 0 END) AS grade_A
FROM courses
LEFT JOIN enrolments ON courses.id = enrolments.course_id
GROUP BY courses.id, courses.name;
