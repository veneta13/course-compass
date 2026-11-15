# TUMonline Course Importer

A Python scraper that retrieves publicly available course information from **TUMonline** and stores it directly in **PostgreSQL**. Courses can be selected by semester, degree program, curriculum version, and course type.

The importer stores course listings and, where available, detailed descriptions, curriculum placements, course groups, and degree associations. It **does not export CSV or JSON files**; the JSON returned by the API is stored in PostgreSQL `JSONB` columns.

This README describes the supplied version of `tumonline_scrape(3).py`. The commands below use the simpler filename `tumonline_scrape.py`; rename the file accordingly or replace the filename in each command with `"tumonline_scrape(3).py"`.

## Requirements

- **Python 3.10 or newer**
- **PostgreSQL**, installed and running (locally or on a reachable server)
- Python packages **`psycopg`** and **`requests`**
- Network access to the public TUMonline endpoints; no TUMonline login is used

Install Python dependencies:

```bash
python -m pip install "psycopg[binary]" requests
```

## 1. Set up PostgreSQL

The importer **creates the tables and view automatically**, but you must first create the PostgreSQL database and configure a connection.

### 1.1 Install/start PostgreSQL (Ubuntu/Debian example)

If PostgreSQL is not yet installed:

```bash
sudo apt update
sudo apt install postgresql postgresql-client
sudo systemctl enable --now postgresql
```

If PostgreSQL is already installed and running, skip this step. On other operating systems, use your normal PostgreSQL installation and administration tools.

### 1.2 Create a database user and a database

Open PostgreSQL as an administrator (Ubuntu/Debian):

```bash
sudo -u postgres psql
```

Inside `psql`, run the following commands, substituting a strong password:

```sql
CREATE USER tum_scraper WITH PASSWORD 'replace_with_a_strong_password';
CREATE DATABASE tum_courses OWNER tum_scraper;
```

Then exit:

```sql
\q
```

The examples throughout this README assume:

| Setting | Example |
| --- | --- |
| Host | `localhost` |
| Port | `5432` |
| Database | `tum_courses` |
| User | `tum_scraper` |
| Password | The password selected above |

If you already have a database and an account with permission to create tables and views, you can use those instead.

### 1.3 Configure `DATABASE_URL`

The script reads `DATABASE_URL` from its process environment:

```text
postgresql://USERNAME:PASSWORD@HOST:PORT/DATABASE
```

**Linux / macOS (Bash or Zsh):**

```bash
export DATABASE_URL="postgresql://tum_scraper:replace_with_a_strong_password@localhost:5432/tum_courses"
```

**Windows PowerShell:**

```powershell
$env:DATABASE_URL = "postgresql://tum_scraper:replace_with_a_strong_password@localhost:5432/tum_courses"
```

Replace the placeholder password. Special characters in URLs, such as `@`, `/`, `#`, `?` and `%`, must be percent-encoded within the password portion. `DATABASE_URL` is required for course imports, **not** for the `degrees` lookup command.

The commands above configure the environment variable only in the current terminal session. Set it again in new sessions or configure it securely in your shell/service environment. The script does **not** automatically read a `.env` file. Do not commit credentials to version control.

### 1.4 Verify the connection

On Linux/macOS:

```bash
psql "$DATABASE_URL" -c "SELECT current_database(), current_user;"
```

On PowerShell:

```powershell
psql $env:DATABASE_URL -c "SELECT current_database(), current_user;"
```

Expected example output:

```text
 current_database | current_user
------------------+-------------
 tum_courses      | tum_scraper
```

If you receive **`password authentication failed`**, check the password in `DATABASE_URL`. You can test the account with an interactive password prompt:

```bash
psql -h localhost -p 5432 -U tum_scraper -d tum_courses -W
```

If needed, as a PostgreSQL administrator you can reset the password using:

```sql
ALTER USER tum_scraper WITH PASSWORD 'your_new_password';
```

Update `DATABASE_URL` afterward.

## 2. Quick start

Import every available course for winter semester 2026/27:

```bash
python tumonline_scrape.py courses --semester WS26/27
```

Import courses associated with the Master's in Informatics for the same semester:

```bash
python tumonline_scrape.py courses --degree master-informatics --semester WS26/27
```

