import json

import numpy as np

from course_compass.recommender import config
from course_compass.recommender.enrich import clean_topics
from course_compass.recommender.models import FormatPrefs, Item
from course_compass.recommender.scoring import format_checks
from helpers import make_item


def _row(**overrides) -> dict:
    row = dict(
        item_id="IN1", module_code="IN1", module_codes=["IN1"], passed_codes=["IN1"], is_umbrella=False,
        course_ids=[1], main_course_id=1, title="T", course_type="Lecture", course_types=["Vorlesung"],
        languages=["EN"], ects=None, assessment=None, lecturers=None, description="", prerequisites_text="",
        slots="[]", grade_stats=None, rating_average=None, rating_count=0, reported_hours=None, areas=[],
        embedding=None, attributes=None, prereq_embeddings=None,
    )
    row.update(overrides)
    return row


def test_placeholder_prerequisites_are_dropped_with_their_embeddings():
    attributes = json.dumps({"prerequisites": ["linear algebra", "unknown", "Python"]})
    item = Item.from_row(_row(attributes=attributes, prereq_embeddings=[[1, 0], [0, 1], [1, 1]]))
    assert item.prerequisite_topics == ["linear algebra", "Python"]
    assert item.prereq_embeddings.shape == (2, 2)
    assert np.allclose(item.prereq_embeddings[1], np.array([1, 1]) / np.sqrt(2))


def test_enrich_drops_placeholder_topics():
    assert clean_topics(["unknown", "[ ]", "Linear algebra", "None."]) == ["Linear algebra"]


def test_project_based_comes_from_the_course_type_not_the_llm():
    prefs = FormatPrefs(prefers_project=True)
    lecture = make_item(attributes={"project_based": "yes", "assessment": "unknown"})
    practical = make_item(course_types=["Praktikum"], attributes={"assessment": "unknown"})
    exam_lecture = make_item(attributes={"assessment": "written_exam"})
    assert format_checks(lecture, prefs)[0].score == config.NEUTRAL
    assert format_checks(practical, prefs)[0].score == 1.0
    assert format_checks(exam_lecture, prefs)[0].score == 0.0
