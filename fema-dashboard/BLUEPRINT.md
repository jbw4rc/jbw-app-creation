# Build blueprint — PA Grants Command Center with real data

**Audience:** a Claude Code session on a work machine, plus the person driving it.
**Goal:** take the working synthetic-data mockup and make it run on real FEMA
Public Assistance extracts, without real data ever entering source control, a
build artifact, or a hosted page.

Read `DATA-HANDLING.md` alongside this. The hard rules in §8 are not stylistic.

---

## 1. Start here

The mockup is a complete, working application. **Do not rebuild it from scratch.**
The fastest correct path is to clone it and replace one file.

```bash
git clone -b claude/fema-grants-dashboard-471730 \
  https://github.com/jbw4rc/jbw-app-creation
cd jbw-app-creation/fema-dashboard
npm install
npm run dev          # http://localhost:5174 — synthetic data, confirms it runs
```

The repository is public, so this clone needs no credentials. Confirm your
organization permits cloning public repositories to a work machine before you do
it.

If you cannot clone at all, §4 (the data contract) and §7 (the indicator
reference) are the irreducible core — everything else can be re-derived. Expect a
rebuild to take a full session or more; adapting the existing code takes far less.

---

## 2. What already exists

| Area | State |
|---|---|
| 11 indicator derivations | Complete, typed, tested against synthetic data |
| Command center, per-indicator views, applicant scorecard, record drawer | Complete |
| Chart toolkit (hand-rolled SVG, no chart library) | Complete, light + dark, table twin on every chart |
| Queue tables, sorting, CSV export | Complete |
| Notes / dismissals in localStorage with JSON export-import | Complete |
| Thresholds and business rules in one config file | Complete, values are assumptions |
| **Real data ingestion** | **Does not exist — this is your build** |

The current app compiles a seeded synthetic generator into the bundle. There is
no file input, no parser, and no persistence of parsed data. That is the work.

---

## 3. What you are building

Five phases. Each has a checkpoint — do not start the next until the current one
passes.

### Phase 1 — Confirm the contract against reality

Before writing any code, export one real table from the workbook (or better, a
de-identified sample) and compare its columns against §4. Produce a written
mapping: every field in the `Dataset` type gets either a source column, a
derivation, or a "not available."

**The "not available" list is the most important output of this phase.** Any
indicator that depends on a missing field must be either descoped or given a
different rule. Do not let it silently compute against `undefined` — that
produces a dashboard that is confidently wrong, which is worse than one that is
missing a panel.

*Checkpoint:* a mapping document exists, and each of the 11 indicators is marked
buildable, needs-rule-change, or blocked.

### Phase 2 — Ingestion

Build a **Load data** view. Requirements:

- File picker and drag-drop for `.xlsx` and `.csv`.
- Parsing happens **in the browser**. No upload, no server, no API call. This is
  the single technical claim the risk review rests on — see `DATA-HANDLING.md` §3.
- For `.xlsx`, add SheetJS (`xlsx`) as the only new runtime dependency. Pin the
  version and record it for review. CSV can be parsed without a dependency.
- Header-based column mapping with a visible mapping screen, so a renamed column
  in the workbook surfaces as a prompt rather than a silent null.
- A validation report before anything renders: row counts per table, rows
  dropped, unparseable dates, unmapped columns, referential breaks (a project
  whose account does not exist).
- Emit exactly the `Dataset` shape in §4. Nothing downstream changes.

*Checkpoint:* a real extract loads, the validation report is clean or its warnings
are understood, and `computeAll` returns without throwing.

### Phase 3 — Business rules

Replace the assumptions in `src/config/thresholds.ts` and the criteria arrays in
`src/lib/indicators/readiness.ts` with the real ones. See §6.

The readiness matrix columns are generated directly from those criteria arrays,
so editing the arrays updates the visualization with no chart work.

Also update the `logic` and `assumptions` strings on each `IndicatorDefinition`.
Those render as the two callouts at the top of every indicator view, and they are
what makes the dashboard auditable by the people who own the process. Keep them
honest — if a rule is still a guess, say so there.

*Checkpoint:* someone who owns the closeout process reads the callouts on all 11
views and agrees they describe what the team actually does.

### Phase 4 — Snapshot history

The synthetic build fakes trend data (`buildFlowHistory` in
`src/lib/indicators/portfolio.ts`), because a single snapshot has no past. Replace
it:

- On each successful load, write the computed per-indicator counts and dollar
  totals to IndexedDB, keyed by extract date.
- Store **aggregates only** — counts, sums, and exception IDs. Do not persist the
  full parsed dataset. This keeps at-rest exposure to a minimum and is a control
  you can point to in review.
