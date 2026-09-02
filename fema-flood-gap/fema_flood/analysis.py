"""Cohort selection and streaming aggregation.

Records are aggregated as they stream off the API rather than collected into a
table first: a big state's registration pull is millions of rows, and the whole
report only ever needs counts, sums, and a value list per disaster.
"""

from array import array

from .schema import date_key, number, truthy, year_of


# --------------------------------------------------------------------- helpers

class Accumulator:
    """Count/sum/percentile accumulator over one money column.

    Tracks two denominators because they answer different questions: ``n`` is
    every household in the cohort (including those awarded nothing), while
    ``n_positive`` is only those actually paid. An average over the first
    understates what a recipient got; over the second it overstates how much of
    the affected population was helped. The report shows both.
    """

    __slots__ = ("n", "total", "n_positive", "total_positive", "_values",
                 "keep_values", "_sorted")

    def __init__(self, keep_values=True):
        self.n = 0
        self.total = 0.0
        self.n_positive = 0
        self.total_positive = 0.0
        self.keep_values = keep_values
        self._values = array("d") if keep_values else None
        self._sorted = {}

    def add(self, value):
        """Add one observation. ``None`` is a real zero (registered, paid nothing)."""
        amount = value or 0.0
        self.n += 1
        self.total += amount
        if amount > 0:
            self.n_positive += 1
            self.total_positive += amount
        if self._values is not None:
            self._values.append(amount)
            if self._sorted:
                self._sorted.clear()

    def merge(self, other):
        self.n += other.n
        self.total += other.total
        self.n_positive += other.n_positive
        self.total_positive += other.total_positive
        if self._values is not None and other._values is not None:
            self._values.extend(other._values)
            self._sorted.clear()

    @property
    def mean(self):
        return self.total / self.n if self.n else None

    @property
    def mean_positive(self):
        return self.total_positive / self.n_positive if self.n_positive else None

    @property
    def share_positive(self):
        return self.n_positive / self.n if self.n else None

    def percentile(self, pct, positive_only=False):
        if self._values is None or not self.n:
            return None
        # A statewide accumulator can hold hundreds of thousands of values and
        # the report asks for several percentiles off each one; sort once.
        values = self._sorted.get(positive_only)
        if values is None:
            values = sorted(v for v in self._values if not positive_only or v > 0)
            self._sorted[positive_only] = values
        if not values:
            return None
        if len(values) == 1:
            return values[0]
        pos = (len(values) - 1) * (pct / 100.0)
        low = int(pos)
        high = min(low + 1, len(values) - 1)
        return values[low] + (values[high] - values[low]) * (pos - low)

    def to_dict(self):
        return {
            "households": self.n,
            "total": round(self.total, 2),
            "mean": _round(self.mean),
            "paid_households": self.n_positive,
            "paid_total": round(self.total_positive, 2),
            "mean_of_paid": _round(self.mean_positive),
            "share_paid": _round(self.share_positive, 4),
            "median": _round(self.percentile(50)),
            "median_of_paid": _round(self.percentile(50, positive_only=True)),
            "p90_of_paid": _round(self.percentile(90, positive_only=True)),
        }


def _round(value, digits=2):
    return None if value is None else round(value, digits)


# ----------------------------------------------------------------- IHP cohort

class CohortOptions:
    """Exactly which registrants count as 'owner, flooded, uninsured'."""

    def __init__(self, owner_only=True, flood_basis="damage",
                 unknown_insurance="exclude", primary_residence_only=False,
                 keep_values=True):
        self.owner_only = owner_only
        self.flood_basis = flood_basis          # damage | water | any
        self.unknown_insurance = unknown_insurance  # exclude | uninsured | insured
        self.primary_residence_only = primary_residence_only
        self.keep_values = keep_values

    def describe(self):
        parts = ["owner-occupant" if self.owner_only else "owner or renter"]
        parts.append({
            "damage": "FEMA-verified flood damage",
            "water": "recorded water level above zero",
            "any": "flood damage flag or recorded water level",
        }[self.flood_basis])
        parts.append("no NFIP flood insurance")
        if self.primary_residence_only:
            parts.append("primary residence only")
        if self.unknown_insurance == "uninsured":
            parts.append("unknown insurance status counted as uninsured")
        elif self.unknown_insurance == "insured":
            parts.append("unknown insurance status counted as insured")
        else:
            parts.append("unknown insurance status excluded")
        return "; ".join(parts)


