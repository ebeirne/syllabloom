from __future__ import annotations

from http import HTTPStatus

from api._common import JsonHandler
from server import build_anki_package


class handler(JsonHandler):
    def do_POST(self) -> None:
        try:
            payload = self.read_json()
            cards = payload.get("cards") or []
            if not isinstance(cards, list) or not cards:
                raise ValueError("Approve at least one card before exporting.")
            package, filename = build_anki_package(cards, payload.get("preferences") or {})
        except ValueError as exc:
            self.send_json({"error": str(exc)}, HTTPStatus.BAD_REQUEST)
            return
        except Exception as exc:
            print(f"Anki export failed: {type(exc).__name__}: {exc}", flush=True)
            self.send_json({"error": "Anki package export failed in the beta."}, HTTPStatus.INTERNAL_SERVER_ERROR)
            return

        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "application/octet-stream")
        self.send_header("Content-Length", str(len(package)))
        self.send_header("Content-Disposition", f'attachment; filename="{filename}"')
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(package)
