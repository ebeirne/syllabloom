from __future__ import annotations

import cgi
import tempfile
from http import HTTPStatus
from pathlib import Path

from api._common import JsonHandler
from api.user_data import require_authenticated_beta_request
from server import NoSelectableTextError, SOURCE_SUFFIXES, source_summary


class handler(JsonHandler):
    def do_POST(self) -> None:
        if not require_authenticated_beta_request(self, "adding course materials"):
            return
        try:
            content_length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            content_length = 0
        if content_length <= 0 or content_length > 12 * 1024 * 1024:
            self.send_json({"error": "Use a source file smaller than 12 MB in this beta."}, HTTPStatus.BAD_REQUEST)
            return

        content_type = self.headers.get("Content-Type", "")
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

        temporary_path = None
        try:
            with tempfile.NamedTemporaryFile(prefix="syllabloom-source-", suffix=suffix, delete=False) as temporary:
                temporary_path = Path(temporary.name)
                while True:
                    chunk = upload.file.read(1024 * 1024)
                    if not chunk:
                        break
                    temporary.write(chunk)
            summary = source_summary(temporary_path, filename, form.getfirst("kind", "auto"))
            summary["localOnly"] = False
            summary["storage"] = "session"
            self.send_json({"source": summary})
        except NoSelectableTextError as exc:
            self.send_json({"error": str(exc)}, HTTPStatus.UNPROCESSABLE_ENTITY)
        except Exception as exc:
            print(f"Source import failed: {type(exc).__name__}", flush=True)
            self.send_json({"error": "The source could not be read in the beta."}, HTTPStatus.UNPROCESSABLE_ENTITY)
        finally:
            if temporary_path is not None:
                temporary_path.unlink(missing_ok=True)
