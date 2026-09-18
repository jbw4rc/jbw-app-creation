"""Centralized SFA selectors — the ONE place to tune when the DOM shifts.

⚠️  These were written from the documented SFA structure, NOT verified against a
live DOM in this environment (network access to filingaccess.serff.com was
unavailable). Before relying on the scraper, run:

    python -m scraper --inspect

which dumps the live search-form and results DOM to ``data/inspect/`` so you can
confirm/correct every selector below.

Each selector is a LIST of candidate strategies tried in order, so the scraper
degrades gracefully as the site changes. Prefer role/text selectors (stable)
over generated ids (JSF/PrimeFaces ids like ``j_idt123`` are volatile).
"""

from __future__ import annotations

# --- Terms of use acceptance page ---
TERMS_ACCEPT_BUTTON = [
    "role=button[name=/accept/i]",
    "role=link[name=/accept/i]",
    "text=/I have read and agree/i",
    "input[type=submit][value*='Accept' i]",
    "button:has-text('Accept')",
]

# --- Landing page ---
BEGIN_SEARCH = [
    "role=link[name=/begin search/i]",
    "role=button[name=/begin search/i]",
    "text=/begin search/i",
    "a:has-text('Begin Search')",
]

# --- Search form fields ---
# PrimeFaces dropdowns render as a styled widget; we click the trigger then pick
# the labeled option. Selectors target the label text where possible.
BUSINESS_TYPE_DROPDOWN = [
    "label:has-text('Business Type') >> xpath=following::*[self::div or self::select][1]",
    "select[id*='businessType' i]",
    "div[id*='businessType' i]",
]
TOI_DROPDOWN = [
    "label:has-text('Type of Insurance') >> xpath=following::*[self::div or self::select][1]",
    "select[id*='toi' i]",
    "div[id*='toi' i]",
]
TOI_OPTIONS = [
    "select[id*='toi' i] option",
    "ul[id*='toi' i] li",
    "div[id*='toi' i] li[role='option']",
]
FILING_TYPE_DROPDOWN = [
    "label:has-text('Filing Type') >> xpath=following::*[self::div or self::select][1]",
    "select[id*='filingType' i]",
    "div[id*='filingType' i]",
]
COMPANY_INPUT = [
    "label:has-text('Company') >> xpath=following::input[1]",
    "input[id*='companyName' i]",
    "input[name*='company' i]",
]
DATE_FROM_INPUT = [
    "label:has-text('Date Submitted') >> xpath=following::input[1]",
    "input[id*='dateFrom' i]",
    "input[id*='beginDate' i]",
]
DATE_TO_INPUT = [
    "label:has-text('Date Submitted') >> xpath=following::input[2]",
    "input[id*='dateTo' i]",
    "input[id*='endDate' i]",
]
SEARCH_SUBMIT = [
    "role=button[name=/^search$/i]",
    "input[type=submit][value*='Search' i]",
    "button:has-text('Search')",
]

# --- Results table ---
RESULTS_TABLE = [
    "table[id*='results' i]",
    "div[id*='searchResults' i] table",
    "table:has(th:has-text('SERFF'))",
]
RESULTS_ROWS = [
    "table[id*='results' i] tbody tr",
    "div[id*='searchResults' i] table tbody tr",
    "table:has(th:has-text('SERFF')) tbody tr",
]
# Link that opens a filing's detail page (usually the tracking number).
RESULT_ROW_LINK = [
    "a[href*='filingSummary' i]",
    "a[href*='details' i]",
    "td a",
]
NEXT_PAGE = [
    "role=link[name=/next/i]",
    "a[aria-label='Next Page']",
    ".ui-paginator-next",
    "text=/next/i",
]

# --- Filing detail page ---
# Metadata is usually a labeled key/value grid on the summary tab.
DETAIL_FIELD = {
    "serff_tracking_number": ["text=/SERFF Tracking/i", "th:has-text('SERFF Tracking')"],
    "company_name": ["text=/Company Name/i", "th:has-text('Company')"],
    "naic": ["text=/NAIC/i"],
    "toi": ["text=/TOI/i", "text=/Type of Insurance/i"],
    "sub_toi": ["text=/Sub-TOI/i"],
    "filing_type": ["text=/Filing Type/i"],
    "disposition_status": ["text=/Disposition/i", "text=/Status/i"],
    "date_submitted": ["text=/Date Submitted/i", "text=/Submission Date/i"],
    "effective_date": ["text=/Effective Date/i"],
    "overall_rate_impact": ["text=/Overall.*Impact/i", "text=/Rate Impact/i", "text=/% Change/i"],
}

# Tabs inside the filing. Matched by visible text (see config.TARGET_TABS).
FILING_TAB = [
    "role=tab[name={name}]",
    "a:has-text('{name}')",
    "text={name}",
]
# Attachment links within a tab's schedule/document list.
ATTACHMENT_LINK = [
    "a[href*='.pdf' i]",
    "a[href*='retrieveFile' i]",
    "a[href*='downloadFile' i]",
    "a:has-text('.pdf')",
]

# --- CAPTCHA / anti-bot detection ---
CAPTCHA_MARKERS = [
    "iframe[src*='recaptcha']",
    "iframe[title*='captcha' i]",
    "text=/i'm not a robot/i",
    "div.g-recaptcha",
    "text=/verify you are human/i",
]
