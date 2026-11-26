# Recommender

Ranks the courses of a degree for one student and explains each result. The LLM turns text into structured data; a fixed formula does the ranking, so the same profile always gets the same ranking.

## Set it up

You need the database from [Getting started](../../../README.md#getting-started) (the restored dump is enough) and Ollama.

1. **Install Ollama and the two models:**

   ```bash
   brew install ollama && brew services start ollama     # macOS
   curl -fsSL https://ollama.com/install.sh | sh         # Linux
   ollama pull bge-m3          # embeddings, 1.2 GB
   ollama pull qwen2.5:3b      # reads text, 1.9 GB
   ```

2. **Load the prepared data.** `database_backups/recommender.sql.gz` contains the recommender's tables for the shared course dump: embeddings for all 868 items of the ten degrees, and course categories for Master Informatics.

   ```bash
   gunzip -c database_backups/recommender.sql.gz | psql -q -d course_compass > /dev/null
   ```

   Use your database's name instead of `course_compass`. Loading it again replaces the tables. If `psql` reports `invalid command \restrict`, it's older than August 2025; the data still loads.

   **Or prepare the data yourself**, which is needed after a new import:

   ```bash
   python -m course_compass.recommender build                                  # items, ~10 s, no Ollama needed
   python -m course_compass.recommender enrich --embeddings-only               # all courses, ~3 min
   python -m course_compass.recommender enrich --degree master-informatics     # categories, ~9 s per course
   ```

   `build` creates the tables `rec_items` and `rec_item_degrees`. Categorizing all ~520 Master Informatics courses takes about 75 minutes on an M1 MacBook Air. You can stop it and start it again: courses that are done are skipped. Without the categories, interest matching works, but the prerequisite check and the format preferences don't.

3. **Try it:**

   ```bash
   python -m course_compass.recommender try --degree master-informatics \
       --interests "I want to learn about NLP and large language models, ideally with a project"
   python -m course_compass.recommender try --degree master-informatics --priority grades=top
   python -m course_compass.recommender try --degree master-informatics --transcript my_courses.json --english
   ```

   `--transcript` takes a JSON list of completed courses in the `completed_courses` format of [frontend-api.md](../../../docs/frontend-api.md). `--json` prints the full response.

After each import, run `build` and `enrich` again; both keep the work for courses that haven't changed. Then update the shared file, so the others can load it instead:

```bash
pg_dump --clean --if-exists --no-owner --no-privileges -t rec_items -t rec_item_degrees course_compass \
    | gzip -9 > database_backups/recommender.sql.gz
```

### Models

| Setting in `.env` | Default | Used for |
|---|---|---|
| `REC_EMBED_MODEL` | `bge-m3` | Embeddings of course descriptions, interests and transcript modules. Handles German and English. |
| `REC_CHAT_MODEL` | `qwen2.5:3b` | Reading the student's text and categorizing courses |
| `OLLAMA_HOST` | `http://localhost:11434` | Where Ollama runs |

On a machine with 16 GB of RAM or more, `REC_CHAT_MODEL=llama3.1:8b` gives somewhat better categories. With 8 GB it doesn't fit into GPU memory and runs at under 1 word per second.

### When something goes wrong

| Message or symptom | What to do |
|---|---|
| `Ollama isn't running` | `brew services start ollama` (macOS) or `ollama serve` (Linux) |
| `The Ollama model '…' isn't downloaded` | `ollama pull <model>` |
| `No courses for degree '…'` | Run `build`, and check that `DATABASE_URL` points at the database with the courses |
| The first answer for a new text takes 10–30 s | Expected: the model reads the text once, then it's cached. A running `enrich` makes it slower, because requests wait in line. |

## Use it from an endpoint

```python
from course_compass.recommender import recommend, match_course, profile_insights, UnknownDegree, UnknownCourse

await recommend(pool, profile, "master-informatics")                  # POST /api/recommendations
await match_course(pool, "IN2390", profile, "master-informatics")     # POST /api/courses/{course_id}/match
await profile_insights(profile)                                       # POST /api/profile/insights
```

- `pool` is the asyncpg pool from `course_compass.database`.
- `profile` is the `ProfilePayload` from [frontend-api.md](../../../docs/frontend-api.md). It can also carry `"priorities": {"grades": "top"}` (levels: `not_important`, `normal`, `important`, `top`), which overrides what the LLM reads from the text.
- The degree is a key such as `master-informatics`; all keys are in `config.DEGREE_CURRICULA`. The frontend doesn't send a degree yet; it needs to.
- The results have the JSON shapes of frontend-api.md, plus `module_code`, `tumonline_course_ids` and `score_details` (each term's score and weight).
- `UnknownDegree` should become a 400 response, `UnknownCourse` a 404.

`course_id` in a result is the module code (`IN2390`). A single course of an umbrella module gets the umbrella code plus its TUMonline ID (`IN2107-950945730`).

## How it works

1. **Items.** A module's lecture and exercise are one item. A module code that many unrelated courses share (IN2106, IN2107, …) is an umbrella; each of its courses is its own item.
2. **Student.** The LLM reads the free text: topics, format preferences and priorities. The transcript gives passed modules and grades.
3. **Filters.** Removes modules already passed, and courses not taught in English if the student asked for English only.
4. **Score.** Six terms from 0 to 1, combined as a weighted average:

   | Term | Measures | Default weight |
   |---|---|---|
   | interest | best match between a student topic and the course description (embeddings) | 0.40 |
   | format | share of stated preferences the course meets: project vs. exam, math, programming | 0.20 |
   | readiness | prerequisite topics covered by the transcript: good grade 1, grade 3.5 or worse 0.5, nothing 0 | 0.15 |
   | grades | pass rate and average grade of the last endterm exams, small exams pulled to the average | 0.10 |
   | workload | hours students report compared with the ECTS | 0.10 |
   | rating | average star rating, pulled to the overall average when there are few ratings | 0.05 |

   The student's priorities multiply the weights: not important ×0, normal ×1, important ×2, top priority ×5. A term the student gave no input for (e.g. no transcript) gets weight 0. A course without data for a term gets the neutral 0.5; for interest, a course without a description gets the median. A clash with a fixed commitment subtracts 0.15.
5. **Explanation.** Reasons and cautions come from rules, so they always match the numbers.
6. **Semester plan.** Picks courses from the top of the list that don't clash, up to the ECTS target.

All weights and thresholds are in [config.py](config.py).

## Current limits

| Topic | Status |
|---|---|
| Semesters | Only the newest semester in the database (Winter 2026/27 in the dump). `build --semester <id>` picks another one. |
| ECTS and assessment types | `courses.ects` and `courses.examination_method` are almost empty. Until they're imported, the format term uses the LLM's reading of the description, and the semester plan can't check the ECTS target. If they end up in another table, change `COURSES_SQL` in [items.py](items.py). |
| Workload and rating | No data yet, so both count as neutral. They switch on when reviews have hours and ratings. |
| Priorities from the text | The 3B model sometimes misreads them, e.g. "I'm not good at math" read as "low workload: top priority". An explicit "What matters most?" control in the UI, sent as `priorities`, is more reliable. |
| Speed | Reading a new text takes 10–30 s on an M1 MacBook Air with `qwen2.5:3b`. |

## Notes for the frontend

- `review_summary` is always `null` for now. `RecommendationCard` and `CourseDetailPage` read `course.review_summary.oneLiner` and crash on `null`.
- `ects` and `workload_hours_per_week` are `null` for most courses until ECTS are imported, so the card shows "null ECTS".
- `profile_insights` calls the LLM for every new text. Asking only when the student has finished typing (a button, or when the text field loses focus) avoids a queue of half-typed texts.

## Tests

```bash
pytest
```
