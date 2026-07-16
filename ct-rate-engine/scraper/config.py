"""Scraper configuration: endpoints, TOI codes, and polite-scraping knobs."""

from __future__ import annotations

from pathlib import Path

# The CT SERFF Filing Access landing page. "Begin Search" leads to the search UI.
SFA_HOME_URL = "https://filingaccess.serff.com/sfa/home/CT"
SFA_SEARCH_URL = "https://filingaccess.serff.com/sfa/search/filingSearch.xhtml"

# Business type we care about.
BUSINESS_TYPE = "Property & Casualty (P&C)"

# Type-of-insurance codes of interest. The live TOI dropdown is authoritative —
# the scraper LOGS every option it sees so these can be confirmed at runtime.
HOMEOWNERS_TOIS = [
    "04.0 Homeowners",
    "04.0000 Homeowners Sub-TOI Combinations",
    "04.0001 Homeowners",  # HO-3 style
    "04.0002 Tenants",     # HO-4
    "04.0003 Condominiums",  # HO-6
]
# Private flood is filed under a personal-lines flood/property TOI; the exact
# code varies by carrier. Inspect the live dropdown and confirm.
FLOOD_TOIS = [
    "04.0 Homeowners",  # some carriers endorse flood onto HO
    "09.0 Inland Marine",  # some private flood is filed here
    "05.1 Personal Flood",  # if present
    "01.0 Property",
]

FILING_TYPES = ["Rate", "Rate/Rule"]

# Polite rate limiting (seconds) — a random delay in this range between actions.
MIN_DELAY_S = 2.0
MAX_DELAY_S = 5.0

# Where downloads and the resume index live.
PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = PROJECT_ROOT / "data"
RAW_DIR = DATA_DIR / "raw"
INDEX_PATH = DATA_DIR / "index.sqlite"

# Tabs inside a filing that hold the documents we want.
TARGET_TABS = ["Rate/Rule Schedule", "Supporting Documentation"]

# Default navigation timeout (ms).
NAV_TIMEOUT_MS = 45_000
