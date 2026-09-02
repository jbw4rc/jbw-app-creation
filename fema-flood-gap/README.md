# fema-flood-gap

For one state, pull the OpenFEMA record of what FEMA paid **homeowners who
flooded without flood insurance**, and set it next to what the **NFIP paid its
policyholders** in the same state and, where the dates line up, the same storm.

The question it answers: *here is what uninsured flooded owners in this state
actually received from federal disaster aid, and here is what an NFIP policy
was paying out over the same period.* The difference is the cost of going
uninsured — which matters more, not less, if IHP is curtailed.

Standard library only. No `pip install`, no API key, no database.

```
./fema-flood-gap LA
```

## What it produces

```
FEMA IHP -- OWNER, FLOOD DAMAGE, NO FLOOD INSURANCE
  Households (registrations)                   184,203
  Households awarded IHP                       141,880 (77.0%)
  Total IHP awarded                            $1,204,331,905
    of which Housing Assistance (HA)             $986,110,442
    of which Other Needs Assistance (ONA)        $218,221,463
  Average IHP per household                    $6,538
  Average IHP per awarded household            $8,488
  ...
THE GAP
  Average NFIP payout per paid claim           $64,905
  Average IHP award per cohort household       $6,538
  Difference per household                     $58,367
  Aggregate difference across cohort           $10,751,120,301
```

*(Shape of the output, not real figures — run it for your state.)*

Plus a per-declaration table: for every DR number, the household count, IHP /
HA / ONA totals and averages, the NFIP claims filed for that same storm, and
the per-household gap.

Output formats: `text` (default), `md`, `html` (a self-contained, printable
page for sharing), `csv` (a row per declaration, for a spreadsheet), `json`
(everything, including the schema bindings and rejection counts).

## Usage

```bash
./fema-flood-gap LA                                  # whole history, plain text
./fema-flood-gap Texas --since 2005 --adjust-to 2025 # constant dollars
./fema-flood-gap NC --flood-declarations-only --nfip-owner-occupied
./fema-flood-gap NJ --disaster 4086 --format md -o sandy.md
./fema-flood-gap FL --bundle out/fl                  # every format at once
./fema-flood-gap schema                              # how fields resolved
./fema-flood-gap values MS                           # what a column contains
./fema-flood-gap cache info                          # what has been downloaded
```

To install it as a command instead of running from the checkout:
`pip install -e .` then `fema-flood-gap LA`.

### Scope

| Flag | Effect |
| --- | --- |
| `--since` / `--until YEAR` | restrict to declarations in that year range |
| `--disaster N` | one disaster number (repeatable) |
| `--incident-type Flood` | restrict by declaration incident type (repeatable) |
| `--flood-declarations-only` | shorthand for the water-related incident types |

### Cohort definition

The default cohort is **owner-occupant, FEMA-verified flood damage, no flood
insurance**. Each part is adjustable, because each is a judgement call:

| Flag | Effect |
| --- | --- |
| `--include-renters` | drop the owner-occupant restriction |
| `--flood-basis damage\|water\|any` | flood-damage flag (default), a recorded water level, or either |
| `--unknown-insurance exclude\|uninsured\|insured` | how to treat registrations with no flood-insurance value (default: exclude) |
| `--primary-residence-only` | drop second homes and rentals-out |

`--unknown-insurance` is the one worth thinking about. Some registrations have
no flood-insurance value recorded at all. Excluding them (the default) gives a
clean but conservative cohort; counting them as uninsured gives an upper bound.
Running it both ways brackets the answer, and the report always shows how many
records sit in that bucket.

### NFIP claim selection

| Flag | Effect |
| --- | --- |
| `--nfip-owner-occupied` | single-family / owner-occupied dwellings only — the closest analogue to an IHP owner-occupant, and the more honest comparison |
| `--nfip-primary-residence` | primary residences only |
| `--nfip-since` / `--nfip-until` | loss-year range (defaults to the declaration year range) |
| `--match-buffer-days N` | widen each incident window when matching claims to a storm (default 3) |

### Speed

The slow part is the "how big is that cohort" block: five counts, each of
which makes OpenFEMA scan the whole 26-million-row registration table.
`--skip-context` drops them and the rest of the report is unaffected. Every
response is cached, so only the first run for a state pays for them.

### The uninsured-homeowner cohort

