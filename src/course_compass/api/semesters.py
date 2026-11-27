"""Semester codes.

The frontend and the grade tables use codes like 'WS2026' (winter 2026/27) and
'SS2025'. TUMonline numbers its terms: 207 is winter 2026/27. The conversion
matches semester_to_term_id() in tumonline_imports/tumonline_scrape.py.
"""
import re


def term_id(code: str) -> int:
    """'WS2026' -> 207, 'SS2026' -> 206. A plain term ID like '207' is accepted too."""
    code = code.strip().upper()
    if code.isdecimal():
        return int(code)
    match = re.fullmatch(r"(WS|SS)(\d{4})", code)
    if not match:
        raise ValueError(f"Unknown semester '{code}'. Use a code like WS2026 or SS2026.")
    season, year = match.group(1), int(match.group(2))
    raw = 199 + 2 * (year - 2023) if season == "WS" else 198 + 2 * (year - 2023)
    # TUMonline skipped the IDs 201 and 202.
    return raw + 2 if raw > 200 else raw
