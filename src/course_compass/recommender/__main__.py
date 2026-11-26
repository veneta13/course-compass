"""Command line for the recommender.

    python -m course_compass.recommender build                 # after each import, no Ollama needed
    python -m course_compass.recommender enrich [--degree D]   # embeddings + course categories (Ollama)
    python -m course_compass.recommender try --degree master-informatics --interests "NLP and LLMs"

Uses DATABASE_URL from the environment or .env, like the rest of the project.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import sys
import textwrap

import asyncpg

from course_compass.database import DATABASE_URL

from . import config
from .enrich import enrich
from .items import build
from .llm import LLMUnavailable, OllamaLLM
from .service import UnknownDegree, recommend


def parse_args(argv=None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(prog="python -m course_compass.recommender")
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("build", help="Group courses into items (no Ollama needed)")
    p.add_argument("--semester", type=int, help="TUMonline semester ID (default: the newest)")

    p = sub.add_parser("enrich", help="Embeddings and course categories with Ollama")
    p.add_argument("--degree", help="Only items of this degree, e.g. master-informatics")
    p.add_argument("--limit", type=int, help="At most this many items")
    p.add_argument("--embeddings-only", action="store_true", help="Skip the slower course categories")
    p.add_argument("--force", action="store_true", help="Redo items that are already done")

    p = sub.add_parser("try", help="Print recommendations for a sample student")
    p.add_argument("--degree", required=True, choices=sorted(config.DEGREE_CURRICULA))
    p.add_argument("--interests", default="", help="What the student writes about their interests")
    p.add_argument("--transcript", help="JSON file: a list of completed courses as in ProfilePayload")
    p.add_argument("--english", action="store_true", help="English-taught courses only")
    p.add_argument("--target-ects", type=float, default=30)
    p.add_argument("--max-hours", type=float)
    p.add_argument("--priority", action="append", default=[], metavar="TERM=LEVEL",
                   help="e.g. grades=top (overrides what the LLM reads from the text)")
    p.add_argument("--top", type=int, default=10)
    p.add_argument("--json", action="store_true", help="Print the full response as JSON")
    return parser.parse_args(argv)


def profile_from_args(args) -> dict:
    completed = []
    if args.transcript:
        with open(args.transcript, encoding="utf-8") as f:
            completed = json.load(f)
    priorities = dict(p.split("=", 1) for p in args.priority)
    return {
        "interest_text": args.interests,
        "target_ects": args.target_ects,
        "max_hours_per_week": args.max_hours,
        "language_pref": "english" if args.english else "any",
        "completed_courses": completed,
        "skills": [],
        "commitments": [],
        "priorities": priorities,
    }


def print_results(response: dict) -> None:
    print(response["summary"])
    print(f"{response['passed_constraints']} of {response['total_offered']} courses passed the filters.\n")
    for rank, r in enumerate(response["results"], start=1):
        c = r["course"]
        print(f"{rank:>2}. {r['match']:>3}%  {c['course_id']:<20} {c['course_name']}")
        print(f"      {c['course_type']} · {c['language'] or 'language unknown'}"
              + (f" · pass rate {round(100 * c['grade_summary']['pass_rate'])}%"
                 if c["grade_summary"]["pass_rate"] is not None else ""))
        for reason in r["reasons"][:2]:
            print(textwrap.fill(f"+ {reason['short']}", 100, initial_indent="      ", subsequent_indent="        "))
        for caution in r["cautions"][:2]:
            print(textwrap.fill(f"! {caution['title']}", 100, initial_indent="      ", subsequent_indent="        "))
        details = ", ".join(f"{t} {d['score'] if d['score'] is not None else '-'}×{d['weight']}"
                            for t, d in r["score_details"].items() if d["weight"] > 0)
        print(f"      [{details}]\n")
    combo = response["combination"]
    if combo["course_ids"]:
        print(f"Suggested combination: {combo['title']}\n  {combo['note']}")


async def main(argv=None) -> int:
    args = parse_args(argv)
    conn = await asyncpg.connect(DATABASE_URL)
    try:
        if args.command == "build":
            print(json.dumps(await build(conn, args.semester), indent=2))
        elif args.command == "enrich":
            result = await enrich(conn, OllamaLLM(), degree=args.degree, limit=args.limit,
                                  force=args.force, attributes=not args.embeddings_only)
            print(json.dumps(result, indent=2))
        elif args.command == "try":
            response = await recommend(conn, profile_from_args(args), args.degree, limit=args.top)
            if args.json:
                print(json.dumps(response, indent=2, ensure_ascii=False))
            else:
                print_results(response)
    except (LLMUnavailable, UnknownDegree) as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1
    finally:
        await conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
