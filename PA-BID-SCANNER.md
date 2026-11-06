# PA Bid Scanner — FEMA Public Assistance RFPs & RFQs

A nationwide board of solicitations for work that FEMA Public Assistance pays
for: debris removal, debris monitoring, PA consulting and grant management,
emergency protective measures, permanent repairs, and disaster engineering.
Each posting is scored for relevance, explained, and tied to the disaster
declarations behind it.

Lives at `/fema.html`. It shares the build with the NBA and NFL apps and nothing else.

## How it works

```
 NC eVP, LA LaPAC ─┐
 CSV imports (TX…) ─┤
 SAM.gov API ───────┼─► scripts/fema/build-fema-bids.ts ─► src/fema/data/feed.ts ─► /fema.html
 Extra RSS feeds ───┤     (classify · merge · prune)          (committed daily)
 OpenFEMA API ──────┘
```

A GitHub Action (`.github/workflows/build-fema-bids.yml`) runs the scanner once
a day, commits the refreshed feed, and the deploy workflow republishes the site.
The feed **accumulates**: each run reads what was posted since the last good
run (with a two-day overlap), merges it in, re-scores everything with the
current classifier, and drops postings that closed more than 30 days ago.

## Sources

| Source | What it covers | How |
|---|---|---|
| **North Carolina eVP** | State agencies **plus local buyers**: Raleigh, Asheville, Mecklenburg, Cumberland, Cary, school systems… | scraped daily, no key |
| **Louisiana LaPAC** | State agencies plus the parishes and cities that post there ("Non State" departments, e.g. Jefferson Parish, City of Mandeville) | scraped daily, no key |
| **CSV imports** | Any portal you can export from. Start with **Texas ESBD** (state + hundreds of counties, cities, ISDs) | drop files in `scripts/fema/imports/` |
| **SAM.gov Opportunities API** | Every federal solicitation: FEMA, USACE debris missions, other federal buyers | `SAM_API_KEY` secret |
| **Extra RSS/Atom feeds** | Any single agency bid board that publishes a feed | list them in `scripts/fema/feeds.json` |
| **OpenFEMA declarations** | Every declaration with PA in the last 3 years, with designated counties | no key |

**Most PA work isn't federal.** The buyer is the subrecipient that took the
damage: the county, city, parish, school district or utility. That's why the
state portals matter. In North Carolina and Louisiana, the state portal also
carries many local buyers.

On the first live read (Nov 6, 2026), the two state scrapers found, among others:
an on-call FEMA advisory RFP (Town of Rolesville, NC), emergency debris
monitoring (City of Mandeville, LA), post-disaster damage assessments
(Jefferson Parish, LA), and Hurricane Helene buyout/demolition bids (NC
Department of Public Safety).

### State portal status

| State | Portal | Status |
|---|---|---|
| NC | eVP | **Scraped.** Reads the public solicitations grid the page itself loads, newest first, until it passes the read window. |
| LA | LaPAC | **Scraped.** Reads all ~37 department listings (plain HTML, robots.txt allows). |
| TX | ESBD | **CSV import.** robots.txt is `Disallow: /`, so the scanner doesn't crawl it. See `scripts/fema/imports/README.md`. |
| GA | Georgia Procurement Registry | **CSV import.** The site rejects non-browser clients, and the scanner doesn't pretend to be a browser. |
| FL | MyFloridaMarketPlace (VIP) | Not yet. It's a JavaScript app with no public data endpoint found. Use a CSV export. |
| SC | SCBO → SCPro | Not yet. South Carolina moves to its new SCPro portal on Nov 9, 2026. Revisit after the launch. |

Each scraper sends an honest User-Agent (`fema-pa-bid-scanner/1.0`) and waits
between requests to the same site. Each portal's robots.txt was checked by hand
before its scraper was written (Nov 2026). The scanner doesn't re-check it on
every run, so look again if a portal changes hands. A portal that
fails turns red in the Sources panel. The run continues, and that portal's
earlier postings stay on the board.

**CivicPlus city/county sites:** the earlier version of this doc said their bid
feed lives at `/RSSFeed.aspx?ModID=76`. That was wrong. On the sites checked,
ModID 76 is the general "Pages" feed. Find a site's feeds at `/rss.aspx` and
open one to confirm its items are bids before adding it to `feeds.json`.

The big commercial aggregators (BidNet Direct, DemandStar, Bonfire, OpenGov,
PlanetBids, GovSpend) have no free public API, so they aren't scanned. Most
let you export results, and those exports work as CSV imports.

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
