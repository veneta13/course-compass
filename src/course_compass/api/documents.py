"""Reads an uploaded transcript or CV with the transcript reader and returns a
ParsedDocument (docs/frontend-api.md)."""
from __future__ import annotations

import re

from fastapi import HTTPException


def _number(value):
    """'1,3' -> 1.3, '6 ECTS' -> 6.0, anything else -> None."""
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        match = re.search(r"\d+(?:[.,]\d+)?", value)
        if match:
            return float(match.group(0).replace(",", "."))
    return None


def _grade(value):
    grade = _number(value)
    return grade if grade is not None and 1.0 <= grade <= 5.0 else None


def to_parsed_document(doc_type: str, extracted: dict) -> dict:
    """Maps the reader's JSON (see transcript_reader.build_prompt) to ParsedDocument."""
    if "error" in extracted:
        raise HTTPException(502, "The document reader returned something we couldn't read. Please try again.")
    if doc_type == "cv":
        skills = [s for s in extracted.get("skills") or [] if isinstance(s, str) and s.strip()]
        return {"kind": "cv", "modules": [], "skills": skills, "interests": extracted.get("interests") or []}
    modules = []
    for i, course in enumerate(extracted.get("courses") or []):
        if not isinstance(course, dict) or not course.get("name"):
            continue
        modules.append({
            "module_id": course.get("code") or f"transcript-{i + 1}",
            "name": course["name"],
            "ects": _number(course.get("credits")) or 0,
            "grade": _grade(course.get("grade")),
            "semester": None,
            "course_type": None,
            "exam_style": None,
        })
    return {"kind": "transcript", "modules": modules, "skills": [], "interests": extracted.get("inferred_interests") or []}


def read_document(content: bytes) -> dict:
    """Runs the transcript reader (PDF text + Ollama). Blocking; call it in a thread."""
    try:
        from .. import transcript_reader as reader
    except ImportError as e:  # pdfplumber or ollama not installed
        raise HTTPException(503, f"Document reading isn't set up on the server ({e.name} is missing).") from e

    text = reader.extract_text_from_pdf(content)
    if not text:
        raise HTTPException(400, "We couldn't find any text in this PDF. Is it a scanned image?")
    doc_type = reader.detect_doc_type(text)
    truncated = text[:14000]
    raw = reader.call_ollama(reader.build_prompt(truncated, doc_type))
    return to_parsed_document(doc_type, reader.parse_json_from_response(raw))
