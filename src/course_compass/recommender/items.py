"""Turn the scraped TUMonline courses into recommendable items.

An item is normally a module: its lecture, exercise and other courses are
recommended together under the module code (e.g. IN2390). A module code that
many unrelated courses share, such as IN2107 (Master's seminar), is an
umbrella module; each of its courses becomes an item of its own
('IN2107-950945730').

The parsing functions are pure, so they can be tested without a database.
`build()` reads the tables, groups the courses and writes rec_items and
rec_item_degrees.
"""
from __future__ import annotations

import hashlib
import json
import re
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable

from . import config

WEEKDAYS = {"Mo.": "Mon", "Di.": "Tue", "Mi.": "Wed", "Do.": "Thu", "Fr.": "Fri", "Sa.": "Sat", "So.": "Sun"}
DAY_ORDER = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

# TUMonline course types, most important first. The first type of an item
# decides its main course.
TYPE_ORDER = [
    "Vorlesung mit integrierten Übungen", "Vorlesung", "Praktikum", "Seminar", "Hauptseminar",
    "Projekt", "Workshop", "Kolloquium", "Mentoring", "Übung", "Tutorium",
]
TYPE_NAMES = {
    "Vorlesung mit integrierten Übungen": "Lecture with exercises",
    "Vorlesung": "Lecture",
    "Übung": "Exercise",
    "Seminar": "Seminar",
    "Hauptseminar": "Seminar",
    "Praktikum": "Practical course",
    "Projekt": "Project",
    "Workshop": "Workshop",
    "Tutorium": "Tutorial",
    "Kolloquium": "Colloquium",
    "Mentoring": "Mentoring",
}
# Students pick one of several groups, so these give no fixed weekly slot.
ALTERNATIVE_GROUP_TYPES = {"Übung", "Tutorium"}

CODE_RE = re.compile(r"\b[A-Z]{2,4}\d{4,6}[A-Z]?\b")
SEMESTER_LIKE_RE = re.compile(r"^(WS|SS)\d{4}$")
# A bracketed part of a title that contains a module code, e.g. "(IN2106, IN4282)".
CODE_GROUP_RE = re.compile(r"\s*[\(\[][^)\]]*\b[A-Z]{2,4}\d{4,6}[A-Z]?\b[^)\]]*[\)\]]")
BOILERPLATE_RE = re.compile(r"can be found in the module description|finden sie in der modulbeschreibung", re.I)


# --------------------------------------------------------------------------
# Parsing helpers (pure)
# --------------------------------------------------------------------------

def english(langdata: Any) -> str | None:
    """The English text of a TUMonline langdata object, else its default value."""
    if not isinstance(langdata, dict):
        return None
    for t in (langdata.get("translations") or {}).get("translation", []):
        if t.get("lang") == "en" and t.get("value"):
            return t["value"].strip()
    value = langdata.get("value")
    return value.strip() if isinstance(value, str) and value.strip() else None


def _is_module_node(node: dict) -> bool:
    desc = (node.get("description") or {}).get("value") or ""
    return "(Modulknoten" in desc or "(Module node" in desc


def _is_rule_node(node: dict) -> bool:
    desc = (node.get("description") or {}).get("value") or ""
    return "(Regelknoten" in desc or "(Rule node" in desc


@dataclass
class Position:
    """One place of a course in a curriculum."""
    curriculum_version: str
    module_code: str | None
    module_name: str | None
    area: str | None


def curriculum_positions(curriculum_json: dict | None) -> list[Position]:
    """Where a course sits in each curriculum: module code, module name and area.

    The area is the rule node directly above the module node, e.g.
    'Computer Graphics and Vision (CGV)'.
    """
    positions = []
    for res in (curriculum_json or {}).get("resource", []):
        dto = (res.get("content") or {}).get("coCurriculumPositionDto") or {}
        version = str((dto.get("studyNameInfoDto") or {}).get("curriculumVersionId") or "")
        path = (dto.get("curriculumPositionPathDto") or {}).get("path") or []
        code = name = area = None
        for i, node in enumerate(path):
            if _is_module_node(node) and node.get("designation"):
                code = node["designation"].strip().upper()
                name = english(node.get("name"))
                if i > 0 and _is_rule_node(path[i - 1]):
                    area = english(path[i - 1].get("name"))
                break
        positions.append(Position(version, code, name, area))
    return positions


def title_codes(title: str | None) -> list[str]:
    """Module codes written in a course title, e.g. 'Seminar (IN2107, IN4429)'."""
    codes = []
    for code in CODE_RE.findall(title or ""):
        if not SEMESTER_LIKE_RE.match(code) and code not in codes:
            codes.append(code)
    return codes


