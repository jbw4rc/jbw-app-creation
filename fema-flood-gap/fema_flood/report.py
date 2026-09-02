"""Renderers: text, Markdown, JSON, CSV, and a self-contained HTML page."""

import csv
import html
import io
import json


def money(value, decimals=0):
    if value is None:
        return "n/a"
    return "$" + format(round(value, decimals), ",.%df" % decimals)


def count(value):
    return "n/a" if value is None else format(int(value), ",")


def pct(value, digits=1):
    return "n/a" if value is None else format(value * 100, ".%df" % digits) + "%"


# ------------------------------------------------------------------ narrative

def headline(report):
    """The one-paragraph version of the pitch, built from the numbers."""
    households = report.cohort_households()
    if not households:
        return "No owner-occupant households in %s matched the cohort." % report.state_name

    ihp_mean = report.ihp_mean()
    nfip_mean = report.nfip_mean()
    total_ihp = report.ihp.statewide.ihp.total
    lines = [
        "%s owner-occupant households in %s reported flood damage without flood "
        "insurance across %d disasters."
        % (count(households), report.state_name, len(report.ihp.by_disaster)),
        "FEMA's Individuals and Households Program paid them %s in total, an "
        "average of %s per household (%s per household that received anything; "
        "%s of the cohort received any IHP award)."
        % (money(total_ihp), money(ihp_mean),
           money(report.ihp_mean(paid_only=True)),
           pct(report.ihp.statewide.ihp.share_positive)),
    ]
    if nfip_mean is not None:
        gap = report.gap_per_household()
        lines.append(
            "Over the same period the average paid NFIP claim in %s was %s. "
            "The difference is %s per household, or roughly %s across the cohort."
            % (report.state_name, money(nfip_mean), money(gap),
               money(report.aggregate_gap())))
    return " ".join(lines)


# ---------------------------------------------------------------------- text

