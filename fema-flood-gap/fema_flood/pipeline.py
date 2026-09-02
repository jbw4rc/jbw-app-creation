"""Orchestration: fetch the three datasets and assemble one state's report."""

import datetime

from . import (analysis, api, catalog, costshare, datasets,
               declarations as decl_mod, pa as pa_mod, probe, states)


class StateReport:
    """Everything the renderers need, in one plain object."""

    def __init__(self, state, options):
        self.state = state
        self.state_name = states.name(state)
        self.options = options
        self.generated = datetime.datetime.now(datetime.timezone.utc).replace(
            microsecond=0).isoformat()
        self.declarations = {}
        self.all_declarations = {}
        self.ihp = None
        self.home_insurance = None
        self.pa = None
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

    def state_cost_share(self):
        """The state's own liability on this cohort's ONA, under current law.

        Scoped to the cohort, not the state's whole IHP caseload: it is the
        non-federal share of ONA paid to owner-occupants who flooded without
        flood insurance, which is the population this report is about.
        """
        if not self.ihp:
            return None
        stats = self.ihp.statewide
        return self.options.cost_share.state_cost(stats.ha.total, stats.ona.total)

    def non_flood_state_share(self):
        """The state's current-law share on the non-flood, no-homeowners pot.

        Disjoint from the flood cohort (flood damage is 0 here, 1 there), so
        the two shares can be added without counting a household twice.
        """
        if not self.home_insurance:
            return None
        other = self.home_insurance.other_peril.statewide
        return self.options.cost_share.state_cost(other.ha.total, other.ona.total)

    def combined_state_share(self):
        """Current-law state share across both disjoint pots."""
        flood = self.state_cost_share()
        other = self.non_flood_state_share()
        if flood is None:
            return other
        return flood + (other or 0.0)

    def non_flood_cost_share_table(self):
        if not self.home_insurance:
            return []
        other = self.home_insurance.other_peril.statewide
        return self.options.cost_share.table(other.ha.total, other.ona.total)

    def cost_share_table(self):
        if not self.ihp:
            return []
        stats = self.ihp.statewide
        return self.options.cost_share.table(stats.ha.total, stats.ona.total)

    def pa_rows(self):
        """Per-declaration PA sheltering totals, both tiers, for the page."""
        if not self.pa:
            return []
        rows = []
        for number_, bucket in self.pa.by_disaster.items():
            declaration = self.declarations.get(number_)
            rows.append({
                "disaster": number_,
                "title": (declaration.title if declaration else None)
                         or "(no declaration record)",
                "year": declaration.year if declaration else None,
                "matched_projects": bucket.matched.projects,
                "matched_total": bucket.matched.total,
                "matched_federal": bucket.matched.federal,
                "matched_non_federal": bucket.matched.non_federal,
                "category_projects": bucket.category.projects,
                "category_total": bucket.category.total,
                "category_federal": bucket.category.federal,
                "category_non_federal": bucket.category.non_federal,
            })
        rows.sort(key=lambda r: -r["matched_total"])
        return rows

    def home_insurance_rows(self, limit=None):
        """Per-declaration rows for the uninsured-homeowner cohort."""
        if not self.home_insurance:
            return []
        share = self.options.cost_share
        rows = []
        result = self.home_insurance
        for number, bucket in result.all.by_disaster.items():
            declaration = self.declarations.get(number)
            flood = result.flood_damaged.by_disaster.get(number)
            other = result.other_peril.by_disaster.get(number)
            rows.append({
                "disaster": number,
                "title": (declaration.title if declaration else None)
                         or "(no declaration record)",
                "year": declaration.year if declaration else None,
                "households": bucket.households,
                "ihp_total": bucket.ihp.total,
                "ihp_mean": bucket.ihp.mean,
                "ha_total": bucket.ha.total,
                "ona_total": bucket.ona.total,
                "ona_state_share": share.state_cost(bucket.ha.total, bucket.ona.total),
                "flood_households": flood.households if flood else 0,
                "flood_ihp_total": flood.ihp.total if flood else 0.0,
                "flood_ha_total": flood.ha.total if flood else 0.0,
                "flood_ona_total": flood.ona.total if flood else 0.0,
                "flood_state_share": share.state_cost(
                    flood.ha.total, flood.ona.total) if flood else 0.0,
                "other_households": other.households if other else 0,
                "other_paid_households": other.ihp.n_positive if other else 0,
                "other_ihp_total": other.ihp.total if other else 0.0,
                "other_ha_total": other.ha.total if other else 0.0,
                "other_ona_total": other.ona.total if other else 0.0,
                "other_state_share": share.state_cost(
                    other.ha.total, other.ona.total) if other else 0.0,
            })
        rows.sort(key=lambda r: -r["ihp_total"])
        return rows[:limit] if limit else rows

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
                "ona_state_share": self.options.cost_share.state_cost(
                    bucket.ha.total, bucket.ona.total),
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
            "uninsured_homeowners": (dict(
                self.home_insurance.to_dict(),
                other_peril_state_share=_r(self.non_flood_state_share()),
                other_peril_scenarios=self.non_flood_cost_share_table(),
                combined_state_share_both_pots=_r(self.combined_state_share()),
            ) if self.home_insurance else None),
            "public_assistance_sheltering": self.pa.to_dict() if self.pa else None,
            "state_cost_share": {
                "scope": "the non-federal share of ONA paid to this cohort, "
                         "not the state's whole IHP caseload",
                "basis": costshare.CITATION,
                "today": _r(self.state_cost_share()),
                "scenarios": self.cost_share_table(),
            },
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

    def __init__(self, state, cohort, nfip, deflator, cost_share=None,
                 home_insurance=None, review_note=None, pa=None,
                 min_year=None, max_year=None,
                 incident_types=None, flood_declarations_only=False, disasters=None,
                 match_buffer_days=3, ihp_version=None, nfip_version=None,
                 declarations_version=None, ihp_dataset=None, nfip_dataset=None,
                 declarations_dataset=None, skip_nfip=False, skip_context=False,
                 sort="ihp_total"):
        self.state = state
        self.cohort = cohort
        self.nfip = nfip
        self.deflator = deflator
        self.cost_share = cost_share or costshare.CostShare()
        self.home_insurance = home_insurance or analysis.HomeInsuranceOptions()
        self.review_note = review_note
        self.pa = pa or pa_mod.PaOptions()
        self.pa_version = None
        self.pa_applicants_version = None
        self.min_year = min_year
        self.max_year = max_year
        # A year range applies to both sides unless the caller narrowed the
        # claims separately. Leaving this to the CLI meant a library caller
        # got a truncated aid history compared against a full claim history,
        # which silently distorts the gap.
        if self.nfip.min_year is None:
            self.nfip.min_year = min_year
        if self.nfip.max_year is None:
            self.nfip.max_year = max_year
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
            "cost_share": self.cost_share.describe(),
            "home_insurance_cohort": (self.home_insurance.describe()
                                      if self.home_insurance.enabled else None),
            "public_assistance": self.pa.describe() if self.pa.enabled else None,
            "review_note": self.review_note,
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
        label="declarations", key=decl_schema.key_field())
    all_declarations = decl_mod.collapse(decl_records, decl_schema)
    report.all_declarations = all_declarations
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
    progress("Sampling how %s encodes tenure and the flood flags..." % options.state)
    vocabulary = probe.sample(
        client, options.ihp_dataset, options.ihp_version,
        [ihp_schema.name("ownRent"), ihp_schema.name("floodDamage"),
         ihp_schema.name("floodInsurance"),
         ihp_schema.name("homeOwnersInsurance")],
        filter=datasets.ihp_state_filter(ihp_schema, options.state))
    vocabulary = {logical: vocabulary.get(ihp_schema.name(logical), None)
                  for logical in ("ownRent", "floodDamage", "floodInsurance",
                                  "homeOwnersInsurance")}
    for logical, counter in vocabulary.items():
        progress("  %s: %s" % (logical, probe.describe(counter)))
        report.schema_notes.setdefault("ihp_values", {})[logical] = {
            str(value): count for value, count in (counter or {}).items()}

    def build_cohort_filter():
        return datasets.ihp_cohort_filter(
            ihp_schema, options.state,
            owner_only=options.cohort.owner_only,
            flood_damage=options.cohort.flood_basis == "damage",
            insurance=None if options.cohort.unknown_insurance == "uninsured"
            else "uninsured",
            vocabulary=vocabulary)

    cohort_filter = build_cohort_filter()

    expected = None
    try:
        expected = client.count(options.ihp_dataset, options.ihp_version, cohort_filter)
        progress("  %s registrations match the cohort filter" % f"{expected:,}")
        if expected == 0 and cohort_filter != datasets.ihp_state_filter(
                ihp_schema, options.state):
            # Zero is far more often a filter that does not speak the data's
            # vocabulary than a state where nobody flooded uninsured. Widen and
            # let the client-side predicates decide, rather than reporting an
            # empty cohort as a finding.
            progress("  cohort filter matched nothing; widening to the whole "
                     "state and filtering locally (slower)")
            report.warnings.append(
                "The server-side cohort filter matched no records, so the run "
                "widened to every %s registration and applied the cohort "
                "locally. Sampled values -- %s."
                % (options.state,
                   "; ".join("%s: %s" % (logical, probe.describe(counter))
                             for logical, counter in vocabulary.items())))
            cohort_filter = datasets.ihp_state_filter(ihp_schema, options.state)
            expected = client.count(options.ihp_dataset, options.ihp_version,
                                    cohort_filter)
    except api.OpenFemaError as exc:
        # Two very different failures land here. If OpenFEMA rejected the
        # *filter*, the query has to change and the run cannot proceed until it
        # does. Anything else only costs the progress estimate, which nothing
        # downstream depends on -- so it must not cost the whole report.
        rejected_filter = (isinstance(exc, api.HttpError) and exc.status == 400
                           and api.looks_like_filter_rejection(exc))
        if rejected_filter:
            report.warnings.append(
                "OpenFEMA rejected the compound cohort filter; fell back to a "
                "state-only query and applied the cohort locally.")
            cohort_filter = datasets.ihp_state_filter(ihp_schema, options.state)
            try:
                expected = client.count(options.ihp_dataset, options.ihp_version,
                                        cohort_filter)
            except api.OpenFemaError as retry_error:
                raise api.OpenFemaError(
                    "the cohort query failed (%s) and so did the widened retry (%s)"
                    % (exc, retry_error))
        else:
            progress("  could not pre-count the cohort (%s); continuing" % exc)
            report.warnings.append(
                "The cohort pre-count failed (%s), so progress output had no "
                "total. The figures themselves are unaffected." % exc)

    progress("Fetching IHP registrations...")
    ihp_records = client.records(
        options.ihp_dataset, options.ihp_version,
        select=datasets.selected_fields(ihp_schema),
        filter=cohort_filter, label="IHP registrations", expected=expected,
        key=ihp_schema.key_field())
    disaster_years = {n: d.year for n, d in all_declarations.items()}
    report.ihp = analysis.aggregate_ihp(
        ihp_records, ihp_schema, options.cohort, options.deflator,
        state=options.state, disaster_years=disaster_years,
        allowed_disasters=allowed)

    # ---- uninsured homeowners ---------------------------------------------
    if options.home_insurance.enabled:
        if not ihp_schema.name("homeOwnersInsurance"):
            report.warnings.append(
                "This dataset has no homeowners-insurance field, so the "
                "uninsured-homeowner cohort was skipped.")
        else:
            uninsured_filter = datasets.uninsured_owner_filter(
                ihp_schema, options.state,
                owner_only=options.home_insurance.owner_only,
                vocabulary=vocabulary,
                filter_insurance=(
                    options.home_insurance.unknown_insurance != "uninsured"))
            expected_ho = None
            try:
                expected_ho = client.count(options.ihp_dataset,
                                           options.ihp_version, uninsured_filter)
                progress("  %s registrations from owners with no homeowners "
                         "insurance" % f"{expected_ho:,}")
            except api.OpenFemaError as exc:
                # Same recovery as the flood cohort: only a complaint about the
                # filter is worth widening for, and the cohort is re-applied
                # locally either way.
                if (isinstance(exc, api.HttpError) and exc.status == 400
                        and api.looks_like_filter_rejection(exc)):
                    report.warnings.append(
                        "OpenFEMA rejected the uninsured-homeowner filter; fell "
                        "back to a state-only query and applied the cohort "
                        "locally.")
                    uninsured_filter = datasets.ihp_state_filter(
                        ihp_schema, options.state)
                else:
                    progress("  could not pre-count uninsured homeowners (%s)" % exc)
            progress("Fetching uninsured-homeowner registrations...")
            ho_records = client.records(
                options.ihp_dataset, options.ihp_version,
                select=datasets.selected_fields(ihp_schema),
                filter=uninsured_filter, label="uninsured homeowners",
                expected=expected_ho, key=ihp_schema.key_field())
            report.home_insurance = analysis.aggregate_home_insurance(
                ho_records, ihp_schema, options.home_insurance, options.deflator,
                state=options.state, disaster_years=disaster_years,
                allowed_disasters=allowed)

    # ---- context denominators ---------------------------------------------
    if not options.skip_context:
        progress("Counting comparison cohorts (each is a server-side scan of "
                 "the whole registration table; slow the first time)...")
        report.context = _context_counts(client, ihp_schema, options,
                                         vocabulary=vocabulary,
                                         known_cohort_count=expected)

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
            filter=nfip_filter, label="NFIP claims", expected=expected,
            key=nfip_schema.key_field())
        report.nfip = analysis.aggregate_nfip(
            nfip_records, nfip_schema, options.nfip, options.deflator,
            state=options.state,
            event_windows=decl_mod.event_windows(report.declarations,
                                                 options.match_buffer_days),
            occupancy_codes=datasets.OWNER_OCCUPANCY_CODES)

    # ---- Public Assistance sheltering, state applicants --------------------
    if options.pa.enabled:
        _pull_public_assistance(client, options, report, disaster_years, allowed)

    _add_warnings(report, options)
    return report


