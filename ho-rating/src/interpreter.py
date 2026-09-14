"""The rating engine: one generic interpreter for every declarative plan.

Nothing in this file knows about any particular carrier. Adding a carrier means
adding a YAML file under ``plans/``; it must never mean editing this module.

Two behaviours are load-bearing and deliberate:

* **A missing lookup raises.** There is no fallback to 1.0 anywhere. The only
  way a plan can rate an unlisted value is an explicit, page-cited ``default``
  transcribed from an "all other" row in the filing.
* **Every step is traced**, including skipped ones and the reason they were
  skipped, with the page the number came from. If a premium cannot be explained
  line by line, it cannot be checked against the filing.
"""

from __future__ import annotations

import datetime as _dt
from dataclasses import dataclass, field
from decimal import (
    ROUND_DOWN,
    ROUND_HALF_EVEN,
    ROUND_HALF_UP,
    ROUND_UP,
    Decimal,
    InvalidOperation,
)
from enum import Enum
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

import yaml

from .schema import (
    AdditiveBasis,
    AdditiveStep,
    Band,
    BaseRatePoint,
    BaseRateSegment,
    BaseRateStep,
    BaseRateTable,
    Bounds,
    CapStep,
    Extrapolation,
    FactorStep,
    FloorStep,
    Interpolation,
    KeySpec,
    LookupTable,
    MatchType,
    PropertyRisk,
    RatingPlan,
    RoundStep,
    RoundingMethod,
    SourceRef,
    _normalize_form,
)

_THOUSAND = Decimal("1000")
_HUNDRED = Decimal("100")


# --------------------------------------------------------------------------
# Errors
# --------------------------------------------------------------------------


class RatingError(Exception):
    """Base class. Every failure here is loud on purpose."""


class PlanNotVerifiedError(RatingError):
    """The plan is still a draft from extract.py and no human has signed it off."""


class MissingAttributeError(RatingError):
    """A lookup needs a risk attribute that was not supplied (or was null).

    Distinct from NoMatchError: the question was never asked, rather than asked
    and unanswered.
    """


class NoMatchError(RatingError):
    """No table row covers this risk, and the filing states no 'all other' row."""


class AmbiguousMatchError(RatingError):
    """More than one row matched -- overlapping bands, almost always a
    transcription error in the plan file."""


class ExtrapolationError(RatingError):
    """Coverage A falls outside the range the filing rates."""


class PlanConfigurationError(RatingError):
    """The plan asks for something it did not supply (e.g. a capped increase
    with no expiring premium in the risk)."""


# --------------------------------------------------------------------------
# Results
# --------------------------------------------------------------------------


class RatingStatus(str, Enum):
    RATED = "rated"
    NOT_WRITTEN = "not_written"


def _show(value: Optional[Decimal]) -> str:
    """Render a Decimal for the trace: exact, but without the trailing zeros
    that accumulate as factors multiply (1414.500000 -> 1414.5)."""
    if value is None:
        return ""
    text = f"{value:f}"
    return text.rstrip("0").rstrip(".") if "." in text else text


@dataclass
class TraceEntry:
    """One line of the derivation."""

    step_id: str
    step_type: str
    description: Optional[str]
    source_page: Optional[int]
    premium_before: Optional[Decimal]
    premium_after: Optional[Decimal]
    inputs: Dict[str, Any] = field(default_factory=dict)
    matched: Optional[str] = None       # the row/segment that was selected
    operand: Optional[Decimal] = None   # the factor or dollar amount applied
    operation: Optional[str] = None     # 'set' | 'x' | '+' | 'cap' | 'floor' | 'round'
    skipped: bool = False
    skip_reason: Optional[str] = None
    note: Optional[str] = None

    def render(self) -> str:
        page = f"p.{self.source_page}" if self.source_page else "p.?"
        if self.skipped:
            return f"  {self.step_id:<20} {'skipped':<14} {page:<6}  ({self.skip_reason})"
        op = {"set": "=", "x": "x", "+": "+"}.get(self.operation or "", self.operation or "")
        operand = "" if self.operand is None else f"{op} {_show(self.operand)}"
        matched = f"  [{self.matched}]" if self.matched else ""
        note = f"  ({self.note})" if self.note else ""
        return (
            f"  {self.step_id:<20} {operand:<14} {page:<6}"
            f"  {_show(self.premium_after)}{matched}{note}"
        )


