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
    "homeOwnersInsurance": "integer", "ihpAmount": "number", "haAmount": "number", "onaAmount": "number",
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

# Public Assistance carries no `id` column -- the client must discover that
# and fall back to offset paging rather than assuming one exists.
PA_FIELDS = {
    "disasterNumber": "smallint", "stateAbbreviation": "text",
    "applicantId": "text", "applicationTitle": "text", "damageCategoryCode": "text",
    "projectAmount": "decimal(12,2)", "federalShareObligated": "decimal(12,2)",
    "totalObligated": "decimal(12,2)", "county": "text", "pwNumber": "integer",
}

PA_APPLICANT_FIELDS = {
    "applicantId": "text", "applicantName": "text", "stateCode": "text",
}

FIELD_TYPES = {
    "PublicAssistanceFundedProjectsDetails": PA_FIELDS,
    "PublicAssistanceApplicants": PA_APPLICANT_FIELDS,
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
    _declaration("d05", 4528, "COVID-19 Pandemic", "Biological",
                 "2020-01-20", "2023-05-11", "Statewide"),
    _declaration("d03", 1603, "Hurricane Katrina", "Hurricane",
                 "2005-08-29", "2005-10-01", "Orleans"),
    _declaration("d04", 1603, "Hurricane Katrina", "Hurricane",
                 "2005-08-29", "2005-09-20", "Jefferson"),
]


# OpenFEMA encodes tenure as single letters, not words -- assuming "Owner"
# yields an empty cohort that reads exactly like a state with no owners.
OWNER, RENTER = "O", "R"


def _ihp(row_id, disaster, own_rent, flood, insurance, ihp, ha, ona,
         state="LA", water=12.0, rpfvl=0.0, ppfvl=0.0, primary=1,
         home_insurance=0):
    return {
        "id": row_id, "disasterNumber": disaster,
        "damagedStateAbbreviation": state, "ownRent": own_rent,
        "floodDamage": flood, "floodInsurance": insurance,
        "homeOwnersInsurance": home_insurance,
        "ihpAmount": ihp, "haAmount": ha, "onaAmount": ona,
        "ihpEligible": 1 if ihp else 0, "primaryResidence": primary,
        "waterLevel": water, "rpfvl": rpfvl, "ppfvl": ppfvl, "county": "Test",
    }


# Flood cohort (owner, flood damage, no flood insurance): r01 r02 r07 r08 r09
# -- 5 households, $19,000 of IHP ($15,000 HA + $4,000 ONA), 4 of them funded.
#
# Uninsured-homeowner cohort (owner, no homeowners insurance): r01 r03 r05 r07
# r09 -- 5 households, $41,900 of IHP; $41,000 of it on flood-damaged homes a
# homeowners policy would not have covered, $900 on other perils it would.
IHP_RECORDS = [
    _ihp("r01", 4277, OWNER, 1, 0, 10000.0, 8000.0, 2000.0, rpfvl=30000.0, ppfvl=5000.0),
    _ihp("r02", 4277, OWNER, 1, 0, 0.0, 0.0, 0.0, rpfvl=2000.0, home_insurance=1),
    _ihp("r03", 4277, OWNER, 1, 1, 25000.0, 25000.0, 0.0),          # insured
    _ihp("r04", 4277, RENTER, 1, 0, 4000.0, 3000.0, 1000.0),        # renter
    _ihp("r05", 4277, OWNER, 0, 0, 900.0, 0.0, 900.0, water=0.0),   # no flood damage
    _ihp("r06", 4277, OWNER, 1, None, 7000.0, 7000.0, 0.0,          # unknown insurance
         home_insurance=None),
    _ihp("r07", 1603, OWNER, 1, 0, 5000.0, 5000.0, 0.0),
    _ihp("r08", 1603, OWNER, 1, 0, 3000.0, 1000.0, 2000.0, home_insurance=1),
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
    _catalog("PublicAssistanceFundedProjectsDetails", 1, 780_000),
    _catalog("PublicAssistanceApplicants", 1, 120_000),
]

def _pa(row_id, disaster, applicant_id, title, category, total, federal,
        state="LA", county="Statewide"):
    return {
        "disasterNumber": disaster, "stateAbbreviation": state,
        "applicantId": applicant_id, "applicationTitle": title,
        "damageCategoryCode": category, "projectAmount": total,
        "federalShareObligated": federal, "totalObligated": total,
        "county": county, "pwNumber": int(row_id[1:]),
    }


# Applicant IDs lead with the county code; 000 is a statewide / state-agency
# applicant. One state agency (Dept of Health) carries a county code, so the
# name path is exercised too. One local applicant (the parish) must be
# excluded even though its title is squarely sheltering.
PA_APPLICANTS = [
    {"applicantId": "000-U0001-00",
     "applicantName": "State of Louisiana - GOHSEP", "stateCode": "LA"},
    {"applicantId": "000-U0002-00",
     "applicantName": "Louisiana Department of Children and Family Services",
     "stateCode": "LA"},
    {"applicantId": "033-U0003-00",
     "applicantName": "East Baton Rouge Parish", "stateCode": "LA"},
    {"applicantId": "000-U0004-00",
     "applicantName": "Louisiana GOHSEP", "stateCode": "LA"},
    {"applicantId": "045-U0009-00",
     "applicantName": "Louisiana Department of Health", "stateCode": "LA"},
]

# Keyword floor (state applicants): p1 p2 p6 p7 -> $6,500,000 total,
# $5,685,000 federal, $815,000 non-federal. All category B with a state
# applicant adds p5 -> $6,800,000 / $5,910,000 / $890,000.
PA_PROJECTS = [
    _pa("p1", 4277, "000-U0001-00", "Transitional Sheltering Assistance (TSA)",
        "B", 1_000_000.0, 750_000.0),
    _pa("p2", 4277, "000-U0002-00", "Emergency Shelter Operations - Mass Care",
        "B", 400_000.0, 360_000.0),
    _pa("p3", 4277, "033-U0003-00", "Shelter Operations", "B",
        200_000.0, 150_000.0, county="East Baton Rouge"),        # local applicant
    _pa("p4", 4277, "000-U0001-00", "Debris Removal - State Highways", "A",
        900_000.0, 675_000.0),                                     # wrong category
    _pa("p5", 4277, "000-U0001-00", "EOC Operations and Staffing", "B",
        300_000.0, 225_000.0),                                     # B, not sheltering
    _pa("p6", 1603, "000-U0004-00", "STEP - Sheltering and Temporary Essential Power",
        "B", 5_000_000.0, 4_500_000.0),
    _pa("p7", 4277, "045-U0009-00", "Non-congregate sheltering - medical needs",
        "B", 100_000.0, 75_000.0),
    _pa("p8", 4277, "000-U0001-00", "Bridge approach steps and railing repair",
        "B", 50_000.0, 37_500.0),                                  # "steps" != STEP
    # COVID: a state applicant, category B, and a title that matches on
    # "non-congregate sheltering" -- but not a housing cost, so excluded.
    _pa("p9", 4528, "000-U0001-00",
        "Non-congregate sheltering - COVID-19 medical staffing", "B",
        90_000_000.0, 90_000_000.0),
]

TABLES = {
    "DataSets": CATALOG,
    "PublicAssistanceFundedProjectsDetails": PA_PROJECTS,
    "PublicAssistanceApplicants": PA_APPLICANTS,
    "DisasterDeclarationsSummaries": DECLARATIONS,
    "IndividualsAndHouseholdsProgramValidRegistrations": IHP_RECORDS,
    "FimaNfipClaims": NFIP_RECORDS,
}
