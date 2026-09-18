"""Phase 1 CLI.

    python -m scraper --toi "04.0 Homeowners" --filing-type "Rate/Rule" \\
        --date-from 01/01/2023 --date-to 12/31/2025 --max-filings 25

    # Verify selectors against the live DOM before a real run:
    python -m scraper --inspect

Defaults to a HEADED browser (so you can watch it and solve any CAPTCHA); pass
--headless to run without a window.
"""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

from scraper import config
from scraper.browser import Session
from scraper.index import FilingIndex


def _setup_logging(verbose: bool) -> None:
    logging.basicConfig(
        level=logging.DEBUG if verbose else logging.INFO,
        format="%(asctime)s %(levelname)-7s %(name)s: %(message)s",
        datefmt="%H:%M:%S",
    )


def _inspect(headless: bool) -> int:
    """Dump the live search-form + results DOM so selectors can be verified."""

    from scraper.search import log_toi_options, open_search

    out_dir = config.DATA_DIR / "inspect"
    out_dir.mkdir(parents=True, exist_ok=True)
    log = logging.getLogger("scraper.inspect")
    with Session(headless=headless) as session:
        open_search(session)
        html = session.page.content()
        (out_dir / "search_form.html").write_text(html)
        session.page.screenshot(path=str(out_dir / "search_form.png"), full_page=True)
        log_toi_options(session)
        log.info("Wrote search-form DOM + screenshot to %s", out_dir)
        log.info("Compare against scraper/selectors.py and tune as needed.")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Scrape CT SERFF rate filings.")
    parser.add_argument("--toi", default="04.0 Homeowners", help="Type of Insurance filter")
    parser.add_argument("--filing-type", default="Rate/Rule",
                        help="Rate or Rate/Rule")
    parser.add_argument("--company", default=None, help="optional company-name filter")
    parser.add_argument("--date-from", default=None, help="submitted-from (MM/DD/YYYY)")
    parser.add_argument("--date-to", default=None, help="submitted-to (MM/DD/YYYY)")
    parser.add_argument("--max-filings", type=int, default=25)
    parser.add_argument("--headless", action="store_true", help="run without a window")
    parser.add_argument("--inspect", action="store_true",
                        help="dump the live DOM to verify selectors, then exit")
    parser.add_argument("--verbose", action="store_true")
    args = parser.parse_args(argv)

    _setup_logging(args.verbose)
    log = logging.getLogger("scraper")

    if args.inspect:
        return _inspect(args.headless)

    # Imported here so --inspect / --help don't require the full chain.
    from scraper.filing import process_filing
    from scraper.results import iter_result_links
    from scraper.search import open_search, run_search

    config.RAW_DIR.mkdir(parents=True, exist_ok=True)
    processed = 0
    skipped = 0

    with FilingIndex(config.INDEX_PATH) as index, Session(headless=args.headless) as session:
        log.info("Resume index has %d filing(s) already.", index.count())
        open_search(session)
        run_search(session, toi=args.toi, filing_type=args.filing_type,
                   company=args.company, date_from=args.date_from, date_to=args.date_to)

        for href in iter_result_links(session, max_filings=args.max_filings):
            # Derive a fallback tracking id from the URL for the resume check.
            fallback = _tracking_from_href(href)
            if fallback and index.has(fallback):
                log.info("Skipping already-indexed filing: %s", fallback)
                skipped += 1
                continue
            try:
                meta = process_filing(session, href, fallback_tracking=fallback)
                index.upsert(meta)
                processed += 1
            except Exception as exc:  # noqa: BLE001 - one bad filing shouldn't kill the run
                log.error("Failed to process %s: %s", href, exc)
            # Return to results list for the next iteration.
            session.page.go_back()

    log.info("Done. processed=%d skipped=%d total_indexed=%d",
             processed, skipped, FilingIndex(config.INDEX_PATH).count())
    return 0


def _tracking_from_href(href: str) -> str:
    import re

    m = re.search(r"([A-Z]{3,}-[A-Za-z0-9-]+)", href)
    return m.group(1) if m else ""


if __name__ == "__main__":
    sys.exit(main())