def clean_title(title: str | None) -> str:
    """Drop bracketed module codes from a title."""
    cleaned = CODE_GROUP_RE.sub("", title or "").strip(" -:")
    return re.sub(r"\s{2,}", " ", cleaned) or (title or "").strip()


def weekly_slots(groups_json: dict | None, min_repeats: int = config.MIN_WEEKLY_REPEATS) -> list[dict]:
    """Recurring weekly slots of a course, e.g. [{'day': 'Wed', 'start': '10:00', 'end': '12:00'}].

    TUMonline lists single dates, so a slot counts when the same weekday and
    time repeat at least `min_repeats` times. One-off dates such as exams are
    left out.
    """
    counts: Counter = Counter()
    for group in (groups_json or {}).get("courseGroupDtos", []):
        for app in group.get("appointmentDtos", []):
            day = WEEKDAYS.get((app.get("weekday") or {}).get("key"))
            start = ((app.get("timestampFrom") or {}).get("value") or "")[11:16]
            end = ((app.get("timestampTo") or {}).get("value") or "")[11:16]
            if day and start and end:
                counts[(day, start, end)] += 1
    slots = [{"day": d, "start": s, "end": e} for (d, s, e), n in counts.items() if n >= min_repeats]
    return sort_slots(slots)


def sort_slots(slots: Iterable[dict]) -> list[dict]:
    unique = {(s["day"], s["start"], s["end"]) for s in slots}
    ordered = sorted(unique, key=lambda s: (DAY_ORDER.index(s[0]), s[1], s[2]))
    return [{"day": d, "start": s, "end": e} for d, s, e in ordered]


def course_languages(detail_json: dict | None, languages_column: str | None) -> list[str]:
    """Teaching languages as codes, e.g. ['EN', 'DE']."""
    langs: list[str] = []
    for res in (detail_json or {}).get("resource", []):
        dto = ((res.get("content") or {}).get("cpCourseDetailDto") or {}).get("cpCourseDto") or {}
        for lang in dto.get("courseLanguageDtos") or []:
            key = ((lang.get("languageDto") or {}).get("key") or "").upper()
            if key and key not in langs:
                langs.append(key)
    for key in re.split(r"[,\s]+", languages_column or ""):
        key = key.strip().upper()
        if key and key not in langs:
            langs.append(key)
    return langs


def assessment_label(text: str | None) -> str | None:
    """Map an official examination method to written_exam, oral_exam, project or mixed."""
    if not text:
        return None
    t = text.lower()
    written = bool(re.search(r"schriftlich|klausur|written", t))
    oral = bool(re.search(r"mündlich|oral", t))
    project = bool(re.search(r"projekt|project|hausarbeit|präsentation|presentation|report|bericht|seminar", t))
    kinds = [k for k, hit in (("written_exam", written), ("oral_exam", oral), ("project", project)) if hit]
    if len(kinds) == 1:
        return kinds[0]
    return "mixed" if kinds else None


def grade_stats(exams: list[dict], recent: int = config.RECENT_EXAMS) -> dict | None:
    """Summary of the latest endterm exams of a module.

    Each exam: {'year', 'semester' ('WS2023'), 'exam_type', 'counts' {grade: n},
    'ungraded_passed', 'ungraded_failed'}. No-shows are left out. Retakes are
    left out because their results look much worse than the endterm.
    """
    endterm = [e for e in exams if e["exam_type"] == "endterm"]
    if not endterm:
        return None
    endterm.sort(key=lambda e: (e["year"], e["semester"].startswith("WS")), reverse=True)
    used = endterm[:recent]

    bands = {"very_good": 0, "good": 0, "satisfactory": 0, "sufficient": 0, "failed": 0}
    graded_sum = graded_n = passed_sum = passed_n = 0.0
    ungraded_passed = ungraded_failed = 0
    for e in used:
        for grade, n in e["counts"].items():
            g = float(grade)
            if g <= 1.5:
                bands["very_good"] += n
            elif g <= 2.5:
                bands["good"] += n
            elif g <= 3.5:
                bands["satisfactory"] += n
            elif g <= 4.0:
                bands["sufficient"] += n
            else:
                bands["failed"] += n
            graded_sum += g * n
            graded_n += n
            if g <= 4.0:
                passed_sum += g * n
                passed_n += n
        ungraded_passed += e.get("ungraded_passed") or 0
        ungraded_failed += e.get("ungraded_failed") or 0

    passed = passed_n + ungraded_passed
    students = graded_n + ungraded_passed + ungraded_failed
    if students == 0:
        return None
    return {
        "bands": bands,
        "total_students": int(students),
        "semester_count": len(used),
        "semesters": [e["semester"] for e in used],
        "pass_rate": round(passed / students, 3),
        "average_grade": round(graded_sum / graded_n, 2) if graded_n else None,
        "average_passed": round(passed_sum / passed_n, 2) if passed_n else None,
        "share_very_good": round(bands["very_good"] / graded_n, 3) if graded_n else None,
    }


