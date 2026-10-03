import importlib
import io
import json
import os
import time

import pytest

from api import lecture_processing
from api import lecture_storage
from api.routes import resolve

USER = "user_lecture123"
MEDIA_NAME = "12345678-abcd-1234-abcd-123456789abc.mp4"
MEDIA_PATH = f"lecture-uploads/{USER}/{MEDIA_NAME}"


def request(module, headers, body=b"", path="/"):
    value = object.__new__(importlib.import_module(module).handler)
    value.headers = headers
    value.rfile = io.BytesIO(body)
    value.path = path
    value.sent = []
    value.send_json = lambda payload, status=200: value.sent.append((payload, int(status)))
    return value


def test_lecture_routes_include_uploads_and_job_status():
    assert resolve("/api/lecture-upload-url") is not None
    assert resolve(f"/api/lecture-upload/{MEDIA_NAME}") is not None
    assert resolve("/api/lecture-jobs") is not None
    assert resolve("/api/lecture-jobs/22345678-abcd-1234-abcd-123456789abc") is not None


def test_lecture_upload_ticket_is_private_and_bounded(monkeypatch):
    module = importlib.import_module("api.lecture-upload-url")
    monkeypatch.setattr(module, "authenticated_user", lambda _headers: USER)

    def post(value):
        encoded = json.dumps(value).encode()
        item = request("api.lecture-upload-url", {"Content-Length": str(len(encoded))}, encoded)
        item.do_POST()
        return item.sent[0]

    payload, status = post({"filename": "lecture.mp4", "size": 1234})
    assert status == 200
    assert payload["pathname"].startswith(f"lecture-uploads/{USER}/")
    assert payload["uploadUrl"].startswith("/api/lecture-upload/")
    assert payload["contentType"] == "video/mp4"
    assert post({"filename": "lecture.exe", "size": 10})[1] == 400
    assert post({"filename": "lecture.mp4", "size": lecture_storage.MAX_LECTURE_BYTES + 1})[1] == 413


def test_lecture_upload_streams_once_and_is_owner_scoped(tmp_path, monkeypatch):
    monkeypatch.setenv("SYLLABLOOM_UPLOAD_DIR", str(tmp_path))
    module = importlib.import_module("api.lecture-upload")
    monkeypatch.setattr(module, "authenticated_user", lambda _headers: USER)
    data = b"not-a-real-mp4"
    headers = {"Content-Type": "video/mp4", "Content-Length": str(len(data))}
    item = request("api.lecture-upload", headers, data, f"/api/lecture-upload/{MEDIA_NAME}")
    item.do_PUT()
    assert item.sent == [({"ok": True}, 200)]
    assert lecture_storage.resolve_upload(MEDIA_PATH, USER).read_bytes() == data
    with pytest.raises(ValueError):
        lecture_storage.resolve_upload(MEDIA_PATH, "user_someone_else")


def test_job_creation_and_status_never_expose_server_paths(tmp_path, monkeypatch):
    monkeypatch.setenv("SYLLABLOOM_UPLOAD_DIR", str(tmp_path))
    stored = lecture_storage.resolve_upload(MEDIA_PATH, USER)
    stored.parent.mkdir(parents=True)
    stored.write_bytes(b"media")
    module = importlib.import_module("api.lecture-jobs")
    monkeypatch.setattr(module, "authenticated_user", lambda _headers: USER)
    monkeypatch.setattr(module, "create_job", lambda owner, path, filename, title, markers: {
        "id": "22345678-abcd-1234-abcd-123456789abc", "status": "queued", "progress": 5,
    })
    body = json.dumps({
        "pathname": MEDIA_PATH, "filename": "Biology lecture.mp4", "title": "Biology", "markers": [12.5]
    }).encode()
    created = request("api.lecture-jobs", {"Content-Length": str(len(body))}, body, "/api/lecture-jobs")
    created.do_POST()
    assert created.sent[0][1] == 202
    assert created.sent[0][0]["job"]["status"] == "queued"

    job = {
        "id": "22345678-abcd-1234-abcd-123456789abc", "owner": USER,
        "pathname": str(stored), "status": "ready", "stage": "Study package ready",
        "progress": 100, "result": {"transcript": "Example"},
    }
    lecture_storage.write_job(job)
    status = request("api.lecture-jobs", {}, path="/api/lecture-jobs/22345678-abcd-1234-abcd-123456789abc")
    status.do_GET()
    public = status.sent[0][0]["job"]
    assert status.sent[0][1] == 200
    assert public["result"]["transcript"] == "Example"
    assert "pathname" not in public and "owner" not in public


