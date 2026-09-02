import json
import os
import re
import sys
import urllib.parse
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import fixtures
from fake_api import FakeClient

from fema_flood import (analysis, api as api_mod, catalog, cpi, datasets,
                        declarations, pipeline, report)


def make_client(**kwargs):
    kwargs.setdefault("field_types", fixtures.FIELD_TYPES)
    return FakeClient(fixtures.TABLES, **kwargs)


def _vocabulary(client, schema, state="LA"):
    """The value sample the pipeline builds its filters from."""
    from fema_flood import probe
    sampled = probe.sample(
        client, datasets.IHP_DATASET, 2,
        [schema.name("ownRent"), schema.name("floodDamage"),
         schema.name("floodInsurance")],
        filter=datasets.ihp_state_filter(schema, state))
    return {logical: sampled.get(schema.name(logical))
            for logical in ("ownRent", "floodDamage", "floodInsurance")}


def make_options(state="LA", **overrides):
    cohort_kwargs = {k[7:]: overrides.pop(k) for k in list(overrides)
                     if k.startswith("cohort_")}
    nfip_kwargs = {k[5:]: overrides.pop(k) for k in list(overrides)
                   if k.startswith("nfip_")}
    deflator = overrides.pop("deflator", cpi.Deflator())
    return pipeline.RunOptions(
        state=state,
        cohort=analysis.CohortOptions(**cohort_kwargs),
        nfip=analysis.NfipOptions(**nfip_kwargs),
        deflator=deflator, **overrides)


class TestSchemaBinding(unittest.TestCase):
    def test_binds_from_published_field_metadata(self):
        client = make_client()
        resolved = datasets.ihp_schema(client, 2)
        self.assertEqual(resolved.source, "DataSetFields")
        self.assertEqual(resolved.name("floodInsurance"), "floodInsurance")
        self.assertEqual(resolved.name("state"), "damagedStateAbbreviation")

    def test_falls_back_to_probing_a_record(self):
        client = make_client(field_types={})
        resolved = datasets.nfip_schema(client, 2)
        self.assertEqual(resolved.source, "record probe")
        self.assertEqual(resolved.name("buildingPaid"), "amountPaidOnBuildingClaim")

    def test_binds_renamed_v2_payment_columns(self):
        renamed = [{k.replace("amountPaidOnBuildingClaim", "netBuildingPaymentAmount")
                    .replace("amountPaidOnContentsClaim", "netContentsPaymentAmount"): v
                    for k, v in row.items()} for row in fixtures.NFIP_RECORDS]
        tables = dict(fixtures.TABLES, FimaNfipClaims=renamed)
        client = FakeClient(tables, field_types={})
        resolved = datasets.nfip_schema(client, 2)
        self.assertEqual(resolved.name("buildingPaid"), "netBuildingPaymentAmount")
        self.assertEqual(resolved.name("contentsPaid"), "netContentsPaymentAmount")


class TestDeclarations(unittest.TestCase):
    def test_collapses_county_rows_and_unions_the_window(self):
        client = make_client()
        schema = datasets.declaration_schema(client, 2)
        rows = client.records("DisasterDeclarationsSummaries", 2,
                              filter="state eq 'LA'")
        collapsed = declarations.collapse(rows, schema)
        self.assertEqual(set(collapsed), {4277, 1603})
        self.assertEqual(collapsed[4277].begin, "2016-08-11")
        self.assertEqual(collapsed[1603].end, "2005-10-01")
        self.assertEqual(collapsed[1603].year, 2005)

    def test_selection_by_year_and_incident_type(self):
        client = make_client()
        schema = datasets.declaration_schema(client, 2)
        collapsed = declarations.collapse(
            client.records("DisasterDeclarationsSummaries", 2, filter="state eq 'LA'"),
            schema)
        self.assertEqual(set(declarations.select(collapsed, min_year=2010)), {4277})
        self.assertEqual(
            set(declarations.select(collapsed, incident_types=["Hurricane"])), {1603})
        self.assertEqual(set(declarations.select(collapsed, flood_only=True)),
                         {4277, 1603})