# --------------------------------------------------------------------------
# Grouping courses into items (pure)
# --------------------------------------------------------------------------

@dataclass
class CourseInfo:
    """What the grouping needs to know about one TUMonline course."""
    course_id: int
    title: str
    course_type: str
    codes: list[str]                       # curriculum codes first, then title codes
    module_names: dict[str, str] = field(default_factory=dict)
    raw: dict = field(default_factory=dict)  # everything else, used when building the item


@dataclass
class ItemGroup:
    item_id: str
    module_code: str | None
    is_umbrella: bool
    courses: list[CourseInfo]
    codes: list[str]
    passed_codes: list[str]


def group_courses(courses: list[CourseInfo]) -> tuple[list[ItemGroup], set[str]]:
    """Group courses into items. Returns the items and the umbrella codes.

    A course joins the item of its most widely shared non-umbrella code, so a
    lecture and its exercise end up together. A course with only umbrella
    codes becomes its own item.
    """
    counts = Counter(code for c in courses for code in set(c.codes))
    umbrella = {code for code, n in counts.items() if n >= config.UMBRELLA_MIN_COURSES}

    groups: dict[str, ItemGroup] = {}
    for c in courses:
        specific = [code for code in c.codes if code not in umbrella]
        if specific:
            primary = max(specific, key=lambda code: (counts[code], -specific.index(code)))
            item_id, is_umbrella = primary, False
        elif c.codes:
            primary = c.codes[0]
            item_id, is_umbrella = f"{primary}-{c.course_id}", True
        else:
            primary, item_id, is_umbrella = None, str(c.course_id), False
        group = groups.setdefault(item_id, ItemGroup(item_id, primary, is_umbrella, [], [], []))
        group.courses.append(c)
        for code in c.codes:
            if code not in group.codes:
                group.codes.append(code)

    for group in groups.values():
        if group.module_code and group.module_code in group.codes:
            group.codes.remove(group.module_code)
            group.codes.insert(0, group.module_code)
        # Passing an umbrella module (e.g. one Master's seminar) shouldn't hide
        # courses that also have their own module code.
        group.passed_codes = [code for code in group.codes if code not in umbrella]
        if group.is_umbrella and group.module_code:
            group.passed_codes = [group.module_code]
        group.courses.sort(key=lambda c: (type_rank(c.course_type), c.course_id))
    return list(groups.values()), umbrella


def type_rank(course_type: str) -> int:
    return TYPE_ORDER.index(course_type) if course_type in TYPE_ORDER else len(TYPE_ORDER)


def combined_type(types: list[str]) -> str:
    """'Lecture + exercise' for a lecture with an exercise, else the English names joined."""
    unique = sorted(set(types), key=type_rank)
    if set(unique) == {"Vorlesung", "Übung"}:
        return "Lecture + exercise"
    return " + ".join(dict.fromkeys(TYPE_NAMES.get(t, t) for t in unique))


def text_hash(*parts: str) -> str:
    return hashlib.sha256("\n\x1f".join(parts).encode()).hexdigest()[:16]


# --------------------------------------------------------------------------
# Database build
# --------------------------------------------------------------------------

SCHEMA_PATH = Path(__file__).with_name("schema.sql")

COURSES_SQL = """
    SELECT course_id, semester_id, title, title_en, course_type, languages, ects,
           examination_method, lecturers, detail_json::text, curriculum_json::text, groups_json::text
    FROM courses
    WHERE semester_id = $1
"""
TEXTS_SQL = """
    SELECT t.course_id, t.field, t.language, t.value
    FROM course_texts t JOIN courses c ON c.course_id = t.course_id
    WHERE c.semester_id = $1
"""
DEGREES_SQL = """
    SELECT d.course_id, d.degree
    FROM course_degrees d JOIN courses c ON c.course_id = d.course_id
    WHERE c.semester_id = $1
"""
EXAMS_SQL = """
    SELECT d.course_code, d.year, d.semester, d.exam_type,
           d.ungraded_passed, d.ungraded_failed,
           COALESCE(json_object_agg(g.grade::text, g.student_count)
                    FILTER (WHERE g.grade IS NOT NULL), '{}')::text AS counts
    FROM tum_info_grade_distributions d
    LEFT JOIN tum_info_grade_counts g ON g.distribution_id = d.distribution_id
    GROUP BY d.distribution_id
"""


