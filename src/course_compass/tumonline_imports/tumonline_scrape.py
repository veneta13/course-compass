#!/usr/bin/env python3
"""Import one selected TUMonline semester into PostgreSQL via public HTTP endpoints.

On every run: prompt for a semester ID and a course count (blank means all),
retrieve that many public course listings plus available details, curriculum
placements and groups, and store them in PostgreSQL.

Uses DATABASE_URL from the environment. Re-running updates listings and skips
already fetched detail resources; the scraper does not delete past records.
"""
from __future__ import annotations

from datetime import datetime, timezone
import json
import logging
import os
import sys
import time
from typing import Any, Iterable, Mapping

import psycopg
from psycopg.types.json import Jsonb
import requests
from requests.exceptions import RequestException

BASE = "https://campus.tum.de/tumonline"
REST_BASE = BASE + "/ee/rest/"
COURSES = "slc.tm.cp/student/courses"

# Selected afresh on every startup, used for all API requests and database writes.
SEMESTER_ID: int | None = None
COURSE_LIMIT: int | None = None  # None means import every available course.

LOG = logging.getLogger("tumonline")

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
"""
SCHEMA_STATEMENTS = tuple(s.strip() for s in SCHEMA_SQL.split(";") if s.strip())


def create_schema(db: psycopg.Connection) -> None:
    """Idempotent PostgreSQL schema setup, executed atomically."""
    with db.transaction():
        for statement in SCHEMA_STATEMENTS:
            db.execute(statement)


def dumps(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def obj(x: Any) -> dict:
    return x if isinstance(x, dict) else {}


def text(value: Any, lang: str | None = None) -> str | None:
    """Extract one language from the CAMPUSonline langdata DTO."""
    if isinstance(value, str):
        return value or None
    if not isinstance(value, dict):
        return None
    translations = obj(value.get("translations")).get("translation", [])
    if isinstance(translations, dict):
        translations = [translations]
    if lang:
        for tr in translations or []:
            if isinstance(tr, dict) and tr.get("lang", "").lower() == lang:
                return tr.get("value") or None
    return value.get("value") or None


def field_value(value: Any) -> str | None:
    if isinstance(value, dict):
        v = value.get("value")
        return str(v) if v is not None else None
    if value is not None:
        return str(value)
    return None


def number_value(course: dict) -> str | None:
    cn = course.get("courseNumber")
    if isinstance(cn, dict):
        return cn.get("courseNumber") or cn.get("databaseValue")
    return str(cn) if cn is not None else None


def get_sws(course: dict) -> str | None:
    configs = course.get("courseNormConfigs") or []
    for config in configs:
        if isinstance(config, dict) and config.get("key") == "SST":
            return str(config.get("value", "")) or None
    return None


def get_lecturers(course: dict) -> str | None:
    names = []
    for item in course.get("lectureships") or []:
        iden = obj(obj(item).get("identityLibDto"))
        name = " ".join(filter(None, [iden.get("firstName"), iden.get("lastName")])).strip()
        if name and name not in names:
            names.append(name)
    return "; ".join(names) or None


def get_languages(course: dict) -> str | None:
    values = []
    for item in course.get("courseLanguageDtos") or []:
        lang = obj(obj(item).get("languageDto"))
        label = lang.get("key") or text(lang.get("name"))
        if label and label not in values:
            values.append(str(label))
    return ", ".join(values) or None


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


def pg_text(value: Any) -> str | None:
    """Flatten irregular fields to PostgreSQL TEXT-compatible values.

    Preserve nested objects as JSON strings; store full records separately as JSONB.
    """
    if value is None:
        return None
    if isinstance(value, (dict, list, tuple)):
        return dumps(value)
    return str(value)


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
            try:
                response = self.client.get(url, params=params or {}, timeout=(10, 45),
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
            course_limit: int | None = None) -> dict:
    """Save up to course_limit API listings and enrich those selected courses.

    Without a limit, import the entire semester. The subset follows the API's
    listing order, which is not guaranteed to be stable between runs.
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
    skip = 0
    page_count = 0
    expected_count = None
    listing_ids: set[int] = set()

    while True:
        if course_limit is not None and len(listing_ids) >= course_limit:
            break
        # Fetch only the remaining courses, including on a partial final page.
        batch_size = (page_size if course_limit is None else
                      min(page_size, course_limit - len(listing_ids)))
        listing = api.get(COURSES, {
            "$filter": f"termId-eq={semester_id}",
            "$top": batch_size,
            "$skip": skip,
        })
        rows = listing.get("courses")
        if not isinstance(rows, list):
            raise ApiError("Course-list response has no 'courses' array")
        if len(rows) > batch_size:
            LOG.warning("API returned %s courses despite $top=%s; keeping only the first %s",
                        len(rows), batch_size, batch_size)
            rows = rows[:batch_size]
        total = listing.get("totalCount")
        if total is not None:
            try:
                expected_count = int(total)
            except (TypeError, ValueError) as exc:
                raise ApiError("Invalid totalCount in course listing") from exc

        page_ids: set[int] = set()
        for item in rows:
            if not isinstance(item, dict) or item.get("id") is None:
                raise ApiError("Course listing contained an invalid record")
            try:
                cid = int(item["id"])
            except (TypeError, ValueError) as exc:
                raise ApiError("Course listing contained an invalid course ID") from exc
            if cid in listing_ids or cid in page_ids:
                raise ApiError(f"Duplicate course ID {cid}; pagination may be broken")
            page_ids.add(cid)
            actual_semester = obj(item.get("semesterDto")).get("id")
            if actual_semester is not None and int(actual_semester) != semester_id:
                raise ApiError("Server did not apply the semester filter correctly")

        with db.transaction():
            for item in rows:
                save_listing(db, item, semester_id)

        listing_ids.update(page_ids)
        page_count += 1
        skip += len(rows)
        LOG.info("Page %s: %s courses; %s retrieved%s", page_count, len(rows),
                 len(listing_ids), f" of {expected_count}" if expected_count is not None else "")
        if not rows or (expected_count is not None and skip >= expected_count):
            break
        if course_limit is not None and len(listing_ids) >= course_limit:
            break
        if expected_count is None and len(rows) < batch_size:
            break

    target_count = (min(course_limit, expected_count)
                    if course_limit is not None and expected_count is not None
                    else course_limit if course_limit is not None
                    else expected_count)
    if target_count is not None and len(listing_ids) != target_count:
        raise ApiError(f"Incomplete listing: received {len(listing_ids)} of {target_count} selected courses")
    if not listing_ids:
        raise ApiError(f"No courses found for semester ID {semester_id}; check the ID")

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
            LOG.info("Enriched %s/%s courses", count, len(listing_ids))

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


def main() -> int:
    global SEMESTER_ID, COURSE_LIMIT
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    try:
        SEMESTER_ID = prompt_semester_id()
        COURSE_LIMIT = prompt_course_limit()
        LOG.info("Selected semester ID: %s", SEMESTER_ID)
        LOG.info("Course count: %s", COURSE_LIMIT if COURSE_LIMIT is not None else "all")
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
                result = harvest(api, db, SEMESTER_ID, COURSE_LIMIT)
        print("\nPostgreSQL import summary:")
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0
    except (ApiError, ValueError, psycopg.Error) as exc:
        LOG.error("Import failed: %s", exc)
        return 1


if __name__ == "__main__":
    sys.exit(main())
