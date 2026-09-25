from __future__ import annotations

from http import HTTPStatus

from api._common import JsonHandler
from api.ai_card_generation import CardGenerationError
from api.source import _generate_source_batch
from api.user_data import authenticated_user, require_authenticated_beta_request


MAX_BATCH_REQUEST_BYTES = 3_000_000


class handler(JsonHandler):
    def do_POST(self) -> None:
        if not require_authenticated_beta_request(self, "adding course materials"):
            return
        try:
            user_id = authenticated_user(self.headers) or "local-development"
            body = self.read_json(MAX_BATCH_REQUEST_BYTES)
            result = _generate_source_batch(body, user_id)
            self.send_json({"result": result})
        except CardGenerationError as exc:
            self.send_json({"error": exc.public_message, "retryable": exc.retryable}, exc.status)
        except ValueError as exc:
            self.send_json({"error": str(exc) or "The card-generation request is invalid."}, HTTPStatus.BAD_REQUEST)
        except Exception as exc:
            print(f"Source card batch failed: {type(exc).__name__}", flush=True)
            self.send_json({
                "error": "The card batch result could not be confirmed. It was not automatically retried to avoid duplicate generation.",
                "retryable": False,
            }, HTTPStatus.BAD_GATEWAY)
