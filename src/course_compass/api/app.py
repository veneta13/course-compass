"""The backend the React frontend talks to. Routes and JSON shapes follow
docs/frontend-api.md.

Run it from the project root:

    uvicorn course_compass.api.app:app --reload --port 8000

The frontend dev server (npm run dev) forwards /api/* to port 8000.
"""
from __future__ import annotations

from contextlib import asynccontextmanager
from typing import Literal

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, Field

from .. import database
from . import queries, shapes
from .documents import read_document
from .semesters import term_id

MAX_PDF_BYTES = 10 * 1024 * 1024
MAX_IMAGE_BYTES = 5 * 1024 * 1024
IMAGE_TYPES = {"image/png", "image/jpeg", "image/webp"}


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.pool = await database.init_db_pool(min_size=1, max_size=10)
    yield
    await database.close_db_pool()


app = FastAPI(title="Course Compass API", version="0.1", lifespan=lifespan)


def pool(request: Request):
    return request.app.state.pool


def parse_course_id(course_id: str) -> int:
    if not course_id.isdecimal():
        raise HTTPException(404, "Course not found.")
    return int(course_id)


async def summaries(db, rows) -> list[dict]:
    """CourseSummary for each catalog row, with grade stats and ratings."""
    ids = [r["course_id"] for r in rows]
    grades = {r["course_id"]: r for r in await db.fetch(queries.GRADE_SUMMARY_SQL, ids)}
    ratings = {r["course_id"]: r for r in await db.fetch(queries.RATINGS_SQL, ids)}
    return [shapes.course_summary(r, grades.get(r["course_id"]), ratings.get(r["course_id"])) for r in rows]


# --------------------------------------------------------------------------
# Courses
# --------------------------------------------------------------------------

@app.get("/api/health")
async def health(request: Request):
    await pool(request).fetchval("SELECT 1")
    return {"status": "ok"}


@app.get("/api/courses")
async def list_courses(request: Request, semester: str, degree_id: str):
    try:
        term = term_id(semester)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    db = pool(request)
    rows = await db.fetch(queries.COURSES_SQL, term, degree_id)
    return await summaries(db, rows)


@app.get("/api/courses/{course_id}")
async def get_course(request: Request, course_id: str):
    cid = parse_course_id(course_id)
    db = pool(request)
    row = await db.fetchrow(queries.COURSE_SQL, cid)
    if row is None:
        raise HTTPException(404, "Course not found.")
    [summary] = await summaries(db, [row])
    distributions = await db.fetch(queries.DISTRIBUTIONS_SQL, cid)
    reviews = await db.fetch(queries.REVIEWS_SQL, cid)
    return {
        **summary,
        # Prerequisites are free text in TUMonline; there's no structured list yet.
        "prerequisites": [],
        "prerequisites_text": row["prerequisites_en"],
        "team_size": None,
        "applications_close": None,
        "weekly_workload": None,
        "distributions": [
            {"semester": d["semester"], "year": d["year"], "exam_type": d["exam_type"],
             "grade_counts": _json(d["grade_counts"]), "grade5x": d["grade5x"]}
            for d in distributions
        ],
        "reviews": [shapes.review(r) for r in reviews],
    }


def _json(value):
    """asyncpg returns JSONB as a string unless a codec is registered."""
    import json
    return json.loads(value) if isinstance(value, str) else value


# --------------------------------------------------------------------------
# Contributions
# --------------------------------------------------------------------------

SemesterCode = Field(pattern=r"^(WS|SS)\d{4}$")


class ReviewIn(BaseModel):
    rating: int = Field(ge=1, le=5)
    workload_hours: float | None = Field(default=None, ge=0, le=80)
    semester: str | None = SemesterCode
    review_text: str = Field(min_length=20, max_length=5000)


@app.post("/api/courses/{course_id}/reviews", status_code=201)
async def submit_review(request: Request, course_id: str, review: ReviewIn):
    cid = parse_course_id(course_id)
    db = pool(request)
    if await db.fetchval("SELECT 1 FROM courses WHERE course_id = $1", cid) is None:
        raise HTTPException(404, "Course not found.")
    row = await db.fetchrow(queries.INSERT_REVIEW_SQL, cid, review.rating, review.workload_hours,
                            review.semester, review.review_text.strip())
    return shapes.review(row)


@app.post("/api/courses/{course_id}/grade-distributions/uploads", status_code=201)
async def upload_grade_distribution(
    request: Request,
    course_id: str,
    file: UploadFile = File(...),
    semester: str = Form(..., pattern=r"^(WS|SS)\d{4}$"),
    exam_type: Literal["endterm", "retake"] = Form(...),
):
    cid = parse_course_id(course_id)
    if file.content_type not in IMAGE_TYPES:
        raise HTTPException(422, "Please upload a PNG, JPG or WEBP image.")
    content = await file.read()
    if not content:
        raise HTTPException(422, "The file is empty.")
    if len(content) > MAX_IMAGE_BYTES:
        raise HTTPException(413, "The image is larger than 5 MB.")
    db = pool(request)
    if await db.fetchval("SELECT 1 FROM courses WHERE course_id = $1", cid) is None:
        raise HTTPException(404, "Course not found.")
    row = await db.fetchrow(queries.INSERT_GRADE_UPLOAD_SQL, cid, semester, exam_type,
                            file.filename, file.content_type, content)
    return {**dict(row), "course_id": str(row["course_id"]), "created_at": row["created_at"].isoformat()}


# --------------------------------------------------------------------------
# Profile
# --------------------------------------------------------------------------

@app.post("/api/profile/documents")
async def upload_document(file: UploadFile = File(...)):
    if not (file.filename or "").lower().endswith(".pdf"):
        raise HTTPException(422, "Only PDF files are supported.")
    content = await file.read()
    if not content:
        raise HTTPException(422, "The file is empty.")
    if len(content) > MAX_PDF_BYTES:
        raise HTTPException(413, "The file is larger than 10 MB.")
    # The reader calls Ollama synchronously, so keep it off the event loop.
    return await run_in_threadpool(read_document, content)


# --------------------------------------------------------------------------
# Recommender (not merged yet)
# --------------------------------------------------------------------------

NOT_CONNECTED = "Recommendations aren't available yet: the recommender isn't connected to this server."


@app.post("/api/recommendations")
async def recommendations():
    raise HTTPException(501, NOT_CONNECTED)


@app.post("/api/courses/{course_id}/match")
async def course_match(course_id: str):
    raise HTTPException(501, NOT_CONNECTED)


@app.post("/api/profile/insights")
async def profile_insights():
    raise HTTPException(501, NOT_CONNECTED)
