# ho-rating

A prototype homeowners rating engine. Given a property, it produces estimated
annual premiums for HO-2 / HO-3 / HO-5 across carriers, with a full audit trail
of how every number was derived.

**Rating plans are data, not code.** One generic interpreter executes declarative
YAML plan specs. Adding a carrier is a new YAML file; it is never a Python change.

Prototype scope is Connecticut homeowners, owner-occupied — but state is a
parameter throughout, not an assumption.

## Try it

Needs Python 3.10+.

```bash
cd ho-rating
python3 -m venv .venv && source .venv/bin/activate
pip install -e '.[dev,extract]'      # 'extract' pulls PyMuPDF, only needed for PDFs
pytest                               # 98 tests, ~3s

# Two synthetic carriers, no real filing needed
python -m src.cli rate --demo \
    --address "742 Prospect Ave, Hartford, CT 06105" \
    --coverage-a 450000 --year-built 1955 --construction masonry \
    --roof-year 2008 --protection-class 7 --deductible 2500 --prior-claims 1 \
    --forms HO2,HO3,HO5 --carriers all --as-of 2026-01-01
```

```
Carrier                                   HO2         HO3         HO5
---------------------------------------------------------------------
Housatonic Casualty Company            $1,991      $2,164      $2,619
Sample Mutual Insurance Company   not written      $2,132      $2,526
---------------------------------------------------------------------
Market low                             $1,991      $2,132      $2,526
Market median                          $1,991      $2,148      $2,572
Market high                            $1,991      $2,164      $2,619
```

Add `--trace Sample` for the full derivation, with the filing page behind every
number:

```
  base_premium         = 1414.5       p.15    1414.5  [{territory_code=3} @ 400000 plus 50k x 1.95]
  form                 x 1            p.21    1414.5  [{form=HO3} -- base form]
  protection_class     x 1.23         p.23    1739.835  [{protection_class=7}]
  construction         x 0.945        p.24    1644.144075  [{construction_type=masonry}]
  roof                 x 1.14         p.26    1874.3242455  [{roof_material=composition, roof_age=16-20}]
  home_age             x 1.075        p.27    2014.8985639125  [{home_age=51+}]
  deductible           x 0.92         p.29    1853.7066787995  [{deductible=2500}]
  claims               x 1.15         p.31    2131.762680619425  [{prior_claims=1}]
  round_subtotal       round 1        p.13    2132  [half_up to 1]
  water_backup         skipped        p.35    (endorsement_water_backup not present)
  minimum_premium      floor 450      p.9     2132  (not binding)
  renewal_cap          skipped        p.10    (has_prior_term_premium=False does not match True)
  round_final          round 1        p.13    2132  [half_up to 1]
```

Other commands:

```bash
python -m src.cli plans --demo        # what plans exist, and their status
python -m src.cli validate --demo     # reproduce every filing's own worked examples
```

Installing also puts an `ho-rate` command on your PATH, runnable from anywhere:
`ho-rate rate --demo ...`. It is deliberately not called `rate` — that name is
generic enough to collide with something else on a shared PATH. Change
`[project.scripts]` in `pyproject.toml` if you want it shorter.

`--roof-year` defaults to `--year-built`, i.e. the original roof. On an old
house that lands in the worst roof-age band, so pass it explicitly if the roof
has been replaced.

## How a plan works

A plan is an ordered list of steps applied to a running premium, plus the tables
those steps look up:

| Step | Does |
|---|---|
| `base_rate` | Sets the premium from a Coverage A curve, with the filing's stated interpolation (`per_1000`, `linear`, `step`, `exact`) |
| `factor` | Multiplies by a looked-up factor |
| `additive` | Adds a flat charge, a per-$1,000 charge, or a percentage |
| `cap` / `floor` | Maximum premium or capped renewal increase; minimum written premium |
| `round` | Rounds — a step, not an output setting, because *where* it happens changes the answer |

Every table cites a `source_page` in the filing PDF, and every key declares its
lookup semantics (`exact`, `band` with inclusivity, `nearest_below`,
`nearest_above`). Filings disagree about these and getting one wrong silently
produces a plausible wrong number.

Form is just another factor lookup, so rating all three forms is one loop. A form
the filing does not rate comes back **"not written"**, not a number.

### Two rules that make it trustworthy

**Nothing defaults to 1.0.** An unmatched lookup raises. A table may carry a
`default` only where the filing prints an explicit "all other" row — and the
default must cite that row's page.

**A plan is not done until its worksheets pass.** Most filings print a worked
example. Those are encoded in the plan file and run by the test suite; the engine
must reproduce the filing's own premium to the cent. It is the only real check
that the rating sequence was read correctly.

## Workflow for a real filing

1. Download the filing PDF by hand into `data/filings/{state}/{carrier}/`
   (gitignored — there is no SERFF scraper here, by design).
2. `python -m src.extract triage --pdf ...` — score pages, find the tables and
   the worked examples.
3. `python -m src.extract jobs --pdf ... --carrier ...` — render candidate pages
   to PNG with an extraction prompt each. Send them to a vision model; filing
   layouts defeat deterministic table parsers.
4. `python -m src.extract draft --responses ...` — assemble a **draft** plan,
   `source_page` and `confidence` on every table, stamped `UNVERIFIED`.
5. Work `docs/verification_checklist.md` with the PDF open. Encode the filing's
   worked examples. Make them pass.
6. Remove the `UNVERIFIED` marker, set `verification.status: verified`, move the
   file into `plans/`.

Until step 6, the engine refuses to rate with it.

## Inputs an address cannot give you

**`protection_class`** — ISO PPC is licensed data, so it is a required input.
`territory.py` stubs a resolver interface for a future licensed source. A
distance-based heuristic is included but is not wired into the CLI and flags
every result as a low-confidence estimate.

**`coverage_a`** — replacement cost, *not* market value. Required. Pass
`--square-feet` to use a crude fallback estimator (sqft × regional cost × a
construction multiplier) which labels itself an estimate with a ±30% band and
taints the premium's output with a warning.

**`territory_code`** resolves automatically, against the plan being rated.
Territory definitions live inside each plan file and are never shared between
carriers: in the two demo plans, ZIP 06371 is the cheapest tier for one carrier
and the coastal tier for the other — a 53% spread on the same house.

## Layout

```
plans/       verified rating plans (one per carrier/state/effective date)
data/        filing PDFs, gitignored
src/
  schema.py       pydantic models for plan specs and risks
  interpreter.py  the engine — knows nothing about any carrier
  extract.py      PDF -> draft YAML, human in the loop
  territory.py    address -> territory; PPC and Coverage A resolvers
  cli.py
tests/
  fixtures/       two synthetic plans, deliberately built on different mechanics
docs/verification_checklist.md
NOTES.md          what is ambiguous in filings and what to look for next
```

## Status

First pass. The engine, schema, CLI and extraction scaffold work; 98 tests pass.
**No real filing has been transcribed yet** — everything is validated against two
synthetic plans. `NOTES.md` records the decisions the first real filing should
re-test, and the one known schema gap (factors that apply to part of the premium
rather than all of it).
