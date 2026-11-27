"""Turns database rows into the JSON shapes of docs/frontend-api.md."""
from __future__ import annotations

import re
from decimal import Decimal

LANGUAGE_NAMES = {"EN": "English", "DE": "German", "FR": "French", "ES": "Spanish", "IT": "Italian"}
BAND_KEYS = ("very_good", "good", "satisfactory", "sufficient", "failed")

# One ECTS is about 30 hours of work, spread over a 14-week lecture period.
HOURS_PER_ECTS = 30
LECTURE_WEEKS = 14


def num(value):
    """asyncpg returns NUMERIC as Decimal, which JSON can't encode."""
    return float(value) if isinstance(value, Decimal) else value


def language_name(codes: str | None) -> str | None:
    """'DE, EN' -> 'German / English'."""
    if not codes:
        return None
    parts = [c.strip() for c in codes.split(",") if c.strip()]
    return " / ".join(LANGUAGE_NAMES.get(p.upper(), p) for p in parts)


def exam_style(examination_method: str | None, course_type: str | None) -> str | None:
    """Rough reading of TUMonline's free-text examination method."""
    if course_type and re.search(r"seminar", course_type, re.I):
        return "seminar"
    text = (examination_method or "").lower()
    if re.search(r"projekt|project", text):
        return "project"
    if re.search(r"mündlich|muendlich|oral", text):
        return "oral"
    if re.search(r"schriftlich|klausur|written", text):
        return "written"
    return None


def first_text(*values: str | None) -> str | None:
    return next((v for v in values if v and v.strip()), None)


def empty_grade_summary() -> dict:
    return {
        "bands": {k: 0 for k in BAND_KEYS},
        "total_students": 0,
        "semester_count": 0,
        "average_grade": None,
        "pass_rate": None,
    }


def grade_summary(row) -> dict:
    """GradeSummary from a row of GRADE_SUMMARY_SQL (or None)."""
    if row is None or not row["total_students"]:
        return empty_grade_summary()
    total = row["total_students"]
    return {
        "bands": {k: row[k] for k in BAND_KEYS},
        "total_students": total,
        "semester_count": row["semester_count"],
        "average_grade": round(num(row["average_grade"]), 2) if row["average_grade"] is not None else None,
        "pass_rate": (total - row["failed"]) / total,
    }


def rating(row) -> dict:
    if row is None or not row["count"]:
        return {"average": None, "count": 0}
    return {"average": round(num(row["average"]), 1), "count": row["count"]}


def course_summary(row, grades_row=None, rating_row=None) -> dict:
    """CourseSummary from a course_catalog row."""
    ects = num(row["ects"])
    return {
        "course_id": str(row["course_id"]),
        "module_code": row["number"],
        "course_name": first_text(row["title_en"], row["title"], row["title_de"]) or row["number"] or str(row["course_id"]),
        "ects": ects,
        "course_type": row["course_type"],
        "language": language_name(row["languages"]),
        "assessment_type": row["examination_method"],
        "exam_style": exam_style(row["examination_method"], row["course_type"]),
        # Estimated from the ECTS until students report hours in reviews.
        "workload_hours_per_week": round(ects * HOURS_PER_ECTS / LECTURE_WEEKS) if ects else None,
        "module_description": first_text(row["content_en"], row["objectives_en"], row["content_de"]),
        "topics": [],
        "degree_groups": [],
        # TUMonline appointments aren't imported yet, so there are no time slots.
        "offering": {"schedule": [], "room": None, "lecturer": row["lecturers"]},
        "grade_summary": grade_summary(grades_row),
        "rating": rating(rating_row),
        "review_summary": None,
    }


def review(row) -> dict:
    return {
        "review_id": row["review_id"],
        "course_id": str(row["course_id"]),
        "rating": row["rating"],
        "workload_hours": num(row["workload_hours"]),
        "semester": row["semester"],
        "review_text": row["review_text"],
        "created_at": row["created_at"].date().isoformat(),
    }
