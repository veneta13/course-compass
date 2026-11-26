# Course Compass

Course Compass keeps information about TUM courses in a PostgreSQL database: course details, degree programs, semester offerings, student reviews and exam grades.

## Getting started

You need Python 3.10 or newer and a running PostgreSQL server. The frontend also needs Node.js, and the recommender and the transcript reader need [Ollama](#recommender).

1. Create a virtual environment and install the project:

   ```
   python3 -m venv .venv
   source .venv/bin/activate
   pip install -e '.[dev]'
   ```

   `[dev]` adds pytest. Run the tests with `pytest`.

2. Copy `.env.example` to `.env` and set your database connection in `DATABASE_URL`.

3. Fill the database. Either restore the shared dump, or create the tables and import the data yourself.

   **Restore the dump (quickest).** `database_backups/tum_courses_with_grades.dump` contains the TUMonline courses of winter semester 2026/27 for ten degree programs, plus the TUM Info grade statistics. Restore it into a new, empty database:

   ```
   createdb course_compass
   pg_restore --no-owner --no-privileges -d course_compass database_backups/tum_courses_with_grades.dump
   ```

   If you already have a `course_compass` database from before 23 November, it has an older schema. Restore into a database with a new name instead, and use that name in `DATABASE_URL`.

   **Or create the tables and import yourself.**

   ```
   python -m course_compass.setup_db
   ```

   Then run the imports below. Running `setup_db` again is safe: it adds new tables and indexes and updates views, but doesn't change tables that already exist.

## Importing data

Run the imports after the setup steps above, from the repository root:

| Data | Command | Details |
|---|---|---|
| TUMonline courses | `python src/course_compass/tumonline_imports/tumonline_scrape.py courses --degree master-informatics --semester WS26/27` | [Docs](src/course_compass/tumonline_imports/README.md) |
| Grade distributions | `python -m course_compass.importers.grade_distributions` | [Docs](docs/grade-distributions.md) |

The TUMonline import reads `DATABASE_URL` only from the environment, not from `.env`, so run `export DATABASE_URL=...` first. After an import, update the recommender's data (see [Recommender](#recommender)).

## Frontend

The web user interface is built with React, Vite, and Tailwind CSS.

Install the dependencies once:

```bash
cd frontend
npm install
```

Then start it in one of two modes:

| Command | Data | Use it for |
|---|---|---|
| `npm run dev` | The FastAPI backend at `http://localhost:8000`, through the Vite proxy at `/api` | Real use and backend development |
| `npm run demo` | Invented courses and a sample student from `frontend/src/demo` | Presentations and UI work without a backend |

Demo mode shows a "Demo mode" banner and keeps its saved state separate from normal runs. A normal build doesn't include any demo data.

To create a production build, run `npm run build`, or `npm run build:demo` for a demo build.

Every request the frontend makes, with the JSON it expects, is listed in [Frontend API contract](docs/frontend-api.md).

## Project structure

```
docs/                   Documentation
frontend/               React + Vite + Tailwind CSS web interface
    src/api/            The only place that talks to the backend
    src/demo/           Demo fixtures and mock backend (npm run demo)
    src/pages/          One component per screen
src/course_compass/
    database.py         Database connection pool
    schema.sql          Tables, indexes and views
    setup_db.py         Creates the database and applies the schema
    importers/          One module per import
    recommender/        Ranks and explains courses for a student (see its README)
tests/                  pytest tests (run: pytest)
```

See [Database schema](docs/database-schema.md) for how the tables relate to each other.

## Recommender

The recommender ranks the courses of a degree for one student profile and explains each result. It uses two local models through Ollama.

1. Install Ollama and download the models (about 3 GB):

   ```bash
   brew install ollama && brew services start ollama     # macOS
   curl -fsSL https://ollama.com/install.sh | sh         # Linux
   ollama pull bge-m3
   ollama pull qwen2.5:3b
   ```

2. Load the recommender's prepared data. It belongs to the shared course dump from [Getting started](#getting-started):

   ```bash
   gunzip -c database_backups/recommender.sql.gz | psql -q -d course_compass > /dev/null
   ```

   After a new import, prepare the data yourself instead:

   ```bash
   python -m course_compass.recommender build                                # ~10 s, no Ollama needed
   python -m course_compass.recommender enrich --embeddings-only             # ~3 min
   python -m course_compass.recommender enrich --degree master-informatics   # ~75 min, can be stopped and resumed
   ```

3. Try it in the terminal:

   ```bash
   python -m course_compass.recommender try --degree master-informatics --interests "NLP and large language models"
   ```

How to call it from an endpoint, how the score works, which models to use on which machine, and what data it still waits for: [Recommender](src/course_compass/recommender/README.md).

# Transcript & CV Reader

Local API that extracts structured information from academic transcripts and CVs using Ollama.

## Setup

```bash
# 1. Install Ollama and pull a model
curl -fsSL https://ollama.com/install.sh | sh
ollama pull llama3.1:8b

# 2. Create virtual environment
python3 -m venv .venv
source .venv/bin/activate
pip install fastapi uvicorn python-multipart pdfplumber ollama

# 3. Run the API
uvicorn src.course_compass.transcript_reader:app --reload

#4 Open [127.0.0.1](http://127.0.0.1:8000/) to upload a PDF.
