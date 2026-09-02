"""Dataset definitions: which OpenFEMA endpoints we read and what we need from them."""

from . import analysis, api, probe, schema as schema_mod

IHP_DATASET = "IndividualsAndHouseholdsProgramValidRegistrations"
NFIP_DATASET = "FimaNfipClaims"
DECLARATIONS_DATASET = "DisasterDeclarationsSummaries"

# Used only if the OpenFEMA catalog cannot be read; normally the version comes
# from the catalog, because a dataset republished under a new version number
# turns a hard-coded guess into a 404.
FALLBACK_VERSIONS = {IHP_DATASET: 1, NFIP_DATASET: 2, DECLARATIONS_DATASET: 2}

# Keywords for suggesting a replacement when a dataset name is not in the
# catalog at all.
NAME_HINTS = {IHP_DATASET: "Individuals", NFIP_DATASET: "Nfip",
              DECLARATIONS_DATASET: "Declaration"}

# logical name -> candidate physical names, most-preferred first.
IHP_FIELDS = {
    "state": ["damagedStateAbbreviation", "damagedState", "state"],
    "disasterNumber": ["disasterNumber"],
    "ownRent": ["ownRent", "ownersRenters"],
    "floodDamage": ["floodDamage", "floodDamageIndicator"],
    "floodInsurance": ["floodInsurance", "floodInsuranceIndicator"],
    "ihpAmount": ["ihpAmount"],
    "haAmount": ["haAmount"],
    "onaAmount": ["onaAmount"],
    "ihpEligible": ["ihpEligible"],
    "primaryResidence": ["primaryResidence"],
    "waterLevel": ["waterLevel"],
    "rpfvl": ["rpfvl", "realPropertyFvl"],
    "ppfvl": ["ppfvl", "personalPropertyFvl"],
    "county": ["county", "damagedCounty"],
}
IHP_OPTIONAL = {"ihpEligible", "primaryResidence", "waterLevel", "rpfvl", "ppfvl", "county"}

NFIP_FIELDS = {
    "state": ["state"],
    "dateOfLoss": ["dateOfLoss"],
    "yearOfLoss": ["yearOfLoss"],
    # v2 renamed the payment columns; either vintage resolves.
    "buildingPaid": ["amountPaidOnBuildingClaim", "netBuildingPaymentAmount"],
    "contentsPaid": ["amountPaidOnContentsClaim", "netContentsPaymentAmount"],
    "iccPaid": ["amountPaidOnIncreasedCostOfComplianceClaim", "netIccPaymentAmount"],
    "occupancyType": ["occupancyType"],
    "primaryResidence": ["primaryResidence", "primaryResidenceIndicator"],
    "buildingDamage": ["buildingDamageAmount"],
    "buildingCoverage": ["totalBuildingInsuranceCoverage"],
    "contentsCoverage": ["totalContentsInsuranceCoverage"],
    "causeOfDamage": ["causeOfDamage"],
    "floodZone": ["ratedFloodZone", "floodZone"],
    "countyCode": ["countyCode"],
}
NFIP_OPTIONAL = {"iccPaid", "occupancyType", "primaryResidence", "buildingDamage",
                 "buildingCoverage", "contentsCoverage", "causeOfDamage",
                 "floodZone", "countyCode", "yearOfLoss", "dateOfLoss"}

DECLARATION_FIELDS = {
    "disasterNumber": ["disasterNumber"],
    "state": ["state"],
    "title": ["declarationTitle"],
    "incidentType": ["incidentType"],
    "incidentBeginDate": ["incidentBeginDate"],
    "incidentEndDate": ["incidentEndDate"],
    "declarationDate": ["declarationDate"],
    "iaProgramDeclared": ["iaProgramDeclared", "ihProgramDeclared"],
}
DECLARATION_OPTIONAL = {"incidentEndDate", "iaProgramDeclared"}

