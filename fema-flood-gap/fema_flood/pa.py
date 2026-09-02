"""Public Assistance sheltering and shelter-in-home projects with a state applicant.

The Individuals and Households Program is not the only way a state pays for
uninsured homes after a disaster. Transitional Sheltering Assistance (hotel
rooms for displaced households), mass-care shelters, and the STEP / PREPS
"shelter-in-home" repair programs all run through Public Assistance under
Stafford Act sec. 403, Category B, with a non-federal share -- 25% by default,
observed per project in the data because FEMA publishes both the federal
share obligated and the total.

This module isolates those projects where the applicant is the state or a
state agency, so the non-federal share is the state's rather than a
locality's, and sums them per declaration. Two tiers are kept: projects whose
title matches sheltering keywords (a floor -- titles are free text and will
miss some), and every Category B project with a state applicant (a ceiling
for the same population of costs). Every matched project is written out so
the keyword hits can be audited.
"""

import re

from .schema import number

PA_DATASET = "PublicAssistanceFundedProjectsDetails"
PA_APPLICANTS_DATASET = "PublicAssistanceApplicants"

PA_FIELDS = {
    "state": ["stateCode", "state", "stateAbbreviation"],
    "disasterNumber": ["disasterNumber"],
    "title": ["applicationTitle", "projectTitle", "title"],
    "applicantId": ["applicantId"],
    "category": ["damageCategoryCode", "dcc", "damageCategory"],
    "totalObligated": ["totalObligated", "projectAmount"],
    "federalObligated": ["federalShareObligated", "federalShare"],
    "projectAmount": ["projectAmount"],
    "county": ["county"],
    "pwNumber": ["pwNumber"],
}
PA_OPTIONAL = {"projectAmount", "county", "pwNumber"}

PA_APPLICANT_FIELDS = {
    "applicantId": ["applicantId"],
    "name": ["applicantName", "applicant", "name"],
    "state": ["stateCode", "state"],
}
PA_APPLICANT_OPTIONAL = {"state"}

# Sheltering, hotel sheltering, and shelter-in-home repair programs. Word
# boundaries matter: "step" must not match "steps" in a bridge title.
DEFAULT_KEYWORDS = [
    r"shelter\w*", r"tsa", r"transitional", r"step", r"preps",
    r"essential power", r"non-?congregate", r"hotel", r"lodging",
    r"mass care", r"temporary housing", r"sheltering and temporary",
]

# Applicant IDs are "CCC-Uxxxxx-00"; the leading county code is 000 for a
# statewide or state-agency applicant. Names are the secondary check.
STATE_ID_PREFIX = "000"
STATE_NAME_PATTERN = re.compile(
    r"\b(state of|department of|dept\.? of|division of|office of|agency|"
    r"authority|commission|university|board of|emergency management|"
    r"mema|gohsep|tdem|fdem|national guard|highway patrol|state police)\b",
    re.I)
LOCAL_NAME_PATTERN = re.compile(
    r"\b(county|parish|city of|town of|village of|borough|township|"
    r"school district|municipal|tribe|tribal|nation)\b", re.I)


class PaOptions:
    def __init__(self, enabled=True, keywords=None, category="B",
                 state_applicants_only=True):
        self.enabled = enabled
        self.keywords = list(keywords) if keywords else list(DEFAULT_KEYWORDS)
        self.category = category
        self.state_applicants_only = state_applicants_only
        self._pattern = re.compile(
            r"\b(?:" + "|".join(self.keywords) + r")\b", re.I)

    def matches(self, title):
        return bool(title) and bool(self._pattern.search(str(title)))

    def describe(self):
        return ("Public Assistance category %s, %s, titles matching: %s"
                % (self.category,
                   "state or state-agency applicants only"
                   if self.state_applicants_only else "all applicants",
                   ", ".join(k.replace("\\w*", "*").replace("-?", "-")
                             for k in self.keywords)))


def is_state_applicant(applicant_id, name):
    """True when the applicant is the state or one of its agencies."""
    if applicant_id and str(applicant_id).strip().startswith(STATE_ID_PREFIX):
        return True
    if name:
        text = str(name)
        if LOCAL_NAME_PATTERN.search(text):
            return False
        if STATE_NAME_PATTERN.search(text):
            return True
    return False


