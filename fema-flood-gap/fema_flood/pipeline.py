"""Orchestration: fetch the three datasets and assemble one state's report."""

import datetime

from . import (analysis, api, catalog, datasets,
               declarations as decl_mod, states)


class StateReport:
    """Everything the renderers need, in one plain object."""

    def __init__(self, state, options):
        self.state = state
        self.state_name = states.name(state)
        self.options = options
        self.generated = datetime.datetime.now(datetime.timezone.utc).replace(
            microsecond=0).isoformat()
        self.declarations = {}
        self.ihp = None
        self.nfip = None
        self.context = {}
        self.vintage = {}
        self.schema_notes = {}
        self.warnings = []

    # ------------------------------------------------------------- derived math

    def cohort_households(self):
        return self.ihp.statewide.households if self.ihp else 0

    def nfip_mean(self, paid_only=True):
        if not self.nfip:
            return None
        return self.nfip.paid.mean_positive if paid_only else self.nfip.paid.mean

    def ihp_mean(self, paid_only=False):
        if not self.ihp:
            return None
        acc = self.ihp.statewide.ihp
        return acc.mean_positive if paid_only else acc.mean

    def gap_per_household(self, paid_only=False):
        """NFIP payout minus IHP award, on matching denominators.

        ``paid_only`` compares a paid NFIP claim against a funded IHP award --
        i.e. what each program delivers when it delivers. The default compares
        against every household in the cohort, which is what the state actually
        experienced.
        """
        nfip = self.nfip_mean(paid_only=True)
        ihp = self.ihp_mean(paid_only=paid_only)
        if nfip is None or ihp is None:
            return None
        return nfip - ihp

    def aggregate_gap(self):
        gap = self.gap_per_household()
        if gap is None:
            return None
        return gap * self.cohort_households()

    def disaster_rows(self, sort="ihp_total", limit=None):
        """Per-disaster rows joined to declaration metadata and matched NFIP stats."""
        rows = []
        for bucket in self.ihp.disasters_sorted(sort):
            declaration = self.declarations.get(bucket.disaster_number)
            matched = (self.nfip.by_disaster.get(bucket.disaster_number)
                       if self.nfip else None)
            rows.append({
                "disaster": bucket.disaster_number,
                "title": (declaration.title if declaration else None) or "(no declaration record)",
                "incident_type": declaration.incident_type if declaration else None,
                "year": declaration.year if declaration else None,
                "households": bucket.households,
                "ihp_total": bucket.ihp.total,
                "ihp_mean": bucket.ihp.mean,
                "ihp_mean_paid": bucket.ihp.mean_positive,
                "ihp_paid_households": bucket.ihp.n_positive,
                "ha_total": bucket.ha.total,
                "ha_mean": bucket.ha.mean,
                "ona_total": bucket.ona.total,
                "ona_mean": bucket.ona.mean,
                "nfip_claims": matched.n if matched else 0,
                "nfip_paid_claims": matched.n_positive if matched else 0,
                "nfip_mean_paid": matched.mean_positive if matched else None,
                "nfip_total": matched.total if matched else None,
                "gap_per_household": (
                    matched.mean_positive - bucket.ihp.mean
                    if matched and matched.mean_positive is not None
                    and bucket.ihp.mean is not None else None),
            })
        if limit:
            rows = rows[:limit]
        return rows

    def to_dict(self):
        return {
            "state": self.state,
            "state_name": self.state_name,
            "generated_utc": self.generated,
            "parameters": self.options.to_dict(),
            "data_vintage": self.vintage,
            "schema_bindings": self.schema_notes,
            "cohort_definition": self.options.cohort.describe(),
            "ihp": {
                "statewide": self.ihp.statewide.to_dict() if self.ihp else None,
                "records_examined": self.ihp.records_seen if self.ihp else 0,
                "records_rejected": self.ihp.rejections.to_dict() if self.ihp else {},
                "by_disaster": [b.to_dict() for b in self.ihp.disasters_sorted()] if self.ihp else [],
            },
            "nfip": self.nfip.to_dict() if self.nfip else None,
            "context": self.context,
            "comparison": {
                "cohort_households": self.cohort_households(),
                "mean_ihp_per_household": _r(self.ihp_mean()),
                "mean_ihp_per_funded_household": _r(self.ihp_mean(paid_only=True)),
                "mean_nfip_per_paid_claim": _r(self.nfip_mean()),
                "gap_per_household": _r(self.gap_per_household()),
                "gap_per_funded_household": _r(self.gap_per_household(paid_only=True)),
                "aggregate_gap": _r(self.aggregate_gap()),
            },
            "disasters": [
                {k: (_r(v) if isinstance(v, float) else v) for k, v in row.items()}
                for row in self.disaster_rows()
            ],
            "warnings": self.warnings,
        }


