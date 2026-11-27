"""SQL used by the API. Tables and views are defined in ../schema.sql."""

# Courses of one degree in one semester.
COURSES_SQL = """
    SELECT cat.*
    FROM course_catalog AS cat
    JOIN course_degrees AS d ON d.course_id = cat.course_id
    WHERE cat.semester_id = $1 AND d.degree = $2
    ORDER BY COALESCE(cat.title_en, cat.title)
"""

COURSE_SQL = "SELECT * FROM course_catalog WHERE course_id = $1"

# TUM Info exam codes that belong to each course: candidate matches by module
# code plus manual matches, without the ones marked as rejected.
_MATCHED_CODES = """
    SELECT m.course_id, m.course_code
    FROM tum_info_candidate_course_matches AS m
    WHERE NOT EXISTS (
        SELECT 1 FROM course_tum_info_matches AS r
        WHERE r.course_id = m.course_id AND r.course_code = m.course_code AND r.status = 'rejected')
    UNION
    SELECT course_id, course_code FROM course_tum_info_matches WHERE status <> 'rejected'
"""

# GradeSummary per course, from end-term exams only, so students who also took
# the retake aren't counted twice.
GRADE_SUMMARY_SQL = f"""
    WITH codes AS ({_MATCHED_CODES})
    SELECT codes.course_id,
           SUM(b.very_good)::INT AS very_good,
           SUM(b.good)::INT AS good,
           SUM(b.satisfactory)::INT AS satisfactory,
           SUM(b.sufficient)::INT AS sufficient,
           SUM(b.failed)::INT AS failed,
           SUM(b.very_good + b.good + b.satisfactory + b.sufficient + b.failed)::INT AS total_students,
           COUNT(DISTINCT b.semester)::INT AS semester_count,
           SUM(b.average_grade * (b.very_good + b.good + b.satisfactory + b.sufficient + b.failed))
               / NULLIF(SUM(b.very_good + b.good + b.satisfactory + b.sufficient + b.failed)
                        FILTER (WHERE b.average_grade IS NOT NULL), 0) AS average_grade
    FROM codes
    JOIN tum_info_grade_distribution_bands AS b ON b.course_code = codes.course_code
    WHERE b.exam_type = 'endterm' AND codes.course_id = ANY($1::BIGINT[])
    GROUP BY codes.course_id
"""

# Every exam of one course, with its grade counts.
DISTRIBUTIONS_SQL = f"""
    WITH codes AS ({_MATCHED_CODES})
    SELECT d.semester, d.year, d.exam_type, d.no_show_count AS grade5x,
           COALESCE(jsonb_object_agg(g.grade::TEXT, g.student_count)
                    FILTER (WHERE g.grade IS NOT NULL), '{{}}'::JSONB) AS grade_counts
    FROM codes
    JOIN tum_info_grade_distributions AS d ON d.course_code = codes.course_code
    LEFT JOIN tum_info_grade_counts AS g ON g.distribution_id = d.distribution_id
    WHERE codes.course_id = $1
    GROUP BY d.distribution_id
    ORDER BY d.year, d.semester, d.exam_type
"""

RATINGS_SQL = """
    SELECT course_id, AVG(rating) AS average, COUNT(rating)::INT AS count
    FROM reviews
    WHERE course_id = ANY($1::BIGINT[])
    GROUP BY course_id
"""

REVIEWS_SQL = """
    SELECT review_id, course_id, rating, workload_hours, semester, review_text, created_at
    FROM reviews
    WHERE course_id = $1
    ORDER BY created_at DESC
"""

INSERT_REVIEW_SQL = """
    INSERT INTO reviews (course_id, rating, workload_hours, semester, review_text)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING review_id, course_id, rating, workload_hours, semester, review_text, created_at
"""

INSERT_GRADE_UPLOAD_SQL = """
    INSERT INTO grade_distribution_uploads (course_id, semester, exam_type, file_name, content_type, image)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING upload_id, course_id, file_name, semester, exam_type, status, created_at
"""
