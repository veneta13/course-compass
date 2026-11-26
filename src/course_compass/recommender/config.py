"""Settings for the recommender.

The weights and thresholds are starting points. Tune them with test profiles
rather than by feel.
"""
import os

from dotenv import load_dotenv

load_dotenv()

# Ollama models, overridable in .env. qwen2.5:3b runs well on 8 GB of RAM;
# llama3.1:8b categorizes a bit better but needs 16 GB to be usable.
EMBED_MODEL = os.getenv("REC_EMBED_MODEL", "bge-m3")
CHAT_MODEL = os.getenv("REC_CHAT_MODEL", "qwen2.5:3b")
OLLAMA_HOST = os.getenv("OLLAMA_HOST")  # None means http://localhost:11434

# The six terms of the score and their default weights (they add up to 1).
TERMS = ("interest", "format", "readiness", "grades", "workload", "rating")
DEFAULT_WEIGHTS = {
    "interest": 0.40,
    "format": 0.20,
    "readiness": 0.15,
    "grades": 0.10,
    "workload": 0.10,
    "rating": 0.05,
}

# A student's priority for a term multiplies its default weight.
PRIORITY_LEVELS = ("not_important", "normal", "important", "top")
PRIORITY_MULTIPLIERS = {"not_important": 0.0, "normal": 1.0, "important": 2.0, "top": 5.0}

# Value used when a course has no data for a term, so missing data neither
# helps nor hurts.
NEUTRAL = 0.5

# Subtracted from the score when a course clashes with a fixed commitment.
CLASH_PENALTY = 0.15

# A module code shared by at least this many courses is an umbrella module,
# such as IN2106 (Master's practical course) or IN2107 (Master's seminar).
# Each of its courses is recommended on its own.
UMBRELLA_MIN_COURSES = 6

# Umbrella modules whose places are assigned through the TUM matching system.
MATCHING_MODULES = {"IN0012", "IN0014", "IN2106", "IN2107"}

# Similarity at which a prerequisite topic counts as covered by a passed
# module or skill (cosine similarity of bge-m3 embeddings). On a sample
# transcript, right matches scored 0.65 and more, wrong ones up to 0.63.
PREREQ_MATCH_THRESHOLD = 0.65

# Courses with a shorter description can't be compared with the student's
# interests (a bare title like "German as a Foreign Language" matches
# anything containing "language"), so they get the median interest.
MIN_DESCRIPTION_FOR_INTEREST = 100

# Readiness per prerequisite topic: covered by a module passed with a grade
# better than WEAK_GRADE (or by a skill) counts 1, covered by a module passed
# with WEAK_GRADE or worse counts 0.5, not covered at all counts 0.
WEAK_GRADE = 3.5
READINESS_MET = 1.0
READINESS_WEAK = 0.5
READINESS_MISSING = 0.0

# Grade statistics: use the latest endterm exams, and pull small exams
# toward the average of all courses as if they had this many extra students.
RECENT_EXAMS = 4
GRADE_PRIOR_STUDENTS = 30

# Ratings: pull the average toward the overall mean as if there were this
# many extra ratings (Bayesian average).
RATING_PRIOR_COUNT = 5

# 1 ECTS = 30 hours, spread over about 14 lecture weeks.
HOURS_PER_ECTS_PER_WEEK = 30 / 14
HEAVY_HOURS_PER_WEEK = 12

# Weekly time slots: an appointment must repeat at least this often.
MIN_WEEKLY_REPEATS = 3

# Curriculum version IDs per degree key. Copied from DEGREES in
# tumonline_imports/tumonline_scrape.py: keep the two in sync.
DEGREE_CURRICULA = {
    "bachelor-informatics": ["5440", "5371", "4998", "4748", "4591", "4283", "1304"],
    "master-informatics": ["5217", "4731", "4594", "4271", "2612"],
    "master-dea": ["4733", "4567"],
    "master-information-systems": ["4997", "404", "4368", "4716", "4734", "4918", "5013"],
    "master-mathematics": ["5244", "4852", "4407"],
    "bachelor-information-systems": ["5441", "4999", "4750"],
    "bachelor-games-engineering": ["5218", "4749"],
    "master-games-engineering": ["5219", "4732"],
    "bachelor-bioinformatics": ["5028", "4638", "4359", "403"],
    "master-rci": ["5271", "5120", "4827"],
    "master-cse": ["5001", "4637", "4286", "4022"],
}