@dataclass
class RatingResult:
    plan_id: str
    carrier: str
    form: str
    as_of: _dt.date
    status: RatingStatus
    premium: Optional[Decimal] = None
    reason: Optional[str] = None          # why not_written
    territory_code: Optional[str] = None
    trace: List[TraceEntry] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)

    @property
    def rated(self) -> bool:
        return self.status is RatingStatus.RATED

    def render_trace(self) -> str:
        head = (
            f"{self.carrier} -- {self.form} -- as of {self.as_of}\n"
            f"plan {self.plan_id}"
            + (f"  territory {self.territory_code}" if self.territory_code else "")
        )
        if self.status is RatingStatus.NOT_WRITTEN:
            return f"{head}\n  NOT WRITTEN: {self.reason}"
        lines = [head, ""]
        lines += [e.render() for e in self.trace]
        lines += ["", f"  {'FINAL':<20} {'':<14} {'':<6}  {_show(self.premium)}"]
        for w in self.warnings:
            lines.append(f"  ! {w}")
        return "\n".join(lines)


# --------------------------------------------------------------------------
# Value comparison
# --------------------------------------------------------------------------


def _as_decimal(v: Any) -> Optional[Decimal]:
    """Best-effort numeric coercion. Returns None for things that are not
    numbers (including bools, which must never compare equal to 0/1 here)."""
    if isinstance(v, bool) or v is None:
        return None
    if isinstance(v, Decimal):
        return v
    if isinstance(v, (int, float, str)):
        try:
            return Decimal(str(v))
        except (InvalidOperation, ValueError):
            return None
    return None


def _scalar_equal(a: Any, b: Any, case_sensitive: bool = False) -> bool:
    """Equality across YAML's loose typing.

    '7' from a plan file and 7 from a risk must match, but 'frame' and 'Frame'
    match only when the key is not case-sensitive, and True never equals 1.
    """
    if isinstance(a, bool) or isinstance(b, bool):
        return bool(a) == bool(b) and isinstance(a, bool) == isinstance(b, bool)
    da, db = _as_decimal(a), _as_decimal(b)
    if da is not None and db is not None:
        return da == db
    sa, sb = str(a), str(b)
    return sa == sb if case_sensitive else sa.casefold() == sb.casefold()


def _in_band(value: Any, band: Band, bounds: Bounds) -> bool:
    dv = _as_decimal(value)
    if dv is None:
        return False
    if band.min is not None and dv < band.min:
        return False
    if band.max is not None:
        if bounds is Bounds.CLOSED:
            if dv > band.max:
                return False
        elif dv >= band.max:
            return False
    return True


def _coerce_band(cond: Any) -> Optional[Band]:
    """Plan files carry bands as {min, max}; pydantic may hand them back as a
    Band or (inside a loosely-typed dict) as a plain mapping."""
    if isinstance(cond, Band):
        return cond
    if isinstance(cond, dict) and ("min" in cond or "max" in cond):
        return Band.model_validate(cond)
    return None


def _matches_clause(value: Any, condition: Any, key: Optional[KeySpec] = None) -> bool:
    """Does ``value`` satisfy ``condition``?

    ``key`` supplies the declared semantics for a table lookup. When it is None
    (an ``applies_when`` clause) the shape of the condition decides: a band
    matches as a closed range, a list matches as membership, anything else as
    equality.
    """
    if value is None:
        return False

    band = _coerce_band(condition)
    if band is not None:
        bounds = key.bounds if key else Bounds.CLOSED
        return _in_band(value, band, bounds)

    if isinstance(condition, (list, tuple, set)):
        return any(_scalar_equal(value, c, key.case_sensitive if key else False)
                   for c in condition)

    return _scalar_equal(value, condition, key.case_sensitive if key else False)