class PaTotals:
    __slots__ = ("projects", "total", "federal")

    def __init__(self):
        self.projects = 0
        self.total = 0.0
        self.federal = 0.0

    def add(self, total, federal):
        self.projects += 1
        self.total += total
        self.federal += federal

    @property
    def non_federal(self):
        return self.total - self.federal

    @property
    def non_federal_share(self):
        return self.non_federal / self.total if self.total else None

    def to_dict(self):
        return {"projects": self.projects, "total_obligated": round(self.total, 2),
                "federal_obligated": round(self.federal, 2),
                "non_federal_obligated": round(self.non_federal, 2),
                "observed_non_federal_share": (
                    round(self.non_federal_share, 4)
                    if self.non_federal_share is not None else None)}


class PaBucket:
    """One declaration: the keyword floor and the all-category-B ceiling."""

    def __init__(self, disaster_number):
        self.disaster_number = disaster_number
        self.matched = PaTotals()      # title matched a sheltering keyword
        self.category = PaTotals()     # every project in the category


class PaResult:
    def __init__(self, options):
        self.options = options
        self.categories = {}           # category code -> projects seen
        self.state_applicants = 0      # rows whose applicant classified as state
        self.by_disaster = {}
        self.matched = PaTotals()
        self.category = PaTotals()
        self.projects = []             # every matched project, for audit
        self.records_seen = 0
        self.skipped_other_applicant = 0
        self.skipped_other_category = 0
        self.skipped_filtered = 0
        self.unknown_applicants = 0

    def bucket(self, disaster_number):
        if disaster_number not in self.by_disaster:
            self.by_disaster[disaster_number] = PaBucket(disaster_number)
        return self.by_disaster[disaster_number]

    def to_dict(self):
        return {
            "definition": self.options.describe(),
            "keyword_floor": self.matched.to_dict(),
            "all_category_b_state_applicants": self.category.to_dict(),
            "records_examined": self.records_seen,
            "skipped_other_applicant": self.skipped_other_applicant,
            "skipped_other_category": self.skipped_other_category,
            "matched_projects": len(self.projects),
            "categories_seen": dict(sorted(self.categories.items())),
            "state_applicant_rows": self.state_applicants,
        }


def applicant_names(records, schema):
    """applicantId -> applicantName from the applicants dataset."""
    names = {}
    for record in records:
        applicant_id = schema.get(record, "applicantId")
        if applicant_id:
            names[str(applicant_id).strip()] = schema.get(record, "name")
    return names


def aggregate(records, schema, options, deflator, names=None, state=None,
              disaster_years=None, allowed_disasters=None):
    """Fold PA projects into per-declaration sheltering totals."""
    result = PaResult(options)
    names = names or {}
    disaster_years = disaster_years or {}
    wanted_category = (options.category or "").strip().upper()

    for record in records:
        result.records_seen += 1
        if state and str(schema.get(record, "state", "")).upper() != state:
            continue

        category = str(schema.get(record, "category", "")).strip().upper()
        result.categories[category] = result.categories.get(category, 0) + 1
        if wanted_category and category[:1] != wanted_category[:1]:
            result.skipped_other_category += 1
            continue

        applicant_id = str(schema.get(record, "applicantId", "") or "").strip()
        name = names.get(applicant_id)
        if name is None and applicant_id:
            result.unknown_applicants += 1
        if is_state_applicant(applicant_id, name):
            result.state_applicants += 1
        elif options.state_applicants_only:
            result.skipped_other_applicant += 1
            continue

        raw = schema.get(record, "disasterNumber")
        try:
            disaster_number = int(raw) if raw is not None else None
        except (TypeError, ValueError):
            disaster_number = None
        if allowed_disasters is not None and disaster_number not in allowed_disasters:
            result.skipped_filtered += 1
            continue

        year = disaster_years.get(disaster_number)
        total = deflator.adjust(number(schema.get(record, "totalObligated")) or 0.0, year)
        federal = deflator.adjust(number(schema.get(record, "federalObligated")) or 0.0, year)
        title = schema.get(record, "title", "")

        bucket = result.bucket(disaster_number)
        bucket.category.add(total, federal)
        result.category.add(total, federal)
        if options.matches(title):
            bucket.matched.add(total, federal)
            result.matched.add(total, federal)
            result.projects.append({
                "disaster_number": disaster_number,
                "year": year,
                "applicant_id": applicant_id,
                "applicant": name or "",
                "title": title,
                "category": category,
                "pw_number": schema.get(record, "pwNumber", ""),
                "county": schema.get(record, "county", ""),
                "total_obligated": total,
                "federal_obligated": federal,
                "non_federal_obligated": total - federal,
            })

    result.projects.sort(key=lambda p: -p["total_obligated"])
    return result
