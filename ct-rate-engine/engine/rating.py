"""Core rating math.

The engine is deliberately generic: it walks the carrier's stated
``rating_order``, applies each factor as a multiplier, then applies discounts,
rounding, and a minimum premium. Every operation appends a :class:`Step` so the
result is fully auditable.

Design choices worth knowing:
  * A base-rate cell holds the **base premium** for a territory + Coverage A
    band (not a rate-per-$1000). This matches the common homeowners layout where
    the base table is already keyed by amount of insurance. If a manual is a
    true per-$1000 loss cost, set ``factor_inputs`` and add a ``coverage_a_amount``
    factor to scale it — the algorithm stays the same.
  * A missing factor key or missing profile input is **non-fatal**: the step is
    recorded with factor 1.0 and a warning, and the quote is flagged partial.
    We never silently guess a number.
"""

from __future__ import annotations

import datetime as _dt

from engine.models import (
    CarrierManual,
    Discount,
    HomeProfile,
    QuoteResult,
    Rounding,
    Step,
)

# Factor name -> home-profile attribute it reads. Overridable per manual via
# CarrierManual.factor_inputs.
_DEFAULT_FACTOR_INPUTS: dict[str, str] = {
    "territory": "territory_or_zip",
    "protection_class": "protection_class",
    "construction": "construction",
    "roof_age": "roof_age",
    "age_of_home": "age_of_home",  # derived; see _resolve_input
    "deductible": "deductible",
    "wind_hurricane_deductible": "hurricane_deductible_pct",
    "coverage_a_amount": "coverage_a",
}


def _parse_band(key: str) -> tuple[float, float] | None:
    """Interpret a factor/band key as a numeric interval, or return None.

    Supported forms: ``"6-10"``, ``"21+"``, ``"-5"`` / ``"<=5"``, exact numbers
    fall through to None so the caller tries exact matching first.
    """

    k = key.strip()
    try:
        # A bare number is not a band.
        float(k)
        return None
    except ValueError:
        pass

    if k.endswith("+"):
        try:
            return (float(k[:-1]), float("inf"))
        except ValueError:
            return None
    if k.startswith("<=") or k.startswith("-"):
        raw = k[2:] if k.startswith("<=") else k[1:]
        try:
            return (float("-inf"), float(raw))
        except ValueError:
            return None
    if "-" in k:
        lo, _, hi = k.partition("-")
        try:
            return (float(lo), float(hi))
        except ValueError:
            return None
    return None


def lookup_factor(table: dict[str, float], value: object) -> tuple[str | None, float | None]:
    """Resolve ``value`` against a factor table.

    Tries an exact string-key match first (e.g. "frame", "4"), then numeric band
    containment (e.g. roof_age 8 -> "6-10"). Returns ``(matched_key, multiplier)``
    or ``(None, None)`` when nothing matches.
    """

    if value is None:
        return (None, None)

    svalue = str(value).strip()
    if svalue in table:
        return (svalue, table[svalue])

    # Normalize e.g. 4 vs "4.0"
    try:
        nvalue = float(svalue)
        for key, mult in table.items():
            if _parse_band(key) is None:
                try:
                    if float(key) == nvalue:
                        return (key, mult)
                except ValueError:
                    continue
        for key, mult in table.items():
            band = _parse_band(key)
            if band and band[0] <= nvalue <= band[1]:
                return (key, mult)
    except ValueError:
        return (None, None)

    return (None, None)


def _resolve_input(
    manual: CarrierManual, profile: HomeProfile, factor_name: str, as_of_year: int
) -> object:
    """Return the raw profile value that feeds ``factor_name``."""

    attr = manual.factor_inputs.get(factor_name) or _DEFAULT_FACTOR_INPUTS.get(factor_name)

    if factor_name == "age_of_home" or attr == "age_of_home":
        if profile.year_built is None:
            return None
        return as_of_year - profile.year_built

    if attr and hasattr(profile, attr):
        return getattr(profile, attr)

    # Fall back to free-form extras (keyed by factor name or mapped attr).
    if attr and attr in profile.extra:
        return profile.extra[attr]
    return profile.extra.get(factor_name)


def _resolve_territory(manual: CarrierManual, profile: HomeProfile) -> str:
    """Map the profile's territory_or_zip to a rating territory."""

    raw = str(profile.territory_or_zip).strip()
    if raw in manual.territory_map:
        return manual.territory_map[raw]
    return raw


def _pick_base_rate(
    manual: CarrierManual, territory: str, coverage_a: float
) -> tuple[object, str]:
    """Find the base-rate cell for a territory + coverage amount.

    Returns ``(rate_or_None, note)``.
    """

    territory_cells = [b for b in manual.base_rates if b.territory == territory]
    if not territory_cells:
        # Some manuals file a single statewide table (territory "*" or "ALL").
        territory_cells = [
            b for b in manual.base_rates if b.territory in ("*", "ALL", "STATEWIDE")
        ]
        if not territory_cells:
            return (None, f"no base-rate rows for territory {territory!r}")

    for cell in territory_cells:
        band = _parse_band(cell.coverage_a_band)
        if band is None:
            # Exact amount key.
            try:
                if float(cell.coverage_a_band) == coverage_a:
                    return (cell.rate, "")
            except ValueError:
                continue
        elif band[0] <= coverage_a <= band[1]:
            return (cell.rate, "")

    return (None, f"coverage_a {coverage_a:.0f} outside any band for territory {territory!r}")


