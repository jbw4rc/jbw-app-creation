"""Tests for the resumable SQLite index (stdlib only, no Playwright needed)."""

from __future__ import annotations

from pathlib import Path

from scraper.index import FilingIndex
from scraper.models import FilingMetadata


def test_upsert_and_resume(tmp_path: Path) -> None:
    idx_path = tmp_path / "index.sqlite"
    meta = FilingMetadata(
        serff_tracking_number="ACME-CT-0001",
        company_name="Acme Insurance Co",
        toi="04.0 Homeowners",
        filing_type="Rate/Rule",
        files=["manual.pdf", "memo.pdf"],
    )
    with FilingIndex(idx_path) as index:
        assert index.has("ACME-CT-0001") is False
        index.upsert(meta)
        assert index.has("ACME-CT-0001") is True
        assert index.count() == 1
        # Upsert again — count stays 1 (resume-safe).
        meta.disposition_status = "Approved"
        index.upsert(meta)
        assert index.count() == 1

    # Re-open: state persisted.
    with FilingIndex(idx_path) as index:
        assert index.has("ACME-CT-0001") is True


def test_company_slug() -> None:
    meta = FilingMetadata(serff_tracking_number="X", company_name="Foo & Bar, Inc.")
    assert meta.company_slug == "foo_bar_inc"
    assert FilingMetadata(serff_tracking_number="X").company_slug == "unknown"
