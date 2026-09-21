from api._common import JsonHandler


class handler(JsonHandler):
    def do_GET(self) -> None:
        self.send_json({"session": None})
