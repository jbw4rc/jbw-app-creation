"""Interpreter mechanics.

The worksheet tests prove the engine reproduces a filing's own arithmetic. These
prove the things a worksheet cannot: that lookups use the semantics the plan
declares, and that every way of not knowing an answer is loud.
"""

import datetime
from decimal import Decimal

import pytest

from src.interpreter import (
    AmbiguousMatchError,
    ExtrapolationError,
    MissingAttributeError,
    NoMatchError,
    PlanConfigurationError,
    PlanLibrary,
    PlanNotVerifiedError,
    RatingStatus,
    apply_rounding,
    rate,
    rate_forms,
)
from src.schema import (
    LookupTable,
    PropertyRisk,
    RoundingMethod,
    VerificationStatus,
)

from .conftest import AS_OF


# ---------------------------------------------------------------- basics ---


def test_rates_the_forms_a_plan_files_and_declines_the_rest(sample_plan, hartford_risk):
    results = rate_forms(sample_plan, hartford_risk, ["HO2", "HO3", "HO5"], as_of=AS_OF)

    assert results["HO3"].status is RatingStatus.RATED
    assert results["HO5"].status is RatingStatus.RATED
    # HO2 is absent from forms_supported, so it is declined rather than rated
    # off some other form's tables.
    assert results["HO2"].status is RatingStatus.NOT_WRITTEN
    assert results["HO2"].premium is None
    assert "does not write HO2" in results["HO2"].reason
    # HO5 is the broader form, so it must cost more on the same risk.
    assert results["HO5"].premium > results["HO3"].premium


def test_form_spelling_is_normalised(sample_plan, hartford_risk):
    for spelling in ["HO-3", "ho3", "ho-3", "HO 3"]:
        assert rate(sample_plan, hartford_risk, spelling, AS_OF).premium == Decimal("2132")


def test_trace_explains_every_step(sample_plan, hartford_risk):
    result = rate(sample_plan, hartford_risk, "HO3", AS_OF)

    # One entry per step, executed or skipped -- nothing silently absent.
    assert len(result.trace) == len(sample_plan.steps)
    assert [e.step_id for e in result.trace] == [s.id for s in sample_plan.steps]

    ded = next(e for e in result.trace if e.step_id == "deductible")
    assert ded.operand == Decimal("0.92")
    assert ded.inputs == {"deductible": Decimal("2500")}
    assert ded.source_page == 29                       # traceable to the filing
    assert ded.premium_after == ded.premium_before * Decimal("0.92")

    # Skipped steps say why, so a missing charge is visible rather than absent.
    skipped = [e for e in result.trace if e.skipped]
    assert {e.step_id for e in skipped} == {"water_backup", "ordinance_or_law", "renewal_cap"}
    assert "endorsement_water_backup not present" in skipped[0].skip_reason

    # Every executed step cites a page.
    assert all(e.source_page for e in result.trace if not e.skipped)


def test_running_premium_is_chained(sample_plan, hartford_risk):
    result = rate(sample_plan, hartford_risk, "HO3", AS_OF)
    executed = [e for e in result.trace if not e.skipped]
    for prev, nxt in zip(executed, executed[1:]):
        assert nxt.premium_before == prev.premium_after
    assert result.premium == executed[-1].premium_after


# ------------------------------------------------------- lookup semantics ---


@pytest.mark.parametrize(
    "roof_year,expected_factor",
    [
        (2020, "0.95"),   # age 6   -> band 0-10
        (2016, "0.95"),   # age 10  -> upper edge of 0-10, closed bounds
        (2015, "1.00"),   # age 11  -> lower edge of 11-15, no gap, no overlap
        (2011, "1.00"),   # age 15
        (2010, "1.14"),   # age 16
        (2006, "1.14"),   # age 20
        (2005, "1.38"),   # age 21  -> open-ended top band
        (1960, "1.38"),   # age 66  -> still the top band
    ],
)
def test_closed_bands_cover_their_edges_exactly_once(
    sample_plan, hartford_risk, roof_year, expected_factor
):
    risk = hartford_risk.model_copy(update={"roof_year": roof_year})
    result = rate(sample_plan, risk, "HO3", AS_OF)
    entry = next(e for e in result.trace if e.step_id == "roof")
    assert entry.operand == Decimal(expected_factor)


def test_band_lookup_uses_derived_age_not_raw_year(sample_plan, hartford_risk):
    """roof_age is derived from as-of year, so the same roof crosses a band as
    time passes -- rating the same risk two years later must pick up the change."""
    risk = hartford_risk.model_copy(update={"roof_year": 2006})
    early = rate(sample_plan, risk, "HO3", datetime.date(2026, 1, 1))
    later = rate(sample_plan, risk, "HO3", datetime.date(2027, 1, 1))
    assert next(e for e in early.trace if e.step_id == "roof").operand == Decimal("1.14")
    assert next(e for e in later.trace if e.step_id == "roof").operand == Decimal("1.38")
    assert later.premium > early.premium


