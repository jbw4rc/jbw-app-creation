"""Declarative rating-plan schema and risk input model.

Design rule for this whole project: *rating plans are data, not code*. Every
carrier's rating logic lives in a YAML file validated by the models below, and
one generic interpreter (``interpreter.py``) executes it. Adding a carrier must
never require editing Python.

Two properties of this schema exist specifically to prevent silent wrongness:

1. Nothing defaults to 1.0. A lookup that does not match raises. A table may
   carry a ``default`` only if the filing itself states an "all other" row, and
   the default must cite the page where that row appears.
2. Lookup semantics are explicit per key (``exact`` / ``band`` / ``nearest_below``
   / ``nearest_above``), including band inclusivity. Filings disagree about this
   and guessing produces plausible-looking wrong premiums.
"""

from __future__ import annotations

import datetime as _dt
from decimal import Decimal
from enum import Enum
from typing import Annotated, Any, Dict, List, Literal, Optional, Union

from pydantic import (
    BaseModel,
    BeforeValidator,
    ConfigDict,
    Field,
    field_validator,
    model_validator,
)

# --------------------------------------------------------------------------
# Scalar helpers
# --------------------------------------------------------------------------


def _to_decimal(v: Any) -> Any:
    """Coerce YAML numbers to Decimal via str() so 1.05 stays 1.05.

    Going through float() first would give Decimal('1.0500000000000000444'),
    which defeats the point of rating in Decimal at all.
    """
    if isinstance(v, Decimal):
        return v
    if isinstance(v, bool):  # bool is an int subclass; never a money value
        raise ValueError("boolean is not a numeric value")
    if isinstance(v, (int, float, str)):
        return Decimal(str(v))
    return v


Money = Annotated[Decimal, BeforeValidator(_to_decimal)]
Factor = Annotated[Decimal, BeforeValidator(_to_decimal)]
Number = Annotated[Decimal, BeforeValidator(_to_decimal)]


class StrictModel(BaseModel):
    """Reject unknown keys.

    A typo in a plan file (``territory_code`` vs ``territory``) must fail at load
    time, not quietly rate as if the step were absent.
    """

    model_config = ConfigDict(extra="forbid", frozen=True)


# --------------------------------------------------------------------------
# Enumerations
# --------------------------------------------------------------------------


class MatchType(str, Enum):
    """How a lookup key is compared against the risk's attribute value."""

    EXACT = "exact"                # value must equal the row key
    BAND = "band"                  # row key is a {min, max} range
    NEAREST_BELOW = "nearest_below"  # largest row key <= value
    NEAREST_ABOVE = "nearest_above"  # smallest row key >= value


class Bounds(str, Enum):
    """Band inclusivity. Filings print '0-5' and '6-10' (closed) for integers,
    but '$200,000 to $250,000' brackets for continuous amounts are usually
    min-inclusive / max-exclusive. The plan must say which."""

    CLOSED = "closed"        # min <= v <= max
    HALF_OPEN = "half_open"  # min <= v <  max


class Interpolation(str, Enum):
    """How a base-rate table behaves between its stated coverage breakpoints."""

    EXACT = "exact"        # coverage must land exactly on a breakpoint
    STEP = "step"          # use the breakpoint at or below (no interpolation)
    LINEAR = "linear"      # straight-line between the two bracketing points
    PER_1000 = "per_1000"  # breakpoint premium + increments of $1,000 above it


class Extrapolation(str, Enum):
    """What to do when coverage A falls outside the table's stated range."""

    ERROR = "error"        # refuse to rate (the safe default)
    PER_1000 = "per_1000"  # continue with the boundary row's per-$1,000 rate
    CLAMP = "clamp"        # use the boundary row's premium unchanged


class RoundingMethod(str, Enum):
    HALF_UP = "half_up"
    HALF_EVEN = "half_even"
    UP = "up"      # always away from zero
    DOWN = "down"  # always toward zero (truncate)


