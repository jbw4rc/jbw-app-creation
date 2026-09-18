"""Open a filing detail page, scrape metadata, download tab attachments, manifest.

Downloads land in ``data/raw/{company_slug}/{serff_tracking_number}/`` alongside
a ``manifest.json`` holding the metadata + file list.
"""

from __future__ import annotations

import json
import logging
import re
from pathlib import Path
from urllib.parse import urljoin

from scraper import config, selectors
from scraper.browser import Session, first_visible, polite_delay
from scraper.models import FilingMetadata

log = logging.getLogger("scraper.filing")


def _classify_line(toi: str, sub_toi: str) -> str:
    hay = f"{toi} {sub_toi}".lower()
    if "flood" in hay:
        return "flood"
    return "homeowners"


def _read_field_value(session: Session, label_candidates: list[str]) -> str:
    """Best-effort: find a label element and return its adjacent value text."""

    page = session.page
    for sel in label_candidates:
        loc = page.locator(sel).first
        try:
            if loc.count() == 0:
                continue
            # Try the following sibling / next cell first.
            for rel in ("xpath=following-sibling::*[1]", "xpath=following::td[1]",
                        "xpath=../following-sibling::*[1]"):
                val = loc.locator(rel).first
                try:
                    if val.count() > 0:
                        txt = (val.inner_text() or "").strip()
                        if txt:
                            return txt
                except Exception:  # noqa: BLE001
                    continue
        except Exception:  # noqa: BLE001
            continue
    return ""


def scrape_metadata(session: Session, detail_url: str, fallback_tracking: str = "") -> FilingMetadata:
    page = session.page
    fields: dict[str, str] = {}
    for name, cands in selectors.DETAIL_FIELD.items():
        fields[name] = _read_field_value(session, cands)

    tracking = fields.get("serff_tracking_number") or fallback_tracking
    tracking = re.sub(r"[^A-Za-z0-9-]", "", tracking) or fallback_tracking

    meta = FilingMetadata(
        serff_tracking_number=tracking,
        company_name=fields.get("company_name", ""),
        naic=fields.get("naic", ""),
        toi=fields.get("toi", ""),
        sub_toi=fields.get("sub_toi", ""),
        filing_type=fields.get("filing_type", ""),
        disposition_status=fields.get("disposition_status", ""),
        date_submitted=fields.get("date_submitted", ""),
        effective_date=fields.get("effective_date", ""),
        overall_rate_impact=fields.get("overall_rate_impact", ""),
        detail_url=detail_url,
    )
    meta.line = _classify_line(meta.toi, meta.sub_toi)
    log.info("Metadata: %s | %s | %s | %s", meta.serff_tracking_number,
             meta.company_name, meta.toi, meta.filing_type)
    return meta


def _open_tab(session: Session, tab_name: str) -> bool:
    page = session.page
    for template in selectors.FILING_TAB:
        sel = template.format(name=tab_name)
        loc = page.locator(sel).first
        try:
            if loc.count() > 0 and loc.is_visible():
                loc.click()
                polite_delay()
                log.info("Opened tab: %s", tab_name)
                return True
        except Exception:  # noqa: BLE001
            continue
    log.info("Tab not found (may be empty/absent): %s", tab_name)
    return False


def _download_attachments(session: Session, dest: Path) -> list[str]:
    page = session.page
    saved: list[str] = []
    # Gather hrefs from every attachment-link strategy.
    hrefs: list[str] = []
    for sel in selectors.ATTACHMENT_LINK:
        loc = page.locator(sel)
        try:
            for i in range(loc.count()):
                href = loc.nth(i).get_attribute("href")
                if href:
                    hrefs.append(href)
        except Exception:  # noqa: BLE001
            continue
    hrefs = list(dict.fromkeys(hrefs))  # de-dupe, keep order

    for idx, href in enumerate(hrefs):
        try:
            # A real click triggers Playwright's download handling (best for
            # server-generated files behind JSF actions).
            link = page.locator(f"a[href='{href}']").first
            with page.expect_download(timeout=config.NAV_TIMEOUT_MS) as dl_info:
                link.click()
            download = dl_info.value
            suggested = download.suggested_filename or f"attachment_{idx}.pdf"
            out = dest / _safe_name(suggested)
            download.save_as(str(out))
            saved.append(out.name)
            log.info("Downloaded: %s", out.name)
            polite_delay()
        except Exception as exc:  # noqa: BLE001
            log.warning("Attachment download failed for %s: %s", href, exc)
    return saved


def _safe_name(name: str) -> str:
    name = re.sub(r"[^A-Za-z0-9._-]", "_", name)
    if not name.lower().endswith(".pdf"):
        name += ".pdf"
    return name


def process_filing(session: Session, detail_url: str, fallback_tracking: str = "") -> FilingMetadata:
    """Navigate into a filing, scrape metadata, download target-tab PDFs, manifest."""

    page = session.page
    full_url = urljoin(config.SFA_HOME_URL, detail_url)
    log.info("Opening filing detail: %s", full_url)
    page.goto(full_url)
    session.guard()

    meta = scrape_metadata(session, full_url, fallback_tracking=fallback_tracking)
    dest = config.RAW_DIR / meta.company_slug / (meta.serff_tracking_number or "unknown")
    dest.mkdir(parents=True, exist_ok=True)

    all_files: list[str] = []
    for tab in config.TARGET_TABS:
        if _open_tab(session, tab):
            all_files.extend(_download_attachments(session, dest))
    meta.files = all_files

    manifest = dest / "manifest.json"
    manifest.write_text(json.dumps(meta.to_dict(), indent=2))
    log.info("Wrote manifest with %d file(s): %s", len(all_files), manifest)
    return meta