def test_exact_match_key_rejects_an_unlisted_value(sample_plan, hartford_risk):
    """The deductible table is exact-match: $1,500 is not 'close enough' to
    $1,000 or $2,500. Guessing here is how you quote a policy that cannot be
    issued at that price."""
    risk = hartford_risk.model_copy(update={"deductible": 1500})
    with pytest.raises(NoMatchError) as exc:
        rate(sample_plan, risk, "HO3", AS_OF)
    assert "deductible" in str(exc.value)
    assert "no 'all other' row" in str(exc.value)
    assert "p.29" in str(exc.value)                    # points at the filing page


def test_string_protection_classes_work(sample_plan, hartford_risk):
    """'10W' is a real split class and is not the number 10."""
    ten = rate(sample_plan, hartford_risk.model_copy(update={"protection_class": "10"}),
               "HO3", AS_OF)
    ten_w = rate(sample_plan, hartford_risk.model_copy(update={"protection_class": "10W"}),
                 "HO3", AS_OF)
    assert next(e for e in ten.trace if e.step_id == "protection_class").operand == Decimal("2.28")
    assert next(e for e in ten_w.trace if e.step_id == "protection_class").operand == Decimal("2.1")
    assert ten.premium != ten_w.premium


def test_numeric_and_string_keys_compare_equal(sample_plan, hartford_risk):
    """A plan file's "7" and a caller's 7 are the same protection class."""
    a = rate(sample_plan, hartford_risk.model_copy(update={"protection_class": "7"}), "HO3", AS_OF)
    b = rate(sample_plan, hartford_risk.model_copy(update={"protection_class": 7}), "HO3", AS_OF)
    assert a.premium == b.premium


def test_two_key_grid_matches_on_both_keys(sample_plan, hartford_risk):
    """roof_factor is roof_material (exact) x roof_age (band)."""
    comp = rate(sample_plan, hartford_risk, "HO3", AS_OF)
    other = rate(sample_plan, hartford_risk.model_copy(update={"roof_material": "other"}),
                 "HO3", AS_OF)
    assert next(e for e in comp.trace if e.step_id == "roof").operand == Decimal("1.14")
    assert next(e for e in other.trace if e.step_id == "roof").operand == Decimal("1.09")


def test_unmatched_key_in_a_grid_raises(sample_plan, hartford_risk):
    risk = hartford_risk.model_copy(update={"roof_material": "slate"})
    with pytest.raises(NoMatchError):
        rate(sample_plan, risk, "HO3", AS_OF)


def test_missing_attribute_is_distinct_from_no_match(sample_plan, hartford_risk):
    """Not asked is not the same as asked-and-unanswered: the plan keys on
    roof_age, so a risk with no roof year cannot be rated against it."""
    risk = hartford_risk.model_copy(update={"roof_year": None})
    with pytest.raises(MissingAttributeError) as exc:
        rate(sample_plan, risk, "HO3", AS_OF)
    assert "roof_age" in str(exc.value)


def test_overlapping_bands_are_caught_not_silently_resolved(sample_plan, hartford_risk):
    """An overlap is a transcription error. Taking the first match would hide it."""
    table = sample_plan.lookup_tables["home_age_factor"]
    broken = LookupTable.model_validate(
        {
            **table.model_dump(),
            "rows": [
                *[r.model_dump() for r in table.rows],
                {"when": {"home_age": {"min": 40, "max": 80}}, "value": 1.5},
            ],
        }
    )
    plan = sample_plan.model_copy(
        update={"lookup_tables": {**sample_plan.lookup_tables, "home_age_factor": broken}}
    )
    with pytest.raises(AmbiguousMatchError) as exc:
        rate(plan, hartford_risk, "HO3", AS_OF)
    assert "Overlapping bands" in str(exc.value)


def test_an_explicitly_cited_default_is_honoured(sample_plan, hartford_risk):
    """A filing that prints 'all other: 1.10' may say so -- but only with a page."""
    table = sample_plan.lookup_tables["deductible_factor"]
    with_default = LookupTable.model_validate(
        {**table.model_dump(), "default": 1.10, "default_source": {"page": 29}}
    )
    plan = sample_plan.model_copy(
        update={"lookup_tables": {**sample_plan.lookup_tables, "deductible_factor": with_default}}
    )
    result = rate(plan, hartford_risk.model_copy(update={"deductible": 1500}), "HO3", AS_OF)
    entry = next(e for e in result.trace if e.step_id == "deductible")
    assert entry.operand == Decimal("1.10")
    assert "all other" in entry.matched


# ------------------------------------------------------------- base rates ---


