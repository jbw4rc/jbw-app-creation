"""Fill and submit the SFA search form; log the live TOI options.

Every dropdown selection is attempted through several strategies (native
<select>, PrimeFaces widget) and each navigation step is logged.
"""

from __future__ import annotations

import logging

from scraper import config, selectors
from scraper.browser import Session, first_visible, polite_delay

log = logging.getLogger("scraper.search")


def open_search(session: Session) -> None:
    """Navigate to the CT SFA landing page, accept terms, and open the search."""

    from scraper.browser import accept_terms_if_present

    page = session.page
    log.info("Navigating to SFA home: %s", config.SFA_HOME_URL)
    page.goto(config.SFA_HOME_URL)
    session.guard()
    accept_terms_if_present(page)

    begin = first_visible(page, selectors.BEGIN_SEARCH)
    if begin:
        log.info("Clicking 'Begin Search'.")
        begin.click()
        polite_delay()
    accept_terms_if_present(page)  # terms sometimes appear after Begin Search
    session.guard()


def log_toi_options(session: Session) -> list[str]:
    """Read and log every TOI option offered by the live dropdown."""

    page = session.page
    options: list[str] = []
    for sel in selectors.TOI_OPTIONS:
        try:
            els = page.locator(sel)
            n = els.count()
            if n:
                options = [els.nth(i).inner_text().strip() for i in range(n)]
                break
        except Exception:  # noqa: BLE001
            continue
    if options:
        log.info("Live TOI dropdown options (%d):", len(options))
        for opt in options:
            log.info("    TOI: %s", opt)
    else:
        log.warning("Could not read TOI options — verify selectors against live DOM.")
    return options


def _select_dropdown(session: Session, candidates: list[str], value: str) -> bool:
    """Select ``value`` in a dropdown, trying native <select> then widget click."""

    page = session.page
    loc = first_visible(page, candidates)
    if not loc:
        log.warning("Dropdown not found for value %r.", value)
        return False
    # Native <select>?
    try:
        if loc.evaluate("el => el.tagName.toLowerCase()") == "select":
            loc.select_option(label=value)
            log.info("Selected %r (native select).", value)
            return True
    except Exception:  # noqa: BLE001
        pass
    # PrimeFaces widget: click to open, then click the labeled option.
    try:
        loc.click()
        polite_delay()
        opt = page.locator(f"li[role='option']:has-text('{value}')").first
        opt.wait_for(state="visible", timeout=4000)
        opt.click()
        log.info("Selected %r (widget).", value)
        return True
    except Exception as exc:  # noqa: BLE001
        log.warning("Failed to select %r: %s", value, exc)
        return False


def run_search(
    session: Session,
    toi: str,
    filing_type: str,
    company: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
) -> None:
    """Fill the search filters and submit."""

    page = session.page
    log.info("Filling search: business_type=%r toi=%r filing_type=%r company=%r dates=%s..%s",
             config.BUSINESS_TYPE, toi, filing_type, company, date_from, date_to)

    _select_dropdown(session, selectors.BUSINESS_TYPE_DROPDOWN, config.BUSINESS_TYPE)
    log_toi_options(session)
    _select_dropdown(session, selectors.TOI_DROPDOWN, toi)
    _select_dropdown(session, selectors.FILING_TYPE_DROPDOWN, filing_type)

    if company:
        loc = first_visible(page, selectors.COMPANY_INPUT)
        if loc:
            loc.fill(company)
            log.info("Company filter: %s", company)
    if date_from:
        loc = first_visible(page, selectors.DATE_FROM_INPUT)
        if loc:
            loc.fill(date_from)
            log.info("Date from: %s", date_from)
    if date_to:
        loc = first_visible(page, selectors.DATE_TO_INPUT)
        if loc:
            loc.fill(date_to)
            log.info("Date to: %s", date_to)

    submit = first_visible(page, selectors.SEARCH_SUBMIT)
    if not submit:
        raise RuntimeError("Search submit button not found — verify selectors.")
    log.info("Submitting search.")
    submit.click()
    polite_delay()
    session.guard()
