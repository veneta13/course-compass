# Frontend API contract

The React frontend talks to the backend only through [`frontend/src/api/client.js`](../frontend/src/api/client.js). This page lists every endpoint it calls and the JSON it expects. The FastAPI routes should match it, so the frontend works without changes.

- **Routes:** [`frontend/src/api/endpoints.js`](../frontend/src/api/endpoints.js)
- **HTTP calls:** [`frontend/src/api/http.js`](../frontend/src/api/http.js)
- **Backend:** [`src/course_compass/api/app.py`](../src/course_compass/api/app.py) serves these routes from the database.
- **Demo implementation:** [`frontend/src/demo/mockApi.js`](../frontend/src/demo/mockApi.js) returns the same shapes from invented fixtures (`npm run demo`).

## What the backend serves today

| Endpoint | Status |
|---|---|
| Courses, course details, grade statistics | Served from the TUMonline and TUM Info tables |
| Reviews, grade-statistics uploads | Saved in `reviews` and `grade_distribution_uploads` |
| Transcript and CV upload | Uses [transcript_reader.py](../src/course_compass/transcript_reader.py) and Ollama |
| Recommendations, course match, profile insights | Return `501` until the recommender is merged. The frontend shows a "coming soon" message for these. |

## Conventions

- All routes are served under `/api`. In development, Vite forwards `/api/*` to `http://localhost:8000`. Set `API_PROXY_TARGET` to use another address, or `VITE_API_URL` to call a backend directly, which then needs CORS.
- JSON fields use `snake_case`, matching [schema.sql](../src/course_compass/schema.sql).
- Semesters use the database codes: `WS2026` is the winter semester 2026/27 and `SS2025` is the summer semester 2025.
- Times are `HH:MM` strings. Days are `Mon`, `Tue`, `Wed`, `Thu`, `Fri`, `Sat`, `Sun`.
- Errors use FastAPI's format, `{"detail": "message"}`, with a 4xx or 5xx status. The frontend shows `detail` to the user.
- `course_id` is the TUMonline course ID as a string, such as `"950945730"`. The module code, such as `IN2361`, is in `module_code`.
- The degree is a key from the TUMonline importer, such as `master-informatics`.

## Endpoints

| Function | Method and path | Request | Response |
|---|---|---|---|
| `listCourses` | `GET /api/courses?semester=WS2026&degree_id=master-informatics` | | `CourseSummary[]` |
| `getCourse` | `GET /api/courses/{course_id}` | | `CourseDetail` |
| `getRecommendations` | `POST /api/recommendations` | `{ "profile": ProfilePayload }` | `RecommendationResponse` |
| `getCourseMatch` | `POST /api/courses/{course_id}/match` | `{ "profile": ProfilePayload }` | `Recommendation` |
| `getProfileInsights` | `POST /api/profile/insights` | `{ "profile": ProfilePayload }` | `ProfileInsights` |
| `uploadDocument` | `POST /api/profile/documents` | multipart: `file` (PDF) | `ParsedDocument` |
| `submitReview` | `POST /api/courses/{course_id}/reviews` | `ReviewIn` | `Review` |
| `uploadGradeDistribution` | `POST /api/courses/{course_id}/grade-distributions/uploads` | multipart: `file` (PNG/JPG/WEBP), `semester`, `exam_type` | `GradeUpload` |

`getProfileInsights` is called each time the student pauses typing, after about 400 ms, so it should respond quickly.

## Shapes

### CourseSummary

```json
{
  "course_id": "950945730",
  "module_code": "IN2361",
  "course_name": "Natural Language Processing",
  "ects": 6,
  "course_type": "Lecture + exercise",
  "language": "English",
  "assessment_type": "Written exam (90 min)",
  "exam_style": "written",
  "workload_hours_per_week": 9,
  "module_description": "…",
  "topics": ["nlp", "transformers"],
  "degree_groups": ["Machine Learning and Analytics"],
  "offering": {
    "schedule": [{ "day": "Mon", "start": "10:00", "end": "12:00" }],
    "room": "MI HS 1",
    "lecturer": "…"
  },
  "grade_summary": GradeSummary,
  "rating": { "average": 4.3, "count": 112 },
  "review_summary": { "positive": "…", "negative": "…", "oneLiner": "…" }
}
```

- `exam_style` is one of `written`, `oral`, `project` or `seminar`.
- Any field except `course_id`, `course_name`, `offering`, `grade_summary` and `rating` can be `null`. With the current data, `ects` and `exam_style` are often missing.
- `exam_style` is read from TUMonline's free-text examination method.
- `workload_hours_per_week` is estimated from the ECTS (30 hours per ECTS over 14 weeks) until reviews report hours.
- `offering.schedule` is empty, because lecture times aren't imported from TUMonline yet. The plan page then can't check clashes for that course.
- `topics` and `degree_groups` are empty lists for now.
- `rating.average` is `null` when there are no ratings.
- `review_summary` is the LLM summary of the reviews. It can be `null`, and `oneLiner` is optional.

### GradeSummary

These numbers combine the end-term exams in the `tum_info_grade_distribution_bands` view, linked to the course by module code through `tum_info_candidate_course_matches` and `course_tum_info_matches`. Matches marked as rejected are left out. Retakes are left out so students aren't counted twice.

```json
{
  "bands": { "very_good": 80, "good": 87, "satisfactory": 26, "sufficient": 5, "failed": 15 },
  "total_students": 213,
  "semester_count": 4,
  "average_grade": 2.04,
  "pass_rate": 0.93
}
```

`average_grade` and `pass_rate` are `null` when there is no data. `pass_rate` is a value from 0 to 1.

