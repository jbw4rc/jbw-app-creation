"""Resumable SQLite index of scraped filings.

Lets ``python -m scraper`` be re-run incrementally: filings already recorded are
skipped. Uses only the stdlib ``sqlite3`` so it has no install cost.
"""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path

from scraper.models import FilingMetadata

_SCHEMA = """
CREATE TABLE IF NOT EXISTS filings (
    serff_tracking_number TEXT PRIMARY KEY,
    company_name TEXT,
    naic TEXT,
    toi TEXT,
    filing_type TEXT,
    line TEXT,
    disposition_status TEXT,
    date_submitted TEXT,
    effective_date TEXT,
    overall_rate_impact TEXT,
    detail_url TEXT,
    files_json TEXT,
    scraped_at TEXT DEFAULT CURRENT_TIMESTAMP
);
"""


class FilingIndex:
    def __init__(self, path: Path):
        self.path = path
        path.parent.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(str(path))
        self._conn.execute(_SCHEMA)
        self._conn.commit()

    def has(self, serff_tracking_number: str) -> bool:
        cur = self._conn.execute(
            "SELECT 1 FROM filings WHERE serff_tracking_number = ?",
            (serff_tracking_number,),
        )
        return cur.fetchone() is not None

    def upsert(self, meta: FilingMetadata) -> None:
        self._conn.execute(
            """
            INSERT INTO filings (serff_tracking_number, company_name, naic, toi,
                filing_type, line, disposition_status, date_submitted,
                effective_date, overall_rate_impact, detail_url, files_json)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
            ON CONFLICT(serff_tracking_number) DO UPDATE SET
                company_name=excluded.company_name,
                naic=excluded.naic,
                toi=excluded.toi,
                filing_type=excluded.filing_type,
                line=excluded.line,
                disposition_status=excluded.disposition_status,
                date_submitted=excluded.date_submitted,
                effective_date=excluded.effective_date,
                overall_rate_impact=excluded.overall_rate_impact,
                detail_url=excluded.detail_url,
                files_json=excluded.files_json
            """,
            (
                meta.serff_tracking_number, meta.company_name, meta.naic, meta.toi,
                meta.filing_type, meta.line, meta.disposition_status,
                meta.date_submitted, meta.effective_date, meta.overall_rate_impact,
                meta.detail_url, json.dumps(meta.files),
            ),
        )
        self._conn.commit()

    def count(self) -> int:
        return int(self._conn.execute("SELECT COUNT(*) FROM filings").fetchone()[0])

    def close(self) -> None:
        self._conn.close()

    def __enter__(self) -> "FilingIndex":
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()
