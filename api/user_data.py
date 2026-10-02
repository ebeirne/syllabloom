from __future__ import annotations

import base64
import json
import os
import re
from http import HTTPStatus
from typing import Any
from urllib.request import urlopen

import jwt
import psycopg
from jwt import PyJWKClient
from psycopg.types.json import Jsonb

from api._common import clerk_auth_config, deployment_env


MAX_USER_DATA_BYTES = 4 * 1024 * 1024
MAX_REQUEST_BYTES = MAX_USER_DATA_BYTES + 16 * 1024
_ALLOWED_FIELDS = {
    "schemaVersion",
    "classProfile",
    "sources",
    "ankiPreferences",
    "calendarEvents",
    "reviewHistory",
    "missCounts",
    "courseState",
    "lectureReviews",
    "classesUsed",
}
_jwks_clients: dict[str, PyJWKClient] = {}


def _publishable_key() -> str:
    return (
        os.environ.get("CLERK_PUBLISHABLE_KEY")
        or os.environ.get("VITE_CLERK_PUBLISHABLE_KEY")
        or os.environ.get("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY")
        or ""
    ).strip()


def _clerk_frontend_host() -> str:
    parts = _publishable_key().split("_", 2)
    if len(parts) != 3 or parts[0] != "pk" or parts[1] not in {"test", "live"}:
        raise ValueError("Clerk is not configured.")
    encoded = parts[2]
    padded = encoded + ("=" * (-len(encoded) % 4))
    try:
        host = base64.urlsafe_b64decode(padded.encode("ascii")).decode("ascii").rstrip("$").lower()
    except (ValueError, UnicodeDecodeError) as exc:
        raise ValueError("Clerk is not configured.") from exc
    if not host or len(host) > 253 or not re.fullmatch(r"[a-z0-9.-]+", host):
        raise ValueError("Clerk is not configured.")
    return host


def verify_clerk_token(token: str) -> str:
    host = _clerk_frontend_host()
    jwks_url = f"https://{host}/.well-known/jwks.json"
    client = _jwks_clients.get(jwks_url)
    if client is None:
        client = PyJWKClient(jwks_url, cache_jwk_set=True, lifespan=300, timeout=4)
        _jwks_clients[jwks_url] = client
    signing_key = client.get_signing_key_from_jwt(token)
    claims = jwt.decode(
        token,
        signing_key.key,
        algorithms=["RS256"],
        issuer=f"https://{host}",
        options={"verify_aud": False},
        leeway=5,
    )
    user_id = claims.get("sub")
    if not isinstance(user_id, str) or not user_id.startswith("user_") or len(user_id) > 255:
        raise jwt.InvalidTokenError("The token has no valid user subject.")
    return user_id


def authenticated_user(headers: Any) -> str | None:
    if not _runtime_auth_configured():
        return None
    authorization = headers.get("Authorization", "")
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token or len(token) > 12_000:
        return None
    try:
        return verify_clerk_token(token.strip())
    except Exception:
        return None


def _runtime_auth_configured() -> bool:
    environment = deployment_env()
    if not environment:
        return True
    allow_public_beta_auth = (os.environ.get("SYLLABLOOM_PUBLIC_BETA_AUTH") or "").strip().lower() in {
        "1",
        "true",
        "yes",
    }
    return bool(
        clerk_auth_config(
            _publishable_key(),
            environment,
            allow_test_key_in_production=allow_public_beta_auth,
        )["configured"]
    )


def require_authenticated_beta_request(request: Any, action: str) -> bool:
    """Require a Clerk user for hosted operations while keeping localhost QA usable."""
    if not deployment_env():
        return True
    if not _runtime_auth_configured():
        request.send_json(
            {"error": "Beta sign-in is unavailable until production authentication is configured."},
            HTTPStatus.SERVICE_UNAVAILABLE,
        )
        return False
    if authenticated_user(request.headers):
        from api.billing import require_access
        return require_access(request)
    request.send_json({"error": f"Sign in before {action}."}, HTTPStatus.UNAUTHORIZED)
    return False