- Rebuild sparklines, "new this week" badges, and the exception-flow chart from
  the stored series.
- Provide a visible "clear stored history" control.

*Checkpoint:* two loads a week apart produce a real week-over-week delta, and
`buildFlowHistory` is deleted rather than left dormant.

### Phase 5 — Demo mode

Keep the synthetic generator behind an explicit toggle. You will want to
screenshot, train, and demo without touching client data, and a clearly labeled
demo mode is how you do that safely. The "Synthetic data — illustrative only"
badge must remain visible whenever it is active, and must be impossible to
display when real data is loaded.

---

## 4. The data contract

This is the interface. Everything in `src/lib/indicators/` reads these types and
nothing else, so if your parser emits this shape, all 11 indicators work
unchanged. The authoritative copy is `src/types.ts`.

```ts
Dataset {
  asOf: string                        // ISO date the dashboard treats as "today"
  sources: {                          // extract timestamps — reconciliation is
    femaGrantsPortal: string          // meaningless without them; they render
    clientSystemOfRecord: string      // in the header
    internalTracker: string
  }
  disasters:  Disaster[]
  applicants: Applicant[]
  accounts:   Account[]               // one applicant × one disaster
  projects:   Project[]
  rfis:       Rfi[]
  rfrs:       Rfr[]
}
```

Field-level notes that matter more than the rest:

| Field | Why it matters |
|---|---|
| `Project.femaStatus` / `sorStatus` | The pair drives indicator 5. Both are required; a single merged status collapses the indicator. |
| `Project.popEndDate` | Drives 4 and 11. Must be the system-of-record value, not a derived one. |
| `Project.quarterly.projectedCompletionDate` | Drives 4. If quarterly reporting gives percent-complete but no projected date, indicator 4 needs a new rule — flag it in Phase 1. |
| `Project.validatedAmount` vs `obligatedAmount` | Drives 3 and 9. |
| `Project.drawnAmount` | Drives "funding unlocked" in 6, 7, 8, 10. If your accounting defines unlocked funding differently, change it here once and all four follow. |
| `Project.closeoutExtensionOnFile` | Drives 11. Modeled as boolean; if your manual tracker holds dates, widen the type and use them. |
| `Rfi.internalStatus` / `sorStatus` | Nullable on both sides — `null` means "absent from that system," which is a distinct and more serious exception than a status mismatch. Preserve that distinction. |
| `Rfr.step` / `stepEnteredOn` | Drives 2. The clock is time-in-current-step, not total cycle time. |

**The join.** Indicator 1 assumes RFIs can be matched across systems on a shared
identifier. If the real match is fuzzy — project plus subject plus date — that
matching logic is its own piece of work, and its false-positive rate is the
credibility of the whole indicator. Budget for it.

---

## 5. Architecture invariants

Keep these; they are why the thing holds together.

- **One file owns data acquisition.** Today `src/data/generate.ts`; after Phase 2,
  the parser. Nothing else in the app knows where data came from.
- **Filtering narrows the dataset and recomputes.** `filterDataset` then
  `computeAll`. Do not add post-filtering to individual views — recomputation is
  what guarantees a tile can never disagree with its own chart.
- **Every indicator reduces to `ExceptionRow[]`** plus an archetype-specific chart
  payload. New indicators follow the same shape.
- **No backend, no runtime network calls.** Not a preference — it is the control
  the risk review depends on.
- **Every chart has a table twin.** No value reachable only by color or hover.

---

## 6. Business rules to replace

`src/config/thresholds.ts`:

| Constant | Current assumption | Replace with |
|---|---|---|
| `RFR_STEP_TARGETS` | 7 steps, invented day targets | Your real workflow steps and SLAs |
| `RFR_STEP_ORDER` | Submitted → … → Paid | Your real step sequence |
| `VALIDATION.targetDaysPostObligation` | 180 | Your target |
| `VALIDATION.maxUnvalidatedShare` | 0.25 | Your ceiling |
| `CLOSEOUT.daysAfterPop` | 180 | Confirm; this one you stated, so it is likely right |
| `CLOSEOUT.warnLeadDays` | 90 | Your desired lead time |
| `CAPACITY.validationsPerMonth` / `closeoutsPerMonth` | 12 / 18 | Real throughput — this draws the Pareto cut line, so a wrong number produces a confidently wrong plan |

`src/lib/indicators/readiness.ts` — three criteria arrays, all placeholders:
`SMALL_PROJECT_CRITERIA` (6), `CAT_Z_CRITERIA` (7), `ACCOUNT_CRITERIA` (8). Each
entry needs a `key`, a short column header, a full label, and a predicate in the
corresponding `compute*` function.

---

## 7. Indicator reference

