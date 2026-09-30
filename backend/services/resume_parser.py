"""
Extracts plain text from an uploaded resume file, regardless of format.
Supported: .txt, .md, .pdf, .doc, .docx
"""
import io
import os

from pypdf import PdfReader
from docx import Document


class UnsupportedResumeFormat(Exception):
    pass


def extract_text_from_upload(file_storage):
    filename = file_storage.filename or "resume"
    ext = os.path.splitext(filename)[1].lower()
    raw = file_storage.read()

    if ext in (".txt", ".md", ""):
        text = raw.decode("utf-8", errors="ignore")
    elif ext == ".pdf":
        text = _extract_pdf(raw)
    elif ext == ".docx":
        text = _extract_docx(raw)
    elif ext == ".doc":
        raise UnsupportedResumeFormat(
            "Legacy .doc files aren't supported. Please re-save the resume as .docx or .pdf and upload again."
        )
    else:
        raise UnsupportedResumeFormat(
            f"Unsupported file type '{ext}'. Please upload a .pdf, .docx, or .txt resume."
        )

    text = text.strip()
    if not text:
        raise UnsupportedResumeFormat(
            "Couldn't read any text from that file — it may be a scanned/image-based PDF. "
            "Please upload a text-based PDF/DOCX, or paste the resume text directly."
        )
    return text, filename


def _extract_pdf(raw_bytes):
    reader = PdfReader(io.BytesIO(raw_bytes))
    parts = []
    for page in reader.pages:
        page_text = page.extract_text() or ""
        if page_text:
            parts.append(page_text)
    return "\n".join(parts)


def _extract_docx(raw_bytes):
    doc = Document(io.BytesIO(raw_bytes))
    parts = [p.text for p in doc.paragraphs if p.text.strip()]
    for table in doc.tables:
        for row in table.rows:
            row_text = " | ".join(cell.text.strip() for cell in row.cells if cell.text.strip())
            if row_text:
                parts.append(row_text)
    return "\n".join(parts)
