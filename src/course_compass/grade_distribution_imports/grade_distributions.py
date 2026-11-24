"""Import exam grade distributions from the TUM Info API into PostgreSQL.

The API is one JSON file with every exam, so a run makes a single request. Run
course_compass.setup_db first. Running the import again updates the existing rows
instead of adding new ones. Exact course-code matches to TUMonline are saved as
candidates, never automatically verified.
"""
import asyncio
import html
import json
import re
import urllib.request
from collections import Counter
from dataclasses import dataclass
from decimal import Decimal

from course_compass.database import close_db_pool, init_db_pool

SOURCE_URL = "https://mykolamor.github.io/tum_info/api/courses.json"
USER_AGENT = "course-compass (university project)"

# The API writes results without a grade as grades above 5.0.
NO_SHOW = "6.0"
UNGRADED_PASSED = "7.0"
UNGRADED_FAILED = "8.0"
RESULTS_WITHOUT_GRADE = (NO_SHOW, UNGRADED_PASSED, UNGRADED_FAILED)

VALID_GRADE_RE = re.compile(r"[1-4]\.\d|5\.0|6\.0|7\.0|8\.0")
# The year is the one the semester starts in. One entry says "2024W" instead of "2024WS".
SEMESTER_RE = re.compile(r"(\d{4})(W|S)S?")

INSERT_COURSE = """
    INSERT INTO tum_info_courses (course_code, course_name)
    VALUES ($1, $2)
    ON CONFLICT (course_code) DO NOTHING
"""
UPSERT_DISTRIBUTION = """
    INSERT INTO tum_info_grade_distributions
        (course_code, year, semester, exam_type, no_show_count, ungraded_passed, ungraded_failed)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT (course_code, year, semester, exam_type) DO UPDATE SET
        no_show_count = EXCLUDED.no_show_count,
        ungraded_passed = EXCLUDED.ungraded_passed,
        ungraded_failed = EXCLUDED.ungraded_failed
    RETURNING distribution_id
"""
DELETE_GRADE_COUNTS = "DELETE FROM tum_info_grade_counts WHERE distribution_id = $1"
INSERT_GRADE_COUNT = """
    INSERT INTO tum_info_grade_counts (distribution_id, grade, student_count)
    VALUES ($1, $2, $3)
"""
# Save only new potential course matches; preserve verified/rejected decisions.
INSERT_MATCHES = """
    WITH inserted AS (
        INSERT INTO course_tum_info_matches (
            course_id, course_code, status
        )
        SELECT
            c.course_id,
            t.course_code,
            'candidate'
        FROM courses c
        JOIN tum_info_courses t
            ON (
                UPPER(BTRIM(c.number)) = UPPER(BTRIM(t.course_code))
                OR (
                    t.course_code ~ '^[A-Za-z0-9]+$'
                    AND UPPER(COALESCE(c.title_en, '')) ~ (
                        '(^|[^A-Z0-9])'
                        || UPPER(t.course_code)
                        || '([^A-Z0-9]|$)'
                    )
                )
            )
        ON CONFLICT (course_id, course_code) DO NOTHING
        RETURNING course_id
    )
    SELECT COUNT(*) FROM inserted
"""

@dataclass
class Exam:
    course_id: str
    course_name: str
    year: int
    semester: str
    exam_type: str
    counts: Counter

def fetch_entries() -> list[dict]:
    request = urllib.request.Request(SOURCE_URL, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.load(response)

def parse_semester(value: str) -> tuple[int, str]:
    """Turn the API's "2023WS" into the stored year and label: (2023, "WS2023")."""
    match = SEMESTER_RE.fullmatch(value)
    if not match:
        raise ValueError(f"Unknown semester in the API: {value!r}")
    year, kind = match.groups()
    return int(year), f"{kind}S{year}"

def parse_exam(entry: dict) -> Exam:
    """Convert one exam from the API, keeping every grade exactly as it is.

    An unknown grade raises an error before anything is saved, so results are
    never lost silently. The API escapes course names as HTML.
    """
    year, semester = parse_semester(entry["semester"])
    counts = Counter()
    for item in entry["grades"]:
        grade = str(float(item["grade"]))
        if not VALID_GRADE_RE.fullmatch(grade):
            raise ValueError(f"Unknown grade in the API: {grade!r}")
        if item["people"]:
            counts[grade] += item["people"]
    name = html.unescape(entry["name"]).strip()
    return Exam(entry["code"], name, year, semester, entry["examType"], counts)

async def save(course_names: dict[str, str], exams: list[Exam]) -> int:
    """Write everything in one transaction, so a failed run changes nothing.

    tum_info_grade_distributions references tum_info_courses, so each course
    needs a row first. An existing course is left unchanged.
    """
    pool = await init_db_pool(min_size=1, max_size=1)
    try:
        async with pool.acquire() as connection, connection.transaction():
            await connection.executemany(INSERT_COURSE, list(course_names.items()))
            for exam in exams:
                distribution_id = await connection.fetchval(
                    UPSERT_DISTRIBUTION,
                    exam.course_id,
                    exam.year,
                    exam.semester,
                    exam.exam_type,
                    exam.counts[NO_SHOW],
                    exam.counts[UNGRADED_PASSED],
                    exam.counts[UNGRADED_FAILED],
                )
                await connection.execute(DELETE_GRADE_COUNTS, distribution_id)
                await connection.executemany(
                    INSERT_GRADE_COUNT,
                    [
                        (distribution_id, Decimal(grade), people)
                        for grade, people in exam.counts.items()
                        if grade not in RESULTS_WITHOUT_GRADE
                    ],
                )
            # Link already-imported TUMonline courses to TUM Info codes when they match.
            # Leave all existing statuses (candidate/verified/rejected) unchanged.
            matches_added = await connection.fetchval(INSERT_MATCHES)
    finally:
        await close_db_pool()
    return matches_added

def main() -> None:
    entries = fetch_entries()
    # An exam can be listed without any results, which leaves nothing to store.
    exams = [exam for exam in map(parse_exam, entries) if exam.counts]
    if not exams:
        raise RuntimeError(f"No exams with results found at {SOURCE_URL}.")

    # Later semesters overwrite earlier ones here, so each course keeps its latest name.
    course_names = {
        exam.course_id: exam.course_name
        for exam in sorted(exams, key=lambda e: (e.year, e.semester))
    }
    matches_added = asyncio.run(save(course_names, exams))
    print(
        f"Read {len(entries)} exams and saved {len(exams)} grade distributions "
        f"for {len(course_names)} courses."
    )
    print(f"Added {matches_added} new potential TUMonline/TUM Info course matches.")

if __name__ == "__main__":
    main()