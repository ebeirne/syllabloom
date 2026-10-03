"""Private temporary storage for lecture uploads and processing results."""
from __future__ import annotations

import json
import os
import re
import tempfile
import threading
import time
from pathlib import Path

MAX_LECTURE_BYTES = 500 * 1024 * 1024
UPLOAD_EXPIRY_SECONDS = 24 * 60 * 60
JOB_EXPIRY_SECONDS = 7 * 24 * 60 * 60
CONTENT_TYPES = {
    "wav": "audio/wav",
    "mp3": "audio/mpeg",
    "m4a": "audio/mp4",
    "webm": "audio/webm",
    "ogg": "audio/ogg",
    "flac": "audio/flac",
    "mp4": "video/mp4",
    "mov": "video/quicktime",
}
_USER = r"user_[A-Za-z0-9_-]{1,250}"
_UUID = r"[a-f0-9-]{36}"
UPLOAD_PATTERN = re.compile(
    rf"lecture-uploads/(?P<user>{_USER})/(?P<name>{_UUID}\.(?:wav|mp3|m4a|webm|ogg|flac|mp4|mov))"
)
JOB_PATTERN = re.compile(rf"(?P<job>{_UUID})")
_write_lock = threading.Lock()


def upload_root() -> Path:
    configured = (os.environ.get("SYLLABLOOM_UPLOAD_DIR") or "").strip()
    return Path(configured) if configured else Path(tempfile.gettempdir()) / "syllabloom-uploads"


def resolve_upload(pathname: str, user_id: str) -> Path:
    match = UPLOAD_PATTERN.fullmatch(str(pathname or ""))
    if not match or match.group("user") != user_id:
        raise ValueError("The temporary lecture path is invalid.")
    return upload_root() / pathname


def job_path(user_id: str, job_id: str) -> Path:
    if not re.fullmatch(_USER, user_id or "") or not JOB_PATTERN.fullmatch(job_id or ""):
        raise ValueError("The lecture job is invalid.")
    return upload_root() / "lecture-jobs" / user_id / f"{job_id}.json"


def read_job(user_id: str, job_id: str) -> dict | None:
    path = job_path(user_id, job_id)
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
        return value if isinstance(value, dict) and value.get("owner") == user_id else None
    except (OSError, json.JSONDecodeError):
        return None


def write_job(job: dict) -> None:
    path = job_path(str(job.get("owner") or ""), str(job.get("id") or ""))
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(".json.tmp")
    with _write_lock:
        temporary.write_text(json.dumps(job, ensure_ascii=False), encoding="utf-8")
        os.replace(temporary, path)


def public_job(job: dict) -> dict:
    allowed = {
        "id", "status", "stage", "progress", "filename", "title", "createdAt",
        "updatedAt", "error", "result",
    }
    return {key: value for key, value in job.items() if key in allowed}


def active_job(user_id: str) -> dict | None:
    if not re.fullmatch(_USER, user_id or ""):
        return None
    directory = upload_root() / "lecture-jobs" / user_id
    if not directory.is_dir():
        return None
    for path in sorted(directory.glob("*.json"), reverse=True):
        try:
            job = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        if job.get("owner") == user_id and job.get("status") in {"queued", "processing"}:
            return job
    return None


def cleanup_expired(now: float | None = None) -> tuple[int, int]:
    root = upload_root()
    current = time.time() if now is None else now
    inspected = deleted = 0
    for relative, expiry in (("lecture-uploads", UPLOAD_EXPIRY_SECONDS), ("lecture-jobs", JOB_EXPIRY_SECONDS)):
        base = root / relative
        if not base.is_dir():
            continue
        cutoff = current - expiry
        for path in base.rglob("*"):
            if not path.is_file():
                continue
            inspected += 1
            try:
                if path.stat().st_mtime < cutoff:
                    path.unlink()
                    deleted += 1
            except OSError:
                continue
        for directory in sorted((item for item in base.rglob("*") if item.is_dir()), reverse=True):
            try:
                directory.rmdir()
            except OSError:
                pass
    return inspected, deleted
