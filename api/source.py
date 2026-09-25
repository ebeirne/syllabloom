from __future__ import annotations

import cgi
import hashlib
import json
import os
import re
import tempfile
from http import HTTPStatus
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlsplit
from urllib.request import Request, urlopen

from api.ai_card_generation import (
    CHUNKS_PER_BATCH,
    MAX_SOURCE_TEXT_CHARS,
    QUESTION_STYLES,
    CardGenerationError,
    SourceTextLimitError,
    _source_chunks,
)
from api.ai_source_cards import generate_source_cards, generate_source_cards_batch
from api._common import JsonHandler
from api.user_data import authenticated_user, require_authenticated_beta_request
from server import NoSelectableTextError, SOURCE_SUFFIXES, extract_source_text, source_summary


MAX_INLINE_REQUEST_BYTES = 4 * 1024 * 1024
MAX_SOURCE_BYTES = 100 * 1024 * 1024


def _source_summary(
    path: Path, filename: str, kind: str, user_id: str, question_style: str = "balanced"
) -> dict:
    return source_summary(
        path,
        filename,
        kind,
        card_generator=lambda text, source_name, source_kind, units: generate_source_cards(
            text, source_name, source_kind, units, user_id, question_style
        ),
    )


def _source_preflight(path: Path, filename: str, kind: str) -> dict:
    """Read and classify a source without spending AI budget; return text only for generation."""
    suffix = Path(filename).suffix.lower()
    text, units = extract_source_text(path, suffix)
    if suffix == ".pdf" and not text.strip():
        error = NoSelectableTextError(
            "This PDF has no selectable text. Syllabloom can try on-device OCR before generating cards."
        )
        error.file_fingerprint = _file_fingerprint(path)
        raise error
    if not text.strip():
        error = NoSelectableTextError(
            "No readable text was found. Add speaker notes or image descriptions to the slides, then try again."
        )
        error.file_fingerprint = _file_fingerprint(path)
        raise error
    summary = source_summary(path, filename, kind, extracted=(text, units))
    _apply_file_identity(summary, _file_fingerprint(path))
    summary["draftCards"] = []
    needs_cards = (
        summary["kind"] != "syllabus"
        and len(text.strip()) > 0
        and "Administrative form detected" not in summary.get("classificationReason", "")
    )
    if not needs_cards:
        summary["preflight"] = {
            "inputCharacters": len(text),
            "chunkCount": 0,
            "batchCount": 0,
            "requiresCards": False,
            "unitLabel": units.get("unitLabel", "sections"),
            "unitCount": units.get("unitCount", 0),
        }
        return {"source": summary}

    if len(text) > MAX_SOURCE_TEXT_CHARS:
        raise SourceTextLimitError()

    chunks = _source_chunks(text, filename, units)
    low_text_pages = []
    if suffix == ".pdf":
        low_text_pages = [
            index + 1 for index, page in enumerate(units.get("pageTexts") or [])
            if len(re.findall(r"\b\w+\b", str(page))) < 15
        ]
    slide_numbers = {int(value) for value in re.findall(r"(?m)^Slide\s+(\d+)\s*$", text)}
    page_count = len(units.get("pageTexts") or [])
    visual_gaps = units.get("slidesWithUnlabeledImages") or []
    summary["preflight"] = {
        "inputCharacters": len(text),
        "chunkCount": len(chunks),
        "batchCount": (len(chunks) + CHUNKS_PER_BATCH - 1) // CHUNKS_PER_BATCH,
        "requiresCards": True,
        "unitLabel": units.get("unitLabel", "sections"),
        "unitCount": units.get("unitCount", 0),
        "unitsWithText": len(slide_numbers) if suffix == ".pptx" else sum(
            1 for page in (units.get("pageTexts") or []) if str(page).strip()
        ) if suffix == ".pdf" else units.get("unitCount", 0),
        "lowTextPages": low_text_pages,
        "imageCount": units.get("imageCount", 0),
        "imageAltTextCount": units.get("imageAltTextCount", 0),
        "slidesWithUnlabeledImages": visual_gaps,
        "speakerNotesCount": units.get("speakerNotesCount", 0),
    }
    return {"source": summary, "extractedText": text, "extractedUnits": units}


