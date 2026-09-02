"""State cost share on IHP, and what happens to it if the terms change.

Under the Stafford Act the two halves of IHP are funded differently:

* **Housing Assistance** (repair, replacement, rental, permanent housing
  construction) -- section 408(c) -- is **100% federal**. No state match.
* **Other Needs Assistance** -- section 408(e), cost share at 408(g),
  42 U.S.C. 5174(g) -- is **75% federal / 25% non-federal**. The state pays a
  quarter, whether it administers ONA itself or FEMA administers it.

So a state already carries a standing liability on every ONA dollar in these
tables. That is the baseline this module reports, and the anchor for what a
change to the terms would cost.
"""

# 42 U.S.C. 5174(g): federal share of ONA is 75 percent.
DEFAULT_ONA_STATE_SHARE = 0.25
# Section 408(c) Housing Assistance carries no non-federal share.
DEFAULT_HA_STATE_SHARE = 0.0

CITATION = ("Stafford Act sec. 408(g) (42 U.S.C. 5174(g)): the federal share of "
            "Other Needs Assistance is 75%, leaving 25% non-federal. Housing "
            "Assistance under sec. 408(c) is 100% federal.")


class Scenario:
    """One funding arrangement and what it would have cost the state."""

    __slots__ = ("key", "label", "ona_share", "ha_share", "note")

    def __init__(self, key, label, ona_share, ha_share, note=""):
        self.key = key
        self.label = label
        self.ona_share = ona_share
        self.ha_share = ha_share
        self.note = note

    def cost(self, ha_total, ona_total):
        return ha_total * self.ha_share + ona_total * self.ona_share

    def to_dict(self, ha_total, ona_total, baseline=None):
        cost = self.cost(ha_total, ona_total)
        payload = {
            "key": self.key,
            "label": self.label,
            "ona_state_share": self.ona_share,
            "ha_state_share": self.ha_share,
            "state_cost": round(cost, 2),
            "note": self.note,
        }
        if baseline is not None:
            payload["increase_over_today"] = round(cost - baseline, 2)
            payload["multiple_of_today"] = (
                round(cost / baseline, 2) if baseline else None)
        return payload


class CostShare:
    """The state's baseline share, plus illustrative alternatives."""

    def __init__(self, ona_state_share=DEFAULT_ONA_STATE_SHARE,
                 ha_state_share=DEFAULT_HA_STATE_SHARE, include_scenarios=True):
        self.ona_state_share = ona_state_share
        self.ha_state_share = ha_state_share
        self.include_scenarios = include_scenarios

    @property
    def baseline(self):
        return Scenario(
            "today", "Today: 75/25 federal-state split on ONA",
            self.ona_state_share, self.ha_state_share,
            "current law" if self.is_statutory else "custom shares")

    @property
    def is_statutory(self):
        return (self.ona_state_share == DEFAULT_ONA_STATE_SHARE
                and self.ha_state_share == DEFAULT_HA_STATE_SHARE)

    def scenarios(self):
        """The baseline, then progressively more state exposure.

        These are illustrations of how the same historical caseload would have
        been funded under different terms -- not forecasts, and not proposals
        anyone has enacted. They are the useful comparison because the
        caseload is fixed and only the split moves.
        """
        rows = [self.baseline]
        if not self.include_scenarios:
            return rows
        rows.extend([
            Scenario("ona_50", "If the ONA state share rose to 50%",
                     0.50, self.ha_state_share,
                     "doubles the existing ONA liability"),
            Scenario("ha_matched", "If Housing Assistance carried a 25% share too",
                     self.ona_state_share, 0.25,
                     "extends cost sharing to the larger half of IHP"),
            Scenario("no_ihp", "If IHP were withdrawn entirely",
                     1.00, 1.00,
                     "the whole award falls to the state, the household, or nobody"),
        ])
        return rows

    def state_cost(self, ha_total, ona_total):
        return self.baseline.cost(ha_total, ona_total)

    def table(self, ha_total, ona_total):
        baseline = self.state_cost(ha_total, ona_total)
        return [s.to_dict(ha_total, ona_total, baseline) for s in self.scenarios()]

    def describe(self):
        return ("state share: %.0f%% of ONA, %.0f%% of HA%s"
                % (self.ona_state_share * 100, self.ha_state_share * 100,
                   "" if self.is_statutory else " (non-statutory, set on the command line)"))
