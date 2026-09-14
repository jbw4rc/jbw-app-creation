"""CLI behaviour: the comparison table, the market range, and the guard rails."""

from decimal import Decimal

import pytest

from src.cli import main, _median

from .conftest import FIXTURES


BASE = [
    "rate", "--demo",
    "--address", "742 Prospect Ave, Hartford, CT 06105",
    "--coverage-a", "450000", "--year-built", "1955",
    "--construction", "masonry", "--roof-year", "2008",
    "--protection-class", "7", "--deductible", "2500",
    "--prior-claims", "1", "--as-of", "2026-01-01",
]


def test_comparison_table_by_carrier_and_form(capsys):
    assert main(BASE + ["--forms", "HO2,HO3,HO5", "--carriers", "all"]) == 0
    out = capsys.readouterr().out

    assert "Housatonic Casualty Company" in out
    assert "Sample Mutual Insurance Company" in out
    assert "$2,132" in out            # Sample Mutual HO3
    assert "$2,164" in out            # Housatonic HO3
    # Sample Mutual files no HO2, and says so rather than showing a number.
    assert "not written" in out
    assert "Carriers writing -- HO2: 1  HO3: 2  HO5: 2" in out


def test_market_range(capsys):
    main(BASE + ["--forms", "HO3"])
    out = capsys.readouterr().out
    assert "Market low" in out and "Market median" in out and "Market high" in out
    assert "$2,132" in out and "$2,164" in out


@pytest.mark.parametrize(
    "values,expected",
    [
        (["100"], "100"),
        (["100", "200"], "150"),          # even count -> midpoint of the two
        (["100", "200", "300"], "200"),
        (["300", "100", "200"], "200"),   # unordered input
    ],
)
def test_median(values, expected):
    assert _median([Decimal(v) for v in values]) == Decimal(expected)


def test_carriers_filter_accepts_a_substring(capsys):
    assert main(BASE + ["--forms", "HO3", "--carriers", "Housatonic"]) == 0
    out = capsys.readouterr().out
    assert "Housatonic" in out
    assert "Sample Mutual" not in out


def test_trace_dumps_a_full_derivation(capsys):
    main(BASE + ["--forms", "HO3", "--carriers", "Sample", "--trace", "Sample"])
    out = capsys.readouterr().out

    for step in ["base_premium", "protection_class", "deductible", "round_final"]:
        assert step in out
    assert "p.29" in out                          # every line cites its page
    assert "skipped" in out                       # and says what did not apply
    assert "FINAL" in out


def test_json_output_is_machine_readable(capsys):
    import json

    main(BASE + ["--forms", "HO2,HO3", "--json"])
    payload = json.loads(capsys.readouterr().out)

    sample = payload["carriers"]["Sample Mutual Insurance Company"]
    assert sample["HO3"]["premium"] == "2132"
    assert sample["HO3"]["territory"] == "3"
    assert sample["HO2"]["status"] == "not_written"
    assert sample["HO2"]["premium"] is None
    assert "does not write HO2" in sample["HO2"]["reason"]


def test_a_risk_one_carrier_cannot_rate_still_shows_the_others(capsys):
    """An unlisted deductible is fatal for Sample Mutual (exact match) and fine
    for Housatonic (banded). The comparison should survive that."""
    args = [a for a in BASE]
    args[args.index("--deductible") + 1] = "1500"
    assert main(args + ["--forms", "HO3"]) == 0
    out = capsys.readouterr().out

    assert "Could not rate:" in out
    assert "Sample Mutual Insurance Company HO3" in out
    assert "no row covers" in out
    assert "$2,327" in out or "Housatonic" in out     # the other carrier rated


def test_coverage_a_is_required_and_the_estimator_is_opt_in(capsys):
    args = [a for a in BASE if a not in ("--coverage-a", "450000")]
    with pytest.raises(SystemExit) as exc:
        main(args)
    assert "replacement cost, not market value" in str(exc.value)

    # With --square-feet it estimates, but says so loudly on stderr.
    main(args + ["--square-feet", "2400", "--forms", "HO3"])
    captured = capsys.readouterr()
    assert "Coverage A ESTIMATED" in captured.err
    assert "+/-30%" in captured.err
    assert "coverage_a is an ESTIMATE" in captured.out


def test_estimated_protection_class_is_flagged_in_the_output(capsys):
    main(BASE + ["--forms", "HO3", "--protection-class-estimated"])
    out = capsys.readouterr().out
    assert "protection_class is an ESTIMATE" in out


def test_an_empty_plans_directory_explains_what_to_do(tmp_path):
    with pytest.raises(SystemExit) as exc:
        main([a for a in BASE if a != "--demo"] + ["--plans", str(tmp_path)])
    message = str(exc.value)
    assert "no rating plans" in message
    assert "src.extract" in message
    assert "--demo" in message


def test_as_of_before_any_filing_took_effect(tmp_path):
    with pytest.raises(SystemExit) as exc:
        main([a if a != "2026-01-01" else "2020-01-01" for a in BASE])
    assert "no plan is in force" in str(exc.value)


def test_plans_command_lists_what_is_available(capsys):
    assert main(["plans", "--demo"]) == 0
    out = capsys.readouterr().out
    assert "NAIC 99999" in out
    assert "4 worksheet(s)" in out
    assert "DRAFT" not in out          # both fixtures are verified


def test_validate_command_runs_every_worksheet(capsys):
    assert main(["validate", "--demo"]) == 0
    out = capsys.readouterr().out
    assert out.count("PASS") == 7      # 4 in the sample plan, 3 in the second
    assert "FAIL" not in out
    assert "all worksheets reproduce their filing" in out


def test_validate_fails_loudly_when_a_plan_drifts(capsys, tmp_path):
    """Change one factor and the filing's own example stops reconciling. This is
    the check that catches a bad transcription."""
    source = (FIXTURES / "sample_plan.yaml").read_text()
    broken = source.replace(
        "- {when: {deductible: 2500}, value: 0.920}",
        "- {when: {deductible: 2500}, value: 0.930}",
    )
    assert broken != source
    (tmp_path / "broken.yaml").write_text(broken)

    assert main(["validate", "--plans", str(tmp_path)]) == 1
    out = capsys.readouterr().out
    assert "FAIL" in out
    assert "filing says 2,132.00, engine says 2,155.00" in out
    assert "2 worksheet failure(s)" in out

    # Example 4 still passes: its renewal cap binds below the wrong number and
    # hides the error. A cap or a floor masks upstream mistakes, which is a
    # reason to encode every worked example a filing prints, not just one.
    assert "PASS  Example 4" in out
