"""Optional OCR for scanned pages. Never runs by default.

Enable with the extractor CLI's ``--ocr`` flag. Requires Tesseract to be
installed on the host plus the ``pytesseract`` + ``pdf2image`` Python packages
(and poppler for pdf2image).
"""

from __future__ import annotations

from pathlib import Path


def ocr_pages(pdf_path: Path, page_numbers: list[int], dpi: int = 300) -> dict[int, str]:
    """OCR the given 1-indexed pages of a PDF, returning {page_number: text}."""

    try:
        import pytesseract  # type: ignore
        from pdf2image import convert_from_path  # type: ignore
    except ImportError as exc:  # pragma: no cover - optional dep
        raise RuntimeError(
            "OCR needs pytesseract + pdf2image: pip install -e '.[extractor]' "
            "and install Tesseract + poppler on the host."
        ) from exc

    out: dict[int, str] = {}
    for pno in page_numbers:
        images = convert_from_path(str(pdf_path), dpi=dpi, first_page=pno, last_page=pno)
        if not images:
            continue
        out[pno] = pytesseract.image_to_string(images[0])
    return out
