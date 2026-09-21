from __future__ import annotations

import os

from api._common import JsonHandler


class handler(JsonHandler):
    def do_GET(self) -> None:
        publishable_key = (
            os.environ.get("CLERK_PUBLISHABLE_KEY")
            or os.environ.get("VITE_CLERK_PUBLISHABLE_KEY")
            or os.environ.get("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY")
            or ""
        ).strip()
        self.send_json(
            {
                "configured": publishable_key.startswith("pk_"),
                "publishableKey": publishable_key,
            }
        )
