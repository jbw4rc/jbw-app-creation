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
    """The claim, in one paragraph, for a state audience.

    The state is the subject from the first sentence: what it already pays
    across both pots, then the flood comparison -- the one pot with a public
    insurance payout to set beside it.
    """
    households = report.cohort_households()
    if not households:
        return "No owner-occupant households in %s matched the cohort." % report.state_name

    stats = report.ihp.statewide
    ihp_mean = report.ihp_mean()
    nfip_mean = report.nfip_mean()
    home = report.home_insurance
    if home and home.other_peril.statewide.households:
        other = home.other_peril.statewide
        text = (
            "%s already pays for uninsured homes. Under current law the state funds "
            "a quarter of every Other Needs Assistance award; across %s owner-occupant "
            "households that flooded without flood insurance and %s more with no "
            "homeowners insurance and non-flood damage, that has come to %s of the "
            "%s FEMA paid out."
            % (report.state_name, count(households), count(other.households),
               money(report.combined_state_share()),
               money(stats.ihp.total + other.ihp.total)))
    else:
        text = (
            "%s already pays for uninsured homes. Under current law the state funds "
            "a quarter of every Other Needs Assistance award; on the %s owner-occupant "
            "households that flooded without flood insurance, that has come to %s of "
            "the %s FEMA paid out."
            % (report.state_name, count(households), money(report.state_cost_share()),
               money(stats.ihp.total)))
    if nfip_mean is not None and ihp_mean:
        text += (
            " The flooded households averaged %s from FEMA. Insured neighbours "
            "filing NFIP claims over the same period averaged %s -- %s as much. "
            "Coverage takes the liability off the state, and pays the homeowner "
            "%s more."
            % (money(ihp_mean), money(nfip_mean), _times(nfip_mean / ihp_mean),
               money(report.gap_per_household())))
    else:
        text += " The flooded households averaged %s from FEMA." % money(ihp_mean)
    return text


def _times(ratio):
    if ratio is None:
        return "n/a"
    return ("%.0f times" if ratio >= 10 else "%.1f times") % ratio


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
    w(_wrap(headline(report), width) + "\n\n")
    w(_wrap(FRAMING_NOTE, width) + "\n")

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

    home = report.home_insurance
    if home:
        stats = home.all.statewide
        flood = home.flood_damaged.statewide
        other = home.other_peril.statewide
        w("\n%s\n%s\n" % ("OWNER-OCCUPANTS WITH NO HOMEOWNERS INSURANCE", "-" * width))
        for label, value in [
            ("Households (registrations)", count(stats.households)),
            ("Total IHP awarded", money(stats.ihp.total)),
            ("  of which Housing Assistance (HA)", money(stats.ha.total)),
            ("  of which Other Needs Assistance (ONA)", money(stats.ona.total)),
            ("Average IHP per household", money(stats.ihp.mean)),
            ("State's share of that ONA",
             money(report.options.cost_share.state_cost(stats.ha.total, stats.ona.total))),
        ]:
            w("  %-44s %s\n" % (label, value))
        w("\n  %-44s %9s %14s %12s\n" % ("Split by peril", "Households", "IHP total", "Avg IHP"))
        w("  " + "-" * (width - 2) + "\n")
        for label, bucket in [
            ("Other perils - HO would ordinarily cover", other),
            ("Flood damage - HO policies exclude flood", flood),
        ]:
            w("  %-44s %9s %14s %12s\n" % (
                label, count(bucket.households), money(bucket.ihp.total),
                money(bucket.ihp.mean)))
        w("\n  %-44s %s\n" % ("State's share of ONA, non-flood pot only",
                                money(report.non_flood_state_share())))
        w("  %-44s %s\n" % ("State's share across both disjoint pots",
                              money(report.combined_state_share())))
        w("\n" + _wrap(HOME_INSURANCE_NOTE, width - 2, indent="  ", initial="  ") + "\n")

    pa = report.pa
    if pa:
        w("\n%s\n%s\n" % ("BEYOND IHP: PA SHELTERING, STATE APPLICANTS", "-" * width))
        w("  %-46s %9s %15s %15s %13s %7s\n" % (
            "", "Projects", "Obligated", "Federal", "Non-federal", "Share"))
        w("  " + "-" * (width - 2) + "\n")
        for label, totals in [("Sheltering / shelter-in-home (keyword floor)", pa.matched),
                              ("All Category B, state applicants", pa.category)]:
            w("  %-46s %9s %15s %15s %13s %7s\n" % (
                label, count(totals.projects), money(totals.total),
                money(totals.federal), money(totals.non_federal),
                pct(totals.non_federal_share)))
        w("\n" + _wrap(pa_summary(report), width - 2, indent="  ", initial="  ") + "\n")
        w("\n" + _wrap(PA_NOTE, width - 2, indent="  ", initial="  ") + "\n")
        w("\n" + _wrap(pa_basis_caveat(report), width - 2,
                        indent="  ", initial="  ") + "\n")

    rows = report.cost_share_table()
    if rows:
        w("\n%s\n%s\n" % ("STATE COST SHARE: CURRENT LAW AND ALTERNATIVES",
                        "-" * width))
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


FRAMING_NOTE = (
    "IHP is one of several ways a state ends up paying for uninsured homes "
    "after a disaster. It is the program worth measuring because every "
    "registration records whether the household was insured -- so the figures "
    "here are a floor for that cost, not an estimate of all of it."
)

# The federal role is under formal review. This names the review without
# asserting what it will recommend; the CLI lets the author substitute a
# citation of their own.
DEFAULT_REVIEW_NOTE = (
    "The federal share is under review: a FEMA Review Council was established "
    "in 2025 to recommend changes to the federal role in disaster response."
)

HOME_INSURANCE_NOTE = (
    "Every standard homeowners policy excludes flood, so the two halves answer "
    "different questions. For the non-flood share -- wind, hail, fire, a fallen "
    "tree -- a homeowners policy would ordinarily have paid, and IHP stepped in "
    "where private cover was absent. For the flood-damaged share it would not "
    "have: that loss needed an NFIP policy, not a homeowners one. Read the "
    "non-flood figure as the cost of missing homeowners cover, and the flood "
    "figure alongside the NFIP comparison above."
)

