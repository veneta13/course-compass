#!/usr/bin/env python3
"""
TUMonline Course Importer


"""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
import logging
import os
import re
import sys
import time
from typing import Any, Iterable, Mapping
from urllib.parse import urlencode

import psycopg
from psycopg.types.json import Jsonb
import requests
from requests.exceptions import RequestException

BASE = "https://campus.tum.de/tumonline"
REST_BASE = BASE + "/ee/rest/"
COURSES = "slc.tm.cp/student/courses"

# each degree program has multiple "versions" due to SPO changes
DEGREES = {
    "bachelor-informatics": ["5440", "5371", "4998", "4748", "4591", "4283", "1304"],
    "master-informatics": ["5217", "4731", "4594", "4271", "2612"],
    "master-dea": ["4733", "4567"],
    "master-information-systems": ["4997", "404", "4368", "4716", "4734", "4918", "5013"],
    "master-mathematics": ["5244", "4852", "4407"],
    "bachelor-information-systems": ["5441", "4999", "4750"],
    "bachelor-games-engineering": ["5218", "4749"],
    "master-games-engineering": ["5219", "4732"],
    "bachelor-bioinformatics": ["5028", "4638", "4359", "403"],
    "master-rci": ["5271", "5120", "4827"],
    "master-cse": ["5001", "4637", "4286", "4022"],
}

# reverse mapping to save the curriculum degrees mapping into db later
CURRICULUM_DEGREES = {}

for degree, curriculum_ids in DEGREES.items():
    for curriculum_id in curriculum_ids:
        CURRICULUM_DEGREES.setdefault(
            curriculum_id, set()
        ).add(degree)

LOG = logging.getLogger("tumonline")

