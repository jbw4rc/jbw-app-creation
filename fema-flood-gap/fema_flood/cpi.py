"""Constant-dollar conversion.

Comparing a 2005 Katrina IHP award to a 2021 NFIP payout in nominal dollars
overstates the recent side by ~40%, so the report can restate every dollar in
one base year. Series is CPI-U, US city average, all items, annual average
(BLS series CUUR0000SA0). Values are baked in so the tool works offline; pass
``--cpi-file`` to supply your own table (a JSON object of ``{"year": index}``)
if you would rather use a different deflator or a newer vintage.
"""

import json

# Annual averages. 2025 is a provisional estimate, not a final BLS annual
# average -- results adjusted to/through 2025 are flagged in the report.
CPI_U = {
    1990: 130.7, 1991: 136.2, 1992: 140.3, 1993: 144.5, 1994: 148.2,
    1995: 152.4, 1996: 156.9, 1997: 160.5, 1998: 163.0, 1999: 166.6,
    2000: 172.2, 2001: 177.1, 2002: 179.9, 2003: 184.0, 2004: 188.9,
    2005: 195.3, 2006: 201.6, 2007: 207.342, 2008: 215.303, 2009: 214.537,
    2010: 218.056, 2011: 224.939, 2012: 229.594, 2013: 232.957, 2014: 236.736,
    2015: 237.017, 2016: 240.007, 2017: 245.120, 2018: 251.107, 2019: 255.657,
    2020: 258.811, 2021: 270.970, 2022: 292.655, 2023: 304.702, 2024: 313.689,
    2025: 322.100,
}

PROVISIONAL_YEARS = {2025}


class Deflator:
    """Rescales nominal dollars into ``base_year`` dollars.

    A pass-through (``base_year is None``) keeps everything nominal, so callers
    can always run amounts through ``adjust`` without branching.
    """

    def __init__(self, base_year=None, table=None):
        self.table = dict(table or CPI_U)
        self.base_year = base_year
        self.missing_years = set()
        if base_year is not None and base_year not in self.table:
            raise ValueError(
                "no CPI value for base year %s (have %s-%s)"
                % (base_year, min(self.table), max(self.table))
            )

    @property
    def active(self):
        return self.base_year is not None

    @property
    def provisional(self):
        return self.active and self.base_year in PROVISIONAL_YEARS

    def adjust(self, amount, year):
        """Convert ``amount`` from ``year`` dollars into base-year dollars."""
        if not self.active or amount is None:
            return amount
        if year is None:
            return amount
        idx = self.table.get(int(year))
        if idx is None:
            # Out-of-range years (pre-1990 declarations) stay nominal rather
            # than silently dropping out of the totals; the report says so.
            self.missing_years.add(int(year))
            return amount
        return amount * (self.table[self.base_year] / idx)

    def label(self, prefix=""):
        if not self.active:
            return prefix + "nominal dollars (not inflation-adjusted)"
        suffix = " (provisional CPI)" if self.provisional else ""
        return prefix + "constant %d dollars, CPI-U%s" % (self.base_year, suffix)


def load_table(path):
    with open(path) as fh:
        raw = json.load(fh)
    return {int(k): float(v) for k, v in raw.items()}
