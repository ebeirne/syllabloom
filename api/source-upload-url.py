from __future__ import annotations

import uuid
from http import HTTPStatus
from pathlib import Path

from api._common import JsonHandler
from api.source_storage import CONTENT_TYPES, MAX_SOURCE_BYTES
from api.user_data import authenticated_user


class handler(JsonHandler):
    """Prepare a private, per-user upload slot for a large course document."""

    def do_POST(self) -> None:
        user_id = authenticated_user(self.headers)
        if not user_id:
            self.send_json({"error": "Sign in before adding course materials."}, HTTPStatus.UNAUTHORIZED)
            return
        try:
            body = self.read_json(16 * 1024)
        except ValueError:
            self.send_json({"error": "The upload request is invalid."}, HTTPStatus.BAD_REQUEST)
            return
        name = Path(str(body.get("filename") or "").replace("\\", "/")).name[:255]
        extension = name.rsplit(".", 1)[-1].lower() if "." in name else ""
        content_type = CONTENT_TYPES.get(extension)
        if not content_type or not name:
            self.send_json({"error": "Use a DOCX, PPTX, PDF, or TXT source."}, HTTPStatus.BAD_REQUEST)
            return
        size = body.get("size")
        if isinstance(size, bool) or not isinstance(size, int) or size <= 0 or size > MAX_SOURCE_BYTES:
            self.send_json(
                {"error": "Each document can be up to 100 MB in this beta."},
                HTTPStatus.REQUEST_ENTITY_TOO_LARGE,
            )
            return
        file_name = f"{uuid.uuid4()}.{extension}"
        self.send_json(
            {
                "uploadUrl": f"/api/source-upload/{file_name}",
                "pathname": f"source-uploads/{user_id}/{file_name}",
                "contentType": content_type,
                "maxBytes": MAX_SOURCE_BYTES,
            }
        )
