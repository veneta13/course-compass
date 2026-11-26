"""The functions the backend endpoints call.

    await recommend(db, profile, degree)                # POST /api/recommendations
    await match_course(db, course_id, profile, degree)  # POST /api/courses/{course_id}/match
    await profile_insights(profile)                     # POST /api/profile/insights

`db` is an asyncpg pool or connection, `profile` is the ProfilePayload from
docs/frontend-api.md, and `degree` a degree key such as 'master-informatics'
(see config.DEGREE_CURRICULA). The return values have the JSON shapes of
docs/frontend-api.md, plus a few extra fields marked below.
"""
from __future__ import annotations

import numpy as np

from . import config
from .explain import cautions, first_sentences, language_name, reasons, summary
from .llm import OllamaLLM
from .models import Evaluation, Item, Student
from .plan import suggest_combination
from .profile import build_student, insights
from .scoring import (best_topic_match, clashing_commitments, final_score, format_checks, format_score,
                      grades_score, personal_weights, prerequisite_status, rating_score, readiness_score,
                      rescale, workload_score)

ITEMS_SQL = """
    SELECT i.*, d.areas
    FROM rec_items i
    JOIN rec_item_degrees d ON d.item_id = i.item_id AND d.degree = $1
"""

_llm: OllamaLLM | None = None


def default_llm() -> OllamaLLM:
    global _llm
    if _llm is None:
        _llm = OllamaLLM()
    return _llm


class UnknownDegree(ValueError):
    pass


class UnknownCourse(LookupError):
    pass


async def load_items(db, degree: str) -> list[Item]:
    rows = await db.fetch(ITEMS_SQL, degree)
    if not rows:
        raise UnknownDegree(f"No courses for degree '{degree}'. Check the degree key, "
                            "or run: python -m course_compass.recommender build")
    return [Item.from_row(r) for r in rows]


# --------------------------------------------------------------------------
# Filtering and scoring
# --------------------------------------------------------------------------

def exclusion(item: Item, student: Student) -> str | None:
    """Why a hard filter removes the item, or None if it passes."""
    if set(item.passed_codes) & student.passed_codes:
        return "You have already passed this module."
    if student.english_only and item.languages and "EN" not in item.languages:
        return f"Taught in {language_name(item.languages)}, and you asked for English only."
    return None


def evaluate(items: list[Item], student: Student) -> list[Evaluation]:
    """Score every item for the student, best first."""
    weights = personal_weights(student.priorities, student.inputs())

    interest: dict[str, float] = {}
    topic_of: dict[str, str] = {}
    described = [i for i in items if i.embedding is not None
                 and len(i.description) >= config.MIN_DESCRIPTION_FOR_INTEREST]
    if student.topic_vectors is not None and described:
        best, index = best_topic_match(np.vstack([i.embedding for i in described]), student.topic_vectors)
        scaled = rescale(best)
        for item, value, k in zip(described, scaled, index):
            interest[item.item_id] = float(value)
            topic_of[item.item_id] = student.topics[int(k)]
        # Courses without a usable description count as a typical course.
        typical = float(np.median(scaled))
        for item in items:
            interest.setdefault(item.item_id, typical)

    stats = [i.grade_stats for i in items if i.grade_stats and i.grade_stats.get("pass_rate") is not None]
    prior_pass = float(np.mean([s["pass_rate"] for s in stats])) if stats else 0.85
    averages = [s["average_passed"] for s in stats if s.get("average_passed") is not None]
    prior_average = float(np.mean(averages)) if averages else 2.3
    ratings = [i.rating_average for i in items if i.rating_average is not None]
    prior_rating = float(np.mean(ratings)) if ratings else 3.5

    evaluations = []
    for item in items:
        checks = format_checks(item, student.prefs)
        topics = item.prerequisite_topics
        prereqs = []
        if student.record and topics and item.prereq_embeddings is not None \
                and len(item.prereq_embeddings) == len(topics):
            prereqs = prerequisite_status(topics, item.prereq_embeddings, student.record, student.record_vectors)
        scores = {
            "interest": interest.get(item.item_id),
            "format": format_score(checks),
            "readiness": readiness_score(prereqs),
            "grades": grades_score(item.grade_stats, prior_pass, prior_average),
            "workload": workload_score(item.ects, item.reported_hours),
            "rating": rating_score(item.rating_average, item.rating_count, prior_rating),
        }
        blocked = clashing_commitments(item.slots, student.commitments)
        score, match = final_score(scores, weights, bool(blocked))
        evaluations.append(Evaluation(item, scores, weights, score, match, topic_of.get(item.item_id),
                                      checks, prereqs, blocked))
    evaluations.sort(key=lambda e: (-e.score, e.item.title))
    return evaluations


