from __future__ import annotations

import os

from api._common import JsonHandler, clerk_auth_config, deployment_env


class handler(JsonHandler):
    def do_GET(self) -> None:
        publishable_key = (
            os.environ.get("CLERK_PUBLISHABLE_KEY")
            or os.environ.get("VITE_CLERK_PUBLISHABLE_KEY")
            or os.environ.get("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY")
            or ""
        ).strip()
        allow_public_beta_auth = (os.environ.get("SYLLABLOOM_PUBLIC_BETA_AUTH") or "").strip().lower() in {
            "1",
            "true",
            "yes",
        }
        self.send_json(
            clerk_auth_config(
                publishable_key,
                deployment_env(),
                allow_test_key_in_production=allow_public_beta_auth,
            )
        )
