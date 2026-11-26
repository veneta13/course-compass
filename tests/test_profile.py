from course_compass.recommender import config
from course_compass.recommender.profile import Understanding, learning_style


def test_nothing_mentioned_means_all_normal():
    assert Understanding().priority_levels() == {t: "normal" for t in config.TERMS}


def test_only_cares_about_grades():
    levels = Understanding(only_cares_about="good_grades", not_important=["subjects"]).priority_levels()
    assert levels["grades"] == "top"
    assert all(level == "not_important" for t, level in levels.items() if t != "grades")


def test_mentioned_aspects_get_their_level():
    levels = Understanding(most_important=["low_workload"], also_important=["good_grades"],
                           not_important=["student_reviews"]).priority_levels()
    assert levels == {"interest": "normal", "format": "normal", "readiness": "normal",
                      "grades": "important", "workload": "top", "rating": "not_important"}


def test_learning_style_needs_enough_grades():
    hands = [{"exam_style": "project", "grade": 1.3}, {"exam_style": "seminar", "grade": 1.0}]
    written = [{"exam_style": "written", "grade": 2.3}, {"exam_style": "written", "grade": 2.0}]
    style = learning_style(hands + written)
    assert style["prefers_hands_on"] is True
    assert learning_style(hands) is None