def render_text(report, limit=25, width=100):
    out = io.StringIO()
    w = out.write
    rule = "=" * width

    w("%s\n%s -- FEMA IHP flood assistance vs. NFIP payouts\n%s\n"
      % (rule, report.state_name.upper(), rule))
    w("Generated %s\n" % report.generated)
    w("Dollars: %s\n" % report.options.deflator.label())
    w("Cohort: %s\n" % report.options.cohort.describe())
    w("NFIP claims: %s\n" % report.options.nfip.describe())
    if report.vintage:
        w("Data vintage: %s\n" % ", ".join(
            "%s %s" % (k.upper(), v or "unknown") for k, v in report.vintage.items()))
    w("\n%s\n%s\n\n" % ("THE HEADLINE", "-" * width))
    w(_wrap(headline(report), width) + "\n")

    stats = report.ihp.statewide
    w("\n%s\n%s\n" % ("FEMA IHP -- OWNER, FLOOD DAMAGE, NO FLOOD INSURANCE", "-" * width))
    rows = [
        ("Households (registrations)", count(stats.households)),
        ("Households awarded IHP", "%s (%s)" % (count(stats.ihp.n_positive),
                                                pct(stats.ihp.share_positive))),
        ("Total IHP awarded", money(stats.ihp.total)),
        ("  of which Housing Assistance (HA)", money(stats.ha.total)),
        ("  of which Other Needs Assistance (ONA)", money(stats.ona.total)),
        ("Average IHP per household", money(stats.ihp.mean)),
        ("Average IHP per awarded household", money(stats.ihp.mean_positive)),
        ("Median IHP (awarded households)", money(stats.ihp.percentile(50, True))),
        ("90th percentile IHP (awarded)", money(stats.ihp.percentile(90, True))),
        ("Average HA per household", money(stats.ha.mean)),
        ("Average ONA per household", money(stats.ona.mean)),
        ("FEMA-verified real property loss", money(stats.verified_real_property_loss)),
        ("FEMA-verified personal property loss", money(stats.verified_personal_property_loss)),
    ]
    for label, value in rows:
        w("  %-44s %s\n" % (label, value))
    w("\n  Note: IHP is the sum of HA and ONA, not a third separate award.\n")

    rows = report.cost_share_table()
    if rows:
        w("\n%s\n%s\n" % ("WHAT THE STATE ALREADY PAYS", "-" * width))
        w("  %-52s %14s %10s\n" % ("Funding arrangement", "State cost", "vs today"))
        w("  " + "-" * (width - 2) + "\n")
        for row in rows:
            w("  %-52s %14s %10s\n" % (
                _clip(row["label"], 52), money(row["state_cost"]),
                "-" if row["key"] == "today"
                else ("%.1fx" % row["multiple_of_today"]
                      if row.get("multiple_of_today") else "n/a")))
        w("\n" + _wrap(
            "Scope: the non-federal share of ONA paid to this cohort -- not the "
            "state's whole IHP caseload. " + COST_SHARE_NOTE,
            width - 2, indent="  ", initial="  ") + "\n")

    if report.context:
        w("\n%s\n%s\n" % ("HOW BIG IS THAT COHORT", "-" * width))
        for label, key in [
            ("All IHP registrations in state", "all_registrations"),
            ("Owner-occupant registrations", "owner_registrations"),
            ("Owners with flood damage", "owner_flood_damaged"),
            ("  ...with flood insurance", "owner_flood_damaged_insured"),
            ("  ...without flood insurance", "owner_flood_damaged_uninsured"),
            ("  ...insurance status not recorded",
             "owner_flood_damaged_insurance_unknown"),
        ]:
            w("  %-44s %s\n" % (label, count(report.context.get(key))))
        if report.context.get("uninsured_share") is not None:
            w("  %-44s %s\n" % ("Uninsured share of flooded owners",
                                pct(report.context["uninsured_share"])))
        w("  (%s)\n" % report.context.get("_note", ""))

    if report.nfip:
        n = report.nfip
        w("\n%s\n%s\n" % ("NFIP CLAIMS -- SAME STATE", "-" * width))
        for label, value in [
            ("Claims on file (after filters)", count(n.paid.n)),
            ("Claims closed with a payment", "%s (%s)" % (count(n.paid.n_positive),
                                                          pct(n.paid.share_positive))),
            ("Total paid", money(n.paid.total)),
            ("Average payout per paid claim", money(n.paid.mean_positive)),
            ("Average across all claims filed", money(n.paid.mean)),
            ("Median paid claim", money(n.paid.percentile(50, True))),
            ("90th percentile paid claim", money(n.paid.percentile(90, True))),
            ("  average building payment", money(n.building.mean_positive)),
            ("  average contents payment", money(n.contents.mean_positive)),
        ]:
            w("  %-44s %s\n" % (label, value))

    w("\n%s\n%s\n" % ("THE GAP", "-" * width))
    for label, value in [
        ("Average NFIP payout per paid claim", money(report.nfip_mean())),
        ("Average IHP award per cohort household", money(report.ihp_mean())),
        ("Difference per household", money(report.gap_per_household())),
        ("Difference vs. funded IHP households", money(report.gap_per_household(True))),
        ("Cohort households", count(report.cohort_households())),
        ("Aggregate difference across cohort", money(report.aggregate_gap())),
    ]:
        w("  %-44s %s\n" % (label, value))

    rows = report.disaster_rows(report.options.sort, limit)
    if rows:
        w("\n%s\n%s\n" % ("BY DECLARATION (top %d by IHP dollars)" % len(rows), "-" * width))
        header = ("  %-7s %-30s %6s %9s %11s %10s %9s %11s\n"
                  % ("DR", "Title", "Year", "Househ.", "IHP total", "Avg IHP",
                     "NFIP clms", "Avg NFIP"))
        w(header)
        w("  " + "-" * (width - 2) + "\n")
        for row in rows:
            w("  %-7s %-30s %6s %9s %11s %10s %9s %11s\n" % (
                row["disaster"] if row["disaster"] is not None else "?",
                _clip(row["title"], 30),
                row["year"] or "?",
                count(row["households"]),
                money(row["ihp_total"]),
                money(row["ihp_mean"]),
                count(row["nfip_claims"]),
                money(row["nfip_mean_paid"]),
            ))

    if report.warnings:
        w("\n%s\n%s\n" % ("NOTES", "-" * width))
        for warning in report.warnings:
            w("  * %s\n" % _wrap(warning, width - 4, indent="    ").lstrip())
    w("\n" + _wrap(CAVEATS, width) + "\n")
    return out.getvalue()


COST_SHARE_NOTE = (
    "Under the Stafford Act the state already funds 25% of Other Needs "
    "Assistance (sec. 408(g), 42 U.S.C. 5174(g)); Housing Assistance under "
    "sec. 408(c) is fully federal. The other rows show how this same "
    "historical caseload would have been funded under different terms. They "
    "are illustrations, not forecasts, and none is an enacted proposal."
)

CAVEATS = (
    "Method notes: IHP counts are registrations, which FEMA treats as households; "
    "a household that registers for two disasters appears once per disaster. "
    "IHP equals HA plus ONA. NFIP averages are per claim from insured properties "
    "and include building, contents, and increased-cost-of-compliance payments; "
    "claims closed without payment are shown separately so the average is not "
    "quietly inflated. The two programs are not equivalents -- IHP is capped "
    "disaster aid for essential needs, NFIP is an indemnity policy up to the "
    "purchased limit -- so treat the difference as the scale of what insurance "
    "covers and aid does not, not as a per-household entitlement forecast."
)


