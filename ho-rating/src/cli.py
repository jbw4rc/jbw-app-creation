"""Command line interface.

    rate --address "742 Prospect Ave, Hartford, CT 06105" --coverage-a 450000 \
         --year-built 1978 --protection-class 4 --deductible 2500 \
         --forms HO2,HO3,HO5 --carriers all --as-of 2026-01-01

Produces a premium-by-carrier-by-form table plus a market range, and with
--trace dumps one carrier's full derivation.
"""

from __future__ import annotations

import argparse
import datetime as _dt
import json
import sys
from decimal import Decimal
from pathlib import Path
from typing import Dict, List, Optional, Sequence

from .interpreter import (
    PlanLibrary,
    RatingError,
    RatingResult,
    RatingStatus,
    load_plan,
    rate,
)
from .schema import ConstructionType, Occupancy, PropertyRisk, RatingPlan
from .territory import estimate_coverage_a

_REPO = Path(__file__).resolve().parent.parent
_DEFAULT_PLANS = _REPO / "plans"
_SAMPLE_PLANS = _REPO / "tests" / "fixtures"


# --------------------------------------------------------------------------
# Rendering
# --------------------------------------------------------------------------


def _money(v: Optional[Decimal]) -> str:
    return "-" if v is None else f"${v:,.0f}"


def _median(values: Sequence[Decimal]) -> Decimal:
    ordered = sorted(values)
    n = len(ordered)
    mid = n // 2
    if n % 2:
        return ordered[mid]
    return (ordered[mid - 1] + ordered[mid]) / 2


def render_comparison(
    grid: Dict[str, Dict[str, RatingResult]],
    forms: Sequence[str],
    errors: Dict[str, str],
) -> str:
    """The by-carrier-by-form table, with a market range per form."""
    carriers = list(grid)
    width = max([len(c) for c in carriers] + [len("Market median")]) + 2
    cell = 12

    lines = []
    header = "Carrier".ljust(width) + "".join(f.rjust(cell) for f in forms)
    lines += [header, "-" * len(header)]

    for carrier in carriers:
        row = carrier.ljust(width)
        for form in forms:
            result = grid[carrier].get(form)
            if result is None:
                text = "err"
            elif result.status is RatingStatus.NOT_WRITTEN:
                text = "not written"
            else:
                text = _money(result.premium)
            row += text.rjust(cell)
        lines.append(row)

    # Market range across carriers that actually write each form.
    rated: Dict[str, List[Decimal]] = {
        f: [
            g[f].premium
            for g in grid.values()
            if f in g and g[f].status is RatingStatus.RATED
        ]
        for f in forms
    }
    if any(rated.values()):
        lines.append("-" * len(header))
        for label, fn in [
            ("Market low", min),
            ("Market median", _median),
            ("Market high", max),
        ]:
            row = label.ljust(width)
            for form in forms:
                prems = rated[form]
                row += (_money(fn(prems)) if prems else "-").rjust(cell)
            lines.append(row)
        counts = "  ".join(f"{f}: {len(rated[f])}" for f in forms)
        lines.append(f"\nCarriers writing -- {counts}")

    if errors:
        lines.append("\nCould not rate:")
        for key, message in errors.items():
            lines.append(f"  {key}: {message}")

    warned = {
        w
        for by_form in grid.values()
        for result in by_form.values()
        for w in result.warnings
    }
    if warned:
        lines.append("")
        for w in sorted(warned):
            lines.append(f"  ! {w}")

    return "\n".join(lines)


def _as_json(grid: Dict[str, Dict[str, RatingResult]], errors: Dict[str, str]) -> str:
    payload = {
        "carriers": {
            carrier: {
                form: {
                    "status": r.status.value,
                    "premium": str(r.premium) if r.premium is not None else None,
                    "reason": r.reason,
                    "territory": r.territory_code,
                    "plan_id": r.plan_id,
                    "warnings": r.warnings,
                }
                for form, r in by_form.items()
            }
            for carrier, by_form in grid.items()
        },
        "errors": errors,
    }
    return json.dumps(payload, indent=2)


# --------------------------------------------------------------------------
# Building the risk
# --------------------------------------------------------------------------


