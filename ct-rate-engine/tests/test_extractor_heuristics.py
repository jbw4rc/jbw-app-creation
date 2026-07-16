"""Tests for the dependency-free extraction heuristics."""

from __future__ import annotations

from extractor.heuristics import (
    classify_table,
    find_rating_algorithm_lines,
    looks_like_scan,
    parse_key_value_table,
)


def test_classify_protection_class_table() -> None:
    rows = [["Protection Class", "Factor"], ["1", "0.85"], ["4", "1.00"], ["10", "1.60"]]
    factor, conf = classify_table("Protection Class Factors", rows)
    assert factor == "protection_class"
    assert conf >= 0.8


def test_classify_hurricane_beats_generic_deductible() -> None:
    rows = [["Hurricane Deductible", "Factor"], ["1%", "1.00"], ["2%", "0.95"]]
    factor, _ = classify_table("Hurricane Deductible", rows)
    assert factor == "wind_hurricane_deductible"


def test_classify_returns_none_for_unrelated_table() -> None:
    rows = [["Quarter", "Loss Ratio"], ["Q1", "0.62"]]
    factor, conf = classify_table("Historical Loss Ratios", rows)
    assert factor is None
    assert conf == 0.0


def test_parse_key_value_normalizes_pct_and_dollars() -> None:
    rows = [["1", "85%"], ["4", "1.00"], ["base", "$1,250"], ["junk", "n/a"]]
    parsed = parse_key_value_table(rows)
    assert parsed["1"] == 0.85
    assert parsed["4"] == 1.0
    assert parsed["base"] == 1250.0
    assert "junk" not in parsed


def test_find_rating_algorithm_lines() -> None:
    page = (
        "Rating Algorithm\n"
        "Step 1: Determine base premium from territory and Coverage A.\n"
        "Step 2: Multiply by protection class factor.\n"
        "Step 3: Multiply by construction factor.\n"
        "Round to nearest dollar. Minimum premium $250.\n"
        "Unrelated footer text about the company.\n"
    )
    lines = find_rating_algorithm_lines(page)
    assert any("Step 1" in l for l in lines)
    assert any("Round" in l or "Minimum" in l for l in lines)


def test_find_rating_algorithm_lines_absent() -> None:
    assert find_rating_algorithm_lines("Just some prose describing the company history.") == []


def test_looks_like_scan() -> None:
    assert looks_like_scan("") is True
    assert looks_like_scan("   \n  ") is True
    assert looks_like_scan("This page has a good amount of real extractable text content.") is False