def _clip(text, width):
    text = str(text or "")
    return text if len(text) <= width else text[:width - 1] + "…"


def _wrap(text, width, indent="", initial=""):
    import textwrap
    return "\n".join(textwrap.wrap(text, width, initial_indent=initial,
                                   subsequent_indent=indent))


# ------------------------------------------------------------------ markdown

def render_markdown(report, limit=25):
    out = io.StringIO()
    w = out.write
    stats = report.ihp.statewide

    w("# %s: FEMA flood aid vs. NFIP payouts\n\n" % report.state_name)
    w("%s\n\n" % headline(report))
    w("*Generated %s. %s. Cohort: %s.*\n\n"
      % (report.generated, report.options.deflator.label().capitalize(),
         report.options.cohort.describe()))

    w("## FEMA IHP - owner, flood damage, no flood insurance\n\n")
    w("| Measure | Value |\n| --- | ---: |\n")
    for label, value in [
        ("Households (registrations)", count(stats.households)),
        ("Households awarded IHP", "%s (%s)" % (count(stats.ihp.n_positive),
                                                pct(stats.ihp.share_positive))),
        ("Total IHP awarded", money(stats.ihp.total)),
        ("&nbsp;&nbsp;of which HA", money(stats.ha.total)),
        ("&nbsp;&nbsp;of which ONA", money(stats.ona.total)),
        ("Average IHP per household", money(stats.ihp.mean)),
        ("Average IHP per awarded household", money(stats.ihp.mean_positive)),
        ("Median IHP (awarded)", money(stats.ihp.percentile(50, True))),
        ("Average HA per household", money(stats.ha.mean)),
        ("Average ONA per household", money(stats.ona.mean)),
    ]:
        w("| %s | %s |\n" % (label, value))

    if report.nfip:
        n = report.nfip
        w("\n## NFIP claims - %s\n\n" % report.state_name)
        w("| Measure | Value |\n| --- | ---: |\n")
        for label, value in [
            ("Claims on file", count(n.paid.n)),
            ("Claims closed with payment", "%s (%s)" % (count(n.paid.n_positive),
                                                        pct(n.paid.share_positive))),
            ("Total paid", money(n.paid.total)),
            ("**Average payout per paid claim**", "**%s**" % money(n.paid.mean_positive)),
            ("Median paid claim", money(n.paid.percentile(50, True))),
            ("Average building payment", money(n.building.mean_positive)),
            ("Average contents payment", money(n.contents.mean_positive)),
        ]:
            w("| %s | %s |\n" % (label, value))

    rows = report.cost_share_table()
    if rows:
        w("\n## What the state already pays\n\n")
        w("| Funding arrangement | State cost | vs. today |\n| --- | ---: | ---: |\n")
        for row in rows:
            marker = "**" if row["key"] == "today" else ""
            w("| %s%s%s | %s%s%s | %s |\n" % (
                marker, row["label"], marker,
                marker, money(row["state_cost"]), marker,
                "-" if row["key"] == "today"
                else ("%.1fx" % row["multiple_of_today"]
                      if row.get("multiple_of_today") else "n/a")))
        w("\n_Scope: the non-federal share of ONA paid to this cohort, not the "
          "state's whole IHP caseload. %s_\n" % COST_SHARE_NOTE)

    w("\n## The gap\n\n")
    w("| Measure | Value |\n| --- | ---: |\n")
    for label, value in [
        ("Average NFIP payout per paid claim", money(report.nfip_mean())),
        ("Average IHP award per cohort household", money(report.ihp_mean())),
        ("**Difference per household**", "**%s**" % money(report.gap_per_household())),
        ("Cohort households", count(report.cohort_households())),
        ("**Aggregate difference**", "**%s**" % money(report.aggregate_gap())),
    ]:
        w("| %s | %s |\n" % (label, value))

    rows = report.disaster_rows(report.options.sort, limit)
    if rows:
        w("\n## By declaration\n\n")
        w("| DR | Disaster | Year | Households | IHP total | Avg IHP | HA total | "
          "ONA total | NFIP claims | Avg NFIP paid | Gap/household |\n")
        w("| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |\n")
        for row in rows:
            w("| %s | %s | %s | %s | %s | %s | %s | %s | %s | %s | %s |\n" % (
                row["disaster"], row["title"], row["year"] or "",
                count(row["households"]), money(row["ihp_total"]), money(row["ihp_mean"]),
                money(row["ha_total"]), money(row["ona_total"]),
                count(row["nfip_claims"]), money(row["nfip_mean_paid"]),
                money(row["gap_per_household"])))

    if report.warnings:
        w("\n## Notes\n\n")
        for warning in report.warnings:
            w("- %s\n" % warning)
    w("\n---\n\n_%s_\n" % CAVEATS)
    return out.getvalue()