class TestReportNumbers(unittest.TestCase):
    """The headline figures, checked against hand-computed fixture totals."""

    @classmethod
    def setUpClass(cls):
        cls.client = make_client()
        cls.report = pipeline.build(cls.client, make_options())

    def test_cohort_membership(self):
        stats = self.report.ihp.statewide
        self.assertEqual(stats.households, 5)          # r01 r02 r07 r08 r09
        # The server-side $filter already excluded every non-member, so nothing
        # needed rejecting locally and only cohort rows were downloaded.
        self.assertEqual(self.report.ihp.records_seen, 5)
        self.assertEqual(self.report.ihp.rejections.total, 0)

    def test_ihp_totals_and_averages(self):
        stats = self.report.ihp.statewide
        self.assertEqual(stats.ihp.total, 19000.0)
        self.assertEqual(stats.ha.total, 15000.0)
        self.assertEqual(stats.ona.total, 4000.0)
        self.assertEqual(stats.ha.total + stats.ona.total, stats.ihp.total)
        self.assertEqual(stats.ihp.mean, 3800.0)       # over all 5 households
        self.assertEqual(stats.ihp.n_positive, 4)
        self.assertEqual(stats.ihp.mean_positive, 4750.0)
        self.assertEqual(stats.verified_real_property_loss, 32000.0)

    def test_per_disaster_split(self):
        buckets = self.report.ihp.by_disaster
        self.assertEqual(buckets[4277].households, 2)
        self.assertEqual(buckets[4277].ihp.total, 10000.0)
        self.assertEqual(buckets[1603].households, 2)
        self.assertEqual(buckets[1603].ihp.total, 8000.0)
        self.assertEqual(buckets[9999].households, 1)  # kept even with no declaration

    def test_statewide_nfip(self):
        nfip = self.report.nfip
        self.assertEqual(nfip.paid.n, 7)               # TX claim excluded
        self.assertEqual(nfip.paid.total, 280000.0)
        self.assertEqual(nfip.paid.n_positive, 6)
        self.assertAlmostEqual(nfip.paid.mean_positive, 280000.0 / 6)
        self.assertAlmostEqual(nfip.paid.mean, 40000.0)
        self.assertEqual(nfip.building.total, 255000.0)
        self.assertEqual(nfip.contents.total, 25000.0)

    def test_claims_matched_to_the_same_storm(self):
        matched = self.report.nfip.by_disaster
        self.assertEqual(matched[4277].n, 3)           # c01 c02 c07, not c03
        self.assertAlmostEqual(matched[4277].mean_positive, 170000.0 / 3)
        self.assertEqual(matched[1603].n, 2)           # c04 and the unpaid c05
        self.assertEqual(matched[1603].n_positive, 1)
        self.assertEqual(matched[1603].mean_positive, 75000.0)

    def test_gap_math(self):
        expected_gap = 280000.0 / 6 - 3800.0
        self.assertAlmostEqual(self.report.gap_per_household(), expected_gap)
        self.assertAlmostEqual(self.report.aggregate_gap(), expected_gap * 5)
        self.assertAlmostEqual(self.report.gap_per_household(paid_only=True),
                               280000.0 / 6 - 4750.0)

    def test_context_counts(self):
        context = self.report.context
        self.assertEqual(context["all_registrations"], 9)      # LA rows only
        self.assertEqual(context["owner_registrations"], 8)
        self.assertEqual(context["owner_flood_damaged"], 7)
        self.assertEqual(context["owner_flood_damaged_uninsured"], 5)
        self.assertEqual(context["owner_flood_damaged_insured"], 1)
        # r06 has no flood-insurance value; it belongs to neither side, and
        # deriving "insured" by subtraction would have wrongly swallowed it.
        self.assertEqual(context["owner_flood_damaged_insurance_unknown"], 1)

    def test_data_vintage_records_dataset_and_version(self):
        vintage = self.report.vintage["ihp"]
        self.assertIn("IndividualsAndHouseholdsProgramValidRegistrations v2", vintage)
        self.assertIn("26,000,000 records", vintage)