class AdditiveBasis(str, Enum):
    """Unit in which an additive charge/credit is expressed."""

    FLAT = "flat"                            # a dollar amount
    PER_1000_COVERAGE_A = "per_1000_coverage_a"  # dollars per $1,000 of Cov A
    PERCENT_OF_RUNNING = "percent_of_running"    # % of premium so far


class VerificationStatus(str, Enum):
    """Whether a human has checked this plan against the filing PDF.

    ``extract.py`` always emits ``draft_unverified``. The interpreter refuses to
    rate such a plan unless explicitly allowed, so a half-reviewed draft cannot
    leak into a quoted number.
    """

    DRAFT_UNVERIFIED = "draft_unverified"
    VERIFIED = "verified"


class ConstructionType(str, Enum):
    FRAME = "frame"
    MASONRY = "masonry"
    MASONRY_VENEER = "masonry_veneer"
    FIRE_RESISTIVE = "fire_resistive"
    OTHER = "other"


class Occupancy(str, Enum):
    OWNER_OCCUPIED = "owner_occupied"
    TENANT_OCCUPIED = "tenant_occupied"
    SEASONAL = "seasonal"
    VACANT = "vacant"


class TerritoryBasis(str, Enum):
    ZIP = "zip"
    ZIP_PLUS_4 = "zip_plus_4"
    COUNTY = "county"
    TOWN = "town"
    STATEWIDE = "statewide"


# --------------------------------------------------------------------------
# Provenance
# --------------------------------------------------------------------------


class SourceRef(StrictModel):
    """Where in the filing PDF this number came from.

    ``page`` is mandatory on every table: an unciteable factor is a factor
    nobody can check.
    """

    page: int = Field(..., ge=1, description="1-indexed page in the filing PDF")
    document: Optional[str] = Field(
        None, description="Filename under data/filings/, if not the plan's primary document"
    )
    exhibit: Optional[str] = Field(None, description="Exhibit/table label as printed")
    note: Optional[str] = None
    confidence: Optional[float] = Field(
        None,
        ge=0.0,
        le=1.0,
        description="Extractor's self-reported confidence. Present on drafts; "
        "a human should remove or confirm it during verification.",
    )


class FilingSource(StrictModel):
    """The PDF this plan was transcribed from."""

    filename: str
    sha256: Optional[str] = Field(
        None, description="Hash of the PDF, so a re-downloaded filing can be proven identical"
    )
    page_count: Optional[int] = Field(None, ge=1)
    retrieved_on: Optional[_dt.date] = None


class Verification(StrictModel):
    status: VerificationStatus = VerificationStatus.DRAFT_UNVERIFIED
    verified_by: Optional[str] = None
    verified_on: Optional[_dt.date] = None
    checklist_version: Optional[str] = None
    notes: Optional[str] = None

    @model_validator(mode="after")
    def _verified_needs_attribution(self) -> "Verification":
        if self.status is VerificationStatus.VERIFIED and not self.verified_by:
            raise ValueError("verification.status=verified requires verified_by")
        return self


# --------------------------------------------------------------------------
# Conditions and lookup keys
# --------------------------------------------------------------------------


class Band(StrictModel):
    """A numeric range. Either bound may be null for an open-ended band
    ('16 years or older' -> {min: 16, max: null})."""

    min: Optional[Number] = None
    max: Optional[Number] = None

    @model_validator(mode="after")
    def _ordered(self) -> "Band":
        if self.min is None and self.max is None:
            raise ValueError("band must set at least one of min/max")
        if self.min is not None and self.max is not None and self.min > self.max:
            raise ValueError(f"band min {self.min} exceeds max {self.max}")
        return self


# What a row key or an applies_when clause may hold.
ConditionValue = Union[Band, Decimal, int, str, bool, List[Union[Decimal, int, str, bool]]]