def normalize_user_data(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ValueError("The saved workspace has an invalid format.")
    if set(value) - _ALLOWED_FIELDS:
        raise ValueError("The saved workspace contains unsupported fields.")
    if type(value.get("schemaVersion")) is not int or value.get("schemaVersion") != 1:
        raise ValueError("This workspace version is not supported.")

    shaped = {
        "schemaVersion": 1,
        "classProfile": value.get("classProfile", {}),
        "sources": value.get("sources", []),
        "ankiPreferences": value.get("ankiPreferences", {}),
        "calendarEvents": value.get("calendarEvents", []),
        "reviewHistory": value.get("reviewHistory", []),
        "missCounts": value.get("missCounts", {}),
        "courseState": value.get("courseState", {}),
        "lectureReviews": value.get("lectureReviews", {}),
        "classesUsed": value.get("classesUsed", 0),
    }
    if not isinstance(shaped["classProfile"], dict):
        raise ValueError("The class profile is invalid.")
    if not isinstance(shaped["sources"], list):
        raise ValueError("The saved source list is invalid.")
    if any(not isinstance(item, dict) for item in shaped["sources"]):
        raise ValueError("A saved source is invalid.")
    if not isinstance(shaped["ankiPreferences"], dict):
        raise ValueError("The Anki preferences are invalid.")
    if not isinstance(shaped["calendarEvents"], list) or len(shaped["calendarEvents"]) > 2_000:
        raise ValueError("The class calendar is invalid.")
    if any(not isinstance(item, dict) for item in shaped["calendarEvents"]):
        raise ValueError("A calendar event is invalid.")
    if not isinstance(shaped["reviewHistory"], list) or len(shaped["reviewHistory"]) > 2_000:
        raise ValueError("The study history is invalid.")
    if any(not isinstance(item, dict) for item in shaped["reviewHistory"]):
        raise ValueError("A study history entry is invalid.")
    if not isinstance(shaped["missCounts"], dict) or not isinstance(shaped["courseState"], dict):
        raise ValueError("The saved study state is invalid.")
    if not isinstance(shaped["courseState"].get("statuses", {}), dict) or not isinstance(shaped["courseState"].get("edits", {}), dict):
        raise ValueError("The saved card state is invalid.")
    if not isinstance(shaped["lectureReviews"], dict) or len(shaped["lectureReviews"]) > 500:
        raise ValueError("The lecture card reviews are invalid.")
    if any(not key.startswith("rounds-review-") or not isinstance(value, list) or any(not isinstance(item, dict) for item in value)
           for key, value in shaped["lectureReviews"].items()):
        raise ValueError("A saved lecture card review is invalid.")
    if type(shaped["classesUsed"]) is not int or not 0 <= shaped["classesUsed"] <= 10_000:
        raise ValueError("The class count is invalid.")
    try:
        serialized_size = len(json.dumps(shaped, ensure_ascii=False, separators=(",", ":")).encode("utf-8"))
    except (TypeError, ValueError) as exc:
        raise ValueError("The saved workspace is not valid JSON.") from exc
    if serialized_size > MAX_USER_DATA_BYTES:
        raise ValueError("This workspace is too large to sync. Remove unused source material and try again.")
    return shaped


def _database_url() -> str:
    if deployment_env().lower() in {"preview", "staging"}:
        # Never let a staging deployment silently fall back to the production database.
        return (os.environ.get("SYLLABLOOM_PREVIEW_DATABASE_URL") or "").strip()
    return (os.environ.get("DATABASE_URL") or "").strip()


def _ensure_table(connection: psycopg.Connection) -> None:
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS syllabloom_user_workspaces (
            user_id TEXT PRIMARY KEY,
            data JSONB NOT NULL,
            revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """
    )


def _send_json(request: Any, payload: dict, status: HTTPStatus = HTTPStatus.OK) -> None:
    body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    request.send_response(status)
    request.send_header("Content-Type", "application/json; charset=utf-8")
    request.send_header("Content-Length", str(len(body)))
    request.send_header("Cache-Control", "no-store")
    request.send_header("X-Content-Type-Options", "nosniff")
    request.end_headers()
    request.wfile.write(body)


def handle_request(request: Any, method: str) -> None:
    user_id = authenticated_user(request.headers)
    if not user_id:
        _send_json(request, {"error": "Sign in to sync this workspace."}, HTTPStatus.UNAUTHORIZED)
        return

    database_url = _database_url()
    if not database_url:
        _send_json(request, {"error": "Cloud sync is not configured yet. Your changes remain on this device."}, HTTPStatus.SERVICE_UNAVAILABLE)
        return

    try:
        with psycopg.connect(database_url, connect_timeout=5, autocommit=True) as connection:
            _ensure_table(connection)
            if method == "GET":
                row = connection.execute(
                    "SELECT data, revision, updated_at FROM syllabloom_user_workspaces WHERE user_id = %s",
                    (user_id,),
                ).fetchone()
                if row is None:
                    _send_json(request, {"data": None, "revision": 0, "updatedAt": None})
                    return
                _send_json(
                    request,
                    {"data": row[0], "revision": row[1], "updatedAt": row[2].isoformat()},
                )
                return

            if method != "PUT":
                _send_json(request, {"error": "Method not allowed."}, HTTPStatus.METHOD_NOT_ALLOWED)
                return

            try:
                if not request.headers.get("Content-Type", "").split(";", 1)[0].strip().lower() == "application/json":
                    raise ValueError("Send the workspace as JSON.")
                payload = request.read_json(maximum_bytes=MAX_REQUEST_BYTES)
                if not isinstance(payload, dict):
                    raise ValueError("The workspace request is invalid.")
                data = normalize_user_data(payload.get("data"))
                expected_revision = payload.get("expectedRevision")
                if type(expected_revision) is not int or not 0 <= expected_revision < 2**63 - 1:
                    raise ValueError("The sync revision is invalid.")
            except ValueError as exc:
                _send_json(request, {"error": str(exc)}, HTTPStatus.BAD_REQUEST)
                return

            if expected_revision == 0:
                row = connection.execute(
                    """
                    INSERT INTO syllabloom_user_workspaces (user_id, data, revision)
                    VALUES (%s, %s, 1)
                    ON CONFLICT (user_id) DO NOTHING
                    RETURNING revision, updated_at
                    """,
                    (user_id, Jsonb(data)),
                ).fetchone()
            else:
                row = connection.execute(
                    """
                    UPDATE syllabloom_user_workspaces
                    SET data = %s, revision = revision + 1, updated_at = NOW()
                    WHERE user_id = %s AND revision = %s
                    RETURNING revision, updated_at
                    """,
                    (Jsonb(data), user_id, expected_revision),
                ).fetchone()
            if row is None:
                _send_json(request, {"error": "This workspace changed on another device. Refresh to get the latest version."}, HTTPStatus.CONFLICT)
                return
            _send_json(request, {"revision": row[0], "updatedAt": row[1].isoformat()})
    except Exception as exc:
        print(f"User workspace sync failed: {type(exc).__name__}", flush=True)
        _send_json(request, {"error": "Cloud sync is temporarily unavailable. Your changes remain on this device."}, HTTPStatus.SERVICE_UNAVAILABLE)