def _source_summary_from_ocr(
    filename: str, kind: str, text: str, page_texts: list[str], file_fingerprint: str = ""
) -> dict:
    if Path(filename).suffix.lower() != ".pdf":
        raise ValueError("On-device OCR is only supported for PDF documents.")
    if not isinstance(text, str) or not text.strip() or len(text) > MAX_SOURCE_TEXT_CHARS:
        raise SourceTextLimitError()
    if not isinstance(page_texts, list) or len(page_texts) > 500 or any(not isinstance(page, str) for page in page_texts):
        raise ValueError("The OCR text could not be prepared safely. Try a smaller PDF.")
    if sum(len(page) for page in page_texts) > MAX_SOURCE_TEXT_CHARS:
        raise SourceTextLimitError()
    units = {"unitLabel": "pages", "unitCount": len(page_texts), "pageTexts": page_texts, "ocrUsed": True}
    summary = source_summary(Path(filename), filename, kind, extracted=(text, units))
    if not re.fullmatch(r"[a-f0-9]{64}", str(file_fingerprint)):
        raise ValueError("The original PDF could not be verified for this OCR import. Upload it again.")
    _apply_file_identity(summary, file_fingerprint)
    summary["draftCards"] = []
    requires_cards = (
        summary["kind"] != "syllabus"
        and "Administrative form detected" not in summary.get("classificationReason", "")
    )
    chunks = _source_chunks(text, filename, units) if requires_cards else []
    summary["preflight"] = {
        "inputCharacters": len(text),
        "chunkCount": len(chunks),
        "batchCount": (len(chunks) + CHUNKS_PER_BATCH - 1) // CHUNKS_PER_BATCH,
        "requiresCards": requires_cards,
        "unitLabel": "pages",
        "unitCount": len(page_texts),
        "unitsWithText": sum(1 for page in page_texts if page.strip()),
        "ocrUsed": True,
    }
    return {"source": summary, "extractedText": text, "extractedUnits": units}


def _generate_source_batch(body: object, user_id: str) -> dict:
    if not isinstance(body, dict):
        raise ValueError("The card-generation request is invalid.")
    text = body.get("extractedText")
    units = body.get("extractedUnits")
    filename = Path(str(body.get("filename") or "")).name
    kind = str(body.get("kind") or "auto")
    batch_index = body.get("batchIndex")
    question_style = body.get("questionStyle", "balanced")
    if not isinstance(text, str) or not text.strip() or len(text) > MAX_SOURCE_TEXT_CHARS:
        raise SourceTextLimitError()
    if Path(filename).suffix.lower() not in SOURCE_SUFFIXES or kind not in {"material", "assessment"}:
        raise ValueError("Choose a class material or past assessment with readable text.")
    if not isinstance(units, dict):
        raise ValueError("The extracted source could not be verified. Re-import the file.")
    if not isinstance(question_style, str) or question_style not in QUESTION_STYLES:
        raise ValueError("Choose a supported front question style.")
    fingerprint = hashlib.sha256(text.encode("utf-8")).hexdigest()
    if body.get("textFingerprint") != fingerprint:
        raise ValueError("The source changed during import. Please upload it again.")
    if not isinstance(batch_index, int) or isinstance(batch_index, bool):
        raise ValueError("The card-generation batch is invalid.")
    return generate_source_cards_batch(text, filename, kind, units, user_id, batch_index, question_style)


def _file_fingerprint(path: Path) -> str:
    digest = hashlib.sha256()
    with Path(path).open("rb") as source_file:
        while True:
            chunk = source_file.read(1024 * 1024)
            if not chunk:
                break
            digest.update(chunk)
    return digest.hexdigest()


def _apply_file_identity(summary: dict, file_fingerprint: str) -> None:
    summary["fileFingerprint"] = file_fingerprint
    if summary.get("kind") == "syllabus":
        return
    previous_id = str(summary.get("id") or "")
    file_id = file_fingerprint[:12]
    summary["id"] = file_id
    for event in summary.get("calendarEvents") or []:
        event_id = str(event.get("id") or "")
        event["id"] = f"{file_id}{event_id[len(previous_id):]}" if previous_id and event_id.startswith(previous_id) else event_id
        event["sourceId"] = file_id