def _applies(applies_when: Dict[str, Any], ctx: Dict[str, Any]) -> Tuple[bool, Optional[str]]:
    """Evaluate a step's gate.

    An absent or null attribute means "no" and skips the step -- unlike a table
    lookup, where an absent attribute is a hard error. That asymmetry is what
    lets a plan gate an endorsement charge on an endorsement nobody selected.
    """
    for attr, cond in applies_when.items():
        value = ctx.get(attr)
        if value is None:
            return False, f"{attr} not present"
        if not _matches_clause(value, cond, None):
            return False, f"{attr}={_fmt(value)} does not match {_fmt(cond)}"
    return True, None


def _fmt(v: Any) -> str:
    if isinstance(v, Band):
        if v.min is not None and v.min == v.max:
            return str(v.min)
        if v.max is None:
            return f"{v.min}+"
        if v.min is None:
            return f"<={v.max}"
        return f"{v.min}-{v.max}"
    if isinstance(v, dict):
        return "{" + ", ".join(f"{k}={_fmt(x)}" for k, x in v.items()) + "}"
    return str(v)


def _require(ctx: Dict[str, Any], attr: str, where: str) -> Any:
    if attr not in ctx or ctx[attr] is None:
        raise MissingAttributeError(
            f"{where} needs risk attribute '{attr}', which was not supplied. "
            f"Supply it rather than letting the engine assume a value."
        )
    return ctx[attr]


# --------------------------------------------------------------------------
# Table lookup
# --------------------------------------------------------------------------


def _filter_rows(
    rows: Sequence[Any],
    keys: Sequence[KeySpec],
    ctx: Dict[str, Any],
    where: str,
) -> List[Any]:
    """Narrow ``rows`` to those matching every key.

    Exact and band keys filter row by row. Nearest-below/above keys need to see
    all candidates at once, so they run afterwards: pick the best available key
    value, then keep only the rows carrying it.
    """
    candidates = list(rows)
    direct = [k for k in keys if k.match in (MatchType.EXACT, MatchType.BAND)]
    nearest = [k for k in keys if k.match in (MatchType.NEAREST_BELOW, MatchType.NEAREST_ABOVE)]

    for key in direct:
        value = _require(ctx, key.attribute, where)
        candidates = [r for r in candidates if _matches_clause(value, r.when[key.attribute], key)]
        if not candidates:
            return []

    for key in nearest:
        value = _as_decimal(_require(ctx, key.attribute, where))
        if value is None:
            raise MissingAttributeError(
                f"{where}: key '{key.attribute}' uses match={key.match.value}, "
                f"which needs a numeric value"
            )
        pairs = [(r, _as_decimal(r.when[key.attribute])) for r in candidates]
        pairs = [(r, d) for r, d in pairs if d is not None]
        if key.match is MatchType.NEAREST_BELOW:
            viable = [(r, d) for r, d in pairs if d <= value]
            best = max((d for _, d in viable), default=None)
        else:
            viable = [(r, d) for r, d in pairs if d >= value]
            best = min((d for _, d in viable), default=None)
        if best is None:
            return []
        candidates = [r for r, d in viable if d == best]

    return candidates


def lookup(table: LookupTable, ctx: Dict[str, Any], where: str) -> Tuple[Decimal, str, SourceRef]:
    """Resolve one factor/charge. Returns (value, matched-row label, source)."""
    matches = _filter_rows(table.rows, table.keys, ctx, where)

    if len(matches) > 1:
        raise AmbiguousMatchError(
            f"{where}: {len(matches)} rows match "
            f"{ {k.attribute: _fmt(ctx.get(k.attribute)) for k in table.keys} }. "
            f"Overlapping bands on p.{table.source.page} -- check the transcription."
        )

    if not matches:
        if table.default is not None:
            assert table.default_source is not None  # enforced by the schema
            return (
                table.default,
                f"default (filing's 'all other' row, p.{table.default_source.page})",
                table.default_source,
            )
        supplied = {k.attribute: _fmt(ctx.get(k.attribute)) for k in table.keys}
        raise NoMatchError(
            f"{where}: no row covers {supplied}. The table on p.{table.source.page} "
            f"states no 'all other' row, so this risk cannot be rated -- rather "
            f"than defaulting to 1.0. Either the risk is outside the filing's "
            f"appetite, or a row is missing from the plan file."
        )

    row = matches[0]
    label = _fmt(row.when) + (f" -- {row.note}" if row.note else "")
    return row.value, label, table.source


