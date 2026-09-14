"""Human-in-the-loop extraction assistant. NOT an automated parser.

Filing tables have wildly inconsistent layouts -- merged header cells, factors
split across page breaks, footnotes that change a table's meaning, "all other"
rows set in a different typeface. Deterministic table parsers produce confident
garbage on them. So this module does the mechanical parts and hands the reading
to a human plus an LLM looking at a page image:

    1. ``triage``  -- score every page, guess which carry rate/factor tables
    2. ``jobs``    -- render candidate pages to PNG, write one extraction prompt
                      per page specifying exactly the JSON to return
    3. ``draft``   -- assemble the returned JSON into a draft plan spec, with
                      ``source_page`` and ``confidence`` on every table

Everything it emits is stamped ``UNVERIFIED``. That marker forces the plan to
load as a draft no matter what its verification block says, so a draft cannot
rate a real risk until a human works docs/verification_checklist.md and removes
it deliberately.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence

UNVERIFIED_MARKER = "UNVERIFIED"

_BANNER = """\
# =============================================================================
# {marker}: DRAFT -- MACHINE-EXTRACTED, NOT YET CHECKED BY A HUMAN
#
# Every number below was read off a page image by an LLM and may be wrong.
# Do not rate real risks against this file.
#
# To make it usable:
#   1. Work through docs/verification_checklist.md, table by table.
#   2. Fix what is wrong. Delete every `confidence:` line as you confirm it.
#   3. Encode the filing's own worked examples as `worksheets:` and make them
#      pass: `python -m src.cli validate --plans plans/`
#   4. Set verification.status to `verified` with your name and the date.
#   5. Delete the `{marker}: true` line below and this banner.
#
# Source PDF : {source}
# Extracted  : {when}
# =============================================================================
{marker}: true

"""


# --------------------------------------------------------------------------
# PDF access (optional dependency, imported lazily)
# --------------------------------------------------------------------------


def _pymupdf():
    try:
        import pymupdf  # type: ignore
        return pymupdf
    except ImportError:
        pass
    try:
        import fitz  # type: ignore
        return fitz
    except ImportError as exc:
        raise SystemExit(
            "error: reading filing PDFs needs PyMuPDF.\n"
            "  pip install 'ho-rating[extract]'    (or: pip install pymupdf)"
        ) from exc


# --------------------------------------------------------------------------
# Triage
# --------------------------------------------------------------------------

# A factor table's signature is a dense grid of 3-decimal numbers near 1.00.
# Almost nothing else in a filing looks like that.
_FACTOR_RE = re.compile(r"\b[0-2]\.\d{2,4}\b")
_MONEY_RE = re.compile(r"\$\s?[\d,]+(?:\.\d{2})?")
_ZIP_RE = re.compile(r"\b0[0-9]{4}\b")
_AMOUNT_RE = re.compile(r"\b\d{2,3},000\b")

_KEYWORDS = {
    "base_rate": [
        "base premium", "base rate", "amount of insurance", "coverage a",
        "key premium", "per $1,000", "each additional",
    ],
    "territory": ["territory", "territories", "zip code", "rating territory"],
    "factor": [
        "factor", "relativity", "protection class", "construction",
        "deductible", "roof", "age of dwelling", "loss history", "multiplier",
    ],
    "worksheet": [
        "example", "illustration", "worksheet", "sample rating",
        "total premium", "rating example",
    ],
    "rules": ["rule", "minimum premium", "rounding", "order of calculation",
              "premium determination"],
}


@dataclass
class PageSignal:
    """What a single page looks like from the outside."""

    page: int                       # 1-indexed, matching source_page
    score: int = 0
    guess: str = "unknown"
    reasons: List[str] = field(default_factory=list)
    factor_count: int = 0
    money_count: int = 0
    has_text_layer: bool = True
    first_line: str = ""

    @property
    def is_candidate(self) -> bool:
        return self.score >= 3


def triage(pdf_path: Path | str) -> List[PageSignal]:
    """Score every page for the likelihood it carries a rate or factor table.

    Heuristic and deliberately generous: a false positive costs one extra page
    image, a false negative loses a table.
    """
    pymupdf = _pymupdf()
    signals: List[PageSignal] = []
    with pymupdf.open(str(pdf_path)) as doc:
        for index, page in enumerate(doc):
            text = page.get_text() or ""
            signal = PageSignal(page=index + 1)
            lowered = text.lower()
            signal.first_line = next(
                (ln.strip() for ln in text.splitlines() if ln.strip()), ""
            )[:70]

            if len(text.strip()) < 20:
                # A scanned filing has no text layer at all. Triage cannot help,
                # but the page still needs extracting -- flag it loudly.
                signal.has_text_layer = False
                signal.score = 3
                signal.guess = "image-only"
                signal.reasons.append("no text layer -- scanned page, needs OCR or vision")
                signals.append(signal)
                continue

            signal.factor_count = len(_FACTOR_RE.findall(text))
            signal.money_count = len(_MONEY_RE.findall(text))
            amount_count = len(_AMOUNT_RE.findall(text))
            zip_count = len(_ZIP_RE.findall(text))

            if signal.factor_count >= 8:
                signal.score += 4
                signal.reasons.append(f"{signal.factor_count} factor-shaped numbers")
            elif signal.factor_count >= 3:
                signal.score += 2
                signal.reasons.append(f"{signal.factor_count} factor-shaped numbers")
            if signal.money_count >= 8 or amount_count >= 5:
                signal.score += 2
                signal.reasons.append(f"{signal.money_count + amount_count} money amounts")
            if zip_count >= 10:
                signal.score += 3
                signal.reasons.append(f"{zip_count} ZIP codes")

            hits: Dict[str, int] = {}
            for kind, words in _KEYWORDS.items():
                n = sum(lowered.count(w) for w in words)
                if n:
                    hits[kind] = n
                    signal.score += min(n, 3)
            if hits:
                signal.guess = max(hits, key=lambda k: hits[k])
                signal.reasons.append(
                    "keywords: " + ", ".join(f"{k}x{v}" for k, v in sorted(hits.items()))
                )

            # ZIP density beats keyword counts for identifying a territory page.
            if zip_count >= 10:
                signal.guess = "territory"
            # A worked example is worth more than any factor table: it is the
            # only check that the rating sequence was read correctly.
            if hits.get("worksheet") and signal.money_count >= 3:
                signal.guess = "worksheet"
                signal.score += 3
                signal.reasons.append("looks like a worked rating example")

            signals.append(signal)
    return signals


# --------------------------------------------------------------------------
# Extraction jobs
# --------------------------------------------------------------------------

EXTRACTION_PROMPT = """\
You are transcribing one page of an insurance rate filing into structured data.
Accuracy matters more than completeness: a wrong factor produces a confident,
plausible, wrong premium that nobody catches.

