from __future__ import annotations

import json
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler


def clerk_auth_config(
    publishable_key: str,
    vercel_env: str = "",
    allow_test_key_in_production: bool = False,
) -> dict[str, object]:
    key = str(publishable_key or "").strip()
    if key.startswith("pk_live_"):
        mode = "live"
    elif key.startswith("pk_test_"):
        mode = "test"
    else:
        mode = "unconfigured"

    test_key_in_production = (
        mode == "test"
        and str(vercel_env or "").strip().lower() == "production"
        and not allow_test_key_in_production
    )
    return {
        "configured": mode == "live" or (mode == "test" and not test_key_in_production),
        "publishableKey": "" if test_key_in_production else key,
        "mode": mode,
        "reason": "test-key-in-production" if test_key_in_production else ("not-configured" if mode == "unconfigured" else ""),
    }


class JsonHandler(BaseHTTPRequestHandler):
    def send_json(self, payload: dict, status: HTTPStatus = HTTPStatus.OK) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def read_json(self, maximum_bytes: int = 5 * 1024 * 1024) -> dict:
        try:
            content_length = int(self.headers.get("Content-Length", "0"))
        except ValueError as exc:
            raise ValueError("The request size is invalid.") from exc
        if content_length <= 0 or content_length > maximum_bytes:
            raise ValueError("The request is missing or too large.")
        try:
            return json.loads(self.rfile.read(content_length).decode("utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError) as exc:
            raise ValueError("The request body is not valid JSON.") from exc

    def do_OPTIONS(self) -> None:
        self.send_response(HTTPStatus.NO_CONTENT)
        self.send_header("Allow", "GET, POST, PUT, OPTIONS")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