### CourseDetail

A `CourseSummary` with these extra fields:

```json
{
  "prerequisites": [{ "name": "Linear algebra", "recommended_only": false }],
  "prerequisites_text": "Linear algebra and probability theory.",
  "team_size": "3 to 4 students",
  "applications_close": "2026-10-19",
  "weekly_workload": [9, 10, 8, …],
  "distributions": [{ "semester": "WS2024", "year": 2024, "exam_type": "endterm", "grade_counts": { "1.0": 12, "1.3": 20 }, "grade5x": 25 }],
  "reviews": [Review]
}
```

- `prerequisites` is a structured list. The backend returns `[]` for now and puts TUMonline's free text in `prerequisites_text`, which the course page shows instead.
- `team_size`, `applications_close` and `weekly_workload` may be `null`.
- `weekly_workload` is the average number of hours students report for each lecture week.

### ProfilePayload

The frontend sends this. It is built in [`payload.js`](../frontend/src/api/payload.js).

```json
{
  "interest_text": "I want to go deeper into NLP …",
  "target_ects": 24,
  "max_hours_per_week": 35,
  "language_pref": "any",
  "completed_courses": [{ "module_id": "MA0911", "name": "Probability and Statistics", "ects": 6, "grade": 1.3, "semester": "WS2022", "course_type": "Lecture + exercise", "exam_style": "written" }],
  "skills": ["Python", "SQL"],
  "commitments": [{ "label": "Part-time job", "day": "Fri", "start": "09:00", "end": "17:00" }]
}
```

`language_pref` is `any` or `english`. `max_hours_per_week` and `grade` may be `null`. `commitments` are the student's fixed weekly slots: the recommender should rank courses that clash with them lower and add a caution.

### RecommendationResponse and Recommendation

```json
{
  "total_offered": 214,
  "passed_constraints": 31,
  "summary": "Ranked for your interest in NLP, …",
  "results": [Recommendation],
  "combination": {
    "title": "LLMs in Practice + NLP + Probabilistic Models for Language",
    "course_ids": ["IN2106-LLM", "IN2361", "IN2107-PML"],
    "ects": 21,
    "target_ects": 24,
    "hours_per_week": 29,
    "clashes": 0,
    "note": "3 ECTS under your target and only one heavy course, …"
  }
}
```

`results` are sorted best match first.

```json
{
  "course": CourseSummary,
  "match": 91,
  "reasons": [{ "title": "It covers what you asked for", "short": "One sentence for the card", "text": "Full explanation", "sources": ["your interests", "module description"] }],
  "cautions": [{ "level": "high", "title": "Written exam only", "text": "…" }],
  "prerequisites": [{ "name": "Linear algebra", "status": "weak", "detail": "Passed with 2.7; …" }],
  "blocked_by": ["Part-time job"]
}
```

- `match` is a percentage from 0 to 100.
- `level` is `high`, `medium` or `low`. Cautions are sorted high first.
- `status` is `met`, `weak`, `recommended` or `missing`.
- `blocked_by` lists the labels of commitments the course clashes with.

### ProfileInsights

This feeds the "What we understood so far" card.

```json
{
  "interests": ["large language models", "NLP"],
  "constraints": ["Prefers project work", "Limited weekly time"],
  "strong": ["Probability and Statistics", "Python"],
  "gaps": ["Linear Algebra grade: 2.7"],
  "learning_style": { "hands_on_average": 1.4, "written_average": 2.0, "prefers_hands_on": true }
}
```

`learning_style` is `null` when the transcript doesn't have enough grades.

### ParsedDocument

This is the result of reading a transcript or CV. The backend extracts the text with pdfplumber and lets Ollama read it ([transcript_reader.py](../src/course_compass/transcript_reader.py)).

```json
{
  "kind": "transcript",
  "modules": [{ "module_id": "MA0911", "name": "Probability and Statistics", "ects": 6, "grade": 1.3, "semester": "WS2022", "course_type": "Lecture + exercise", "exam_style": "written" }],
  "skills": [],
  "interests": ["statistics"]
}
```

- `kind` is `transcript` or `cv`. A CV usually returns `skills` and no `modules`.
- A module without a code gets a placeholder `module_id` such as `transcript-3`.
- `grade` is `null` for pass/fail results. `semester`, `course_type` and `exam_style` are `null`, because the reader doesn't extract them yet.
- `interests` lists what the reader picked up. The frontend doesn't use it yet.

### Reviews

`ReviewIn`:

```json
{ "rating": 4, "workload_hours": 10, "semester": "WS2025", "review_text": "…" }
```

- `rating` is a whole number from 1 to 5.
- `workload_hours` may be `null`.
- `review_text` has at least 20 characters.

`Review` is the saved `ReviewIn` plus `review_id`, `course_id` and `created_at` (`YYYY-MM-DD`).

`reviews` has `rating`, `workload_hours` and `semester` columns for this, added by [schema.sql](../src/course_compass/schema.sql). Run `python -m course_compass.setup_db` once to add them to an existing database.

### GradeUpload

Students upload a screenshot of the official grade statistics instead of typing the numbers in. The backend stores the image in `grade_distribution_uploads` and responds immediately. Reading the counts and adding them to `tum_info_grade_distributions` and `tum_info_grade_counts` can happen later, after a check.

```json
{ "upload_id": 17, "course_id": "950945730", "file_name": "stats.png", "semester": "WS2025", "exam_type": "endterm", "status": "pending", "created_at": "2026-11-19T10:00:00Z" }
```

`status` is `pending`, `accepted` or `rejected`.