class TestOptions(unittest.TestCase):
    def test_year_filter_drops_out_of_scope_disasters(self):
        result = pipeline.build(make_client(), make_options(min_year=2010))
        self.assertEqual(set(result.ihp.by_disaster), {4277})
        self.assertEqual(result.ihp.statewide.households, 2)
        self.assertEqual(result.ihp.rejections.filtered_by_disaster, 3)

    def test_incident_type_filter(self):
        result = pipeline.build(make_client(), make_options(incident_types=["Hurricane"]))
        self.assertEqual(set(result.ihp.by_disaster), {1603})
        self.assertEqual(result.ihp.statewide.ihp.total, 8000.0)

    def test_unknown_insurance_counted_as_uninsured(self):
        result = pipeline.build(
            make_client(), make_options(cohort_unknown_insurance="uninsured"))
        self.assertEqual(result.ihp.statewide.households, 6)      # r06 joins
        self.assertEqual(result.ihp.statewide.ihp.total, 26000.0)

    def test_including_renters_widens_the_cohort(self):
        result = pipeline.build(make_client(), make_options(cohort_owner_only=False))
        self.assertEqual(result.ihp.statewide.households, 6)      # r04 joins
        self.assertEqual(result.ihp.statewide.ihp.total, 23000.0)

    def test_owner_occupied_nfip_filter_drops_commercial_claims(self):
        result = pipeline.build(
            make_client(), make_options(nfip_owner_occupied_only=True))
        self.assertEqual(result.nfip.paid.n, 6)
        self.assertEqual(result.nfip.paid.total, 180000.0)
        self.assertEqual(result.nfip.paid.mean_positive, 36000.0)

    def test_match_buffer_widens_the_event_window(self):
        result = pipeline.build(make_client(), make_options(match_buffer_days=10))
        self.assertEqual(result.nfip.by_disaster[4277].n, 4)       # c03 now inside

    def test_inflation_adjustment_scales_both_sides(self):
        deflator = cpi.Deflator(2024)
        result = pipeline.build(make_client(), make_options(deflator=deflator))
        katrina = 8000.0 * (cpi.CPI_U[2024] / cpi.CPI_U[2005])
        self.assertAlmostEqual(result.ihp.by_disaster[1603].ihp.total, katrina)
        # 2016 claims are lifted too, so the gap is computed like-for-like.
        self.assertGreater(result.nfip.paid.total, 280000.0)

    def test_skip_nfip(self):
        result = pipeline.build(make_client(), make_options(skip_nfip=True))
        self.assertIsNone(result.nfip)
        self.assertIsNone(result.gap_per_household())


class TestClientBehaviour(unittest.TestCase):
    def test_keyset_paging_returns_every_record_exactly_once(self):
        client = make_client(page_size=2)
        rows = list(client.records("FimaNfipClaims", 2, filter="state eq 'LA'"))
        self.assertEqual(len(rows), 7)
        self.assertEqual(len({row["id"] for row in rows}), 7)
        self.assertTrue(any("id+gt" in url or "id%20gt" in url for url in client.urls))

    def test_skip_paging_agrees_with_keyset_paging(self):
        keyset = make_client(page_size=2)
        offset = make_client(page_size=2, paging="skip")
        self.assertEqual(
            sorted(r["id"] for r in keyset.records("FimaNfipClaims", 2)),
            sorted(r["id"] for r in offset.records("FimaNfipClaims", 2)))

    def test_falls_back_when_compound_filters_are_rejected(self):
        client = make_client(reject_compound_filters=True)
        result = pipeline.build(client, make_options())
        # The cohort is re-applied locally, so the answer is unchanged...
        self.assertEqual(result.ihp.statewide.households, 5)
        self.assertEqual(result.ihp.statewide.ihp.total, 19000.0)
        # ...but more rows had to be downloaded and rejected locally, which is
        # where the client-side re-check of every cohort predicate earns its keep.
        self.assertEqual(result.ihp.records_seen, 9)
        rejected = result.ihp.rejections
        self.assertEqual(rejected.insured, 1)             # r03
        self.assertEqual(rejected.not_owner, 1)           # r04
        self.assertEqual(rejected.no_flood_damage, 1)     # r05
        self.assertEqual(rejected.unknown_insurance, 1)   # r06
        self.assertTrue(any("rejected the compound cohort filter" in w
                            for w in result.warnings))

    def test_cache_round_trip(self):
        import tempfile
        with tempfile.TemporaryDirectory() as tmp:
            client = make_client(cache_dir=tmp, use_cache=True)
            first = list(client.records("FimaNfipClaims", 2, filter="state eq 'LA'"))
            requests_after_first = client.requests_made
            second = list(client.records("FimaNfipClaims", 2, filter="state eq 'LA'"))
            self.assertEqual(first, second)
            self.assertEqual(client.requests_made, requests_after_first)
            self.assertGreater(client.cache_hits, 0)


