"""CLI: ``python -m engine.quote --profile home.json``.

Loads every carrier manual under ``data/carriers/`` (or a chosen directory) and
prints a side-by-side, step-by-step premium breakdown for the given home.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from engine.models import CarrierManual, HomeProfile, QuoteResult
from engine.rating import quote

DEFAULT_CARRIERS_DIR = Path(__file__).resolve().parent.parent / "data" / "carriers"


def load_manuals(carriers_dir: Path) -> list[CarrierManual]:
    manuals: list[CarrierManual] = []
    for path in sorted(carriers_dir.glob("*.json")):
        try:
            manuals.append(CarrierManual.model_validate_json(path.read_text()))
        except Exception as exc:  # noqa: BLE001 - report and continue
            print(f"! skipping {path.name}: {exc}", file=sys.stderr)
    return manuals


def _format_result(res: QuoteResult) -> str:
    flag = "  [PARTIAL]" if res.partial else ""
    lines = [f"== {res.carrier} ({res.line}){flag} — estimated premium: ${res.premium:,.2f}"]
    if res.serff_tracking:
        lines.append(f"   SERFF: {res.serff_tracking}")
    for step in res.steps:
        factor = f"x{step.factor}" if step.kind == "factor" else (
            f"={step.factor}" if step.factor is not None else ""
        )
        note = f"  ({step.note})" if step.note else ""
        lines.append(
            f"   {step.kind:<10} {step.name:<24} {step.input_value:<22} "
            f"{factor:<10} -> ${step.running_premium:,.2f}{note}"
        )
    if res.warnings:
        lines.append("   warnings:")
        lines.extend(f"     - {w}" for w in res.warnings)
    if res.gaps:
        lines.append("   gaps (block full reproduction):")
        lines.extend(f"     - {g}" for g in res.gaps)
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Estimate premiums across CT carriers.")
    parser.add_argument("--profile", required=True, type=Path, help="home profile JSON")
    parser.add_argument(
        "--carriers-dir", type=Path, default=DEFAULT_CARRIERS_DIR,
        help="directory of per-carrier manual JSONs (default: data/carriers)",
    )
    parser.add_argument("--as-of-year", type=int, default=None, help="override rating year")
    parser.add_argument("--json", action="store_true", help="emit machine-readable JSON")
    args = parser.parse_args(argv)

    profile = HomeProfile.model_validate_json(args.profile.read_text())
    manuals = load_manuals(args.carriers_dir)
    if not manuals:
        print(f"No carrier manuals found in {args.carriers_dir}", file=sys.stderr)
        return 1

    results = [quote(m, profile, as_of_year=args.as_of_year) for m in manuals]
    results.sort(key=lambda r: (r.partial, r.premium))

    if args.json:
        print(json.dumps([r.model_dump() for r in results], indent=2))
    else:
        for res in results:
            print(_format_result(res))
            print()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
