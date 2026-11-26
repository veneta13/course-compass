from course_compass.recommender.explain import cautions, reasons
from course_compass.recommender.models import Student
from course_compass.recommender.plan import suggest_combination
from course_compass.recommender.service import course_summary, exclusion
from helpers import make_evaluation, make_item

JOB = {"label": "Part-time job", "day": "Fri", "start": "09:00", "end": "17:00"}


def test_clash_is_the_first_caution():
    item = make_item("IN2107-5", module_codes=["IN2107"], is_umbrella=True, languages=["DE"])
    ev = make_evaluation(item, blocked_by=[JOB])
    found = cautions(ev, Student())
    assert found[0]["level"] == "high" and found[0]["title"] == "Clashes with Part-time job"
    titles = [c["title"] for c in found]
    assert "Places assigned by matching" in titles
    assert "Taught in German" in titles


def test_grade_reason_for_a_grade_focused_student():
    stats = {"pass_rate": 0.96, "average_passed": 1.6, "total_students": 120, "semester_count": 2,
             "semesters": ["WS2024", "SS2024"]}
    ev = make_evaluation(make_item(grade_stats=stats), scores={"grades": 0.8}, weights={"grades": 1.0})
    [reason] = reasons(ev)
    assert reason["title"] == "Good exam results"
    assert "96% passed" in reason["short"]


def test_filters_passed_modules_and_language():
    student = Student(passed_codes={"IN2390"}, english_only=True)
    assert exclusion(make_item("IN2390"), student) is not None
    assert exclusion(make_item("IN2000", languages=["DE"]), student) is not None
    assert exclusion(make_item("IN2001", languages=[]), student) is None   # unknown language stays


def test_combination_skips_clashes_and_blocked_courses():
    mon = [{"day": "Mon", "start": "10:00", "end": "12:00"}]
    first = make_evaluation(make_item("IN1", slots=mon, ects=6), 0.9)
    blocked = make_evaluation(make_item("IN2", ects=6), 0.85, blocked_by=[JOB])
    clashing = make_evaluation(make_item("IN3", slots=mon, ects=6), 0.8)
    fits = make_evaluation(make_item("IN4", ects=6), 0.7)
    combo = suggest_combination([first, blocked, clashing, fits], Student(target_ects=12))
    assert combo["course_ids"] == ["IN1", "IN4"]
    assert combo["ects"] == 12
    assert combo["note"].startswith("Hits your 12 ECTS target")


def test_course_summary_has_the_frontend_shape_without_data():
    summary = course_summary(make_item())
    assert summary["grade_summary"]["pass_rate"] is None
    assert summary["rating"] == {"average": None, "count": 0}
    assert summary["offering"]["schedule"] == []
    assert summary["language"] == "English"