Attached: page {page} of {filename} ({carrier}, {state}).

Return ONE JSON object, nothing else:

{{
  "page": {page},
  "page_kind": "base_rate" | "factor" | "territory" | "worksheet" | "rules" | "other",
  "tables": [
    {{
      "suggested_name": "snake_case_name_for_this_table",
      "exhibit": "the table's printed label, e.g. 'Rule 303' or 'Exhibit 4'",
      "keys": [
        {{"attribute": "protection_class",
          "match": "exact" | "band" | "nearest_below" | "nearest_above",
          "bounds": "closed" | "half_open",
          "evidence": "the printed text that tells you which, quoted verbatim"}}
      ],
      "rows": [{{"when": {{"protection_class": "7"}}, "value": 1.23}}],
      "default": null,
      "default_evidence": null,
      "confidence": 0.0-1.0,
      "uncertainties": ["anything you could not read or had to infer"]
    }}
  ],
  "worksheet": null,
  "sequence_notes": ["any text stating the ORDER of calculation, rounding, or
                      minimum premium -- quote it verbatim"],
  "footnotes": ["every footnote on the page, verbatim -- footnotes change what
                 a table means and are the most commonly missed thing here"]
}}

Rules:

1. Transcribe only what is printed. Never compute a missing cell, never
   interpolate, never carry a value down a column because it "obviously"
   repeats. If a cell is unreadable, leave it out and say so in
   "uncertainties".

2. Lookup semantics are the point. For every key, decide from the PRINTED TEXT
   whether it is an exact match, a band, or a "this value or higher/lower"
   list, and quote the text that told you in "evidence":
     - "Class 1-4 ... 1.00"          -> band, closed bounds
     - "$200,000 to $249,999"        -> band, closed (the filing spelled out the edges)
     - "$200,000 to $250,000"        -> band, half_open (edges would otherwise overlap)
     - "Age 20 or older"             -> the top band, {{"min": 20}}
     - "20 years ... 1.00 / 30 years ... 1.05"  -> nearest_below, NOT a band
     - a bare list of amounts        -> exact, unless the page says otherwise
   If the page does not say, set "match" to your best guess and put the
   ambiguity in "uncertainties". Do not guess silently.

3. Set "default" ONLY if the table prints an explicit "all other" / "all
   others" / "not otherwise classified" row, and quote it in
   "default_evidence". Never add a 1.00 default because a value looks missing.

4. Bands: use {{"min": x, "max": y}}, omitting "max" for an open top band.
   Reproduce the filing's own boundaries; do not tidy them into contiguity.

5. If this page is a worked rating example, fill "worksheet" with
   {{"inputs": {{...as printed...}}, "steps": [{{"label": "...", "value": ...}}],
     "final_premium": ...}}. These are the most valuable pages in the filing:
   they are how we check the whole sequence was read correctly.

6. "confidence" is your own estimate that this table is transcribed correctly.
   Be honest and be harsh. Anything below 0.9 will be re-read by a human first.
"""


def render_page(pdf_path: Path, page: int, out_dir: Path, dpi: int = 200) -> Path:
    """Render one page to PNG for a vision model to read."""
    pymupdf = _pymupdf()
    out_dir.mkdir(parents=True, exist_ok=True)
    out = out_dir / f"page-{page:03d}.png"
    with pymupdf.open(str(pdf_path)) as doc:
        pixmap = doc[page - 1].get_pixmap(dpi=dpi)
        pixmap.save(str(out))
    return out


def write_jobs(
    pdf_path: Path,
    pages: Sequence[int],
    out_dir: Path,
    carrier: str,
    state: str,
    dpi: int = 200,
) -> List[Path]:
    """Write a page image plus its extraction prompt, one pair per page.

    The pairs are deliberately plain files: hand them to a vision model however
    you like, and drop the returned JSON next to them as ``page-NNN.json``.
    """
    out_dir.mkdir(parents=True, exist_ok=True)
    written: List[Path] = []
    for page in pages:
        image = render_page(pdf_path, page, out_dir, dpi)
        prompt = out_dir / f"page-{page:03d}.prompt.md"
        prompt.write_text(
            EXTRACTION_PROMPT.format(
                page=page, filename=pdf_path.name, carrier=carrier, state=state
            ),
            encoding="utf-8",
        )
        written += [image, prompt]
    return written


# --------------------------------------------------------------------------
# Draft assembly
# --------------------------------------------------------------------------


def _slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def build_draft(
    carrier: str,
    naic: str,
    state: str,
    effective_date: str,
    pdf_name: str,
    responses: Sequence[Dict[str, Any]],
    serff: Optional[str] = None,
) -> Dict[str, Any]:
    """Assemble LLM page responses into a draft plan spec.

    Deliberately does not invent a rating sequence. Steps come out in the order
    the tables were found, which is the page order -- which is *not* necessarily
    the rating order. Fixing the order is item 1 on the verification checklist.
    """
    lookup_tables: Dict[str, Any] = {}
    base_rate_tables: Dict[str, Any] = {}
    territory: Optional[Dict[str, Any]] = None
    worksheets: List[Dict[str, Any]] = []
    sequence_notes: List[str] = []
    footnotes: List[str] = []

    for response in sorted(responses, key=lambda r: r.get("page", 0)):
        page = response.get("page")
        kind = response.get("page_kind", "other")
        for note in response.get("sequence_notes") or []:
            sequence_notes.append(f"p.{page}: {note}")
        for note in response.get("footnotes") or []:
            footnotes.append(f"p.{page}: {note}")

        if kind == "worksheet" and response.get("worksheet"):
            ws = response["worksheet"]
            worksheets.append({
                "name": f"TODO name this example (page {page})",
                "source": {"page": page},
                "form": "TODO",
                "risk": ws.get("inputs", {}),
                "expected_premium": ws.get("final_premium", 0),
                "TODO": "map the printed inputs onto PropertyRisk field names, "
                        "set the form, then make this pass",
            })

        for table in response.get("tables", []):
            name = table.get("suggested_name") or f"table_p{page}"
            source = {"page": page, "exhibit": table.get("exhibit"),
                      "confidence": table.get("confidence")}
            if table.get("uncertainties"):
                source["note"] = "UNCERTAIN: " + "; ".join(table["uncertainties"])

            if kind == "territory":
                entries = {
                    str(list(r["when"].values())[0]): str(r["value"])
                    for r in table.get("rows", []) if r.get("when")
                }
                territory = {"basis": "zip", "entries": entries, "source": source,
                             "description": "TODO confirm basis (zip/county/town) "
                                            "and that every ZIP was captured"}
                continue

            if kind == "base_rate":
                base_rate_tables[name] = {
                    "amount_attribute": "coverage_a",
                    "interpolation": "TODO per_1000 | linear | step | exact",
                    "keys": [
                        {k: v for k, v in key.items() if k != "evidence"}
                        for key in table.get("keys", [])
                        if key.get("attribute") != "coverage_a"
                    ],
                    "segments": [{
                        "when": {},
                        "points": [{"amount": "TODO", "premium": "TODO"}],
                        "TODO": "restructure the extracted rows into "
                                "amount/premium/add_per_1000 points",
                    }],
                    "below_min": "error",
                    "above_max": {"method": "error"},
                    "source": source,
                    "_extracted_rows": table.get("rows", []),
                }
                continue

            lookup_tables[name] = {
                "description": table.get("exhibit"),
                "keys": [
                    {k: v for k, v in key.items() if k != "evidence"}
                    for key in table.get("keys", [])
                ],
                "rows": table.get("rows", []),
                **({"default": table["default"],
                    "default_source": {"page": page,
                                       "note": table.get("default_evidence")}}
                   if table.get("default") is not None else {}),
                "source": source,
                "_evidence": {
                    key.get("attribute"): key.get("evidence")
                    for key in table.get("keys", []) if key.get("evidence")
                },
            }

    steps: List[Dict[str, Any]] = []
    for name in base_rate_tables:
        steps.append({"id": name, "type": "base_rate", "table": name,
                      "source": {"page": base_rate_tables[name]["source"]["page"]}})
    for name in lookup_tables:
        steps.append({"id": name, "type": "factor", "table": name,
                      "source": {"page": lookup_tables[name]["source"]["page"]}})

    return {
        "schema_version": 1,
        "plan_id": f"{_slug(carrier)}-{state.lower()}-ho-{effective_date}",
        "carrier": carrier,
        "naic": naic,
        "state": state.upper(),
        "line": "homeowners",
        "serff_tracking": serff,
        "effective_date": effective_date,
        "forms_supported": ["TODO list only the forms this filing actually rates"],
        "filing_source": {"filename": pdf_name},
        "verification": {"status": "draft_unverified"},
        "notes": "\n".join(
            ["SEQUENCE NOTES FOUND IN THE FILING (the step order below is page "
             "order, NOT rating order -- fix it):"]
            + sequence_notes
            + ["", "FOOTNOTES (these change what tables mean):"]
            + footnotes
        ),
        "territory": territory or {
            "basis": "TODO zip | county | town | statewide",
            "entries": {},
            "source": {"page": 0, "note": "TODO no territory page was extracted"},
        },
        "base_rate_tables": base_rate_tables,
        "lookup_tables": lookup_tables,
        "steps": steps,
        "worksheets": worksheets,
    }


def write_draft(draft: Dict[str, Any], path: Path, source: str) -> Path:
    """Write the draft YAML behind its UNVERIFIED banner."""
    import datetime

    import yaml

    path.parent.mkdir(parents=True, exist_ok=True)
    banner = _BANNER.format(
        marker=UNVERIFIED_MARKER, source=source,
        when=datetime.datetime.now().isoformat(timespec="seconds"),
    )
    body = yaml.safe_dump(draft, sort_keys=False, allow_unicode=True, width=100)
    path.write_text(banner + body, encoding="utf-8")
    return path


# --------------------------------------------------------------------------
# CLI
# --------------------------------------------------------------------------


def cmd_triage(args: argparse.Namespace) -> int:
    signals = triage(args.pdf)
    candidates = [s for s in signals if s.is_candidate]
    print(f"{Path(args.pdf).name}: {len(signals)} pages, "
          f"{len(candidates)} worth extracting\n")
    print(f"{'pg':>4}  {'score':>5}  {'guess':<12} {'notes'}")
    print("-" * 100)
    for s in signals:
        if not (args.all or s.is_candidate):
            continue
        print(f"{s.page:>4}  {s.score:>5}  {s.guess:<12} "
              f"{'; '.join(s.reasons)[:70]}")
        if s.first_line:
            print(f"{'':>4}  {'':>5}  {'':<12} \"{s.first_line}\"")

    if any(not s.has_text_layer for s in signals):
        print("\n! Some pages have no text layer (scanned). Triage cannot see "
              "them; extract them from the page image.")
    print(f"\nNext: python -m src.extract jobs --pdf {args.pdf} "
          f"--carrier '...' --state {args.state}")
    return 0


def cmd_jobs(args: argparse.Namespace) -> int:
    pages = (
        [int(p) for p in args.pages.split(",")]
        if args.pages
        else [s.page for s in triage(args.pdf) if s.is_candidate]
    )
    if not pages:
        print("no candidate pages found; pass --pages explicitly", file=sys.stderr)
        return 1
    out = Path(args.out)
    write_jobs(Path(args.pdf), pages, out, args.carrier, args.state, args.dpi)
    print(f"wrote {len(pages)} page image(s) and prompt(s) to {out}\n")
    print("For each page: send the PNG plus its .prompt.md to a vision model and "
          f"save the JSON it returns as {out}/page-NNN.json\n"
          "Then: python -m src.extract draft --responses "
          f"{out} --carrier '{args.carrier}' --naic ... --state {args.state} "
          "--effective YYYY-MM-DD --out plans/draft.yaml")
    return 0


def cmd_draft(args: argparse.Namespace) -> int:
    responses = []
    for path in sorted(Path(args.responses).glob("*.json")):
        try:
            responses.append(json.loads(path.read_text(encoding="utf-8")))
        except json.JSONDecodeError as exc:
            print(f"! skipping {path.name}: {exc}", file=sys.stderr)
    if not responses:
        print(f"no JSON responses in {args.responses}", file=sys.stderr)
        return 1

    draft = build_draft(
        carrier=args.carrier, naic=args.naic, state=args.state,
        effective_date=args.effective, pdf_name=args.pdf_name or "unknown.pdf",
        responses=responses, serff=args.serff,
    )
    out = write_draft(draft, Path(args.out), args.pdf_name or args.responses)
    low = [
        (name, t["source"].get("confidence"))
        for name, t in {**draft["base_rate_tables"], **draft["lookup_tables"]}.items()
        if (t["source"].get("confidence") or 0) < 0.9
    ]
    print(f"wrote draft to {out}\n")
    print(f"  {len(draft['base_rate_tables'])} base rate table(s), "
          f"{len(draft['lookup_tables'])} lookup table(s), "
          f"{len(draft['worksheets'])} worksheet(s)")
    if low:
        print("\n  Low confidence -- read these against the PDF first:")
        for name, conf in low:
            print(f"    {name}: {conf}")
    if not draft["worksheets"]:
        print("\n  ! No worked example was extracted. Find one in the filing: "
              "without it there is no way to check the rating sequence.")
    print(f"\nThis draft will NOT rate a real risk while the {UNVERIFIED_MARKER} "
          f"marker is present. Work docs/verification_checklist.md.")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m src.extract",
        description="Human-in-the-loop helper for turning a filing PDF into a "
                    "draft rating plan. It does not parse tables; it finds the "
                    "pages and asks a vision model, then you check every one.",
    )
    sub = parser.add_subparsers(dest="command")

    t = sub.add_parser("triage", help="score pages for rate/factor tables")
    t.add_argument("--pdf", required=True)
    t.add_argument("--state", default="CT")
    t.add_argument("--all", action="store_true", help="show every page, not just candidates")
    t.set_defaults(func=cmd_triage)

    j = sub.add_parser("jobs", help="render page images and write extraction prompts")
    j.add_argument("--pdf", required=True)
    j.add_argument("--carrier", required=True)
    j.add_argument("--state", default="CT")
    j.add_argument("--pages", help="comma-separated page numbers (default: triage candidates)")
    j.add_argument("--out", default="work/extract")
    j.add_argument("--dpi", type=int, default=200)
    j.set_defaults(func=cmd_jobs)

    d = sub.add_parser("draft", help="assemble LLM responses into a draft plan")
    d.add_argument("--responses", required=True, help="directory of page-NNN.json files")
    d.add_argument("--carrier", required=True)
    d.add_argument("--naic", required=True)
    d.add_argument("--state", default="CT")
    d.add_argument("--effective", required=True, help="YYYY-MM-DD")
    d.add_argument("--serff")
    d.add_argument("--pdf-name")
    d.add_argument("--out", required=True)
    d.set_defaults(func=cmd_draft)

    return parser


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    if not getattr(args, "command", None):
        parser.print_help()
        return 1
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