| # | Indicator | Archetype | Primary view | Key inputs |
|---|---|---|---|---|
| 1 | RFI misalignment | Reconciliation | Status-agreement matrix | `rfis.internalStatus` × `sorStatus` |
| 2 | RFR aging | Aging | Stepped funnel w/ aging bands + median/p90 bullets | `rfrs.step`, `stepEnteredOn` |
| 3 | Large project validation | Aging | Quadrant scatter (days × unvalidated share) | `obligatedOn`, `validatedAmount` |
| 4 | Time extensions | Reconciliation | Dumbbell: PoP end → projected completion | `popEndDate`, `quarterly` |
| 5 | Withdrawn misalignment | Reconciliation | Aging buckets + $ overstated by disaster | `femaStatus`, `sorStatus` |
| 6 | Small project closeout | Readiness | Readiness matrix + blocker Pareto | criteria array |
| 7 | Large Cat Z closeout | Readiness | Readiness matrix + blocker Pareto | criteria array, sibling status |
| 8 | Account closeout | Readiness | Readiness matrix + last-mile table | rollup of 6/7 |
| 9 | Validation priority | Prioritization | Pareto w/ capacity line + value/effort | unvalidated $ |
| 10 | Closeout priority | Prioritization | Pareto w/ capacity line + value/effort | undrawn $ |
| 11 | Closeout extensions | Aging | Cliff chart + deadline horizon | `popEndDate` + 180, `closeoutExtensionOnFile` |

Cross-cutting: dollars-in-motion funnel, combined deadline horizon (4 + 11),
exception flow (new vs. resolved), applicant scorecard.

---

## 8. Hard rules

These exist because violating any one of them turns a local tool into a
disclosure. See `DATA-HANDLING.md` for the reasoning.

1. **Never place real data in `src/`.** The dataset compiles into the JS bundle.
   Real data in `generate.ts` means real data in `dist/`.
2. **Never commit real extracts, exports, or parsed output.** Add to
   `.gitignore` before Phase 2: `*.xlsx`, `*.xls`, `*.csv`, `data-real/`,
   `dist/`. The repository this came from is **public**.
3. **Never publish an artifact, Pages deployment, or hosted page built from real
   data.** Artifact publishing inlines the dataset into a page hosted on
   claude.ai. Pages publishes `dist/` to the open internet.
4. **Do not open real extracts in an AI coding session** — not with Claude Code,
   not with any assistant. File contents an assistant reads are transmitted to
   its provider. Develop the parser against a de-identified sample with the same
   column headers and shape.
5. **Keep the demo-mode badge honest.** It must be visible whenever synthetic
   data is loaded and impossible to show when real data is.

---

## 9. Acceptance checks

Before anyone trusts a number:

- [ ] Load a real extract; validation report warnings are all understood.
- [ ] Reconcile 3 indicators against the existing PowerQuery tables — the counts
      should match, and where they do not, you have found either a bug or a
      genuine disagreement in rules. Both are worth knowing.
- [ ] Spot-check 5 individual records end to end: queue row → drawer → source.
- [ ] Confirm the two callouts on every indicator view describe your real process.
- [ ] `npm run build` clean; `git status` shows no data files.
- [ ] DevTools **Network** tab is empty after load (see `DATA-HANDLING.md` §6).
- [ ] Someone other than the builder can find the top 5 items to work on within
      two minutes, unaided.

---

## 10. Prompts to open with

Working prompts for a fresh session, in order. Give it one phase at a time —
the failure mode is asking for everything at once and getting a plausible-looking
parser that silently drops rows.

> Read `fema-dashboard/BLUEPRINT.md` and `fema-dashboard/src/types.ts`. I am on
> Phase 1. Here are the column headers from our real extracts: [paste headers
> only — never data rows]. Produce the field mapping described in Phase 1,
> including an explicit "not available" list, and tell me which of the 11
> indicators are blocked or need a rule change.

> Phase 2. Build the Load data view per the blueprint: browser-only parsing, a
> visible column-mapping screen, and a validation report before anything renders.
> Emit the `Dataset` shape from `src/types.ts` unchanged. Do not add any network
> call. Do not modify anything in `src/lib/indicators/`.

> Phase 3. Replace the assumed thresholds in `src/config/thresholds.ts` and the
> three readiness criteria arrays with these real rules: [...]. Update each
> indicator's `logic` and `assumptions` strings to match, and leave anything
> still uncertain explicitly marked as an assumption.

> Phase 4. Replace the simulated `buildFlowHistory` with real snapshot history in
> IndexedDB, storing aggregates only — counts, sums, exception IDs — never the
> parsed dataset. Add a visible control to clear stored history.
