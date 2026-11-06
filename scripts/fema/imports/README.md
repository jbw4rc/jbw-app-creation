# CSV imports

Some portals ask automated tools not to crawl them, or turn them away, but let
a person export search results as CSV. Put those exports here. Every scanner
run reads every `.csv` in this folder.

**Start each file name with the two-letter state**, then anything:
`TX-esbd-2026-11-06.csv`, `GA-gpr-week45.csv`.

The importer finds columns by header name (Title, Solicitation ID,
Agency, Status, Posting Date, Response Due Date, NIGP Codes …), so exports from
most portals work as-is. Closed, cancelled and awarded rows are skipped. Rows
that don't score as PA work are dropped, so export broad searches.

## Texas — ESBD

The ESBD's robots.txt disallows all crawling, so the scanner doesn't read it
directly. Texas ESBD lists state agencies plus hundreds of counties, cities,
school districts and utility districts, so it's worth exporting regularly:

1. Open <https://www.txsmartbuy.gov/esbd> and set **Status: Posted**.
   A keyword such as `debris`, `disaster`, `FEMA`, `hurricane` or `emergency`
   narrows it. Leaving it blank exports everything, which also works.
2. Click **Export to CSV** (up to 20,000 rows).
3. Save it here as `TX-esbd-<date>.csv`, then commit and push. The next scan
   picks it up.

Old exports can stay: a posting that closes ages out on its own, and re-importing
the same posting updates it in place instead of duplicating it.