class KeySpec(StrictModel):
    """One dimension of a lookup, and how to compare it."""

    attribute: str = Field(
        ..., description="Name of the risk/context attribute, e.g. 'protection_class'"
    )
    match: MatchType = MatchType.EXACT
    bounds: Bounds = Field(
        Bounds.CLOSED, description="Band inclusivity; only meaningful when match=band"
    )
    case_sensitive: bool = Field(
        False, description="Applies to string comparison for match=exact"
    )

    @model_validator(mode="after")
    def _bounds_only_for_bands(self) -> "KeySpec":
        if self.bounds is not Bounds.HALF_OPEN or self.match is MatchType.BAND:
            return self
        raise ValueError("bounds=half_open is only meaningful with match=band")


# --------------------------------------------------------------------------
# Lookup tables
# --------------------------------------------------------------------------


class LookupRow(StrictModel):
    """One row of a factor/additive table.

    ``when`` maps each key attribute to the value (or band) the row covers.
    ``value`` is a multiplier for factor steps and a dollar amount (or
    percentage, per the step's basis) for additive steps.
    """

    when: Dict[str, ConditionValue] = Field(default_factory=dict)
    value: Factor
    note: Optional[str] = None


class LookupTable(StrictModel):
    """A factor or additive table: N keys in, one value out."""

    description: Optional[str] = None
    keys: List[KeySpec] = Field(..., min_length=1)
    rows: List[LookupRow] = Field(..., min_length=1)
    default: Optional[Factor] = Field(
        None,
        description="Only set this when the filing prints an explicit 'all other' "
        "row. Never as a convenience.",
    )
    default_source: Optional[SourceRef] = Field(
        None, description="Required when default is set: cite the 'all other' row"
    )
    source: SourceRef

    @model_validator(mode="after")
    def _check(self) -> "LookupTable":
        if self.default is not None and self.default_source is None:
            raise ValueError(
                "a table default must cite the filing row that states it "
                "(set default_source); an uncited default is a guess"
            )
        key_names = [k.attribute for k in self.keys]
        if len(set(key_names)) != len(key_names):
            raise ValueError(f"duplicate key attributes in table: {key_names}")
        for i, row in enumerate(self.rows):
            missing = set(key_names) - set(row.when)
            extra = set(row.when) - set(key_names)
            if missing:
                raise ValueError(f"row {i} is missing key(s) {sorted(missing)}")
            if extra:
                raise ValueError(f"row {i} has key(s) {sorted(extra)} not declared in keys")
        return self


class BaseRatePoint(StrictModel):
    """One coverage-A breakpoint in a base-rate curve."""

    amount: Number = Field(..., description="Coverage A amount at this breakpoint")
    premium: Money
    add_per_1000: Optional[Money] = Field(
        None,
        description="Premium added per $1,000 of coverage above this breakpoint. "
        "Required for interpolation=per_1000.",
    )


class BaseRateSegment(StrictModel):
    """The base-rate curve for one combination of the table's keys.

    Base rates are usually a grid (territory x form, sometimes x construction),
    with a coverage-amount curve inside each cell. ``when`` selects the cell;
    ``points`` is the curve.
    """

    when: Dict[str, ConditionValue] = Field(default_factory=dict)
    points: List[BaseRatePoint] = Field(..., min_length=1)
    source: Optional[SourceRef] = Field(
        None, description="Overrides the table-level source when the grid spans pages"
    )

    @field_validator("points")
    @classmethod
    def _ascending(cls, v: List[BaseRatePoint]) -> List[BaseRatePoint]:
        amounts = [p.amount for p in v]
        if amounts != sorted(amounts):
            raise ValueError("base rate points must be listed in ascending amount order")
        if len(set(amounts)) != len(amounts):
            raise ValueError("duplicate coverage amounts in base rate points")
        return v


class AboveMax(StrictModel):
    """Behaviour above the table's highest breakpoint."""

    method: Extrapolation = Extrapolation.ERROR
    rate_per_1000: Optional[Money] = Field(
        None,
        description="Overrides the top point's add_per_1000 when the filing states "
        "a different 'each additional $1,000' rate above the table",
    )
    max_amount: Optional[Number] = Field(
        None, description="Refuse above this even when extrapolating (filing's stated ceiling)"
    )


