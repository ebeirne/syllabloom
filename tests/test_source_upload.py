import importlib
import io
import json
import os
import time

import pytest

import api.source as source_api
import api.source_storage as storage
from api.routes import resolve

USER = "user_beta123"
NAME = "12345678-abcd-1234-abcd-123456789abc.pdf"
PATH = f"source-uploads/{USER}/{NAME}"


def _request(module, headers, body=b"", path="/"):
    request = object.__new__(importlib.import_module(module).handler)
    request.headers = headers
    request.rfile = io.BytesIO(body)
    request.path = path
    request.sent = []
    request.send_json = lambda payload, status=200: request.sent.append((payload, int(status)))
    return request


def test_large_upload_path_is_scoped_to_the_signed_in_user():
    assert source_api._source_path(PATH, USER) == PATH
    with pytest.raises(ValueError):
        source_api._source_path(PATH, "user_someone_else")


def test_large_upload_path_rejects_traversal_and_wrong_file_types():
    with pytest.raises(ValueError):
        source_api._source_path("source-uploads/user_beta123/../../private.pdf", USER)
    with pytest.raises(ValueError):
        source_api._source_path(f"source-uploads/{USER}/12345678-abcd-1234-abcd-123456789abc.exe", USER)


def test_pathname_resolves_only_inside_the_upload_root_for_its_owner(tmp_path, monkeypatch):
    monkeypatch.setenv("SYLLABLOOM_UPLOAD_DIR", str(tmp_path))
    assert storage.resolve_pathname(PATH, USER) == tmp_path / PATH
    for bad_user, bad_path in ((  "user_other", PATH), (USER, f"source-uploads/{USER}/../x.pdf")):
        with pytest.raises(ValueError):
            storage.resolve_pathname(bad_path, bad_user)


def test_routes_cover_every_endpoint_the_client_calls():
    for path in (
        "/api/auth-config", "/api/health", "/api/user-data", "/api/source", "/api/export-anki",
        "/api/source-upload-url", f"/api/source-upload/{NAME}", "/api/sessions/latest",
        "/api/transcribe-stream", "/api/source-upload-cleanup", "/api/ai-usage-cleanup",
    ):
        assert resolve(path) is not None, path
    for path in ("/index.html", "/api/", "/api/nope", "/api/health/extra", "/api/../server.py"):
        assert resolve(path) is None, path


def test_upload_url_requires_sign_in(monkeypatch):
    module = "api.source-upload-url"
    monkeypatch.setattr(importlib.import_module(module), "authenticated_user", lambda _headers: None)
    request = _request(module, {})
    request.do_POST()
    assert request.sent[0][1] == 401


def test_upload_url_issues_a_scoped_slot_and_rejects_bad_requests(monkeypatch):
    module = "api.source-upload-url"
    monkeypatch.setattr(importlib.import_module(module), "authenticated_user", lambda _headers: USER)

    def post(payload):
        body = json.dumps(payload).encode()
        request = _request(module, {"Content-Length": str(len(body))}, body)
        request.do_POST()
        return request.sent[0]

    payload, status = post({"filename": "Lecture 1.pdf", "size": 1234})
    assert status == 200
    assert payload["pathname"].startswith(f"source-uploads/{USER}/")
    assert payload["uploadUrl"] == "/api/source-upload/" + payload["pathname"].rsplit("/", 1)[1]
    assert payload["contentType"] == "application/pdf"
    assert post({"filename": "virus.exe", "size": 10})[1] == 400
    assert post({"filename": "a.pdf", "size": 101 * 1024 * 1024})[1] == 413
    assert post({"filename": "a.pdf", "size": True})[1] == 413


