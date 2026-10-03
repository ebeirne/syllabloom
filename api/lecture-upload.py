from __future__ import annotations

import re
from http import HTTPStatus
from urllib.parse import urlsplit

from api._common import JsonHandler
from api.lecture_storage import CONTENT_TYPES, MAX_LECTURE_BYTES, resolve_upload
from api.user_data import authenticated_user

FILE_NAME = re.compile(r"/api/lecture-upload/([a-f0-9-]{36}\.(?:wav|mp3|m4a|webm|ogg|flac|mp4|mov))")


class handler(JsonHandler):
    def do_PUT(self) -> None:
        user_id = authenticated_user(self.headers)
        if not user_id:
            self.send_json({"error": "Sign in before processing a lecture."}, HTTPStatus.UNAUTHORIZED)
            return
        match = FILE_NAME.fullmatch(urlsplit(self.path).path)
        if not match:
            self.send_json({"error": "The lecture upload address is invalid."}, HTTPStatus.BAD_REQUEST)
            return
        stored_name = match.group(1)
        extension = stored_name.rsplit(".", 1)[-1]
        supplied_type = self.headers.get("Content-Type", "").split(";", 1)[0].strip().lower()
        accepted_types = {CONTENT_TYPES[extension]}
        if extension == "webm":
            accepted_types.add("video/webm")
        if extension == "m4a":
            accepted_types.add("audio/x-m4a")
        if supplied_type not in accepted_types:
            self.send_json({"error": "The lecture file type does not match its extension."}, HTTPStatus.BAD_REQUEST)
            return
        try:
            expected = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            expected = 0
        if expected <= 0 or expected > MAX_LECTURE_BYTES:
            self.send_json({"error": "Each lecture can be up to 500 MB."}, HTTPStatus.REQUEST_ENTITY_TOO_LARGE)
            return
        destination = resolve_upload(f"lecture-uploads/{user_id}/{stored_name}", user_id)
        destination.parent.mkdir(parents=True, exist_ok=True)
        written = 0
        try:
            with destination.open("xb") as target:
                while written < expected:
                    chunk = self.rfile.read(min(1024 * 1024, expected - written))
                    if not chunk:
                        break
                    target.write(chunk)
                    written += len(chunk)
        except FileExistsError:
            self.send_json({"error": "This lecture upload was already received."}, HTTPStatus.CONFLICT)
            return
        if written != expected:
            destination.unlink(missing_ok=True)
            self.send_json({"error": "The lecture upload was incomplete. Please retry."}, HTTPStatus.BAD_REQUEST)
            return
        self.send_json({"ok": True})
