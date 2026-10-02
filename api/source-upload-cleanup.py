from __future__ import annotations

import hmac
import os
from http import HTTPStatus

from api._common import JsonHandler
from api.source_storage import cleanup_expired


class handler(JsonHandler):
    """Scheduled removal of abandoned uploads (called nightly by a systemd timer)."""

    def do_GET(self) -> None:
        expected = (os.environ.get("CRON_SECRET") or "").strip()
        supplied = self.headers.get("Authorization", "")
        if not expected or not hmac.compare_digest(supplied, f"Bearer {expected}"):
            self.send_json({"error": "Unauthorized."}, HTTPStatus.UNAUTHORIZED)
            return
        inspected, deleted = cleanup_expired()
        self.send_json({"inspected": inspected, "deleted": deleted})
