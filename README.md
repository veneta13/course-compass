```mermaid
erDiagram
    COURSES ||--o{ REVIEWS : "has"
    COURSES ||--o{ GRADE_DISTRIBUTIONS : "records"
    GRADE_DISTRIBUTIONS ||--o{ GRADE_COUNTS : "contains"
    COURSES ||--o{ DEGREE_COURSES : "categorized in"
    DEGREES ||--o{ DEGREE_COURSES : "contains"
    COURSES ||--|| COURSE_SEMESTER : "specifies"
    COURSES ||--o{ COURSE_OFFERINGS : "offered in"

    COURSES {
        varchar course_id PK "Unique course identifier"
        varchar course_name "Course title"
        text module_description "Course contents and syllabus"
        int ects "Credit points"
        varchar course_type "e.g., Practical Course, Seminar"
        varchar language "e.g., English, German"
        varchar assessment_type "e.g., Project, Exam"
        text prerequisites "Recommended background"
        numeric workload_hours_per_week "Estimated weekly effort"
    }

    DEGREES {
        varchar degree_id PK "Unique degree program code"
        varchar degree_name "Full degree title"
    }

    REVIEWS {
        serial review_id PK "Unique review identifier"
        varchar course_id FK "References courses(course_id)"
        text review_text "Student feedback text"
        timestamp created_at "Submission timestamp"
    }

    GRADE_DISTRIBUTIONS {
        serial distribution_id PK "Unique distribution identifier"
        varchar course_id FK "References courses(course_id)"
        int year "Academic year"
        varchar semester "e.g., WS2023, SS2024"
        varchar exam_type "endterm or retake"
        int grade5x "Count of no-shows (5.0 X)"
        int ungraded_passed "Count of passes without a grade"
        int ungraded_failed "Count of fails without a grade"
    }

    GRADE_COUNTS {
        int distribution_id PK, FK "References grade_distributions(distribution_id)"
        numeric grade PK "Grade from 1.0 to 5.0 in steps of 0.1"
        int student_count "Number of students with this grade"
    }

    DEGREE_COURSES {
        varchar course_id PK, FK "References courses(course_id)"
        varchar degree_id PK, FK "References degrees(degree_id)"
        varchar degree_group PK "Curriculum group/module area"
    }

    COURSE_SEMESTER {
        varchar course_id PK, FK "References courses(course_id)"
        boolean offered_winter "Available in winter semester"
        boolean offered_summer "Available in summer semester"
    }

    COURSE_OFFERINGS {
        serial offering_id PK "Unique offering identifier"
        varchar course_id FK "References courses(course_id)"
        int year "Academic year"
        varchar semester "e.g., WS2024, SS2025"
        varchar schedule "Timetable slot (e.g., Tue 14:00-18:00)"
        varchar room "Lecture hall or lab room"
        varchar lecturer "Instructor or professor"
        boolean is_current "Active semester offering flag"
    }
```

## Importing grade distributions

Connection settings come from `.env` (see `.env.example`).

```
pip install -r requirements.txt
python setup_db.py
python import_grade_distributions.py
```

The import reads `courses.json` from the [TUM Info API](https://mykolamor.github.io/tum_info/api/description) with a single request. You can run it again at any time: it updates existing rows and adds new ones, and an exam removed from the API stays in the table. If a run fails, nothing is saved.

If your database still has the older `grade10`, `grade13`, ... columns, `setup_db.py` stops with an error and changes nothing. Drop the table first, then run the commands above. The import fills it again:

```
psql -d course_compass -c 'DROP TABLE grade_distributions CASCADE;'
```

### How results are stored

- **Courses:** `course_id` is the TUM module number, such as `IN2227`. A course that doesn't exist yet gets a row with only its ID and name. Existing courses aren't changed.
- **Semesters:** winter semesters use the year they start in, so the API's `2023WS` (WS 2023/24) is stored as year `2023` and semester `WS2023`.
- **One row per exam:** each course, semester and exam type (`endterm` or `retake`) gets its own row in `grade_distributions`, so a student who sat both exams appears in both rows. An exam with no results gets no row.

| `grade` in the API | Stored as |
|---|---|
| `1.0` to `5.0`, including in-between grades such as `1.4` | A row in `grade_counts`, unchanged |
| `6.0` (no-show) | `grade5x` |
| `7.0` (passed without a grade), `8.0` (failed without a grade) | `ungraded_passed`, `ungraded_failed` |

An unknown grade or semester stops the import with an error, so no data is lost silently.

### Reading grade bands and averages

For charts, query the `grade_distribution_bands` view. It adds up `grade_counts` for each exam:

| Column | Grades included |
|---|---|
| `very_good` | 1.0 to 1.5 |
| `good` | 1.6 to 2.5 |
| `satisfactory` | 2.6 to 3.5 |
| `sufficient` | 3.6 to 4.0 |
| `failed` | 4.1 to 5.0 |
| `average_grade` | 1.0 to 5.0 |
| `average_passed` | 1.0 to 4.0 |

Averages leave out no-shows and results without a grade, and are `NULL` for an exam with no real grades.

```sql
SELECT year, semester, exam_type, very_good, good, satisfactory, sufficient, failed,
       average_grade, average_passed
FROM grade_distribution_bands
WHERE course_id = 'IN2227'
ORDER BY year, semester, exam_type;
```