class BaseRateTable(StrictModel):
    description: Optional[str] = None
    amount_attribute: str = Field(
        "coverage_a", description="Context attribute holding the amount of insurance"
    )
    interpolation: Interpolation
    keys: List[KeySpec] = Field(
        default_factory=list, description="Grid dimensions, e.g. territory and form"
    )
    segments: List[BaseRateSegment] = Field(..., min_length=1)
    below_min: Extrapolation = Field(
        Extrapolation.ERROR,
        description="Behaviour below the lowest breakpoint. ERROR unless the "
        "filing says otherwise.",
    )
    above_max: AboveMax = Field(default_factory=AboveMax)
    source: SourceRef

    @model_validator(mode="after")
    def _check(self) -> "BaseRateTable":
        key_names = [k.attribute for k in self.keys]
        if len(set(key_names)) != len(key_names):
            raise ValueError(f"duplicate key attributes in base rate table: {key_names}")
        for i, seg in enumerate(self.segments):
            missing = set(key_names) - set(seg.when)
            extra = set(seg.when) - set(key_names)
            if missing:
                raise ValueError(f"segment {i} is missing key(s) {sorted(missing)}")
            if extra:
                raise ValueError(f"segment {i} has undeclared key(s) {sorted(extra)}")
            if self.interpolation is Interpolation.PER_1000:
                for p in seg.points:
                    if p.add_per_1000 is None:
                        raise ValueError(
                            f"segment {i} point at {p.amount} needs add_per_1000 "
                            "for interpolation=per_1000"
                        )
            if self.interpolation is Interpolation.LINEAR and len(seg.points) < 2:
                raise ValueError(f"segment {i} needs >=2 points for linear interpolation")
        if self.above_max.method is Extrapolation.PER_1000:
            for i, seg in enumerate(self.segments):
                if self.above_max.rate_per_1000 is None and seg.points[-1].add_per_1000 is None:
                    raise ValueError(
                        f"above_max=per_1000 needs add_per_1000 on the top point of "
                        f"segment {i}, or a table-level rate_per_1000"
                    )
        return self


class TerritoryTable(StrictModel):
    """Carrier-specific territory definitions.

    These live inside the plan on purpose. Two carriers writing the same ZIP
    routinely assign it to differently-numbered territories, and sharing one
    mapping across carriers is how you get a confidently wrong premium.
    """

    basis: TerritoryBasis
    description: Optional[str] = None
    entries: Dict[str, str] = Field(
        default_factory=dict,
        description="Key (ZIP/county/town, per basis) -> territory code. "
        "Empty only when basis=statewide.",
    )
    statewide_code: Optional[str] = Field(
        None, description="Territory code used when basis=statewide"
    )
    source: SourceRef

    @model_validator(mode="after")
    def _check(self) -> "TerritoryTable":
        if self.basis is TerritoryBasis.STATEWIDE:
            if not self.statewide_code:
                raise ValueError("basis=statewide requires statewide_code")
        elif not self.entries:
            raise ValueError(f"basis={self.basis.value} requires entries")
        return self


# --------------------------------------------------------------------------
# Steps
# --------------------------------------------------------------------------


class _StepBase(StrictModel):
    id: str = Field(..., description="Stable identifier, unique within the plan")
    description: Optional[str] = Field(None, description="Human label shown in the trace")
    applies_when: Dict[str, ConditionValue] = Field(
        default_factory=dict,
        description="Skip this step unless every clause matches the risk. An "
        "attribute that is absent or null does NOT match, so the step is skipped "
        "-- unlike a table lookup, where an absent attribute is a hard error.",
    )
    source: Optional[SourceRef] = Field(
        None, description="Page stating this step's place in the sequence"
    )


class BaseRateStep(_StepBase):
    """Set the running premium from a base-rate table. Normally step 1."""

    type: Literal["base_rate"] = "base_rate"
    table: str = Field(..., description="Name of an entry in plan.base_rate_tables")


class FactorStep(_StepBase):
    """Multiply the running premium by a looked-up factor."""

    type: Literal["factor"] = "factor"
    table: str = Field(..., description="Name of an entry in plan.lookup_tables")


