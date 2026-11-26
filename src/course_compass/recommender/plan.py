"""Suggest a semester combination from the ranked recommendations."""
from __future__ import annotations

from . import config
from .models import Evaluation, Student
from .scoring import items_clash

MAX_COURSES = 4
CONSIDER_TOP = 15


def suggest_combination(ranked: list[Evaluation], student: Student) -> dict:
    """Walk down the ranking and pick courses that fit together.

    Skips courses that clash with a commitment or an already picked course,
    that would exceed the ECTS target or the weekly hours, or that would add
    too many heavy courses. Courses without ECTS count with unknown ECTS
    until the ECTS import is done.
    """
    target = student.target_ects or 30
    heavy_limit = 1 if student.priorities.get("workload") in ("important", "top") else 2
    chosen: list[Evaluation] = []
    skipped: list[str] = []

    for ev in ranked[:CONSIDER_TOP]:
        item = ev.item
        ects = sum(c.item.ects or 0 for c in chosen)
        hours = sum(c.item.expected_hours or 0 for c in chosen)
        heavy = sum(1 for c in chosen if (c.item.expected_hours or 0) >= config.HEAVY_HOURS_PER_WEEK)
        if ev.blocked_by:
            continue
        if item.ects and ects + item.ects > target:
            continue
        if student.max_hours and item.expected_hours and hours + item.expected_hours > student.max_hours:
            continue
        clash = next((c for c in chosen if items_clash(c.item, item)), None)
        if clash:
            skipped.append(f"{item.title} clashes with {clash.item.title}.")
            continue
        if (item.expected_hours or 0) >= config.HEAVY_HOURS_PER_WEEK and heavy >= heavy_limit:
            skipped.append(f"{item.title} would add another heavy course.")
            continue
        chosen.append(ev)
        if len(chosen) >= MAX_COURSES or sum(c.item.ects or 0 for c in chosen) >= target:
            break

    ects = sum(c.item.ects or 0 for c in chosen)
    unknown = sum(1 for c in chosen if not c.item.ects)
    hours_known = [c.item.expected_hours for c in chosen if c.item.expected_hours is not None]
    if unknown:
        parts = [f"ECTS are not known yet for {unknown} of these courses, so check the total before you register"]
    elif ects < target:
        parts = [f"{target - ects:g} ECTS under your target"]
    else:
        parts = [f"Hits your {target:g} ECTS target"]
    note = ". ".join(parts) + "." + (f" {skipped[0]}" if skipped else "")

    return {
        "title": " + ".join(c.item.title for c in chosen),
        "course_ids": [c.item.item_id for c in chosen],
        "ects": ects,
        "target_ects": target,
        "hours_per_week": round(sum(hours_known), 1) if hours_known else None,
        "clashes": 0,
        "note": note,
    }
