"""The score: six terms between 0 and 1, combined with personal weights.

Everything here is a pure function of its inputs, so the ranking is
reproducible and can be unit-tested.

- A term the student gave no input for (no topics, no preferences, no
  transcript) gets weight 0.
- A term the course has no data for counts as NEUTRAL (0.5).
"""
from __future__ import annotations

from typing import Mapping

import numpy as np

from . import config
from .models import FormatCheck, FormatPrefs, Item, RecordEntry

LEVEL_RANK = {"low": 0, "medium": 1, "high": 2}


def clip(x: float) -> float:
    return float(min(1.0, max(0.0, x)))


# --------------------------------------------------------------------------
# Weights
# --------------------------------------------------------------------------

def personal_weights(priorities: Mapping[str, str] | None, inputs: set[str]) -> dict[str, float]:
    """Default weights times the student's priority multipliers, scaled to add up to 1.

    priorities: term -> 'not_important' | 'normal' | 'important' | 'top'.
    inputs: terms the student gave input for; the others get weight 0.
    """
    priorities = priorities or {}
    raw = {}
    for term in config.TERMS:
        level = priorities.get(term, "normal")
        multiplier = config.PRIORITY_MULTIPLIERS.get(level, 1.0)
        raw[term] = config.DEFAULT_WEIGHTS[term] * multiplier if term in inputs else 0.0
    total = sum(raw.values())
    if total == 0:
        # Everything the student gave input for was marked "not important":
        # fall back to the default weights rather than ranking at random.
        raw = {t: config.DEFAULT_WEIGHTS[t] if t in inputs else 0.0 for t in config.TERMS}
        total = sum(raw.values())
    return {t: w / total for t, w in raw.items()}


def combine(scores: Mapping[str, float | None], weights: Mapping[str, float]) -> float:
    """Weighted average. A term without course data counts as NEUTRAL."""
    return sum(w * (config.NEUTRAL if scores.get(t) is None else scores[t]) for t, w in weights.items())


# --------------------------------------------------------------------------
# Interest
# --------------------------------------------------------------------------