def _pick(texts: dict, course_id: int, field_name: str) -> str | None:
    """A course text in English, else German. Skips boilerplate."""
    for lang in ("en", "de"):
        value = (texts.get((course_id, field_name, lang)) or "").strip()
        if value and not (BOILERPLATE_RE.search(value) and len(value) < 300):
            return value
    return None


def _join_unique(values: Iterable[str | None], limit: int) -> str:
    parts = list(dict.fromkeys(v for v in values if v))
    return "\n\n".join(parts)[:limit]


def build_rows(course_rows, text_rows, degree_rows, exam_rows) -> tuple[list[dict], list[tuple]]:
    """Group the database rows into item rows and (item_id, degree, areas) rows."""
    texts = {(r["course_id"], r["field"], r["language"]): r["value"] for r in text_rows}
    degrees_of = defaultdict(set)
    for r in degree_rows:
        degrees_of[r["course_id"]].add(r["degree"])
    exams_of = defaultdict(list)
    for r in exam_rows:
        exams_of[r["course_code"].upper()].append({
            "year": r["year"], "semester": r["semester"], "exam_type": r["exam_type"],
            "counts": {k: int(v) for k, v in json.loads(r["counts"]).items()},
            "ungraded_passed": r["ungraded_passed"], "ungraded_failed": r["ungraded_failed"],
        })
    version_degree = {v: d for d, versions in config.DEGREE_CURRICULA.items() for v in versions}

    infos = []
    for r in course_rows:
        positions = curriculum_positions(json.loads(r["curriculum_json"]) if r["curriculum_json"] else None)
        codes = list(dict.fromkeys([p.module_code for p in positions if p.module_code]
                                   + title_codes(r["title_en"]) + title_codes(r["title"])))
        names = {p.module_code: p.module_name for p in positions if p.module_code and p.module_name}
        infos.append(CourseInfo(r["course_id"], r["title_en"] or r["title"] or "", r["course_type"] or "",
                                codes, names, {"row": r, "positions": positions}))

    groups, _ = group_courses(infos)
    items, item_degrees = [], []
    for g in groups:
        main = g.courses[0]
        rows = [c.raw["row"] for c in g.courses]
        ids = [c.course_id for c in g.courses]

        if g.is_umbrella or not g.module_code:
            title = clean_title(main.title)
        else:
            title = next((c.module_names[g.module_code] for c in g.courses if g.module_code in c.module_names),
                         clean_title(main.title))

        description = _join_unique(
            (_pick(texts, i, f) for i in ids for f in ("courseContent", "courseObjective")), 4000)
        prerequisites = _join_unique((_pick(texts, i, "previousKnowledge") for i in ids), 2000)
        teaching = _join_unique(
            (_pick(texts, i, f) for i in ids for f in ("teachingMethod", "additionalInformation.comments")), 2000)

        languages: list[str] = []
        slots: list[dict] = []
        for c in g.courses:
            row = c.raw["row"]
            for lang in course_languages(json.loads(row["detail_json"]) if row["detail_json"] else None,
                                         row["languages"]):
                if lang not in languages:
                    languages.append(lang)
            if c.course_type not in ALTERNATIVE_GROUP_TYPES:
                slots += weekly_slots(json.loads(row["groups_json"]) if row["groups_json"] else None)

        stats = None
        if not g.is_umbrella:
            code = next((code for code in g.passed_codes if exams_of.get(code)), None)
            stats = grade_stats(exams_of[code]) if code else None
            if stats:
                stats["module_code"] = code

        items.append({
            "item_id": g.item_id,
            "module_code": g.module_code,
            "module_codes": g.codes,
            "passed_codes": g.passed_codes,
            "is_umbrella": g.is_umbrella,
            "semester_id": main.raw["row"]["semester_id"],
            "course_ids": ids,
            "main_course_id": main.course_id,
            "title": title,
            "course_type": combined_type([c.course_type for c in g.courses]),
            "course_types": list(dict.fromkeys(c.course_type for c in g.courses)),
            "languages": languages,
            "ects": next((r["ects"] for r in rows if r["ects"] is not None), None),
            "assessment": next((r["examination_method"] for r in rows if r["examination_method"]), None),
            "lecturers": rows[0]["lecturers"],
            "description": description,
            "prerequisites_text": prerequisites,
            "teaching_text": teaching,
            "slots": json.dumps(sort_slots(slots)),
            "grade_stats": json.dumps(stats) if stats else None,
            "text_hash": text_hash(title, description, prerequisites, teaching),
        })

        areas_by_degree: dict[str, list[str]] = {}
        for c in g.courses:
            for degree in degrees_of[c.course_id]:
                areas_by_degree.setdefault(degree, [])
            for p in c.raw["positions"]:
                degree = version_degree.get(p.curriculum_version)
                if degree and p.area and p.area not in areas_by_degree.setdefault(degree, []):
                    areas_by_degree[degree].append(p.area)
        for degree, areas in areas_by_degree.items():
            if any(degree in degrees_of[i] for i in ids):
                item_degrees.append((g.item_id, degree, areas))
    return items, item_degrees


