"""Engine math tests against a hand-built synthetic carrier (no scraped data)."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from engine.models import CarrierManual, Discount, HomeProfile
from engine.rating import _parse_band, lookup_factor, quote

FIXTURE = Path(__file__).parent / "fixtures" / "synthetic_carrier.json"


@pytest.fixture
def manual() -> CarrierManual:
    return CarrierManual.model_validate_json(FIXTURE.read_text())


@pytest.fixture
def profile() -> HomeProfile:
    return HomeProfile(
        territory_or_zip="06880",
        coverage_a=600000,
        year_built=1988,
        construction="frame",
        protection_class=4,
        roof_age=8,
        deductible=1000,
        hurricane_deductible_pct=2,
        discounts=["protective_devices", "claims_free", "multi_policy"],
    )


def test_full_calculation_matches_hand_math(manual: CarrierManual, profile: HomeProfile) -> None:
    # base 1000
    # * pc(4)=1.0 * construction(frame)=1.0 * roof(8->6-10)=1.0
    # * age(2026-1988=38 -> 31+)=1.10 * deductible(1000)=1.0 * wind(2)=0.95
    #   => 1045
    # discounts: protective 0.95 -> 992.75; claims_free -10% -> 893.475;
    #            multi_policy 0.90 -> 804.1275; round nearest 1 -> 804
    res = quote(manual, profile, as_of_year=2026)
    assert res.premium == pytest.approx(804.0)
    assert res.partial is False
    assert res.warnings == []


def test_every_step_is_recorded_and_auditable(manual: CarrierManual, profile: HomeProfile) -> None:
    res = quote(manual, profile, as_of_year=2026)
    names = [s.name for s in res.steps]
    assert names[0] == "base_rate"
    # 6 factor steps + 3 discounts + rounding
    assert names.count("protection_class") == 1
    assert "rounding" in names
    # Running premium after base is exactly the base cell.
    assert res.steps[0].running_premium == pytest.approx(1000.0)
    # Running premium never goes negative and ends at the reported premium.
    assert res.steps[-1].running_premium == pytest.approx(res.premium)


def test_territory_map_and_base_band_selection(manual: CarrierManual) -> None:
    # 06905 -> T2, 600k -> 400001-800000 band -> 1200 base, no factors matched
    profile = HomeProfile(territory_or_zip="06905", coverage_a=600000,
                          protection_class=4, construction="frame", roof_age=3,
                          year_built=2020, deductible=1000, hurricane_deductible_pct=1)
    res = quote(manual, profile, as_of_year=2026)
    # base 1200 * pc1.0 * const1.0 * roof(3->0-5)=0.95 * age(6->0-10)=0.90
    # * ded1.0 * wind1.0 = 1026.0
    assert res.premium == pytest.approx(1026.0)


def test_minimum_premium_floor() -> None:
    manual = CarrierManual(
        carrier="Floor Co",
        base_rates=[{"territory": "*", "coverage_a_band": "0+", "rate": 100.0}],
        rating_order=["base_rate"],
        minimum_premium=250.0,
    )
    res = quote(manual, HomeProfile(territory_or_zip="X", coverage_a=100000))
    assert res.premium == pytest.approx(250.0)
    assert res.steps[-1].kind == "minimum"


def test_gaps_flag_makes_quote_partial_but_still_returns() -> None:
    manual = CarrierManual(
        carrier="Black Box Re",
        base_rates=[{"territory": "*", "coverage_a_band": "0+", "rate": 900.0}],
        rating_order=["base_rate"],
        gaps=["by-peril rating factors filed confidential"],
    )
    res = quote(manual, HomeProfile(territory_or_zip="X", coverage_a=500000))
    assert res.partial is True
    assert res.premium == pytest.approx(900.0)
    assert res.gaps


def test_missing_base_rate_is_non_fatal_and_partial(manual: CarrierManual) -> None:
    profile = HomeProfile(territory_or_zip="99999", coverage_a=600000)  # unknown territory
    res = quote(manual, profile, as_of_year=2026)
    assert res.premium == pytest.approx(0.0)
    assert res.partial is True
    assert any("no base-rate rows" in w for w in res.warnings)


def test_unmatched_factor_is_treated_as_one_and_warns(manual: CarrierManual) -> None:
    profile = HomeProfile(
        territory_or_zip="06880", coverage_a=600000, year_built=2000,
        construction="frame", protection_class=99,  # not in table
        roof_age=8, deductible=1000, hurricane_deductible_pct=1,
    )
    res = quote(manual, profile, as_of_year=2026)
    assert res.partial is True
    assert any("protection_class" in w for w in res.warnings)


def test_discount_not_selected_is_skipped(manual: CarrierManual, profile: HomeProfile) -> None:
    profile.discounts = ["protective_devices"]  # only one selected
    res = quote(manual, profile, as_of_year=2026)
    disc_steps = [s for s in res.steps if s.kind == "discount"]
    assert [s.name for s in disc_steps] == ["protective_devices"]


def test_additive_discount_type() -> None:
    disc = Discount(name="fee_credit", type="additive", value=-25.0)
    manual = CarrierManual(
        carrier="Additive Co",
        base_rates=[{"territory": "*", "coverage_a_band": "0+", "rate": 500.0}],
        rating_order=["base_rate"],
        discounts=[disc],
    )
    res = quote(manual, HomeProfile(territory_or_zip="X", coverage_a=1, discounts=["fee_credit"]))
    assert res.premium == pytest.approx(475.0)


@pytest.mark.parametrize(
    "value,expected_key",
    [(3, "0-5"), (8, "6-10"), (15, "11-20"), (40, "21+"), (5, "0-5")],
)
def test_band_lookup(manual: CarrierManual, value: int, expected_key: str) -> None:
    key, _ = lookup_factor(manual.factors["roof_age"], value)
    assert key == expected_key


def test_exact_key_beats_band() -> None:
    table = {"5": 1.5, "0-10": 1.0}
    key, mult = lookup_factor(table, 5)
    assert key == "5" and mult == 1.5


def test_parse_band_forms() -> None:
    assert _parse_band("6-10") == (6.0, 10.0)
    assert _parse_band("21+") == (21.0, float("inf"))
    assert _parse_band("<=5") == (float("-inf"), 5.0)
    assert _parse_band("4") is None