def _r(value, digits=2):
    return None if value is None else round(value, digits)


class RunOptions:
    """Every knob the CLI exposes, in one place."""

    def __init__(self, state, cohort, nfip, deflator, min_year=None, max_year=None,
                 incident_types=None, flood_declarations_only=False, disasters=None,
                 match_buffer_days=3, ihp_version=None, nfip_version=None,
                 declarations_version=None, ihp_dataset=None, nfip_dataset=None,
                 declarations_dataset=None, skip_nfip=False, skip_context=False,
                 sort="ihp_total"):
        self.state = state
        self.cohort = cohort
        self.nfip = nfip
        self.deflator = deflator
        self.min_year = min_year
        self.max_year = max_year
        self.incident_types = incident_types
        self.flood_declarations_only = flood_declarations_only
        self.disasters = disasters
        self.match_buffer_days = match_buffer_days
        # ``None`` means "ask the OpenFEMA catalog"; resolved in build().
        self.ihp_version = ihp_version
        self.nfip_version = nfip_version
        self.declarations_version = declarations_version
        self.ihp_dataset = ihp_dataset or datasets.IHP_DATASET
        self.nfip_dataset = nfip_dataset or datasets.NFIP_DATASET
        self.declarations_dataset = declarations_dataset or datasets.DECLARATIONS_DATASET
        self.skip_nfip = skip_nfip
        self.skip_context = skip_context
        self.sort = sort

    def to_dict(self):
        return {
            "state": self.state,
            "cohort": self.cohort.describe(),
            "nfip_claim_filter": self.nfip.describe(),
            "dollars": self.deflator.label(),
            "min_year": self.min_year,
            "max_year": self.max_year,
            "incident_types": self.incident_types,
            "flood_declarations_only": self.flood_declarations_only,
            "disasters": sorted(self.disasters) if self.disasters else None,
            "nfip_event_match_buffer_days": self.match_buffer_days,
            "datasets": {
                "ihp": "%s v%s" % (self.ihp_dataset, self.ihp_version),
                "nfip": "%s v%s" % (self.nfip_dataset, self.nfip_version),
                "declarations": "%s v%s" % (self.declarations_dataset,
                                            self.declarations_version),
            },
        }


