from http import HTTPStatus

from api._common import JsonHandler


class handler(JsonHandler):
    def do_GET(self) -> None:
        self.send_json(
            {
                "ok": True,
                "mode": "beta-cloud",
                "sourceImport": True,
                "ankiExport": True,
                "mediaCapture": True,
                "mediaImport": True,
                "mediaStorage": "browser-per-user",
                "transcription": False,
            },
            HTTPStatus.OK,
        )
