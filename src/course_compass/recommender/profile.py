"""Turn the frontend's ProfilePayload into a Student.

The LLM reads the free text once: topics, format preferences and
priorities. The result is cached per text, so typing the same text again is
instant. Everything else (transcript, commitments, limits) is read directly.
"""
from __future__ import annotations

import asyncio
from collections import OrderedDict
from typing import Literal

from pydantic import BaseModel, Field, ValidationError

from . import config
from .llm import LLMUnavailable, OllamaLLM
from .models import FormatPrefs, RecordEntry, Student

Tolerance = Literal["low", "medium", "high"]

# The LLM sees these labels instead of the term names: a small model confuses
# "rating" with "grades" and reads "readiness" or "format" too freely.
Aspect = Literal["subjects", "teaching_format", "my_background", "good_grades", "low_workload", "student_reviews"]
ASPECT_TERMS = {
    "subjects": "interest", "teaching_format": "format", "my_background": "readiness",
    "good_grades": "grades", "low_workload": "workload", "student_reviews": "rating",
}


class Topic(BaseModel):
    name: str = Field(description="The subject in 1 to 5 words, e.g. 'natural language processing'")
    description: str = Field(description="One sentence of at least 12 words on what a course on it covers")


class Understanding(BaseModel):
    """What the LLM reads from the student's text. Only what the text says.

    Priorities are lists of explicitly mentioned aspects rather than a level
    for every aspect: a small model asked to fill in all six levels tends to
    invent them.
    """
    topics: list[Topic] = Field(default_factory=list)
    prefers_project: bool | None = None
    avoids_written_exam: bool | None = None
    math_tolerance: Tolerance | None = None
    programming_tolerance: Tolerance | None = None
    only_cares_about: Aspect | None = None
    most_important: list[Aspect] = Field(default_factory=list)
    also_important: list[Aspect] = Field(default_factory=list)
    not_important: list[Aspect] = Field(default_factory=list)

    def priority_levels(self) -> dict[str, str]:
        """Turn the mentioned aspects into a level per term; unmentioned terms stay 'normal'."""
        if self.only_cares_about:
            levels = {t: "not_important" for t in config.TERMS}
            levels[ASPECT_TERMS[self.only_cares_about]] = "top"
            return levels
        levels = {t: "normal" for t in config.TERMS}
        for level, aspects in (("not_important", self.not_important), ("important", self.also_important),
                               ("top", self.most_important)):
            for aspect in aspects:
                levels[ASPECT_TERMS[aspect]] = level
        return levels


SYSTEM_PROMPT = """You read what a university student wrote about the courses they want, and turn it into structured data. Only record what the text says. When in doubt, leave a field null or a list empty.

topics: the subjects they want to learn about, at most 8, such as "natural language processing" or "database systems". Never goals such as "good grades" or "low workload". [] if no subject is named.
  For each topic, write a description of at least 12 words listing what a university course on it covers. Example: name "computer vision", description "Image processing, object detection and segmentation, 3D reconstruction and deep learning for images and video."
prefers_project: true if they ask for project or hands-on work, false if they want to avoid it, else null. Being interested in a subject is not a wish for projects.
avoids_written_exam: true if they say they dislike written exams, else null.
math_tolerance, programming_tolerance: "low" if they want little of it or say they are weak at it, "high" if they ask for a lot of it, else null.

Aspects a student can care about:
  subjects = studying the topics they like
  teaching_format = how the course is taught and graded
  my_background = already having the knowledge the course expects
  good_grades = getting a good grade or passing easily
  low_workload = little effort per week
  student_reviews = what other students say about the course
only_cares_about: the one aspect, only if they say it is the only thing they care about. Else null.
most_important: aspects they explicitly say matter most.
also_important: aspects they explicitly say are important.
not_important: aspects they explicitly say they don't care about.
Leave these lists empty unless the text talks about what matters to the student. Liking a subject is not a statement about priorities.

Examples:
"I only care about getting a good grade, the topic doesn't matter." -> only_cares_about "good_grades", not_important ["subjects"].
"I'm interested in databases and want a project." -> topics ["databases"], prefers_project true, only_cares_about null, all lists empty.
"Low workload matters most to me, I have a job." -> most_important ["low_workload"]."""

_cache: OrderedDict[tuple[str, str], Understanding] = OrderedDict()
_CACHE_SIZE = 256


def understand(text: str, llm: OllamaLLM) -> Understanding:
    """Read the student's free text with the LLM (cached per text and model)."""
    key = (text.strip(), llm.chat_model)
    if key in _cache:
        _cache.move_to_end(key)
        return _cache[key]
    result = llm.extract(SYSTEM_PROMPT, text.strip(), Understanding)
    _cache[key] = result
    if len(_cache) > _CACHE_SIZE:
        _cache.popitem(last=False)
    return result


def _grade(value) -> float | None:
    try:
        grade = float(value)
    except (TypeError, ValueError):
        return None
    return grade if 1.0 <= grade <= 5.0 else None


