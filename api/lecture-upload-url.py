from __future__ import annotations

import uuid
from http import HTTPStatus
from pathlib import Path

from api._common import JsonHandler
from api.lecture_storage import CONTENT_TYPES, MAX_LECTURE_BYTES
from api.user_data import authenticated_user


class handler(JsonHandler):
    def do_POST(self) -> None:
        user_id = authenticated_user(self.headers)
        if not user_id:
            self.send_json({"error": "Sign in before processing a lecture."}, HTTPStatus.UNAUTHORIZED)
            return
        try:
            body = self.read_json(16 * 1024)
        except ValueError:
            self.send_json({"error": "The lecture upload request is invalid."}, HTTPStatus.BAD_REQUEST)
            return
        filename = Path(str(body.get("filename") or "").replace("\\", "/")).name[:255]
        extension = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
        size = body.get("size")
        if extension not in CONTENT_TYPES or not filename:
            self.send_json({"error": "Use an MP4, MOV, WebM, MP3, M4A, WAV, OGG, or FLAC lecture."}, HTTPStatus.BAD_REQUEST)
            return
        if isinstance(size, bool) or not isinstance(size, int) or size <= 0 or size > MAX_LECTURE_BYTES:
            self.send_json({"error": "Each lecture can be up to 500 MB."}, HTTPStatus.REQUEST_ENTITY_TOO_LARGE)
            return
        stored_name = f"{uuid.uuid4()}.{extension}"
        self.send_json({
            "uploadUrl": f"/api/lecture-upload/{stored_name}",
            "pathname": f"lecture-uploads/{user_id}/{stored_name}",
            "contentType": CONTENT_TYPES[extension],
            "maxBytes": MAX_LECTURE_BYTES,
        })
