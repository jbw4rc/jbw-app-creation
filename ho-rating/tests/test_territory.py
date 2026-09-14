"""Territory resolution and the two inputs an address cannot supply."""

from decimal import Decimal

import pytest

from src.interpreter import rate
from src.schema import ConstructionType, PropertyRisk, TerritoryBasis, TerritoryTable
from src.territory import (
    DistanceHeuristicProtectionClass,
    TerritoryNotFound,
    UnavailableProtectionClassResolver,
    estimate_coverage_a,
    resolve_territory,
    zip_from_address,
)

from .conftest import AS_OF


@pytest.mark.parametrize(
    "address,expected",
    [
        ("742 Prospect Ave, Hartford, CT 06105", "06105"),
        ("100 Main St, Old Lyme, CT 06371-1234", "06371"),
        ("06105", "06105"),
        ("742 Prospect Ave", None),   # a street number is not a ZIP
        (None, None),
    ],
)
def test_zip_extraction_from_free_text(address, expected):
    assert zip_from_address(address) == expected


def test_territory_resolves_from_an_explicit_zip(sample_plan, hartford_risk):
    resolution = resolve_territory(sample_plan, hartford_risk)
    assert resolution.code == "3"
    assert resolution.basis is TerritoryBasis.ZIP
    assert resolution.source_page == 11          # cites the filing's territory page


def test_territory_falls_back_to_the_address(sample_plan, hartford_risk):
    risk = hartford_risk.model_copy(update={"zip_code": None})
    assert resolve_territory(sample_plan, risk).code == "3"


def test_a_zip_outside_the_filed_footprint_is_not_written(sample_plan, hartford_risk):
    """Not an error: the carrier simply does not write there."""
    risk = hartford_risk.model_copy(update={"zip_code": "02108", "address": None})
    with pytest.raises(TerritoryNotFound) as exc:
        resolve_territory(sample_plan, risk)
    assert "outside the filed footprint" in str(exc.value)

    result = rate(sample_plan, risk, "HO3", AS_OF)
    assert not result.rated
    assert "no territory" in result.reason


def test_an_explicit_territory_override_skips_resolution(sample_plan, hartford_risk):
    """Lets a user rate a risk whose ZIP the plan has not been transcribed for."""
    risk = hartford_risk.model_copy(update={"territory_code": "1", "zip_code": "02108"})
    result = rate(sample_plan, risk, "HO3", AS_OF)
    assert result.rated
    assert result.territory_code == "1"


def test_territory_definitions_are_not_shared_between_carriers(sample_plan, hartford_risk):
    """The same ZIP in two carriers' filings, numbered differently and priced
    differently. Sharing one map across carriers would silently swap them."""
    inverted = TerritoryTable.model_validate(
        {
            **sample_plan.territory.model_dump(),
            "entries": {**sample_plan.territory.entries, "06105": "1"},
        }
    )
    other = sample_plan.model_copy(
        update={"plan_id": "other", "carrier": "Other Mutual", "territory": inverted}
    )
    assert resolve_territory(sample_plan, hartford_risk).code == "3"
    assert resolve_territory(other, hartford_risk).code == "1"
    assert (rate(other, hartford_risk, "HO3", AS_OF).premium
            != rate(sample_plan, hartford_risk, "HO3", AS_OF).premium)


def test_county_basis_requires_a_county(sample_plan, hartford_risk):
    """A ZIP does not imply a county -- ZIPs cross county lines."""
    county_plan = sample_plan.model_copy(
        update={"territory": TerritoryTable.model_validate({
            "basis": "county",
            "entries": {"Hartford": "3", "Fairfield": "1"},
            "source": {"page": 11},
        })}
    )
    with pytest.raises(TerritoryNotFound) as exc:
        resolve_territory(county_plan, hartford_risk)
    assert "ZIPs cross county lines" in str(exc.value)

    risk = hartford_risk.model_copy(update={"county": "hartford"})   # case-insensitive
    assert resolve_territory(county_plan, risk).code == "3"


def test_statewide_basis_needs_no_address(sample_plan):
    plan = sample_plan.model_copy(
        update={"territory": TerritoryTable.model_validate({
            "basis": "statewide", "statewide_code": "1", "source": {"page": 11},
        })}
    )
    risk = PropertyRisk(coverage_a=450000, year_built=1955, protection_class="7",
                        deductible=2500)
    assert resolve_territory(plan, risk).code == "1"


# ------------------------------------------------------- protection class ---


def test_the_default_ppc_resolver_resolves_nothing(hartford_risk):
    """ISO PPC is licensed data we do not have. Returning None is the honest
    answer; a guess here moves the premium more than most other factors."""
    assert UnavailableProtectionClassResolver().resolve(hartford_risk) is None


def test_the_distance_heuristic_always_flags_itself_as_an_estimate(hartford_risk):
    result = DistanceHeuristicProtectionClass(
        miles_to_station=0.8, feet_to_hydrant=400
    ).resolve(hartford_risk)
    assert result.protection_class == "4"
    assert result.estimated is True
    assert result.confidence == "low"
    assert "ESTIMATED" in result.note

    remote = DistanceHeuristicProtectionClass(
        miles_to_station=7.0, feet_to_hydrant=None
    ).resolve(hartford_risk)
    assert remote.protection_class == "10"
    assert remote.estimated is True


def test_an_estimated_ppc_surfaces_as_a_warning_on_the_premium(sample_plan, hartford_risk):
    estimate = DistanceHeuristicProtectionClass(1.0, 400).resolve(hartford_risk)
    risk = hartford_risk.model_copy(update={
        "protection_class": estimate.protection_class,
        "protection_class_estimated": estimate.estimated,
    })
    result = rate(sample_plan, risk, "HO3", AS_OF)
    assert any("protection_class is an ESTIMATE" in w for w in result.warnings)


# ------------------------------------------------------------- coverage A ---


def test_coverage_a_estimate_is_labelled_with_a_wide_band():
    est = estimate_coverage_a(2400, ConstructionType.MASONRY, "CT")
    assert est.amount == Decimal("2400") * Decimal("235") * Decimal("1.08")
    assert est.low < est.amount < est.high
    assert est.high - est.amount == est.amount - est.low       # symmetric +/-30%
    assert "not market value" in est.caveat
    assert "+/-30%" in est.caveat
    assert "2400 sqft" in est.basis                            # shows its working


def test_coverage_a_estimate_varies_by_state_and_construction():
    frame = estimate_coverage_a(2000, ConstructionType.FRAME, "CT")
    fire_resistive = estimate_coverage_a(2000, ConstructionType.FIRE_RESISTIVE, "CT")
    other_state = estimate_coverage_a(2000, ConstructionType.FRAME, "TX")
    assert fire_resistive.amount > frame.amount
    assert other_state.amount < frame.amount                   # falls back to _default


def test_an_estimated_coverage_a_surfaces_as_a_warning(sample_plan, hartford_risk):
    est = estimate_coverage_a(2400, ConstructionType.MASONRY, "CT")
    risk = hartford_risk.model_copy(update={
        "coverage_a": est.amount, "coverage_a_estimated": True
    })
    result = rate(sample_plan, risk, "HO3", AS_OF)
    assert result.rated
    assert any("coverage_a is an ESTIMATE" in w for w in result.warnings)
