"""Disaster declaration lookup.

Registration records carry only a disaster number, so declarations supply the
human-readable title, the incident type, and -- critically -- the incident date
window used to match NFIP claims to the same storm.
"""

from .schema import date_key, truthy

# Incident types whose damage is plausibly flood-related. Used only when the
# caller asks to restrict by incident type; the cohort itself is defined by the
# per-registrant flood-damage flag, not by the declaration's label.
FLOOD_INCIDENT_TYPES = {
    "flood", "hurricane", "severe storm", "severe storm(s)", "coastal storm",
    "tropical storm", "typhoon", "dam/levee break", "tsunami",
    "severe ice storm", "snowstorm", "mud/landslide",
}


class Declaration:
    __slots__ = ("disaster_number", "title", "incident_type", "begin", "end",
                 "declared", "ia_declared")

    def __init__(self, disaster_number):
        self.disaster_number = disaster_number
        self.title = None
        self.incident_type = None
        self.begin = None
        self.end = None
        self.declared = None
        self.ia_declared = None

    @property
    def year(self):
        source = self.begin or self.declared
        return int(source[:4]) if source else None

    @property
    def window(self):
        """(start, end) date keys, widened later by the match buffer."""
        return (self.begin or self.declared, self.end or self.begin or self.declared)

    def to_dict(self):
        return {
            "disaster_number": self.disaster_number,
            "title": self.title,
            "incident_type": self.incident_type,
            "incident_begin": self.begin,
            "incident_end": self.end,
            "declaration_date": self.declared,
            "year": self.year,
            "ia_declared": self.ia_declared,
        }


def collapse(records, schema):
    """Collapse per-county declaration rows into one entry per disaster.

    DisasterDeclarationsSummaries has a row per designated area, so the same
    disaster appears many times; the incident window is the union across rows.
    """
    out = {}
    for record in records:
        raw = schema.get(record, "disasterNumber")
        try:
            number = int(raw)
        except (TypeError, ValueError):
            continue

        entry = out.get(number)
        if entry is None:
            entry = out[number] = Declaration(number)

        entry.title = entry.title or schema.get(record, "title")
        entry.incident_type = entry.incident_type or schema.get(record, "incidentType")

        begin = date_key(schema.get(record, "incidentBeginDate"))
        end = date_key(schema.get(record, "incidentEndDate"))
        declared = date_key(schema.get(record, "declarationDate"))
        if begin and (entry.begin is None or begin < entry.begin):
            entry.begin = begin
        if end and (entry.end is None or end > entry.end):
            entry.end = end
        if declared and (entry.declared is None or declared < entry.declared):
            entry.declared = declared
        if entry.ia_declared is not True:
            entry.ia_declared = truthy(schema.get(record, "iaProgramDeclared"))
    return out


def shift_days(day, delta):
    """Shift a 'YYYY-MM-DD' key by whole days without pulling in datetime parsing."""
    import datetime

    if not day:
        return None
    parsed = datetime.date(int(day[:4]), int(day[5:7]), int(day[8:10]))
    return (parsed + datetime.timedelta(days=delta)).isoformat()


def event_windows(declarations, buffer_days=0):
    """Date windows for NFIP matching, widened by ``buffer_days`` on each side.

    A buffer helps because an NFIP date of loss is when water reached the
    building, which can sit a day or two outside the declared incident period.
    """
    windows = []
    for entry in declarations.values():
        start, end = entry.window
        if not start:
            continue
        windows.append((
            entry.disaster_number,
            shift_days(start, -buffer_days),
            shift_days(end or start, buffer_days),
        ))
    return windows


def non_housing(declarations):
    """Disaster numbers whose incident type is not a housing event.

    COVID-19 declarations are typed "Biological" and account for most
    Category B spending in every state; counting them as a cost of uninsured
    homes would be plainly wrong.
    """
    from .pa import NON_HOUSING_INCIDENT_TYPES
    return {number for number, entry in declarations.items()
            if (entry.incident_type or "").strip().lower()
            in NON_HOUSING_INCIDENT_TYPES}


def select(declarations, min_year=None, max_year=None, incident_types=None,
           disasters=None, flood_only=False):
    """Filter the declaration map down to the disasters in scope."""
    wanted = None
    if incident_types:
        wanted = {t.strip().lower() for t in incident_types if t.strip()}
    elif flood_only:
        wanted = set(FLOOD_INCIDENT_TYPES)

    out = {}
    for number, entry in declarations.items():
        if disasters is not None and number not in disasters:
            continue
        year = entry.year
        if min_year and (year is None or year < min_year):
            continue
        if max_year and (year is None or year > max_year):
            continue
        if wanted is not None:
            label = (entry.incident_type or "").strip().lower()
            if label not in wanted:
                continue
        out[number] = entry
    return out
