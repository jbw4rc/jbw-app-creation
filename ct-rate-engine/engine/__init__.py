"""Phase 3 — config-driven rating engine.

Loads a per-carrier rating manual (the normalized JSON produced by the Phase 2
extractor) and computes an auditable premium estimate from a home profile.
"""

from engine.models import CarrierManual, HomeProfile, QuoteResult
from engine.rating import quote

__all__ = ["CarrierManual", "HomeProfile", "QuoteResult", "quote"]
