"""US state / territory name <-> postal abbreviation lookup.

OpenFEMA uses two-letter postal codes in ``damagedStateAbbreviation`` (IHP)
and ``state`` (NFIP claims), so everything downstream works in abbreviations;
this module only exists so the CLI can accept "Louisiana" as well as "LA".
"""

STATES = {
    "AL": "Alabama", "AK": "Alaska", "AZ": "Arizona", "AR": "Arkansas",
    "CA": "California", "CO": "Colorado", "CT": "Connecticut", "DE": "Delaware",
    "DC": "District of Columbia", "FL": "Florida", "GA": "Georgia",
    "HI": "Hawaii", "ID": "Idaho", "IL": "Illinois", "IN": "Indiana",
    "IA": "Iowa", "KS": "Kansas", "KY": "Kentucky", "LA": "Louisiana",
    "ME": "Maine", "MD": "Maryland", "MA": "Massachusetts", "MI": "Michigan",
    "MN": "Minnesota", "MS": "Mississippi", "MO": "Missouri", "MT": "Montana",
    "NE": "Nebraska", "NV": "Nevada", "NH": "New Hampshire",
    "NJ": "New Jersey", "NM": "New Mexico", "NY": "New York",
    "NC": "North Carolina", "ND": "North Dakota", "OH": "Ohio",
    "OK": "Oklahoma", "OR": "Oregon", "PA": "Pennsylvania",
    "RI": "Rhode Island", "SC": "South Carolina", "SD": "South Dakota",
    "TN": "Tennessee", "TX": "Texas", "UT": "Utah", "VT": "Vermont",
    "VA": "Virginia", "WA": "Washington", "WV": "West Virginia",
    "WI": "Wisconsin", "WY": "Wyoming",
    # Territories and freely associated states that appear in OpenFEMA data.
    "AS": "American Samoa", "FM": "Federated States of Micronesia",
    "GU": "Guam", "MH": "Marshall Islands", "MP": "Northern Mariana Islands",
    "PR": "Puerto Rico", "PW": "Palau", "VI": "U.S. Virgin Islands",
}

_BY_NAME = {name.lower(): abbr for abbr, name in STATES.items()}
_BY_NAME["virgin islands"] = "VI"
_BY_NAME["us virgin islands"] = "VI"
_BY_NAME["washington dc"] = "DC"
_BY_NAME["washington, d.c."] = "DC"


class UnknownState(ValueError):
    pass


def resolve(value):
    """Return the postal abbreviation for a state name or abbreviation."""
    if not value:
        raise UnknownState("no state given")
    raw = str(value).strip()
    if raw.upper() in STATES:
        return raw.upper()
    key = raw.lower().replace(".", "")
    if key in _BY_NAME:
        return _BY_NAME[key]
    raise UnknownState(
        "unrecognized state %r (use a postal code like LA, or a full name)" % value
    )


def name(abbr):
    return STATES.get(abbr, abbr)
