# PA Grants Command Center

An exception-triage dashboard for FEMA Public Assistance grants management,
covering eleven indicators currently tracked as separate PowerQuery tables in
Excel.

**This build runs entirely on synthetic data.** Applicant names, PW numbers,
dollar figures and dates are invented and deterministic (fixed seed), so the
numbers are stable across reloads and screenshots. No real grant data is present.

```bash
npm install
npm run dev        # http://localhost:5174
npm run build      # type-check + production build
npm run typecheck
```

## The core idea

The eleven indicators are not eleven dashboards. They are eleven **work queues**,
and each answers the same six questions: how many, how much money, how old is the
worst one, who owns it, what is the next action, and is the backlog growing.

That collapses to **four visual archetypes**, so users learn one grammar instead
of eleven:

| Archetype | Indicators | Primary view |
|---|---|---|
| **Reconciliation** — two systems disagree | 1 RFI misalignment · 4 Time extensions · 5 Withdrawn misalignment | Status-agreement matrix; dumbbell for date-vs-date |
| **Aging vs. target** | 2 RFR aging · 3 Large project validation · 11 Closeout extensions | Stepped funnel with aging heat; quadrant scatter; cliff chart |
| **Closeout readiness** — pass/fail logic | 6 Small projects · 7 Large Cat Z · 8 Accounts | Readiness matrix + blocking-reason Pareto |
| **Prioritization by dollars** | 9 Validation priority · 10 Closeout priority | Pareto with a capacity cut line + value/effort scatter |

Above the queues sit three cross-cutting views that no single indicator can
answer: **dollars in motion** (where funding is stuck), the **deadline horizon**
(indicators 4 and 11 combined, as a staffing view), and **exception flow** (new
vs. resolved per week — the only view that answers "are we gaining on it?").

The **applicant scorecard** is the orthogonal spine: the same data organised by
who you have to call today rather than by problem type.

## Architecture

Static, backend-less SPA. Nothing leaves the browser.

```
src/
  types.ts                     domain model — the shape real extracts must produce
  config/thresholds.ts         EVERY business rule in one editable place
  data/generate.ts             seeded synthetic dataset (replace with a parser)
  lib/
    indicators/
      reconciliation.ts        indicators 1, 4, 5
      aging.ts                 indicators 2, 3, 11
      readiness.ts             indicators 6, 7, 8
      prioritization.ts        indicators 9, 10
      portfolio.ts             funnel, deadline horizon, backlog flow
      index.ts                 registry + dataset filtering
    localState.ts              notes & dismissals (localStorage)
  components/
    charts/                    hand-rolled SVG chart toolkit (no chart library)
    CommandCenter.tsx          exec layer
    IndicatorView.tsx          per-indicator workspace
    QueueTable.tsx             sortable queue + CSV export
    RecordDrawer.tsx           record detail + cross-indicator context
    ApplicantScorecard.tsx     applicant × disaster rollup
```

**Filtering recomputes rather than post-filters.** `filterDataset` narrows the
dataset and `computeAll` re-derives everything. The model is small enough that
this is instant, and it guarantees a tile can never disagree with its chart.

### Swapping in real data

`data/generate.ts` is the only file that should need replacing. Point a parser at
the workbook's published output tables, emit the same `Dataset` shape, and every
indicator works unchanged. The intended production flow:

1. Drop the workbook export onto the app; parse client-side.
2. Cache each parsed snapshot in IndexedDB — that gives week-over-week deltas,
   "new this week" badges, and the backlog flow chart **for free**, without a
   database. Excel only ever shows *now*; the app accumulates *history*.
3. Notes and dismissals stay in localStorage, with JSON export/import so one
   person can own the dismissal list and share it.

Because nothing is committed or transmitted, CUI concerns are contained: there is
no data at rest in the repo and no server to secure.

## Business logic is on the surface, not buried

Every indicator view opens with two callouts: **how this is calculated** and
**assumptions to confirm**. All thresholds live in `config/thresholds.ts`:

- RFR step day targets (seven steps, assumed values)
- Validation: 180 days post-obligation, 25% unvalidated ceiling
- Closeout: PoP + 180 days, 90-day lead time
- Capacity: 12 validations / 18 closeouts per month — this drives the Pareto cut line

The readiness criteria in `lib/indicators/readiness.ts` are **placeholders**. The
matrix columns are generated directly from those lists, so replacing them with
the real closeout logic updates the visualization automatically.

## Design conventions

- **Color means severity only** — status tokens (good/warning/serious/critical)
  never double as series colors, and never carry meaning alone (always paired
  with a label or glyph).
- **Every count is paired with dollars.** Counts alone mis-prioritize.
- **Severity is consequence-ranked**: deadline/compliance breach > money at risk
  > aging. On readiness queues, where an unmet criterion is work-in-progress
  rather than a breach, tiles show distance-to-done instead of a severity count.
- **Every chart has a table twin** (the `Table` toggle) — no value is reachable
  only by color or only by hover.
- **One filter row above everything it scopes**; never per-card filters.
- Palette validated against CVD and contrast gates in both light and dark mode.

## Known tuning notes on the synthetic data

- **Indicator 7 (Large Cat Z) is a small queue (~11 items).** That is inherent:
  management costs run ~5–12% of an award, so exceeding the $1.047M large-project
  threshold takes a very large applicant. Real data may be smaller or larger.
- Backlog history is simulated (`buildFlowHistory`) since a single snapshot has
  no past. Real snapshot caching replaces it.
- Distributions were tuned so each queue has a workable population; they are not
  a forecast of what your portfolio looks like.