# initialize DB schema
SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS semesters (
  semester_id BIGINT PRIMARY KEY,
  semester_key TEXT,
  label TEXT,
  start_date TEXT,
  end_date TEXT,
  raw_json JSONB NOT NULL
);
CREATE TABLE IF NOT EXISTS courses (
  course_id BIGINT PRIMARY KEY,
  semester_id BIGINT NOT NULL REFERENCES semesters(semester_id),
  number TEXT,
  title TEXT,
  title_de TEXT,
  title_en TEXT,
  ects DOUBLE PRECISION,
  course_type TEXT,
  organisation TEXT,
  lecturers TEXT,
  languages TEXT,
  sws TEXT,
  examination_method TEXT,
  registration_info TEXT,
  listing_json JSONB NOT NULL,
  detail_json JSONB,
  curriculum_json JSONB,
  groups_json JSONB,
  detail_fetched_at TIMESTAMPTZ,
  curricula_fetched_at TIMESTAMPTZ,
  groups_fetched_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS courses_semester_idx ON courses(semester_id);
CREATE INDEX IF NOT EXISTS courses_title_idx ON courses(title);
CREATE TABLE IF NOT EXISTS course_texts (
  course_id BIGINT NOT NULL REFERENCES courses(course_id) ON DELETE CASCADE,
  field TEXT NOT NULL,
  language TEXT NOT NULL,
  value TEXT NOT NULL,
  PRIMARY KEY (course_id, field, language)
);
CREATE TABLE IF NOT EXISTS fetch_errors (
  course_id BIGINT NOT NULL,
  resource TEXT NOT NULL,
  error TEXT NOT NULL,
  last_seen TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (course_id, resource)
);
CREATE OR REPLACE VIEW course_catalog AS
SELECT c.course_id, c.semester_id, c.number, c.title,
       c.title_de, c.title_en, c.ects, c.course_type,
       c.organisation, c.lecturers, c.languages, c.sws,
       c.examination_method, c.registration_info,
       (SELECT t.value FROM course_texts t WHERE t.course_id=c.course_id
        AND t.field='courseContent' AND t.language='en') AS content_en,
       (SELECT t.value FROM course_texts t WHERE t.course_id=c.course_id
        AND t.field='courseContent' AND t.language='de') AS content_de,
       (SELECT t.value FROM course_texts t WHERE t.course_id=c.course_id
        AND t.field='courseObjective' AND t.language='en') AS objectives_en,
       (SELECT t.value FROM course_texts t WHERE t.course_id=c.course_id
        AND t.field='previousKnowledge' AND t.language='en') AS prerequisites_en,
       c.detail_fetched_at
FROM courses c;
CREATE TABLE IF NOT EXISTS course_degrees (
    course_id BIGINT NOT NULL
        REFERENCES courses(course_id) ON DELETE CASCADE,
    degree TEXT NOT NULL,
    PRIMARY KEY (course_id, degree)
);
CREATE INDEX IF NOT EXISTS course_degrees_degree_idx ON course_degrees(degree);
"""
# formats the SCHEMA_SQL string
# split at every semicolon, filter out empty strings, whitespaces
SCHEMA_STATEMENTS = tuple(s.strip() for s in SCHEMA_SQL.split(";") if s.strip())

# creates the PostgreSQL tables
def create_schema(db: psycopg.Connection) -> None:
    """PostgreSQL schema setup, executed atomically."""
    with db.transaction():
        for statement in SCHEMA_STATEMENTS:
            db.execute(statement)

# convert python object into JSON format
def dumps(value: Any) -> str:
    # ensure_ascii -> escape non-ASCII characters (for german titles)
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))

# return current date and time in UTC
def now_utc() -> datetime:
    return datetime.now(timezone.utc)

# check if a value is a dictionary and return itself if true
# else return empty dictionary
def obj(x: Any) -> dict:
    return x if isinstance(x, dict) else {}

# extract text from data returned by the API
def text(value: Any, lang: str | None = None) -> str | None:
    """Extract one language from the CAMPUSonline langdata DTO."""
    # if already a string, no need to reformat
    if isinstance(value, str):
        return value or None
    if not isinstance(value, dict):
        return None
    # extract list of translations
    translations = obj(value.get("translations")).get("translation", [])
    if isinstance(translations, dict):
        translations = [translations]
    # find the language
    if lang:
        for tr in translations or []:
            if isinstance(tr, dict) and tr.get("lang", "").lower() == lang:
                return tr.get("value") or None
    # return to default value if language unavailable
    return value.get("value") or None

# extract value from TUMonline API response and converts it into string
# if input is a dictionary, extract values as string
# if input is a value, just convert into string
# return none if input is none
def field_value(value: Any) -> str | None:
    if isinstance(value, dict):
        v = value.get("value")
        return str(v) if v is not None else None
    if value is not None:
        return str(value)
    return None

# extract course number from a course dictionary returned by the API call
def number_value(course: dict) -> str | None:
    cn = course.get("courseNumber")
    if isinstance(cn, dict):
        return cn.get("courseNumber") or cn.get("databaseValue")
    return str(cn) if cn is not None else None

# extract the SWS value from the input course
def get_sws(course: dict) -> str | None:
    # SWS stored in courseNormConfigs
    # SST = SWS, ECTS indicates total workload
    configs = course.get("courseNormConfigs") or []
    for config in configs:
        if isinstance(config, dict) and config.get("key") == "SST":
            return str(config.get("value", "")) or None
    return None

# retrieve lecturer information, combine first and last names,
# removes duplicates, returns formatted string for the db
def get_lecturers(course: dict) -> str | None:
    names = []
    for item in course.get("lectureships") or []:
        iden = obj(obj(item).get("identityLibDto"))
        name = " ".join(filter(None, [iden.get("firstName"), iden.get("lastName")])).strip()
        if name and name not in names:
            names.append(name)
    return "; ".join(names) or None

# collect teaching languages, removes duplicates,
# and formats it for the db
def get_languages(course: dict) -> str | None:
    values = []
    for item in course.get("courseLanguageDtos") or []:
        lang = obj(obj(item).get("languageDto"))
        label = lang.get("key") or text(lang.get("name"))
        if label and label not in values:
            values.append(str(label))
    return ", ".join(values) or None

# takes course returned by the API and extracts all relevant information
# into tuple format to insert into the db
def course_fields(course: dict, semester_id: int) -> tuple:
    title = course.get("courseTitle")
    tp = obj(course.get("courseTypeDto"))
    org = obj(course.get("organisationResponsibleDto"))
    credits = course.get("ectsCredits")
    try:
        ects = float(credits) if credits is not None else None
    except (TypeError, ValueError):
        ects = None
    return (
        int(course["id"]), semester_id, number_value(course),
        text(title), text(title, "de"), text(title, "en"), ects,
        text(tp.get("courseTypeName")) or tp.get("key"),
        text(org.get("name")) or org.get("identificationName"),
        get_lecturers(course), get_languages(course), get_sws(course),
        text(course.get("examinationMethodName")),
        course.get("registrationInfo"), course,
    )

# convert different data types into strings
# to store into the db text columns
def pg_text(value: Any) -> str | None:
    """Flatten irregular fields to PostgreSQL TEXT-compatible values.

    Preserve nested objects as JSON strings; store full records separately as JSONB.
    """
    if value is None:
        return None
    if isinstance(value, (dict, list, tuple)):
        return dumps(value)
    return str(value)

# extract course information and formats the data into the db
# also inserts them into the db (or update if entry exists)
def save_listing(db: psycopg.Connection, item: dict, semester_id: int) -> None:
    fields = course_fields(item, semester_id)
    vals = tuple(v if i in (0, 1, 6) else pg_text(v)
                 for i, v in enumerate(fields[:-1])) + (Jsonb(fields[-1]),)
    db.execute("""
      INSERT INTO courses (
        course_id, semester_id, number, title, title_de, title_en, ects,
        course_type, organisation, lecturers, languages, sws,
        examination_method, registration_info, listing_json
      ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
      ON CONFLICT(course_id) DO UPDATE SET
        semester_id=excluded.semester_id,
        number=excluded.number, title=excluded.title,
        title_de=excluded.title_de, title_en=excluded.title_en,
        ects=excluded.ects, course_type=excluded.course_type,
        organisation=excluded.organisation, lecturers=excluded.lecturers,
        languages=excluded.languages, sws=excluded.sws,
        examination_method=excluded.examination_method,
        registration_info=excluded.registration_info,
        listing_json=excluded.listing_json
    """, vals)

# saves relationship between course and degree
def save_course_degree(
    db: psycopg.Connection,
    course_id: int,
    degree: str
) -> None:
    db.execute("""
        INSERT INTO course_degrees (course_id, degree)
        VALUES (%s, %s)
        ON CONFLICT DO NOTHING
    """, (course_id, degree))

# extract multiple translations from many different fields
def iter_langdata(prefix: str, value: Any) -> Iterable[tuple[str, str, str]]:
    if isinstance(value, dict):
        tr = obj(value.get("translations")).get("translation", [])
        if isinstance(tr, dict):
            tr = [tr]
        # Translation values are sometimes HTML; preserve their original content.
        if tr or value.get("coType") == "model-core.lib.model.langdata":
            found = False
            for entry in tr or []:
                if isinstance(entry, dict) and entry.get("value") is not None:
                    found = True
                    yield (prefix, str(entry.get("lang") or "und"), str(entry["value"]))
            if not found and value.get("value") is not None:
                yield (prefix, "und", str(value["value"]))
            return
        for key, sub in value.items():
            if key not in ("translations", "coType"):
                yield from iter_langdata(f"{prefix}.{key}" if prefix else key, sub)

# saves the information of the extracted TUM courses into the db
def save_detail(db: psycopg.Connection, course_id: int, payload: dict) -> None:
    resources = payload.get("resource")
    if not isinstance(resources, list) or not resources:
        raise ValueError("Course detail response has no resource array")
    detail = obj(obj(obj(resources[0]).get("content")).get("cpCourseDetailDto"))
    if not detail:
        raise ValueError("No cpCourseDetailDto in course detail response")
    detail_course = obj(detail.get("cpCourseDto"))
    if detail_course.get("id") is not None and int(detail_course["id"]) != course_id:
        raise ValueError(f"Detail ID does not match requested course {course_id}")
    existing = db.execute("SELECT semester_id FROM courses WHERE course_id=%s", (course_id,)).fetchone()
    if not existing:
        raise ValueError("Detail returned for a course not in listing")
    description = obj(detail.get("cpCourseDescriptionDto"))
    # Treat detail and parsed descriptions as one atomic update.
    with db.transaction():
        db.execute("UPDATE courses SET detail_json=%s, detail_fetched_at=%s WHERE course_id=%s",
                   (Jsonb(payload), now_utc(), course_id))
        if detail_course:
            db.execute("""
                UPDATE courses SET
                  organisation=COALESCE(%s, organisation),
                  languages=COALESCE(%s, languages),
                  lecturers=COALESCE(%s, lecturers),
                  examination_method=COALESCE(%s, examination_method)
                WHERE course_id=%s
            """, (
                pg_text(text(obj(detail_course.get("organisationResponsibleDto")).get("name"))),
                pg_text(get_languages(detail_course)),
                pg_text(get_lecturers(detail_course)),
                pg_text(text(detail_course.get("examinationMethodName"))),
                course_id,
            ))
        db.execute("DELETE FROM course_texts WHERE course_id=%s", (course_id,))
        for path, lang, value in iter_langdata("", description):
            db.execute("""
                INSERT INTO course_texts(course_id, field, language, value)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (course_id, field, language) DO UPDATE SET value=EXCLUDED.value
            """, (course_id, path, lang, value))
        db.execute("DELETE FROM fetch_errors WHERE course_id=%s AND resource='detail'", (course_id,))

class ApiError(Exception):
    """An API or transport failure, optionally with a concrete HTTP status."""

    def __init__(self, message: str, status_code: int | None = None):
        super().__init__(message)
        self.status_code = status_code

class Api:
    """Anonymous, rate-limited CAMPUSonline JSON client using requests.Session."""

    def __init__(self, client: requests.Session, delay: float = 0.8,
                 rest_base_url: str = REST_BASE):
        self.client = client
        self.delay = delay
        self.rest_base_url = rest_base_url.rstrip("/") + "/"
        self.last_request = 0.0

    def get(self, endpoint: str, params: Mapping[str, Any] | None = None) -> dict:
        for attempt in range(5):
            remaining = self.delay - (time.monotonic() - self.last_request)
            if remaining > 0:
                time.sleep(remaining)
            self.last_request = time.monotonic()
            url = self.rest_base_url + endpoint.lstrip("/")
            if params:
                # TUMonline's course filter uses literal '$' and ';'.
                url += "?" + urlencode(params, safe="$;=,")
            try:
                response = self.client.get(url, timeout=(10, 45),
                                           allow_redirects=True)
            except RequestException as exc:
                if attempt == 4:
                    raise ApiError(f"Network error at {endpoint}: {type(exc).__name__}: {exc}") from exc
                wait_s = min(45.0, 2.0 ** attempt * 3.0)
                LOG.warning("Network error at %s; retrying after %.1fs", endpoint, wait_s)
                time.sleep(wait_s)
                continue

            status = response.status_code
            if status in (401, 403):
                raise ApiError(f"HTTP {status} at {endpoint}: anonymous access not permitted", status)
            if status == 404:
                raise ApiError(f"HTTP 404 at {endpoint}: endpoint may not be enabled at TUM", status)
            if status in (429, 500, 502, 503, 504):
                if attempt == 4:
                    raise ApiError(f"HTTP {status} at {endpoint} after retries", status)
                wait_s = min(45.0, 2.0 ** attempt * 3.0)
                retry_after = response.headers.get("Retry-After", "")
                if retry_after.isdigit():
                    wait_s = max(wait_s, min(90.0, float(retry_after)))
                LOG.warning("HTTP %s at %s; retrying after %.1fs", status, endpoint, wait_s)
                time.sleep(wait_s)
                continue
            if not 200 <= status < 300:
                raise ApiError(f"HTTP {status} at {endpoint}", status)
            try:
                data = response.json()
            except ValueError as exc:
                ct = response.headers.get("Content-Type", "unknown")
                raise ApiError(
                    f"Expected JSON at {endpoint}, received {ct}. "
                    "An anonymous endpoint may return an HTML login page or XML; "
                    "check the endpoint and public API documentation."
                ) from exc
            if not isinstance(data, dict):
                raise ApiError(f"Unexpected non-object JSON at {endpoint}")
            return data
        raise AssertionError("Unreachable")

def save_error(db: psycopg.Connection, course_id: int, resource: str, ex: Exception) -> None:
    db.execute("""
      INSERT INTO fetch_errors (course_id, resource, error, last_seen)
      VALUES (%s, %s, %s, %s)
      ON CONFLICT(course_id, resource) DO UPDATE SET
        error=excluded.error, last_seen=excluded.last_seen
    """, (course_id, resource, str(ex), now_utc()))

# Semester numbering matches tum_courses.py (201 and 202 are skipped).
def semester_to_term_id(semester: str) -> int:
    semester = semester.strip().upper()
    if semester.isdecimal() and len(semester) == 3:
        term_id = int(semester)
    else:
        match = re.fullmatch(r"(WS|SS|W|S)?\s*(\d{2}|\d{4})(?:/\d{2})?\s*(W|S)?", semester)
        if match is None or (match.group(1) is None) == (match.group(3) is None):
            raise ValueError(f"Invalid semester '{semester}'; use WS26/27, SS26 or term ID 207")
        season = (match.group(1) or match.group(3))[0]
        year = int(match.group(2)) % 100 + 2000
        raw_id = 199 + 2 * (year - 2023) if season == "W" else 198 + 2 * (year - 2023)
        term_id = raw_id + 2 if raw_id > 200 else raw_id
    if term_id <= 0 or term_id in (201, 202):
        raise ValueError(f"Invalid TUMonline semester ID: {term_id}")
    return term_id

def fetch_curriculum_versions(api: Api, term_id: int) -> list[dict]:
    data = api.get(f"slc.cm.cs.student/curricula/{term_id}", {"$language": "en"})
    resources = data.get("resource")
    if not isinstance(resources, list):
        raise ApiError("Curriculum response has no 'resource' array")
    versions = []
    for resource in resources:
        version = obj(obj(resource).get("content")).get("cmCurriculumVersionDto")
        if not isinstance(version, dict):
            continue
        versions.append({
            "id": str(version["id"]),
            "name_de": text(version.get("name"), "de") or "",
            "name_en": text(version.get("name"), "en") or "",
            "valid_from": version.get("validFrom"),
            "valid_until": version.get("validUntil"),
        })
    return versions

# retrieves degree programs (curriculum versions) from the API, filters them by name
# and then prints them in a sorted list
def print_degrees(api: Api, semester: str, search: str | None) -> None:
    versions = fetch_curriculum_versions(api, semester_to_term_id(semester))
    if search:
        needle = search.lower()
        versions = [v for v in versions
                    if needle in v["name_de"].lower() or needle in v["name_en"].lower()]
    for v in sorted(versions, key=lambda v: (v["name_de"], v["valid_from"] or "")):
        print(f'{v["id"]:>6}  {v["name_de"]}  (valid {v["valid_from"]} - {v["valid_until"] or "now"})')
    print(f"{len(versions)} curriculum versions", file=sys.stderr)

def prompt_semester_id() -> int:
    """Every execution requires a fresh, positive semester ID."""
    while True:
        try:
            answer = input("Enter TUMonline semester ID: ").strip()
        except EOFError as exc:
            raise ValueError("An interactive terminal is required to enter a semester ID") from exc
        try:
            semester_id = int(answer)
        except ValueError:
            semester_id = 0
        if semester_id > 0:
            return semester_id
        print("Please enter a positive numeric semester ID (for example 207).")

def prompt_course_limit() -> int | None:
    """Ask for a positive maximum, or allow Enter to import the entire semester."""
    while True:
        try:
            answer = input("How many courses to import? (Enter for all): ").strip()
        except EOFError as exc:
            raise ValueError("An interactive terminal is required to choose a course count") from exc
        if not answer:
            return None
        try:
            limit = int(answer)
        except ValueError:
            limit = 0
        if limit > 0:
            return limit
        print("Please enter a positive whole number (for example 3000), or press Enter for all.")

def harvest(api: Api, db: psycopg.Connection, semester_id: int,
            course_limit: int | None = None,
            curriculum_ids: list[str] | None = None,
            course_types: set[str] | None = None) -> dict:
    """Store and update up to course_limit distinct matching courses in one term.

    The original all-semester import is preserved when curriculum_ids and
    course_types are omitted. For selected degrees, query every curriculum
    version and deduplicate overlapping course IDs before enriching them.
    """
    if course_limit is not None and course_limit <= 0:
        raise ValueError("course_limit must be positive, or None to import all courses")
    # Only the user-supplied semester ID is used in API queries. The semester
    # catalog endpoint is never called; it may be unavailable independently.
    db.execute("""
        INSERT INTO semesters (semester_id, label, raw_json)
        VALUES (%s, %s, %s)
        ON CONFLICT (semester_id) DO NOTHING
    """, (semester_id, f"Semester {semester_id}", Jsonb({"id": semester_id})))

    page_size = 100
    api_reported_listings = 0
    listing_ids: set[int] = set()

    for curriculum_id in (curriculum_ids or [None]):
        skip = 0
        page_count = 0
        expected_count = None
        seen_in_curriculum: set[int] = set()

        while True:
            if (
                curriculum_ids is None
                and course_limit is not None
                and len(listing_ids) >= course_limit
            ):
                break
            # A filtered page may include duplicates across curricula or types
            # we are not selecting, so retrieve full pages for those searches.
            batch_size = (page_size if curriculum_id is not None or course_types else
                          min(page_size, course_limit - len(listing_ids))
                          if course_limit is not None else page_size)
            course_filter = (f"curriculumVersionId-eq={curriculum_id};termId-eq={semester_id};"
                             if curriculum_id is not None else f"termId-eq={semester_id}")
            params: dict[str, Any] = {
                "$filter": course_filter, "$top": batch_size, "$skip": skip,
            }
            if curriculum_id is not None:
                params["$orderBy"] = "title=ascnf"
            listing = api.get(COURSES, params)
            rows = listing.get("courses")
            if not isinstance(rows, list):
                raise ApiError("Course-list response has no 'courses' array")
            if len(rows) > batch_size:
                LOG.warning("API returned %s courses despite $top=%s; keeping the first %s",
                            len(rows), batch_size, batch_size)
                rows = rows[:batch_size]
            total = listing.get("totalCount")
            if total is not None:
                try:
                    expected_count = int(total)
                except (TypeError, ValueError) as exc:
                    raise ApiError("Invalid totalCount in course listing") from exc

            page_ids: set[int] = set()
            new_rows: list[dict] = []
            matched_ids: set[int] = set()
            for item in rows:
                if not isinstance(item, dict) or item.get("id") is None:
                    raise ApiError("Course listing contained an invalid record")
                try:
                    cid = int(item["id"])
                except (TypeError, ValueError) as exc:
                    raise ApiError("Course listing contained an invalid course ID") from exc
                if cid in seen_in_curriculum or cid in page_ids:
                    raise ApiError(f"Duplicate course ID {cid}; pagination may be broken")
                page_ids.add(cid)
                actual_semester = obj(item.get("semesterDto")).get("id")
                if actual_semester is not None and int(actual_semester) != semester_id:
                    raise ApiError("Server did not apply the semester filter correctly")
                if course_types and obj(item.get("courseTypeDto")).get("key") not in course_types:
                    continue
                if cid in listing_ids:
                    matched_ids.add(cid)
                    continue
                if course_limit is None or len(listing_ids) + len(new_rows) < course_limit:
                    new_rows.append(item)
                    matched_ids.add(cid)

            with db.transaction():
                for item in new_rows:
                    save_listing(db, item, semester_id)

                if curriculum_id is not None:
                    for cid in matched_ids:
                        for degree in CURRICULUM_DEGREES.get(str(curriculum_id), set()):
                            save_course_degree(db, cid, degree)

            listing_ids.update(int(item["id"]) for item in new_rows)
            seen_in_curriculum.update(page_ids)
            page_count += 1
            skip += len(rows)
            LOG.info("Curriculum %s, page %s: %s listings; %s distinct selected%s",
                     curriculum_id if curriculum_id is not None else "all",
                     page_count, len(rows), len(listing_ids),
                     f"; {expected_count} reported in this curriculum" if expected_count is not None else "")
            if not rows or (expected_count is not None and skip >= expected_count):
                break
            if (
                curriculum_ids is None
                and course_limit is not None
                and len(listing_ids) >= course_limit
            ):
                break
            if expected_count is None and len(rows) < batch_size:
                break

        if expected_count is not None:
            api_reported_listings += expected_count
            if skip < expected_count and (course_limit is None or len(listing_ids) < course_limit):
                raise ApiError(f"Incomplete listing for curriculum {curriculum_id}: "
                               f"received {skip} of {expected_count} courses")
        if (
            curriculum_ids is None
            and course_limit is not None
            and len(listing_ids) >= course_limit
        ):
            break

    if not listing_ids and not curriculum_ids and not course_types:
        raise ApiError(f"No courses found for semester ID {semester_id}; check the ID")
    if not listing_ids:
        LOG.warning("No matching courses in semester %s", semester_id)

    blocked_resources: set[str] = set()
    requests_completed = 0
    successful = {"detail": 0, "curriculum": 0, "groups": 0}
    for count, cid in enumerate(sorted(listing_ids), 1):
        existing = db.execute("""
            SELECT detail_fetched_at, curricula_fetched_at, groups_fetched_at
            FROM courses WHERE course_id=%s
        """, (cid,)).fetchone()
        if existing is None:
            raise RuntimeError(f"Missing stored listing for course {cid}")

        tasks = (
            ("detail", f"{COURSES}/{cid}", 0),
            ("curriculum", f"slc.cm.curriculumposition/positions/{cid}/course/allCurriculumPositions", 1),
            ("groups", f"slc.tm.cp/student/courseGroups/firstGroups/{cid}", 2),
        )
        for resource, endpoint, index in tasks:
            if existing[index] or resource in blocked_resources:
                continue  # Already stored on an earlier run, or access unavailable.
            try:
                data = api.get(endpoint)
                if resource == "detail":
                    save_detail(db, cid, data)
                elif resource == "curriculum":
                    db.execute("""
                        UPDATE courses SET curriculum_json=%s, curricula_fetched_at=%s
                        WHERE course_id=%s
                    """, (Jsonb(data), now_utc(), cid))
                else:
                    first = data.get("courseGroupDtos")
                    total = data.get("totalCount")
                    if not isinstance(first, list):
                        raise ApiError(f"Invalid course group response for {cid}")
                    if total is not None and int(total) > len(first):
                        remainder = api.get(f"slc.tm.cp/student/courseGroups/remainingGroups/{cid}")
                        other = remainder.get("courseGroupDtos")
                        if not isinstance(other, list):
                            raise ApiError(f"Invalid remaining groups response for {cid}")
                        data = {"totalCount": int(total), "courseGroupDtos": first + other}
                    db.execute("""
                        UPDATE courses SET groups_json=%s, groups_fetched_at=%s
                        WHERE course_id=%s
                    """, (Jsonb(data), now_utc(), cid))
                db.execute("DELETE FROM fetch_errors WHERE course_id=%s AND resource=%s", (cid, resource))
                requests_completed += 1
                successful[resource] += 1
            except ApiError as exc:
                save_error(db, cid, resource, exc)
                if exc.status_code in (401, 403):
                    blocked_resources.add(resource)
                    LOG.warning("Public %s endpoint is access-restricted; skipping it", resource)
                else:
                    LOG.warning("Course %s %s unavailable: %s", cid, resource, exc)
            except Exception as exc:
                save_error(db, cid, resource, exc)
                LOG.warning("Course %s %s could not be saved: %s", cid, resource, exc)

        if count % 25 == 0 or count == len(listing_ids):
            LOG.info("Extracted %s/%s courses", count, len(listing_ids))

    # Only count courses in this semester observed in this run. Previous course
    # entries are not deleted; a prior record may no longer be in the API list.
    errors = db.execute("""
        SELECT COUNT(*) FROM fetch_errors
        WHERE course_id IN (SELECT course_id FROM courses WHERE semester_id=%s)
    """, (semester_id,)).fetchone()[0]
    return {
        "semester_id": semester_id,
        "requested_course_limit": course_limit,
        "listings_retrieved": len(listing_ids),
        "api_reported_listings": expected_count,
        "new_resource_requests_completed": requests_completed,
        "resource_updates": successful,
        "restricted_resources": sorted(blocked_resources),
        "recorded_fetch_errors": errors,
    }

def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Import TUMonline courses into PostgreSQL, optionally filtered by degree and semester")
    sub = parser.add_subparsers(dest="command")

    degrees = sub.add_parser("degrees", help="Search curriculum version IDs (no database write)")
    degrees.add_argument("--search", help="Substring of the German or English degree name")
    degrees.add_argument("--semester", default="WS26/27", help="Semester to list curricula for")

    courses = sub.add_parser("courses", help="Import selected courses into PostgreSQL")
    courses.add_argument("--degree", action="append", choices=DEGREES.keys(),
                         help="Degree to import (repeatable)")
    courses.add_argument("--curriculum", action="append", type=int,
                         help="Curriculum version ID (repeatable; see 'degrees')")
    courses.add_argument("--semester", action="append", required=True,
                         help="WS26/27, SS26 or term ID 207 (repeatable)")
    courses.add_argument("--types", help="Comma-separated course types, e.g. VO,VI; default all")
    courses.add_argument("--limit", type=int, help="Maximum distinct courses per semester; default all")

    return parser.parse_args(argv)

def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    args = parse_args()
    try:
        if args.command == "degrees":
            with requests.Session() as session:
                session.headers.update({"Accept": "application/json"})
                print_degrees(Api(session), args.semester, args.search)
            return 0

        if args.command == "courses":
            semester_ids = list(dict.fromkeys(semester_to_term_id(s) for s in args.semester))
            curriculum_ids = [str(c) for c in args.curriculum or []]
            for degree in args.degree or []:
                curriculum_ids.extend(DEGREES[degree])
            curriculum_ids = list(dict.fromkeys(curriculum_ids))
            course_limit = args.limit
            if course_limit is not None and course_limit <= 0:
                raise ValueError("--limit must be a positive integer")
            course_types = ({t.strip().upper() for t in args.types.split(",") if t.strip()}
                            if args.types else None)
            if args.types and not course_types:
                raise ValueError("--types must specify at least one course type")
        else:
            # Preserve the original behavior when started without a subcommand.
            semester_ids = [prompt_semester_id()]
            course_limit = prompt_course_limit()
            curriculum_ids = []
            course_types = None

        database_url = os.environ.get("DATABASE_URL")
        if not database_url:
            raise ValueError("DATABASE_URL is not set. Configure the PostgreSQL connection first.")
        with psycopg.connect(database_url, autocommit=True) as db:
            create_schema(db)
            with requests.Session() as session:
                session.headers.update({
                    "Accept": "application/json",
                    "User-Agent": "TUMonlinePublicCourseArchive/1.0 (educational catalog importer)",
                })
                api = Api(session)
                results = [harvest(api, db, semester_id, course_limit,
                                   curriculum_ids or None, course_types)
                           for semester_id in semester_ids]
        print("\nPostgreSQL import summary:")
        for result in results:
            print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0
    except (ApiError, ValueError, psycopg.Error) as exc:
        LOG.error("Import failed: %s", exc)
        return 1

if __name__ == "__main__":
    sys.exit(main())
