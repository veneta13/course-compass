#!/usr/bin/env python3
"""
Local Transcript & CV Reader using Ollama + FastAPI
Run with: uvicorn src.course_compass.transcript_reader:app --reload
(or adjust the path to match your project structure)
"""

import io
import json
import re
from typing import Optional

import ollama
import pdfplumber
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.responses import HTMLResponse, JSONResponse
from pydantic import BaseModel

app = FastAPI(title="Transcript & CV Reader", version="1.1")

MODEL = "llama3.1:8b"  # change if needed


class ExtractionResult(BaseModel):
    document_type: str
    raw_text_preview: str
    extracted: dict


def extract_text_from_pdf(file_bytes: bytes) -> str:
    text_parts = []
    with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
        for page in pdf.pages:
            page_text = page.extract_text()
            if page_text:
                text_parts.append(page_text)
    return "\n".join(text_parts).strip()


def detect_doc_type(text: str) -> str:
    """Simple heuristic to guess if the document is a CV or a transcript."""
    text_lower = text.lower()
    cv_keywords = ["professional summary", "work experience", "skills", "linkedin", "github", "curriculum vitae", "resume"]
    transcript_keywords = ["transcript", "grade", "credits", "gpa", "semester", "course code", "ects"]

    cv_score = sum(1 for kw in cv_keywords if kw in text_lower)
    tr_score = sum(1 for kw in transcript_keywords if kw in text_lower)

    return "cv" if cv_score >= tr_score else "transcript"


def build_prompt(text: str, doc_type: str) -> str:
    return f"""You are an expert at reading academic transcripts and CVs.
Return ONLY valid JSON (no markdown, no explanations).

Document type: {doc_type}

Extract the following fields. Use null or empty lists when information is missing.

For a CV:
{{
  "document_type": "cv",
  "personal_info": {{
    "name": null,
    "email": null,
    "phone": null,
    "linkedin": null,
    "github": null,
    "location": null
  }},
  "education": [
    {{
      "university": null,
      "degree": null,
      "period": null
    }}
  ],
  "work_experience": [
    {{
      "company": null,
      "position": null,
      "period": null,
      "description": null
    }}
  ],
  "skills": [],
  "interests": []
}}

For a transcript:
{{
  "document_type": "transcript",
  "university": null,
  "degree": null,
  "period": null,
  "courses": [
    {{
      "name": null,
      "code": null,
      "grade": null,
      "credits": null
    }}
  ],
  "overall_gpa": null,
  "inferred_interests": []
}}

Document text:
{text}
"""


def call_ollama(prompt: str) -> str:
    try:
        response = ollama.chat(
            model=MODEL,
            messages=[{"role": "user", "content": prompt}],
            options={"temperature": 0.1},
        )
        return response["message"]["content"]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ollama error: {str(e)}")


def parse_json_from_response(text: str) -> dict:
    """Try to extract a JSON object from the model output."""
    # Remove markdown code fences if present
    text = re.sub(r"```(?:json)?\s*", "", text)
    text = re.sub(r"```", "", text).strip()

    # Find the first { ... } block
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(0))
        except json.JSONDecodeError:
            pass
    # Fallback
    return {"raw_output": text, "error": "Could not parse JSON"}


@app.get("/", response_class=HTMLResponse)
def upload_page():
    return """
    <!DOCTYPE html>
    <html>
    <head>
        <title>Transcript & CV Reader</title>
        <style>
            body { font-family: system-ui, sans-serif; max-width: 800px; margin: 40px auto; padding: 20px; }
            h1 { color: #333; }
            input, button { margin: 10px 0; padding: 8px; font-size: 16px; }
            button { background: #0066cc; color: white; border: none; cursor: pointer; }
            #result { white-space: pre-wrap; background: #f5f5f5; padding: 15px; border-radius: 6px; margin-top: 20px; }
        </style>
    </head>
    <body>
        <h1>Transcript & CV Reader</h1>
        <p>Upload a PDF. The system will auto-detect whether it is a transcript or a CV.</p>
        <form id="form">
            <input type="file" id="file" accept=".pdf" required><br>
            <label>
                <input type="checkbox" id="forceCv"> Force as CV
            </label><br>
            <button type="submit">Extract</button>
        </form>
        <div id="result"></div>

        <script>
            document.getElementById("form").onsubmit = async (e) => {
                e.preventDefault();
                const file = document.getElementById("file").files[0];
                const forceCv = document.getElementById("forceCv").checked;
                const formData = new FormData();
                formData.append("file", file);

                const url = forceCv ? "/extract?doc_type=cv" : "/extract";
                document.getElementById("result").textContent = "Processing...";

                const resp = await fetch(url, { method: "POST", body: formData });
                const data = await resp.json();
                document.getElementById("result").textContent = JSON.stringify(data, null, 2);
            };
        </script>
    </body>
    </html>
    """


@app.post("/extract", response_model=ExtractionResult)
async def extract_document(
        file: UploadFile = File(...),
        doc_type: Optional[str] = None,  # optional override
):
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty file")

    text = extract_text_from_pdf(content)
    if not text:
        raise HTTPException(status_code=400, detail="Could not extract any text from the PDF")

    # Auto-detect if not forced
    detected = doc_type or detect_doc_type(text)

    max_chars = 14000
    truncated = text[:max_chars]
    if len(text) > max_chars:
        truncated += "\n\n[... document truncated ...]"

    prompt = build_prompt(truncated, detected)
    raw_response = call_ollama(prompt)
    parsed = parse_json_from_response(raw_response)

    return ExtractionResult(
        document_type=detected,
        raw_text_preview=truncated[:400] + ("..." if len(truncated) > 400 else ""),
        extracted=parsed,
    )


@app.get("/health")
def health():
    return {"status": "ok", "model": MODEL}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)