# TUMonline public course importer — PostgreSQL, selectable course count

## What it does

Every time you run `python3 tumonline_scrape.py`, it:

1. Prompts for a positive **semester ID** (e.g., `207` for winter 2026/27).
2. Prompts for a **maximum number of courses**. Enter `3000` to fetch the first 3,000 courses as returned by the API, or press Enter on a blank line to fetch all available courses.
3. Retrieves up to the selected count from the public TUMonline course listing using pagination (`$top`/`$skip`). It never fetches more course records than requested. It then fetches each selected course's available detail/description, curriculum positions, and teaching-group information.
4. Inserts/updates PostgreSQL records (including original JSONB responses), logs any failed resources, prints a summary, and exits.

No browser, login, Playwright, SQLite, CSV or CLI modes are needed. The script uses the `DATABASE_URL` environment variable.

The subset follows **the current API listing order**, which can change between runs. If you request more than the semester actually contains, the scraper imports only the available courses. If the chosen number is not a multiple of 100, the final listing request uses the exact remaining count (for example, 205 = 100 + 100 + 5).

**Existing records are not deleted.** A run capped at 3,000 inserts or refreshes up to 3,000 courses; if your database already contains 6,523 records from a previous full scrape, those other records remain stored. Successfully fetched details from earlier runs are skipped.

## Setup and running

```bash
python3 -m pip install -r requirements.txt
export DATABASE_URL="postgresql://tum_scraper@localhost:5432/tumonline"
# Supply the database password through PGPASSWORD or ~/.pgpass.
python3 tumonline_scrape.py
```

Example terminal interaction:

```text
Enter TUMonline semester ID: 207
How many courses to import? (Enter for all): 3000
```

To scrape an entire semester, press Enter at the second prompt.

## Query the results

```sql
SELECT COUNT(*) FROM courses WHERE semester_id = 207;
SELECT number, title, ects, content_en
FROM course_catalog WHERE semester_id = 207 LIMIT 20;
```

## Tests

Run the included offline tests with:

```bash
python3 -m unittest -v test_offline
```

The tests exercise prompt validation, partial-page limits, PostgreSQL insert behavior, resume behavior, and several failure modes against mocked database/API responses. The project was **not** run against live TUMonline and PostgreSQL services in this environment.

## Limitations

The publicly available course API does not necessarily include all official module-handbook descriptions and module-level ECTS. Curriculum placements are stored as JSONB, but they are not equivalent to a complete module handbook. API ordering is not guaranteed to be stable, and inaccessible detail resources are recorded as errors.
