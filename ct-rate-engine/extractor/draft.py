"""Assemble a best-effort draft CarrierManual from a filing's PDFs.

Human-in-the-loop by design: we emit
  * ``<carrier>.draft.json`` — the normalized manual (Phase 3 schema), and
  * ``review_needed.md`` — every low-confidence extraction to verify by hand.

We never invent numbers. Anything we can't confidently read is left out of the
manual and listed in the review file (and/or the manual's ``gaps``).
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path

from engine.models import BaseRate, CarrierManual
from extractor.heuristics import (
    classify_table,
    find_rating_algorithm_lines,
    parse_key_value_table,
)
from extractor.pdf_tables import ExtractedPdf, extract_pdf

CONFIDENCE_REVIEW_THRESHOLD = 0.8


@dataclass
class DraftItem:
    """One extracted factor table with provenance + confidence."""

    factor: str
    table: dict[str, float]
    confidence: float
    source_pdf: str
    source_page: int


@dataclass
class DraftResult:
    manual: CarrierManual
    items: list[DraftItem] = field(default_factory=list)
    algorithm_lines: list[str] = field(default_factory=list)
    scanned_sources: list[str] = field(default_factory=list)
    review_notes: list[str] = field(default_factory=list)


def build_draft(
    carrier: str,
    serff_tracking: str,
    pdf_paths: list[Path],
    line: str = "homeowners",
    effective_date: str = "",
    camelot_fallback: bool = True,
) -> DraftResult:
    """Scan a filing's PDFs and assemble a draft manual + review material."""

    factors: dict[str, dict[str, float]] = {}
    base_rates: list[BaseRate] = []
    items: list[DraftItem] = []
    algorithm_lines: list[str] = []
    scanned: list[str] = []
    notes: list[str] = []

    for pdf_path in pdf_paths:
        extracted = extract_pdf(pdf_path, camelot_fallback=camelot_fallback)
        if extracted.scanned_pages:
            scanned.append(f"{pdf_path.name} pages {extracted.scanned_pages}")

        for page in extracted.pages:
            algo = find_rating_algorithm_lines(page.text)
            if algo:
                algorithm_lines.extend(algo)

            for tbl in page.tables:
                header = " ".join(str(c) for c in (tbl[0] if tbl else []))
                factor, conf = classify_table(header, tbl)
                if not factor:
                    continue
                parsed = parse_key_value_table(tbl[1:] if len(tbl) > 1 else tbl)
                if not parsed:
                    continue
                items.append(
                    DraftItem(factor=factor, table=parsed, confidence=conf,
                              source_pdf=pdf_path.name, source_page=page.page_number)
                )
                if factor == "base_rate":
                    _absorb_base_rates(base_rates, parsed)
                else:
                    # Keep the highest-confidence table per factor.
                    existing = factors.get(factor)
                    if existing is None or conf > _confidence_of(items, factor):
                        factors[factor] = parsed

    rating_order = _infer_rating_order(algorithm_lines, factors)
    gaps = _infer_gaps(base_rates, factors, algorithm_lines, scanned)

    manual = CarrierManual(
        carrier=carrier,
        serff_tracking=serff_tracking,
        effective_date=effective_date,
        line=line,  # type: ignore[arg-type]
        base_rates=base_rates,
        rating_order=rating_order,
        factors=factors,
        gaps=gaps,
    )

    for item in items:
        if item.confidence < CONFIDENCE_REVIEW_THRESHOLD:
            notes.append(
                f"low confidence ({item.confidence:.2f}) for {item.factor} "
                f"from {item.source_pdf} p.{item.source_page}"
            )
    if not algorithm_lines:
        notes.append("no rating-algorithm / order-of-calculation page found — "
                     "rating_order is a guess; verify operation order and rounding")

    return DraftResult(
        manual=manual, items=items, algorithm_lines=algorithm_lines,
        scanned_sources=scanned, review_notes=notes,
    )


def _confidence_of(items: list[DraftItem], factor: str) -> float:
    confs = [it.confidence for it in items if it.factor == factor]
    return max(confs) if confs else 0.0


