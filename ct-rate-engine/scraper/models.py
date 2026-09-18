"""Data models for scraped filing metadata."""

from __future__ import annotations

import dataclasses
from dataclasses import dataclass, field


@dataclass
class FilingMetadata:
    """Metadata captured for a single SERFF filing."""

    serff_tracking_number: str
    company_name: str = ""
    naic: str = ""
    toi: str = ""
    sub_toi: str = ""
    filing_type: str = ""
    disposition_status: str = ""
    date_submitted: str = ""
    effective_date: str = ""
    overall_rate_impact: str = ""
    line: str = "homeowners"  # our classification: homeowners | flood
    detail_url: str = ""
    files: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return dataclasses.asdict(self)

    @property
    def company_slug(self) -> str:
        import re

        return re.sub(r"[^a-z0-9]+", "_", self.company_name.lower()).strip("_") or "unknown"
