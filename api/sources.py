from api._common import JsonHandler


class handler(JsonHandler):
    def do_GET(self) -> None:
        # The public beta deliberately keeps uploaded course files session-scoped.
        self.send_json({"sources": []})
