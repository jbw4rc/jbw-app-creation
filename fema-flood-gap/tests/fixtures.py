"""Synthetic OpenFEMA tables with hand-computable answers."""

DECLARATION_FIELDS = {
    "id": "text", "disasterNumber": "integer", "state": "text",
    "declarationTitle": "text", "incidentType": "text",
    "incidentBeginDate": "date", "incidentEndDate": "date",
    "declarationDate": "date", "iaProgramDeclared": "integer",
    "designatedArea": "text",
}

IHP_FIELDS = {
    "id": "text", "disasterNumber": "integer", "damagedStateAbbreviation": "text",
    "ownRent": "text", "floodDamage": "integer", "floodInsurance": "integer",
    "ihpAmount": "number", "haAmount": "number", "onaAmount": "number",
    "ihpEligible": "integer", "primaryResidence": "integer", "waterLevel": "number",
    "rpfvl": "number", "ppfvl": "number", "county": "text",
}

NFIP_FIELDS = {
    "id": "text", "state": "text", "dateOfLoss": "date", "yearOfLoss": "integer",
    "amountPaidOnBuildingClaim": "number", "amountPaidOnContentsClaim": "number",
    "amountPaidOnIncreasedCostOfComplianceClaim": "number",
    "occupancyType": "integer", "primaryResidence": "integer",
    "buildingDamageAmount": "number", "totalBuildingInsuranceCoverage": "number",
    "totalContentsInsuranceCoverage": "number", "causeOfDamage": "text",
    "ratedFloodZone": "text", "countyCode": "text",
}

FIELD_TYPES = {
    "DisasterDeclarationsSummaries": DECLARATION_FIELDS,
    "IndividualsAndHouseholdsProgramValidRegistrations": IHP_FIELDS,
    "FimaNfipClaims": NFIP_FIELDS,
}


def _declaration(row_id, number, title, incident, begin, end, area):
    return {
        "id": row_id, "disasterNumber": number, "state": "LA",
        "declarationTitle": title, "incidentType": incident,
        "incidentBeginDate": begin + "T00:00:00.000Z",
        "incidentEndDate": end + "T00:00:00.000Z",
        "declarationDate": begin + "T00:00:00.000Z",
        "iaProgramDeclared": 1, "designatedArea": area,
    }


# Two declarations, each spread over several county rows the way OpenFEMA
# publishes them, so `collapse` has something real to fold.
DECLARATIONS = [
    _declaration("d01", 4277, "Severe Storms and Flooding", "Flood",
                 "2016-08-11", "2016-08-31", "East Baton Rouge"),
    _declaration("d02", 4277, "Severe Storms and Flooding", "Flood",
                 "2016-08-12", "2016-08-31", "Livingston"),
    _declaration("d03", 1603, "Hurricane Katrina", "Hurricane",
                 "2005-08-29", "2005-10-01", "Orleans"),
    _declaration("d04", 1603, "Hurricane Katrina", "Hurricane",
                 "2005-08-29", "2005-09-20", "Jefferson"),
]


# OpenFEMA encodes tenure as single letters, not words -- assuming "Owner"
# yields an empty cohort that reads exactly like a state with no owners.
OWNER, RENTER = "O", "R"


def _ihp(row_id, disaster, own_rent, flood, insurance, ihp, ha, ona,
         state="LA", water=12.0, rpfvl=0.0, ppfvl=0.0, primary=1):
    return {
        "id": row_id, "disasterNumber": disaster,
        "damagedStateAbbreviation": state, "ownRent": own_rent,
        "floodDamage": flood, "floodInsurance": insurance,
        "ihpAmount": ihp, "haAmount": ha, "onaAmount": ona,
        "ihpEligible": 1 if ihp else 0, "primaryResidence": primary,
        "waterLevel": water, "rpfvl": rpfvl, "ppfvl": ppfvl, "county": "Test",
    }


