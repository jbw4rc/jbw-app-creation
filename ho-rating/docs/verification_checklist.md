# Verifying a draft rating plan

A draft from `extract.py` is a machine's best guess at what a filing says. This
checklist is how it becomes something you can quote from. Work it **table by
table with the PDF open**, not by skimming the YAML.

The engine enforces some of this for you. It will refuse to load a plan that
cites no page, refuse to rate a plan still carrying the `UNVERIFIED` marker, and
refuse to invent a factor it cannot look up. It cannot tell you that 1.230 should
have been 1.320.

Budget roughly an hour per carrier for a first filing. The tables go quickly;
the rating *sequence* is what takes the time.

---

## 0. Before you start

- [ ] The PDF under `data/filings/{state}/{carrier}/` is the **rate/rule** filing,
      not the forms filing or the actuarial memorandum. A filing package often
      contains all three and only one of them has the tables.
- [ ] `filing_source.filename` matches it, and `sha256` is set if you want to be
      able to prove later which document you read.
- [ ] `serff_tracking`, `naic`, `state` and `effective_date` match the filing's
      own cover sheet — not the SERFF submission date, which is usually earlier.
- [ ] Check for a **superseding filing**. If one exists, set `expiration_date`
      on this plan to the later filing's effective date, or as-of-date rating
      will quietly use a stale plan.

## 1. The rating sequence — do this first

Everything else is arithmetic; this is where wrong answers come from. The draft's
step order is *page order*, which is almost never rating order.

- [ ] Find the rule that states the order of calculation. It is usually called
      "Premium Determination", "Order of Calculation", or is the first rule in
      the manual. Quote it into `notes`.
- [ ] Reorder `steps` to match. Check specifically:
  - [ ] Which factors apply to the **base premium** and which apply to a
        **subtotal after other factors**. These are not the same and the
        difference compounds.
  - [ ] Whether any factor applies to only *part* of the premium (a common one:
        a deductible credit that applies to Coverage A premium but not to the
        liability portion). The current schema cannot express this — see
        NOTES.md. Flag it rather than approximating.
- [ ] **Rounding.** Where does the filing round, and to what?
  - [ ] Once at the end, or after every factor? Insert a `round` step at each
        point the filing rounds. This genuinely changes the answer: on the
        sample plan the two conventions differ on 114 of 201 coverage amounts.
  - [ ] To the dollar or the cent? (`to: 1` vs `to: 0.01`)
  - [ ] Half-up or half-even? Filings rarely say. If it doesn't, note the
        assumption and let the worksheet decide it for you.
- [ ] **Minimum premium** — is it a floor on the total, or per-coverage? Where in
      the sequence does it bite: before or after optional coverage charges?
- [ ] **Order of additive charges** relative to caps and floors.

## 2. Territory

- [ ] `basis` is right: ZIP, ZIP+4, county, town, or statewide. Connecticut
      filings often use town, which is **not** derivable from a ZIP.
- [ ] Every territory referenced by a base-rate segment exists in the territory
      table, and vice versa. An orphan on either side means a missed page.
- [ ] The ZIP list is complete. Territory pages run long and are easy to
      truncate at a page break — count the entries against the filing.
- [ ] Split ZIPs: does the filing assign one ZIP to two territories by street
      range or ZIP+4? If so, the `zip` basis is wrong and a 5-digit lookup will
      silently pick one.
- [ ] You did **not** copy this table from another carrier's plan. Carriers
      number territories differently and assign the same ZIP differently.

## 3. Base rates

- [ ] `interpolation` matches what the filing says, verbatim:
  - `per_1000` — "plus $X for each additional $1,000"
  - `linear` — "interpolate between the amounts shown"
  - `step` — "use the next lower amount shown"
  - `exact` — the filing rates only the listed amounts
- [ ] For `per_1000`, `add_per_1000` is the rate that applies **above** each
      breakpoint, not below it. Off-by-one here is easy and produces errors of
      a few percent that look plausible.
- [ ] `below_min` and `above_max` reflect the filing's actual instruction. The
      safe default is `error`. Only set `per_1000` or `clamp` where the filing
      states a rule, and set `max_amount` to any stated referral threshold.