class Rejections:
    """Why records that arrived were not counted -- a check on the API filter."""

    def __init__(self):
        self.not_owner = 0
        self.no_flood_damage = 0
        self.insured = 0
        self.unknown_insurance = 0
        self.not_primary = 0
        self.wrong_state = 0
        self.filtered_by_disaster = 0

    def to_dict(self):
        return {k: v for k, v in vars(self).items() if v}

    @property
    def total(self):
        return sum(vars(self).values())


# OpenFEMA encodes tenure as single letters ("O"/"R") in the registrations
# table, but spelled-out values appear in adjacent datasets and older extracts.
# Accept both rather than depending on one.
OWNER_TOKENS = ("o", "own", "owner", "owner-occupant", "homeowner")
RENTER_TOKENS = ("r", "rent", "renter", "tenant")


def is_owner(value):
    """True for an owner-occupant, False for a renter, None if unrecognized."""
    if value is None:
        return None
    text = str(value).strip().lower()
    if not text:
        return None
    if text in OWNER_TOKENS or text.startswith("own"):
        return True
    if text in RENTER_TOKENS or text.startswith("rent"):
        return False
    return None


def _flooded(schema, record, basis):
    flag = truthy(schema.get(record, "floodDamage"))
    level = number(schema.get(record, "waterLevel"))
    has_water = level is not None and level > 0
    if basis == "damage":
        return flag is True
    if basis == "water":
        return has_water
    return flag is True or has_water


class DisasterBucket:
    def __init__(self, disaster_number, keep_values=True):
        self.disaster_number = disaster_number
        self.households = 0
        self.ihp = Accumulator(keep_values)
        self.ha = Accumulator(keep_values)
        self.ona = Accumulator(keep_values)
        self.verified_real_property_loss = 0.0
        self.verified_personal_property_loss = 0.0
        self.years = set()

    def add(self, schema, record, deflator, year):
        self.households += 1
        if year:
            self.years.add(year)
        self.ihp.add(deflator.adjust(number(schema.get(record, "ihpAmount")), year))
        self.ha.add(deflator.adjust(number(schema.get(record, "haAmount")), year))
        self.ona.add(deflator.adjust(number(schema.get(record, "onaAmount")), year))
        self.verified_real_property_loss += (
            deflator.adjust(number(schema.get(record, "rpfvl")), year) or 0.0)
        self.verified_personal_property_loss += (
            deflator.adjust(number(schema.get(record, "ppfvl")), year) or 0.0)

    def merge(self, other):
        self.households += other.households
        self.ihp.merge(other.ihp)
        self.ha.merge(other.ha)
        self.ona.merge(other.ona)
        self.verified_real_property_loss += other.verified_real_property_loss
        self.verified_personal_property_loss += other.verified_personal_property_loss
        self.years |= other.years

    def to_dict(self):
        return {
            "disaster_number": self.disaster_number,
            "households": self.households,
            "ihp": self.ihp.to_dict(),
            "ha": self.ha.to_dict(),
            "ona": self.ona.to_dict(),
            "verified_real_property_loss": round(self.verified_real_property_loss, 2),
            "verified_personal_property_loss": round(self.verified_personal_property_loss, 2),
        }


class IhpResult:
    def __init__(self, options):
        self.options = options
        self.by_disaster = {}
        self.statewide = DisasterBucket(None, options.keep_values)
        self.rejections = Rejections()
        self.records_seen = 0

    def bucket(self, disaster_number):
        if disaster_number not in self.by_disaster:
            self.by_disaster[disaster_number] = DisasterBucket(
                disaster_number, self.options.keep_values)
        return self.by_disaster[disaster_number]

    def disasters_sorted(self, key="ihp_total"):
        rows = list(self.by_disaster.values())
        if key == "disaster":
            rows.sort(key=lambda b: (b.disaster_number is None, b.disaster_number))
        elif key == "households":
            rows.sort(key=lambda b: -b.households)
        else:
            rows.sort(key=lambda b: -b.ihp.total)
        return rows


