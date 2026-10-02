from __future__ import annotations

import re
from http import HTTPStatus
from urllib.parse import urlsplit

from api._common import JsonHandler
from api.source_storage import CONTENT_TYPES, MAX_SOURCE_BYTES, resolve_pathname
from api.user_data import authenticated_user

FILE_NAME = re.compile(r"/api/source-upload/([a-f0-9-]{36}\.(?:pdf|ppt|pptw|pptx|docx|txt))")


class handler(JsonHandler):
    """Receive a large document at the slot issued by /api/source-upload-url."""

    def do_PUT(self) -> None:
        user_id = authenticated_user(self.headers)
        if not user_id:
            self.send_json({"error": "Sign in before adding course materials."}, HTTPStatus.UNAUTHORIZED)
            return
        match = FILE_NAME.fullmatch(urlsplit(self.path).path)
        if not match:
            self.send_json({"error": "The upload address is invalid."}, HTTPStatus.BAD_REQUEST)
            return
        file_name = match.group(1)
        extension = file_name.rsplit(".", 1)[-1]
        if self.headers.get("Content-Type", "").split(";")[0].strip() != CONTENT_TYPES[extension]:
            self.send_json({"error": "The upload file type does not match its extension."}, HTTPStatus.BAD_REQUEST)
            return
        try:
            expected = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            expected = 0
        if expected <= 0:
            self.send_json({"error": "Choose a document to upload."}, HTTPStatus.BAD_REQUEST)
            return
        if expected > MAX_SOURCE_BYTES:
            self.send_json({"error": "Each document can be up to 100 MB in this beta."}, HTTPStatus.REQUEST_ENTITY_TOO_LARGE)
            return
        destination = resolve_pathname(f"source-uploads/{user_id}/{file_name}", user_id)
        destination.parent.mkdir(parents=True, exist_ok=True)
        written = 0
        try:
            # "xb" refuses to overwrite, so a slot can only be filled once.
            with destination.open("xb") as target:
                while written < expected:
                    chunk = self.rfile.read(min(1024 * 1024, expected - written))
                    if not chunk:
                        break
                    written += len(chunk)
                    target.write(chunk)
        except FileExistsError:
            self.send_json({"error": "This upload was already received."}, HTTPStatus.CONFLICT)
            return
        if written != expected:
            destination.unlink(missing_ok=True)
            self.send_json({"error": "The document upload was incomplete. Please retry."}, HTTPStatus.BAD_REQUEST)
            return
        self.send_json({"ok": True})