# ---------------------------------------------------------------------- data

def render_json(report):
    return json.dumps(report.to_dict(), indent=2) + "\n"


def render_csv(report):
    out = io.StringIO()
    writer = csv.writer(out, lineterminator="\n")
    writer.writerow([
        "state", "disaster_number", "declaration_title", "incident_type", "year",
        "households", "households_awarded_ihp", "ihp_total", "ihp_mean",
        "ihp_mean_of_awarded", "ha_total", "ha_mean", "ona_total", "ona_mean",
        "ona_state_share",
        "nfip_claims_same_event", "nfip_paid_claims_same_event",
        "nfip_total_paid_same_event", "nfip_mean_paid_same_event",
        "gap_per_household",
    ])
    for row in report.disaster_rows(report.options.sort):
        writer.writerow([
            report.state, row["disaster"], row["title"], row["incident_type"],
            row["year"], row["households"], row["ihp_paid_households"],
            _num(row["ihp_total"]), _num(row["ihp_mean"]), _num(row["ihp_mean_paid"]),
            _num(row["ha_total"]), _num(row["ha_mean"]),
            _num(row["ona_total"]), _num(row["ona_mean"]),
            _num(row["ona_state_share"]),
            row["nfip_claims"], row["nfip_paid_claims"],
            _num(row["nfip_total"]), _num(row["nfip_mean_paid"]),
            _num(row["gap_per_household"]),
        ])
    stats = report.ihp.statewide
    writer.writerow([
        report.state, "TOTAL", "All declarations in scope", "", "",
        stats.households, stats.ihp.n_positive,
        _num(stats.ihp.total), _num(stats.ihp.mean), _num(stats.ihp.mean_positive),
        _num(stats.ha.total), _num(stats.ha.mean),
        _num(stats.ona.total), _num(stats.ona.mean),
        _num(report.state_cost_share()),
        report.nfip.paid.n if report.nfip else "",
        report.nfip.paid.n_positive if report.nfip else "",
        _num(report.nfip.paid.total) if report.nfip else "",
        _num(report.nfip_mean()), _num(report.gap_per_household()),
    ])
    return out.getvalue()


def _num(value, digits=2):
    return "" if value is None else round(value, digits)


# ---------------------------------------------------------------------- html

def _basis_text(deflator):
    if deflator is None:
        return "Nominal dollars"
    if deflator.active:
        label = "Constant %d dollars (CPI-U)" % deflator.base_year
        if deflator.provisional:
            label += " - %d index is provisional" % deflator.base_year
        return label
    return ("Nominal dollars - NOT adjusted for inflation; amounts from "
            "different years are not comparable")


def _short_basis(deflator):
    if deflator is not None and deflator.active:
        return "%d dollars" % deflator.base_year
    return "nominal dollars"


def page_payload(report):
    """Everything the page needs to recompute totals for a year range.

    Only additive quantities travel: counts and sums per declaration, and NFIP
    claim aggregates per year of loss. Anything that cannot be re-derived from
    those -- medians, percentiles -- is deliberately absent rather than
    approximated, so no filtered view can show a number the data cannot
    support.
    """
    share = report.options.cost_share
    disasters = []
    for row in report.disaster_rows(sort="disaster"):
        disasters.append({
            "dr": row["disaster"],
            "title": row["title"],
            "year": row["year"],
            "households": row["households"],
            "ihpTotal": row["ihp_total"],
            "ihpPaid": row["ihp_paid_households"],
            "haTotal": row["ha_total"],
            "onaTotal": row["ona_total"],
            "nfipClaims": row["nfip_claims"],
            "nfipPaidClaims": row["nfip_paid_claims"],
            "nfipTotal": row["nfip_total"] or 0.0,
        })

    by_year = {}
    if report.nfip:
        for year, acc in report.nfip.by_year.items():
            by_year[str(year)] = {"claims": acc.n, "paidClaims": acc.n_positive,
                                  "total": round(acc.total, 2),
                                  "paidTotal": round(acc.total_positive, 2)}

    return {
        "basis": _basis_text(report.options.deflator),
        "basisClass": "real" if report.options.deflator.active else "nominal",
        "shortBasis": _short_basis(report.options.deflator),
        "disasters": disasters,
        "nfipByYear": by_year,
        "scenarios": [{"key": s.key, "label": s.label, "note": s.note,
                       "ona": s.ona_share, "ha": s.ha_share}
                      for s in share.scenarios()],
        "stateName": report.state_name,
    }