def aggregate_ihp(records, schema, options, deflator, state=None,
                  disaster_years=None, allowed_disasters=None):
    """Fold IHP registration records into per-disaster totals.

    ``allowed_disasters`` (from the declaration filters) and every cohort
    predicate are re-applied here, so the result is correct even if the
    server-side ``$filter`` was dropped or interpreted loosely.
    """
    result = IhpResult(options)
    disaster_years = disaster_years or {}

    for record in records:
        result.records_seen += 1

        if state and str(schema.get(record, "state", "")).upper() != state:
            result.rejections.wrong_state += 1
            continue

        if options.owner_only and is_owner(schema.get(record, "ownRent")) is not True:
            result.rejections.not_owner += 1
            continue

        if not _flooded(schema, record, options.flood_basis):
            result.rejections.no_flood_damage += 1
            continue

        insured = truthy(schema.get(record, "floodInsurance"))
        if insured is True:
            result.rejections.insured += 1
            continue
        if insured is None:
            if options.unknown_insurance == "exclude":
                result.rejections.unknown_insurance += 1
                continue
            if options.unknown_insurance == "insured":
                result.rejections.insured += 1
                continue

        if options.primary_residence_only:
            primary = truthy(schema.get(record, "primaryResidence"))
            if primary is False:
                result.rejections.not_primary += 1
                continue

        raw_disaster = schema.get(record, "disasterNumber")
        try:
            disaster_number = int(raw_disaster) if raw_disaster is not None else None
        except (TypeError, ValueError):
            disaster_number = None

        if allowed_disasters is not None and disaster_number not in allowed_disasters:
            result.rejections.filtered_by_disaster += 1
            continue

        year = disaster_years.get(disaster_number)
        result.bucket(disaster_number).add(schema, record, deflator, year)
        result.statewide.add(schema, record, deflator, year)

    return result


# ------------------------------------------------- homeowners-insurance gap

class HomeInsuranceOptions:
    """Owner-occupants with no homeowners insurance of any kind.

    Split by whether the damage was flood, because that decides whether the
    counterfactual holds: a homeowners policy would ordinarily have covered
    wind, fire, hail or a fallen tree, but every standard HO form excludes
    flood. Only the non-flood side supports "insurance would have paid for
    this instead of FEMA".
    """

    def __init__(self, owner_only=True, unknown_insurance="exclude",
                 flood_basis="damage", keep_values=True, enabled=True):
        self.owner_only = owner_only
        self.unknown_insurance = unknown_insurance
        self.flood_basis = flood_basis
        self.keep_values = keep_values
        self.enabled = enabled

    def describe(self):
        parts = ["owner-occupant" if self.owner_only else "owner or renter",
                 "no homeowners insurance"]
        parts.append({
            "exclude": "unknown insurance status excluded",
            "uninsured": "unknown insurance status counted as uninsured",
            "insured": "unknown insurance status counted as insured",
        }[self.unknown_insurance])
        return "; ".join(parts)


class HomeInsuranceResult:
    """The cohort, and the two halves the counterfactual splits it into."""

    def __init__(self, options):
        self.options = options
        self.all = IhpResult(options)
        self.flood_damaged = IhpResult(options)     # HO would not have paid
        self.other_peril = IhpResult(options)       # HO ordinarily would have
        self.rejections = Rejections()
        self.records_seen = 0

    def to_dict(self):
        return {
            "cohort": self.options.describe(),
            "households": self.all.statewide.households,
            "statewide": self.all.statewide.to_dict(),
            "flood_damaged": self.flood_damaged.statewide.to_dict(),
            "other_peril": self.other_peril.statewide.to_dict(),
            "records_examined": self.records_seen,
            "records_rejected": self.rejections.to_dict(),
        }


def aggregate_home_insurance(records, schema, options, deflator, state=None,
                             disaster_years=None, allowed_disasters=None):
    """Fold uninsured-homeowner registrations into the cohort and its halves."""
    result = HomeInsuranceResult(options)
    disaster_years = disaster_years or {}

    for record in records:
        result.records_seen += 1

        if state and str(schema.get(record, "state", "")).upper() != state:
            result.rejections.wrong_state += 1
            continue

        if options.owner_only and is_owner(schema.get(record, "ownRent")) is not True:
            result.rejections.not_owner += 1
            continue

        insured = truthy(schema.get(record, "homeOwnersInsurance"))
        if insured is True:
            result.rejections.insured += 1
            continue
        if insured is None:
            if options.unknown_insurance == "exclude":
                result.rejections.unknown_insurance += 1
                continue
            if options.unknown_insurance == "insured":
                result.rejections.insured += 1
                continue

        raw = schema.get(record, "disasterNumber")
        try:
            disaster_number = int(raw) if raw is not None else None
        except (TypeError, ValueError):
            disaster_number = None

        if allowed_disasters is not None and disaster_number not in allowed_disasters:
            result.rejections.filtered_by_disaster += 1
            continue

        year = disaster_years.get(disaster_number)
        flooded = _flooded(schema, record, options.flood_basis)
        for target in (result.all,
                       result.flood_damaged if flooded else result.other_peril):
            target.bucket(disaster_number).add(schema, record, deflator, year)
            target.statewide.add(schema, record, deflator, year)

    return result


