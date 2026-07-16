"""PDF text + table extraction with graceful fallbacks.

Primary: pdfplumber (text + stream tables).
Fallback: camelot-py (lattice tables) for ruled grids pdfplumber misses.
Scans: flagged via ``looks_like_scan`` and optionally OCR'd (see extractor.ocr),
but never OCR'd by default.

All heavy imports are lazy so importing this module never requires the deps.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

from extractor.heuristics import looks_like_scan


@dataclass
class ExtractedPage:
    page_number: int
    text: str
    tables: list[list[list[str]]] = field(default_factory=list)
    is_scan: bool = False


@dataclass
class ExtractedPdf:
    path: Path
    pages: list[ExtractedPage] = field(default_factory=list)
    scanned_pages: list[int] = field(default_factory=list)
    used_camelot: bool = False

    @property
    def full_text(self) -> str:
        return "\n".join(p.text for p in self.pages)


def extract_pdf(path: Path, camelot_fallback: bool = True) -> ExtractedPdf:
    """Extract text + tables from a single PDF."""

    try:
        import pdfplumber  # type: ignore
    except ImportError as exc:  # pragma: no cover - depends on optional dep
        raise RuntimeError(
            "pdfplumber is required for extraction: pip install -e '.[extractor]'"
        ) from exc

    result = ExtractedPdf(path=path)
    with pdfplumber.open(str(path)) as pdf:
        for i, page in enumerate(pdf.pages, start=1):
            text = page.extract_text() or ""
            is_scan = looks_like_scan(text)
            tables: list[list[list[str]]] = []
            if not is_scan:
                for tbl in page.extract_tables() or []:
                    tables.append([[c or "" for c in row] for row in tbl])
            if is_scan:
                result.scanned_pages.append(i)
            result.pages.append(
                ExtractedPage(page_number=i, text=text, tables=tables, is_scan=is_scan)
            )

    # Camelot lattice fallback for pages where pdfplumber found text but no
    # tables — common for ruled rate grids.
    if camelot_fallback:
        weak = [p for p in result.pages if not p.is_scan and not p.tables]
        if weak:
            _augment_with_camelot(path, result, [p.page_number for p in weak])

    return result


def _augment_with_camelot(path: Path, result: ExtractedPdf, pages: list[int]) -> None:
    try:
        import camelot  # type: ignore
    except ImportError:  # pragma: no cover - optional dep
        return
    try:
        page_arg = ",".join(str(p) for p in pages)
        tables = camelot.read_pdf(str(path), flavor="lattice", pages=page_arg)
    except Exception:  # noqa: BLE001 - camelot is fragile; never fatal
        return
    by_page: dict[int, list[list[list[str]]]] = {}
    for t in tables:
        pno = int(t.page)
        by_page.setdefault(pno, []).append(t.df.values.tolist())
    for page in result.pages:
        if page.page_number in by_page:
            page.tables.extend(by_page[page.page_number])
            result.used_camelot = True