A second cohort runs alongside the flood one: **owner-occupants carrying no
homeowners insurance at all**, whether or not the damage was flood. It is
reported split in two, because a homeowners policy excludes flood:

- **Other perils** -- wind, hail, fire, a fallen tree. A homeowners policy
  would ordinarily have paid; IHP stepped in where private cover was absent.
  This is the half that supports "insurance should have covered this".
- **Flood damage** -- a homeowners policy would *not* have paid. That loss
  needed an NFIP policy, and belongs with the flood comparison instead.

Presenting the blended total as an insurance gap overstates it, which is why
the tool never shows one without both halves beside it.

The non-flood half is where the state's exposure shows up a second time. It
gets its own state-share figure and scenario ladder, and because it is
disjoint from the flood cohort (flood damage is 0 here and 1 there), the two
current-law shares are added into one figure: the state's liability across
both pots. That sum is stated in the cost-share section and in the JSON as
`combined_state_share_both_pots`. The cohort lands in
its own CSV (`uninsured-homeowners.csv`) rather than as extra columns on the
flood file, since the two overlap and must not be summed.

| Flag | Effect |
| --- | --- |
| `--skip-home-insurance` | omit the cohort entirely |
| `--home-insurance-unknown uninsured` | count registrations with no homeowners-insurance value as uninsured |

### State cost share

Under the Stafford Act the state already funds **25% of Other Needs
Assistance** (sec. 408(g), 42 U.S.C. 5174(g)); Housing Assistance under
sec. 408(c) is **100% federal**. The report shows what that quarter came to
for this cohort, per declaration and statewide, alongside what the same
historical caseload would have cost the state under other terms -- a higher
ONA share, cost sharing extended to HA, or IHP withdrawn entirely. Those are
illustrations, not forecasts, and none is an enacted proposal.

Scope matters and the report says so on every surface: this is the
non-federal share of ONA paid to *this cohort*, not the state's whole IHP
caseload.

| Flag | Effect |
| --- | --- |
| `--ona-state-share 0.5` | model a different non-federal ONA share |
| `--ha-state-share 0.25` | model cost sharing extended to Housing Assistance |
| `--no-scenarios` | show only the current split |

### Dollars

`--adjust-to 2025` restates every amount in one year's dollars using a built-in
CPI-U table, so a 2005 Katrina award and a 2021 claim are comparable. Without
it everything is nominal — fine for a single event, misleading across decades.
`--cpi-file table.json` substitutes your own deflator.

The HTML page is written as an argument for a state audience, in order: the
claim, with the state as its subject; who the state is paying for, and why
IHP is the program to measure (it records insurance status, so it is a floor
for the cost, not all of it); what the state already funds and what a changed
split would cost; a two-bar comparison of what aid paid against what
insurance paid; the difference as the single hero figure; the non-flood
cohort as the wider picture; the per-declaration evidence; and, as a titled
section rather than a footer, what the numbers do and do not show. The
sentence about the federal cost-share review is deliberately general;
`--review-note "..."` substitutes your own citation. Every sentence and figure on it
is regenerated in the browser as the controls change, so a filtered view
argues the same way as the full one.

The page carries **both** bases and a button switches between them, so a
reader can check whether a figure survives inflation adjustment without
asking you to re-run anything. It also carries a **year slider**: one very
large old disaster (Katrina in the Gulf states) can dominate a state's whole
history, and dragging the start year forward shows whether the finding holds
without it. Everything recomputes in the page -- cards, both tables, the
summary sentence -- from per-declaration and per-year figures embedded in the
file. Only additive quantities are embedded, so a filtered view can never
show a median or percentile the data cannot support. The badge under the headline always names the
basis currently shown, and an unadjusted view is styled as a warning. The
second basis is computed from the same cached responses, so it costs no extra
requests; `--no-toggle` omits it.

## How it works

Three OpenFEMA datasets:

| Purpose | Dataset |
| --- | --- |
| Household awards | `IndividualsAndHouseholdsProgramValidRegistrations` |
| Insurance payouts | `FimaNfipClaims` |
| Disaster names, types, incident dates | `DisasterDeclarationsSummaries` |

