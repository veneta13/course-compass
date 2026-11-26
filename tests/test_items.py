from course_compass.recommender.items import (
    CourseInfo, assessment_label, clean_title, combined_type, curriculum_positions, grade_stats,
    group_courses, title_codes, weekly_slots,
)


def test_title_codes_skip_semesters_and_keep_order():
    assert title_codes("Seminar: 3D ML (IN2107, IN4429)") == ["IN2107", "IN4429"]
    assert title_codes("Entrepreneurship (WI000969, English)") == ["WI000969"]
    assert title_codes("Kickoff SS2025") == []


def test_clean_title_drops_code_brackets():
    assert clean_title("Praktikum: Deep Learning (IN2106, IN4282)") == "Praktikum: Deep Learning"
    assert clean_title("(SOT86080, SOT86102) Risk & Crisis Communication") == "Risk & Crisis Communication"
    assert clean_title("Probabilistic Techniques [MA4803]") == "Probabilistic Techniques"


def _appointment(day, start, end, date="2026-10-20"):
    return {"weekday": {"key": day},
            "timestampFrom": {"value": f"{date}T{start}:00"},
            "timestampTo": {"value": f"{date}T{end}:00"}}


def test_weekly_slots_keep_only_repeating_times():
    weekly = [_appointment("Mi.", "10:00", "12:00", f"2026-10-{d}") for d in (21, 28)] + \
             [_appointment("Mi.", "10:00", "12:00", "2026-11-04")]
    exam = [_appointment("Fr.", "09:00", "11:00", "2027-02-12")]
    groups = {"courseGroupDtos": [{"appointmentDtos": weekly + exam}]}
    assert weekly_slots(groups) == [{"day": "Wed", "start": "10:00", "end": "12:00"}]


def test_curriculum_positions_find_module_and_area():
    def node(name, kind, designation=None):
        return {"name": {"value": name}, "description": {"value": f"{name} ({kind})"}, "designation": designation}
    curriculum = {"resource": [{"content": {"coCurriculumPositionDto": {
        "studyNameInfoDto": {"curriculumVersionId": 5217},
        "curriculumPositionPathDto": {"path": [
            node("Master Informatics", "SPO-Version"),
            node("Computer Graphics and Vision (CGV)", "Regelknoten - Wahlfach"),
            node("3D Scanning", "Modulknoten - Wahlfach", "IN2354"),
            node("3D Scanning (IN2354)", "Angebotsknoten"),
        ]},
    }}}]}
    [p] = curriculum_positions(curriculum)
    assert (p.curriculum_version, p.module_code, p.module_name, p.area) == \
        ("5217", "IN2354", "3D Scanning", "Computer Graphics and Vision (CGV)")


def _exam(semester, year, counts, exam_type="endterm", passed=0, failed=0):
    return {"semester": semester, "year": year, "exam_type": exam_type, "counts": counts,
            "ungraded_passed": passed, "ungraded_failed": failed}


def test_grade_stats_use_recent_endterm_exams_only():
    exams = [
        _exam("WS2020", 2020, {"5.0": 50}),                       # too old once 4 newer exist
        _exam("SS2021", 2021, {"1.0": 10}),
        _exam("WS2021", 2021, {"1.0": 10}),
        _exam("SS2022", 2022, {"2.0": 10, "5.0": 10}),
        _exam("WS2022", 2022, {"1.3": 10}),
        _exam("WS2022", 2022, {"5.0": 40}, exam_type="retake"),   # retakes are left out
    ]
    stats = grade_stats(exams)
    assert stats["semesters"] == ["WS2022", "SS2022", "WS2021", "SS2021"]
    assert stats["total_students"] == 50
    assert stats["pass_rate"] == 0.8
    assert stats["bands"]["failed"] == 10
    assert stats["average_passed"] == round((10 * 1.0 + 10 * 1.0 + 10 * 2.0 + 10 * 1.3) / 40, 2)


def test_grade_stats_none_without_endterm():
    assert grade_stats([_exam("WS2022", 2022, {"1.0": 5}, exam_type="retake")]) is None


def _course(course_id, course_type, codes):
    return CourseInfo(course_id, f"Course {course_id}", course_type, codes)


def test_lecture_and_exercise_become_one_item():
    groups, _ = group_courses([_course(1, "Übung", ["IN2390"]), _course(2, "Vorlesung", ["IN2390"])])
    [g] = groups
    assert g.item_id == "IN2390" and not g.is_umbrella
    assert [c.course_id for c in g.courses] == [2, 1]   # lecture is the main course
    assert combined_type([c.course_type for c in g.courses]) == "Lecture + exercise"


def test_umbrella_courses_get_their_own_items():
    seminars = [_course(i, "Seminar", ["IN2107"]) for i in range(10, 16)]   # 6 courses share IN2107
    groups, umbrella = group_courses(seminars)
    assert umbrella == {"IN2107"}
    assert sorted(g.item_id for g in groups) == [f"IN2107-{i}" for i in range(10, 16)]
    assert all(g.is_umbrella and g.passed_codes == ["IN2107"] for g in groups)


def test_specific_title_code_wins_over_umbrella():
    courses = [_course(i, "Seminar", ["IN2107"]) for i in range(10, 16)]
    courses.append(_course(20, "Seminar", ["IN2107", "IN4429"]))
    groups, _ = group_courses(courses)
    item = next(g for g in groups if 20 in [c.course_id for c in g.courses])
    assert item.item_id == "IN4429" and not item.is_umbrella
    # Passing some other Master's seminar must not hide this one.
    assert item.passed_codes == ["IN4429"]


def test_assessment_label():
    assert assessment_label("Klausur") == "written_exam"
    assert assessment_label("Oral exam") == "oral_exam"
    assert assessment_label("Project work and presentation") == "project"
    assert assessment_label("Written exam and project") == "mixed"
    assert assessment_label(None) is None
