"""Phase 2 — PDF extraction.

Turns a filing's rating-manual PDFs into a best-effort normalized
``CarrierManual`` JSON (the Phase 3 schema) plus a human review checklist.

Heavy dependencies (pdfplumber, camelot, pytesseract) are imported lazily so
that the pure heuristics in this package can be unit-tested without them.
"""

from extractor.heuristics import (
    FACTOR_KEYWORDS,
    classify_table,
    find_rating_algorithm_lines,
    looks_like_scan,
)

__all__ = [
    "FACTOR_KEYWORDS",
    "classify_table",
    "find_rating_algorithm_lines",
    "looks_like_scan",
]
