from http import HTTPStatus

from api.ai_card_generation import DEFAULT_MODEL, is_configured
from api._common import JsonHandler
from api.user_data import _database_url


class handler(JsonHandler):
    def do_GET(self) -> None:
        self.send_json(
            {
                "ok": True,
                "mode": "beta-cloud",
                "sourceImport": True,
                "aiCardGeneration": is_configured(),
                "aiCardGenerationModel": DEFAULT_MODEL,
                "aiCardUsageGuard": bool(_database_url()),
                "ankiExport": True,
                "mediaCapture": True,
                "mediaImport": True,
                "mediaStorage": "browser-per-user",
                "transcription": False,
            },
            HTTPStatus.OK,
        )