# Cohort members are r01, r02, r07, r08, r09: 5 households, $19,000 of IHP
# ($15,000 HA + $4,000 ONA), 4 of them funded.
IHP_RECORDS = [
    _ihp("r01", 4277, OWNER, 1, 0, 10000.0, 8000.0, 2000.0, rpfvl=30000.0, ppfvl=5000.0),
    _ihp("r02", 4277, OWNER, 1, 0, 0.0, 0.0, 0.0, rpfvl=2000.0),
    _ihp("r03", 4277, OWNER, 1, 1, 25000.0, 25000.0, 0.0),          # insured
    _ihp("r04", 4277, RENTER, 1, 0, 4000.0, 3000.0, 1000.0),        # renter
    _ihp("r05", 4277, OWNER, 0, 0, 900.0, 0.0, 900.0, water=0.0),   # no flood damage
    _ihp("r06", 4277, OWNER, 1, None, 7000.0, 7000.0, 0.0),         # unknown insurance
    _ihp("r07", 1603, OWNER, 1, 0, 5000.0, 5000.0, 0.0),
    _ihp("r08", 1603, OWNER, 1, 0, 3000.0, 1000.0, 2000.0),
    _ihp("r09", 9999, OWNER, 1, 0, 1000.0, 1000.0, 0.0),            # no declaration row
    _ihp("r10", 4277, OWNER, 1, 0, 8000.0, 8000.0, 0.0, state="TX"),
]


def _claim(row_id, date, building, contents, icc=0.0, occupancy=1,
           state="LA", primary=1):
    return {
        "id": row_id, "state": state, "dateOfLoss": date + "T00:00:00.000Z",
        "yearOfLoss": int(date[:4]),
        "amountPaidOnBuildingClaim": building,
        "amountPaidOnContentsClaim": contents,
        "amountPaidOnIncreasedCostOfComplianceClaim": icc,
        "occupancyType": occupancy, "primaryResidence": primary,
        "buildingDamageAmount": building, "totalBuildingInsuranceCoverage": 250000.0,
        "totalContentsInsuranceCoverage": 100000.0, "causeOfDamage": "0",
        "ratedFloodZone": "AE", "countyCode": "22033",
    }


# Seven LA claims totalling $280,000; six closed with a payment.
# c01/c02/c07 fall inside DR-4277, c04/c05 inside DR-1603, c03 three days past
# the DR-4277 window, c06 in an undeclared year.
NFIP_RECORDS = [
    _claim("c01", "2016-08-13", 40000.0, 10000.0),
    _claim("c02", "2016-08-20", 20000.0, 0.0),
    _claim("c03", "2016-09-05", 30000.0, 0.0),
    _claim("c04", "2005-08-30", 60000.0, 15000.0),
    _claim("c05", "2005-09-15", 0.0, 0.0),
    _claim("c06", "1998-06-01", 5000.0, 0.0),
    _claim("c07", "2016-08-14", 100000.0, 0.0, occupancy=4),   # non-residential
    _claim("c08", "2016-08-15", 70000.0, 0.0, state="TX"),
]

def _catalog(name, version, records, deprecated=None, title=None):
    return {"id": "%s-v%d" % (name, version), "name": name, "version": version,
            "title": title or name, "recordCount": records,
            "lastRefresh": "2026-01-15T00:00:00.000Z", "depDate": deprecated}


# The IHP table is published at v2 with v1 retired -- the shape that makes a
# hard-coded version number 404.
CATALOG = [
    _catalog("IndividualsAndHouseholdsProgramValidRegistrations", 2, 26_000_000),
    _catalog("IndividualsAndHouseholdsProgramValidRegistrations", 1, 24_000_000,
             deprecated="2025-06-30T00:00:00.000Z"),
    _catalog("FimaNfipClaims", 2, 2_600_000),
    _catalog("DisasterDeclarationsSummaries", 2, 68_000),
    _catalog("IndividualAssistanceHousingRegistrantsLargeDisasters", 1, 5_000_000),
]

TABLES = {
    "DataSets": CATALOG,
    "DisasterDeclarationsSummaries": DECLARATIONS,
    "IndividualsAndHouseholdsProgramValidRegistrations": IHP_RECORDS,
    "FimaNfipClaims": NFIP_RECORDS,
}