# ---------------------------------------------------------------- NFIP claims

class NfipOptions:
    def __init__(self, owner_occupied_only=False, primary_residence_only=False,
                 min_year=None, max_year=None, keep_values=True):
        self.owner_occupied_only = owner_occupied_only
        self.primary_residence_only = primary_residence_only
        self.min_year = min_year
        self.max_year = max_year
        self.keep_values = keep_values

    def describe(self):
        parts = []
        parts.append("single-family / owner-occupied dwellings only"
                     if self.owner_occupied_only else "all occupancy types")
        if self.primary_residence_only:
            parts.append("primary residences only")
        if self.min_year or self.max_year:
            parts.append("loss years %s-%s" % (self.min_year or "earliest",
                                               self.max_year or "latest"))
        return "; ".join(parts)


class NfipResult:
    def __init__(self, options):
        self.options = options
        self.paid = Accumulator(options.keep_values)     # building + contents + ICC
        self.building = Accumulator(options.keep_values)
        self.contents = Accumulator(options.keep_values)
        self.by_year = {}
        self.by_disaster = {}
        self.claims_seen = 0
        self.claims_skipped = 0
        self.claims_multi_matched = 0

    def to_dict(self):
        return {
            "claims": self.paid.n,
            "total_paid": round(self.paid.total, 2),
            "paid": self.paid.to_dict(),
            "building": self.building.to_dict(),
            "contents": self.contents.to_dict(),
            "by_year": {y: a.to_dict() for y, a in sorted(self.by_year.items())},
        }


def _event_index(windows):
    """Bucket declaration windows by the years they touch, for fast lookup."""
    index = {}
    for disaster_number, start, end in windows:
        if not start:
            continue
        end = end or start
        for year in range(int(start[:4]), int(end[:4]) + 1):
            index.setdefault(year, []).append((disaster_number, start, end))
    return index


def aggregate_nfip(records, schema, options, deflator, state=None,
                   event_windows=None, occupancy_codes=None):
    """Fold NFIP claims into statewide, per-year, and per-event payout stats.

    Per-event matching is what makes the comparison fair: it lines an insured
    neighbour's payout up against the same storm the uninsured household
    registered for, instead of against a state-lifetime average dominated by
    whichever years had the most claims.
    """
    result = NfipResult(options)
    index = _event_index(event_windows or [])
    occupancy_codes = occupancy_codes or set()

    for record in records:
        result.claims_seen += 1

        if state and str(schema.get(record, "state", "")).upper() != state:
            result.claims_skipped += 1
            continue

        loss_day = date_key(schema.get(record, "dateOfLoss"))
        year = year_of(schema.get(record, "yearOfLoss")) or year_of(loss_day)
        if options.min_year and (year is None or year < options.min_year):
            result.claims_skipped += 1
            continue
        if options.max_year and (year is None or year > options.max_year):
            result.claims_skipped += 1
            continue

        if options.owner_occupied_only:
            occupancy = number(schema.get(record, "occupancyType"))
            if occupancy is None or int(occupancy) not in occupancy_codes:
                result.claims_skipped += 1
                continue

        if options.primary_residence_only:
            primary = truthy(schema.get(record, "primaryResidence"))
            if primary is False:
                result.claims_skipped += 1
                continue

        building = deflator.adjust(number(schema.get(record, "buildingPaid")), year) or 0.0
        contents = deflator.adjust(number(schema.get(record, "contentsPaid")), year) or 0.0
        icc = deflator.adjust(number(schema.get(record, "iccPaid")), year) or 0.0
        total = building + contents + icc

        result.paid.add(total)
        result.building.add(building)
        result.contents.add(contents)
        if year is not None:
            result.by_year.setdefault(year, Accumulator(False)).add(total)

        if loss_day and year in index:
            matched = 0
            for disaster_number, start, end in index[year]:
                if start <= loss_day <= end:
                    result.by_disaster.setdefault(
                        disaster_number, Accumulator(options.keep_values)).add(total)
                    matched += 1
            if matched > 1:
                result.claims_multi_matched += 1

    return result