CARD_SPECS = [
    ("households", "Uninsured flooded owner households",
     "registrations with FEMA-verified flood damage and no flood insurance"),
    ("ihpTotal", "Total FEMA IHP paid to them", "Housing Assistance plus Other Needs"),
    ("ihpMean", "Average IHP per household", "across every household in the cohort"),
    ("nfipMean", "Average paid NFIP claim", "per claim closed with a payment"),
    ("stateShare", "State's share of that ONA",
     "owed under the 75/25 split on Other Needs Assistance"),
    ("gap", "Difference per household", "insurance payout minus disaster aid"),
    ("aggregateGap", "Aggregate difference", "difference per household, across the cohort"),
]


def render_html(report, limit=40, alternate=None):
    """Render the page. Filtering and the dollar basis are handled in-page.

    Both dollar bases and the per-declaration detail are embedded, so the year
    slider and the basis toggle recompute locally: the file stays one
    self-contained document that works from an email attachment with no
    network and no re-run.
    """
    e = html.escape
    payloads = {"primary": page_payload(report)}
    if alternate is not None:
        payloads["alt"] = page_payload(alternate)

    years = sorted({d["year"] for d in payloads["primary"]["disasters"] if d["year"]})
    undated = sum(1 for d in payloads["primary"]["disasters"] if not d["year"])
    basis_text = _basis_text(report.options.deflator)
    basis_class = "real" if report.options.deflator.active else "nominal"

    controls = ["<div class=\"controls\">",
                "<p class=\"basis %s\" id=\"basis\">%s</p>"
                % (basis_class, e(basis_text))]
    if alternate is not None:
        controls.append(
            "<button type=\"button\" id=\"toggle\">%s</button>"
            % e("Show %s" % _short_basis(alternate.options.deflator)))
    if len(years) > 1:
        controls.append(
            "<div class=\"slider\"><label for=\"since\">Include disasters from</label>"
            "<input type=\"range\" id=\"since\" min=\"%d\" max=\"%d\" value=\"%d\" "
            "step=\"1\" list=\"yearticks\"><output id=\"sincelabel\">%s</output>"
            "<button type=\"button\" id=\"resetyears\" class=\"link\">reset</button>"
            "</div>" % (years[0], years[-1], years[0], e("all years")))
        controls.append("<datalist id=\"yearticks\">%s</datalist>"
                        % "".join("<option value=\"%d\"></option>" % y for y in years))
    controls.append("</div>")

    body = [
        "<header><p class=\"eyebrow\">OpenFEMA analysis</p>",
        "<h1>%s: what flood aid paid, what insurance would have</h1>" % e(report.state_name),
        "".join(controls),
        "<p class=\"lede\" id=\"lede\">%s</p>" % e(headline(report)),
        "<p class=\"meta\">Generated %s &middot; Cohort: %s</p></header>"
        % (e(report.generated), e(report.options.cohort.describe())),
        "<section class=\"cards\" id=\"cards\">",
    ]
    for key, label, note in CARD_SPECS:
        body.append(
            "<div class=\"card\"><p class=\"label\">%s</p>"
            "<p class=\"value\" data-card=\"%s\">-</p>"
            "<p class=\"note\" data-note=\"%s\">%s</p></div>"
            % (e(label), key, key, e(note)))
    body.append("</section>")

    body.append(
        "<section><h2>State cost share: current law and alternatives</h2>"
        "<p class=\"caption\">%s</p><div class=\"scroll\"><table>"
        "<thead><tr><th>Funding arrangement</th><th class=\"n\">State cost</th>"
        "<th class=\"n\">vs. today</th></tr></thead>"
        "<tbody id=\"sharebody\"></tbody></table></div>"
        "<p class=\"caption\">%s</p></section>"
        % (e("Only the first row is current law. Scope: the non-federal share of "
             "ONA paid to this cohort, not the state's whole IHP caseload."),
           e(COST_SHARE_NOTE)))

    body.append(
        "<section><h2>By declaration</h2>"
        "<p class=\"caption\" id=\"tablecaption\"></p><div class=\"scroll\"><table>"
        "<thead><tr><th>DR</th><th>Disaster</th><th class=\"n\">Year</th>"
        "<th class=\"n\">Households</th><th class=\"n\">IHP total</th>"
        "<th class=\"n\">Avg IHP</th><th class=\"n\">HA total</th>"
        "<th class=\"n\">ONA total</th><th class=\"n\">State ONA share</th>"
        "<th class=\"n\">NFIP claims</th><th class=\"n\">Avg NFIP paid</th>"
        "<th class=\"n\">Gap / household</th></tr></thead>"
        "<tbody id=\"tablebody\"></tbody></table></div></section>")

    if report.warnings:
        body.append("<section><h2>Notes</h2><ul>")
        body.extend("<li>%s</li>" % e(warning) for warning in report.warnings)
        body.append("</ul></section>")
    body.append("<footer><p id=\"footerbasis\">%s</p><p>%s</p></footer>"
                % (e(basis_text + "."), e(CAVEATS)))

    config = {
        "payloads": payloads,
        "hasAlternate": alternate is not None,
        "altShortBasis": (_short_basis(alternate.options.deflator)
                          if alternate else None),
        "primaryShortBasis": _short_basis(report.options.deflator),
        "years": years,
        "undated": undated,
        "limit": limit,
    }
    blob = json.dumps(config).replace("</", "<\\/")

    return HTML_TEMPLATE % {
        "title": e("%s flood aid vs. NFIP" % report.state_name),
        "body": "\n".join(body),
        "script": ("<script type=\"application/json\" id=\"figures\">%s</script>\n%s"
                   % (blob, PAGE_SCRIPT)),
    }