def test_per_1000_interpolation(sample_plan, hartford_risk):
    """Territory 3: $1,317.00 at $400,000, plus $1.95 per $1,000 above it."""
    risk = hartford_risk.model_copy(update={"coverage_a": 437000})
    result = rate(sample_plan, risk, "HO3", AS_OF)
    base = next(e for e in result.trace if e.step_id == "base_premium")
    assert base.operand == Decimal("1317.00") + Decimal("37") * Decimal("1.95")


def test_exact_breakpoint_is_not_interpolated(sample_plan, hartford_risk):
    risk = hartford_risk.model_copy(update={"coverage_a": 400000})
    result = rate(sample_plan, risk, "HO3", AS_OF)
    base = next(e for e in result.trace if e.step_id == "base_premium")
    assert base.operand == Decimal("1317.00")
    assert "exact breakpoint" in base.matched


def test_below_the_table_refuses_to_rate(sample_plan, hartford_risk):
    """The filing does not write dwellings under $150,000, so neither do we."""
    risk = hartford_risk.model_copy(update={"coverage_a": 120000})
    with pytest.raises(ExtrapolationError) as exc:
        rate(sample_plan, risk, "HO3", AS_OF)
    assert "below the lowest amount" in str(exc.value)


def test_above_the_table_extrapolates_per_1000(sample_plan, hartford_risk):
    risk = hartford_risk.model_copy(update={"coverage_a": 750000})
    result = rate(sample_plan, risk, "HO3", AS_OF)
    base = next(e for e in result.trace if e.step_id == "base_premium")
    assert base.operand == Decimal("1707.00") + Decimal("150") * Decimal("1.80")


def test_above_the_filings_stated_ceiling_refers_out(sample_plan, hartford_risk):
    risk = hartford_risk.model_copy(update={"coverage_a": 2000000})
    with pytest.raises(ExtrapolationError) as exc:
        rate(sample_plan, risk, "HO3", AS_OF)
    assert "stated maximum" in str(exc.value)


def test_base_rate_segments_are_per_territory(sample_plan, hartford_risk):
    """Same house, three territories, three different base premiums."""
    premiums = {}
    for zip_code, terr in [("06880", "1"), ("06371", "2"), ("06105", "3")]:
        result = rate(sample_plan, hartford_risk.model_copy(
            update={"zip_code": zip_code, "address": None}), "HO3", AS_OF)
        assert result.territory_code == terr
        premiums[terr] = result.premium
    assert len(set(premiums.values())) == 3
    assert premiums["1"] > premiums["3"] > premiums["2"]


# ------------------------------------------- additives, caps, floors, round ---


def test_endorsements_add_charges_only_when_selected(sample_plan, hartford_risk):
    without = rate(sample_plan, hartford_risk, "HO3", AS_OF)
    with_both = rate(
        sample_plan,
        hartford_risk.model_copy(update={"endorsements": ["water_backup", "ordinance_law"]}),
        "HO3",
        AS_OF,
    )
    # $68 flat + $0.28 per $1,000 of the $450,000 Coverage A.
    assert with_both.premium - without.premium == Decimal("68") + Decimal("126")


def test_floor_applies_and_is_traced_either_way(sample_plan):
    cheap = PropertyRisk(
        zip_code="06371", state="CT", coverage_a=150000, year_built=2023,
        construction_type="fire_resistive", roof_year=2023, roof_material="composition",
        protection_class="1", deductible=10000,
    )
    result = rate(sample_plan, cheap, "HO3", AS_OF)
    entry = next(e for e in result.trace if e.step_id == "minimum_premium")
    assert entry.premium_before == Decimal("409")
    assert result.premium == Decimal("450")
    assert entry.matched == "minimum premium applied"


def test_renewal_cap_binds_only_on_renewal(sample_plan, hartford_risk):
    new_business = rate(sample_plan, hartford_risk, "HO3", AS_OF)
    assert new_business.premium == Decimal("2132")
    assert next(e for e in new_business.trace if e.step_id == "renewal_cap").skipped

    renewal = rate(sample_plan, hartford_risk.model_copy(
        update={"prior_term_premium": 1500}), "HO3", AS_OF)
    assert renewal.premium == Decimal("1875")          # 1500 x 1.25

    # A generous prior premium leaves the cap non-binding, but still traced.
    uncapped = rate(sample_plan, hartford_risk.model_copy(
        update={"prior_term_premium": 5000}), "HO3", AS_OF)
    entry = next(e for e in uncapped.trace if e.step_id == "renewal_cap")
    assert entry.note == "not binding"
    assert uncapped.premium == Decimal("2132")


