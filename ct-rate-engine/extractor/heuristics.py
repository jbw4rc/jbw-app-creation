"""Pure, dependency-free heuristics for classifying manual content.

These operate on already-extracted text and tables (lists of rows), so they can
be unit-tested without pdfplumber/camelot installed. The PDF I/O lives in
``extractor.pdf_tables``.
"""

from __future__ import annotations

import re

# Keywords that hint which normalized factor a table populates. Order matters:
# the first group that matches wins, so put more-specific phrases first.
FACTOR_KEYWORDS: dict[str, list[str]] = {
    "wind_hurricane_deductible": ["hurricane deductible", "wind deductible", "named storm", "wind/hail"],
    "protection_class": ["protection class", "ppc", "public protection", "fire protection class"],
    "construction": ["construction", "frame", "masonry", "superior construction"],
    "roof_age": ["roof age", "age of roof", "roof year"],
    "age_of_home": ["age of home", "year built", "age of dwelling", "home age"],
    "deductible": ["deductible"],
    "coverage_a_amount": ["amount of insurance", "coverage a", "aoi", "dwelling limit"],
    "territory": ["territory", "terr.", "rating territory", "zip"],
    "base_rate": ["base rate", "base premium", "base loss cost", "key premium", "key factor"],
}

# Phrases that mark the "order of calculation" / rating-algorithm page.
_ALGORITHM_MARKERS = [
    "rating algorithm",
    "order of calculation",
    "calculation order",
    "rating steps",
    "premium calculation",
    "rating order",
    "step 1",
    "algorithm",
    "rounding",
    "minimum premium",
]

_NUMERIC_RE = re.compile(r"^-?\$?\d[\d,]*(\.\d+)?%?$")


def _norm(text: str) -> str:
    return re.sub(r"\s+", " ", text or "").strip().lower()


def classify_table(header_text: str, rows: list[list[str]]) -> tuple[str | None, float]:
    """Guess which normalized factor a table represents.

    ``header_text`` is nearby caption/first-row text. Returns
    ``(factor_name_or_None, confidence 0..1)``. Confidence is a crude blend of
    keyword strength and how table-shaped the rows look.
    """

    hay = _norm(header_text) + " " + " ".join(_norm(" ".join(r)) for r in rows[:3])
    best: tuple[str | None, float] = (None, 0.0)
    for factor, kws in FACTOR_KEYWORDS.items():
        for kw in kws:
            if kw in hay:
                strength = 0.6 + 0.1 * min(3, hay.count(kw))
                if strength > best[1]:
                    best = (factor, min(strength, 0.9))
                break

    # Bump confidence if the table has a two-column key/value shape with numbers.
    if best[0] and _looks_like_key_value(rows):
        best = (best[0], min(best[1] + 0.1, 0.95))
    return best


def _looks_like_key_value(rows: list[list[str]]) -> bool:
    numeric_last = 0
    considered = 0
    for row in rows:
        cells = [c for c in row if c not in (None, "")]
        if len(cells) < 2:
            continue
        considered += 1
        if _NUMERIC_RE.match(str(cells[-1]).strip()):
            numeric_last += 1
    return considered >= 2 and numeric_last / considered >= 0.5


def find_rating_algorithm_lines(page_text: str) -> list[str]:
    """Return lines from a page that look like the rating-algorithm/order page.

    Preserves original line order so the exact operation sequence (and any
    rounding / minimum-premium notes) can be reviewed verbatim.
    """

    low = _norm(page_text)
    if not any(marker in low for marker in _ALGORITHM_MARKERS):
        return []
    keep: list[str] = []
    for line in page_text.splitlines():
        l = line.strip()
        if not l:
            continue
        ll = l.lower()
        if any(m in ll for m in _ALGORITHM_MARKERS) or re.match(r"^\s*(step\s*)?\d+[\.\)]", ll):
            keep.append(l)
        elif any(op in ll for op in ("multiply", "multiplicative", "add", "additive",
                                     "round", "times", "factor", "×", "x ")):
            keep.append(l)
    return keep


def looks_like_scan(page_text: str, char_count_threshold: int = 40) -> bool:
    """A page with almost no extractable text is probably a scanned image."""

    return len((page_text or "").strip()) < char_count_threshold


def parse_key_value_table(rows: list[list[str]]) -> dict[str, float]:
    """Best-effort: turn a 2-column table into a {key: factor} dict.

    Skips header rows and non-numeric values. Percent strings ("95%") and
    dollar strings ("$1,000") are normalized to floats.
    """

    out: dict[str, float] = {}
    for row in rows:
        cells = [str(c).strip() for c in row if c not in (None, "")]
        if len(cells) < 2:
            continue
        key = cells[0]
        val = _to_float(cells[-1])
        if val is None:
            continue
        out[key] = val
    return out


def _to_float(text: str) -> float | None:
    t = text.strip().replace(",", "").replace("$", "")
    pct = t.endswith("%")
    t = t.rstrip("%")
    try:
        v = float(t)
        return v / 100.0 if pct else v
    except ValueError:
        return None