PAGE_SCRIPT = """
<script>
(function () {
  var config = JSON.parse(document.getElementById('figures').textContent);
  var showingPrimary = true;
  var since = config.years.length ? config.years[0] : null;

  function money(value) {
    if (value === null || value === undefined || isNaN(value)) return 'n/a';
    var rounded = Math.round(value);
    return (rounded < 0 ? '-$' : '$') +
      Math.abs(rounded).toLocaleString('en-US');
  }
  function count(value) {
    return value === null || value === undefined
      ? 'n/a' : Math.round(value).toLocaleString('en-US');
  }

  function activePayload() {
    return showingPrimary || !config.hasAlternate
      ? config.payloads.primary : config.payloads.alt;
  }

  /* All years means "no filter", which is the only setting that can include
     declarations with no date -- they cannot be placed on the timeline. */
  function showingAllYears() {
    return !config.years.length || since === config.years[0];
  }

  function selectedDisasters(payload) {
    if (showingAllYears()) return payload.disasters;
    return payload.disasters.filter(function (d) {
      return d.year && d.year >= since;
    });
  }

  function nfipForRange(payload) {
    var claims = 0, paidClaims = 0, paidTotal = 0;
    Object.keys(payload.nfipByYear).forEach(function (year) {
      if (!showingAllYears() && Number(year) < since) return;
      var row = payload.nfipByYear[year];
      claims += row.claims;
      paidClaims += row.paidClaims;
      paidTotal += row.paidTotal;
    });
    return {claims: claims, paidClaims: paidClaims, paidTotal: paidTotal,
            mean: paidClaims ? paidTotal / paidClaims : null};
  }

  function totals(payload) {
    var rows = selectedDisasters(payload);
    var sum = {households: 0, ihpTotal: 0, ihpPaid: 0, haTotal: 0, onaTotal: 0};
    rows.forEach(function (d) {
      sum.households += d.households;
      sum.ihpTotal += d.ihpTotal;
      sum.ihpPaid += d.ihpPaid;
      sum.haTotal += d.haTotal;
      sum.onaTotal += d.onaTotal;
    });
    var nfip = nfipForRange(payload);
    var today = payload.scenarios[0];
    sum.rows = rows;
    sum.nfip = nfip;
    sum.ihpMean = sum.households ? sum.ihpTotal / sum.households : null;
    sum.nfipMean = nfip.mean;
    sum.stateShare = sum.onaTotal * today.ona + sum.haTotal * today.ha;
    sum.gap = (nfip.mean === null || sum.ihpMean === null)
      ? null : nfip.mean - sum.ihpMean;
    sum.aggregateGap = sum.gap === null ? null : sum.gap * sum.households;
    return sum;
  }

  function shareFor(scenario, sum) {
    return sum.onaTotal * scenario.ona + sum.haTotal * scenario.ha;
  }

  function renderCards(sum) {
    var values = {
      households: count(sum.households),
      ihpTotal: money(sum.ihpTotal),
      ihpMean: money(sum.ihpMean),
      nfipMean: money(sum.nfipMean),
      stateShare: money(sum.stateShare),
      gap: money(sum.gap),
      aggregateGap: money(sum.aggregateGap)
    };
    /* The two sides are filtered on different date fields -- declarations by
       their year, claims by date of loss -- so the note says which, rather
       than leaving a reader to assume one event set. */
    var notes = {
      ihpTotal: 'HA ' + money(sum.haTotal) + ' + ONA ' + money(sum.onaTotal),
      nfipMean: 'across ' + count(sum.nfip.paidClaims) + ' paid claims' +
        (showingAllYears() ? '' : ' with a date of loss from ' + since + ' onward'),
      ihpMean: count(sum.ihpPaid) + ' of ' + count(sum.households) +
        ' households received an award'
    };
    document.querySelectorAll('[data-card]').forEach(function (node) {
      node.textContent = values[node.getAttribute('data-card')];
    });
    document.querySelectorAll('[data-note]').forEach(function (node) {
      var key = node.getAttribute('data-note');
      if (notes[key]) node.textContent = notes[key];
    });
  }

  function renderShare(payload, sum) {
    var baseline = shareFor(payload.scenarios[0], sum);
    document.getElementById('sharebody').innerHTML =
      payload.scenarios.map(function (scenario, index) {
        var cost = shareFor(scenario, sum);
        var multiple = index === 0 ? '&mdash;'
          : (baseline ? (cost / baseline).toFixed(1) + '&times;' : 'n/a');
        return '<tr' + (index === 0 ? ' class="today"' : '') + '><td>' +
          scenario.label +
          (scenario.note ? ' <span class="sub">' + scenario.note + '</span>' : '') +
          '</td><td class="n">' + money(cost) + '</td>' +
          '<td class="n">' + multiple + '</td></tr>';
      }).join('');
  }

  function renderTable(payload, sum) {
    var rows = sum.rows.slice().sort(function (a, b) {
      return b.ihpTotal - a.ihpTotal;
    }).slice(0, config.limit);
    var today = payload.scenarios[0];
    document.getElementById('tablebody').innerHTML = rows.map(function (d) {
      var mean = d.households ? d.ihpTotal / d.households : null;
      var nfipMean = d.nfipPaidClaims ? d.nfipTotal / d.nfipPaidClaims : null;
      var gap = (nfipMean === null || mean === null) ? null : nfipMean - mean;
      return '<tr><td>' + d.dr + '</td><td>' + d.title + '</td>' +
        '<td class="n">' + (d.year || '') + '</td>' +
        '<td class="n">' + count(d.households) + '</td>' +
        '<td class="n">' + money(d.ihpTotal) + '</td>' +
        '<td class="n">' + money(mean) + '</td>' +
        '<td class="n">' + money(d.haTotal) + '</td>' +
        '<td class="n">' + money(d.onaTotal) + '</td>' +
        '<td class="n">' + money(d.onaTotal * today.ona + d.haTotal * today.ha) + '</td>' +
        '<td class="n">' + count(d.nfipClaims) + '</td>' +
        '<td class="n">' + money(nfipMean) + '</td>' +
        '<td class="n">' + money(gap) + '</td></tr>';
    }).join('');

    var scope = showingAllYears()
      ? 'All ' + count(sum.rows.length) + ' declarations'
      : count(sum.rows.length) + ' declarations beginning ' + since +
        ' or later';
    var note = '';
    if (showingAllYears() && config.undated) {
      note = ', including ' + count(config.undated) +
        ' with no declaration date (excluded once a start year is set)';
    }
    document.getElementById('tablecaption').textContent =
      scope + note + '. Dollar columns: ' +
      payload.basis.toLowerCase().split(' - ')[0] + '.';
  }

  function renderLede(payload, sum) {
    var span = showingAllYears() ? '' : ' since ' + since;
    var text = count(sum.households) + ' owner-occupant households in ' +
      payload.stateName + ' reported flood damage without flood insurance' +
      span + ', across ' + count(sum.rows.length) + ' disasters. FEMA paid ' +
      'them ' + money(sum.ihpTotal) + ' through the Individuals and Households ' +
      'Program, an average of ' + money(sum.ihpMean) + ' per household.';
    if (sum.nfipMean !== null) {
      text += ' The average paid NFIP claim over the same period was ' +
        money(sum.nfipMean) + ' - a difference of ' + money(sum.gap) +
        ' per household, or ' + money(sum.aggregateGap) + ' across the cohort.';
    }
    document.getElementById('lede').textContent = text;
  }

  function render() {
    var payload = activePayload();
    var sum = totals(payload);
    renderCards(sum);
    renderShare(payload, sum);
    renderTable(payload, sum);
    renderLede(payload, sum);

    var basis = document.getElementById('basis');
    basis.textContent = payload.basis;
    basis.className = 'basis ' + payload.basisClass;
    document.getElementById('footerbasis').textContent = payload.basis + '.';

    var toggle = document.getElementById('toggle');
    if (toggle) {
      toggle.textContent = 'Show ' + (showingPrimary
        ? config.altShortBasis : config.primaryShortBasis);
    }
    var label = document.getElementById('sincelabel');
    if (label) label.textContent = showingAllYears() ? 'all years' : since;
  }

  var toggle = document.getElementById('toggle');
  if (toggle) {
    toggle.addEventListener('click', function () {
      showingPrimary = !showingPrimary;
      render();
    });
  }
  var slider = document.getElementById('since');
  if (slider) {
    slider.addEventListener('input', function () {
      since = Number(slider.value);
      render();
    });
    document.getElementById('resetyears').addEventListener('click', function () {
      since = config.years[0];
      slider.value = since;
      render();
    });
  }
  render();
})();
</script>
"""


