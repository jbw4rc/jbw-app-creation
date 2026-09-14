import datetime
from pathlib import Path

import pytest

from src.interpreter import load_plan
from src.schema import PropertyRisk

FIXTURES = Path(__file__).parent / "fixtures"
PLANS_DIR = Path(__file__).parent.parent / "plans"
AS_OF = datetime.date(2026, 1, 1)


@pytest.fixture
def sample_plan():
    return load_plan(FIXTURES / "sample_plan.yaml")


@pytest.fixture
def hartford_risk():
    """Worksheet Example 1's risk: Hartford, territory 3, one prior claim."""
    return PropertyRisk(
        address="742 Prospect Ave, Hartford, CT 06105",
        zip_code="06105",
        state="CT",
        coverage_a=450000,
        year_built=1955,
        square_feet=2400,
        construction_type="masonry",
        roof_year=2008,
        roof_material="composition",
        protection_class="7",
        deductible=2500,
        prior_claims=1,
    )