UPSERT_ITEM_SQL = """
    INSERT INTO rec_items (
        item_id, module_code, module_codes, passed_codes, is_umbrella, semester_id, course_ids,
        main_course_id, title, course_type, course_types, languages, ects, assessment, lecturers,
        description, prerequisites_text, teaching_text, slots, grade_stats, text_hash, built_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18,
            $19::jsonb, $20::jsonb, $21, now())
    ON CONFLICT (item_id) DO UPDATE SET
        module_code = EXCLUDED.module_code, module_codes = EXCLUDED.module_codes,
        passed_codes = EXCLUDED.passed_codes, is_umbrella = EXCLUDED.is_umbrella,
        semester_id = EXCLUDED.semester_id, course_ids = EXCLUDED.course_ids,
        main_course_id = EXCLUDED.main_course_id, title = EXCLUDED.title,
        course_type = EXCLUDED.course_type, course_types = EXCLUDED.course_types,
        languages = EXCLUDED.languages, ects = EXCLUDED.ects, assessment = EXCLUDED.assessment,
        lecturers = EXCLUDED.lecturers, description = EXCLUDED.description,
        prerequisites_text = EXCLUDED.prerequisites_text, teaching_text = EXCLUDED.teaching_text,
        slots = EXCLUDED.slots, grade_stats = EXCLUDED.grade_stats,
        text_hash = EXCLUDED.text_hash, built_at = now()
"""
ITEM_COLUMNS = [
    "item_id", "module_code", "module_codes", "passed_codes", "is_umbrella", "semester_id", "course_ids",
    "main_course_id", "title", "course_type", "course_types", "languages", "ects", "assessment", "lecturers",
    "description", "prerequisites_text", "teaching_text", "slots", "grade_stats", "text_hash",
]


async def build(conn, semester_id: int | None = None) -> dict:
    """Rebuild rec_items and rec_item_degrees for one semester (default: the newest).

    Embeddings and LLM attributes of unchanged items are kept; items whose
    texts changed get new ones on the next `enrich` run.
    """
    await conn.execute(SCHEMA_PATH.read_text(encoding="utf-8"))
    if semester_id is None:
        semester_id = await conn.fetchval("SELECT max(semester_id) FROM courses")
    if semester_id is None:
        raise RuntimeError("The courses table is empty. Run the TUMonline import first.")

    course_rows = await conn.fetch(COURSES_SQL, semester_id)
    text_rows = await conn.fetch(TEXTS_SQL, semester_id)
    degree_rows = await conn.fetch(DEGREES_SQL, semester_id)
    exam_rows = await conn.fetch(EXAMS_SQL)
    items, item_degrees = build_rows(course_rows, text_rows, degree_rows, exam_rows)

    async with conn.transaction():
        await conn.execute("DELETE FROM rec_items WHERE NOT (item_id = ANY($1::text[]))",
                           [i["item_id"] for i in items])
        await conn.executemany(UPSERT_ITEM_SQL, [[i[c] for c in ITEM_COLUMNS] for i in items])
        await conn.execute("DELETE FROM rec_item_degrees")
        await conn.executemany(
            "INSERT INTO rec_item_degrees (item_id, degree, areas) VALUES ($1, $2, $3)", item_degrees)

    return {
        "semester_id": semester_id,
        "courses": len(course_rows),
        "items": len(items),
        "umbrella_items": sum(i["is_umbrella"] for i in items),
        "with_description": sum(bool(i["description"]) for i in items),
        "with_grades": sum(i["grade_stats"] is not None for i in items),
        "with_slots": sum(i["slots"] != "[]" for i in items),
        "with_ects": sum(i["ects"] is not None for i in items),
        "degrees": len({d for _, d, _ in item_degrees}),
    }
