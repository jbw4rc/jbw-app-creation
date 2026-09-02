"""Dataset definitions: which OpenFEMA endpoints we read and what we need from them."""

from . import api, schema as schema_mod

# (dataset name, API version). Versions are the current published ones; override
# on the CLI if OpenFEMA publishes a new major version.
IHP = ("IndividualsAndHouseholdsProgramValidRegistrations", 1)
NFIP = ("FimaNfipClaims", 2)
DECLARATIONS = ("DisasterDeclarationsSummaries", 2)

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


def load_schema(client, dataset_version, spec, optional):
    dataset, version = dataset_version
    resolved = schema_mod.discover(client, dataset, version)
    return bind(resolved, spec, optional)


def ihp_schema(client):
    return load_schema(client, IHP, IHP_FIELDS, IHP_OPTIONAL)


def nfip_schema(client):
    return load_schema(client, NFIP, NFIP_FIELDS, NFIP_OPTIONAL)


def declaration_schema(client):
    return load_schema(client, DECLARATIONS, DECLARATION_FIELDS, DECLARATION_OPTIONAL)


def selected_fields(schema):
    return [name for name in schema.bindings.values() if name]


# --------------------------------------------------------------------- filters

def ihp_state_filter(schema, state):
    return "%s eq %s" % (schema.name("state"), api.quote_literal(state))


def ihp_cohort_filter(schema, state, owner_only=True, flood_damage=True,
                      insurance=None):
    """Server-side narrowing for a cohort.

    ``insurance`` is ``"uninsured"``, ``"insured"``, or ``None`` for no
    predicate. Note that "not uninsured" and "insured" are different sets:
    registrations with no flood-insurance value at all match neither, so the
    two counts do not sum to the flood-damaged total and must be queried
    separately rather than derived by subtraction.

    Pushing the cohort into ``$filter`` is the difference between downloading a
    few tens of thousands of rows and a few million: for a state like Louisiana
    the unfiltered registration table is larger than the cohort by two orders of
    magnitude. Every predicate is re-checked client side in ``analysis`` so a
    filter OpenFEMA interprets differently than we expect cannot silently widen
    the cohort.
    """
    parts = [ihp_state_filter(schema, state)]
    if owner_only:
        parts.append("%s eq %s" % (schema.name("ownRent"), api.quote_literal("Owner")))
    if flood_damage:
        parts.append("%s eq %s" % (schema.name("floodDamage"),
                                   schema.flag_literal("floodDamage", True)))
    if insurance in ("insured", "uninsured"):
        parts.append("%s eq %s" % (schema.name("floodInsurance"),
                                   schema.flag_literal("floodInsurance",
                                                       insurance == "insured")))
    return api.and_filters(*parts)


def nfip_state_filter(schema, state):
    return "%s eq %s" % (schema.name("state"), api.quote_literal(state))


def declaration_filter(schema, state):
    return "%s eq %s" % (schema.name("state"), api.quote_literal(state))
