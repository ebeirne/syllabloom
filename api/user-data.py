from http import HTTPStatus
from urllib.parse import parse_qs, urlsplit

from api._common import JsonHandler
from api.user_data import handle_request


class handler(JsonHandler):
    def billing_route(self):
        route = urlsplit(self.path)
        if route.path in {'/api/billing-access', '/api/stripe-webhook'}:
            return route.path.rsplit('/', 1)[-1]
        return parse_qs(route.query).get('billing_route', [''])[0]

    def do_GET(self) -> None:
        if self.billing_route() == 'billing-access':
            from api.billing import handle_api
            handle_api(self, 'GET')
            return
        if self.billing_route():
            self.send_json({'error': 'Method not allowed.'}, HTTPStatus.METHOD_NOT_ALLOWED)
            return
        handle_request(self, "GET")

    def do_PUT(self) -> None:
        if self.billing_route():
            self.send_json({'error': 'Method not allowed.'}, HTTPStatus.METHOD_NOT_ALLOWED)
            return
        handle_request(self, "PUT")

    def do_POST(self) -> None:
        if self.billing_route() == 'billing-access':
            from api.billing import handle_api
            handle_api(self, 'POST')
            return
        if self.billing_route() == 'stripe-webhook':
            from api.billing import handle_webhook
            handle_webhook(self)
            return
        self.send_json({"error": "Method not allowed."}, HTTPStatus.METHOD_NOT_ALLOWED)
