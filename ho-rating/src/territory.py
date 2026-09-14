"""Address -> territory resolution, and the two inputs an address cannot give you.

Territory definitions live inside each plan file, so resolution always happens
against the plan being rated. Two carriers writing the same ZIP routinely put it
in differently-numbered territories, and one carrier's territory 1 may be its
cheapest while another's is its most expensive. There is deliberately no shared
territory map in this module for that reason.

The other two things that cannot be derived from an address:

* **protection_class** -- ISO PPC is licensed data. ``ProtectionClassResolver``
  is an interface for a future licensed source. The heuristic implementation
  here is opt-in, flags itself as an estimate, and is not wired into the CLI's
  default path.
* **coverage_a** -- replacement cost, not market value. ``estimate_coverage_a``
  is a crude fallback with an honest +/-30% band, labelled as such everywhere it
  surfaces.
"""

from __future__ import annotations

import re
from abc import ABC, abstractmethod
from dataclasses import dataclass
from decimal import Decimal
from typing import Optional

from .interpreter import RatingError
from .schema import ConstructionType, PropertyRisk, RatingPlan, TerritoryBasis

_ZIP_RE = re.compile(r"\b(\d{5})(?:-\d{4})?\b")


class TerritoryNotFound(RatingError):
    """The plan's territory table does not cover this address.

    Usually means the risk is outside the carrier's filed footprint, which is a
    'not written' answer rather than an error -- ``interpreter.rate`` treats it
    that way.
    """


@dataclass
class TerritoryResolution:
    code: str
    basis: TerritoryBasis
    key_used: Optional[str]
    source_page: int
    note: Optional[str] = None


def zip_from_address(address: Optional[str]) -> Optional[str]:
    """Pull a 5-digit ZIP out of a free-text address.

    Deliberately crude: this is a prototype convenience, not a geocoder. It takes
    the *last* 5-digit run, since street numbers come first.
    """
    if not address:
        return None
    matches = _ZIP_RE.findall(address)
    return matches[-1] if matches else None


def resolve_territory(plan: RatingPlan, risk: PropertyRisk) -> TerritoryResolution:
    """Resolve this risk's territory against this plan's own definitions."""
    table = plan.territory
    page = table.source.page

    if table.basis is TerritoryBasis.STATEWIDE:
        assert table.statewide_code is not None  # enforced by the schema
        return TerritoryResolution(table.statewide_code, table.basis, None, page)

    if table.basis in (TerritoryBasis.ZIP, TerritoryBasis.ZIP_PLUS_4):
        key = risk.zip_code or zip_from_address(risk.address)
        note = None
        if key is None:
            raise TerritoryNotFound(
                f"{plan.carrier} assigns territory by {table.basis.value} (p.{page}), "
                f"but the risk has no ZIP and none could be read from the address"
            )
        if table.basis is TerritoryBasis.ZIP and "-" in key:
            key = key.split("-")[0]
        if table.basis is TerritoryBasis.ZIP_PLUS_4 and "-" not in key:
            note = (
                f"{plan.carrier} rates by ZIP+4 (p.{page}) but only a 5-digit ZIP "
                f"was supplied; territory may be wrong for split ZIPs"
            )
    elif table.basis is TerritoryBasis.COUNTY:
        key = risk.county
        note = None
        if key is None:
            raise TerritoryNotFound(
                f"{plan.carrier} assigns territory by county (p.{page}), but the "
                f"risk has no county. County cannot be inferred from a ZIP reliably "
                f"-- ZIPs cross county lines."
            )
    else:  # TOWN
        key = risk.town
        note = None
        if key is None:
            raise TerritoryNotFound(
                f"{plan.carrier} assigns territory by town (p.{page}), but the risk "
                f"has no town"
            )

    # Case-insensitive on names, exact on ZIPs (which are already digits).
    entries = table.entries
    code = entries.get(key)
    if code is None:
        folded = {k.casefold(): v for k, v in entries.items()}
        code = folded.get(key.casefold())
    if code is None:
        raise TerritoryNotFound(
            f"{plan.carrier} files no territory for {table.basis.value} '{key}' "
            f"(territory table on p.{page}) -- the risk is outside the filed "
            f"footprint for {plan.state}"
        )
    return TerritoryResolution(code, table.basis, key, page, note)


# --------------------------------------------------------------------------
# Protection class
# --------------------------------------------------------------------------


@dataclass
class ProtectionClassResult:
    protection_class: str
    estimated: bool
    confidence: str  # 'verified' | 'low'
    note: Optional[str] = None


