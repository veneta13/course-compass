"""Offline enrichment with Ollama: embeddings and course categories.

Run after `build`. Items whose texts haven't changed since the last run are
skipped, so a stopped run can simply be started again.
"""
from __future__ import annotations

import json
import re
import time
from typing import Callable, Literal

from pydantic import BaseModel, Field, ValidationError

from .llm import OllamaLLM
from .models import is_placeholder_topic

Level = Literal["low", "medium", "high", "unknown"]


class CourseAttributes(BaseModel):
    # No "project_based" question: the model answered "yes" for most courses,
    # so it comes from the TUMonline course type instead (Item.is_project_course).
    assessment: Literal["written_exam", "oral_exam", "project", "mixed", "unknown"]
    math_level: Level
    programming_level: Level
    prerequisites: list[str] = Field(
        default_factory=list,
        description="Up to 6 short topics (2 to 5 words) students should know beforehand, in English")


SYSTEM_PROMPT = """You classify a university course from its description. Answer only from the text. Use "unknown" when the text doesn't say; never guess.

assessment: how the course is graded. written_exam, oral_exam, project (project work, report, presentation or seminar paper), mixed, or unknown. Use mixed only if the text names at least two different graded parts, such as a written exam and a project. If the text doesn't say how the course is graded, use unknown.
math_level, programming_level: how much math or programming the course needs: low, medium, high, or unknown.
prerequisites: up to 6 short topics (2 to 5 words) that students should know before the course, such as "linear algebra" or "Python programming". Translate them to English. Use [] if none are named."""

SELECT_SQL = """
    SELECT item_id, title, course_type, description, prerequisites_text, teaching_text, text_hash
    FROM rec_items i
    WHERE ($1 OR {hash_column} IS DISTINCT FROM text_hash)
      AND ($2::text IS NULL OR EXISTS (
            SELECT 1 FROM rec_item_degrees d WHERE d.item_id = i.item_id AND d.degree = $2))
    ORDER BY item_id
    LIMIT $3
"""


def embedding_text(row) -> str:
    return f"{row['title']}\n\n{row['description'] or row['course_type']}"[:6000]


def attributes_prompt(row) -> str:
    """Title, type and the start of each text. Shorter prompts make the local model much faster."""
    parts = [f"Title: {row['title']}", f"Type: {row['course_type']}"]
    for label, key, limit in (("Description", "description", 2000),
                              ("Teaching and assessment", "teaching_text", 800),
                              ("Previous knowledge", "prerequisites_text", 800)):
        if row[key]:
            parts.append(f"{label}:\n{row[key][:limit]}")
    return "\n\n".join(parts)


def clean_topics(topics: list[str]) -> list[str]:
    """Drop empty or placeholder entries such as '[ ]' or 'unknown', keep at most 6."""
    cleaned = [t.strip() for t in topics
               if re.search(r"[A-Za-zÄÖÜäöü]{3}", t or "") and not is_placeholder_topic(t)]
    return list(dict.fromkeys(cleaned))[:6]


async def enrich(conn, llm: OllamaLLM, *, degree: str | None = None, limit: int | None = None,
                 force: bool = False, attributes: bool = True,
                 progress: Callable[[str], None] = print) -> dict:
    """Embed every item and, unless attributes=False, let the LLM categorize it."""
    summary = {"embedded": 0, "categorized": 0, "failed": 0}

    rows = await conn.fetch(SELECT_SQL.format(hash_column="embedding_hash"), force, degree, limit)
    for start in range(0, len(rows), 16):
        batch = rows[start:start + 16]
        vectors = llm.embed([embedding_text(r) for r in batch])
        await conn.executemany(
            "UPDATE rec_items SET embedding = $2, embedding_hash = $3 WHERE item_id = $1",
            [(r["item_id"], v.tolist(), r["text_hash"]) for r, v in zip(batch, vectors)])
        summary["embedded"] += len(batch)
        progress(f"Embedded {summary['embedded']} of {len(rows)} items")

    if not attributes:
        return summary

    # First categorize everything with the chat model, then embed all
    # prerequisite topics in one go. Switching models after every course
    # makes Ollama reload them, which is very slow on machines with 8 GB RAM.
    rows = await conn.fetch(SELECT_SQL.format(hash_column="attributes_hash"), force, degree, limit)
    started = time.monotonic()
    for n, row in enumerate(rows, start=1):
        try:
            attrs = llm.extract(SYSTEM_PROMPT, attributes_prompt(row), CourseAttributes)
        except ValidationError:
            summary["failed"] += 1
            continue
        attrs.prerequisites = clean_topics(attrs.prerequisites)
        await conn.execute(
            "UPDATE rec_items SET attributes = $2::jsonb, prereq_embeddings = NULL, attributes_hash = $3 "
            "WHERE item_id = $1",
            row["item_id"], json.dumps(attrs.model_dump()), row["text_hash"])
        summary["categorized"] += 1
        if n % 10 == 0 or n == len(rows):
            elapsed = time.monotonic() - started
            remaining = elapsed / n * (len(rows) - n)
            progress(f"Categorized {n} of {len(rows)} items (about {remaining / 60:.0f} min left)")

    summary["prerequisites_embedded"] = await embed_prerequisites(conn, llm, progress)
    return summary


PREREQUISITES_SQL = """
    SELECT item_id, attributes->'prerequisites' AS topics
    FROM rec_items
    WHERE prereq_embeddings IS NULL
      AND jsonb_array_length(COALESCE(attributes->'prerequisites', '[]'::jsonb)) > 0
"""


async def embed_prerequisites(conn, llm: OllamaLLM, progress: Callable[[str], None] = print) -> int:
    """Embed the prerequisite topics of every categorized item that doesn't have them yet."""
    rows = await conn.fetch(PREREQUISITES_SQL)
    if not rows:
        return 0
    topics = [json.loads(r["topics"]) for r in rows]
    vectors = llm.embed([t for item_topics in topics for t in item_topics])
    updates, position = [], 0
    for row, item_topics in zip(rows, topics):
        updates.append((row["item_id"], vectors[position:position + len(item_topics)].tolist()))
        position += len(item_topics)
    await conn.executemany("UPDATE rec_items SET prereq_embeddings = $2 WHERE item_id = $1", updates)
    progress(f"Embedded the prerequisite topics of {len(rows)} items")
    return len(rows)