async def build_student(payload: dict, llm: OllamaLLM | None, *, embed: bool = True) -> Student:
    """Read a ProfilePayload (see docs/frontend-api.md).

    Optional extra field: "priorities", e.g. {"grades": "top"}. It overrides
    what the LLM read from the text, so a UI control can correct it.
    """
    student = Student(
        english_only=payload.get("language_pref") == "english",
        target_ects=payload.get("target_ects"),
        max_hours=payload.get("max_hours_per_week"),
        commitments=[c for c in payload.get("commitments") or []
                     if c.get("day") and c.get("start") and c.get("end")],
    )
    completed = payload.get("completed_courses") or []
    student.passed_codes = {str(c["module_id"]).strip().upper() for c in completed if c.get("module_id")}
    student.record = [RecordEntry(c["name"], _grade(c.get("grade")), "transcript") for c in completed if c.get("name")]
    student.record += [RecordEntry(s, None, "cv") for s in payload.get("skills") or [] if isinstance(s, str) and s]

    text = (payload.get("interest_text") or "").strip()
    understanding = Understanding()
    if text and llm is not None:
        try:
            understanding = await asyncio.to_thread(understand, text, llm)
        except LLMUnavailable as e:
            student.notes.append(f"Interests and preferences are ignored for now: {e}")
        except ValidationError:
            student.notes.append("Your text couldn't be read this time, so interests are ignored.")

    student.prefs = FormatPrefs(
        prefers_project=understanding.prefers_project,
        avoids_written_exam=understanding.avoids_written_exam,
        math_tolerance=understanding.math_tolerance,
        programming_tolerance=understanding.programming_tolerance,
    )
    student.priorities = understanding.priority_levels()
    for term, level in (payload.get("priorities") or {}).items():
        if term in config.TERMS and level in config.PRIORITY_LEVELS:
            student.priorities[term] = level

    topics = understanding.topics[:8]
    student.topics = [t.name for t in topics]
    if embed and llm is not None and (topics or student.record):
        texts = [f"{t.name}: {t.description}" for t in topics] + [r.name for r in student.record]
        try:
            vectors = await asyncio.to_thread(llm.embed, texts)
            if topics:
                student.topic_vectors = vectors[:len(topics)]
            if student.record:
                student.record_vectors = vectors[len(topics):]
        except LLMUnavailable as e:
            student.topics = []
            student.notes.append(f"Interest matching is off for now: {e}")
    return student


CONSTRAINT_TEXT = {
    ("prefers_project", True): "Prefers project work",
    ("prefers_project", False): "Avoids project work",
    ("avoids_written_exam", True): "Avoids written exams",
    ("math_tolerance", "low"): "Prefers little math",
    ("math_tolerance", "high"): "Likes math-heavy courses",
    ("programming_tolerance", "low"): "Prefers little programming",
    ("programming_tolerance", "high"): "Likes programming-heavy courses",
}
PRIORITY_TEXT = {
    "interest": "Interests", "format": "Course format", "readiness": "Fitting background",
    "grades": "Good grades", "workload": "Low workload", "rating": "Student ratings",
}


def insights(student: Student, payload: dict) -> dict:
    """ProfileInsights for the "What we understood so far" card, plus the priorities."""
    constraints = [text for (field, value), text in CONSTRAINT_TEXT.items()
                   if getattr(student.prefs, field) == value]
    for term, level in student.priorities.items():
        if level == "top":
            constraints.append(f"Top priority: {PRIORITY_TEXT[term].lower()}")
        elif level == "important":
            constraints.append(f"Important: {PRIORITY_TEXT[term].lower()}")
        elif level == "not_important":
            constraints.append(f"Not important: {PRIORITY_TEXT[term].lower()}")
    if student.english_only:
        constraints.append("Taught in English")
    if student.max_hours:
        constraints.append(f"Up to {student.max_hours:g} h per week")

    transcript = [r for r in student.record if r.source == "transcript"]
    strong = [r.name for r in transcript if r.grade is not None and r.grade <= 1.5]
    strong += [r.name for r in student.record if r.source == "cv"]
    gaps = [f"{r.name} grade: {r.grade:.1f}" for r in transcript if r.grade is not None and r.grade >= config.WEAK_GRADE]

    return {
        "interests": student.topics,
        "constraints": constraints,
        "strong": list(dict.fromkeys(strong))[:6],
        "gaps": gaps[:4],
        "learning_style": learning_style(payload.get("completed_courses") or []),
        "priorities": student.priorities,
        "notes": student.notes,
    }


def learning_style(completed: list[dict]) -> dict | None:
    """Average grade in project and seminar modules vs. written exams. None without enough grades."""
    hands = [g for c in completed if c.get("exam_style") in ("project", "seminar") and (g := _grade(c.get("grade")))]
    written = [g for c in completed if c.get("exam_style") == "written" and (g := _grade(c.get("grade")))]
    if len(hands) < 2 or len(written) < 2:
        return None
    hands_avg, written_avg = sum(hands) / len(hands), sum(written) / len(written)
    return {
        "hands_on_average": round(hands_avg, 2),
        "written_average": round(written_avg, 2),
        "prefers_hands_on": written_avg - hands_avg >= 0.4,
    }