The importer connects to the database, creates any missing tables/view defined in its schema, fetches matching course listings, and saves additional resources where available. Progress messages and an import summary are printed in the terminal.

## 3. Command-line interface

The script supports **`degrees`** and **`courses`** subcommands. Running without a subcommand uses the original interactive importer.

### `degrees`: find curriculum version IDs

Search the public TUMonline curriculum directory by German or English degree name:

```bash
python tumonline_scrape.py degrees --search "Informatik"
```

Search a particular semester:

```bash
python tumonline_scrape.py degrees --search "Data Engineering" --semester WS26/27
```

List all curriculum versions returned for the default semester:

```bash
python tumonline_scrape.py degrees
```

| Argument | Meaning | Default |
| --- | --- | --- |
| `--search TEXT` | Case-insensitive substring in German or English curriculum name | Show all returned versions |
| `--semester SEMESTER` | Semester used to look up curricula | `WS26/27` |

The command prints curriculum IDs, German names, and validity dates. It **does not write to PostgreSQL**, and its results do not automatically change the hardcoded `DEGREES` dictionary.

### `courses`: import to PostgreSQL

```text
python tumonline_scrape.py courses --semester SEMESTER
    [--semester SEMESTER ...]
    [--degree DEGREE ...]
    [--curriculum ID ...]
    [--types TYPE1,TYPE2]
    [--limit NUMBER]
```

| Argument | Meaning |
| --- | --- |
| `--semester` | **Required.** Semester name or TUMonline term ID; repeat to import multiple semesters. |
| `--degree` | Predefined degree key from `DEGREES`; repeat to select multiple degrees. Each key expands to multiple curriculum-version IDs. |
| `--curriculum` | Exact numeric curriculum-version ID; repeat to include multiple versions. Can be combined with `--degree`. |
| `--types` | Comma-separated TUMonline course-type keys, for example `VO,VI`. If omitted, keep every type. |
| `--limit` | Maximum number of **distinct matching courses per semester** to store in this run. Must be a positive integer; omitted means no limit. |

If neither `--degree` nor `--curriculum` is supplied, the scraper queries the **whole selected semester** rather than filtering by curriculum.

**Examples**

Import multiple semesters:

```bash
python tumonline_scrape.py courses \
  --degree master-informatics \
  --semester WS26/27 \
  --semester SS26
```

Import multiple degrees:

```bash
python tumonline_scrape.py courses \
  --degree master-informatics \
  --degree master-dea \
  --semester WS26/27
```

Import by exact curriculum version ID:

```bash
python tumonline_scrape.py courses --curriculum 5217 --semester WS26/27
```

Import only specific course types:

```bash
python tumonline_scrape.py courses \
  --degree master-informatics \
  --semester WS26/27 \
  --types VO,VI
```

Import at most 300 distinct courses per semester:

```bash
python tumonline_scrape.py courses \
  --degree master-informatics \
  --semester WS26/27 \
  --limit 300
```

Import all types from an entire semester with a limit:

```bash
python tumonline_scrape.py courses --semester 207 --limit 3000
```

For curriculum-filtered runs, the script may continue scanning curriculum pages after the limit is reached so that it can record additional degree associations for the **selected** courses. `--limit` restricts stored distinct courses, not necessarily the total number of API listing requests.

### Run without arguments: interactive mode

```bash
python tumonline_scrape.py
```

The script prompts for:

```text
Enter TUMonline semester ID: 207
How many courses to import? (Enter for all): 3000
```

Press Enter at the second prompt to import all courses for that semester. Interactive mode uses a numeric term ID and **does not filter by degree**.

### Semester notation

The CLI accepts `WS26/27`, `SS26`, and numeric TUMonline term IDs such as `207`. The parser also accepts abbreviated formats such as `WS26`, `26W`, and `2026S`. Term IDs `201` and `202` are explicitly rejected by the `courses` parser.

## 4. Supported degree keys

The following predefined degree names are currently available through `--degree`:

