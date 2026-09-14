"""Worksheet tests: the engine must reproduce each filing's own worked example.

This is the only real evidence that a rating sequence was read correctly, so
these run automatically over every worksheet in every plan -- the fixture and
every real plan under plans/. A plan spec is not done until its worksheets pass.
"""

import datetime

import pytest

from src.interpreter import load_plan, rate
from src.schema import PropertyRisk, RatingPlan

from .conftest import FIXTURES, PLANS_DIR


def _all_plans():
    paths = sorted(FIXTURES.glob("*.yaml")) + sorted(PLANS_DIR.rglob("*.y*ml"))
    return [load_plan(p) for p in paths]


def _worksheet_cases():
    cases = []
    for plan in _all_plans():
        for ws in plan.worksheets:
            cases.append(pytest.param(plan, ws, id=f"{plan.plan_id}::{ws.name}"))
    return cases


def test_every_plan_has_at_least_one_worksheet():
    """A plan with no worksheet has never been checked against its own filing."""
    for plan in _all_plans():
        assert plan.worksheets, (
            f"plan '{plan.plan_id}' has no worksheets. Encode the filing's worked "
            f"example before trusting any number this plan produces."
        )


@pytest.mark.parametrize("plan,ws", _worksheet_cases())
def test_worksheet_reproduces_filing_premium(plan: RatingPlan, ws):
    risk = PropertyRisk.model_validate(ws.risk)
    as_of = plan.effective_date
    result = rate(plan, risk, ws.form, as_of=as_of, allow_unverified=True)

    assert result.rated, f"expected a premium, got: {result.reason}"

    by_step = {e.step_id: e.premium_after for e in result.trace}
    for step_id, expected in ws.expected_steps.items():
        actual = by_step.get(step_id)
        assert actual is not None, f"step '{step_id}' did not execute"
        assert abs(actual - expected) <= ws.tolerance, (
            f"diverged at step '{step_id}' (filing p.{ws.source.page}): "
            f"expected {expected}, got {actual}\n\n{result.render_trace()}"
        )

    diff = abs(result.premium - ws.expected_premium)
    assert diff <= ws.tolerance, (
        f"'{ws.name}' (filing p.{ws.source.page}): filing states "
        f"{ws.expected_premium}, engine produced {result.premium} "
        f"(off by {diff})\n\n{result.render_trace()}"
    )