PA_NOTE = (
    "Public Assistance projects under Stafford Act sec. 403 (Category B, "
    "emergency protective measures) where the applicant is the state or a state "
    "agency, so the non-federal share is the state's rather than a locality's. "
    "The keyword row counts projects whose title names sheltering, hotel "
    "sheltering, or a shelter-in-home repair program; titles are free text, so "
    "it is a floor. The category row counts every Category B project with a "
    "state applicant, a ceiling for the same costs. The non-federal share is "
    "what the data shows was obligated, not the statutory 25%: it reflects any "
    "adjustment to 90% or 100% federal."
)


def pa_basis_caveat(report):
    """The derivation, spelled out wherever the figure appears."""
    if not report.pa:
        return None
    profile = report.pa.to_dict().get("federal_ratio_profile") or {}
    reading = (" Across the matched projects the federal share is a median %s of "
               "that column, which reads as %s."
               % (profile.get("median"), profile.get("reading", "").split(":")[0])
               if profile.get("median") is not None else "")
    return report.pa.options.basis_note() + reading

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
    w("%s\n\n" % FRAMING_NOTE)
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

    home = report.home_insurance
    if home:
        stats = home.all.statewide
        w("\n## Owner-occupants with no homeowners insurance\n\n")
        w("| Measure | Value |\n| --- | ---: |\n")
        for label, value in [
            ("Households (registrations)", count(stats.households)),
            ("Total IHP awarded", money(stats.ihp.total)),
            ("&nbsp;&nbsp;of which HA", money(stats.ha.total)),
            ("&nbsp;&nbsp;of which ONA", money(stats.ona.total)),
            ("Average IHP per household", money(stats.ihp.mean)),
            ("State's share of that ONA",
             money(report.options.cost_share.state_cost(
                 stats.ha.total, stats.ona.total))),
        ]:
            w("| %s | %s |\n" % (label, value))
        w("\n| Split by peril | Households | IHP total | Avg IHP |\n"
          "| --- | ---: | ---: | ---: |\n")
        for label, bucket in [
            ("**Other perils - a homeowners policy would ordinarily cover**",
             home.other_peril.statewide),
            ("Flood damage - homeowners policies exclude flood",
             home.flood_damaged.statewide),
        ]:
            w("| %s | %s | %s | %s |\n" % (
                label, count(bucket.households), money(bucket.ihp.total),
                money(bucket.ihp.mean)))
        w("\n| State cost share | Value |\n| --- | ---: |\n")
        w("| **State's share of ONA, non-flood pot only** | **%s** |\n"
          % money(report.non_flood_state_share()))
        w("| State's share across both disjoint pots | %s |\n"
          % money(report.combined_state_share()))
        w("\n_%s_\n" % HOME_INSURANCE_NOTE)

    pa = report.pa
    if pa:
        w("\n## Beyond IHP: Public Assistance sheltering, state applicants\n\n")
        w("| | Projects | Obligated | Federal | Non-federal | Share |\n"
          "| --- | ---: | ---: | ---: | ---: | ---: |\n")
        for label, totals in [("**Sheltering / shelter-in-home (keyword floor)**", pa.matched),
                              ("All Category B, state applicants", pa.category)]:
            w("| %s | %s | %s | %s | %s | %s |\n" % (
                label, count(totals.projects), money(totals.total),
                money(totals.federal), money(totals.non_federal),
                pct(totals.non_federal_share)))
        w("\n%s\n\n_%s_\n\n_%s_\n"
          % (pa_summary(report), PA_NOTE, pa_basis_caveat(report)))

    rows = report.cost_share_table()
    if rows:
        w("\n## State cost share: current law and alternatives\n\n")
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


def render_home_insurance_csv(report):
    """Per-declaration rows for the uninsured-homeowner cohort.

    Kept in its own file rather than as extra columns on the flood CSV: they
    are different cohorts over different populations, and a single wide row
    invites summing across them.
    """
    out = io.StringIO()
    writer = csv.writer(out, lineterminator="\n")
    writer.writerow([
        "state", "disaster_number", "declaration_title", "year", "households",
        "ihp_total", "ihp_mean", "ha_total", "ona_total", "ona_state_share",
        "flood_damaged_households", "flood_damaged_ihp_total",
        "other_peril_households", "other_peril_ihp_total",
        "other_peril_ha_total", "other_peril_ona_total", "other_peril_state_share",
    ])
    if not report.home_insurance:
        return out.getvalue()
    for row in report.home_insurance_rows():
        writer.writerow([
            report.state, row["disaster"], row["title"], row["year"],
            row["households"], _num(row["ihp_total"]), _num(row["ihp_mean"]),
            _num(row["ha_total"]), _num(row["ona_total"]),
            _num(row["ona_state_share"]),
            row["flood_households"], _num(row["flood_ihp_total"]),
            row["other_households"], _num(row["other_ihp_total"]),
            _num(row["other_ha_total"]), _num(row["other_ona_total"]),
            _num(row["other_state_share"]),
        ])
    home = report.home_insurance
    writer.writerow([
        report.state, "TOTAL", "All declarations in scope", "",
        home.all.statewide.households,
        _num(home.all.statewide.ihp.total), _num(home.all.statewide.ihp.mean),
        _num(home.all.statewide.ha.total), _num(home.all.statewide.ona.total),
        _num(report.options.cost_share.state_cost(
            home.all.statewide.ha.total, home.all.statewide.ona.total)),
        home.flood_damaged.statewide.households,
        _num(home.flood_damaged.statewide.ihp.total),
        home.other_peril.statewide.households,
        _num(home.other_peril.statewide.ihp.total),
        _num(home.other_peril.statewide.ha.total),
        _num(home.other_peril.statewide.ona.total),
        _num(report.non_flood_state_share()),
    ])
    return out.getvalue()


