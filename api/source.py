from __future__ import annotations

import cgi
import json
import os
import re
import tempfile
from http import HTTPStatus
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlsplit
from urllib.request import Request, urlopen

from api.ai_card_generation import CardGenerationError
from api.ai_source_cards import generate_source_cards
from api._common import JsonHandler
from api.user_data import authenticated_user, require_authenticated_beta_request
from server import NoSelectableTextError, SOURCE_SUFFIXES, source_summary


MAX_INLINE_REQUEST_BYTES = 4 * 1024 * 1024
MAX_SOURCE_BYTES = 100 * 1024 * 1024


def _source_summary(path: Path, filename: str, kind: str, user_id: str) -> dict:
    return source_summary(
        path,
        filename,
        kind,
        card_generator=lambda text, source_name, source_kind, units: generate_source_cards(
            text, source_name, source_kind, units, user_id
        ),
    )


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
            if content_length > 32 * 1024:
                self.send_json({"error": "The temporary upload request is invalid."}, HTTPStatus.BAD_REQUEST)
                return
            user_id = authenticated_user(self.headers)
            if os.environ.get("VERCEL_ENV", "").strip() and not user_id:
                self.send_json({"error": "Sign in before adding course materials."}, HTTPStatus.UNAUTHORIZED)
                return
            try:
                body = json.loads(self.rfile.read(content_length).decode("utf-8"))
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
                summary = _source_summary(temporary_path, filename, kind, user_id or "local-development")
                summary["localOnly"] = False
                summary["storage"] = "session"
                self.send_json({"source": summary})
            except NoSelectableTextError as exc:
                self.send_json({"error": str(exc)}, HTTPStatus.UNPROCESSABLE_ENTITY)
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
            summary = _source_summary(
                temporary_path,
                filename,
                form.getfirst("kind", "auto"),
                authenticated_user(self.headers) or "local-development",
            )
            summary["localOnly"] = False
            summary["storage"] = "session"
            self.send_json({"source": summary})
        except NoSelectableTextError as exc:
            self.send_json({"error": str(exc)}, HTTPStatus.UNPROCESSABLE_ENTITY)
        except CardGenerationError as exc:
            self.send_json({"error": exc.public_message}, exc.status)
        except Exception as exc:
            print(f"Source import failed: {type(exc).__name__}", flush=True)
            self.send_json({"error": "The source could not be read in the beta."}, HTTPStatus.UNPROCESSABLE_ENTITY)
        finally:
            if temporary_path is not None:
                temporary_path.unlink(missing_ok=True)