def _pull_public_assistance(client, options, report, disaster_years, allowed):
    """Sheltering and shelter-in-home PA projects with a state applicant.

    Failures here are reported and skipped rather than fatal: this block is
    context for the IHP figures, and a state's report should not die because
    a secondary dataset was unavailable.
    """
    progress = client.progress
    try:
        progress("Resolving Public Assistance schema...")
        pa_schema = datasets.pa_schema(client, options.pa_version)
        report.schema_notes["public_assistance"] = dict(pa_schema.bindings)
        state_filter = "%s eq %s" % (pa_schema.name("state"),
                                     api.quote_literal(options.state))

        names = {}
        try:
            applicant_schema = datasets.pa_applicant_schema(
                client, options.pa_applicants_version)
            applicant_filter = None
            if applicant_schema.name("state"):
                applicant_filter = "%s eq %s" % (applicant_schema.name("state"),
                                                 api.quote_literal(options.state))
            progress("Fetching Public Assistance applicants...")
            names = pa_mod.applicant_names(client.records(
                datasets.PA_APPLICANTS_DATASET, options.pa_applicants_version,
                select=datasets.selected_fields(applicant_schema),
                filter=applicant_filter, label="PA applicants",
                key=applicant_schema.key_field()), applicant_schema)
        except api.OpenFemaError as exc:
            report.warnings.append(
                "Could not read the PA applicants table (%s); state agencies were "
                "identified from applicant IDs alone." % exc)

        expected = None
        try:
            expected = client.count(datasets.PA_DATASET, options.pa_version, state_filter)
            progress("  %s Public Assistance projects on file for %s"
                     % (f"{expected:,}", options.state))
        except api.OpenFemaError:
            pass
        progress("Fetching Public Assistance projects...")
        records = client.records(
            datasets.PA_DATASET, options.pa_version,
            select=datasets.selected_fields(pa_schema),
            filter=state_filter, label="PA projects", expected=expected,
            key=pa_schema.key_field())
        report.pa = pa_mod.aggregate(
            records, pa_schema, options.pa, options.deflator, names=names,
            state=options.state, disaster_years=disaster_years,
            allowed_disasters=allowed,
            non_housing_disasters=decl_mod.non_housing(report.all_declarations))
        pa_result = report.pa
        progress("  %d sheltering projects matched (state applicants), %s obligated"
                 % (pa_result.matched.projects, f"{pa_result.matched.total:,.0f}"))
        if pa_result.matched.projects == 0:
            # An empty block is a result a reader will act on, so say which of
            # the three filters emptied it rather than showing a silent zero.
            report.warnings.append(
                "No Public Assistance sheltering projects matched. Of %s projects "
                "read for %s: %s were in category %s, %s had a state or "
                "state-agency applicant, and %s of those had a title matching the "
                "sheltering keywords. Categories present: %s. Run "
                "`fema-flood-gap pa %s` to see the applicants and titles, then "
                "adjust --pa-category, --pa-keyword or --pa-all-applicants."
                % (f"{pa_result.records_seen:,}", options.state,
                   f"{sum(v for k, v in pa_result.categories.items() if k[:1] == (options.pa.category or '')[:1].upper()):,}",
                   options.pa.category, f"{pa_result.state_applicants:,}",
                   f"{pa_result.matched.projects:,}",
                   ", ".join("%s (%s)" % (k or "blank", f"{v:,}")
                             for k, v in sorted(pa_result.categories.items())) or "none",
                   options.state))
    except api.OpenFemaError as exc:
        report.warnings.append(
            "Public Assistance sheltering could not be pulled (%s); the IHP "
            "figures are unaffected." % exc)