def _absorb_base_rates(dest: list[BaseRate], parsed: dict[str, float]) -> None:
    # Without richer structure we can only record statewide amount->rate rows.
    for band, rate in parsed.items():
        dest.append(BaseRate(territory="*", coverage_a_band=band, rate=rate))


def _infer_rating_order(algorithm_lines: list[str], factors: dict[str, dict]) -> list[str]:
    """Prefer the order implied by the algorithm page; fall back to factor order."""

    order = ["base_rate"]
    if algorithm_lines:
        text = " \n ".join(algorithm_lines).lower()
        for factor in factors:
            # crude: order by first appearance in the algorithm text
            pass
        ranked = sorted(
            factors.keys(),
            key=lambda f: _first_index(text, f),
        )
        order.extend([f for f in ranked if _first_index(text, f) < float("inf")])
        # any factor not mentioned still gets appended so it isn't dropped
        order.extend([f for f in factors if f not in order])
    else:
        order.extend(list(factors.keys()))
    # de-dupe preserving order
    seen: set[str] = set()
    return [x for x in order if not (x in seen or seen.add(x))]


def _first_index(text: str, factor: str) -> float:
    token = factor.replace("_", " ")
    idx = text.find(token)
    return idx if idx >= 0 else float("inf")


def _infer_gaps(base_rates, factors, algorithm_lines, scanned) -> list[str]:
    gaps: list[str] = []
    if not base_rates:
        gaps.append("no base-rate table extracted — premium cannot be reproduced")
    if not factors:
        gaps.append("no rating factors extracted")
    if not algorithm_lines:
        gaps.append("rating algorithm / order-of-calculation page not located")
    if scanned:
        gaps.append(f"scanned page(s) not OCR'd: {'; '.join(scanned)}")
    return gaps


# ---------------------------------------------------------------------------
# Output writers
# ---------------------------------------------------------------------------

def write_draft(result: DraftResult, out_dir: Path) -> tuple[Path, Path]:
    """Write ``<carrier>.draft.json`` + ``review_needed.md`` into ``out_dir``."""

    out_dir.mkdir(parents=True, exist_ok=True)
    slug = _slug(result.manual.carrier)
    json_path = out_dir / f"{slug}.draft.json"
    json_path.write_text(result.manual.model_dump_json(indent=2))

    review_path = out_dir / "review_needed.md"
    review_path.write_text(_render_review(result))
    return json_path, review_path


def _render_review(result: DraftResult) -> str:
    m = result.manual
    lines = [
        f"# Review needed — {m.carrier}",
        "",
        f"- SERFF: `{m.serff_tracking}`  | line: `{m.line}`  | effective: `{m.effective_date}`",
        f"- base-rate rows extracted: **{len(m.base_rates)}**",
        f"- factors extracted: **{len(m.factors)}** ({', '.join(m.factors) or 'none'})",
        "",
        "## Gaps blocking full reproduction",
    ]
    lines += [f"- {g}" for g in m.gaps] or ["- (none flagged)"]

    lines += ["", "## Rating algorithm / order of calculation (verbatim)"]
    if result.algorithm_lines:
        lines.append("```")
        lines += result.algorithm_lines
        lines.append("```")
    else:
        lines.append("- NOT FOUND — verify the operation order, rounding, and minimum premium manually.")

    lines += ["", "## Extracted factor tables (verify against the manual)"]
    for it in sorted(result.items, key=lambda i: i.confidence):
        flag = "  ⚠️ LOW CONFIDENCE" if it.confidence < CONFIDENCE_REVIEW_THRESHOLD else ""
        lines.append(
            f"### {it.factor} — confidence {it.confidence:.2f}{flag} "
            f"(source: {it.source_pdf} p.{it.source_page})"
        )
        lines.append("```json")
        lines.append(json.dumps(it.table, indent=2))
        lines.append("```")

    if result.review_notes:
        lines += ["", "## Notes"]
        lines += [f"- {n}" for n in result.review_notes]
    return "\n".join(lines) + "\n"


def _slug(name: str) -> str:
    import re

    return re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_") or "carrier"
