-- Tables of the recommender. `python -m course_compass.recommender build`
-- creates them and fills them from courses, course_texts, course_degrees and
-- tum_info_grade_distributions. Run it again after each import.

-- One row per recommendable item: a module (lecture and exercise together),
-- or a single course of an umbrella module such as IN2107 (Master's seminar).
CREATE TABLE IF NOT EXISTS rec_items (
    item_id            TEXT PRIMARY KEY,        -- 'IN2390', or 'IN2107-950945730' for an umbrella course
    module_code        TEXT,                    -- NULL when TUMonline shows no module
    module_codes       TEXT[] NOT NULL,         -- every code of its courses
    passed_codes       TEXT[] NOT NULL,         -- a passed module with one of these codes excludes the item
    is_umbrella        BOOLEAN NOT NULL,
    semester_id        BIGINT NOT NULL,
    course_ids         BIGINT[] NOT NULL,       -- TUMonline courses in this item
    main_course_id     BIGINT NOT NULL,         -- usually the lecture
    title              TEXT NOT NULL,
    course_type        TEXT NOT NULL,           -- e.g. 'Lecture + exercise'
    course_types       TEXT[] NOT NULL,         -- TUMonline types, e.g. {Vorlesung,Übung}
    languages          TEXT[] NOT NULL,         -- e.g. {EN,DE}; empty when unknown
    ects               DOUBLE PRECISION,        -- NULL until ECTS are imported
    assessment         TEXT,                    -- official examination method, NULL until imported
    lecturers          TEXT,
    description        TEXT NOT NULL,           -- content and objectives, used for the embedding
    prerequisites_text TEXT NOT NULL,
    teaching_text      TEXT NOT NULL,
    slots              JSONB NOT NULL,          -- weekly slots: [{"day": "Wed", "start": "10:00", "end": "12:00"}]
    grade_stats        JSONB,                   -- summary of recent endterm exams, NULL without data
    rating_average     DOUBLE PRECISION,        -- NULL until reviews have ratings
    rating_count       INTEGER NOT NULL DEFAULT 0,
    reported_hours     DOUBLE PRECISION,        -- hours per week from reviews, NULL until available
    text_hash          TEXT NOT NULL,           -- changes when the texts change

    -- Filled by `python -m course_compass.recommender enrich` (Ollama).
    embedding          REAL[],                  -- bge-m3 embedding of title and description
    embedding_hash     TEXT,                    -- text_hash the embedding was made from
    attributes         JSONB,                   -- LLM categories, see enrich.CourseAttributes
    prereq_embeddings  REAL[],                  -- one row per prerequisite topic in attributes
    attributes_hash    TEXT,                    -- text_hash the attributes were made from
    built_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Which degrees an item counts toward, and in which areas.
CREATE TABLE IF NOT EXISTS rec_item_degrees (
    item_id TEXT NOT NULL REFERENCES rec_items(item_id) ON DELETE CASCADE,
    degree  TEXT NOT NULL,
    areas   TEXT[] NOT NULL,                    -- e.g. {'Computer Graphics and Vision (CGV)'}
    PRIMARY KEY (item_id, degree)
);

CREATE INDEX IF NOT EXISTS rec_item_degrees_degree_idx ON rec_item_degrees(degree);
