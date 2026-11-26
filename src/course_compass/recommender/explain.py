"""Reasons and cautions for a recommendation, built from rules.

The output shapes follow docs/frontend-api.md (Recommendation). Cautions are
shown whatever the student's weights are: a time clash or a missing
prerequisite matters even if the student said they only care about grades.
"""
from __future__ import annotations

import re

from . import config
from .models import Evaluation, Student

LEVEL_ORDER = {"high": 0, "medium": 1, "low": 2}
LANGUAGE_NAMES = {"EN": "English", "DE": "German"}


def language_name(codes: list[str]) -> str | None:
    return ", ".join(LANGUAGE_NAMES.get(c, c) for c in codes) or None


def last_exams(n: int) -> str:
    return "the last exam" if n == 1 else f"the last {n} exams"


def first_sentences(text: str, limit: int = 280) -> str:
    """The start of a text, cut at a sentence end where possible."""
    text = re.sub(r"\s+", " ", text or "").strip()
    if len(text) <= limit:
        return text
    cut = text[:limit]
    end = max(cut.rfind(". "), cut.rfind("! "), cut.rfind("? "))
    return cut[: end + 1] if end > limit // 3 else cut.rstrip() + "…"


def reasons(ev: Evaluation) -> list[dict]:
    """Up to three reasons, strongest contribution to the score first."""
    item, s = ev.item, ev.scores
    found: list[tuple[float, dict]] = []

    def add(term: str, reason: dict):
        found.append((ev.weights.get(term, 0.0) * (s.get(term) or 0.0), reason))

    if ev.topic and (s.get("interest") or 0) >= 0.6:
        add("interest", {
            "title": f"Covers {ev.topic}",
            "short": f"Close to your interest in {ev.topic}.",
            "text": f"You mentioned {ev.topic}. {first_sentences(item.description)}".strip(),
            "sources": ["your interests", "module description"],
        })
    met = [c for c in ev.format_checks if c.score == 1.0]
    if met and (s.get("format") or 0) >= 0.5:
        add("format", {
            "title": "Fits how you like to study",
            "short": "; ".join(c.met_text for c in met) + ".",
            "text": "; ".join(c.met_text for c in met) + "."
                    + (" The assessment type is read from the course description." if item.assessment_is_estimated else ""),
            "sources": ["your preferences", "module description"],
        })
    if ev.prerequisites and all(p["status"] == "met" for p in ev.prerequisites):
        add("readiness", {
            "title": "Your background covers the prerequisites",
            "short": "You have " + ", ".join(p["name"] for p in ev.prerequisites) + ".",
            "text": " ".join(f"{p['name']}: {p['detail']}" for p in ev.prerequisites),
            "sources": ["your transcript"],
        })
    stats = item.grade_stats
    if stats and (s.get("grades") or 0) >= 0.6:
        avg = stats.get("average_passed")
        add("grades", {
            "title": "Good exam results",
            "short": f"{round(100 * stats['pass_rate'])}% passed"
                     + (f", average {avg:.1f}" if avg else "")
                     + f" in {last_exams(stats['semester_count'])}.",
            "text": f"{stats['total_students']} students took {last_exams(stats['semester_count'])} "
                    f"({', '.join(stats['semesters'])}); {round(100 * stats['pass_rate'])}% passed"
                    + (f" with an average of {avg:.1f}" if avg else "") + ".",
            "sources": ["grade statistics (TUM Info)"],
        })
    if (s.get("workload") or 0) >= 0.75 and item.reported_hours is not None:
        add("workload", {
            "title": "Manageable workload",
            "short": f"Students report about {item.reported_hours:.0f} h per week.",
            "text": f"Students report about {item.reported_hours:.0f} hours per week, "
                    f"no more than its {item.ects:g} ECTS suggest.",
            "sources": ["student reviews"],
        })
    if (s.get("rating") or 0) >= 0.7 and item.rating_average is not None:
        add("rating", {
            "title": "Students rate it well",
            "short": f"Rated {item.rating_average:.1f} / 5 by {item.rating_count} students.",
            "text": f"Past participants rate it {item.rating_average:.1f} out of 5 ({item.rating_count} ratings).",
            "sources": ["student reviews"],
        })

    found.sort(key=lambda pair: pair[0], reverse=True)
    result = [r for _, r in found[:3]]
    if not result:
        result.append({
            "title": "Part of your degree",
            "short": f"Counts towards {item.areas[0]}." if item.areas else "Offered in your degree this semester.",
            "text": first_sentences(item.description) or item.title,
            "sources": ["module description"],
        })
    return result


def cautions(ev: Evaluation, student: Student) -> list[dict]:
    """Everything the student should check, most serious first."""
    item = ev.item
    out: list[dict] = []

    def add(level: str, title: str, text: str):
        if not any(c["title"] == title for c in out):
            out.append({"level": level, "title": title, "text": text})

    for c in ev.blocked_by:
        add("high", f"Clashes with {c['label']}",
            f"A weekly session overlaps with your {c['label']} ({c['day']} {c['start']}–{c['end']}).")
    for check in ev.format_checks:
        if check.score == 0.0:
            level = "high" if check.key == "no_written_exam" else "medium"
            add(level, check.unmet_text.split(",")[0], check.unmet_text + ".")
    for p in ev.prerequisites:
        if p["status"] == "weak":
            add("medium", f"Refresh {p['name']}", f"The course builds on {p['name']}. {p['detail']}")
        elif p["status"] == "recommended":
            add("medium", f"{p['name']} expected",
                f"The course expects {p['name']}, which isn't in your transcript or skills.")
    stats = item.grade_stats
    if stats and stats["pass_rate"] < 0.75 and stats["total_students"] >= 20:
        add("medium", "Lower pass rate",
            f"Only {round(100 * stats['pass_rate'])}% passed in {last_exams(stats['semester_count'])}.")
    if set(item.module_codes) & config.MATCHING_MODULES:
        add("low", "Places assigned by matching",
            "Seminars and practical courses in Informatics usually assign places through the TUM matching "
            "system, with an application before the semester starts.")
    if student.english_only and not item.languages:
        add("low", "Language unknown", "TUMonline doesn't say which language this course is taught in.")
    elif item.languages and "EN" not in item.languages:
        add("low", f"Taught in {language_name(item.languages)}",
            f"Lectures and exam are in {language_name(item.languages)}.")
    if not stats and not item.is_umbrella:
        add("low", "No exam statistics", "There are no past exam results for this module yet.")
    if not item.description:
        add("low", "No course description", "TUMonline has no description for this course yet.")

    out.sort(key=lambda c: LEVEL_ORDER[c["level"]])
    return out


def summary(student: Student) -> str:
    """The sentence above the results."""
    if student.topics:
        focus = "your interest in " + " and ".join(student.topics[:2])
    else:
        focus = "your profile"
    top = [t for t, level in student.priorities.items() if level == "top"]
    extra = f", with {' and '.join(PRIORITY_NAMES.get(t, t) for t in top)} as your top priority" if top else ""
    text = f"Ranked for {focus}{extra}."
    for note in student.notes:
        text += f" {note}"
    return text


PRIORITY_NAMES = {
    "interest": "your interests",
    "format": "the course format",
    "readiness": "your background",
    "grades": "exam results",
    "workload": "workload",
    "rating": "student ratings",
}
