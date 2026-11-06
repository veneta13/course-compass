# Database schema

The tables are defined in [schema.sql](../src/course_compass/schema.sql). To create them, follow [Getting started](../README.md#getting-started).

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

The diagram shows tables only. The `grade_distribution_bands` view is described in [Grade distributions](grade-distributions.md#reading-grade-bands-and-averages).
