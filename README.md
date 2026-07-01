# Apron Room — NBA Trade & Free Agent Machine

A planning tool for analyzing NBA rosters, trades, and free-agent signings
against the **two-apron** framework of the 2023 Collective Bargaining Agreement.
It shows where a team's salary sits this season and across the next five years,
what draft capital it controls, and — most importantly — exactly which
roster-building moves the aprons take off the table.

## What it does

Three tools share one apron "brain":

### 1. Team Explorer
- **Apron meter** — where committed salary sits against the cap, tax, first
  apron, and second apron, with the room/overage to each line.
- **5-year salary outlook** — a bar per season (current + four projected)
  against the projected apron lines, so you can see money coming off the books.
- **Restrictions panel** — every roster-building tool the team has lost at its
  current tier, tagged as a first- or second-apron consequence.
- **Draft capital** — the pick cupboard, with the second-apron **frozen
  first-round pick (seven years out)** flagged in red when applicable.
- **Roster table** — each player's salary across the horizon with player/team
  options and UFA/RFA years marked.

### 2. Trade Machine
Pick two teams, select who each side sends out, and get an instant legality
verdict. The engine reports, per team: salary in/out, the **maximum salary that
can legally be taken back**, the before→after apron read, and every violation.
It enforces the apron rules that block deals, including:
- salary-matching bands (expanded up-to-200% below the apron, tighter above it);
- a second-apron team **cannot take back more than it sends**;
- a second-apron team **cannot aggregate** two salaries to match a bigger one;
- **no trade may push a team across the second apron**;
- hard-cap consequences of crossing the first apron.

### 3. Free Agent Machine
Choose a team and a target salary and see which signing tools are legal — cap
space, the non-taxpayer / taxpayer mid-level, the bi-annual exception, or the
minimum — with clear reasons when a tool is unavailable (e.g. a **second-apron
team has no MLE at all**) and warnings when a tool **hard-caps** the team.

## Apron rules, in brief

| Threshold (2024-25) | Amount | What it means |
|---|---|---|
| Salary cap | $140.6M | Soft cap; exceptions allow going over |
| Luxury tax | $170.8M | Tax bill begins |
| **First apron** | $178.1M | Lose full MLE, bi-annual, sign-and-trades in, expanded matching |
| **Second apron** | $188.9M | Lose all MLEs, salary aggregation, taking back more than you send, cash in trades; frozen first-round pick |

Cap figures for 2024-25 and 2025-26 are the league's official numbers; later
seasons are projected at the CBA's 10% maximum annual increase.

## Running it

```bash
npm install
npm run dev        # start the dev server (http://localhost:5173)
npm run build      # type-check + production build
npm run typecheck  # types only
npx tsx scripts/verify.ts   # sanity-check the apron & trade engines
```

## Project layout

```
src/
  types.ts                 shared domain types
  data/
    leagueConstants.ts     cap/tax/apron thresholds by season
    teams.ts               sample rosters, contracts & draft capital
  lib/
    apron.ts               salary tiers + restriction catalog
    trade.ts               trade legality engine
    freeAgent.ts           signing-tool evaluator
    format.ts              money/season formatting
  components/              UI (explorer, trade machine, FA machine, ...)
scripts/verify.ts          headless checks for the engines
```

## Notes & caveats

The rosters, contracts, and draft picks are **illustrative sample data** built
to exercise every apron tier — not a live feed — and are meant to be edited.
The CBA rules are implemented in a simplified, clearly-labeled form suitable for
planning; when in doubt the trade engine blocks rather than green-lighting an
illegal deal. This is a planning aid, not an official league ruling.