class TestRenderers(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.report = pipeline.build(make_client(), make_options())

    def test_every_format_renders(self):
        for fmt in ("text", "md", "html", "csv", "json"):
            output = report.render(self.report, fmt)
            self.assertTrue(output.strip(), fmt)

    def test_text_report_states_the_headline_numbers(self):
        text = report.render(self.report, "text")
        self.assertIn("Louisiana", text)
        self.assertIn("$19,000", text)      # total IHP
        self.assertIn("$3,800", text)       # average per household
        self.assertIn("IHP is the sum of HA and ONA", text)

    def test_csv_has_a_row_per_disaster_plus_a_total(self):
        rows = report.render(self.report, "csv").strip().splitlines()
        self.assertEqual(len(rows), 1 + 3 + 1)
        self.assertIn("TOTAL", rows[-1])
        self.assertIn("19000.0", rows[-1])

    def test_json_is_machine_readable_and_complete(self):
        payload = json.loads(report.render(self.report, "json"))
        self.assertEqual(payload["state"], "LA")
        self.assertEqual(payload["comparison"]["cohort_households"], 5)
        self.assertEqual(payload["ihp"]["statewide"]["ihp"]["total"], 19000.0)
        self.assertEqual(payload["nfip"]["claims"], 7)
        self.assertEqual(len(payload["disasters"]), 3)
        self.assertIn("cohort_definition", payload)

    def test_html_is_self_contained(self):
        page = report.render(self.report, "html")
        self.assertTrue(page.startswith("<!doctype html>"))
        self.assertNotIn("<script", page)
        self.assertNotIn("http://", page.split("<style>")[0])
        self.assertIn("Louisiana", page)


class TestCli(unittest.TestCase):
    def test_state_argument_without_subcommand(self):
        from fema_flood import cli
        args = cli.build_parser().parse_args(["report", "LA", "--format", "json"])
        self.assertEqual(args.state, "LA")
        self.assertEqual(args.format, "json")

    def test_unknown_state_exits_with_usage_error(self):
        from fema_flood import cli
        import io
        import contextlib
        args = cli.build_parser().parse_args(["report", "Atlantis"])
        stderr = io.StringIO()
        with contextlib.redirect_stderr(stderr):
            self.assertEqual(cli.cmd_report(args), 2)
        self.assertIn("unrecognized state", stderr.getvalue())


if __name__ == "__main__":
    unittest.main()


class TestPagingSafety(unittest.TestCase):
    """Keyset paging must never duplicate or drop rows, even on a bad server."""

    def test_switches_to_offset_paging_when_cursor_predicate_is_ignored(self):
        class IgnoresCursor(FakeClient):
            """A server that accepts `id gt ...` and then does not apply it."""

            def _fetch(self, url):
                parts = urllib.parse.urlparse(url)
                params = urllib.parse.parse_qs(parts.query)
                if "$filter" in params:
                    stripped = re.sub(r"\s*and\s*\(id gt '[^']*'\)", "",
                                      params["$filter"][0])
                    assert stripped != params["$filter"][0] or "id gt" not in \
                        params["$filter"][0], "cursor term was not recognised"
                    params["$filter"] = [stripped]
                query = urllib.parse.urlencode(
                    [(k, v[0]) for k, v in params.items()],
                    quote_via=urllib.parse.quote)
                return super()._fetch(parts._replace(query=query).geturl())

        messages = []
        client = IgnoresCursor(fixtures.TABLES, field_types=fixtures.FIELD_TYPES,
                               page_size=3, progress=messages.append)
        rows = list(client.records("FimaNfipClaims", 2, filter="state eq 'LA'"))
        ids = [row["id"] for row in rows]
        self.assertEqual(len(ids), len(set(ids)), "rows were duplicated")
        self.assertEqual(set(ids), {c["id"] for c in fixtures.NFIP_RECORDS
                                    if c["state"] == "LA"})
        self.assertTrue(any("not honoured" in m for m in messages),
                        "the fallback path was never taken")

    def test_percentiles_are_stable_after_more_values_arrive(self):
        acc = analysis.Accumulator()
        for value in (10.0, 20.0, 30.0):
            acc.add(value)
        self.assertEqual(acc.percentile(50), 20.0)
        acc.add(1000.0)
        self.assertEqual(acc.percentile(50), 25.0)


class TestCatalogResolution(unittest.TestCase):
    """Dataset versions come from OpenFEMA's catalog, not a hard-coded guess."""

    def test_picks_the_current_version_over_a_deprecated_one(self):
        client = make_client()
        version, entry, note = catalog.resolve(
            client, datasets.IHP_DATASET)
        self.assertEqual(version, 2)
        self.assertIsNone(note)
        self.assertEqual(entry["recordCount"], 26_000_000)

    def test_report_queries_the_resolved_version(self):
        client = make_client()
        options = make_options()
        pipeline.build(client, options)
        self.assertEqual(options.ihp_version, 2)
        self.assertTrue(any("/v2/IndividualsAndHouseholds" in url
                            for url in client.urls))
        self.assertFalse(any("/v1/IndividualsAndHouseholds" in url
                             for url in client.urls))

    def test_explicit_pin_is_honoured_but_flagged_as_deprecated(self):
        version, entry, note = catalog.resolve(
            make_client(), datasets.IHP_DATASET, requested=1)
        self.assertEqual(version, 1)
        self.assertIn("deprecated", note)

    def test_pin_absent_from_the_catalog_is_reported(self):
        version, entry, note = catalog.resolve(
            make_client(), datasets.IHP_DATASET, requested=7)
        self.assertEqual(version, 7)
        self.assertIn("not in the catalog", note)
        self.assertIn("v2", note)

    def test_unknown_dataset_name_suggests_real_ones(self):
        with self.assertRaises(catalog.CatalogError) as caught:
            catalog.resolve(make_client(), "IndividualsAndHouseholdsProgramTypo",
                            hint="Individuals")
        message = str(caught.exception)
        self.assertIn("no dataset named", message)
        self.assertIn("IndividualsAndHouseholdsProgramValidRegistrations (v2)", message)

    def test_falls_back_to_a_built_in_version_when_the_catalog_is_missing(self):
        tables = dict(fixtures.TABLES)
        del tables["DataSets"]
        client = FakeClient(tables, field_types=fixtures.FIELD_TYPES)
        options = make_options()
        result = pipeline.build(client, options)
        self.assertEqual(options.ihp_version, datasets.FALLBACK_VERSIONS[datasets.IHP_DATASET])
        self.assertTrue(any("Falling back to v" in w for w in result.warnings))
        # The run still produces the right answer against the fallback version.
        self.assertEqual(result.ihp.statewide.ihp.total, 19000.0)


class TestErrorBodies(unittest.TestCase):
    def test_gzipped_html_error_page_is_made_readable(self):
        import gzip
        import io
        import urllib.error
        from fema_flood.api import _error_body

        class Headers(dict):
            def get(self, key, default=None):
                return dict.get(self, key, default)

        page = (b"<html><head><title>404</title></head><body><h1>Not Found</h1>"
                b"<p>The requested resource was not found.</p></body></html>")
        exc = urllib.error.HTTPError(
            "u", 404, "nf", Headers({"Content-Encoding": "gzip"}),
            io.BytesIO(gzip.compress(page)))
        text = _error_body(exc)
        self.assertIn("Not Found", text)
        self.assertNotIn("<", text)

    def test_plain_error_body_survives(self):
        import io
        import urllib.error
        from fema_flood.api import _error_body

        exc = urllib.error.HTTPError("u", 400, "bad", {}, io.BytesIO(b"bad filter"))
        self.assertEqual(_error_body(exc), "bad filter")


class TestErrorDiagnosis(unittest.TestCase):
    """A 400 that is not about the filter must not be misreported as one."""

    def test_malformed_parameter_is_not_treated_as_a_filter_rejection(self):
        class BadParameter(FakeClient):
            def _fetch(self, url):
                if "inlinecount" in url:
                    raise api_mod.HttpError(
                        400, url,
                        '{"error":"Bad Request","message":"Unexpected querystring '
                        'parameter","code":"INVALID_QUERY_PARAMETER"}')
                return super()._fetch(url)

        client = BadParameter(fixtures.TABLES, field_types=fixtures.FIELD_TYPES)
        result = pipeline.build(client, make_options())

        # Counting is optional, so the report still lands with real figures...
        self.assertEqual(result.ihp.statewide.ihp.total, 19000.0)
        # ...and the warning names the actual cause rather than blaming the
        # filter and silently widening the query.
        warnings = " ".join(result.warnings)
        self.assertIn("querystring", warnings)
        self.assertNotIn("compound cohort filter", warnings)

    def test_filter_complaint_still_triggers_the_widening_fallback(self):
        client = make_client(reject_compound_filters=True)
        result = pipeline.build(client, make_options())
        self.assertEqual(result.ihp.statewide.households, 5)
        self.assertTrue(any("compound cohort filter" in w for w in result.warnings))

    def test_classification_of_error_bodies(self):
        cases = [
            ('{"message":"Unexpected querystring parameter: \'$inlinecount\'"}', False),
            ('{"message":"Invalid operator in $filter"}', True),
            ('{"message":"Unknown column floodDamage"}', True),
            ("", True),
        ]
        for body, expected in cases:
            error = api_mod.HttpError(400, "u", body)
            self.assertIs(api_mod.looks_like_filter_rejection(error), expected, body)

    def test_count_uses_the_odata_spelling(self):
        client = make_client()
        client.count("FimaNfipClaims", 2, "state eq 'LA'")
        self.assertTrue(any("allpages" in url for url in client.urls))
        self.assertFalse(any("inlinecount=all&" in url for url in client.urls))


class TestContextCounts(unittest.TestCase):
    def test_cohort_count_is_not_queried_twice(self):
        client = make_client()
        pipeline.build(client, make_options())
        schema = datasets.ihp_schema(client, 2)
        vocabulary = _vocabulary(client, schema)
        cohort = datasets.ihp_cohort_filter(
            schema, "LA", owner_only=True, flood_damage=True,
            insurance="uninsured", vocabulary=vocabulary)
        self.assertIn("ownRent", cohort)      # the filter really is narrowed
        counting = [u for u in client.urls
                    if "inlinecount" in u and urllib.parse.quote(cohort) in u]
        self.assertEqual(len(counting), 1, "the cohort was counted more than once")

    def test_each_count_is_reported_as_it_lands(self):
        messages = []
        client = make_client(progress=messages.append)
        pipeline.build(client, make_options())
        progress = [m for m in messages if "[" in m and "/5]" in m]
        self.assertEqual(len(progress), 5)
        self.assertTrue(any("already counted" in m for m in progress))

    def test_a_failed_pre_count_does_not_abort_the_report(self):
        """The pre-count only sizes a progress bar; losing it is not fatal."""
        class PreCountFails(FakeClient):
            def _fetch(self, url):
                if "inlinecount" in url and "floodInsurance" in url:
                    raise api_mod.HttpError(503, url, "service unavailable")
                return super()._fetch(url)

        client = PreCountFails(fixtures.TABLES, field_types=fixtures.FIELD_TYPES,
                               max_retries=1)
        result = pipeline.build(client, make_options())
        self.assertEqual(result.ihp.statewide.ihp.total, 19000.0)
        self.assertEqual(result.ihp.statewide.households, 5)
        self.assertTrue(any("pre-count failed" in w for w in result.warnings))

    def test_a_failed_context_count_does_not_abort_the_report(self):
        class CountsFail(FakeClient):
            """Fails the owner-registrations context count only."""

            def _fetch(self, url):
                if "inlinecount" in url and "ownRent" in url \
                        and "floodDamage" not in url:
                    raise api_mod.HttpError(500, url, "boom")
                return super()._fetch(url)

        client = CountsFail(fixtures.TABLES, field_types=fixtures.FIELD_TYPES,
                            max_retries=1)
        result = pipeline.build(client, make_options())
        self.assertEqual(result.ihp.statewide.ihp.total, 19000.0)
        self.assertIsNone(result.context["owner_registrations"])


class TestVocabulary(unittest.TestCase):
    """Filters must be written in the encoding the data actually uses.

    OpenFEMA stores tenure as "O"/"R". Asking for 'Owner' returns zero rows,
    which is indistinguishable in the output from a state with no owners --
    the failure mode this whole path exists to prevent.
    """

    def test_filter_uses_the_sampled_letter_code(self):
        client = make_client()
        schema = datasets.ihp_schema(client, 2)
        cohort = datasets.ihp_cohort_filter(
            schema, "LA", vocabulary=_vocabulary(client, schema))
        self.assertIn("ownRent eq 'O'", cohort)
        self.assertNotIn("'Owner'", cohort)

    def test_same_code_handles_a_spelled_out_encoding(self):
        spelled = [dict(row, ownRent={"O": "Owner", "R": "Renter"}[row["ownRent"]])
                   for row in fixtures.IHP_RECORDS]
        tables = dict(fixtures.TABLES,
                      IndividualsAndHouseholdsProgramValidRegistrations=spelled)
        client = FakeClient(tables, field_types=fixtures.FIELD_TYPES)
        schema = datasets.ihp_schema(client, 2)
        cohort = datasets.ihp_cohort_filter(
            schema, "LA", vocabulary=_vocabulary(client, schema))
        self.assertIn("ownRent eq 'Owner'", cohort)

        result = pipeline.build(client, make_options())
        self.assertEqual(result.ihp.statewide.households, 5)
        self.assertEqual(result.ihp.statewide.ihp.total, 19000.0)

    def test_boolean_flags_use_the_sampled_type(self):
        as_booleans = [dict(row,
                            floodDamage=bool(row["floodDamage"]),
                            floodInsurance=None if row["floodInsurance"] is None
                            else bool(row["floodInsurance"]))
                       for row in fixtures.IHP_RECORDS]
        tables = dict(fixtures.TABLES,
                      IndividualsAndHouseholdsProgramValidRegistrations=as_booleans)
        client = FakeClient(tables, field_types=fixtures.FIELD_TYPES)
        schema = datasets.ihp_schema(client, 2)
        cohort = datasets.ihp_cohort_filter(
            schema, "LA", insurance="uninsured",
            vocabulary=_vocabulary(client, schema))
        self.assertIn("floodDamage eq true", cohort)
        self.assertIn("floodInsurance eq false", cohort)

        result = pipeline.build(client, make_options())
        self.assertEqual(result.ihp.statewide.ihp.total, 19000.0)

    def test_empty_cohort_widens_instead_of_reporting_zero(self):
        class UnsampleableColumn(FakeClient):
            """Sampling comes back empty, so no cohort predicate can be built."""

            def _fetch(self, url):
                payload = super()._fetch(url)
                if "%24top=1000" in url:
                    for key in payload:
                        if key != "metadata":
                            payload[key] = []
                return payload

        client = UnsampleableColumn(fixtures.TABLES,
                                    field_types=fixtures.FIELD_TYPES)
        result = pipeline.build(client, make_options())
        # Widened to the whole state, then filtered locally: same answer.
        self.assertEqual(result.ihp.statewide.households, 5)
        self.assertEqual(result.ihp.statewide.ihp.total, 19000.0)
        self.assertEqual(result.ihp.rejections.not_owner, 1)

    def test_sampled_values_are_recorded_in_the_report(self):
        result = pipeline.build(make_client(), make_options())
        values = result.schema_notes["ihp_values"]
        self.assertEqual(set(values["ownRent"]), {"O", "R"})


class TestRareFlagValues(unittest.TestCase):
    """A flag absent from the sample must not drop the predicate."""

    def test_all_false_sample_still_filters_for_true(self):
        from collections import Counter
        client = make_client()
        schema = datasets.ihp_schema(client, 2)
        # What Mississippi actually returned: 1,000 rows, every one False.
        vocabulary = {"ownRent": Counter({"O": 75, "R": 925}),
                      "floodDamage": Counter({False: 1000}),
                      "floodInsurance": Counter({False: 957, True: 43})}
        cohort = datasets.ihp_cohort_filter(
            schema, "MS", insurance="uninsured", vocabulary=vocabulary)
        self.assertIn("floodDamage eq true", cohort)
        self.assertIn("floodInsurance eq false", cohort)
        self.assertIn("ownRent eq 'O'", cohort)

    def test_integer_flags_infer_the_integer_literal(self):
        from collections import Counter
        client = make_client()
        schema = datasets.ihp_schema(client, 2)
        cohort = datasets.ihp_cohort_filter(
            schema, "MS", insurance="uninsured",
            vocabulary={"ownRent": Counter({"O": 10}),
                        "floodDamage": Counter({0: 1000}),
                        "floodInsurance": Counter({0: 990, 1: 10})})
        self.assertIn("floodDamage eq 1", cohort)
        self.assertIn("floodInsurance eq 0", cohort)

    def test_unknown_string_vocabulary_drops_the_predicate_rather_than_guessing(self):
        from collections import Counter
        client = make_client()
        schema = datasets.ihp_schema(client, 2)
        cohort = datasets.ihp_cohort_filter(
            schema, "MS", vocabulary={"floodDamage": Counter({"No": 1000})})
        self.assertNotIn("floodDamage", cohort)


class TestNumericIdPaging(unittest.TestCase):
    """`id` is numeric in some datasets; quoting it is rejected outright."""

    def _numeric_tables(self):
        claims = [dict(row, id=1000 + index)
                  for index, row in enumerate(fixtures.NFIP_RECORDS)]
        return dict(fixtures.TABLES, FimaNfipClaims=claims)

    def test_numeric_ids_page_unquoted(self):
        class StrictNumericId(FakeClient):
            def _fetch(self, url):
                if "id%20gt%20%27" in url:      # id gt '...'
                    raise api_mod.HttpError(
                        400, url,
                        '{"error":[{"code":"OF_OQP_002","message":"Invalid data '
                        'type of: String for id"}]}')
                return super()._fetch(url)

        client = StrictNumericId(self._numeric_tables(),
                                 field_types=fixtures.FIELD_TYPES, page_size=2)
        rows = list(client.records("FimaNfipClaims", 2, filter="state eq 'LA'"))
        self.assertEqual(len(rows), 7)
        self.assertEqual(len({r["id"] for r in rows}), 7)

    def test_quoted_retry_when_the_column_is_really_text(self):
        """JSON can hand back a number for a column the API treats as text."""

        class StrictTextId(FakeClient):
            def _fetch(self, url):
                if "id%20gt%20" in url and "id%20gt%20%27" not in url:
                    raise api_mod.HttpError(
                        400, url, '{"message":"Invalid data type of: Number for id"}')
                return super()._fetch(url)

        messages = []
        client = StrictTextId(self._numeric_tables(),
                              field_types=fixtures.FIELD_TYPES, page_size=2,
                              progress=messages.append)
        rows = list(client.records("FimaNfipClaims", 2, filter="state eq 'LA'"))
        self.assertEqual(len(rows), 7)
        self.assertEqual(len({r["id"] for r in rows}), 7)
        self.assertTrue(any("quoted literal" in m for m in messages))


class TestPowerQueryParity(unittest.TestCase):
    """Parity with the reference Power Query filter the user validated against:

        Table.SelectRows(source, each
            [damagedStateAbbreviation] = "MS" and [ownRent] = "O"
            and [floodDamage] = 1 and [floodInsurance] = 0)

    In M, comparing null to a value yields null, and SelectRows keeps only
    rows that evaluate to true -- so nulls are dropped on every clause. The
    tool's default cohort must select exactly the same rows.
    """

    @staticmethod
    def power_query_predicate(row, state):
        def equals(value, expected):
            if value is None:                     # null = x  ->  null, not true
                return False
            if isinstance(value, bool):           # the API sends bools for 1/0
                return value == bool(expected)
            return value == expected

        return (equals(row.get("damagedStateAbbreviation"), state)
                and equals(row.get("ownRent"), "O")
                and equals(row.get("floodDamage"), 1)
                and equals(row.get("floodInsurance"), 0))

    def _reference_ids(self, rows, state):
        return {row["id"] for row in rows
                if self.power_query_predicate(row, state)}

    def test_same_rows_as_the_power_query_filter(self):
        client = make_client()
        result = pipeline.build(client, make_options())
        expected = self._reference_ids(fixtures.IHP_RECORDS, "LA")
        self.assertEqual(result.ihp.statewide.households, len(expected))
        self.assertEqual(
            sum(bucket.households for bucket in result.ihp.by_disaster.values()),
            len(expected))

    def test_parity_holds_when_flags_arrive_as_booleans(self):
        as_booleans = [dict(row,
                            floodDamage=bool(row["floodDamage"]),
                            floodInsurance=None if row["floodInsurance"] is None
                            else bool(row["floodInsurance"]))
                       for row in fixtures.IHP_RECORDS]
        tables = dict(fixtures.TABLES,
                      IndividualsAndHouseholdsProgramValidRegistrations=as_booleans)
        result = pipeline.build(
            FakeClient(tables, field_types=fixtures.FIELD_TYPES), make_options())
        self.assertEqual(result.ihp.statewide.households,
                         len(self._reference_ids(as_booleans, "LA")))

    def test_null_insurance_is_excluded_by_default_as_in_power_query(self):
        null_rows = [r["id"] for r in fixtures.IHP_RECORDS
                     if r["floodInsurance"] is None]
        self.assertEqual(null_rows, ["r06"], "fixture must have one null-insurance row")

        # Widen the query so the record actually reaches the client-side check,
        # rather than being filtered out by the API before we can see it.
        result = pipeline.build(make_client(reject_compound_filters=True),
                                make_options())
        self.assertEqual(result.ihp.rejections.unknown_insurance, 1)
        self.assertEqual(result.ihp.statewide.households,
                         len(self._reference_ids(fixtures.IHP_RECORDS, "LA")))

    def test_counting_unknown_insurance_as_uninsured_deviates_deliberately(self):
        strict = pipeline.build(make_client(), make_options())
        loose = pipeline.build(
            make_client(), make_options(cohort_unknown_insurance="uninsured"))
        self.assertEqual(strict.ihp.statewide.households, 5)
        self.assertEqual(loose.ihp.statewide.households, 6)