# --------------------------------------------------------------------------
# Base rate
# --------------------------------------------------------------------------


def _select_segment(table: BaseRateTable, ctx: Dict[str, Any], where: str) -> BaseRateSegment:
    if not table.keys:
        if len(table.segments) != 1:
            raise PlanConfigurationError(
                f"{where}: base rate table has no keys but {len(table.segments)} segments"
            )
        return table.segments[0]

    matches = _filter_rows(table.segments, table.keys, ctx, where)
    if len(matches) > 1:
        raise AmbiguousMatchError(
            f"{where}: {len(matches)} base rate segments match "
            f"{ {k.attribute: _fmt(ctx.get(k.attribute)) for k in table.keys} }"
        )
    if not matches:
        supplied = {k.attribute: _fmt(ctx.get(k.attribute)) for k in table.keys}
        raise NoMatchError(
            f"{where}: no base rate segment covers {supplied} "
            f"(table on p.{table.source.page})"
        )
    return matches[0]


def _bracket(points: Sequence[BaseRatePoint], amount: Decimal) -> Tuple[int, bool]:
    """Index of the highest point at or below ``amount``, and whether it is exact."""
    idx = 0
    for i, p in enumerate(points):
        if p.amount <= amount:
            idx = i
        else:
            break
    return idx, points[idx].amount == amount


def base_rate(
    table: BaseRateTable, ctx: Dict[str, Any], where: str
) -> Tuple[Decimal, str, SourceRef]:
    """Compute the base premium, honouring the filing's stated interpolation."""
    segment = _select_segment(table, ctx, where)
    source = segment.source or table.source
    raw = _require(ctx, table.amount_attribute, where)
    amount = _as_decimal(raw)
    if amount is None:
        raise MissingAttributeError(f"{where}: '{table.amount_attribute}' is not numeric: {raw!r}")

    points = segment.points
    seg_label = _fmt(segment.when) if segment.when else "single segment"
    lo, hi = points[0], points[-1]

    # ---- below the table -------------------------------------------------
    if amount < lo.amount:
        if table.below_min is Extrapolation.ERROR:
            raise ExtrapolationError(
                f"{where}: {table.amount_attribute} {amount} is below the lowest "
                f"amount the filing rates ({lo.amount}, p.{source.page}). The filing "
                f"gives no rate here."
            )
        if table.below_min is Extrapolation.CLAMP:
            return lo.premium, f"{seg_label} @ {lo.amount} (clamped from {amount})", source
        if lo.add_per_1000 is None:
            raise PlanConfigurationError(
                f"{where}: below_min=per_1000 needs add_per_1000 on the lowest point"
            )
        premium = lo.premium - (lo.amount - amount) / _THOUSAND * lo.add_per_1000
        return premium, f"{seg_label} @ {lo.amount} less {lo.add_per_1000}/1000", source

    # ---- above the table -------------------------------------------------
    if amount > hi.amount:
        cfg = table.above_max
        if cfg.max_amount is not None and amount > cfg.max_amount:
            raise ExtrapolationError(
                f"{where}: {table.amount_attribute} {amount} exceeds the filing's "
                f"stated maximum of {cfg.max_amount} (p.{source.page}) -- refer to "
                f"the company rather than extrapolating."
            )
        if cfg.method is Extrapolation.ERROR:
            raise ExtrapolationError(
                f"{where}: {table.amount_attribute} {amount} is above the highest "
                f"amount in the table ({hi.amount}, p.{source.page}) and the plan "
                f"states no rate for additional amounts."
            )
        if cfg.method is Extrapolation.CLAMP:
            return hi.premium, f"{seg_label} @ {hi.amount} (clamped from {amount})", source
        rate = cfg.rate_per_1000 or hi.add_per_1000
        if rate is None:
            raise PlanConfigurationError(f"{where}: above_max=per_1000 with no rate available")
        premium = hi.premium + (amount - hi.amount) / _THOUSAND * rate
        return (
            premium,
            f"{seg_label} @ {hi.amount} plus {(amount - hi.amount) / _THOUSAND}k x {rate}",
            source,
        )

    # ---- inside the table ------------------------------------------------
    idx, exact = _bracket(points, amount)
    point = points[idx]

    if exact:
        return point.premium, f"{seg_label} @ {point.amount} (exact breakpoint)", source

    if table.interpolation is Interpolation.EXACT:
        raise ExtrapolationError(
            f"{where}: the filing rates only the amounts listed on p.{source.page}; "
            f"{amount} is between {point.amount} and {points[idx + 1].amount}."
        )

    if table.interpolation is Interpolation.STEP:
        return point.premium, f"{seg_label} @ {point.amount} (step, no interpolation)", source

    if table.interpolation is Interpolation.PER_1000:
        if point.add_per_1000 is None:
            raise PlanConfigurationError(f"{where}: point {point.amount} has no add_per_1000")
        steps = (amount - point.amount) / _THOUSAND
        premium = point.premium + steps * point.add_per_1000
        return (
            premium,
            f"{seg_label} @ {point.amount} plus {steps}k x {point.add_per_1000}",
            source,
        )

    # LINEAR
    upper = points[idx + 1]
    span = upper.amount - point.amount
    frac = (amount - point.amount) / span
    premium = point.premium + frac * (upper.premium - point.premium)
    return premium, f"{seg_label} linear {point.amount}->{upper.amount}", source