| Degree key | Curriculum version IDs |
| --- | --- |
| `bachelor-informatics` | 5440, 5371, 4998, 4748, 4591, 4283, 1304 |
| `master-informatics` | 5217, 4731, 4594, 4271, 2612 |
| `master-dea` | 4733, 4567 |
| `master-information-systems` | 4997, 404, 4368, 4716, 4734, 4918, 5013 |
| `master-mathematics` | 5244, 4852, 4407 |
| `bachelor-information-systems` | 5441, 4999, 4750 |
| `bachelor-games-engineering` | 5218, 4749 |
| `master-games-engineering` | 5219, 4732 |
| `bachelor-bioinformatics` | 5028, 4638, 4359, 403 |
| `master-rci` | 5271, 5120, 4827 |
| `master-cse` | 5001, 4637, 4286, 4022 |

These mappings are hardcoded in the Python `DEGREES` dictionary, reflecting the version of the script documented here. Curriculum versions can change over time; use `degrees` to look up IDs and update the dictionary manually when necessary.

## 5. How degree categorization works

Each degree key maps to one or more curriculum versions (which can correspond to different study and examination regulations). The scraper queries each selected version independently, then **deduplicates courses by TUMonline `course_id`** within the semester import.

For each course returned by a known curriculum version, it stores a row in:

```text
course_degrees(course_id, degree)
```

This is a many-to-many association: one course may have multiple degrees, while its course listing is stored only once in `courses`. The `(course_id, degree)` primary key prevents duplicate associations.

**Important limitations in this script:**

- Degree associations are written only when a course is fetched through a **curriculum-filtered request** whose curriculum ID appears in the hardcoded `DEGREES` mapping. A direct `--curriculum` import using a known ID can therefore also populate `course_degrees`.
- A **full-semester import** (`courses --semester ...` without curriculum selection, or interactive mode) does **not** populate `course_degrees`. To categorize those courses, run the corresponding degree/curriculum-filtered imports.
- An arbitrary `--curriculum` ID **not** present in `DEGREES` still imports courses, but does not assign a named degree automatically.
- Repeated imports add valid associations but **do not remove old associations** when mappings change or a course is no longer returned. The script does not delete existing course records either.
- The database does not include a separate relational table recording each exact `curriculum_id` for each course; `course_degrees` records the named degree only. Raw curriculum-placement API data is preserved in `courses.curriculum_json` where retrieval succeeds.

## 6. PostgreSQL schema

The importer creates the following relations automatically when a `courses` import starts:

| Relation | Description |
| --- | --- |
| `semesters` | Semester IDs, labels, optional metadata, and minimal `raw_json`. |
| `courses` | One row per TUMonline course ID: title, credits, lecturers, languages, course type, semester, raw listing JSON, optional detail/curriculum/group JSON, and fetch timestamps. |
| `course_degrees` | Course-to-degree associations with composite primary key `(course_id, degree)`. |
| `course_texts` | Multilingual text extracted from course details, keyed by course ID, field name, and language. |
| `fetch_errors` | The most recently recorded error for each course/resource pair. |
| `course_catalog` | **View** combining basic course fields with selected English/German descriptions and prerequisite/objective text. |

`courses.semester_id` references `semesters.semester_id`; `course_degrees.course_id` and `course_texts.course_id` reference `courses.course_id`. Missing detail endpoints may leave their associated JSON fields and text values `NULL`.

The schema uses `CREATE TABLE IF NOT EXISTS` and `CREATE OR REPLACE VIEW`. It initializes missing relations but **does not automatically migrate or change existing table columns**.

## 7. Inspect the database and query courses

Connect using your configured URL:

```bash
psql "$DATABASE_URL"
```

Inside `psql`, show tables and views:

```sql
\dt
\dv
```

Count stored courses:

```sql
SELECT COUNT(*) FROM courses;
```

Preview course titles, ECTS, and objectives:

```sql
SELECT course_id, title_en, ects, objectives_en
FROM course_catalog
WHERE semester_id = 207
LIMIT 10;
```

### Find all courses in a degree

`course_catalog` does **not** have its own `degree` column. Join through `course_degrees`:

```sql
SELECT c.course_id, c.title_en, c.ects, c.lecturers
FROM course_catalog AS c
JOIN course_degrees AS cd ON cd.course_id = c.course_id
WHERE cd.degree = 'master-informatics'
  AND c.semester_id = 207
ORDER BY c.title_en;
```