def build(client, options):
    """Run the full pipeline and return a populated :class:`StateReport`."""
    report = StateReport(options.state, options)
    progress = client.progress

    _resolve_versions(client, options, report)

    # ---- declarations ------------------------------------------------------
    progress("Resolving declaration schema...")
    decl_schema = datasets.declaration_schema(
        client, options.declarations_version, options.declarations_dataset)
    report.schema_notes["declarations"] = dict(decl_schema.bindings)
    progress("Fetching disaster declarations for %s..." % options.state)
    decl_records = client.records(
        options.declarations_dataset, options.declarations_version,
        select=datasets.selected_fields(decl_schema),
        filter=datasets.declaration_filter(decl_schema, options.state),
        label="declarations")
    all_declarations = decl_mod.collapse(decl_records, decl_schema)
    report.declarations = decl_mod.select(
        all_declarations, options.min_year, options.max_year,
        options.incident_types, options.disasters, options.flood_declarations_only)
    progress("  %d declarations in scope (of %d for the state)"
             % (len(report.declarations), len(all_declarations)))

    restrict = (options.min_year or options.max_year or options.incident_types
                or options.disasters or options.flood_declarations_only)
    allowed = set(report.declarations) if restrict else None

    # ---- IHP registrations -------------------------------------------------
    progress("Resolving IHP schema...")
    ihp_schema = datasets.ihp_schema(client, options.ihp_version, options.ihp_dataset)
    report.schema_notes["ihp"] = dict(ihp_schema.bindings)
    cohort_filter = datasets.ihp_cohort_filter(
        ihp_schema, options.state,
        owner_only=options.cohort.owner_only,
        flood_damage=options.cohort.flood_basis == "damage",
        insurance=None if options.cohort.unknown_insurance == "uninsured"
        else "uninsured")

    expected = None
    try:
        expected = client.count(options.ihp_dataset, options.ihp_version, cohort_filter)
        progress("  %s registrations match the cohort filter" % f"{expected:,}")
    except api.HttpError as exc:
        # Only a complaint about the filter itself is worth recovering from by
        # widening the query. Any other 400 -- a malformed parameter, say --
        # would fail identically on the retry, and swallowing it here would
        # report the wrong cause.
        if exc.status != 400 or not api.looks_like_filter_rejection(exc):
            raise
        report.warnings.append(
            "OpenFEMA rejected the compound cohort filter; fell back to a "
            "state-only query and applied the cohort locally.")
        cohort_filter = datasets.ihp_state_filter(ihp_schema, options.state)
        try:
            expected = client.count(options.ihp_dataset, options.ihp_version,
                                    cohort_filter)
        except api.HttpError as retry_error:
            raise api.OpenFemaError(
                "the cohort query failed (%s) and so did the widened retry (%s)"
                % (exc, retry_error))

    progress("Fetching IHP registrations...")
    ihp_records = client.records(
        options.ihp_dataset, options.ihp_version,
        select=datasets.selected_fields(ihp_schema),
        filter=cohort_filter, label="IHP registrations", expected=expected)
    disaster_years = {n: d.year for n, d in all_declarations.items()}
    report.ihp = analysis.aggregate_ihp(
        ihp_records, ihp_schema, options.cohort, options.deflator,
        state=options.state, disaster_years=disaster_years,
        allowed_disasters=allowed)
    report.vintage["ihp"] = client.metadata(
        options.ihp_dataset, options.ihp_version).get("lastRefresh")

    # ---- context denominators ---------------------------------------------
    if not options.skip_context:
        progress("Counting comparison cohorts...")
        report.context = _context_counts(client, ihp_schema, options)

    # ---- NFIP claims -------------------------------------------------------
    if not options.skip_nfip:
        progress("Resolving NFIP schema...")
        nfip_schema = datasets.nfip_schema(client, options.nfip_version,
                                           options.nfip_dataset)
        report.schema_notes["nfip"] = dict(nfip_schema.bindings)
        nfip_filter = datasets.nfip_state_filter(nfip_schema, options.state)
        try:
            expected = client.count(options.nfip_dataset, options.nfip_version, nfip_filter)
            progress("  %s NFIP claims on file for %s" % (f"{expected:,}", options.state))
        except api.HttpError:
            expected = None
        progress("Fetching NFIP claims...")
        nfip_records = client.records(
            options.nfip_dataset, options.nfip_version,
            select=datasets.selected_fields(nfip_schema),
            filter=nfip_filter, label="NFIP claims", expected=expected)
        report.nfip = analysis.aggregate_nfip(
            nfip_records, nfip_schema, options.nfip, options.deflator,
            state=options.state,
            event_windows=decl_mod.event_windows(report.declarations,
                                                 options.match_buffer_days),
            occupancy_codes=datasets.OWNER_OCCUPANCY_CODES)
        report.vintage["nfip"] = client.metadata(
            options.nfip_dataset, options.nfip_version).get("lastRefresh")

    _add_warnings(report, options)
    return report


