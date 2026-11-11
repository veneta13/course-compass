# Course Compass

Course Compass keeps information about TUM courses in a PostgreSQL database: course details, degree programs, semester offerings, student reviews and exam grades.

## Getting started

You need Python 3.10 or newer and a running PostgreSQL server.

1. Create a virtual environment and install the project:

   ```
   python3 -m venv .venv
   source .venv/bin/activate
   pip install -e .
   ```

2. Copy `.env.example` to `.env` and set your database connection.

3. Create the database and its tables:

   ```
   python -m course_compass.setup_db
   ```

   You only need to do this once per database. Running it again is safe: it adds new tables and indexes and updates views, but doesn't change tables that already exist.

## Importing data

Each import has its own module in `src/course_compass/importers`. Run it after the setup steps above, from any folder:

| Data | Command | Details |
|---|---|---|
| Grade distributions | `python -m course_compass.importers.grade_distributions` | [Docs](docs/grade-distributions.md) |

## Frontend

The web user interface is built with React, Vite, and Tailwind CSS.

To run the frontend development server:

```bash
cd frontend
npm install
npm run dev
```

To create a production build:

```bash
cd frontend
npm run build
```

## Project structure

```
docs/                   Documentation
frontend/               React + Vite + Tailwind CSS web interface
src/course_compass/
    database.py         Database connection pool
    schema.sql          Tables, indexes and views
    setup_db.py         Creates the database and applies the schema
    importers/          One module per import
```

See [Database schema](docs/database-schema.md) for how the tables relate to each other.