**Versions are not hard-coded.** OpenFEMA republishes a table under a new
version number and retires the old one, and the version sits in the URL path,
so a baked-in guess becomes a 404. On every run the tool reads OpenFEMA's own
dataset catalog and binds to the current, non-deprecated version of each
table. `./fema-flood-gap datasets` lists what is published; `--ihp-version 1`
pins a specific one, and `--ihp-dataset NAME` points at a different table
entirely. If a dataset name is not in the catalog, the error names the real
datasets that look like it rather than failing blankly.

The cohort is pushed into the API's `$filter` so a state pull is tens of
thousands of rows rather than millions, then **re-checked locally** on every
record — a filter the API interprets differently than expected can't silently
widen the cohort, and the JSON output reports exactly how many records were
rejected and why.

Paging uses a keyset cursor (`$orderby=id` plus `id gt <last id>`) rather than
`$skip`, which degrades and can repeat or drop rows deep into a large table.
Records are aggregated as they stream, so memory stays flat regardless of
state size. Every response is cached under `~/.cache/fema-flood-gap`, so
re-running with a different cohort definition or output format downloads
nothing; `--refresh` re-fetches, `cache clear` empties it.

Field **values** are sampled before the filter is written. OpenFEMA encodes
tenure as `"O"`/`"R"`, not `"Owner"`/`"Renter"`, and a column the schema calls
boolean can carry `1`/`0`. A filter in the wrong vocabulary returns zero rows,
which reads like a real answer -- a state where nobody flooded uninsured --
rather than a bug. So the tool samples the column, builds the filter from the
values actually present, and prints what it found. `./fema-flood-gap values MS`
shows the same sample on its own. If a cohort filter still matches nothing,
the run widens to the whole state and applies the cohort locally rather than
reporting an empty cohort as a finding.

Field names are **resolved at run time** against the published schema, from a
list of candidates per logical field (NFIP v1's `amountPaidOnBuildingClaim`
and v2's `netBuildingPaymentAmount` both bind). When OpenFEMA renames or
re-types a column the tool either binds the new name or fails loudly naming
the field it could not find — it does not quietly produce a wrong number.
`./fema-flood-gap schema` prints the bindings.

## Reading the numbers honestly

The comparison is worth making, and it is not apples to apples. What the
report states, and you should too:

- **IHP = HA + ONA.** They are not three separate awards; the report shows IHP
  as the total and HA/ONA as its components.
- **Registrations, not people.** FEMA treats a registration as a household. A
  household that flooded in two disasters appears once per disaster, so the
  per-declaration rows are events, and the statewide total counts
  household-events.
- **Two denominators, both shown.** Averaging IHP over the whole cohort
  includes households awarded nothing, which understates what a recipient got.
  Averaging over funded households only overstates how much of the affected
  population was helped. The report gives both, plus medians and a 90th
  percentile, because IHP awards are heavily right-skewed and the mean sits
  well above the typical award.
- **NFIP claims closed without payment are counted separately** so the average
  payout is not quietly inflated by omitting them, or deflated by including
  them unlabelled.
- **The programs are different instruments.** IHP is capped disaster aid for
  essential needs — a floor, not indemnity, and statutorily capped per
  household per disaster. NFIP is an indemnity policy paying up to the limit
  purchased. The gap is the scale of what insurance covers and aid does not.
  It is not a forecast of what any particular household would have received:
  an NFIP payout depends on coverage bought, and the claimants in the data
  chose to insure, which is not a random draw from the uninsured population.
- **Same-storm matching is the fairer comparison.** The per-declaration NFIP
  column matches claims by date of loss falling inside that declaration's
  incident window, so an uninsured owner's award is compared against insured
  neighbours in the same storm rather than a state-lifetime average.
- **Claims in overlapping windows are counted under each declaration**, so
  per-event claim counts can sum to more than the statewide total. The report
  warns when this happens.

## Tests

```bash
python3 -m unittest discover -s tests
```

If `node` is present the suite also executes the shipped page script against
the shipped payload under a small DOM shim, and checks that the slider and
toggle produce the same figures the pipeline does -- filtering to a year in
the page must equal a fresh run with `--since` on that year. Otherwise the
page could drift from the CSV and JSON with nothing to catch it.

The suite runs the real client, filter construction, paging, schema
resolution, aggregation, and every renderer against an in-memory fake of the
API with hand-computed expected totals — including keyset vs. offset paging
agreement, the fallback when the API rejects a compound filter, and CPI
adjustment. It needs no network.
