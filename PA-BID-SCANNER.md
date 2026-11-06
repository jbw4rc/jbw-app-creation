# PA Bid Scanner — FEMA Public Assistance RFPs & RFQs

A nationwide board of solicitations for work that FEMA Public Assistance pays
for: debris removal, debris monitoring, PA consulting and grant management,
emergency protective measures, permanent repairs, and disaster engineering.
Each posting is scored for relevance, explained, and tied to the disaster
declarations behind it.

Lives at `/fema.html`. It shares the build with the NBA and NFL apps and nothing else.

## How it works

```
 SAM.gov API ─────┐
 State/local RSS ─┼─► scripts/fema/build-fema-bids.ts ─► src/fema/data/feed.ts ─► /fema.html
 OpenFEMA API ────┘     (classify · merge · prune)          (committed daily)
```

A GitHub Action (`.github/workflows/build-fema-bids.yml`) runs the scanner once
a day, commits the refreshed feed, and the deploy workflow republishes the site.
The feed **accumulates**: each run reads what was posted since the last good
run (with a two-day overlap), merges it in, re-scores everything with the
current classifier, and drops postings that closed more than 30 days ago.

## Sources

| Source | What it covers | Key |
|---|---|---|
| **SAM.gov Opportunities API** | Every federal solicitation: FEMA, USACE debris missions, other federal buyers | `SAM_API_KEY` secret |
| **State and local RSS/Atom feeds** | County, city, parish, school-district and utility bid boards, where most PA work is actually bought | none; list them in `scripts/fema/feeds.json` |
| **OpenFEMA declarations** | Every declaration with PA in the last 3 years, with designated counties | none |

**Most PA work isn't federal.** The buyer is the subrecipient that took the
damage, and it posts on its own bid board, not SAM.gov. So the state/local feed
list is where coverage grows. Many CivicPlus city and county sites publish
their "Bid Postings" page as a feed at `https://<site>/RSSFeed.aspx?ModID=76`.
Add one entry per feed:

```json
{ "name": "Example County Purchasing", "url": "https://www.examplecounty.gov/RSSFeed.aspx?ModID=76", "state": "FL", "agency": "Example County, FL" }
```

It's fine to list a whole agency bid board: anything that doesn't score as PA
work is dropped. A feed that fails turns red in the Sources panel and doesn't
block the others.

The big commercial aggregators (BidNet Direct, DemandStar, Bonfire, OpenGov,
PlanetBids, GovSpend) have no free API, so they aren't scanned. A new adapter
in `scripts/fema/sources/` that returns `RawOpportunity[]` is all it takes to
add one.

### SAM.gov setup and budget

1. Sign in at sam.gov → **Account Details** → request a **Public API Key**.
2. In the GitHub repo: **Settings → Secrets and variables → Actions → New
   repository secret**, name `SAM_API_KEY`.
3. Run **Actions → Build FEMA PA bids → Run workflow**.

A personal key gets **10 requests a day**. A full scan is 8 (one per query in
`scripts/fema/sources/sam.ts`), so the workflow runs once a day. If a run hits
the budget or a rate limit, it keeps what it found and marks SAM.gov as partial,
so the next run re-reads the same window. The public API searches
**titles only**, so the queries are title keywords plus NAICS 562119.

## Scoring

A strong read needs **both** halves:

* **Disaster tie**: FEMA, Public Assistance, Stafford Act, a DR/EM number,
  "declared disaster", project worksheets, Category A–G, 2 CFR 200, a named
  hazard (hurricane, flood, tornado…).
* **PA-type work**: debris removal or monitoring, hazardous trees, PA consulting,
  cost recovery, emergency protective measures, temporary power or shelter,
  disaster damage repairs, damage assessment, hazard mitigation.

When both halves show up, the score gets a +15 bonus. With no disaster tie at
all, the score is capped below Core. Mitigation on its own stays Adjacent.

| Score | Tier |
|---|---|
| 60+ | Core PA |
| 35–59 | Likely PA |
| 15–34 | Adjacent |
| below 15 | dropped |

**Traps it filters out**, because PA vocabulary overlaps three other markets:

* IT "disaster recovery" (DRaaS, backup, failover)
* welfare "public assistance" (SNAP, TANF, Medicaid eligibility)
* stormwater and storm-drain work ("storm" that isn't a storm)
* plus flood insurance (NFIP), software licensing, and training/exercises

Each card's **Why it scored** lists every rule that fired, so you can check any
read by eye.

## The page

* Filter by search text, state, work category, tier, new this week, in a
  declared disaster area, or watchlist. Sort by relevance, due date, or newest.
* **Where the work is** ranks states by active PA declarations, with open-bid
  counts. Tap a state to filter. Declared counties are your future buyers, even
  before they post.
* DR numbers link to the FEMA disaster page.
* **Export CSV** exports the filtered list. The watchlist (★) lives in your browser.
* Until the scanner has run once, the page shows invented **sample data**
  under a banner.

## Commands

```sh
npm run verify:fema   # classifier + feed-parser checks (also run in CI before each scan)
npm run build:fema    # run the scanner locally (SAM_API_KEY=… optional)
npm run dev           # then open http://localhost:5173/fema.html
```