def best_topic_match(item_vectors: np.ndarray, topic_vectors: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """For each item, the cosine similarity of its best-matching topic and that topic's index.

    Both inputs are normalized, one vector per row. Taking the best topic
    instead of the average keeps a student with two unrelated interests from
    matching neither.
    """
    sims = item_vectors @ topic_vectors.T
    return sims.max(axis=1), sims.argmax(axis=1)


def rescale(values: np.ndarray) -> np.ndarray:
    """Map similarities to 0..1 across the candidates: 5th percentile -> 0, best course -> 1.

    Raw similarities sit in a narrow band (e.g. 0.32 to 0.67), so they are
    stretched. The top isn't cut off, so the best courses keep their order.
    """
    if len(values) == 0:
        return values
    lo, hi = np.percentile(values, 5), values.max()
    if hi - lo < 1e-9:
        return np.full(len(values), config.NEUTRAL)
    return np.clip((values - lo) / (hi - lo), 0.0, 1.0)


# --------------------------------------------------------------------------
# Format
# --------------------------------------------------------------------------

def format_checks(item: Item, prefs: FormatPrefs) -> list[FormatCheck]:
    """Check each stated preference against the course."""
    attrs = item.attributes or {}
    kind = item.assessment_kind
    checks = []

    if prefs.prefers_project is not None:
        is_project = item.is_project_course or kind == "project"
        not_project = not item.is_project_course and kind in ("written_exam", "oral_exam")
        if prefs.prefers_project:
            score = 1.0 if is_project else 0.0 if not_project else config.NEUTRAL
            checks.append(FormatCheck("project", score, "Project-based, as you prefer",
                                      "Graded by an exam, not project work"))
        else:
            score = 0.0 if is_project else 1.0 if not_project else config.NEUTRAL
            checks.append(FormatCheck("no_project", score, "No project work, as you prefer",
                                      "Includes project work, which you'd rather avoid"))

    if prefs.avoids_written_exam:
        if kind == "written_exam":
            score = 0.0
        elif kind in ("project", "oral_exam"):
            score = 1.0
        else:
            score = config.NEUTRAL
        checks.append(FormatCheck("no_written_exam", score, "No written exam",
                                  "Graded by a written exam, which you'd rather avoid"))

    for key, tolerance, label in (("math", prefs.math_tolerance, "Math"),
                                  ("programming", prefs.programming_tolerance, "Programming")):
        if tolerance in LEVEL_RANK:
            level = attrs.get(f"{key}_level", "unknown")
            if level not in LEVEL_RANK:
                score = config.NEUTRAL
            else:
                score = 1.0 if LEVEL_RANK[level] <= LEVEL_RANK[tolerance] else 0.0
            checks.append(FormatCheck(key, score, f"{label} level suits you",
                                      f"{label}-heavy ({level}), more than you said you like"))
    return checks


def format_score(checks: list[FormatCheck]) -> float | None:
    return sum(c.score for c in checks) / len(checks) if checks else None


# --------------------------------------------------------------------------
# Readiness
# --------------------------------------------------------------------------

def prerequisite_status(topics: list[str], topic_vectors: np.ndarray | None,
                        record: list[RecordEntry], record_vectors: np.ndarray | None) -> list[dict]:
    """For each prerequisite topic: met, weak or recommended (= not found).

    A topic is covered when a passed module or skill is similar enough. A
    module passed with WEAK_GRADE or worse counts as weak background, which
    still beats having nothing on the topic.
    """
    if not topics or topic_vectors is None:
        return []
    statuses = []
    sims = topic_vectors @ record_vectors.T if record and record_vectors is not None else None
    for i, topic in enumerate(topics):
        entry = None
        if sims is not None:
            j = int(sims[i].argmax())
            if sims[i, j] >= config.PREREQ_MATCH_THRESHOLD:
                entry = record[j]
        if entry is None:
            statuses.append({"name": topic, "status": "recommended", "score": config.READINESS_MISSING,
                             "detail": "Not found in your transcript or skills."})
        elif entry.grade is not None and entry.grade >= config.WEAK_GRADE:
            statuses.append({"name": topic, "status": "weak", "score": config.READINESS_WEAK,
                             "detail": f"{entry.name} passed with {entry.grade:.1f}; worth refreshing."})
        else:
            how = f"passed with {entry.grade:.1f}" if entry.grade is not None else (
                "listed in your skills" if entry.source == "cv" else "passed")
            statuses.append({"name": topic, "status": "met", "score": config.READINESS_MET,
                             "detail": f"{entry.name}, {how}."})
    return statuses


def readiness_score(statuses: list[dict]) -> float | None:
    return sum(s["score"] for s in statuses) / len(statuses) if statuses else None


# --------------------------------------------------------------------------
# Grades, workload, rating
# --------------------------------------------------------------------------

def grades_score(stats: dict | None, prior_pass_rate: float, prior_average: float) -> float | None:
    """Half pass rate, half average grade of those who passed.

    Both are pulled toward the average of all courses, as if the course had
    GRADE_PRIOR_STUDENTS more students, so a tiny exam can't top the list.
    """
    if not stats or stats.get("pass_rate") is None:
        return None
    n, k = stats["total_students"], config.GRADE_PRIOR_STUDENTS
    pass_rate = (n * stats["pass_rate"] + k * prior_pass_rate) / (n + k)
    pass_part = clip((pass_rate - 0.5) / 0.5)          # 50 % -> 0, 100 % -> 1
    if stats.get("average_passed") is None:
        return pass_part
    average = (n * stats["average_passed"] + k * prior_average) / (n + k)
    grade_part = clip((4.0 - average) / 3.0)            # 4.0 -> 0, 1.0 -> 1
    return 0.5 * pass_part + 0.5 * grade_part


def workload_score(ects: float | None, reported_hours: float | None) -> float | None:
    """1 if students report no more work than the ECTS suggest, 0 at twice as much.

    ECTS alone can't tell courses apart here: hours estimated from ECTS are
    always exactly what the ECTS suggest. ECTS are used for the semester plan.
    """
    if reported_hours is None or not ects:
        return None
    ratio = reported_hours / (ects * config.HOURS_PER_ECTS_PER_WEEK)
    return clip(2.0 - ratio)


def rating_score(average: float | None, count: int, prior_mean: float) -> float | None:
    """Bayesian average of a 1-5 rating, mapped to 0..1."""
    if average is None or not count:
        return None
    c = config.RATING_PRIOR_COUNT
    bayes = (c * prior_mean + count * average) / (c + count)
    return clip((bayes - 1.0) / 4.0)


# --------------------------------------------------------------------------
# Time clashes
# --------------------------------------------------------------------------

def _minutes(time: str) -> int:
    h, m = time.split(":")
    return int(h) * 60 + int(m)


def slots_clash(a: dict, b: dict) -> bool:
    return (a["day"] == b["day"] and _minutes(a["start"]) < _minutes(b["end"])
            and _minutes(b["start"]) < _minutes(a["end"]))


def clashing_commitments(slots: list[dict], commitments: list[dict]) -> list[dict]:
    return [c for c in commitments if any(slots_clash(s, c) for s in slots)]


def items_clash(a: Item, b: Item) -> bool:
    return any(slots_clash(sa, sb) for sa in a.slots for sb in b.slots)


def final_score(scores: Mapping[str, float | None], weights: Mapping[str, float], blocked: bool) -> tuple[float, int]:
    """The combined score (0..1) and the match percentage shown to the student."""
    score = combine(scores, weights) - (config.CLASH_PENALTY if blocked else 0.0)
    score = clip(score)
    return score, round(100 * score)