def build_risk(args: argparse.Namespace) -> PropertyRisk:
    coverage_a = args.coverage_a
    estimated = False

    if coverage_a is None:
        if not args.square_feet:
            raise SystemExit(
                "error: --coverage-a is required (it is replacement cost, not market "
                "value). Pass --square-feet to use the crude estimator instead, but "
                "read its caveat: the result is indicative, not a quote."
            )
        est = estimate_coverage_a(
            args.square_feet, ConstructionType(args.construction), args.state
        )
        coverage_a = est.amount
        estimated = True
        print(
            f"Coverage A ESTIMATED at {_money(est.amount)} "
            f"(range {_money(est.low)}-{_money(est.high)})\n"
            f"  basis: {est.basis}\n  {est.caveat}\n",
            file=sys.stderr,
        )

    return PropertyRisk(
        address=args.address,
        zip_code=args.zip,
        county=args.county,
        town=args.town,
        state=args.state,
        coverage_a=coverage_a,
        coverage_a_estimated=estimated,
        year_built=args.year_built,
        square_feet=args.square_feet,
        construction_type=ConstructionType(args.construction),
        roof_year=args.roof_year if args.roof_year is not None else args.year_built,
        roof_material=args.roof_material,
        protection_class=args.protection_class,
        protection_class_estimated=args.protection_class_estimated,
        territory_code=args.territory,
        deductible=args.deductible,
        prior_claims=args.prior_claims,
        occupancy=Occupancy(args.occupancy),
        prior_term_premium=args.prior_premium,
        endorsements=args.endorsements,
    )


def load_library(args: argparse.Namespace) -> PlanLibrary:
    if args.demo:
        return PlanLibrary([load_plan(p) for p in sorted(_SAMPLE_PLANS.glob("*.yaml"))])
    directory = Path(args.plans)
    if not directory.exists():
        raise SystemExit(f"error: plans directory not found: {directory}")
    library = PlanLibrary.from_directory(directory)
    if not len(library):
        raise SystemExit(
            f"error: no rating plans in {directory}.\n"
            f"Download a filing into data/filings/, draft a plan with "
            f"`python -m src.extract`, verify it against "
            f"docs/verification_checklist.md, and save it here.\n"
            f"To see the engine work in the meantime: rate --demo ..."
        )
    return library


# --------------------------------------------------------------------------
# Commands
# --------------------------------------------------------------------------


def cmd_rate(args: argparse.Namespace) -> int:
    as_of = args.as_of or _dt.date.today()
    forms = [f.strip() for f in args.forms.split(",") if f.strip()]
    carriers = (
        None
        if args.carriers.strip().lower() == "all"
        else [c.strip() for c in args.carriers.split(",") if c.strip()]
    )

    risk = build_risk(args)
    library = load_library(args)
    plans = library.for_date(as_of, state=args.state, carriers=carriers)
    if not plans:
        raise SystemExit(
            f"error: no plan is in force in {args.state} on {as_of}"
            + (f" for {args.carriers}" if carriers else "")
        )

    grid: Dict[str, Dict[str, RatingResult]] = {}
    errors: Dict[str, str] = {}
    for plan in plans:
        grid[plan.carrier] = {}
        for form in forms:
            try:
                grid[plan.carrier][form] = rate(
                    plan, risk, form, as_of, allow_unverified=args.allow_unverified
                )
            except RatingError as exc:
                # Loud, but not fatal to the other cells: a market comparison is
                # still useful when one carrier cannot rate this risk.
                errors[f"{plan.carrier} {form}"] = str(exc)

    if args.json:
        print(_as_json(grid, errors))
    else:
        print(f"\n{risk.address or risk.zip_code or 'risk'} -- "
              f"Coverage A {_money(risk.coverage_a)}, "
              f"built {risk.year_built}, PC {risk.protection_class}, "
              f"deductible {_money(risk.deductible)} -- as of {as_of}\n")
        print(render_comparison(grid, forms, errors))

    if args.trace:
        wanted = args.trace.casefold()
        matches = [p for p in plans if wanted in p.carrier.casefold()]
        if not matches:
            print(f"\n--trace: no carrier matching '{args.trace}'", file=sys.stderr)
            return 1
        for plan in matches:
            for form in forms:
                result = grid.get(plan.carrier, {}).get(form)
                print("\n" + "=" * 72)
                if result is None:
                    print(f"{plan.carrier} -- {form}\n  ERROR: "
                          f"{errors.get(f'{plan.carrier} {form}')}")
                else:
                    print(result.render_trace())

    return 1 if errors and not any(
        r.status is RatingStatus.RATED for g in grid.values() for r in g.values()
    ) else 0


def cmd_plans(args: argparse.Namespace) -> int:
    library = load_library(args)
    print(f"{len(library)} plan(s)\n")
    for plan in sorted(library.plans, key=lambda p: (p.carrier, p.effective_date)):
        expiry = f" -> {plan.expiration_date}" if plan.expiration_date else ""
        mark = "" if plan.is_verified else "   [DRAFT -- UNVERIFIED]"
        print(f"  {plan.carrier}  ({plan.state}, NAIC {plan.naic})")
        print(f"    {plan.plan_id}")
        print(f"    effective {plan.effective_date}{expiry}   forms "
              f"{','.join(plan.forms_supported)}   SERFF {plan.serff_tracking or '-'}"
              f"{mark}")
        print(f"    {len(plan.steps)} steps, {len(plan.worksheets)} worksheet(s)\n")
    return 0


