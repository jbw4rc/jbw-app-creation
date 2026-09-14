"""Extraction helper tests.

No real filing is committed (the PDFs are gitignored and some are restricted),
so these build a small filing-shaped PDF and run the pipeline over it. That
covers what the helper actually promises: find the pages, render them, write the
prompts, assemble a draft, and make sure the draft cannot rate anything.
"""

import json

import pytest

from src.extract import (
    UNVERIFIED_MARKER,
    build_draft,
    render_page,
    triage,
    write_draft,
    write_jobs,
)
from src.interpreter import PlanNotVerifiedError, RatingError, load_plan, rate

from .conftest import AS_OF, FIXTURES

pymupdf = pytest.importorskip("pymupdf", reason="PDF tests need PyMuPDF")


# A stand-in filing: a cover page with no tables, a territory page, a factor
# page, and a worked example. Roughly the shape of the real thing.
_PAGES = [
    (
        "SAMPLE MUTUAL INSURANCE COMPANY\nConnecticut Homeowners Program\n\n"
        "Filed under SERFF tracking SAMP-134567890.\nThis filing revises rates "
        "effective January 1, 2026 for new and renewal business.\n"
    ),
    (
        "TERRITORY DEFINITIONS - CONNECTICUT\n\n"
        "ZIP Code    Territory\n"
        + "\n".join(
            f"{z}          {t}"
            for z, t in [
                ("06605", "1"), ("06614", "1"), ("06824", "1"), ("06853", "1"),
                ("06880", "1"), ("06902", "1"), ("06239", "2"), ("06260", "2"),
                ("06333", "2"), ("06371", "2"), ("06759", "2"), ("06103", "3"),
                ("06105", "3"), ("06106", "3"), ("06050", "3"), ("06489", "3"),
            ]
        )
    ),
    (
        "RULE 303 - PROTECTION CLASS FACTORS\n\n"
        "Protection Class    Factor\n"
        "1 - 4               1.000\n"
        "5                   1.065\n"
        "6                   1.140\n"
        "7                   1.230\n"
        "8                   1.350\n"
        "9                   1.720\n"
        "10                  2.280\n"
        "All other           1.450\n\n"
        "Note: Class 10W applies where the dwelling is within 1,000 feet of a "
        "hydrant but beyond 5 road miles of a responding station."
    ),
    (
        "APPENDIX A - RATING EXAMPLE 1\n\n"
        "Dwelling at Hartford, CT 06105. Coverage A $450,000, masonry, built "
        "1955, Protection Class 7, $2,500 deductible, one prior claim.\n\n"
        "Base premium                 $1,414.50\n"
        "Protection class factor          1.230\n"
        "Construction factor              0.945\n"
        "Deductible factor                0.920\n"
        "Total premium                $2,132.00\n"
    ),
]


@pytest.fixture
def fake_filing(tmp_path):
    doc = pymupdf.open()
    for text in _PAGES:
        page = doc.new_page()
        page.insert_textbox(pymupdf.Rect(50, 50, 550, 750), text, fontsize=10)
    path = tmp_path / "SYNTHETIC-filing.pdf"
    doc.save(str(path))
    doc.close()
    return path


# ------------------------------------------------------------------ triage ---


def test_triage_finds_the_pages_that_matter(fake_filing):
    signals = {s.page: s for s in triage(fake_filing)}
    assert len(signals) == 4

    # The cover page carries no tables and should not be a candidate.
    assert not signals[1].is_candidate

    assert signals[2].is_candidate and signals[2].guess == "territory"
    assert signals[3].is_candidate and signals[3].guess == "factor"
    # A worked example outranks a factor table: it is the only check on sequence.
    assert signals[4].is_candidate and signals[4].guess == "worksheet"
    assert signals[4].score > signals[3].score


def test_triage_explains_its_scoring(fake_filing):
    territory = next(s for s in triage(fake_filing) if s.page == 2)
    assert any("ZIP codes" in r for r in territory.reasons)
    factors = next(s for s in triage(fake_filing) if s.page == 3)
    assert any("factor-shaped numbers" in r for r in factors.reasons)


def test_a_page_with_no_text_layer_is_flagged_not_skipped(tmp_path):
    """A scanned filing defeats triage entirely. It must still be extracted."""
    doc = pymupdf.open()
    doc.new_page()                      # blank: no text layer
    path = tmp_path / "scanned.pdf"
    doc.save(str(path))
    doc.close()

    signal = triage(path)[0]
    assert signal.has_text_layer is False
    assert signal.is_candidate                     # still needs extracting
    assert "needs OCR or vision" in signal.reasons[0]


# -------------------------------------------------------------------- jobs ---


def test_jobs_writes_an_image_and_a_prompt_per_page(fake_filing, tmp_path):
    out = tmp_path / "work"
    write_jobs(fake_filing, [2, 3], out, "Sample Mutual", "CT")

    assert (out / "page-002.png").exists()
    assert (out / "page-003.png").exists()
    prompt = (out / "page-003.prompt.md").read_text()

    assert "page 3" in prompt
    assert "Sample Mutual" in prompt
    # The prompt must demand the things that silently break a rating plan.
    assert "nearest_below" in prompt
    assert "Never add a 1.00 default" in prompt
    assert "footnote" in prompt.lower()
    assert '"confidence"' in prompt


