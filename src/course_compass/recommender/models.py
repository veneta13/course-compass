"""Data types shared by the recommender modules."""
from __future__ import annotations

import json
from dataclasses import dataclass, field

import numpy as np

from . import config
from .items import assessment_label


@dataclass
class Item:
    """A recommendable module or umbrella course, as stored in rec_items."""
    item_id: str
    module_code: str | None
    module_codes: list[str]
    passed_codes: list[str]
    is_umbrella: bool
    course_ids: list[int]
    main_course_id: int
    title: str
    course_type: str
    course_types: list[str]
    languages: list[str]
    ects: float | None = None
    assessment: str | None = None          # official examination method
    lecturers: str | None = None
    description: str = ""
    prerequisites_text: str = ""
    slots: list[dict] = field(default_factory=list)
    grade_stats: dict | None = None
    rating_average: float | None = None
    rating_count: int = 0
    reported_hours: float | None = None
    areas: list[str] = field(default_factory=list)
    embedding: np.ndarray | None = None    # normalized
    attributes: dict | None = None         # LLM categories (enrich.CourseAttributes)
    prereq_embeddings: np.ndarray | None = None  # normalized, one row per attributes['prerequisites']

    @classmethod
    def from_row(cls, row) -> "Item":
        attributes = _json(row["attributes"])
        prereq = row["prereq_embeddings"]
        topics = (attributes or {}).get("prerequisites") or []
        if prereq and len(prereq) == len(topics):
            # Drop placeholders such as "unknown" together with their embeddings.
            keep = [i for i, t in enumerate(topics) if not is_placeholder_topic(t)]
            attributes["prerequisites"] = [topics[i] for i in keep]
            prereq = [prereq[i] for i in keep]
        return cls(
            item_id=row["item_id"], module_code=row["module_code"], module_codes=list(row["module_codes"]),
            passed_codes=list(row["passed_codes"]), is_umbrella=row["is_umbrella"],
            course_ids=list(row["course_ids"]), main_course_id=row["main_course_id"], title=row["title"],
            course_type=row["course_type"], course_types=list(row["course_types"]),
            languages=list(row["languages"]), ects=row["ects"], assessment=row["assessment"],
            lecturers=row["lecturers"], description=row["description"],
            prerequisites_text=row["prerequisites_text"], slots=_json(row["slots"]) or [],
            grade_stats=_json(row["grade_stats"]), rating_average=row["rating_average"],
            rating_count=row["rating_count"] or 0, reported_hours=row["reported_hours"],
            areas=list(row["areas"] or []),
            embedding=normalize(np.asarray(row["embedding"], dtype=np.float32)) if row["embedding"] else None,
            attributes=attributes,
            prereq_embeddings=normalize(np.asarray(prereq, dtype=np.float32)) if prereq else None,
        )

    @property
    def assessment_kind(self) -> str | None:
        """written_exam, oral_exam, project or mixed. Official data first, then the LLM's reading."""
        official = assessment_label(self.assessment)
        if official:
            return official
        guess = (self.attributes or {}).get("assessment")
        return guess if guess and guess != "unknown" else None

    @property
    def assessment_is_estimated(self) -> bool:
        return self.assessment_kind is not None and assessment_label(self.assessment) is None

    @property
    def is_seminar(self) -> bool:
        return any(t in ("Seminar", "Hauptseminar") for t in self.course_types)

    @property
    def is_project_course(self) -> bool:
        """Practical courses and projects, by their TUMonline course type.

        The LLM's own 'project_based' answer isn't used: it said "yes" for
        two thirds of all courses, plain lectures included.
        """
        return any(t in ("Praktikum", "Projekt") for t in self.course_types)

    @property
    def expected_hours(self) -> float | None:
        """Hours per week: reported by students if available, else estimated from ECTS."""
        if self.reported_hours is not None:
            return self.reported_hours
        if self.ects:
            return round(self.ects * config.HOURS_PER_ECTS_PER_WEEK, 1)
        return None

    @property
    def prerequisite_topics(self) -> list[str]:
        return list((self.attributes or {}).get("prerequisites") or [])


@dataclass(frozen=True)
class FormatPrefs:
    """How the student likes to study, as read from their text. None = not stated."""
    prefers_project: bool | None = None
    avoids_written_exam: bool | None = None
    math_tolerance: str | None = None          # low, medium, high
    programming_tolerance: str | None = None   # low, medium, high

    @property
    def stated(self) -> bool:
        return any(v is not None for v in
                   (self.prefers_project, self.avoids_written_exam, self.math_tolerance, self.programming_tolerance))


@dataclass
class RecordEntry:
    """A passed module from the transcript, or a skill from the CV."""
    name: str
    grade: float | None
    source: str  # 'transcript' or 'cv'


@dataclass
class Student:
    topics: list[str] = field(default_factory=list)
    topic_vectors: np.ndarray | None = None      # normalized, one row per topic
    prefs: FormatPrefs = field(default_factory=FormatPrefs)
    priorities: dict[str, str] = field(default_factory=dict)
    record: list[RecordEntry] = field(default_factory=list)
    record_vectors: np.ndarray | None = None     # normalized, one row per record entry
    passed_codes: set[str] = field(default_factory=set)
    commitments: list[dict] = field(default_factory=list)
    english_only: bool = False
    target_ects: float | None = None
    max_hours: float | None = None
    notes: list[str] = field(default_factory=list)

    def inputs(self) -> set[str]:
        """Terms the student gave input for. Terms without input get weight 0."""
        given = {"grades", "workload", "rating"}
        if self.topics and self.topic_vectors is not None:
            given.add("interest")
        if self.prefs.stated:
            given.add("format")
        if self.record:
            given.add("readiness")
        return given


@dataclass
class FormatCheck:
    """One stated preference checked against a course: 1 met, 0 not met, 0.5 unknown."""
    key: str
    score: float
    met_text: str
    unmet_text: str


@dataclass
class Evaluation:
    item: Item
    scores: dict[str, float | None]
    weights: dict[str, float]
    score: float
    match: int
    topic: str | None = None
    format_checks: list[FormatCheck] = field(default_factory=list)
    prerequisites: list[dict] = field(default_factory=list)
    blocked_by: list[dict] = field(default_factory=list)


PLACEHOLDER_TOPICS = {"unknown", "none", "n/a", "na", "nothing", "keine", "no prerequisites", "-"}


def is_placeholder_topic(topic: str) -> bool:
    """True for answers like 'unknown' that the LLM sometimes lists as a prerequisite."""
    return (topic or "").strip().strip(".").lower() in PLACEHOLDER_TOPICS


def normalize(vectors: np.ndarray) -> np.ndarray:
    """Scale vectors (one per row, or a single vector) to length 1."""
    norms = np.linalg.norm(vectors, axis=-1, keepdims=True)
    return vectors / np.where(norms == 0, 1, norms)


def _json(value):
    if value is None or isinstance(value, (dict, list)):
        return value
    return json.loads(value)