def _resolve_versions(client, options, report):
    """Bind each dataset to a version published by OpenFEMA right now."""
    progress = client.progress
    progress("Checking the OpenFEMA dataset catalog...")
    wanted = [
        ("ihp_version", options.ihp_dataset),
        ("nfip_version", options.nfip_dataset),
        ("declarations_version", options.declarations_dataset),
    ]
    for attribute, name in wanted:
        if attribute == "nfip_version" and options.skip_nfip:
            continue
        requested = getattr(options, attribute)
        try:
            version, entry, note = catalog.resolve(
                client, name, requested, datasets.NAME_HINTS.get(name))
        except catalog.CatalogError as exc:
            if requested is not None:
                raise
            fallback = datasets.FALLBACK_VERSIONS.get(name)
            if fallback is None:
                raise
            report.warnings.append("%s Falling back to v%d." % (exc, fallback))
            setattr(options, attribute, fallback)
            continue
        setattr(options, attribute, version)
        report.vintage.setdefault(
            "%s_dataset" % attribute.split("_")[0], "%s v%s%s"
            % (name, version, (" (%s)" % catalog.describe(entry)) if entry else ""))
        if note:
            report.warnings.append(note)
        progress("  %s -> v%s%s" % (name, version,
                                    " (%s)" % catalog.describe(entry) if entry else ""))


def _context_counts(client, ihp_schema, options):
    """Cheap ``$inlinecount`` queries that put the cohort in proportion.

    These are statewide across every declaration on file -- they are not
    narrowed by the year/incident filters, because OpenFEMA cannot count over an
    arbitrary disaster-number set in one request. The report labels them so.
    """
    counts = {}
    queries = {
        "all_registrations": datasets.ihp_state_filter(ihp_schema, options.state),
        "owner_registrations": datasets.ihp_cohort_filter(
            ihp_schema, options.state, owner_only=True, flood_damage=False),
        "owner_flood_damaged": datasets.ihp_cohort_filter(
            ihp_schema, options.state, owner_only=True, flood_damage=True),
        "owner_flood_damaged_uninsured": datasets.ihp_cohort_filter(
            ihp_schema, options.state, owner_only=True, flood_damage=True,
            insurance="uninsured"),
        "owner_flood_damaged_insured": datasets.ihp_cohort_filter(
            ihp_schema, options.state, owner_only=True, flood_damage=True,
            insurance="insured"),
    }
    for key, query in queries.items():
        try:
            counts[key] = client.count(options.ihp_dataset, options.ihp_version, query)
        except api.OpenFemaError:
            counts[key] = None

    total = counts.get("owner_flood_damaged")
    insured = counts.get("owner_flood_damaged_insured")
    uninsured = counts.get("owner_flood_damaged_uninsured")
    if None not in (total, insured, uninsured):
        # Whatever is left over has no flood-insurance value recorded at all.
        counts["owner_flood_damaged_insurance_unknown"] = total - insured - uninsured
    if total:
        counts["uninsured_share"] = round(uninsured / total, 4)
    counts["_note"] = ("statewide across all declarations on file; not narrowed "
                       "by the year, incident-type, or disaster filters")
    return counts


def _add_warnings(report, options):
    if report.ihp and report.ihp.statewide.households == 0:
        report.warnings.append(
            "No registrations matched the cohort. Check the state code and, if "
            "you narrowed by year or incident type, widen the filters.")
    if report.nfip and report.nfip.claims_multi_matched:
        report.warnings.append(
            "%s NFIP claims fell inside more than one declaration window and are "
            "counted under each; per-event claim counts therefore sum to more "
            "than the statewide total."
            % f"{report.nfip.claims_multi_matched:,}")
    orphans = [b for b in (report.ihp.by_disaster.values() if report.ihp else [])
               if not b.years]
    if orphans:
        report.warnings.append(
            "%d disaster number(s) in the registration data have no %s "
            "declaration record -- most often an evacuee whose damaged property "
            "sits in this state under another state's declaration. Those rows "
            "carry no year, so they cannot be matched to NFIP claims%s."
            % (len(orphans), report.state,
               " and their dollars stay nominal" if options.deflator.active else ""))
    if options.deflator.active and options.deflator.missing_years:
        report.warnings.append(
            "No CPI value for %s; amounts from those years are left nominal."
            % ", ".join(str(y) for y in sorted(options.deflator.missing_years)))
    if options.deflator.provisional:
        report.warnings.append(
            "The %d CPI value is a provisional estimate, not a final BLS annual "
            "average." % options.deflator.base_year)
    if report.ihp and report.ihp.rejections.wrong_state:
        report.warnings.append(
            "%d records came back for a different state and were dropped."
            % report.ihp.rejections.wrong_state)