# --------------------------------------------------------------------------
# Output shapes (docs/frontend-api.md)
# --------------------------------------------------------------------------

ASSESSMENT_NAMES = {"written_exam": "Written exam", "oral_exam": "Oral exam",
                    "project": "Project work", "mixed": "Mixed assessment"}
EXAM_STYLES = {"written_exam": "written", "oral_exam": "oral", "project": "project"}
EMPTY_GRADES = {
    "bands": {"very_good": 0, "good": 0, "satisfactory": 0, "sufficient": 0, "failed": 0},
    "total_students": 0, "semester_count": 0, "average_grade": None, "pass_rate": None,
}


def course_summary(item: Item) -> dict:
    """CourseSummary. Extra fields: module_code, tumonline_course_ids."""
    kind = item.assessment_kind
    if item.assessment:
        assessment = item.assessment
    elif kind:
        assessment = f"{ASSESSMENT_NAMES[kind]} (read from the description)"
    else:
        assessment = None
    stats = item.grade_stats
    return {
        "course_id": item.item_id,
        "module_code": item.module_code,
        "tumonline_course_ids": item.course_ids,
        "course_name": item.title,
        "ects": item.ects,
        "course_type": item.course_type,
        "language": language_name(item.languages),
        "assessment_type": assessment,
        "exam_style": "seminar" if item.is_seminar else EXAM_STYLES.get(kind),
        "workload_hours_per_week": item.expected_hours,
        "module_description": first_sentences(item.description, 600),
        "topics": [],
        "degree_groups": item.areas,
        "offering": {"schedule": item.slots, "room": None, "lecturer": item.lecturers},
        "grade_summary": {k: stats[k] for k in EMPTY_GRADES} if stats else dict(EMPTY_GRADES),
        "rating": {"average": item.rating_average, "count": item.rating_count},
        "review_summary": None,
    }


def recommendation(ev: Evaluation, student: Student, excluded: str | None = None) -> dict:
    """Recommendation. Extra field: score_details (each term's score and weight)."""
    found_cautions = cautions(ev, student)
    if excluded:
        found_cautions.insert(0, {"level": "high", "title": "Filtered out", "text": excluded})
    return {
        "course": course_summary(ev.item),
        "match": ev.match,
        "reasons": reasons(ev),
        "cautions": found_cautions,
        "prerequisites": [{k: p[k] for k in ("name", "status", "detail")} for p in ev.prerequisites],
        "blocked_by": [c["label"] for c in ev.blocked_by],
        "score_details": {
            t: {"score": None if s is None else round(s, 3), "weight": round(ev.weights[t], 3)}
            for t, s in ev.scores.items()
        },
    }


# --------------------------------------------------------------------------
# Public functions
# --------------------------------------------------------------------------

async def recommend(db, profile: dict, degree: str, *, llm: OllamaLLM | None = None, limit: int = 10) -> dict:
    """RecommendationResponse: the best `limit` courses for the profile."""
    items = await load_items(db, degree)
    student = await build_student(profile, llm or default_llm())
    # Score all items, then filter, so a course gets the same match here as in match_course.
    ranked = [ev for ev in evaluate(items, student) if exclusion(ev.item, student) is None]
    top = ranked[:limit]
    return {
        "total_offered": len(items),
        "passed_constraints": len(ranked),
        "summary": summary(student),
        "results": [recommendation(ev, student) for ev in top],
        # Only courses from `results`, because the frontend looks them up there.
        "combination": suggest_combination(top, student),
    }


async def match_course(db, course_id: str, profile: dict, degree: str, *, llm: OllamaLLM | None = None) -> dict:
    """Recommendation for one course, e.g. on its detail page.

    `course_id` is the item ID from a recommendation (e.g. 'IN2390'). A
    course the filters would remove is still scored, with a caution saying why.
    """
    items = await load_items(db, degree)
    student = await build_student(profile, llm or default_llm())
    ranked = evaluate(items, student)
    ev = next((e for e in ranked if e.item.item_id == course_id), None)
    if ev is None:
        raise UnknownCourse(f"Course '{course_id}' isn't offered in '{degree}' this semester.")
    return recommendation(ev, student, exclusion(ev.item, student))


async def profile_insights(profile: dict, *, llm: OllamaLLM | None = None) -> dict:
    """ProfileInsights. Extra fields: priorities, notes.

    The first call for a new text waits for the LLM (a few seconds); repeated
    calls with the same text are instant.
    """
    student = await build_student(profile, llm or default_llm(), embed=False)
    return insights(student, profile)