# --------------------------------------------------------------------------
# Rounding
# --------------------------------------------------------------------------

_ROUNDING = {
    RoundingMethod.HALF_UP: ROUND_HALF_UP,
    RoundingMethod.HALF_EVEN: ROUND_HALF_EVEN,
    RoundingMethod.UP: ROUND_UP,
    RoundingMethod.DOWN: ROUND_DOWN,
}


def apply_rounding(premium: Decimal, method: RoundingMethod, to: Decimal) -> Decimal:
    """Round to a quantum: to=1 gives whole dollars, to=0.01 gives cents."""
    units = (premium / to).quantize(Decimal("1"), rounding=_ROUNDING[method])
    return (units * to).normalize() + Decimal("0")


# --------------------------------------------------------------------------
# The interpreter
# --------------------------------------------------------------------------


def rate(
    plan: RatingPlan,
    risk: PropertyRisk,
    form: str,
    as_of: Optional[_dt.date] = None,
    allow_unverified: bool = False,
) -> RatingResult:
    """Rate one risk against one plan for one form.

    Raises on anything it cannot derive. The only soft outcome is NOT_WRITTEN,
    which means the plan does not cover this form or occupancy at all -- as
    opposed to covering it and lacking a rate, which raises.
    """
    from .territory import resolve_territory, TerritoryNotFound  # local: avoids a cycle

    as_of = as_of or _dt.date.today()
    form = _normalize_form(form)
    result = RatingResult(
        plan_id=plan.plan_id,
        carrier=plan.carrier,
        form=form,
        as_of=as_of,
        status=RatingStatus.RATED,
    )

    if not plan.is_verified and not allow_unverified:
        raise PlanNotVerifiedError(
            f"plan '{plan.plan_id}' is {plan.verification.status.value}: a human has "
            f"not checked it against the filing. Work the checklist in "
            f"docs/verification_checklist.md, then set verification.status=verified. "
            f"Pass allow_unverified=True only for inspecting a draft."
        )
    if not plan.is_verified:
        result.warnings.append("PLAN UNVERIFIED -- these numbers are not trustworthy")

    if form not in plan.forms_supported:
        result.status = RatingStatus.NOT_WRITTEN
        result.reason = (
            f"{plan.carrier} does not write {form} in {plan.state} under this filing "
            f"(forms filed: {', '.join(plan.forms_supported)})"
        )
        return result

    if risk.occupancy not in plan.occupancy_supported:
        result.status = RatingStatus.NOT_WRITTEN
        result.reason = (
            f"{plan.carrier} does not write {risk.occupancy.value} risks under this filing"
        )
        return result

    # Territory is carrier-specific, so it resolves against *this* plan.
    if risk.territory_code is None:
        try:
            resolution = resolve_territory(plan, risk)
        except TerritoryNotFound as exc:
            result.status = RatingStatus.NOT_WRITTEN
            result.reason = str(exc)
            return result
        risk = risk.model_copy(update={"territory_code": resolution.code})
        if resolution.note:
            result.warnings.append(resolution.note)
    result.territory_code = risk.territory_code

    if risk.coverage_a_estimated:
        result.warnings.append(
            "coverage_a is an ESTIMATE (replacement cost was not supplied); "
            "treat the premium as indicative only"
        )
    if risk.protection_class_estimated:
        result.warnings.append(
            "protection_class is an ESTIMATE, not verified ISO PPC -- low confidence"
        )

    ctx = risk.context(as_of, form)
    premium = Decimal("0")

    for step in plan.steps:
        page = step.source.page if step.source else None
        where = f"plan '{plan.plan_id}' step '{step.id}'"

        if step.applies_when:
            ok, why = _applies(step.applies_when, ctx)
            if not ok:
                result.trace.append(
                    TraceEntry(
                        step_id=step.id,
                        step_type=step.type,
                        description=step.description,
                        source_page=page,
                        premium_before=premium,
                        premium_after=premium,
                        skipped=True,
                        skip_reason=why,
                    )
                )
                continue

        before = premium
        entry = TraceEntry(
            step_id=step.id,
            step_type=step.type,
            description=step.description,
            source_page=page,
            premium_before=before,
            premium_after=before,
        )

        if isinstance(step, BaseRateStep):
            table = plan.base_rate_tables[step.table]
            value, label, source = base_rate(table, ctx, where)
            premium = value
            entry.operation = "set"
            entry.operand = value
            entry.matched = label
            entry.source_page = source.page
            entry.inputs = {table.amount_attribute: ctx.get(table.amount_attribute)}
            entry.inputs.update({k.attribute: ctx.get(k.attribute) for k in table.keys})

        elif isinstance(step, FactorStep):
            table = plan.lookup_tables[step.table]
            value, label, source = lookup(table, ctx, where)
            premium = premium * value
            entry.operation = "x"
            entry.operand = value
            entry.matched = label
            entry.source_page = source.page
            entry.inputs = {k.attribute: ctx.get(k.attribute) for k in table.keys}

        elif isinstance(step, AdditiveStep):
            if step.table is not None:
                table = plan.lookup_tables[step.table]
                value, label, source = lookup(table, ctx, where)
                entry.matched = label
                entry.source_page = source.page
                entry.inputs = {k.attribute: ctx.get(k.attribute) for k in table.keys}
            else:
                value = step.amount  # type: ignore[assignment]
                assert value is not None

            if step.basis is AdditiveBasis.FLAT:
                amount = value
            elif step.basis is AdditiveBasis.PER_1000_COVERAGE_A:
                cov = _as_decimal(_require(ctx, "coverage_a", where))
                amount = value * (cov / _THOUSAND)  # type: ignore[operator]
                entry.note = f"{value}/1000 x {cov}"
            else:  # PERCENT_OF_RUNNING
                amount = premium * value / _HUNDRED
                entry.note = f"{value}% of {premium}"
            premium = premium + amount
            entry.operation = "+"
            entry.operand = amount

        elif isinstance(step, CapStep):
            caps: List[Tuple[Decimal, str]] = []
            if step.max_premium is not None:
                caps.append((step.max_premium, "max premium"))
            if step.max_increase_pct is not None:
                prior = _as_decimal(ctx.get("prior_term_premium"))
                if prior is None:
                    raise PlanConfigurationError(
                        f"{where}: max_increase_pct needs risk.prior_term_premium. "
                        f"Gate the step with applies_when: {{has_prior_term_premium: true}} "
                        f"if it is meant to apply on renewal only."
                    )
                caps.append(
                    (prior * (_HUNDRED + step.max_increase_pct) / _HUNDRED,
                     f"{step.max_increase_pct}% over prior {prior}")
                )
            ceiling, label = min(caps, key=lambda c: c[0])
            entry.operation = "cap"
            entry.operand = ceiling
            entry.matched = label
            if premium > ceiling:
                premium = ceiling
            else:
                entry.note = "not binding"

        elif isinstance(step, FloorStep):
            entry.operation = "floor"
            entry.operand = step.min_premium
            if premium < step.min_premium:
                premium = step.min_premium
                entry.matched = "minimum premium applied"
            else:
                entry.note = "not binding"

        elif isinstance(step, RoundStep):
            premium = apply_rounding(premium, step.method, step.to)
            entry.operation = "round"
            entry.operand = step.to
            entry.matched = f"{step.method.value} to {step.to}"

        else:  # pragma: no cover -- the discriminated union makes this unreachable
            raise PlanConfigurationError(f"{where}: unknown step type {step.type!r}")

        entry.premium_after = premium
        result.trace.append(entry)

    result.premium = premium
    return result


