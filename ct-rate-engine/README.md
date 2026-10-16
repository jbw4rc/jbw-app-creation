# ct-rate-engine

Automated pipeline to pull **Connecticut homeowners & private-flood** insurance
**rate filings** from [SERFF Filing Access (SFA)](https://filingaccess.serff.com/sfa/home/CT),
extract their rating logic, and estimate premiums for a given home.

Three phases, each usable on its own:

| Phase | Package | What it does |
|------:|---------|--------------|
| 1 | [`scraper/`](scraper) | Playwright bot that searches SFA and downloads Rate/Rule Schedule + Supporting Documentation PDFs, with a resumable index. |
| 2 | [`extractor/`](extractor) | Turns rating-manual PDFs into a normalized per-carrier JSON (best-effort) plus a human review checklist. |
| 3 | [`engine/`](engine) | Config-driven rating engine: computes an auditable premium estimate from a home profile. CLI + FastAPI. |

---

## ⚠️ Legal & practical caveats — read first

- **Public data, polite scraping.** SFA filings are public, but there is **no
  public API**. The scraper drives the web UI, accepts the terms-of-use page,
  and rate-limits itself to a random **2–5 second** delay between actions. Use
  responsibly and within SFA's terms of use.
- **CAPTCHAs are solved by you, not bypassed.** If an anti-bot challenge
  appears, the scraper **pauses and asks you** to solve it in the visible
  browser window (run headed — the default). It never tries to defeat a CAPTCHA.
- **NFIP is federal** and does not appear in SFA — only **private** flood
  carriers do.
- **Filings are heterogeneous and often partly confidential.** Modern filings
  frequently mark key exhibits confidential or use by-peril "black box" rating.
  The pipeline **records what it cannot reproduce** (`gaps`) instead of failing,
  and the engine flags such estimates as **partial**.
- **Estimates are NOT bindable quotes.** Output is an educational reconstruction
  from public documents, not an offer of insurance.
- **Selectors need live verification.** The scraper's selectors were written
  from the documented SFA structure. Before a real run, verify them against the
  live DOM: `python -m scraper --inspect` (see Phase 1).

---

## Setup

Requires **Python 3.11+**. Using [`uv`](https://github.com/astral-sh/uv):

```bash
cd ct-rate-engine
uv venv .venv && source .venv/bin/activate

# Just the rating engine + tests (no browser / PDF deps):
uv pip install -e '.[dev]'

# Everything (scraper + extractor + API):
uv pip install -r requirements.txt
playwright install chromium          # one-time, for Phase 1
```

`camelot-py` needs Ghostscript, and OCR needs Tesseract + poppler — install those
via your OS package manager only if you use those fallbacks.

Run the tests (engine math + extractor heuristics + scraper index):

```bash
pytest -q
```

---

## Phase 1 — scraper

```bash
# Verify selectors against the live site FIRST (dumps DOM + screenshot to data/inspect/):
python -m scraper --inspect

# Then a real, resumable run (headed by default so you can watch / solve CAPTCHAs):
python -m scraper \
  --toi "04.0 Homeowners" \
  --filing-type "Rate/Rule" \
  --date-from 01/01/2023 --date-to 12/31/2025 \
  --max-filings 25
```

Flags: `--toi`, `--filing-type`, `--company`, `--date-from`, `--date-to`,
`--max-filings`, `--headless`, `--inspect`, `--verbose`.

For each filing it captures metadata (SERFF tracking #, company, NAIC, TOI/sub-TOI,
filing type, disposition, dates, overall rate impact), downloads the target-tab
PDFs into `data/raw/{company_slug}/{serff_tracking_number}/`, and writes a
`manifest.json`. A SQLite index at `data/index.sqlite` makes re-runs incremental —
already-seen filings are skipped. Every navigation step is logged, and the live
**TOI dropdown options are logged** so you can confirm which codes to target.

> All selectors live in one file — [`scraper/selectors.py`](scraper/selectors.py) —
> as ordered lists of fallback strategies. That is the only place to edit when
> the DOM shifts.

## Phase 2 — extractor

```bash
python -m extractor --filing data/raw/acme_ins/CT-ACME-123 --out data/reviews/acme_ins
# or point at loose PDFs:
python -m extractor --pdf manual.pdf --pdf memo.pdf --carrier "Acme" --serff CT-ACME-123 --out data/reviews/acme
```

Uses **pdfplumber** for text/tables, falls back to **camelot** (lattice) for
ruled grids, and **flags scanned pages** for optional OCR (`pytesseract`, never
run by default). It writes:

- `data/reviews/<carrier>/<carrier>.draft.json` — the normalized manual (Phase 3
  schema), with a `gaps` list for anything that blocks full reproduction;
- `data/reviews/<carrier>/review_needed.md` — every low-confidence table, the
  verbatim **rating-algorithm / order-of-calculation** lines it found, and the
  scanned pages — for you to verify by hand.

This is deliberately **human-in-the-loop**: it never invents numbers. Move a
verified manual into `data/carriers/` for the engine to use.

## Phase 3 — rating engine

Home profile (`home.example.json`):

```json
{
  "territory_or_zip": "06880", "coverage_a": 600000, "year_built": 1988,
  "construction": "frame", "protection_class": 4, "roof_age": 8,
  "deductible": 1000, "hurricane_deductible_pct": 2,
  "discounts": ["protective_devices", "claims_free", "multi_policy"]
}
```

CLI — side-by-side, step-by-step breakdown across every carrier in `data/carriers/`:

```bash
python -m engine.quote --profile home.example.json
```

```
== Test Mutual (homeowners) — estimated premium: $804.00
   base_rate  base_rate   T1/600000       =1000.0  -> $1,000.00
   factor     age_of_home 38 -> 31+       x1.1     -> $1,100.00
   factor     wind_hurricane_deductible 2.0 -> 2  x0.95 -> $1,045.00
   discount   protective_devices  multiplicative  =0.95 -> $992.75
   ...
   rounding   rounding    nearest/1.0             -> $804.00
```

API:

```bash
uvicorn engine.api:app --reload
# POST a home profile to /quote, GET /carriers, GET /health
```

Carriers with entries in `gaps` return `"partial": true` with an explanation; a
factor the profile can't satisfy is treated as `1.0` and surfaced as a warning
rather than crashing.

### Carrier manual schema

See [`tests/fixtures/synthetic_carrier.json`](tests/fixtures/synthetic_carrier.json)
for a complete, engine-ready example. Key fields: `base_rates` (per
territory × Coverage A band), `rating_order` (the exact operation sequence),
`factors` (each a `{key: multiplier}` table; keys match exactly or as numeric
bands like `"6-10"`, `"21+"`), `discounts`, `minimum_premium`, `rounding`, and
`gaps`.

---

## Testing philosophy

Engine math is tested against a **hand-built synthetic carrier**
(`tests/fixtures/synthetic_carrier.json`) so tests never depend on scraped data.
The extractor's classification heuristics and the scraper's resume index are
unit-tested with no browser or PDF dependencies.

## Repository layout

```
ct-rate-engine/
├── scraper/     # Phase 1  (Playwright; selectors.py is the tuning surface)
├── extractor/   # Phase 2  (pdfplumber + camelot + optional OCR; heuristics.py)
├── engine/      # Phase 3  (rating.py math, quote.py CLI, api.py FastAPI)
├── tests/       # engine math + extractor heuristics + scraper index
├── data/
│   ├── raw/       # scraped PDFs + manifest.json per filing
│   ├── reviews/   # extractor drafts + review_needed.md
│   └── carriers/  # verified, engine-ready manuals
├── home.example.json
├── requirements.txt
└── pyproject.toml
```