def test_chapters_prefer_timestamped_notes_then_fall_back_to_transcript():
    chapters = lecture_processing.build_chapters({"notes": [
        {"title": "Cell membrane", "heardAt": 25.2},
        {"title": "Cell membrane", "heardAt": 42.0},
        {"title": "Ion channels", "heardAt": 315.0},
    ]})
    assert chapters == [
        {"title": "Cell membrane", "time": 25.2},
        {"title": "Ion channels", "time": 315.0},
    ]
    fallback = lecture_processing.build_chapters({"segments": [
        {"start": 0, "text": "Today we introduce cellular respiration clearly."},
        {"start": 305, "text": "Next we examine the electron transport chain."},
    ]})
    assert [item["time"] for item in fallback] == [0.0, 305.0]


def test_key_notes_prioritize_source_matches_emphasis_and_marked_moments():
    result = {
        "segments": [{"text": "Diffusion diffusion. Remember the concentration gradient because it drives movement."}],
        "notes": [
            {"title": "Administrative aside", "heardAt": 5, "status": "provisional", "lines": ["We will take a break soon."]},
            {"title": "Diffusion", "heardAt": 80, "status": "provisional", "lines": ["Remember the concentration gradient because it drives movement."]},
            {"title": "Membrane", "heardAt": None, "status": "verified", "lines": ["The membrane separates two compartments."]},
        ],
    }
    notes = lecture_processing.build_key_notes(result, markers=[82])
    assert {note["title"] for note in notes} == {"Diffusion", "Membrane"}
    scores = {note["title"]: note["importanceScore"] for note in notes}
    assert scores["Diffusion"] >= 4
    assert scores["Membrane"] >= 3


def test_lecture_cleanup_removes_abandoned_uploads_and_old_results(tmp_path, monkeypatch):
    monkeypatch.setenv("SYLLABLOOM_UPLOAD_DIR", str(tmp_path))
    upload = lecture_storage.resolve_upload(MEDIA_PATH, USER)
    upload.parent.mkdir(parents=True)
    upload.write_bytes(b"old")
    job = lecture_storage.job_path(USER, "22345678-abcd-1234-abcd-123456789abc")
    job.parent.mkdir(parents=True)
    job.write_text("{}", encoding="utf-8")
    expired = time.time() - lecture_storage.JOB_EXPIRY_SECONDS - 60
    os.utime(upload, (expired, expired))
    os.utime(job, (expired, expired))
    assert lecture_storage.cleanup_expired() == (2, 2)


def test_worker_persists_study_package_and_deletes_temporary_media(tmp_path, monkeypatch):
    import server

    monkeypatch.setenv("SYLLABLOOM_UPLOAD_DIR", str(tmp_path))
    stored = lecture_storage.resolve_upload(MEDIA_PATH, USER)
    stored.parent.mkdir(parents=True)
    stored.write_bytes(b"temporary media")
    job_id = "32345678-abcd-1234-abcd-123456789abc"
    lecture_storage.write_job({
        "id": job_id, "owner": USER, "pathname": str(stored), "filename": "Lecture.mp4",
        "title": "Lecture", "markers": [12], "status": "queued", "stage": "Waiting", "progress": 5,
    })
    monkeypatch.setattr(server, "transcribe", lambda _path: {
        "transcript": "Remember diffusion because gradients drive movement.",
        "segments": [{"start": 10, "text": "Remember diffusion because gradients drive movement."}],
        "notes": [{"title": "Diffusion", "heardAt": 10, "status": "provisional", "lines": ["Gradients drive movement."]}],
        "cards": [], "detectedConcepts": [], "qualityWarnings": [], "durationSeconds": 20,
        "processingSeconds": 1, "waveform": [],
    })
    monkeypatch.setattr(lecture_processing, "extract_visual_keyframes", lambda *_args, **_kwargs: [
        {"time": 10, "reason": "visual change", "image": "data:image/jpeg;base64,eA=="}
    ])

    lecture_processing._run_job(USER, job_id)

    finished = lecture_storage.read_job(USER, job_id)
    assert finished["status"] == "ready"
    assert finished["result"]["processingMode"] == "hosted-temporary"
    assert finished["result"]["chapters"][0]["title"] == "Diffusion"
    assert finished["result"]["keyNotes"][0]["title"] == "Diffusion"
    assert len(finished["result"]["visualKeyframes"]) == 1
    assert not stored.exists()
