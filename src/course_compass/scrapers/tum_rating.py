from __future__ import annotations

import argparse
import json
import logging
import sys
import threading
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any

API = "https://tum-rating.de/api/v1"
USER_AGENT = "course-compass-scraper/0.1 (university database project)"
PAGE_SIZE = 1000

LOG = logging.getLogger("tum_rating")


class Client:

    def __init__(self, delay: float, retries: int = 4, timeout: float = 30):
        self.delay = delay
        self.retries = retries
        self.timeout = timeout
        self._lock = threading.Lock()
        self._next_request = 0.0

    def _wait_turn(self) -> None:
        with self._lock:
            now = time.monotonic()
            wait = self._next_request - now
            self._next_request = max(now, self._next_request) + self.delay
        if wait > 0:
            time.sleep(wait)

    def get_json(self, path: str) -> Any:
        url = API + path
        for attempt in range(1, self.retries + 1):
            self._wait_turn()
            req = urllib.request.Request(
                url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"}
            )
            try:
                with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                    return json.load(resp)
            except urllib.error.HTTPError as e:
                if e.code != 429 and e.code < 500:
                    raise
                err: Exception = e
            except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
                err = e
            backoff = 2**attempt
            LOG.warning("%s failed (%s), retry %d/%d in %ds", url, err, attempt, self.retries, backoff)
            time.sleep(backoff)
        raise RuntimeError(f"giving up on {url}")


def fetch_course_list(client: Client) -> list[dict]:
    courses: list[dict] = []
    page: int | None = 1
    while page is not None:
        data = client.get_json(f"/courses?page-number={page}&page-size={PAGE_SIZE}")
        courses.extend(data["results"])
        LOG.info("course list page %d: %d courses so far", page, len(courses))
        page = data.get("nextPageNumber")
    return list({c["id"]: c for c in courses}.values())


def load_done_details(path: Path) -> dict[str, dict]:
    done: dict[str, dict] = {}
    if not path.exists():
        return done
    with path.open(encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                d = json.loads(line)
            except json.JSONDecodeError:
                continue
            done[d["id"]] = d
    return done


def fetch_details(client: Client, ids: list[str], out_path: Path, workers: int) -> None:
    write_lock = threading.Lock()
    total = len(ids)
    failed = 0
    with out_path.open("a", encoding="utf-8") as out, ThreadPoolExecutor(workers) as pool:
        futures = {pool.submit(client.get_json, f"/courses/{cid}"): cid for cid in ids}
        for n, fut in enumerate(as_completed(futures), 1):
            cid = futures[fut]
            try:
                detail = fut.result()
            except Exception as e:
                failed += 1
                LOG.error("course %s: %s", cid, e)
                continue
            with write_lock:
                out.write(json.dumps(detail, ensure_ascii=False) + "\n")
                out.flush()
            if n % 100 == 0 or n == total:
                LOG.info("details %d/%d (%d failed)", n, total, failed)
    if failed:
        LOG.warning("%d courses failed; run again to retry them", failed)


def flatten_reviews(details: list[dict]) -> list[dict]:
    return [r for d in details for r in d.get("reviews") or []]


def flatten_exam_stats(details: list[dict]) -> list[dict]:
    rows = []
    for d in details:
        for semester, exams in (d.get("examStats") or {}).items():
            for exam, stats in (exams or {}).items():
                rows.append(
                    {
                        "courseId": d["id"],
                        "tumonlineCourseId": d.get("courseId"),
                        "courseNumber": d.get("courseNumber"),
                        "semester": semester,
                        "exam": exam,
                        **stats,
                    }
                )
    return rows


def write_json(path: Path, data: Any) -> None:
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    tmp.replace(path)


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--out", type=Path, default=Path("data/tum_rating"), help="output directory")
    p.add_argument("--only-rated", action="store_true", help="fetch details only for courses with reviews")
    p.add_argument("--workers", type=int, default=4, help="parallel detail requests")
    p.add_argument("--delay", type=float, default=0.25, help="minimum seconds between requests")
    p.add_argument("--limit", type=int, help="fetch details for at most N courses (for testing)")
    p.add_argument("--refresh", action="store_true", help="discard previously fetched details")
    p.add_argument("-v", "--verbose", action="store_true")
    args = p.parse_args(argv)

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
        datefmt="%H:%M:%S",
    )

    args.out.mkdir(parents=True, exist_ok=True)
    details_path = args.out / "details.jsonl"
    if args.refresh and details_path.exists():
        details_path.unlink()

    client = Client(delay=args.delay)

    courses = fetch_course_list(client)
    write_json(args.out / "courses.json", courses)
    LOG.info("saved %d courses", len(courses))

    wanted = [c for c in courses if not args.only_rated or c.get("votesNumber", 0) > 0]
    done = load_done_details(details_path)
    todo = [c["id"] for c in wanted if c["id"] not in done]
    if args.limit is not None:
        todo = todo[: args.limit]
    LOG.info("%d details already fetched, %d to fetch", len(done), len(todo))
    if todo:
        fetch_details(client, todo, details_path, args.workers)

    details = list(load_done_details(details_path).values())
    reviews = flatten_reviews(details)
    exam_stats = flatten_exam_stats(details)
    write_json(args.out / "reviews.json", reviews)
    write_json(args.out / "exam_stats.json", exam_stats)
    LOG.info(
        "done: %d courses, %d details, %d reviews, %d exam stat rows -> %s",
        len(courses), len(details), len(reviews), len(exam_stats), args.out,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