- [ ] Spot-check three breakpoints per segment against the PDF, including the
      first and the last row — those are where page breaks cut tables.
- [ ] Segment keys cover every combination the filing prints. A missing cell
      raises `NoMatchError` at rate time rather than defaulting, but only if you
      actually rate a risk that hits it.

## 4. Factor tables

For each table:

- [ ] **Lookup semantics.** This is the one most likely to be silently wrong:
  - `1 - 4` / `0 to 5` → `band`, and decide `bounds`
  - `$200,000 to $249,999` → `band`, `closed` (the filing spelled out the edges)
  - `$200,000 to $250,000` on consecutive rows → `band`, `half_open`
  - `20 years or older` → open top band, `{min: 20}`
  - a column of values each meaning "this or higher" → `nearest_below`, **not**
    a band
  - a bare list → `exact`
  If the filing doesn't say, say so in the table's `source.note`. Do not guess
  silently.
- [ ] **Bands do not overlap and leave no gaps.** An overlap raises
      `AmbiguousMatchError` when a risk lands on it; a gap raises `NoMatchError`.
      Better to find both here. Walk the boundaries: if one row ends at 10 and
      the next starts at 11, `closed` is right; if the next starts at 10,
      `half_open` is right.
- [ ] **Defaults.** `default` is set **only** where the filing prints an explicit
      "all other" row, and `default_source` cites that row's page. If you were
      tempted to add a 1.00 default to make something work, stop: the risk is
      either out of appetite or you are missing a row.
- [ ] Every value re-read against the PDF. Transposed digits (1.230 vs 1.320)
      are the classic error and no test will catch them except a worksheet.
- [ ] `source.page` is the page you actually read it from.
- [ ] Delete `confidence` from each table as you confirm it. Anything still
      carrying a `confidence` line has not been checked.
- [ ] Delete the `_evidence` and `_extracted_rows` scratch keys once used — the
      schema rejects them, so the plan will not load until you do.

## 5. Forms and appetite

- [ ] `forms_supported` lists **only** the forms this filing actually rates. If
      the manual has no HO-2 table, HO-2 must not appear here: the engine will
      answer "not written", which is the correct answer.
- [ ] `occupancy_supported` matches. Owner-occupied only is the common case;
      tenant-occupied and seasonal are usually separate programs with separate
      rates.
- [ ] Underwriting eligibility rules that are *not* rating rules (maximum age of
      roof, prior-claims limits, coastal distance) are noted in `notes`. The
      engine will happily rate a risk the carrier would decline.

## 6. Worksheets — the plan is not done until these pass

- [ ] Every worked example in the filing is encoded as a `worksheets:` entry.
      They are usually in an appendix and titled "Example", "Illustration", or
      "Sample Rating".
- [ ] The example's printed inputs are mapped onto `PropertyRisk` field names,
      and anything the example assumes silently (a deductible, a form, a
      territory) is made explicit.
- [ ] `expected_premium` is the filing's own printed total, to the cent.
- [ ] `expected_steps` pins the running premium after each step the example
      prints, so a failure names the step that diverged instead of the total.
- [ ] `python -m src.cli validate --plans plans/` passes.

If a worksheet is off by a few dollars, the usual causes in order of likelihood:
rounding in the wrong place; a factor applied to the wrong subtotal; the steps in
the wrong order; a transposed digit. If it is off by a lot, a whole step is
missing or a lookup matched the wrong row — run with `--trace` and read down.

**If the filing contains no worked example**, say so in `verification.notes` and
treat every number this plan produces as unconfirmed. You have transcribed
tables; you have not confirmed a sequence.

## 7. Sign-off

- [ ] `verification.status: verified`, with `verified_by` and `verified_on`.
- [ ] Delete the `UNVERIFIED: true` line and the banner comment.
- [ ] Move the file from wherever you drafted it into `plans/`.
- [ ] `python -m src.cli plans --plans plans/` shows it without a `[DRAFT]` mark.
- [ ] `python -m pytest` passes — the worksheet suite picks up new plans in
      `plans/` automatically.
