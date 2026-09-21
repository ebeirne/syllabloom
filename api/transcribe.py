from http import HTTPStatus

from api._common import JsonHandler


class handler(JsonHandler):
    def do_POST(self) -> None:
        self.send_json(
            {
                "error": "Lecture transcription is currently in the desktop pilot. This public beta supports source import, card review, and Anki export."
            },
            HTTPStatus.SERVICE_UNAVAILABLE,
        )