def test_render_page_produces_a_real_image(fake_filing, tmp_path):
    out = render_page(fake_filing, 3, tmp_path, dpi=100)
    assert out.exists() and out.stat().st_size > 1000
    assert out.read_bytes()[:8] == b"\x89PNG\r\n\x1a\n"


# ------------------------------------------------------------------- draft ---


def _response(page, kind, tables, worksheet=None, notes=(), footnotes=()):
    return {"page": page, "page_kind": kind, "tables": tables,
            "worksheet": worksheet, "sequence_notes": list(notes),
            "footnotes": list(footnotes)}


@pytest.fixture
def responses():
    return [
        _response(2, "territory", [{
            "suggested_name": "territory",
            "exhibit": "Territory Definitions",
            "keys": [{"attribute": "zip_code", "match": "exact"}],
            "rows": [{"when": {"zip_code": "06105"}, "value": "3"},
                     {"when": {"zip_code": "06880"}, "value": "1"}],
            "confidence": 0.95,
        }]),
        _response(3, "factor", [{
            "suggested_name": "protection_class_factor",
            "exhibit": "Rule 303",
            "keys": [{"attribute": "protection_class", "match": "band",
                      "bounds": "closed",
                      "evidence": "printed as '1 - 4' on one row"}],
            "rows": [{"when": {"protection_class": {"min": 1, "max": 4}}, "value": 1.0},
                     {"when": {"protection_class": 5}, "value": 1.065}],
            "default": 1.45,
            "default_evidence": "'All other 1.450' printed at the foot of the table",
            "confidence": 0.72,
            "uncertainties": ["could not tell whether 10W is in this table"],
        }], footnotes=["Class 10W applies within 1,000 feet of a hydrant"]),
        _response(4, "worksheet", [], worksheet={
            "inputs": {"coverage_a": 450000, "protection_class": "7"},
            "steps": [{"label": "Base premium", "value": 1414.50}],
            "final_premium": 2132.00,
        }, notes=["Round to the nearest whole dollar after all factors"]),
    ]


def test_draft_carries_provenance_and_confidence_on_every_table(responses):
    draft = build_draft("Sample Mutual", "99999", "CT", "2026-01-01",
                        "SYNTHETIC-filing.pdf", responses)

    pc = draft["lookup_tables"]["protection_class_factor"]
    assert pc["source"]["page"] == 3
    assert pc["source"]["confidence"] == 0.72
    assert "UNCERTAIN" in pc["source"]["note"]
    # The evidence for each lookup semantic is kept for the human to check.
    assert "printed as '1 - 4'" in pc["_evidence"]["protection_class"]


def test_an_extracted_default_keeps_the_quote_that_justifies_it(responses):
    draft = build_draft("Sample Mutual", "99999", "CT", "2026-01-01",
                        "f.pdf", responses)
    pc = draft["lookup_tables"]["protection_class_factor"]
    assert pc["default"] == 1.45
    assert "All other 1.450" in pc["default_source"]["note"]


def test_draft_preserves_sequence_notes_and_footnotes(responses):
    draft = build_draft("Sample Mutual", "99999", "CT", "2026-01-01", "f.pdf", responses)
    assert "Round to the nearest whole dollar" in draft["notes"]
    assert "1,000 feet of a hydrant" in draft["notes"]
    # The step order is page order, which is not rating order -- say so.
    assert "NOT rating order" in draft["notes"]


def test_draft_does_not_invent_what_it_could_not_read(responses):
    draft = build_draft("Sample Mutual", "99999", "CT", "2026-01-01", "f.pdf", responses)
    assert "TODO" in draft["forms_supported"][0]
    assert draft["verification"]["status"] == "draft_unverified"
    assert draft["worksheets"][0]["form"] == "TODO"
    assert draft["worksheets"][0]["expected_premium"] == 2132.00


def test_written_draft_is_stamped_unverified(responses, tmp_path):
    draft = build_draft("Sample Mutual", "99999", "CT", "2026-01-01", "f.pdf", responses)
    path = write_draft(draft, tmp_path / "draft.yaml", "f.pdf")
    text = path.read_text()

    assert text.startswith("# ===")
    assert f"{UNVERIFIED_MARKER}: DRAFT" in text
    assert f"{UNVERIFIED_MARKER}: true" in text
    assert "verification_checklist.md" in text
    assert "Do not rate real risks against this file" in text


def test_a_draft_does_not_validate_until_its_todos_are_resolved(responses, tmp_path):
    """The draft is a worksheet for a human, not a loadable plan."""
    draft = build_draft("Sample Mutual", "99999", "CT", "2026-01-01", "f.pdf", responses)
    path = write_draft(draft, tmp_path / "draft.yaml", "f.pdf")
    with pytest.raises(RatingError):
        load_plan(path)


def test_the_unverified_marker_overrides_a_verified_block(tmp_path, hartford_risk):
    """Someone who sets verification.status=verified but leaves the marker in
    place has not finished. The marker wins."""
    source = (FIXTURES / "sample_plan.yaml").read_text()
    assert "status: verified" in source
    path = tmp_path / "marked.yaml"
    path.write_text(f"{UNVERIFIED_MARKER}: true\n" + source)

    plan = load_plan(path)
    assert not plan.is_verified
    with pytest.raises(PlanNotVerifiedError):
        rate(plan, hartford_risk, "HO3", AS_OF)

    # And removing the marker restores it -- the marker is the whole mechanism.
    path.write_text(source)
    assert load_plan(path).is_verified