def rate_forms(
    plan: RatingPlan,
    risk: PropertyRisk,
    forms: Iterable[str],
    as_of: Optional[_dt.date] = None,
    allow_unverified: bool = False,
) -> Dict[str, RatingResult]:
    """Rate several forms against one plan.

    Form is just another factor lookup, so this is a plain loop; a form the plan
    does not file comes back NOT_WRITTEN rather than as a number.
    """
    return {
        _normalize_form(f): rate(plan, risk, f, as_of, allow_unverified)
        for f in forms
    }


# --------------------------------------------------------------------------
# Loading plans, and picking the version in force
# --------------------------------------------------------------------------


def load_plan(path: Path | str) -> RatingPlan:
    with open(path, "r", encoding="utf-8") as fh:
        raw = yaml.safe_load(fh)
    if not isinstance(raw, dict):
        raise RatingError(f"{path}: not a YAML mapping")
    if raw.pop("UNVERIFIED", None):
        # extract.py stamps this marker on every draft. While it is present the
        # plan is a draft whatever its verification block claims, so removing it
        # has to be a deliberate act by whoever checked the tables.
        raw["verification"] = {
            **(raw.get("verification") or {}),
            "status": "draft_unverified",
            "verified_by": None,
            "verified_on": None,
        }
    try:
        return RatingPlan.model_validate(raw)
    except Exception as exc:
        raise RatingError(f"{path}: {exc}") from exc