HTML_TEMPLATE = """<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>%(title)s</title>
<style>
:root{color-scheme:light dark;--bg:#faf9f7;--panel:#fff;--ink:#1c1917;--muted:#6b6560;
--line:#e5e1dc;--accent:#0b6b53;--accent-soft:#e8f2ee;
--warn:#8a5200;--warn-soft:#fdf1de}
@media (prefers-color-scheme:dark){:root{--bg:#161513;--panel:#211f1d;--ink:#f2efea;
--muted:#a8a29b;--line:#35322e;--accent:#4cc39c;--accent-soft:#1e2f2a;
--warn:#e0a458;--warn-soft:#332818}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);
font:16px/1.55 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{max-width:1080px;margin:0 auto;padding:48px 24px 72px}
.eyebrow{margin:0 0 8px;font-size:12px;letter-spacing:.12em;text-transform:uppercase;
color:var(--accent);font-weight:600}
h1{margin:0 0 16px;font-size:34px;line-height:1.2;letter-spacing:-.02em}
h2{margin:40px 0 14px;font-size:20px;letter-spacing:-.01em}
.lede{margin:0 0 12px;font-size:18px;color:var(--ink);max-width:70ch}
.basis{display:inline-block;margin:0;padding:6px 12px;border-radius:999px;
font-size:13px;font-weight:600;border:1px solid transparent}
.basis.real{background:var(--accent-soft);color:var(--accent);border-color:var(--accent)}
.basis.nominal{background:var(--warn-soft);color:var(--warn);border-color:var(--warn)}
.caption{margin:0 0 10px;font-size:13px;color:var(--muted);max-width:80ch}
.controls{display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin-bottom:18px}
.controls .basis{margin:0}
.slider{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--muted)}
.slider input[type=range]{width:200px;accent-color:var(--accent)}
.slider output{font-weight:650;color:var(--ink);font-variant-numeric:tabular-nums;
min-width:5.5ch}
button.link{background:none;border:0;padding:0;font:inherit;font-size:13px;
color:var(--accent);cursor:pointer;text-decoration:underline}
#toggle{font:inherit;font-size:13px;font-weight:600;padding:6px 14px;
border-radius:999px;border:1px solid var(--line);background:var(--panel);
color:var(--ink);cursor:pointer}
#toggle:hover{border-color:var(--accent);color:var(--accent)}
#toggle:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
@media print{#toggle,.slider,button.link{display:none}}
tr.today td{background:var(--accent-soft);font-weight:600}
.sub{display:block;font-weight:400;font-size:12px;color:var(--muted);
white-space:normal;max-width:44ch}
.meta{margin:0;font-size:13px;color:var(--muted);max-width:80ch}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px;
margin-top:32px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:18px}
.card .label{margin:0;font-size:12px;text-transform:uppercase;letter-spacing:.06em;
color:var(--muted)}
.card .value{margin:8px 0 6px;font-size:28px;font-weight:650;letter-spacing:-.02em;
font-variant-numeric:tabular-nums}
.card .note{margin:0;font-size:13px;color:var(--muted)}
.scroll{overflow-x:auto;border:1px solid var(--line);border-radius:12px;background:var(--panel)}
table{border-collapse:collapse;width:100%%;font-size:14px}
th,td{padding:9px 12px;text-align:left;border-bottom:1px solid var(--line);white-space:nowrap}
th{background:var(--accent-soft);font-size:12px;text-transform:uppercase;
letter-spacing:.05em;color:var(--muted);position:sticky;top:0}
td.n,th.n{text-align:right;font-variant-numeric:tabular-nums}
tbody tr:last-child td{border-bottom:0}
footer{margin-top:44px;padding-top:18px;border-top:1px solid var(--line);
font-size:13px;color:var(--muted);max-width:80ch}
ul{padding-left:20px}li{margin-bottom:6px;font-size:14px;color:var(--muted)}
@media print{body{background:#fff}.card,.scroll{break-inside:avoid}}
</style></head>
<body><main>
%(body)s
</main>%(script)s</body></html>
"""


RENDERERS = {
    "text": render_text,
    "md": render_markdown,
    "markdown": render_markdown,
    "json": render_json,
    "csv": render_csv,
    "html": render_html,
}


def render(report, fmt, limit=25, alternate=None):
    renderer = RENDERERS.get(fmt)
    if renderer is None:
        raise ValueError("unknown format %r (choose from %s)"
                         % (fmt, ", ".join(sorted(RENDERERS))))
    if fmt in ("json", "csv"):
        return renderer(report)
    if fmt == "html":
        return renderer(report, limit, alternate)
    return renderer(report, limit)
