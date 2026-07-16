"""Iterate paginated search results, yielding a locator/URL per filing row."""

from __future__ import annotations

import logging
from collections.abc import Iterator

from scraper import selectors
from scraper.browser import Session, first_visible, polite_delay

log = logging.getLogger("scraper.results")


def iter_result_links(session: Session, max_filings: int) -> Iterator[str]:
    """Yield up to ``max_filings`` detail-page URLs across result pages.

    We collect hrefs page-by-page (rather than holding stale locators) so that
    navigating into a filing and back doesn't invalidate our iteration.
    """

    page = session.page
    yielded = 0
    page_num = 1

    while yielded < max_filings:
        log.info("Reading results page %d.", page_num)
        rows = None
        for sel in selectors.RESULTS_ROWS:
            loc = page.locator(sel)
            try:
                if loc.count() > 0:
                    rows = loc
                    break
            except Exception:  # noqa: BLE001
                continue
        if not rows or rows.count() == 0:
            log.info("No result rows on page %d — stopping.", page_num)
            return

        hrefs: list[str] = []
        for i in range(rows.count()):
            row = rows.nth(i)
            link = None
            for lsel in selectors.RESULT_ROW_LINK:
                cand = row.locator(lsel).first
                try:
                    if cand.count() > 0:
                        link = cand
                        break
                except Exception:  # noqa: BLE001
                    continue
            if link is None:
                continue
            try:
                href = link.get_attribute("href") or ""
            except Exception:  # noqa: BLE001
                href = ""
            if href:
                hrefs.append(href)

        log.info("Found %d filing link(s) on page %d.", len(hrefs), page_num)
        for href in hrefs:
            if yielded >= max_filings:
                return
            yielded += 1
            yield href

        # Advance to the next page if one exists.
        nxt = first_visible(page, selectors.NEXT_PAGE, timeout_ms=3000)
        if not nxt:
            log.info("No next page — pagination complete.")
            return
        try:
            disabled = nxt.get_attribute("aria-disabled") == "true" or \
                "ui-state-disabled" in (nxt.get_attribute("class") or "")
        except Exception:  # noqa: BLE001
            disabled = False
        if disabled:
            log.info("Next-page control disabled — pagination complete.")
            return
        log.info("Advancing to next results page.")
        nxt.click()
        polite_delay()
        session.guard()
        page_num += 1