# NFIP occupancy codes for owner-occupied homes, the closest analogue to an
# IHP "Owner" registrant. 1 = single-family; 11-15 are the v2 split-out of
# single-family / mobile home / townhouse variants introduced with the
# redacted-claims release. Codes 2-6 are 2-4 family, other residential,
# non-residential business, etc.
OWNER_OCCUPANCY_CODES = {1, 11, 12, 13, 14, 15}


def bind(schema, spec, optional):
    for logical, candidates in spec.items():
        schema.bind(logical, candidates, required=logical not in optional)
    return schema


def load_schema(client, dataset, version, spec, optional):
    resolved = schema_mod.discover(client, dataset, version)
    return bind(resolved, spec, optional)


def ihp_schema(client, version, dataset=IHP_DATASET):
    return load_schema(client, dataset, version, IHP_FIELDS, IHP_OPTIONAL)


def nfip_schema(client, version, dataset=NFIP_DATASET):
    return load_schema(client, dataset, version, NFIP_FIELDS, NFIP_OPTIONAL)


def declaration_schema(client, version, dataset=DECLARATIONS_DATASET):
    return load_schema(client, dataset, version, DECLARATION_FIELDS,
                       DECLARATION_OPTIONAL)


def selected_fields(schema):
    return [name for name in schema.bindings.values() if name]


# --------------------------------------------------------------------- filters

def ihp_state_filter(schema, state):
    return "%s eq %s" % (schema.name("state"), api.quote_literal(state))


def _matching_literals(counter, predicate):
    """Filter literals for every sampled value satisfying ``predicate``."""
    if not counter:
        return []
    return [probe.literal(value) for value in counter
            if value is not None and predicate(value)]


def ihp_cohort_filter(schema, state, owner_only=True, flood_damage=True,
                      insurance=None, vocabulary=None):
    """Server-side narrowing for a cohort, written in the data's own vocabulary.

    ``vocabulary`` maps a logical field to a Counter of values actually seen in
    the table (see :mod:`fema_flood.probe`). It matters because the encodings
    are not guessable: tenure is ``"O"``/``"R"``, not ``"Owner"``/``"Renter"``,
    and a column the schema calls boolean can carry 1/0. Asking for the wrong
    literal returns zero rows, which reads like a real answer instead of a bug.
    Without a vocabulary the predicate is left off and applied client side --
    slower, but never silently wrong.

    ``insurance`` is ``"uninsured"``, ``"insured"``, or ``None`` for no
    predicate. Note that "not uninsured" and "insured" are different sets:
    registrations with no flood-insurance value match neither, so the two
    counts do not sum to the flood-damaged total and must be queried
    separately rather than derived by subtraction.

    Every predicate is re-checked client side in ``analysis``, so a filter
    OpenFEMA interprets differently than we expect cannot silently widen the
    cohort.
    """
    vocabulary = vocabulary or {}
    parts = [ihp_state_filter(schema, state)]

    if owner_only:
        literals = _matching_literals(
            vocabulary.get("ownRent"), lambda v: analysis.is_owner(v) is True)
        if literals:
            parts.append(api.or_filters(
                *["%s eq %s" % (schema.name("ownRent"), lit) for lit in literals]))

    if flood_damage:
        literals = _matching_literals(
            vocabulary.get("floodDamage"), lambda v: schema_mod.truthy(v) is True)
        if literals:
            parts.append(api.or_filters(
                *["%s eq %s" % (schema.name("floodDamage"), lit) for lit in literals]))

    if insurance in ("insured", "uninsured"):
        want = insurance == "insured"
        literals = _matching_literals(
            vocabulary.get("floodInsurance"),
            lambda v: schema_mod.truthy(v) is want)
        if literals:
            parts.append(api.or_filters(
                *["%s eq %s" % (schema.name("floodInsurance"), lit)
                  for lit in literals]))

    return api.and_filters(*parts)


def nfip_state_filter(schema, state):
    return "%s eq %s" % (schema.name("state"), api.quote_literal(state))


def declaration_filter(schema, state):
    return "%s eq %s" % (schema.name("state"), api.quote_literal(state))