class PlanLibrary:
    """Every plan on disk, indexed so as-of-date rating can pick a version.

    A carrier files a new rating plan every year or two; ``for_date`` selects the
    version in force on the date being rated, not merely the newest one.
    """

    def __init__(self, plans: Sequence[RatingPlan] = ()):
        self.plans: List[RatingPlan] = list(plans)

    @classmethod
    def from_directory(cls, directory: Path | str, skip_invalid: bool = False) -> "PlanLibrary":
        directory = Path(directory)
        plans: List[RatingPlan] = []
        errors: List[str] = []
        for path in sorted(directory.rglob("*.y*ml")):
            try:
                plans.append(load_plan(path))
            except RatingError as exc:
                if not skip_invalid:
                    raise
                errors.append(str(exc))
        lib = cls(plans)
        lib.load_errors = errors  # type: ignore[attr-defined]
        return lib

    def __len__(self) -> int:
        return len(self.plans)

    def carriers(self, state: Optional[str] = None) -> List[str]:
        seen = {p.carrier for p in self.plans if state is None or p.state == state.upper()}
        return sorted(seen)

    def for_date(
        self,
        as_of: _dt.date,
        state: Optional[str] = None,
        carriers: Optional[Sequence[str]] = None,
        line: str = "homeowners",
    ) -> List[RatingPlan]:
        """One plan per carrier: the version effective on ``as_of``.

        ``carriers`` matches on a case-insensitive substring, so "Housatonic"
        finds "Housatonic Casualty Company" -- nobody types a carrier's full
        legal name at a prompt.
        """
        wanted = [c.casefold() for c in carriers] if carriers else None
        by_carrier: Dict[Tuple[str, str], RatingPlan] = {}
        for plan in self.plans:
            if plan.line != line:
                continue
            if state and plan.state != state.upper():
                continue
            if wanted and not any(w in plan.carrier.casefold() for w in wanted):
                continue
            if not plan.effective_on(as_of):
                continue
            key = (plan.carrier, plan.state)
            incumbent = by_carrier.get(key)
            if incumbent is None or plan.effective_date > incumbent.effective_date:
                by_carrier[key] = plan
        return sorted(by_carrier.values(), key=lambda p: p.carrier)