class ProtectionClassResolver(ABC):
    """Interface for a future licensed PPC source.

    Implement this against ISO's Public Protection Classification data (or a
    vendor reseller) when one is licensed. Nothing else in the engine needs to
    change: ``PropertyRisk.protection_class`` stays a required input, and a
    resolver simply fills it in.
    """

    @abstractmethod
    def resolve(self, risk: PropertyRisk) -> Optional[ProtectionClassResult]:
        """Return the PPC for this risk, or None when it cannot be determined."""


class UnavailableProtectionClassResolver(ProtectionClassResolver):
    """The default. PPC is licensed data we do not have, so this resolves
    nothing and says so, rather than guessing."""

    def resolve(self, risk: PropertyRisk) -> Optional[ProtectionClassResult]:
        return None


class DistanceHeuristicProtectionClass(ProtectionClassResolver):
    """A crude stand-in for licensed PPC, from distance to a fire station and to
    a hydrant.

    This is **not** ISO PPC. Real PPC grading weighs the fire department's
    equipment, staffing, training and communications alongside water supply, and
    a town's grade routinely differs from what distance alone implies. Every
    result is flagged ``estimated`` with low confidence so the rating output can
    label it; it is not wired into the CLI by default.
    """

    def __init__(self, miles_to_station: float, feet_to_hydrant: Optional[float]):
        self.miles_to_station = miles_to_station
        self.feet_to_hydrant = feet_to_hydrant

    def resolve(self, risk: PropertyRisk) -> Optional[ProtectionClassResult]:
        if self.miles_to_station > 5:
            pc = "10"
        elif self.feet_to_hydrant is None or self.feet_to_hydrant > 1000:
            pc = "9"
        elif self.miles_to_station <= 1:
            pc = "4"
        elif self.miles_to_station <= 3:
            pc = "5"
        else:
            pc = "6"
        return ProtectionClassResult(
            protection_class=pc,
            estimated=True,
            confidence="low",
            note=(
                "PPC ESTIMATED from distance only. Real ISO grading weighs "
                "department staffing, equipment, training and communications; "
                "this can be several classes off, and PPC is one of the largest "
                "factors in the rate."
            ),
        )


# --------------------------------------------------------------------------
# Coverage A
# --------------------------------------------------------------------------

# Rough all-in residential rebuild cost per square foot. Regional and coarse:
# a real reconstruction-cost estimate prices the actual building.
_REGIONAL_COST_PER_SQFT = {
    "CT": Decimal("235"),
    "MA": Decimal("245"),
    "NY": Decimal("250"),
    "RI": Decimal("230"),
    "NJ": Decimal("230"),
    "_default": Decimal("205"),
}

_CONSTRUCTION_MULTIPLIER = {
    ConstructionType.FRAME: Decimal("1.00"),
    ConstructionType.MASONRY: Decimal("1.08"),
    ConstructionType.MASONRY_VENEER: Decimal("1.04"),
    ConstructionType.FIRE_RESISTIVE: Decimal("1.20"),
    ConstructionType.OTHER: Decimal("1.00"),
}


@dataclass
class CoverageAEstimate:
    amount: Decimal
    low: Decimal
    high: Decimal
    basis: str
    caveat: str = (
        "ESTIMATE ONLY. This is square footage times a regional cost per square "
        "foot -- it is not a reconstruction-cost estimate and it is not market "
        "value. It ignores finishes, roof complexity, foundation, outbuildings "
        "and local labour. Expect +/-30%. Any premium derived from it is "
        "indicative, not a quote."
    )


def estimate_coverage_a(
    square_feet: int,
    construction_type: ConstructionType = ConstructionType.FRAME,
    state: str = "CT",
    error_band: Decimal = Decimal("0.30"),
) -> CoverageAEstimate:
    """Crude replacement-cost fallback, for when Coverage A was not supplied.

    Clearly labelled as an estimate with a wide band, because the alternative --
    quietly substituting market value or an assessment -- produces a premium
    that looks authoritative and is wrong.
    """
    if square_feet <= 0:
        raise ValueError("square_feet must be positive")
    rate = _REGIONAL_COST_PER_SQFT.get(state.upper(), _REGIONAL_COST_PER_SQFT["_default"])
    mult = _CONSTRUCTION_MULTIPLIER[construction_type]
    point = (Decimal(square_feet) * rate * mult).quantize(Decimal("1"))
    return CoverageAEstimate(
        amount=point,
        low=(point * (1 - error_band)).quantize(Decimal("1")),
        high=(point * (1 + error_band)).quantize(Decimal("1")),
        basis=(
            f"{square_feet} sqft x ${rate}/sqft ({state.upper()}) "
            f"x {mult} ({construction_type.value})"
        ),
    )
