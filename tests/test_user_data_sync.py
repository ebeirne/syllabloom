from __future__ import annotations

import io
import time
import unittest
from unittest.mock import patch

import jwt
from cryptography.hazmat.primitives.asymmetric import rsa

from api import user_data


class UserDataValidationTests(unittest.TestCase):
    def test_preview_database_connection_never_falls_back_to_shared_database(self) -> None:
        with patch.dict(
            user_data.os.environ,
            {
                "VERCEL_ENV": "preview",
                "DATABASE_URL": "postgresql://production.example/db",
                "SYLLABLOOM_PREVIEW_DATABASE_URL": "postgresql://preview.example/db",
            },
            clear=True,
        ):
            self.assertEqual(user_data._database_url(), "postgresql://preview.example/db")

        with patch.dict(
            user_data.os.environ,
            {"VERCEL_ENV": "preview", "DATABASE_URL": "postgresql://production.example/db"},
            clear=True,
        ):
            self.assertEqual(user_data._database_url(), "")

    def test_non_preview_database_connection_keeps_existing_configuration(self) -> None:
        with patch.dict(
            user_data.os.environ,
            {
                "VERCEL_ENV": "production",
                "DATABASE_URL": "postgresql://production.example/db",
                "SYLLABLOOM_PREVIEW_DATABASE_URL": "postgresql://preview.example/db",
            },
            clear=True,
        ):
            self.assertEqual(user_data._database_url(), "postgresql://production.example/db")

    def test_accepts_only_the_workspace_schema_and_expected_shapes(self) -> None:
        value = {
            "schemaVersion": 1,
            "classProfile": {"className": "PSY 241"},
            "sources": [{"id": "source-1", "draftCards": []}],
            "ankiPreferences": {"format": "Basic"},
            "calendarEvents": [{"id": "exam-1", "type": "exam"}],
            "reviewHistory": [],
            "missCounts": {},
            "courseState": {"statuses": {}, "edits": {}},
            "lectureReviews": {},
            "classesUsed": 1,
        }
        self.assertEqual(user_data.normalize_user_data(value), value)

    def test_workspace_has_no_fixed_source_count_cap_and_accepts_more_sync_data(self) -> None:
        value = {"schemaVersion": 1, "sources": [{"id": f"source-{index}"} for index in range(400)]}
        self.assertEqual(len(user_data.normalize_user_data(value)["sources"]), 400)
        larger = user_data.normalize_user_data({"schemaVersion": 1, "sources": [{"notes": "x" * (3 * 1024 * 1024 + 1)}]})
        self.assertGreater(len(larger["sources"][0]["notes"]), 3 * 1024 * 1024)

    def test_browser_media_blobs_are_not_part_of_the_synced_schema(self) -> None:
        self.assertNotIn("media", user_data._ALLOWED_FIELDS)
        self.assertNotIn("recording", user_data._ALLOWED_FIELDS)
        self.assertNotIn("blob", user_data._ALLOWED_FIELDS)

    def test_rejects_client_selected_user_ids_and_unknown_fields(self) -> None:
        with self.assertRaisesRegex(ValueError, "unsupported fields"):
            user_data.normalize_user_data({"schemaVersion": 1, "userId": "user_other"})

    def test_rejects_invalid_schema_and_malformed_rows(self) -> None:
        with self.assertRaisesRegex(ValueError, "version"):
            user_data.normalize_user_data({"schemaVersion": True})
        with self.assertRaisesRegex(ValueError, "source"):
            user_data.normalize_user_data({"schemaVersion": 1, "sources": ["not-a-source"]})

    def test_rejects_oversized_workspaces(self) -> None:
        with self.assertRaisesRegex(ValueError, "too large"):
            user_data.normalize_user_data({"schemaVersion": 1, "sources": [{"notes": "x" * user_data.MAX_USER_DATA_BYTES}]})


class ClerkAuthenticationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)

    def test_verifies_signature_issuer_and_user_subject(self) -> None:
        now = int(time.time())
        token = jwt.encode(
            {"iss": "https://example.clerk.accounts.dev", "sub": "user_test123", "iat": now, "exp": now + 60},
            self.private_key,
            algorithm="RS256",
            headers={"kid": "test-key"},
        )

        class SigningKey:
            key = self.private_key.public_key()

        class FakeJwksClient:
            def get_signing_key_from_jwt(self, _token: str) -> SigningKey:
                return SigningKey()

        with patch.object(user_data, "_clerk_frontend_host", return_value="example.clerk.accounts.dev"), patch.dict(
            user_data._jwks_clients, {"https://example.clerk.accounts.dev/.well-known/jwks.json": FakeJwksClient()}
        ):
            self.assertEqual(user_data.verify_clerk_token(token), "user_test123")

    def test_rejects_wrong_issuer_and_non_user_subjects(self) -> None:
        now = int(time.time())
        class SigningKey:
            key = self.private_key.public_key()

        class FakeJwksClient:
            def get_signing_key_from_jwt(self, _token: str) -> SigningKey:
                return SigningKey()

        with patch.object(user_data, "_clerk_frontend_host", return_value="example.clerk.accounts.dev"), patch.dict(
            user_data._jwks_clients, {"https://example.clerk.accounts.dev/.well-known/jwks.json": FakeJwksClient()}
        ):
            wrong_issuer = jwt.encode(
                {"iss": "https://other.example", "sub": "user_test123", "iat": now, "exp": now + 60},
                self.private_key,
                algorithm="RS256",
                headers={"kid": "test-key"},
            )
            wrong_subject = jwt.encode(
                {"iss": "https://example.clerk.accounts.dev", "sub": "session_123", "iat": now, "exp": now + 60},
                self.private_key,
                algorithm="RS256",
                headers={"kid": "test-key"},
            )
            with self.assertRaises(jwt.InvalidTokenError):
                user_data.verify_clerk_token(wrong_issuer)
            with self.assertRaises(jwt.InvalidTokenError):
                user_data.verify_clerk_token(wrong_subject)

    def test_unauthenticated_api_request_is_rejected_before_database_access(self) -> None:
        class Request:
            headers = {}
            wfile = io.BytesIO()

            def send_response(self, status: int) -> None:
                self.status = status

            def send_header(self, _name: str, _value: str) -> None:
                pass

            def end_headers(self) -> None:
                pass

        request = Request()
        with patch.object(user_data, "_database_url", side_effect=AssertionError("database should not be opened")):
            user_data.handle_request(request, "GET")
        self.assertEqual(request.status, 401)

    def test_hosted_course_uploads_require_auth_and_test_keys_fail_closed(self) -> None:
        class Request:
            headers = {}

            def send_json(self, _payload: dict, status) -> None:
                self.status = status

        request = Request()
        with patch.dict(user_data.os.environ, {"VERCEL_ENV": "production", "CLERK_PUBLISHABLE_KEY": "pk_test_example"}, clear=True):
            self.assertFalse(user_data.require_authenticated_beta_request(request, "adding course materials"))
        self.assertEqual(request.status, 503)

        request = Request()
        with patch.dict(user_data.os.environ, {"VERCEL_ENV": "production", "CLERK_PUBLISHABLE_KEY": "pk_live_example"}, clear=True):
            with patch.object(user_data, "authenticated_user", return_value=None):
                self.assertFalse(user_data.require_authenticated_beta_request(request, "adding course materials"))
        self.assertEqual(request.status, 401)

    def test_public_beta_flag_accepts_test_clerk_tokens_but_keeps_routes_authenticated(self) -> None:
        class Request:
            headers = {}

            def send_json(self, _payload: dict, status) -> None:
                self.status = status

        environment = {
            "VERCEL_ENV": "production",
            "CLERK_PUBLISHABLE_KEY": "pk_test_example",
            "SYLLABLOOM_PUBLIC_BETA_AUTH": "true",
        }
        request = Request()
        with patch.dict(user_data.os.environ, environment, clear=True):
            self.assertTrue(user_data._runtime_auth_configured())
            with patch.object(user_data, "authenticated_user", return_value=None):
                self.assertFalse(user_data.require_authenticated_beta_request(request, "adding course materials"))
            self.assertEqual(request.status, 401)

            request = Request()
            with patch.object(user_data, "authenticated_user", return_value="user_beta_test"):
                self.assertTrue(user_data.require_authenticated_beta_request(request, "adding course materials"))

    def test_local_course_upload_smoke_tests_remain_available_without_clerk(self) -> None:
        class Request:
            headers = {}

            def send_json(self, *_args, **_kwargs) -> None:
                raise AssertionError("localhost should not need hosted auth")

        with patch.dict(user_data.os.environ, {"VERCEL_ENV": ""}, clear=True):
            self.assertTrue(user_data.require_authenticated_beta_request(Request(), "adding course materials"))


if __name__ == "__main__":
    unittest.main()