def _resolve_versions(client, options, report):
    """Bind each dataset to a version published by OpenFEMA right now."""
    progress = client.progress
    progress("Checking the OpenFEMA dataset catalog...")
    wanted = [
        ("ihp_version", options.ihp_dataset),
        ("nfip_version", options.nfip_dataset),
        ("declarations_version", options.declarations_dataset),
        ("pa_version", datasets.PA_DATASET),
        ("pa_applicants_version", datasets.PA_APPLICANTS_DATASET),
    ]
    for attribute, name in wanted:
        if attribute == "nfip_version" and options.skip_nfip:
            continue
        if attribute.startswith("pa_") and not options.pa.enabled:
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
        report.vintage[attribute.split("_")[0]] = "%s v%s%s" % (
            name, version, (" - %s" % catalog.describe(entry)) if entry else "")
        if note:
            report.warnings.append(note)
        progress("  %s -> v%s%s" % (name, version,
                                    " (%s)" % catalog.describe(entry) if entry else ""))


def _context_counts(client, ihp_schema, options, vocabulary=None,
                    known_cohort_count=None):
    """Cheap ``$inlinecount`` queries that put the cohort in proportion.

    Cheap in bandwidth, not in time: each one makes OpenFEMA scan the whole
    registration table, so they are reported individually as they land rather
    than behind one silent pause. They are also cached, so only the first run
    for a state pays for them.

    These are statewide across every declaration on file -- they are not
    narrowed by the year/incident filters, because OpenFEMA cannot count over an
    arbitrary disaster-number set in one request. The report labels them so.
    """
    progress = client.progress
    counts = {}
    queries = [
        ("all_registrations", "all registrations",
         datasets.ihp_state_filter(ihp_schema, options.state)),
        ("owner_registrations", "owner-occupant registrations",
         datasets.ihp_cohort_filter(ihp_schema, options.state, owner_only=True,
                                    flood_damage=False, vocabulary=vocabulary)),
        ("owner_flood_damaged", "owners with flood damage",
         datasets.ihp_cohort_filter(ihp_schema, options.state, owner_only=True,
                                    flood_damage=True, vocabulary=vocabulary)),
        ("owner_flood_damaged_uninsured", "...without flood insurance",
         datasets.ihp_cohort_filter(ihp_schema, options.state, owner_only=True,
                                    flood_damage=True, insurance="uninsured",
                                    vocabulary=vocabulary)),
        ("owner_flood_damaged_insured", "...with flood insurance",
         datasets.ihp_cohort_filter(ihp_schema, options.state, owner_only=True,
                                    flood_damage=True, insurance="insured",
                                    vocabulary=vocabulary)),
    ]

    for index, (key, label, query) in enumerate(queries, start=1):
        # The uninsured cohort was already counted to size the download; asking
        # OpenFEMA to scan 26 million rows again for the same answer is waste.
        if key == "owner_flood_damaged_uninsured" and known_cohort_count is not None \
                and query != datasets.ihp_state_filter(ihp_schema, options.state) \
                and options.cohort.unknown_insurance != "uninsured" \
                and options.cohort.owner_only and options.cohort.flood_basis == "damage":
            counts[key] = known_cohort_count
            progress("  [%d/%d] %s: %s (already counted)"
                     % (index, len(queries), label, f"{known_cohort_count:,}"))
            continue
        try:
            counts[key] = client.count(options.ihp_dataset, options.ihp_version, query)
            progress("  [%d/%d] %s: %s"
                     % (index, len(queries), label, f"{counts[key]:,}"))
        except api.OpenFemaError as exc:
            counts[key] = None
            progress("  [%d/%d] %s: unavailable (%s)" % (index, len(queries), label, exc))

    total = counts.get("owner_flood_damaged")
    insured = counts.get("owner_flood_damaged_insured")
    uninsured = counts.get("owner_flood_damaged_uninsured")
    if None not in (total, insured, uninsured):
        # Whatever is left over has no flood-insurance value recorded at all.
        counts["owner_flood_damaged_insurance_unknown"] = total - insured - uninsured
    if total and uninsured is not None:
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
