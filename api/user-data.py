from http import HTTPStatus

from api._common import JsonHandler
from api.user_data import handle_request


class handler(JsonHandler):
    def do_GET(self) -> None:
        handle_request(self, "GET")

    def do_PUT(self) -> None:
        handle_request(self, "PUT")

    def do_POST(self) -> None:
        self.send_json({"error": "Method not allowed."}, HTTPStatus.METHOD_NOT_ALLOWED)
