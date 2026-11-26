import numpy as np
import pytest

from course_compass.recommender import config
from course_compass.recommender.models import FormatPrefs, RecordEntry
from course_compass.recommender.scoring import (
    best_topic_match, combine, final_score, format_checks, format_score, grades_score, personal_weights,
    prerequisite_status, rating_score, readiness_score, rescale, workload_score,
)
from helpers import make_item, unit

ALL_INPUTS = set(config.TERMS)


def test_default_weights_without_priorities():
    weights = personal_weights({}, ALL_INPUTS)
    assert weights == pytest.approx(config.DEFAULT_WEIGHTS)
    assert sum(weights.values()) == pytest.approx(1.0)


def test_student_who_only_cares_about_grades():
    priorities = {t: "not_important" for t in config.TERMS} | {"grades": "top"}
    weights = personal_weights(priorities, ALL_INPUTS)
    assert weights["grades"] == pytest.approx(1.0)
    assert all(w == 0 for t, w in weights.items() if t != "grades")


def test_grades_matter_most_with_interests():
    weights = personal_weights({"grades": "top"}, ALL_INPUTS)
    # 0.10 * 5 = 0.50 out of 1.40
    assert weights["grades"] == pytest.approx(0.5 / 1.4)
    assert weights["grades"] > weights["interest"]


def test_terms_without_student_input_get_no_weight():
    weights = personal_weights({}, {"grades", "workload", "rating"})
    assert weights["interest"] == weights["format"] == weights["readiness"] == 0
    assert sum(weights.values()) == pytest.approx(1.0)


def test_everything_unimportant_falls_back_to_defaults():
    weights = personal_weights({t: "not_important" for t in config.TERMS}, ALL_INPUTS)
    assert weights == pytest.approx(config.DEFAULT_WEIGHTS)


def test_missing_course_data_counts_as_neutral():
    weights = {"interest": 0.5, "grades": 0.5}
    assert combine({"interest": 1.0, "grades": None}, weights) == pytest.approx(0.75)


def test_clash_lowers_the_score():
    score, match = final_score({"grades": 0.8}, {"grades": 1.0}, blocked=False)
    blocked_score, _ = final_score({"grades": 0.8}, {"grades": 1.0}, blocked=True)
    assert match == 80
    assert blocked_score == pytest.approx(0.8 - config.CLASH_PENALTY)


def test_interest_uses_the_best_topic_not_the_average():
    vision, databases = unit(1, 0, 0), unit(0, 1, 0)
    items = np.vstack([unit(1, 0, 0), unit(0, 1, 0), unit(0, 0, 1)])
    best, index = best_topic_match(items, np.vstack([vision, databases]))
    assert best.tolist() == pytest.approx([1.0, 1.0, 0.0])
    assert index.tolist()[:2] == [0, 1]
    assert rescale(best).tolist() == pytest.approx([1.0, 1.0, 0.0])


def test_small_exam_is_pulled_toward_the_average():
    tiny = {"total_students": 4, "pass_rate": 1.0, "average_passed": 1.0}
    large = {"total_students": 300, "pass_rate": 0.95, "average_passed": 1.7}
    assert grades_score(large, 0.8, 2.3) > grades_score(tiny, 0.8, 2.3)
    assert grades_score(None, 0.8, 2.3) is None


def test_rating_bayesian_average():
    one_star_review = rating_score(5.0, 1, prior_mean=3.5)
    many_reviews = rating_score(4.5, 40, prior_mean=3.5)
    assert many_reviews > one_star_review
    assert rating_score(None, 0, 3.5) is None


def test_workload_needs_reported_hours():
    assert workload_score(6, None) is None
    nominal = 6 * config.HOURS_PER_ECTS_PER_WEEK
    assert workload_score(6, nominal) == pytest.approx(1.0)
    assert workload_score(6, 2 * nominal) == pytest.approx(0.0)


def test_readiness_no_module_is_weaker_than_a_bad_grade():
    topics = ["linear algebra", "probability", "databases"]
    topic_vectors = np.vstack([unit(1, 0, 0), unit(0, 1, 0), unit(0, 0, 1)])
    record = [RecordEntry("Linear Algebra for Informatics", 1.7, "transcript"),
              RecordEntry("Discrete Probability Theory", 3.7, "transcript")]
    record_vectors = np.vstack([unit(1, 0.1, 0), unit(0.1, 1, 0)])
    statuses = prerequisite_status(topics, topic_vectors, record, record_vectors)
    assert [s["status"] for s in statuses] == ["met", "weak", "recommended"]
    assert [s["score"] for s in statuses] == [config.READINESS_MET, config.READINESS_WEAK,
                                             config.READINESS_MISSING]
    assert readiness_score(statuses) == pytest.approx(0.5)


def test_grade_just_better_than_weak_threshold_is_met():
    record = [RecordEntry("Analysis", 3.3, "transcript")]
    [status] = prerequisite_status(["analysis"], np.vstack([unit(1, 0)]), record, np.vstack([unit(1, 0)]))
    assert status["status"] == "met"


def test_format_written_exam_against_preferences():
    item = make_item(attributes={"assessment": "written_exam", "project_based": "no",
                                 "math_level": "high", "programming_level": "unknown"})
    prefs = FormatPrefs(avoids_written_exam=True, math_tolerance="low", programming_tolerance="low")
    checks = {c.key: c.score for c in format_checks(item, prefs)}
    assert checks == {"no_written_exam": 0.0, "math": 0.0, "programming": config.NEUTRAL}
    assert format_score(format_checks(item, FormatPrefs())) is None


def test_official_assessment_beats_the_llm_reading():
    item = make_item(assessment="Projektarbeit", attributes={"assessment": "written_exam"})
    [check] = format_checks(item, FormatPrefs(prefers_project=True))
    assert check.score == 1.0
