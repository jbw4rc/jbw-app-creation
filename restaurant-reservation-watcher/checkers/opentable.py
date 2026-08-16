"""
OpenTable availability checker.

OpenTable doesn't expose a documented public API, and its site is protected
by bot-detection (Akamai) that a plain HTTP client will often get blocked
by. Rather than reverse-engineer a private endpoint that will silently
break, this loads the restaurant's real public booking widget in a headless
browser and reads the same time-slot buttons a human visitor sees.

This is inherently the most fragile part of the whole tool: OpenTable can
change its page structure at any time. If find_slots() starts returning
zero results even for dates you know are wide open, set WATCHER_DEBUG=1 to
dump the rendered HTML to disk and check whether the selectors below still
match, rather than assuming the restaurant is actually full.
"""
import os
from datetime import datetime
from urllib.parse import urlencode

from playwright.sync_api import sync_playwright

USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
)

# Known-good as of writing; OpenTable may rename these data-test attributes.
SLOT_SELECTORS = [
    '[data-test="time-slot"]',
    '[data-test*="timeslot"]',
    'a[data-test*="time"]',
    'button[data-test*="time"]',
]

SOLD_OUT_MARKERS = ("fully booked", "no times available", "sold out")


def find_slots(slug: str, day: str, party_size: int, headless: bool = True) -> list[dict]:
    dt = datetime.strptime(day, "%Y-%m-%d").strftime("%Y-%m-%dT19:00")
    params = {"covers": party_size, "dateTime": dt}
    url = f"https://www.opentable.com/r/{slug}?{urlencode(params)}"

    results: list[dict] = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=headless)
        page = browser.new_page(user_agent=USER_AGENT)
        try:
            page.goto(url, timeout=30000, wait_until="domcontentloaded")
            try:
                page.wait_for_selector(", ".join(SLOT_SELECTORS), timeout=8000)
            except Exception:
                pass  # no slots rendered in time -- could be sold out, could be a selector drift

            seen_times = set()
            for selector in SLOT_SELECTORS:
                for el in page.query_selector_all(selector):
                    text = (el.inner_text() or "").strip()
                    if text and text not in seen_times:
                        seen_times.add(text)
                        results.append({
                            "date": day,
                            "party_size": party_size,
                            "time": text,
                        })

            if not results and os.environ.get("WATCHER_DEBUG"):
                debug_path = f"debug_opentable_{slug}_{day}_{party_size}.html"
                with open(debug_path, "w") as f:
                    f.write(page.content())
                print(f"[opentable] no slots found; dumped page to {debug_path} for inspection")
        finally:
            browser.close()

    return results