def _private_blob_url(value: object, pathname: str) -> str:
    url = str(value or "")
    parsed = urlsplit(url)
    if (
        parsed.scheme != "https"
        or not parsed.hostname
        or not parsed.hostname.endswith(".private.blob.vercel-storage.com")
        or parsed.username
        or parsed.password
        or parsed.port
        or unquote(parsed.path) != f"/{pathname}"
        or not parsed.query
    ):
        raise ValueError("The temporary upload link is invalid.")
    return url

def _blob_api_delete_url(value: object, pathname: str) -> str:
    url = str(value or "")
    parsed = urlsplit(url)
    query = parse_qs(parsed.query)
    if (
        parsed.scheme != "https"
        or parsed.hostname != "vercel.com"
        or parsed.username
        or parsed.password
        or parsed.port
        or parsed.path.rstrip("/") != "/api/blob"
        or query.get("pathname") != [pathname]
        or not query.get("vercel-blob-delegation")
        or not query.get("vercel-blob-signature")
    ):
        raise ValueError("The temporary upload link is invalid.")
    return url

def _source_path(value: object, user_id: str) -> str:
    pathname = str(value or "")
    pattern = rf"source-uploads/{re.escape(user_id)}/[a-f0-9-]{{36}}\.(?:pdf|pptx|docx|txt)"
    if not re.fullmatch(pattern, pathname):
        raise ValueError("The temporary upload path is invalid.")
    return pathname


def _download_temporary_source(url: str, path: Path) -> None:
    with urlopen(url, timeout=30) as response:
        if response.status != 200:
            raise ValueError("The temporary document could not be downloaded.")
        expected_size = int(response.headers.get("Content-Length", "0") or 0)
        if expected_size > MAX_SOURCE_BYTES:
            raise ValueError("Each document can be up to 100 MB in this beta.")
        written = 0
        with path.open("wb") as temporary:
            while True:
                chunk = response.read(1024 * 1024)
                if not chunk:
                    break
                written += len(chunk)
                if written > MAX_SOURCE_BYTES:
                    raise ValueError("Each document can be up to 100 MB in this beta.")
                temporary.write(chunk)
        if expected_size and written != expected_size:
            raise ValueError("The temporary document upload was incomplete. Please retry.")


def _delete_temporary_source(url: str) -> None:
    try:
        request = Request(url, method="DELETE")
        with urlopen(request, timeout=5) as response:
            response.read(1024)
    except Exception as exc:
        print(f"Temporary source cleanup failed: {type(exc).__name__}", flush=True)