class AdditiveStep(_StepBase):
    """Add (or subtract, via a negative value) a charge or credit."""

    type: Literal["additive"] = "additive"
    table: Optional[str] = Field(None, description="Name of an entry in plan.lookup_tables")
    amount: Optional[Money] = Field(None, description="Literal amount, when there is no table")
    basis: AdditiveBasis = AdditiveBasis.FLAT

    @model_validator(mode="after")
    def _one_source(self) -> "AdditiveStep":
        if (self.table is None) == (self.amount is None):
            raise ValueError("additive step needs exactly one of table or amount")
        if self.amount is not None and self.source is None:
            raise ValueError("a literal additive amount must cite its source page")
        return self


class CapStep(_StepBase):
    """Upper bound: a maximum premium and/or a capped increase over the
    expiring term (requires risk.prior_term_premium)."""

    type: Literal["cap"] = "cap"
    max_premium: Optional[Money] = None
    max_increase_pct: Optional[Factor] = Field(
        None, description="e.g. 10 means the new premium may not exceed 110% of prior"
    )

    @model_validator(mode="after")
    def _something(self) -> "CapStep":
        if self.max_premium is None and self.max_increase_pct is None:
            raise ValueError("cap step needs max_premium and/or max_increase_pct")
        return self


class FloorStep(_StepBase):
    """Lower bound, typically the filing's minimum written premium."""

    type: Literal["floor"] = "floor"
    min_premium: Money


class RoundStep(_StepBase):
    """Round the running premium.

    Rounding is a step rather than an output setting because *where* it happens
    changes the answer, and filings differ: some round after every factor, most
    round once at the end.
    """

    type: Literal["round"] = "round"
    method: RoundingMethod = RoundingMethod.HALF_UP
    to: Money = Field(Decimal("1"), description="Quantum: 1 = whole dollars, 0.01 = cents")

    @field_validator("to")
    @classmethod
    def _positive(cls, v: Decimal) -> Decimal:
        if v <= 0:
            raise ValueError("round.to must be positive")
        return v


Step = Annotated[
    Union[BaseRateStep, FactorStep, AdditiveStep, CapStep, FloorStep, RoundStep],
    Field(discriminator="type"),
]


# --------------------------------------------------------------------------
# Validation worksheets
# --------------------------------------------------------------------------


class Worksheet(StrictModel):
    """A fully worked example premium copied out of the filing itself.

    Most filings print one. Reproducing it to the cent is the only real evidence
    that the rating sequence was read correctly, so worksheets live in the plan
    file and ``tests/test_worksheets.py`` runs every one it finds.
    """

    name: str
    form: str
    risk: Dict[str, Any] = Field(..., description="Inputs as printed in the worksheet")
    expected_premium: Money
    expected_steps: Dict[str, Money] = Field(
        default_factory=dict,
        description="Optional step_id -> running premium after that step; lets a "
        "failure point at the step that diverged instead of just the total",
    )
    tolerance: Money = Field(
        Decimal("0.00"), description="Allowed difference. Default: exact to the cent."
    )
    source: SourceRef


# --------------------------------------------------------------------------
# The plan
# --------------------------------------------------------------------------

_FORM_PATTERN = r"^HO-?[0-9]$"


def _normalize_form(v: Any) -> Any:
    """Accept 'HO-3', 'ho3', 'HO 3'; store 'HO3'."""
    if isinstance(v, str):
        return v.upper().replace("-", "").replace(" ", "")
    return v


FormCode = Annotated[str, BeforeValidator(_normalize_form), Field(pattern=_FORM_PATTERN)]