def _apply_rounding(premium: float, rounding: Rounding) -> float:
    inc = rounding.increment or 1.0
    n = premium / inc
    if rounding.method == "up":
        import math

        n = math.ceil(n)
    elif rounding.method == "down":
        import math

        n = math.floor(n)
    else:
        n = round(n)
    return n * inc


def quote(
    manual: CarrierManual, profile: HomeProfile, as_of_year: int | None = None
) -> QuoteResult:
    """Compute an auditable premium estimate for ``profile`` under ``manual``."""

    as_of_year = as_of_year or _dt.date.today().year
    steps: list[Step] = []
    warnings: list[str] = []
    partial = bool(manual.gaps)

    territory = _resolve_territory(manual, profile)

    # --- seed: base rate ---
    base, base_note = _pick_base_rate(manual, territory, profile.coverage_a)
    base_missing = base is None
    if base is None:
        premium = 0.0
        partial = True
        warnings.append(base_note)
        steps.append(
            Step(
                name="base_rate",
                kind="base_rate",
                input_value=f"{territory}/{profile.coverage_a:.0f}",
                factor=None,
                running_premium=0.0,
                note=base_note,
            )
        )
    else:
        premium = float(base)
        steps.append(
            Step(
                name="base_rate",
                kind="base_rate",
                input_value=f"{territory}/{profile.coverage_a:.0f}",
                factor=premium,
                running_premium=premium,
                note="base premium for territory + Coverage A band",
            )
        )

    # --- factors, in the carrier's stated order ---
    for name in manual.rating_order:
        if name == "base_rate":
            continue
        table = manual.factors.get(name)
        if not table:
            warnings.append(f"rating_order references factor {name!r} with no table")
            partial = True
            steps.append(
                Step(name=name, kind="factor", input_value="", factor=1.0,
                     running_premium=premium, note="no factor table; treated as 1.0")
            )
            continue

        raw_input = _resolve_input(manual, profile, name, as_of_year)
        key, mult = lookup_factor(table, raw_input)
        if mult is None:
            warnings.append(
                f"could not resolve {name!r} for input {raw_input!r}; treated as 1.0"
            )
            partial = True
            steps.append(
                Step(name=name, kind="factor", input_value=str(raw_input),
                     factor=1.0, running_premium=premium,
                     note="unmatched; treated as 1.0")
            )
            continue

        premium *= mult
        steps.append(
            Step(name=name, kind="factor", input_value=f"{raw_input} -> {key}",
                 factor=mult, running_premium=premium)
        )

    # --- discounts ---
    for disc in manual.discounts:
        if disc.name not in profile.discounts:
            continue
        premium = _apply_discount(premium, disc)
        steps.append(
            Step(name=disc.name, kind="discount", input_value=disc.type,
                 factor=disc.value, running_premium=premium,
                 note=disc.eligibility)
        )

    # A void base rate means there is nothing to round or floor — leave the
    # premium at 0 so the caller sees the calculation could not be completed.
    if base_missing:
        return QuoteResult(
            carrier=manual.carrier,
            serff_tracking=manual.serff_tracking,
            line=manual.line,
            premium=0.0,
            partial=True,
            steps=steps,
            gaps=list(manual.gaps),
            warnings=warnings,
        )

    # --- rounding (final) ---
    if manual.rounding and manual.rounding.step == "final":
        rounded = _apply_rounding(premium, manual.rounding)
        steps.append(
            Step(name="rounding", kind="rounding",
                 input_value=f"{manual.rounding.method}/{manual.rounding.increment}",
                 factor=None, running_premium=rounded)
        )
        premium = rounded

    # --- minimum premium ---
    if manual.minimum_premium is not None and premium < manual.minimum_premium:
        steps.append(
            Step(name="minimum_premium", kind="minimum",
                 input_value=str(manual.minimum_premium), factor=None,
                 running_premium=manual.minimum_premium,
                 note="premium raised to filed minimum")
        )
        premium = manual.minimum_premium

    return QuoteResult(
        carrier=manual.carrier,
        serff_tracking=manual.serff_tracking,
        line=manual.line,
        premium=round(premium, 2),
        partial=partial,
        steps=steps,
        gaps=list(manual.gaps),
        warnings=warnings,
    )


def _apply_discount(premium: float, disc: Discount) -> float:
    if disc.type == "multiplicative":
        return premium * disc.value
    if disc.type == "subtractive_pct":
        return premium * (1.0 - disc.value)
    if disc.type == "additive":
        return premium + disc.value
    return premium
