CREATE TABLE IF NOT EXISTS degrees (
    degree_id VARCHAR(50) PRIMARY KEY,
    degree_name VARCHAR(255) NOT NULL
);

CREATE TABLE IF NOT EXISTS courses (
    course_id VARCHAR(50) PRIMARY KEY,
    course_name VARCHAR(255) NOT NULL,
    module_description TEXT,
    ects INTEGER CHECK (ects >= 0),
    course_type VARCHAR(100),
    language VARCHAR(50),
    assessment_type VARCHAR(255),
    prerequisites TEXT,
    workload_hours_per_week NUMERIC(4, 1) CHECK (workload_hours_per_week >= 0)
);

CREATE TABLE IF NOT EXISTS reviews (
    review_id SERIAL PRIMARY KEY,
    course_id VARCHAR(50) NOT NULL REFERENCES courses(course_id) ON DELETE CASCADE,
    review_text TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS grade_distributions (
    distribution_id SERIAL PRIMARY KEY,
    course_id VARCHAR(50) NOT NULL REFERENCES courses(course_id) ON DELETE CASCADE,
    grade5x INTEGER DEFAULT 0 CHECK (grade5x >= 0),
    ungraded_passed INTEGER DEFAULT 0 CHECK (ungraded_passed >= 0),
    ungraded_failed INTEGER DEFAULT 0 CHECK (ungraded_failed >= 0),
    year INTEGER NOT NULL CHECK (year >= 1900 AND year <= 2100),
    semester VARCHAR(20) NOT NULL,
    exam_type VARCHAR(20) NOT NULL CHECK (exam_type IN ('endterm', 'retake')),
    CONSTRAINT uq_course_semester_exam UNIQUE (course_id, year, semester, exam_type)
);

-- One row per grade awarded. Grades are rows rather than columns because exams
-- can use any step of 0.1, for example 1.4 after a grade bonus.
CREATE TABLE IF NOT EXISTS grade_counts (
    distribution_id INTEGER NOT NULL REFERENCES grade_distributions(distribution_id) ON DELETE CASCADE,
    grade NUMERIC(2, 1) NOT NULL CHECK (grade >= 1.0 AND grade <= 5.0),
    student_count INTEGER NOT NULL CHECK (student_count > 0),
    PRIMARY KEY (distribution_id, grade)
);

CREATE TABLE IF NOT EXISTS degree_courses (
    course_id VARCHAR(50) NOT NULL REFERENCES courses(course_id) ON DELETE CASCADE,
    degree_id VARCHAR(50) NOT NULL REFERENCES degrees(degree_id) ON DELETE CASCADE,
    degree_group VARCHAR(100) NOT NULL,
    PRIMARY KEY (course_id, degree_id, degree_group)
);

CREATE TABLE IF NOT EXISTS course_semester (
    course_id VARCHAR(50) PRIMARY KEY REFERENCES courses(course_id) ON DELETE CASCADE,
    offered_winter BOOLEAN NOT NULL DEFAULT FALSE,
    offered_summer BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS course_offerings (
    offering_id SERIAL PRIMARY KEY,
    course_id VARCHAR(50) NOT NULL REFERENCES courses(course_id) ON DELETE CASCADE,
    year INTEGER NOT NULL CHECK (year >= 1900 AND year <= 2100),
    semester VARCHAR(20) NOT NULL,
    schedule VARCHAR(255),
    room VARCHAR(100),
    lecturer VARCHAR(255),
    is_current BOOLEAN DEFAULT FALSE,
    CONSTRAINT uq_course_offering UNIQUE (course_id, year, semester)
);

CREATE INDEX IF NOT EXISTS idx_reviews_course_id ON reviews(course_id);
CREATE INDEX IF NOT EXISTS idx_grade_distributions_course_id ON grade_distributions(course_id);
CREATE INDEX IF NOT EXISTS idx_degree_courses_degree_id ON degree_courses(degree_id);
CREATE INDEX IF NOT EXISTS idx_course_offerings_course_id ON course_offerings(course_id);
CREATE INDEX IF NOT EXISTS idx_course_offerings_lookup ON course_offerings(year, semester, is_current);

-- Grade bands and averages for charts. The limits leave no gaps, so every grade
-- falls into exactly one band: 1.4 counts as very good and 1.6 as good. Averages
-- use only real grades, so no-shows and results without a grade don't count, and
-- an exam without real grades has no average.
CREATE OR REPLACE VIEW grade_distribution_bands AS
SELECT
    d.distribution_id,
    d.course_id,
    d.year,
    d.semester,
    d.exam_type,
    COALESCE(SUM(c.student_count) FILTER (WHERE c.grade <= 1.5), 0)::INTEGER AS very_good,
    COALESCE(SUM(c.student_count) FILTER (WHERE c.grade > 1.5 AND c.grade <= 2.5), 0)::INTEGER AS good,
    COALESCE(SUM(c.student_count) FILTER (WHERE c.grade > 2.5 AND c.grade <= 3.5), 0)::INTEGER AS satisfactory,
    COALESCE(SUM(c.student_count) FILTER (WHERE c.grade > 3.5 AND c.grade <= 4.0), 0)::INTEGER AS sufficient,
    COALESCE(SUM(c.student_count) FILTER (WHERE c.grade > 4.0), 0)::INTEGER AS failed,
    d.grade5x,
    d.ungraded_passed,
    d.ungraded_failed,
    ROUND(SUM(c.grade * c.student_count) / SUM(c.student_count), 2) AS average_grade,
    ROUND(SUM(c.grade * c.student_count) FILTER (WHERE c.grade <= 4.0)
        / SUM(c.student_count) FILTER (WHERE c.grade <= 4.0), 2) AS average_passed
FROM grade_distributions d
LEFT JOIN grade_counts c ON c.distribution_id = d.distribution_id
GROUP BY d.distribution_id;
