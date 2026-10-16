"""Phase 1 — SERFF Filing Access (SFA) scraper for Connecticut.

Playwright-driven. There is no public SERFF API; this drives the public web UI
at https://filingaccess.serff.com/sfa/home/CT , handles the terms-of-use page,
rate-limits politely, and pauses for manual CAPTCHA solving rather than trying
to bypass it.

IMPORTANT: the selectors in ``scraper.selectors`` were written against the
documented structure of the SFA UI and MUST be verified against the live DOM.
Run ``python -m scraper --inspect`` in an environment with network access to
dump the real search-form + results DOM, then tune ``selectors.py``.
"""

from scraper.models import FilingMetadata

__all__ = ["FilingMetadata"]
