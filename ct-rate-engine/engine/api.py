"""FastAPI service: POST a home profile, get every carrier's estimate side by side.

Run with:  uvicorn engine.api:app --reload
"""

from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI

from engine.models import CarrierManual, HomeProfile, QuoteResult
from engine.quote import DEFAULT_CARRIERS_DIR, load_manuals
from engine.rating import quote

app = FastAPI(
    title="CT Rate Engine",
    description="Side-by-side homeowners / private-flood premium estimates from "
    "extracted SERFF rate filings. Estimates are NOT bindable quotes.",
    version="0.1.0",
)

_CARRIERS_DIR = Path(DEFAULT_CARRIERS_DIR)


def _manuals() -> list[CarrierManual]:
    return load_manuals(_CARRIERS_DIR)


@app.get("/health")
def health() -> dict[str, object]:
    return {"status": "ok", "carriers_loaded": len(_manuals())}


@app.get("/carriers")
def carriers() -> list[dict[str, object]]:
    return [
        {
            "carrier": m.carrier,
            "serff_tracking": m.serff_tracking,
            "line": m.line,
            "effective_date": m.effective_date,
            "partial": bool(m.gaps),
        }
        for m in _manuals()
    ]


@app.post("/quote", response_model=list[QuoteResult])
def quote_all(profile: HomeProfile, as_of_year: int | None = None) -> list[QuoteResult]:
    results = [quote(m, profile, as_of_year=as_of_year) for m in _manuals()]
    results.sort(key=lambda r: (r.partial, r.premium))
    return results