class handler(JsonHandler):
    def do_POST(self) -> None:
        if not require_authenticated_beta_request(self, "adding course materials"):
            return
        content_type = self.headers.get("Content-Type", "")
        temporary_path = None
        delete_url = None
        try:
            content_length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            content_length = 0
        if content_length <= 0:
            self.send_json({"error": "Choose a document to upload."}, HTTPStatus.BAD_REQUEST)
            return

        if content_type.startswith("application/json"):
            if content_length > 3_000_000:
                self.send_json({"error": "The temporary upload request is invalid."}, HTTPStatus.BAD_REQUEST)
                return
            user_id = authenticated_user(self.headers)
            if os.environ.get("VERCEL_ENV", "").strip() and not user_id:
                self.send_json({"error": "Sign in before adding course materials."}, HTTPStatus.UNAUTHORIZED)
                return
            try:
                body = json.loads(self.rfile.read(content_length).decode("utf-8"))
                operation = body.get("operation") if isinstance(body, dict) else None
                if operation == "inspect-text":
                    result = _source_summary_from_ocr(
                        Path(str(body.get("filename") or "source.pdf")).name,
                        str(body.get("kind") or "auto"),
                        body.get("extractedText"),
                        body.get("pageTexts"),
                        str(body.get("fileFingerprint") or ""),
                    )
                    result["source"]["localOnly"] = False
                    result["source"]["storage"] = "session"
                    self.send_json(result)
                    return
                pathname = _source_path(body.get("pathname"), user_id or "")
                source_url = _private_blob_url(body.get("sourceUrl"), pathname)
                delete_url = _blob_api_delete_url(body.get("deleteUrl"), pathname)
                filename = Path(str(body.get("filename") or "source.txt")).name
                suffix = Path(filename).suffix.lower()
                if suffix not in SOURCE_SUFFIXES or not pathname.endswith(suffix):
                    raise ValueError("Use a DOCX, PPTX, PDF, or TXT source.")
                kind = str(body.get("kind") or "auto")
                if kind not in {"auto", "material", "syllabus", "assessment"}:
                    kind = "auto"
                with tempfile.NamedTemporaryFile(prefix="syllabloom-source-", suffix=suffix, delete=False) as temporary:
                    temporary_path = Path(temporary.name)
                _download_temporary_source(source_url, temporary_path)
                result = (
                    _source_preflight(temporary_path, filename, kind)
                    if operation == "inspect"
                    else {"source": _source_summary(
                        temporary_path, filename, kind, user_id or "local-development",
                        str(body.get("questionStyle") or "balanced"),
                    )}
                )
                result["source"]["localOnly"] = False
                result["source"]["storage"] = "session"
                self.send_json(result)
            except NoSelectableTextError as exc:
                self.send_json({
                    "error": str(exc),
                    "errorCode": "NO_SELECTABLE_TEXT",
                    "fileFingerprint": getattr(exc, "file_fingerprint", ""),
                }, HTTPStatus.UNPROCESSABLE_ENTITY)
            except CardGenerationError as exc:
                self.send_json({"error": exc.public_message}, exc.status)
            except (ValueError, json.JSONDecodeError, UnicodeDecodeError) as exc:
                self.send_json({"error": str(exc) or "The temporary upload request is invalid."}, HTTPStatus.BAD_REQUEST)
            except Exception as exc:
                print(f"Large source import failed: {type(exc).__name__}", flush=True)
                self.send_json({"error": "The source could not be read in the beta. Please retry."}, HTTPStatus.UNPROCESSABLE_ENTITY)
            finally:
                if temporary_path is not None:
                    temporary_path.unlink(missing_ok=True)
                if delete_url:
                    _delete_temporary_source(delete_url)
            return

        if content_length > MAX_INLINE_REQUEST_BYTES:
            self.send_json({"error": "This source is too large for a direct request. Retry the upload; large files use private temporary storage."}, HTTPStatus.REQUEST_ENTITY_TOO_LARGE)
            return

        if not content_type.startswith("multipart/form-data"):
            self.send_json({"error": "Expected a document upload."}, HTTPStatus.BAD_REQUEST)
            return

        form = cgi.FieldStorage(
            fp=self.rfile,
            headers=self.headers,
            environ={
                "REQUEST_METHOD": "POST",
                "CONTENT_TYPE": content_type,
                "CONTENT_LENGTH": str(content_length),
            },
        )
        if "source" not in form:
            self.send_json({"error": "No source document was provided."}, HTTPStatus.BAD_REQUEST)
            return

        upload = form["source"]
        filename = Path(upload.filename or "source.txt").name
        suffix = Path(filename).suffix.lower()
        if suffix not in SOURCE_SUFFIXES:
            self.send_json({"error": "Use a DOCX, PPTX, PDF, or TXT source."}, HTTPStatus.BAD_REQUEST)
            return

        try:
            with tempfile.NamedTemporaryFile(prefix="syllabloom-source-", suffix=suffix, delete=False) as temporary:
                temporary_path = Path(temporary.name)
                while True:
                    chunk = upload.file.read(1024 * 1024)
                    if not chunk:
                        break
                    temporary.write(chunk)
            kind = form.getfirst("kind", "auto")
            question_style = form.getfirst("questionStyle", "balanced")
            result = (
                _source_preflight(temporary_path, filename, kind)
                if form.getfirst("inspect", "") == "1"
                else {"source": _source_summary(
                    temporary_path,
                    filename,
                    kind,
                    authenticated_user(self.headers) or "local-development",
                    question_style,
                )}
            )
            result["source"]["localOnly"] = False
            result["source"]["storage"] = "session"
            self.send_json(result)
        except NoSelectableTextError as exc:
            self.send_json({
                "error": str(exc),
                "errorCode": "NO_SELECTABLE_TEXT",
                "fileFingerprint": getattr(exc, "file_fingerprint", ""),
            }, HTTPStatus.UNPROCESSABLE_ENTITY)
        except CardGenerationError as exc:
            self.send_json({"error": exc.public_message}, exc.status)
        except Exception as exc:
            print(f"Source import failed: {type(exc).__name__}", flush=True)
            self.send_json({"error": "The source could not be read in the beta."}, HTTPStatus.UNPROCESSABLE_ENTITY)
        finally:
            if temporary_path is not None:
                temporary_path.unlink(missing_ok=True)
