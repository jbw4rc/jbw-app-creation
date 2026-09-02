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


def _wrap(text, width, indent=""):
    import textwrap
    return "\n".join(textwrap.wrap(text, width, subsequent_indent=indent))


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
        report.nfip.paid.n if report.nfip else "",
        report.nfip.paid.n_positive if report.nfip else "",
        _num(report.nfip.paid.total) if report.nfip else "",
        _num(report.nfip_mean()), _num(report.gap_per_household()),
    ])
    return out.getvalue()


def _num(value, digits=2):
    return "" if value is None else round(value, digits)


# ---------------------------------------------------------------------- html

def render_html(report, limit=40):
    e = html.escape
    stats = report.ihp.statewide
    rows = report.disaster_rows(report.options.sort, limit)

    cards = [
        ("Uninsured flooded owner households", count(stats.households),
         "registrations with FEMA-verified flood damage and no flood insurance"),
        ("Total FEMA IHP paid to them", money(stats.ihp.total),
         "HA %s + ONA %s" % (money(stats.ha.total), money(stats.ona.total))),
        ("Average IHP per household", money(stats.ihp.mean),
         "%s per household that received an award" % money(stats.ihp.mean_positive)),
        ("Average paid NFIP claim", money(report.nfip_mean()),
         "across %s paid claims in the state"
         % count(report.nfip.paid.n_positive if report.nfip else None)),
        ("Difference per household", money(report.gap_per_household()),
         "insurance payout minus disaster aid"),
        ("Aggregate difference", money(report.aggregate_gap()),
         "difference per household across the whole cohort"),
    ]

    body = [
        "<header><p class=\"eyebrow\">OpenFEMA analysis</p>",
        "<h1>%s: what flood aid paid, what insurance would have</h1>" % e(report.state_name),
        "<p class=\"lede\">%s</p>" % e(headline(report)),
        "<p class=\"meta\">Generated %s &middot; %s &middot; Cohort: %s</p></header>"
        % (e(report.generated), e(report.options.deflator.label()),
           e(report.options.cohort.describe())),
        "<section class=\"cards\">",
    ]
    for label, value, note in cards:
        body.append(
            "<div class=\"card\"><p class=\"label\">%s</p><p class=\"value\">%s</p>"
            "<p class=\"note\">%s</p></div>" % (e(label), e(value), e(note)))
    body.append("</section>")

    if rows:
        body.append("<section><h2>By declaration</h2><div class=\"scroll\"><table>")
        body.append(
            "<thead><tr><th>DR</th><th>Disaster</th><th class=\"n\">Year</th>"
            "<th class=\"n\">Households</th><th class=\"n\">IHP total</th>"
            "<th class=\"n\">Avg IHP</th><th class=\"n\">HA total</th>"
            "<th class=\"n\">ONA total</th><th class=\"n\">NFIP claims</th>"
            "<th class=\"n\">Avg NFIP paid</th><th class=\"n\">Gap / household</th>"
            "</tr></thead><tbody>")
        for row in rows:
            body.append(
                "<tr><td>%s</td><td>%s</td><td class=\"n\">%s</td><td class=\"n\">%s</td>"
                "<td class=\"n\">%s</td><td class=\"n\">%s</td><td class=\"n\">%s</td>"
                "<td class=\"n\">%s</td><td class=\"n\">%s</td><td class=\"n\">%s</td>"
                "<td class=\"n\">%s</td></tr>" % (
                    e(str(row["disaster"])), e(str(row["title"])), row["year"] or "",
                    count(row["households"]), money(row["ihp_total"]), money(row["ihp_mean"]),
                    money(row["ha_total"]), money(row["ona_total"]),
                    count(row["nfip_claims"]), money(row["nfip_mean_paid"]),
                    money(row["gap_per_household"])))
        body.append("</tbody></table></div></section>")

    if report.warnings:
        body.append("<section><h2>Notes</h2><ul>")
        body.extend("<li>%s</li>" % e(warning) for warning in report.warnings)
        body.append("</ul></section>")
    body.append("<footer><p>%s</p></footer>" % e(CAVEATS))

    return HTML_TEMPLATE % {
        "title": e("%s flood aid vs. NFIP" % report.state_name),
        "body": "\n".join(body),
    }


HTML_TEMPLATE = """<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>%(title)s</title>
<style>
:root{color-scheme:light dark;--bg:#faf9f7;--panel:#fff;--ink:#1c1917;--muted:#6b6560;
--line:#e5e1dc;--accent:#0b6b53;--accent-soft:#e8f2ee}
@media (prefers-color-scheme:dark){:root{--bg:#161513;--panel:#211f1d;--ink:#f2efea;
--muted:#a8a29b;--line:#35322e;--accent:#4cc39c;--accent-soft:#1e2f2a}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);
font:16px/1.55 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{max-width:1080px;margin:0 auto;padding:48px 24px 72px}
.eyebrow{margin:0 0 8px;font-size:12px;letter-spacing:.12em;text-transform:uppercase;
color:var(--accent);font-weight:600}
h1{margin:0 0 16px;font-size:34px;line-height:1.2;letter-spacing:-.02em}
h2{margin:40px 0 14px;font-size:20px;letter-spacing:-.01em}
.lede{margin:0 0 12px;font-size:18px;color:var(--ink);max-width:70ch}
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
</main></body></html>
"""


RENDERERS = {
    "text": render_text,
    "md": render_markdown,
    "markdown": render_markdown,
    "json": render_json,
    "csv": render_csv,
    "html": render_html,
}


def render(report, fmt, limit=25):
    renderer = RENDERERS.get(fmt)
    if renderer is None:
        raise ValueError("unknown format %r (choose from %s)"
                         % (fmt, ", ".join(sorted(RENDERERS))))
    if fmt in ("json", "csv"):
        return renderer(report)
    return renderer(report, limit)