def test_cap_without_a_prior_premium_is_a_plan_bug_not_a_silent_skip(sample_plan, hartford_risk):
    """Drop the applies_when gate and the plan is asking for data it never
    required. That must name the plan, not quietly do nothing."""
    steps = [
        s.model_copy(update={"applies_when": {}}) if s.id == "renewal_cap" else s
        for s in sample_plan.steps
    ]
    plan = sample_plan.model_copy(update={"steps": steps})
    with pytest.raises(PlanConfigurationError) as exc:
        rate(plan, hartford_risk, "HO3", AS_OF)
    assert "prior_term_premium" in str(exc.value)


@pytest.mark.parametrize(
    "value,method,to,expected",
    [
        ("2131.50", RoundingMethod.HALF_UP, "1", "2132"),
        ("2131.49", RoundingMethod.HALF_UP, "1", "2131"),
        ("2131.50", RoundingMethod.HALF_EVEN, "1", "2132"),
        ("2132.50", RoundingMethod.HALF_EVEN, "1", "2132"),
        ("2131.01", RoundingMethod.UP, "1", "2132"),
        ("2131.99", RoundingMethod.DOWN, "1", "2131"),
        ("2131.567", RoundingMethod.HALF_UP, "0.01", "2131.57"),
    ],
)
def test_rounding_methods(value, method, to, expected):
    assert apply_rounding(Decimal(value), method, Decimal(to)) == Decimal(expected)


def test_where_rounding_happens_changes_the_answer(sample_plan, hartford_risk):
    """Rounding is a step rather than an output setting precisely because of
    this: rounding after every factor gives a different premium.

    Across $400k-$600k of Coverage A on this risk the two conventions disagree
    on 114 of 201 amounts, by $1-$2. $450,000 is one of the amounts where they
    happen to agree, so this uses $408,000, where they do not.
    """
    hartford_risk = hartford_risk.model_copy(update={"coverage_a": Decimal("408000")})
    factor_ids = {"form", "protection_class", "construction", "roof",
                  "home_age", "deductible", "claims"}
    steps = []
    for step in sample_plan.steps:
        steps.append(step)
        if step.id in factor_ids:
            steps.append(
                sample_plan.steps[8].model_copy(update={"id": f"round_after_{step.id}"})
            )
    eager = sample_plan.model_copy(update={"steps": steps})

    assert rate(sample_plan, hartford_risk, "HO3", AS_OF).premium == Decimal("2008")
    assert rate(eager, hartford_risk, "HO3", AS_OF).premium == Decimal("2010")


# ------------------------------------------------- verification and as-of ---


def test_a_draft_plan_refuses_to_rate(sample_plan, hartford_risk):
    draft = sample_plan.model_copy(
        update={"verification": sample_plan.verification.model_copy(
            update={"status": VerificationStatus.DRAFT_UNVERIFIED})}
    )
    with pytest.raises(PlanNotVerifiedError) as exc:
        rate(draft, hartford_risk, "HO3", AS_OF)
    assert "verification_checklist" in str(exc.value)

    result = rate(draft, hartford_risk, "HO3", AS_OF, allow_unverified=True)
    assert "PLAN UNVERIFIED" in result.warnings[0]


def test_as_of_date_selects_the_plan_version_in_force(sample_plan):
    v2026 = sample_plan.model_copy(update={"expiration_date": datetime.date(2027, 1, 1)})
    v2027 = sample_plan.model_copy(
        update={"plan_id": "sample-mutual-ct-ho-2027-01-01",
                "effective_date": datetime.date(2027, 1, 1)}
    )
    library = PlanLibrary([v2026, v2027])

    assert library.for_date(datetime.date(2026, 6, 1))[0].plan_id.endswith("2026-01-01")
    assert library.for_date(datetime.date(2027, 6, 1))[0].plan_id.endswith("2027-01-01")
    # Before either filing took effect, there is nothing to rate against.
    assert library.for_date(datetime.date(2025, 6, 1)) == []


def test_library_returns_one_plan_per_carrier(sample_plan):
    other = sample_plan.model_copy(update={"plan_id": "other", "carrier": "Other Mutual"})
    library = PlanLibrary([sample_plan, other])
    assert len(library.for_date(AS_OF, state="CT")) == 2
    assert library.carriers() == ["Other Mutual", "Sample Mutual Insurance Company"]
    assert len(library.for_date(AS_OF, carriers=["Other Mutual"])) == 1
    assert library.for_date(AS_OF, state="MA") == []


# -------------------------------------------------------------- warnings ---


def test_estimated_inputs_are_flagged_on_the_result(sample_plan, hartford_risk):
    risk = hartford_risk.model_copy(
        update={"coverage_a_estimated": True, "protection_class_estimated": True}
    )
    result = rate(sample_plan, risk, "HO3", AS_OF)
    assert result.rated
    joined = " ".join(result.warnings)
    assert "coverage_a is an ESTIMATE" in joined
    assert "protection_class is an ESTIMATE" in joined
