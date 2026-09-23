from __future__ import annotations

import os

from api._common import JsonHandler, clerk_auth_config


class handler(JsonHandler):
    def do_GET(self) -> None:
        publishable_key = (
            os.environ.get("CLERK_PUBLISHABLE_KEY")
            or os.environ.get("VITE_CLERK_PUBLISHABLE_KEY")
            or os.environ.get("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY")
            or ""
        ).strip()
        self.send_json(clerk_auth_config(publishable_key, os.environ.get("VERCEL_ENV", "")))
