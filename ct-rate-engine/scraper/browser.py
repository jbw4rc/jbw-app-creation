"""Playwright session helpers: launch, terms page, CAPTCHA pause, polite delays.

Heavy import of playwright is lazy so the rest of the package imports cheaply.
"""

from __future__ import annotations

import logging
import random
import time
from typing import TYPE_CHECKING, Any

from scraper import config, selectors

if TYPE_CHECKING:  # pragma: no cover
    from playwright.sync_api import Locator, Page

log = logging.getLogger("scraper.browser")


def polite_delay() -> None:
    """Sleep a random 2–5s to be a courteous guest."""

    time.sleep(random.uniform(config.MIN_DELAY_S, config.MAX_DELAY_S))


def first_visible(page: "Page", candidates: list[str], timeout_ms: int = 4000) -> "Locator | None":
    """Return the first candidate selector that resolves to a visible element."""

    for sel in candidates:
        try:
            loc = page.locator(sel).first
            loc.wait_for(state="visible", timeout=timeout_ms)
            return loc
        except Exception:  # noqa: BLE001 - try the next candidate
            continue
    return None


def accept_terms_if_present(page: "Page") -> bool:
    """Click the terms-of-use accept control if the page is showing it."""

    btn = first_visible(page, selectors.TERMS_ACCEPT_BUTTON, timeout_ms=3000)
    if btn:
        log.info("Terms-of-use page detected — accepting.")
        btn.click()
        polite_delay()
        return True
    return False


def captcha_present(page: "Page") -> bool:
    for sel in selectors.CAPTCHA_MARKERS:
        try:
            if page.locator(sel).first.is_visible(timeout=1000):
                return True
        except Exception:  # noqa: BLE001
            continue
    return False


def pause_for_manual_captcha(page: "Page", headless: bool) -> None:
    """Stop and ask the human to solve a CAPTCHA. Never tries to bypass it."""

    log.warning("=" * 70)
    log.warning("CAPTCHA / anti-bot challenge detected.")
    if headless:
        log.warning(
            "You are in --headless mode. Re-run WITHOUT --headless so you can "
            "solve the challenge in a visible browser window."
        )
        raise RuntimeError("CAPTCHA encountered in headless mode; re-run headed.")
    log.warning("Solve the challenge in the open browser window, then press ENTER here.")
    log.warning("=" * 70)
    try:
        input("Press ENTER once the CAPTCHA is solved... ")
    except EOFError:
        raise RuntimeError("No interactive stdin available to solve CAPTCHA.")
    polite_delay()


class Session:
    """Manages a Playwright browser/context/page lifecycle."""

    def __init__(self, headless: bool = False, downloads_dir: str | None = None):
        self.headless = headless
        self.downloads_dir = downloads_dir
        self._pw: Any = None
        self._browser: Any = None
        self.context: Any = None
        self.page: Any = None

    def __enter__(self) -> "Session":
        try:
            from playwright.sync_api import sync_playwright  # type: ignore
        except ImportError as exc:  # pragma: no cover - optional dep
            raise RuntimeError(
                "Playwright is required: pip install -e '.[scraper]' && playwright install chromium"
            ) from exc
        self._pw = sync_playwright().start()
        self._browser = self._pw.chromium.launch(headless=self.headless)
        self.context = self._browser.new_context(accept_downloads=True)
        self.context.set_default_timeout(config.NAV_TIMEOUT_MS)
        self.page = self.context.new_page()
        log.info("Browser launched (headless=%s).", self.headless)
        return self

    def __exit__(self, *exc: object) -> None:
        for closer in (self.context, self._browser):
            try:
                if closer:
                    closer.close()
            except Exception:  # noqa: BLE001
                pass
        if self._pw:
            self._pw.stop()
        log.info("Browser closed.")

    def guard(self) -> None:
        """Check for CAPTCHA and pause for manual solving if present."""

        if captcha_present(self.page):
            pause_for_manual_captcha(self.page, self.headless)