def test_upload_put_streams_to_disk_once_and_checks_length(tmp_path, monkeypatch):
    monkeypatch.setenv("SYLLABLOOM_UPLOAD_DIR", str(tmp_path))
    module = "api.source-upload"
    monkeypatch.setattr(importlib.import_module(module), "authenticated_user", lambda _headers: USER)
    data = b"%PDF-1.4 test"
    headers = {"Content-Type": "application/pdf", "Content-Length": str(len(data))}

    first = _request(module, headers, data, f"/api/source-upload/{NAME}")
    first.do_PUT()
    assert first.sent == [({"ok": True}, 200)]
    assert (tmp_path / PATH).read_bytes() == data

    again = _request(module, headers, data, f"/api/source-upload/{NAME}")
    again.do_PUT()
    assert again.sent[0][1] == 409

    short_name = "22345678-abcd-1234-abcd-123456789abc.pdf"
    short = _request(module, {**headers, "Content-Length": "999"}, data, f"/api/source-upload/{short_name}")
    short.do_PUT()
    assert short.sent[0][1] == 400
    assert not (tmp_path / f"source-uploads/{USER}/{short_name}").exists()

    wrong_type = _request(module, {**headers, "Content-Type": "text/plain"}, data, f"/api/source-upload/{NAME}")
    wrong_type.do_PUT()
    assert wrong_type.sent[0][1] == 400


def test_cleanup_removes_only_expired_uploads(tmp_path, monkeypatch):
    monkeypatch.setenv("SYLLABLOOM_UPLOAD_DIR", str(tmp_path))
    old, fresh = tmp_path / PATH, tmp_path / f"source-uploads/{USER}/32345678-abcd-1234-abcd-123456789abc.pdf"
    old.parent.mkdir(parents=True)
    old.write_bytes(b"old")
    fresh.write_bytes(b"fresh")
    expired = time.time() - storage.EXPIRY_SECONDS - 60
    os.utime(old, (expired, expired))

    assert storage.cleanup_expired() == (2, 1)
    assert not old.exists() and fresh.exists()


def test_cleanup_endpoint_requires_the_shared_secret(tmp_path, monkeypatch):
    monkeypatch.setenv("SYLLABLOOM_UPLOAD_DIR", str(tmp_path))
    monkeypatch.setenv("CRON_SECRET", "s3cret")
    denied = _request("api.source-upload-cleanup", {"Authorization": "Bearer wrong"})
    denied.do_GET()
    assert denied.sent[0][1] == 401
    allowed = _request("api.source-upload-cleanup", {"Authorization": "Bearer s3cret"})
    allowed.do_GET()
    assert allowed.sent == [({"inspected": 0, "deleted": 0}, 200)]


def test_source_endpoint_reads_then_deletes_the_uploaded_file(tmp_path, monkeypatch):
    monkeypatch.setenv("SYLLABLOOM_UPLOAD_DIR", str(tmp_path))
    stored = tmp_path / PATH
    stored.parent.mkdir(parents=True)
    stored.write_bytes(b"%PDF")
    seen = {}

    def preflight(path, filename, kind):
        seen["existed"] = path.exists()
        return {"source": {"filename": filename}}

    body = json.dumps({"operation": "inspect", "filename": "a.pdf", "pathname": PATH}).encode()
    request = _request("api.source", {"Content-Type": "application/json", "Content-Length": str(len(body))}, body)
    monkeypatch.setattr(source_api, "require_authenticated_beta_request", lambda *_args: True)
    monkeypatch.setattr(source_api, "authenticated_user", lambda _headers: USER)
    monkeypatch.setattr(source_api, "_source_preflight", preflight)

    request.do_POST()

    assert request.sent[0][1] == 200
    assert seen["existed"] is True
    assert not stored.exists()


def test_source_endpoint_routes_bounded_card_batches_without_a_new_function(monkeypatch):
    body = {"operation": "generate-batch", "batchIndex": 0}
    encoded = json.dumps(body).encode("utf-8")
    request = _request("api.source", {"Content-Type": "application/json", "Content-Length": str(len(encoded))}, encoded)
    monkeypatch.setattr(source_api, "require_authenticated_beta_request", lambda *_args: True)
    monkeypatch.setattr(source_api, "authenticated_user", lambda _headers: "user_test")
    monkeypatch.setattr(
        source_api,
        "_generate_source_batch",
        lambda received, user_id: {"cards": [], "received": received, "userId": user_id},
    )

    request.do_POST()

    assert request.sent == [({"result": {"cards": [], "received": body, "userId": "user_test"}}, 200)]