class RatingPlan(StrictModel):
    """One carrier's rating plan for one state, as of one effective date."""

    schema_version: Literal[1] = 1
    plan_id: str = Field(..., description="Unique, e.g. 'sample-mutual-ct-ho-2026-01-01'")

    # Filing identity
    carrier: str
    naic: str = Field(..., description="NAIC company code as filed")
    state: str = Field(..., min_length=2, max_length=2, description="USPS code, e.g. CT")
    line: str = Field("homeowners", description="Line of business")
    serff_tracking: Optional[str] = Field(
        None, description="SERFF tracking number; null only for synthetic plans"
    )
    effective_date: _dt.date
    expiration_date: Optional[_dt.date] = Field(
        None, description="Set when a later filing supersedes this one"
    )

    forms_supported: List[FormCode] = Field(
        ...,
        min_length=1,
        description="Forms this filing actually rates. A form absent here rates as "
        "'not written' rather than a number.",
    )
    occupancy_supported: List[Occupancy] = Field(
        default_factory=lambda: [Occupancy.OWNER_OCCUPIED]
    )

    filing_source: Optional[FilingSource] = None
    verification: Verification = Field(default_factory=Verification)
    notes: Optional[str] = None

    territory: TerritoryTable
    base_rate_tables: Dict[str, BaseRateTable] = Field(default_factory=dict)
    lookup_tables: Dict[str, LookupTable] = Field(default_factory=dict)
    steps: List[Step] = Field(..., min_length=1)
    worksheets: List[Worksheet] = Field(default_factory=list)

    @field_validator("state")
    @classmethod
    def _upper_state(cls, v: str) -> str:
        return v.upper()

    @model_validator(mode="after")
    def _check(self) -> "RatingPlan":
        if self.expiration_date and self.expiration_date <= self.effective_date:
            raise ValueError("expiration_date must be after effective_date")

        seen: set = set()
        for step in self.steps:
            if step.id in seen:
                raise ValueError(f"duplicate step id: {step.id}")
            seen.add(step.id)

        # Every table reference must resolve, and every table must be referenced.
        used_base: set = set()
        used_lookup: set = set()
        for step in self.steps:
            if isinstance(step, BaseRateStep):
                if step.table not in self.base_rate_tables:
                    raise ValueError(
                        f"step '{step.id}' references unknown base rate table "
                        f"'{step.table}'"
                    )
                used_base.add(step.table)
            elif isinstance(step, FactorStep):
                if step.table not in self.lookup_tables:
                    raise ValueError(
                        f"step '{step.id}' references unknown lookup table '{step.table}'"
                    )
                used_lookup.add(step.table)
            elif isinstance(step, AdditiveStep) and step.table is not None:
                if step.table not in self.lookup_tables:
                    raise ValueError(
                        f"step '{step.id}' references unknown lookup table '{step.table}'"
                    )
                used_lookup.add(step.table)

        orphans = sorted(
            (set(self.base_rate_tables) - used_base) | (set(self.lookup_tables) - used_lookup)
        )
        if orphans:
            # A transcribed-but-unreferenced table means a step was missed.
            raise ValueError(f"tables defined but never used by any step: {orphans}")

        if not any(isinstance(s, BaseRateStep) for s in self.steps):
            raise ValueError("plan has no base_rate step")

        for ws in self.worksheets:
            form = _normalize_form(ws.form)
            if form not in self.forms_supported:
                raise ValueError(
                    f"worksheet '{ws.name}' rates {form}, which is not in forms_supported"
                )
            unknown = set(ws.expected_steps) - seen
            if unknown:
                raise ValueError(
                    f"worksheet '{ws.name}' expects unknown step id(s) {sorted(unknown)}"
                )
        return self

    @property
    def is_verified(self) -> bool:
        return self.verification.status is VerificationStatus.VERIFIED

    def effective_on(self, as_of: _dt.date) -> bool:
        """True when this plan version governs business written on ``as_of``."""
        if as_of < self.effective_date:
            return False
        return self.expiration_date is None or as_of < self.expiration_date


# --------------------------------------------------------------------------
# Risk input
# --------------------------------------------------------------------------


