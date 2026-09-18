"""CLI for Phase 2 extraction.

Reads a filing directory produced by the scraper (containing ``manifest.json``
and downloaded PDFs) and writes a draft manual + review checklist.

    python -m extractor --filing data/raw/acme_ins/CT-ACME-123 \\
        --out data/reviews/acme_ins

You can also point it at loose PDFs with ``--pdf`` (repeatable).
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from extractor.draft import build_draft, write_draft


def _load_from_manifest(filing_dir: Path) -> tuple[str, str, str, str, list[Path]]:
    manifest_path = filing_dir / "manifest.json"
    if not manifest_path.exists():
        raise SystemExit(f"no manifest.json in {filing_dir}")
    meta = json.loads(manifest_path.read_text())
    pdfs = [filing_dir / f for f in meta.get("files", []) if str(f).lower().endswith(".pdf")]
    pdfs = [p for p in pdfs if p.exists()]
    if not pdfs:
        # fall back to every PDF in the dir
        pdfs = sorted(filing_dir.glob("**/*.pdf"))
    return (
        meta.get("company_name", filing_dir.parent.name),
        meta.get("serff_tracking_number", filing_dir.name),
        meta.get("line", "homeowners"),
        meta.get("effective_date", ""),
        pdfs,
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Extract a draft rating manual from a filing.")
    src = parser.add_mutually_exclusive_group(required=True)
    src.add_argument("--filing", type=Path, help="filing dir with manifest.json + PDFs")
    src.add_argument("--pdf", type=Path, action="append", help="loose PDF (repeatable)")
    parser.add_argument("--carrier", default="", help="carrier name (with --pdf)")
    parser.add_argument("--serff", default="", help="SERFF tracking (with --pdf)")
    parser.add_argument("--line", default="homeowners", choices=["homeowners", "flood"])
    parser.add_argument("--out", type=Path, required=True, help="output directory")
    parser.add_argument("--no-camelot", action="store_true", help="disable camelot fallback")
    args = parser.parse_args(argv)

    if args.filing:
        carrier, serff, line, eff, pdfs = _load_from_manifest(args.filing)
    else:
        carrier = args.carrier or "unknown"
        serff = args.serff
        line = args.line
        eff = ""
        pdfs = [p for p in (args.pdf or []) if p.exists()]

    if not pdfs:
        raise SystemExit("no PDFs to extract")

    print(f"Extracting {len(pdfs)} PDF(s) for {carrier} ({serff})...")
    result = build_draft(carrier, serff, pdfs, line=line, effective_date=eff,
                         camelot_fallback=not args.no_camelot)
    json_path, review_path = write_draft(result, args.out)
    print(f"  draft manual:  {json_path}")
    print(f"  review needed: {review_path}")
    if result.manual.gaps:
        print(f"  ⚠️  {len(result.manual.gaps)} gap(s) block full reproduction")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
