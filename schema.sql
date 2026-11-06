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
    course_code VARCHAR(50),
    tumonline_uid VARCHAR(100),
    description_source VARCHAR(100) DEFAULT 'TUMonline',
    description_updated_at TIMESTAMP WITH TIME ZONE;
    CREATE UNIQUE INDEX IF NOT EXISTS uq_courses_tumonline_uid
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
    grade10 INTEGER DEFAULT 0 CHECK (grade10 >= 0),
    grade13 INTEGER DEFAULT 0 CHECK (grade13 >= 0),
    grade17 INTEGER DEFAULT 0 CHECK (grade17 >= 0),
    grade20 INTEGER DEFAULT 0 CHECK (grade20 >= 0),
    grade23 INTEGER DEFAULT 0 CHECK (grade23 >= 0),
    grade27 INTEGER DEFAULT 0 CHECK (grade27 >= 0),
    grade30 INTEGER DEFAULT 0 CHECK (grade30 >= 0),
    grade33 INTEGER DEFAULT 0 CHECK (grade33 >= 0),
    grade37 INTEGER DEFAULT 0 CHECK (grade37 >= 0),
    grade40 INTEGER DEFAULT 0 CHECK (grade40 >= 0),
    grade47 INTEGER DEFAULT 0 CHECK (grade47 >= 0),
    grade50 INTEGER DEFAULT 0 CHECK (grade50 >= 0),
    grade5x INTEGER DEFAULT 0 CHECK (grade5x >= 0),
    year INTEGER NOT NULL CHECK (year >= 1900 AND year <= 2100),
    semester VARCHAR(20) NOT NULL,
    CONSTRAINT uq_course_year_semester UNIQUE (course_id, year, semester)
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