class PropertyRisk(BaseModel):
    """The risk being rated.

    Two fields cannot be derived from an address and are explicit inputs:

    ``protection_class`` -- ISO PPC is licensed data. It is required. A resolver
    interface is stubbed in ``territory.py`` for later; anything estimated must
    set ``protection_class_estimated`` so the output can be flagged.

    ``coverage_a`` -- replacement cost, *not* market value. The crude estimator in
    ``territory.py`` is labelled an estimate with a wide error band, and sets
    ``coverage_a_estimated``.
    """

    model_config = ConfigDict(extra="forbid")

    address: Optional[str] = None
    zip_code: Optional[str] = Field(None, pattern=r"^[0-9]{5}(-[0-9]{4})?$")
    county: Optional[str] = None
    town: Optional[str] = None
    state: Optional[str] = Field(None, min_length=2, max_length=2)

    coverage_a: Money = Field(..., gt=0, description="Replacement cost, not market value")
    year_built: int = Field(..., ge=1600, le=2100)
    square_feet: Optional[int] = Field(None, gt=0)
    construction_type: ConstructionType = ConstructionType.FRAME
    roof_year: Optional[int] = Field(None, ge=1600, le=2100)
    roof_material: Optional[str] = None
    protection_class: str = Field(
        ..., description="ISO PPC, as a string: '4', '9', '10W' all occur in filings"
    )
    territory_code: Optional[str] = Field(
        None, description="Leave null to resolve per-carrier from the address"
    )
    deductible: Money = Field(..., gt=0)
    prior_claims: int = Field(0, ge=0)
    occupancy: Occupancy = Occupancy.OWNER_OCCUPIED

    prior_term_premium: Optional[Money] = Field(
        None, description="Expiring premium; required only by cap steps using max_increase_pct"
    )
    endorsements: List[str] = Field(default_factory=list)
    attributes: Dict[str, Any] = Field(
        default_factory=dict,
        description="Escape hatch for carrier-specific attributes a plan keys on "
        "(e.g. 'water_backup_limit'). Merged into the rating context.",
    )

    coverage_a_estimated: bool = False
    protection_class_estimated: bool = False

    @field_validator("state")
    @classmethod
    def _upper(cls, v: Optional[str]) -> Optional[str]:
        return v.upper() if v else None

    @field_validator("protection_class", mode="before")
    @classmethod
    def _pc_str(cls, v: Any) -> Any:
        return str(v).strip().upper() if v is not None else v

    @model_validator(mode="after")
    def _roof_not_before_house(self) -> "PropertyRisk":
        if self.roof_year is not None and self.roof_year < self.year_built:
            raise ValueError(
                f"roof_year {self.roof_year} precedes year_built {self.year_built}"
            )
        return self

    def context(self, as_of: _dt.date, form: str) -> Dict[str, Any]:
        """Flatten to the attribute namespace that lookups are resolved against.

        Derived attributes (ages) are computed here rather than asked of the
        user, so a plan can key on ``roof_age`` or ``roof_year`` interchangeably.
        """
        ctx: Dict[str, Any] = {
            "form": _normalize_form(form),
            "as_of_year": as_of.year,
            "coverage_a": self.coverage_a,
            "year_built": self.year_built,
            "home_age": as_of.year - self.year_built,
            "square_feet": self.square_feet,
            "construction_type": self.construction_type.value,
            "roof_year": self.roof_year,
            "roof_age": (as_of.year - self.roof_year) if self.roof_year is not None else None,
            "roof_material": self.roof_material,
            "protection_class": self.protection_class,
            "territory_code": self.territory_code,
            "deductible": self.deductible,
            "prior_claims": self.prior_claims,
            "occupancy": self.occupancy.value,
            "zip_code": self.zip_code,
            "county": self.county,
            "town": self.town,
            "state": self.state,
            "prior_term_premium": self.prior_term_premium,
            # Lets a plan gate a renewal-only step (e.g. a capped increase) with
            # applies_when, since applies_when cannot express "is not null".
            "has_prior_term_premium": self.prior_term_premium is not None,
        }
        for e in self.endorsements:
            ctx[f"endorsement_{e}"] = True
        # Carrier-specific attributes may not shadow core ones.
        for k, v in self.attributes.items():
            if k in ctx:
                raise ValueError(f"attribute '{k}' collides with a core risk attribute")
            ctx[k] = v
        return ctx
