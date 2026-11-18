# Frontend API contract

The React frontend talks to the backend only through [`frontend/src/api/client.js`](../frontend/src/api/client.js). This page lists every endpoint it calls and the JSON it expects. The FastAPI routes should match it, so the frontend works without changes.

- **Routes:** [`frontend/src/api/endpoints.js`](../frontend/src/api/endpoints.js)
- **HTTP calls:** [`frontend/src/api/http.js`](../frontend/src/api/http.js)
- **Reference implementation:** [`frontend/src/demo/mockApi.js`](../frontend/src/demo/mockApi.js) returns exactly these shapes from demo fixtures. When in doubt, compare against it.

## Conventions

- All routes are served under `/api`. In development, Vite forwards `/api/*` to `http://localhost:8000`. Set `API_PROXY_TARGET` to use another address, or `VITE_API_URL` to call a backend directly, which then needs CORS.
- JSON fields use `snake_case`, matching [schema.sql](../src/course_compass/schema.sql).
- Semesters use the database codes: `WS2026` is the winter semester 2026/27 and `SS2025` is the summer semester 2025.
- Times are `HH:MM` strings. Days are `Mon`, `Tue`, `Wed`, `Thu`, `Fri`, `Sat`, `Sun`.
- Errors use FastAPI's format, `{"detail": "message"}`, with a 4xx status. The frontend shows `detail` to the user.

## Endpoints

| Function | Method and path | Request | Response |
|---|---|---|---|
| `listCourses` | `GET /api/courses?semester=WS2026&degree_id=MSC-INF` | | `CourseSummary[]` |
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
  "course_id": "IN2361",
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
- `offering` comes from the current row in `course_offerings`. `schedule` is a structured form of its `schedule` column.
- `rating.average` is `null` when there are no ratings.
- `review_summary` is the LLM summary of the reviews. It can be `null`, and `oneLiner` is optional.

### GradeSummary

These numbers combine all rows of the `grade_distribution_bands` view for the course.

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
  "team_size": "3 to 4 students",
  "applications_close": "2026-10-19",
  "weekly_workload": [9, 10, 8, …],
  "distributions": [{ "semester": "WS2024", "year": 2024, "exam_type": "endterm", "grade_counts": { "1.0": 12, "1.3": 20 }, "grade5x": 25 }],
  "reviews": [Review]
}
```

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

This is the result of reading a transcript or CV with PyMuPDF.

```json
{
  "kind": "transcript",
  "modules": [{ "module_id": "MA0911", "name": "Probability and Statistics", "ects": 6, "grade": 1.3, "semester": "WS2022", "course_type": "Lecture + exercise", "exam_style": "written" }],
  "skills": []
}
```

`kind` is `transcript` or `cv`. A CV usually returns `skills` and no `modules`.

### Reviews

`ReviewIn`:

```json
{ "rating": 4, "workload_hours": 10, "semester": "WS2025", "review_text": "…" }
```

- `rating` is a whole number from 1 to 5.
- `workload_hours` may be `null`.
- `review_text` has at least 20 characters.

`Review` is the saved `ReviewIn` plus `review_id`, `course_id` and `created_at` (`YYYY-MM-DD`).

The current `reviews` table only has `review_text`. It needs `rating`, `workload_hours` and `semester` columns.

### GradeUpload

Students upload a screenshot of the official grade statistics instead of typing the numbers in. The backend stores the image and responds immediately. Reading the counts and adding them to `grade_distributions` and `grade_counts` can happen later, after a check.

```json
{ "upload_id": 17, "course_id": "IN2361", "file_name": "stats.png", "semester": "WS2025", "exam_type": "endterm", "status": "pending", "created_at": "2026-11-19T10:00:00Z" }
```

`status` is `pending`, `accepted` or `rejected`.