def cmd_validate(args: argparse.Namespace) -> int:
    """Run every plan's worksheets. A plan that cannot reproduce its own
    filing's worked example is not ready to quote with."""
    library = load_library(args)
    failures = 0
    for plan in library.plans:
        print(f"{plan.carrier} -- {plan.plan_id}")
        if not plan.worksheets:
            print("  NO WORKSHEETS -- this plan has never been checked against "
                  "its filing\n")
            failures += 1
            continue
        for ws in plan.worksheets:
            risk = PropertyRisk.model_validate(ws.risk)
            try:
                result = rate(plan, risk, ws.form, plan.effective_date,
                              allow_unverified=True)
                diff = abs(result.premium - ws.expected_premium)
                if diff <= ws.tolerance:
                    print(f"  PASS  {ws.name}: {_money(result.premium)}")
                else:
                    failures += 1
                    print(f"  FAIL  {ws.name} (filing p.{ws.source.page}): "
                          f"filing says {ws.expected_premium:,.2f}, engine says "
                          f"{result.premium:,.2f} (off by {diff:,.2f})")
                    if args.trace:
                        print(result.render_trace())
            except RatingError as exc:
                failures += 1
                print(f"  ERROR {ws.name}: {exc}")
        print()
    print("all worksheets reproduce their filing" if not failures
          else f"{failures} worksheet failure(s)")
    return 1 if failures else 0


# --------------------------------------------------------------------------
# Argument parsing
# --------------------------------------------------------------------------


def _date(value: str) -> _dt.date:
    return _dt.date.fromisoformat(value)


def _csv(value: str) -> List[str]:
    return [v.strip() for v in value.split(",") if v.strip()]


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="rate",
        description="Estimate homeowners premiums across carriers and forms "
                    "from filed rating plans.",
    )
    sub = parser.add_subparsers(dest="command")

    def add_common(p: argparse.ArgumentParser) -> None:
        p.add_argument("--plans", default=str(_DEFAULT_PLANS),
                       help=f"directory of plan YAML files (default: {_DEFAULT_PLANS})")
        p.add_argument("--demo", action="store_true",
                       help="use the bundled synthetic sample plan instead of --plans")
        p.add_argument("--allow-unverified", action="store_true",
                       help="rate against draft plans no human has checked "
                            "(results are flagged and untrustworthy)")

    rate_p = sub.add_parser("rate", help="rate a risk across carriers and forms")
    add_common(rate_p)
    loc = rate_p.add_argument_group("location")
    loc.add_argument("--address")
    loc.add_argument("--zip")
    loc.add_argument("--county")
    loc.add_argument("--town")
    loc.add_argument("--state", default="CT")
    loc.add_argument("--territory", help="override carrier territory resolution")

    prop = rate_p.add_argument_group("property")
    prop.add_argument("--coverage-a", type=Decimal,
                      help="Coverage A: REPLACEMENT COST, not market value")
    prop.add_argument("--year-built", type=int, required=True)
    prop.add_argument("--square-feet", type=int,
                      help="only used to estimate Coverage A when it is not given")
    prop.add_argument("--construction", default="frame",
                      choices=[c.value for c in ConstructionType])
    prop.add_argument("--roof-year", type=int,
                      help="defaults to --year-built (original roof)")
    prop.add_argument("--roof-material", default="composition")
    prop.add_argument("--protection-class", required=True,
                      help="ISO PPC. Licensed data -- it must be supplied.")
    prop.add_argument("--protection-class-estimated", action="store_true",
                      help="mark the PPC as an estimate so output is flagged")
    prop.add_argument("--occupancy", default="owner_occupied",
                      choices=[o.value for o in Occupancy])

    pol = rate_p.add_argument_group("policy")
    pol.add_argument("--deductible", type=Decimal, required=True)
    pol.add_argument("--prior-claims", type=int, default=0)
    pol.add_argument("--prior-premium", type=Decimal,
                     help="expiring premium, for plans with a renewal cap")
    pol.add_argument("--endorsements", type=_csv, default=[],
                     help="comma-separated, e.g. water_backup,ordinance_law")

    out = rate_p.add_argument_group("output")
    out.add_argument("--forms", default="HO2,HO3,HO5")
    out.add_argument("--carriers", default="all")
    out.add_argument("--as-of", type=_date,
                     help="rate against the plan version in force on this date")
    out.add_argument("--trace", metavar="CARRIER",
                     help="dump the full derivation for one carrier")
    out.add_argument("--json", action="store_true")
    rate_p.set_defaults(func=cmd_rate)

    plans_p = sub.add_parser("plans", help="list available rating plans")
    add_common(plans_p)
    plans_p.set_defaults(func=cmd_plans)

    val_p = sub.add_parser("validate",
                           help="check every plan against its filing's own worksheets")
    add_common(val_p)
    val_p.add_argument("--trace", action="store_true", help="dump traces for failures")
    val_p.set_defaults(func=cmd_validate)

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