def render_pa_csv(report):
    """Every matched PA project, raw and adjusted, so it reconciles.

    Both the nominal figures straight from OpenFEMA and the inflation-adjusted
    ones are written: a reader comparing against FEMA's own CSV download needs
    the nominal columns to tie out, and the adjusted ones are what the report
    totals.
    """
    out = io.StringIO()
    writer = csv.writer(out, lineterminator="\n")
    writer.writerow([
        "state", "disaster_number", "year", "pw_number", "applicant_id", "applicant",
        "title", "category", "county",
        "projectAmount_nominal", "totalObligated_nominal",
        "federalShareObligated_nominal",
        "non_federal_basis_field", "whole_nominal", "non_federal_nominal",
        "whole_adjusted", "federal_adjusted", "non_federal_adjusted",
        "observed_federal_ratio", "dollars",
    ])
    if not report.pa:
        return out.getvalue()
    basis = report.options.deflator.label()
    for project in report.pa.projects:
        whole, federal = project["whole_nominal"], project["federal_nominal"]
        writer.writerow([
            report.state, project["disaster_number"], project["year"],
            project["pw_number"], project["applicant_id"], project["applicant"],
            project["title"], project["category"], project["county"],
            _num(project["project_amount_nominal"]),
            _num(project["total_obligated_nominal"]),
            _num(federal),
            project["basis_field"], _num(whole), _num(whole - federal),
            _num(project["whole_adjusted"]), _num(project["federal_adjusted"]),
            _num(project["non_federal_adjusted"]),
            _num(federal / whole, 4) if whole else "", basis,
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

    home = []
    for row in report.home_insurance_rows():
        home.append({
            "dr": row["disaster"], "title": row["title"], "year": row["year"],
            "households": row["households"], "ihpTotal": row["ihp_total"],
            "haTotal": row["ha_total"], "onaTotal": row["ona_total"],
            "floodHouseholds": row["flood_households"],
            "floodIhpTotal": row["flood_ihp_total"],
            "floodHaTotal": row["flood_ha_total"],
            "floodOnaTotal": row["flood_ona_total"],
            "otherHouseholds": row["other_households"],
            "otherIhpPaid": row["other_paid_households"],
            "otherIhpTotal": row["other_ihp_total"],
            "otherHaTotal": row["other_ha_total"],
            "otherOnaTotal": row["other_ona_total"],
        })

    pa_rows = [{
        "dr": r["disaster"], "year": r["year"],
        "mProjects": r["matched_projects"], "mTotal": r["matched_total"],
        "mFederal": r["matched_federal"],
        "cProjects": r["category_projects"], "cTotal": r["category_total"],
        "cFederal": r["category_federal"],
    } for r in report.pa_rows()]

    return {
        "pa": pa_rows,
        "reviewNote": getattr(report.options, "review_note", None) or DEFAULT_REVIEW_NOTE,
        "homeInsurance": home,
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


# Section 4 tiles, beside the hero figure. Flood cohort only -- the one pot
# with a public insurance payout to compare against.
GAP_SPECS = [
    ("ihpMean", "Average IHP per flooded household", "across every household in the cohort"),
    ("nfipMean", "Average paid NFIP claim", "per claim closed with a payment"),
    ("aggregateGap", "Across the flood cohort", "difference per household, times households"),
    ("stateShare", "State's share of the flood cohort's ONA",
     "already owed under the 75/25 split"),
]

# Rows of the section-1 and section-2 tables. Keyed so the page script and
# the test harness address the same cells.
POTS = [
    ("flood", "Flooded, no flood insurance"),
    ("other", "Non-flood damage, no homeowners insurance"),
    ("both", "Both pots"),
]


def _tiles(specs, lead=None):
    out = []
    for key, label, note in specs:
        out.append(
            "<div class=\"card%s\"><p class=\"label\">%s</p>"
            "<p class=\"value\" data-card=\"%s\">-</p>"
            "<p class=\"note\" data-note=\"%s\">%s</p></div>"
            % (" lead" if key == lead else "", html.escape(label), key, key,
               html.escape(note)))
    return "".join(out)


def _section(step, title, inner, intro=None, section_id=None):
    eyebrow = "<p class=\"step\">%s</p>" % html.escape(step) if step else ""
    lead = "<p class=\"intro\" id=\"%s\">%s</p>" % (intro[0], html.escape(intro[1])) \
        if intro else ""
    return ("<section%s>%s<h2>%s</h2>%s%s</section>"
            % (" id=\"%s\"" % section_id if section_id else "", eyebrow,
               html.escape(title), lead, inner))


def pa_summary(report):
    """One sentence on what the PA search found, including when it found nothing.

    Across states this block ranges from the largest number on the page to
    zero, so an empty result has to say what was searched and what turned up
    rather than render an empty table.
    """
    if not report.pa:
        return None
    pa = report.pa
    if pa.matched.projects:
        share = report.pa_share_of_ihp()
        return ("%s sheltering or shelter-in-home projects with a state applicant, "
                "%s obligated, of which %s was the non-federal share%s."
                % (count(pa.matched.projects), money(pa.matched.total),
                   money(pa.matched.non_federal),
                   " -- equal to %s of the IHP paid above" % pct(share)
                   if share else ""))
    return ("No sheltering or shelter-in-home projects with a state applicant were "
            "found. Of %s Public Assistance projects read for %s, %s were in "
            "category %s, %s of those had a state or state-agency applicant, and "
            "none of those had a title naming sheltering. Sheltering here may have "
            "run through local applicants, or not been used: `fema-flood-gap pa %s` "
            "lists the projects and their titles."
            % (count(pa.records_seen), report.state,
               count(sum(v for k, v in pa.categories.items()
                         if k[:1] == (pa.options.category or "")[:1].upper())),
               pa.options.category, count(pa.state_applicants), report.state))


def _pa_block(report):
    """The 'beyond IHP' table inside section 2: PA sheltering, state applicants."""
    e = html.escape
    if not report.pa.matched.projects:
        # Nothing to show on a page meant to make an argument. The finding is
        # not lost: the text, Markdown and JSON outputs carry what was
        # searched and what turned up, which is what a research run needs.
        return ""
    cells = ["projects", "total", "federal", "nonFederal", "share"]
    rows = []
    for tier, label in (("m", "Sheltering / shelter-in-home (keyword floor)"),
                        ("c", "All Category B, state applicants")):
        tds = "".join("<td class=\"n\" data-cell=\"pa.%s.%s\">-</td>" % (tier, key)
                      for key in cells)
        rows.append("<tr%s><td>%s</td>%s</tr>"
                    % (' class="today"' if tier == "m" else "", e(label), tds))
    return ("<h3>Beyond IHP: sheltering and shelter-in-home repairs the state "
            "co-funded</h3><p class=\"intro\" id=\"paintro\"></p>"
            "<div class=\"scroll\"><table><thead><tr><th>Public Assistance, state "
            "applicants</th><th class=\"n\">Projects</th><th class=\"n\">Obligated</th>"
            "<th class=\"n\">Federal</th><th class=\"n\">Non-federal</th>"
            "<th class=\"n\">Observed share</th></tr></thead><tbody id=\"pabody\">%s"
            "</tbody></table></div><p class=\"caption\">%s</p>"
            "<p class=\"caption\">%s</p>"
            % ("".join(rows), e(PA_NOTE), e(pa_basis_caveat(report))))


def _pot_rows(cells):
    """Table body rows for the pots: one <td data-cell="pot.key"> per cell."""
    rows = []
    for pot, label in POTS:
        tds = "".join("<td class=\"n\" data-cell=\"%s.%s\">-</td>" % (pot, key)
                      for key in cells)
        rows.append("<tr%s><td>%s</td>%s</tr>"
                    % (' class="both"' if pot == "both" else "", html.escape(label), tds))
    return "".join(rows)


def render_html(report, limit=40, alternate=None):
    """Render the page as an argument to a state, not a dashboard.

    Story order: the state already pays (both pots); what it could pay under
    other terms (both pots); what the aid amounts to next to insurance (both
    pots as aid, NFIP as the one observable insurance payout); the flood gap
    as the hero figure, scoped to flood because that is where the public
    payout record exists; the evidence; the limits. Everything recomputes in
    the browser as the year and dollar-basis controls change.
    """
    e = html.escape
    payloads = {"primary": page_payload(report)}
    if alternate is not None:
        payloads["alt"] = page_payload(alternate)
    has_home = bool(report.home_insurance)

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
        "<header><p class=\"eyebrow\">OpenFEMA analysis &middot; %s</p>" % e(report.state_name),
        "<h1>What uninsured homes cost the state after a disaster &mdash; "
        "and what insurance would have paid</h1>",
        "".join(controls),
        "<p class=\"lede\" id=\"lede\">%s</p>" % e(headline(report)),
        "<p class=\"meta\">Cohort: %s</p></header>" % e(report.options.cohort.describe()),
    ]

    # 1 -- who the state is paying for: both pots in one table
    pot_note = ("Two pots, and they do not overlap: flood damage is 1 in the first "
                "and 0 in the second, so the rows add. Standard homeowners policies "
                "exclude flood, which is why the second pot is non-flood damage only.")
    body.append(_section(
        "1 · Who the state is paying for", "Uninsured owner-occupants FEMA paid",
        "<div class=\"scroll\"><table><thead><tr><th>Households</th>"
        "<th class=\"n\">Registrations</th><th class=\"n\">Received an award</th>"
        "<th class=\"n\">FEMA IHP paid</th><th class=\"n\">of which HA</th>"
        "<th class=\"n\">of which ONA</th></tr></thead><tbody id=\"cohortbody\">%s"
        "</tbody></table></div><p class=\"caption\">%s</p>"
        % (_pot_rows(["households", "awarded", "ihpTotal", "haTotal", "onaTotal"]),
           e(pot_note)),
        intro=("framing", FRAMING_NOTE)))

    # 2 -- the state is already paying, and could pay more: both pots
    body.append(_section(
        "2 · The state is already paying", "And could pay more",
        "<div class=\"scroll\"><table><thead><tr><th>Funding arrangement</th>"
        "<th class=\"n\">Flood pot</th><th class=\"n\">Non-flood pot</th>"
        "<th class=\"n\">Both</th><th class=\"n\">vs. today</th></tr></thead>"
        "<tbody id=\"sharebody\"></tbody></table></div>"
        "<p class=\"caption\">%s</p>%s" % (
            e("Only the first row is current law. Scope: the non-federal share of ONA "
              "paid to these two pots, not the state's whole IHP caseload. "
              + COST_SHARE_NOTE),
            _pa_block(report) if report.pa else ""),
        intro=("shareintro", "")))

    # 3 -- aid versus insurance: both pots as aid, NFIP as the comparator
    def bar(row_id, label, series):
        return ("<div class=\"row\"><span class=\"cat\">%s</span>"
                "<div class=\"track\"><div class=\"bar %s\" id=\"%s\" tabindex=\"0\" "
                "role=\"img\"></div><span class=\"val\" id=\"%sVal\">-</span></div></div>"
                % (e(label), series, row_id, row_id))
    chart = (
        "<figure class=\"compare\" id=\"compare\">"
        + bar("barIhp", "FEMA IHP, average per flooded household", "s1")
        + bar("barNfip", "NFIP, average paid claim", "s2")
        + "<div class=\"legend\"><span><i class=\"sw s1\"></i>FEMA IHP &mdash; per "
        "household in the flood cohort</span><span><i class=\"sw s2\"></i>NFIP &mdash; "
        "per claim closed with a payment</span></div>"
        "<figcaption id=\"comparecaption\"></figcaption>"
        "<div class=\"tip\" id=\"tip\" role=\"status\" hidden></div>"
        "</figure>")
    body.append(_section(
        "3 · Aid versus insurance", "The aid is a band-aid; insurance is not",
        chart,
        intro=("compareintro",
               "The flood cohort, where an insurance payout can be observed. What "
               "FEMA's Individuals and Households Program paid an uninsured flooded "
               "owner-occupant, next to what the National Flood Insurance Program paid "
               "a policyholder's claim in the same state and storms. IHP was never "
               "designed to make a household whole; a policy is.")))

    # 4 -- the gap, flood only, and why
    hero = (
        "<div class=\"herowrap\"><p class=\"herolabel\">Difference per flooded household</p>"
        "<p class=\"hero\" id=\"heroGap\">-</p>"
        "<p class=\"herosub\" id=\"heroSub\"></p></div>"
        "<div class=\"cards\">%s</div>" % _tiles(GAP_SPECS))
    body.append(_section(
        "4 · The gap", "What going uninsured cost the household", hero,
        intro=("gapintro",
               "Flood cohort only. NFIP claims are public data, so an insured "
               "neighbour's payout can be observed and set beside the uninsured "
               "household's award. No equivalent public record exists for "
               "homeowners-insurance claims, so the non-flood pot appears above as a "
               "cost the state carries, but not here as a comparison.")))

    # 5 -- evidence
    body.append(_section(
        "5 · Evidence", "Every declaration",
        "<p class=\"caption\" id=\"tablecaption\"></p><div class=\"scroll\"><table>"
        "<thead><tr><th>DR</th><th>Disaster</th><th class=\"n\">Year</th>"
        "<th class=\"n\">Flood households</th><th class=\"n\">Flood IHP</th>"
        "<th class=\"n\">Avg IHP</th><th class=\"n\">State ONA share</th>"
        + ("<th class=\"n\">Non-flood households</th><th class=\"n\">Non-flood IHP</th>"
           if has_home else "")
        + "<th class=\"n\">NFIP claims</th><th class=\"n\">Avg NFIP paid</th>"
        "<th class=\"n\">Gap / household</th></tr></thead>"
        "<tbody id=\"tablebody\"></tbody></table></div>"))

    # 6 -- the reading, and the limits
    limits = [
        "IHP counts are registrations, which FEMA treats as households; a household "
        "that registers for two disasters appears once per disaster.",
        "IHP equals HA plus ONA. They are components of one award, not three.",
        "A standard homeowners policy excludes flood. The non-flood pot is damage "
        "such a policy would ordinarily have covered; flood damage belongs with the "
        "NFIP comparison, not with homeowners cover.",
        "NFIP averages are per claim from insured properties and include building, "
        "contents, and increased-cost-of-compliance payments. Claims closed without "
        "payment are counted separately, so the average is not quietly inflated.",
        "The two programs are not equivalents. IHP is capped disaster aid for "
        "essential needs; NFIP is an indemnity policy paying up to the limit "
        "purchased. Policyholders chose to insure, so they are not a random draw "
        "from the uninsured population.",
        "Read the difference as the scale of what insurance covers and aid does "
        "not -- not as a forecast of what any particular household would have "
        "received.",
    ]
    body.append(_section(
        "", "What this shows, and what it does not",
        "<p class=\"reading\" id=\"reading\"></p><ul class=\"limits\">%s</ul>"
        % "".join("<li>%s</li>" % e(item) for item in limits)))

    if report.warnings:
        body.append(_section("", "Notes on this run",
                             "<ul class=\"limits\">%s</ul>"
                             % "".join("<li>%s</li>" % e(w) for w in report.warnings)))

    sources = "; ".join("%s" % v for v in report.vintage.values())
    body.append("<footer><p id=\"footerbasis\">%s</p><p>Source: OpenFEMA %s. "
                "Generated %s.</p></footer>"
                % (e(basis_text + "."), e(sources), e(report.generated)))

    config = {
        "payloads": payloads,
        "hasAlternate": alternate is not None,
        "hasHome": has_home,
        "hasPa": bool(report.pa and report.pa.matched.projects),
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

  function byId(id) { return document.getElementById(id); }
  function setText(id, text) { var n = byId(id); if (n) n.textContent = text; }
  function setCell(key, text) {
    document.querySelectorAll('[data-cell="' + key + '"]').forEach(function (n) {
      n.textContent = text;
    });
  }

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
  function pct(value, digits) {
    return value === null || value === undefined ? 'n/a'
      : (value * 100).toFixed(digits || 0) + '%';
  }
  function households(n) {
    return count(n) + (Math.round(n) === 1 ? ' household' : ' households');
  }
  function times(ratio) {
    if (ratio === null || ratio === undefined || !isFinite(ratio)) return 'n/a';
    return (ratio >= 10 ? ratio.toFixed(0) : ratio.toFixed(1)) + ' times';
  }

  function activePayload() {
    return showingPrimary || !config.hasAlternate
      ? config.payloads.primary : config.payloads.alt;
  }

  /* All years means "no filter", which is the only setting that can include
     declarations with no date -- they cannot be placed on the timeline. */
  function showingAllYears() {
    return !config.years.length || !isFinite(since) || since === config.years[0];
  }
  function periodPhrase() {
    return showingAllYears() ? '' : ' since ' + since;
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

  /* The non-flood pot: owner-occupants with no homeowners policy whose
     damage was not flood. Disjoint from the flood cohort, so it can be added
     to it without counting a household twice. */
  function otherPot(payload) {
    var rows = (payload.homeInsurance || []).filter(function (d) {
      return showingAllYears() || (d.year && d.year >= since);
    });
    var sum = {households: 0, ihpPaid: 0, ihpTotal: 0, haTotal: 0, onaTotal: 0,
               byDr: {}};
    rows.forEach(function (d) {
      sum.households += d.otherHouseholds;
      sum.ihpPaid += d.otherIhpPaid || 0;
      sum.ihpTotal += d.otherIhpTotal;
      sum.haTotal += d.otherHaTotal || 0;
      sum.onaTotal += d.otherOnaTotal || 0;
      sum.byDr[d.dr] = d;
    });
    var today = payload.scenarios[0];
    sum.ihpMean = sum.households ? sum.ihpTotal / sum.households : null;
    sum.stateShare = sum.onaTotal * today.ona + sum.haTotal * today.ha;
    return sum;
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
    sum.ratio = (nfip.mean === null || !sum.ihpMean) ? null : nfip.mean / sum.ihpMean;
    sum.awardedShare = sum.households ? sum.ihpPaid / sum.households : null;
    sum.other = config.hasHome ? otherPot(payload) : null;
    sum.combinedShare = sum.stateShare + (sum.other ? sum.other.stateShare : 0);
    return sum;
  }

  /* PA sheltering with a state applicant: the keyword floor (m) and the
     all-category-B ceiling (c), summed over the declarations in range. */
  function paTotals(payload) {
    var sum = {m: {projects: 0, total: 0, federal: 0},
               c: {projects: 0, total: 0, federal: 0}};
    (payload.pa || []).forEach(function (r) {
      if (!showingAllYears() && !(r.year && r.year >= since)) return;
      sum.m.projects += r.mProjects; sum.m.total += r.mTotal; sum.m.federal += r.mFederal;
      sum.c.projects += r.cProjects; sum.c.total += r.cTotal; sum.c.federal += r.cFederal;
    });
    return sum;
  }

  function renderPa(payload) {
    if (!config.hasPa || !byId('pabody')) return;
    var sum = paTotals(payload);
    ['m', 'c'].forEach(function (tier) {
      var t = sum[tier];
      var non = t.total - t.federal;
      setCell('pa.' + tier + '.projects', count(t.projects));
      setCell('pa.' + tier + '.total', money(t.total));
      setCell('pa.' + tier + '.federal', money(t.federal));
      setCell('pa.' + tier + '.nonFederal', money(non));
      /* One decimal: this is the share actually obligated, and 10.0% vs
         12.7% is the difference between a 90/10 event and a mix. */
      setCell('pa.' + tier + '.share', t.total ? pct(non / t.total, 1) : 'n/a');
    });
    var non = sum.m.total - sum.m.federal;
    if (!sum.m.projects) {
      setText('paintro',
        'No sheltering or shelter-in-home projects with a state applicant fall ' +
        'in this range. Sheltering may have run through local applicants, or ' +
        'not been used.');
      return;
    }
    setText('paintro',
      'IHP is not the only line. Sheltering displaced households in hotels and ' +
      'shelters, and shelter-in-home repair programs, run through Public ' +
      'Assistance with a non-federal share. Where the state itself was the ' +
      'applicant' + periodPhrase() + ', ' + count(sum.m.projects) +
      ' projects whose titles name sheltering were obligated at ' +
      money(sum.m.total) + ', of which ' + money(non) +
      ' was the state\u2019s share as actually obligated. That is a floor: ' +
      'titles are free text, and the wider category-B row bounds it from above.');
  }

  function costFor(scenario, haTotal, onaTotal) {
    return onaTotal * scenario.ona + haTotal * scenario.ha;
  }

  function renderCohortTable(sum) {
    var other = sum.other || {households: 0, ihpPaid: 0, ihpTotal: 0, haTotal: 0,
                              onaTotal: 0};
    var bothHouseholds = sum.households + other.households;
    setCell('flood.households', count(sum.households));
    setCell('flood.awarded', pct(sum.awardedShare));
    setCell('flood.ihpTotal', money(sum.ihpTotal));
    setCell('flood.haTotal', money(sum.haTotal));
    setCell('flood.onaTotal', money(sum.onaTotal));
    setCell('other.households', count(other.households));
    setCell('other.awarded',
      pct(other.households ? other.ihpPaid / other.households : null));
    setCell('other.ihpTotal', money(other.ihpTotal));
    setCell('other.haTotal', money(other.haTotal));
    setCell('other.onaTotal', money(other.onaTotal));
    setCell('both.households', count(sum.households + other.households));
    setCell('both.awarded',
      pct(bothHouseholds ? (sum.ihpPaid + other.ihpPaid) / bothHouseholds : null));
    setCell('both.ihpTotal', money(sum.ihpTotal + other.ihpTotal));
    setCell('both.haTotal', money(sum.haTotal + other.haTotal));
    setCell('both.onaTotal', money(sum.onaTotal + other.onaTotal));
  }

  function renderShare(payload, sum) {
    var other = sum.other || {haTotal: 0, onaTotal: 0};
    var todayBoth = costFor(payload.scenarios[0], sum.haTotal + other.haTotal,
                            sum.onaTotal + other.onaTotal);
    var body = byId('sharebody');
    if (body) {
      body.innerHTML = payload.scenarios.map(function (scenario, index) {
        var flood = costFor(scenario, sum.haTotal, sum.onaTotal);
        var non = costFor(scenario, other.haTotal, other.onaTotal);
        var both = flood + non;
        var multiple = index === 0 ? '&mdash;'
          : (todayBoth ? (both / todayBoth).toFixed(1) + '&times;' : 'n/a');
        return '<tr' + (index === 0 ? ' class="today"' : '') + '><td>' +
          scenario.label +
          (scenario.note ? ' <span class="sub">' + scenario.note + '</span>' : '') +
          '</td><td class="n">' + money(flood) + '</td>' +
          '<td class="n">' + (sum.other ? money(non) : 'n/a') + '</td>' +
          '<td class="n" data-cell="both.scenario' + index + '">' + money(both) + '</td>' +
          '<td class="n">' + multiple + '</td></tr>';
      }).join('');
    }
    setText('shareintro',
      'Under current law the state funds a quarter of every Other Needs ' +
      'Assistance award; Housing Assistance is fully federal. Across both pots' +
      periodPhrase() + ' that share is ' + money(sum.combinedShare) + ' today. ' +
      payload.reviewNote + ' If the split moves toward the states, or IHP is ' +
      'curtailed, the same caseload lands on ' + payload.stateName + '. FEMA does ' +
      'not pay for what insurance covers, so coverage takes most of this liability ' +
      'off the state\\u2019s ledger and the federal one alike.');
  }

  /* Bars on one baseline: aid per household in each pot, then the one
     insurance payout that is public. Labels sit outside the bar end; the
     longest bar is capped short of the track so its label always fits. */
  function renderChart(sum) {
    var ihp = byId('barIhp'), nfip = byId('barNfip'), other = byId('barIhpOther');
    if (!ihp || !nfip) return;
    var otherMean = sum.other ? sum.other.ihpMean : null;
    var max = Math.max(sum.ihpMean || 0, otherMean || 0, sum.nfipMean || 0);
    function width(value) {
      return max > 0 && value ? Math.max(0.6, value / max * 78) + '%' : '0.6%';
    }
    ihp.style.width = width(sum.ihpMean);
    nfip.style.width = width(sum.nfipMean);
    setText('barIhpVal', money(sum.ihpMean));
    setText('barNfipVal', money(sum.nfipMean));
    ihp.setAttribute('aria-label', 'FEMA IHP, flood pot, average per household: ' +
      money(sum.ihpMean));
    nfip.setAttribute('aria-label', 'NFIP, average paid claim: ' + money(sum.nfipMean));
    ihp.dataset.tip = money(sum.ihpMean) + ' - FEMA IHP, averaged over all ' +
      count(sum.households) + ' flooded households, including those paid nothing';
    nfip.dataset.tip = money(sum.nfipMean) + ' - NFIP, averaged over ' +
      count(sum.nfip.paidClaims) + ' claims closed with a payment';
    if (other) {
      other.style.width = width(otherMean);
      setText('barIhpOtherVal', money(otherMean));
      other.setAttribute('aria-label',
        'FEMA IHP, non-flood pot, average per household: ' + money(otherMean));
      other.dataset.tip = money(otherMean) + ' - FEMA IHP, averaged over ' +
        count(sum.other.households) + ' households with no homeowners policy and ' +
        'non-flood damage';
    }
    var caption = sum.ratio === null ? ''
      : 'The insured flood claim averaged ' + times(sum.ratio) +
        ' the uninsured flooded household\\u2019s aid award' + periodPhrase() + '.';
    setText('comparecaption', caption);
  }

  function renderHero(payload, sum) {
    setText('heroGap', money(sum.gap));
    var sub = sum.gap === null ? 'No NFIP figure to compare against.'
      : 'Average paid NFIP claim ' + money(sum.nfipMean) + ' minus average IHP award ' +
        money(sum.ihpMean) + '. Across ' + households(sum.households) +
        periodPhrase() + ', ' + money(sum.aggregateGap) + '.';
    setText('heroSub', sub);
  }

  function renderCards(sum) {
    var values = {
      ihpMean: money(sum.ihpMean),
      nfipMean: money(sum.nfipMean),
      aggregateGap: money(sum.aggregateGap),
      stateShare: money(sum.stateShare)
    };
    /* The two sides are filtered on different date fields -- declarations by
       their year, claims by date of loss -- so the note says which. */
    var notes = {
      nfipMean: 'across ' + count(sum.nfip.paidClaims) + ' paid claims' +
        (showingAllYears() ? '' : ' with a date of loss from ' + since + ' onward'),
      ihpMean: 'across all ' + count(sum.households) + ' households in the flood cohort',
      aggregateGap: money(sum.gap) + ' per household across ' +
        count(sum.households) + ' households'
    };
    document.querySelectorAll('[data-card]').forEach(function (node) {
      var key = node.getAttribute('data-card');
      if (key in values) node.textContent = values[key];
    });
    document.querySelectorAll('[data-note]').forEach(function (node) {
      var key = node.getAttribute('data-note');
      if (notes[key]) node.textContent = notes[key];
    });
  }

  function renderTable(payload, sum) {
    var body = byId('tablebody');
    if (!body) return;
    var rows = sum.rows.slice().sort(function (a, b) {
      return b.ihpTotal - a.ihpTotal;
    }).slice(0, config.limit);
    var today = payload.scenarios[0];
    var byDr = sum.other ? sum.other.byDr : {};
    body.innerHTML = rows.map(function (d) {
      var mean = d.households ? d.ihpTotal / d.households : null;
      var nfipMean = d.nfipPaidClaims ? d.nfipTotal / d.nfipPaidClaims : null;
      var gap = (nfipMean === null || mean === null) ? null : nfipMean - mean;
      var home = byDr[d.dr];
      var homeCells = !config.hasHome ? '' :
        '<td class="n">' + count(home ? home.otherHouseholds : 0) + '</td>' +
        '<td class="n">' + money(home ? home.otherIhpTotal : 0) + '</td>';
      return '<tr><td>' + d.dr + '</td><td>' + d.title + '</td>' +
        '<td class="n">' + (d.year || '') + '</td>' +
        '<td class="n">' + count(d.households) + '</td>' +
        '<td class="n">' + money(d.ihpTotal) + '</td>' +
        '<td class="n">' + money(mean) + '</td>' +
        '<td class="n">' + money(d.onaTotal * today.ona + d.haTotal * today.ha) + '</td>' +
        homeCells +
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
    setText('tablecaption', scope + note + '. Dollar columns: ' +
      payload.basis.split(' - ')[0] + '. NFIP columns are claims matched to ' +
      'each declaration\\u2019s own incident window.');
  }

  function renderLede(payload, sum) {
    var text = payload.stateName + ' already pays for uninsured homes. Under ' +
      'current law the state funds a quarter of every Other Needs Assistance award; ';
    if (sum.other && sum.other.households) {
      text += 'across ' + count(sum.households) + ' owner-occupant households that ' +
        'flooded without flood insurance and ' + count(sum.other.households) +
        ' more with no homeowners insurance and non-flood damage' + periodPhrase() +
        ', that has come to ' + money(sum.combinedShare) + ' of the ' +
        money(sum.ihpTotal + sum.other.ihpTotal) + ' FEMA paid out.';
    } else {
      text += 'on the ' + count(sum.households) + ' owner-occupant households that ' +
        'flooded without flood insurance' + periodPhrase() + ', that has come to ' +
        money(sum.stateShare) + ' of the ' + money(sum.ihpTotal) + ' FEMA paid out.';
    }
    if (sum.nfipMean !== null && sum.ihpMean) {
      text += ' The flooded households averaged ' + money(sum.ihpMean) +
        ' from FEMA. Insured neighbours filing NFIP claims over the same period ' +
        'averaged ' + money(sum.nfipMean) + ' \\u2014 ' + times(sum.ratio) +
        ' as much. Coverage takes the liability off the state, and pays the ' +
        'homeowner ' + money(sum.gap) + ' more.';
    } else {
      text += ' The flooded households averaged ' + money(sum.ihpMean) + ' from FEMA.';
    }
    setText('lede', text);
  }

  function renderReading(payload, sum) {
    if (sum.gap === null) {
      setText('reading', 'Without an NFIP figure for this range there is no ' +
        'comparison to draw.');
      return;
    }
    var both = sum.other && sum.other.households
      ? ' Add the non-flood pot \\u2014 damage a homeowners policy would ordinarily ' +
        'have covered \\u2014 and the state\\u2019s current-law share across both is ' +
        money(sum.combinedShare) + '.'
      : '';
    setText('reading',
      'For an uninsured owner-occupant in ' + payload.stateName + ' whose home ' +
      'flooded' + periodPhrase() + ', federal aid averaged ' + money(sum.ihpMean) +
      '. A paid flood-insurance claim over the same period averaged ' +
      money(sum.nfipMean) + ', ' + times(sum.ratio) + ' as much. Aid and ' +
      'insurance are not one-for-one substitutes \\u2014 a claim depends on the ' +
      'coverage bought, and IHP is capped assistance for essential needs \\u2014 ' +
      'but the size of that difference is the size of what a policy covers and ' +
      'aid does not.' + both + ' The federal role is under review. If the ' +
      'state\\u2019s share rises, or the program is curtailed, the cost of going ' +
      'uninsured moves further onto the household and the state \\u2014 and ' +
      'insurance is the one arrangement under which all three ledgers improve.');
  }

  function render() {
    var payload = activePayload();
    var sum = totals(payload);
    renderCohortTable(sum);
    renderShare(payload, sum);
    renderPa(payload);
    renderChart(sum);
    renderHero(payload, sum);
    renderCards(sum);
    renderTable(payload, sum);
    renderLede(payload, sum);
    renderReading(payload, sum);

    var basis = byId('basis');
    if (basis) {
      basis.textContent = payload.basis;
      basis.className = 'basis ' + payload.basisClass;
    }
    setText('footerbasis', payload.basis + '.');

    var toggle = byId('toggle');
    if (toggle) {
      toggle.textContent = 'Show ' + (showingPrimary
        ? config.altShortBasis : config.primaryShortBasis);
    }
    var label = byId('sincelabel');
    if (label) label.textContent = showingAllYears() ? 'all years' : since;
  }

  /* Bar hover/focus: the mark is the hit target, the tooltip carries the
     denominator the label leaves out. */
  var tip = byId('tip');
  ['barIhp', 'barIhpOther', 'barNfip'].forEach(function (id) {
    var bar = byId(id);
    if (!bar || !tip) return;
    function show() {
      tip.textContent = bar.dataset.tip || '';
      tip.hidden = false;
      bar.classList.add('hot');
    }
    function hide() { tip.hidden = true; bar.classList.remove('hot'); }
    bar.addEventListener('pointerenter', show);
    bar.addEventListener('focus', show);
    bar.addEventListener('pointerleave', hide);
    bar.addEventListener('blur', hide);
  });

  var toggle = byId('toggle');
  if (toggle) {
    toggle.addEventListener('click', function () {
      showingPrimary = !showingPrimary;
      render();
    });
  }
  var slider = byId('since');
  if (slider) {
    slider.addEventListener('input', function () {
      since = Number(slider.value);
      render();
    });
    var reset = byId('resetyears');
    if (reset) reset.addEventListener('click', function () {
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
--warn:#8a5200;--warn-soft:#fdf1de;
--series-1:#2a78d6;--series-2:#eb6834;--axis:#c3c2b7}
@media (prefers-color-scheme:dark){:root{--bg:#161513;--panel:#211f1d;--ink:#f2efea;
--muted:#a8a29b;--line:#35322e;--accent:#4cc39c;--accent-soft:#1e2f2a;
--warn:#e0a458;--warn-soft:#332818;
--series-1:#3987e5;--series-2:#d95926;--axis:#4a4742}}
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
tr.both td{font-weight:650;border-top:2px solid var(--axis)}
.sub{display:block;font-weight:400;font-size:12px;color:var(--muted);
white-space:normal;max-width:44ch}
.meta{margin:0;font-size:13px;color:var(--muted);max-width:80ch}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px;
margin-top:32px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:18px}
.card.lead{border-color:var(--accent);box-shadow:inset 3px 0 0 var(--accent)}
#hosection .cards{margin-top:6px;margin-bottom:14px}
.card .label{margin:0;font-size:12px;text-transform:uppercase;letter-spacing:.06em;
color:var(--muted)}
.card .value{margin:8px 0 6px;font-size:28px;font-weight:650;letter-spacing:-.02em}
.step{margin:0 0 6px;font-size:12px;letter-spacing:.1em;text-transform:uppercase;
color:var(--muted);font-weight:600}
section{margin-top:44px}section h2{margin:0 0 10px}
section h3{margin:22px 0 8px;font-size:15px;letter-spacing:-.01em}
.intro{margin:0 0 16px;font-size:16px;max-width:72ch}.intro:empty{display:none}
.herowrap{margin:4px 0 18px}
.herolabel{margin:0;font-size:13px;text-transform:uppercase;letter-spacing:.06em;
color:var(--muted)}
.hero{margin:4px 0 6px;font-size:56px;line-height:1.05;font-weight:700;
letter-spacing:-.03em}
.herosub{margin:0;font-size:15px;color:var(--muted);max-width:70ch}
.compare{margin:0;padding:18px 18px 14px;background:var(--panel);
border:1px solid var(--line);border-radius:12px;position:relative}
.compare .row{display:grid;grid-template-columns:minmax(160px,220px) 1fr;
gap:12px;align-items:center;margin:0 0 12px}
.compare .cat{font-size:13px;color:var(--muted)}
.compare .track{display:flex;align-items:center;gap:10px;
border-left:1px solid var(--axis);padding-left:2px;min-height:26px}
.compare .bar{height:22px;border-radius:0 4px 4px 0;transition:width .25s;
cursor:default;outline:none}
.compare .bar.s1{background:var(--series-1)}.compare .bar.s2{background:var(--series-2)}
.compare .bar.hot,.compare .bar:focus-visible{filter:brightness(1.12);
box-shadow:0 0 0 2px var(--panel),0 0 0 3px var(--accent)}
.compare .val{font-size:14px;font-weight:650;white-space:nowrap}
.legend{display:flex;gap:18px;flex-wrap:wrap;margin:6px 0 8px;font-size:13px;
color:var(--muted)}
.legend .sw{display:inline-block;width:12px;height:12px;border-radius:2px;
margin-right:6px;vertical-align:-1px}
.legend .sw.s1{background:var(--series-1)}.legend .sw.s2{background:var(--series-2)}
.compare figcaption{font-size:14px;color:var(--ink);margin:0}
.tip{position:absolute;left:18px;right:18px;bottom:-4px;transform:translateY(100%%);
background:var(--ink);color:var(--bg);font-size:13px;padding:8px 12px;
border-radius:8px;z-index:2;max-width:60ch}
.reading{font-size:16px;max-width:72ch;margin:0 0 14px}
.limits{padding-left:20px;max-width:80ch}.limits li{margin-bottom:6px;font-size:14px;
color:var(--muted)}
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
    "home-insurance-csv": render_home_insurance_csv,
    "pa-csv": render_pa_csv,
    "html": render_html,
}


def render(report, fmt, limit=25, alternate=None):
    renderer = RENDERERS.get(fmt)
    if renderer is None:
        raise ValueError("unknown format %r (choose from %s)"
                         % (fmt, ", ".join(sorted(RENDERERS))))
    if fmt in ("json", "csv", "home-insurance-csv", "pa-csv"):
        return renderer(report)
    if fmt == "html":
        return renderer(report, limit, alternate)
    return renderer(report, limit)
