"""Pydantic models shared by the rating engine and the extractor schema.

The ``CarrierManual`` mirrors the normalized JSON described in the Phase 2 spec.
The engine treats every field as optional-where-possible so that a *partial*
manual (one with entries in ``gaps``) can still produce a flagged estimate
rather than crashing.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

Line = Literal["homeowners", "flood"]
DiscountType = Literal["multiplicative", "additive", "subtractive_pct"]


class BaseRate(BaseModel):
    """A single base-rate cell, keyed by territory and a Coverage A band."""

    territory: str
    coverage_a_band: str  # e.g. "0-200000", "200001-400000", "1000001+"
    rate: float


class Discount(BaseModel):
    name: str
    type: DiscountType = "multiplicative"
    value: float
    eligibility: str = ""


class Rounding(BaseModel):
    """Rounding rule. ``step`` is 'final' or the name of a rating-order step."""

    step: str = "final"
    method: Literal["nearest", "up", "down"] = "nearest"
    increment: float = 1.0


class CarrierManual(BaseModel):
    """Normalized rating manual for one carrier / filing.

    ``factors`` maps a factor name (which must appear in ``rating_order``) to a
    lookup table. Each table maps a *key* to a multiplier. A key is matched
    either exactly ("frame", "4") or as a numeric band ("0-5", "21+"). See
    :func:`engine.rating.lookup_factor`.
    """

    carrier: str
    serff_tracking: str = ""
    naic: str = ""
    effective_date: str = ""
    line: Line = "homeowners"

    base_rates: list[BaseRate] = Field(default_factory=list)

    # The exact operation order preserved from the manual's "order of
    # calculation" page. "base_rate" seeds the premium; every other entry must
    # be a key in ``factors``.
    rating_order: list[str] = Field(default_factory=lambda: ["base_rate"])

    factors: dict[str, dict[str, float]] = Field(default_factory=dict)
    discounts: list[Discount] = Field(default_factory=list)

    # Optional resolution helpers.
    territory_map: dict[str, str] = Field(default_factory=dict)  # zip -> territory
    minimum_premium: float | None = None
    rounding: Rounding | None = None

    # Anything confidential / missing that blocks full reproduction. A non-empty
    # list makes every quote from this manual "partial".
    gaps: list[str] = Field(default_factory=list)

    # Which home-profile attribute feeds each factor. Sensible defaults are
    # applied in the engine; override here when a manual is unusual.
    factor_inputs: dict[str, str] = Field(default_factory=dict)


class HomeProfile(BaseModel):
    """The subject home to be rated."""

    territory_or_zip: str
    coverage_a: float
    year_built: int | None = None
    construction: str | None = None
    protection_class: int | str | None = None
    roof_age: int | None = None
    deductible: int | None = None
    hurricane_deductible_pct: float | None = None
    discounts: list[str] = Field(default_factory=list)

    # Free-form extras a carrier factor might reference by name.
    extra: dict[str, Any] = Field(default_factory=dict)


class Step(BaseModel):
    """One auditable line of the premium calculation."""

    name: str
    kind: Literal["base_rate", "factor", "discount", "rounding", "minimum"]
    input_value: str = ""  # the resolved key we looked up (e.g. "frame", "4")
    factor: float | None = None  # the multiplier/adjustment applied
    running_premium: float
    note: str = ""


class QuoteResult(BaseModel):
    carrier: str
    serff_tracking: str = ""
    line: Line = "homeowners"
    premium: float
    partial: bool = False
    steps: list[Step] = Field(default_factory=list)
    gaps: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