### Count courses by degree and semester

```sql
SELECT cd.degree, c.semester_id, COUNT(*) AS course_count
FROM course_degrees AS cd
JOIN courses AS c ON c.course_id = cd.course_id
GROUP BY cd.degree, c.semester_id
ORDER BY cd.degree, c.semester_id;
```

### Find courses associated with multiple degrees

```sql
SELECT c.course_id, c.title_en,
       ARRAY_AGG(cd.degree ORDER BY cd.degree) AS degrees
FROM courses AS c
JOIN course_degrees AS cd ON cd.course_id = c.course_id
GROUP BY c.course_id, c.title_en
HAVING COUNT(DISTINCT cd.degree) > 1
ORDER BY c.title_en;
```

### Find courses with no recorded degree

```sql
SELECT c.course_id, c.title_en, c.semester_id
FROM courses AS c
LEFT JOIN course_degrees AS cd ON cd.course_id = c.course_id
WHERE cd.course_id IS NULL
ORDER BY c.semester_id, c.title_en;
```

This last query can include courses imported in full-semester mode, as well as courses whose curriculum IDs are not covered by `DEGREES`.

### Find nonempty English course objectives

```sql
SELECT title_en, objectives_en
FROM course_catalog
WHERE semester_id = 207
  AND objectives_en IS NOT NULL
  AND BTRIM(objectives_en) <> ''
LIMIT 10;
```

Exit `psql` with `\q`.

## 8. Scraping behavior and repeat runs

1. The importer requests course listings from `slc.tm.cp/student/courses`, using the specified semester and, when selected, curriculum-version filters. Course listings are retrieved in pages of up to 100.
2. Listings are deduplicated by course ID and **inserted or updated** in `courses`. Known degree relationships are inserted into `course_degrees` without duplicating them.
3. For each selected course, the importer attempts to retrieve **detail**, **curriculum positions**, and **course groups** from separate TUMonline endpoints.
4. Parsed multilingual descriptions are stored in `course_texts`; original API payloads are retained in `JSONB` columns. Fetch errors are recorded in `fetch_errors`.
5. A successful detail/curriculum/groups fetch sets a timestamp. Subsequent runs skip that resource when its timestamp is already present, instead of refreshing it automatically.

The HTTP client includes pacing (default minimum delay of **0.8 seconds** between its requests) and retries certain network/server errors. Endpoints that deny anonymous access may be skipped, so some detailed data can remain unavailable.

The script prints progress logs and a PostgreSQL import summary. `listings_retrieved` is the number of distinct selected course IDs in that run, not necessarily the total number already in the database. **Current-code caveat:** `api_reported_listings` in the printed summary reflects the `totalCount` variable from the final processed curriculum query, not the sum across all curricula. With multiple curricula, do not interpret it as the combined unique total.

## 9. Troubleshooting

| Problem | What to check |
| --- | --- |
| `DATABASE_URL is not set` | Export/set the variable in the terminal that runs Python. |
| `password authentication failed` | Confirm the PostgreSQL username/password. Test with `psql -h localhost -U tum_scraper -d tum_courses -W`; reset the role password if necessary. |
| `connection refused` | PostgreSQL is running and listening at the specified host and port. |
| `database ... does not exist` | Create the database using `CREATE DATABASE` or correct the database name in the URL. |
| `permission denied for schema public` | Grant the importing role appropriate schema/table creation permissions, or use a database it owns. |
| No matching courses | Check the semester, curriculum-version IDs, and any `--types` filter. |
| Empty `course_degrees` after import | Confirm you imported via `--degree` or a curriculum ID contained in `DEGREES`; full-semester mode does not assign degree associations. |
| Missing descriptions or groups | Some public detail endpoints may fail or deny anonymous access; inspect `fetch_errors` and the timestamps/JSON columns in `courses`. |
| Missing packages | Run `python -m pip install "psycopg[binary]" requests` in the same Python environment used to execute the script. |

## Notes

This importer uses public TUMonline endpoints and does not require a TUMonline account. API availability, curriculum mappings, and returned course metadata are controlled by TUMonline and can change. Avoid placing PostgreSQL passwords in Git repositories, scripts, or shared screenshots.
