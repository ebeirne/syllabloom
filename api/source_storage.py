"""Temporary on-disk storage for large course documents.

Uploads live under ``<upload root>/source-uploads/<user id>/<uuid>.<ext>`` and are
deleted right after the source is read. A scheduled cleanup removes anything
abandoned for longer than ``EXPIRY_SECONDS``.
"""
from __future__ import annotations

import os
import re
import tempfile
import time
from pathlib import Path

MAX_SOURCE_BYTES = 100 * 1024 * 1024
EXPIRY_SECONDS = 24 * 60 * 60
CONTENT_TYPES = {
    "pdf": "application/pdf",
    "pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "txt": "text/plain",
}
PATHNAME_PATTERN = re.compile(
    r"source-uploads/(?P<user>user_[A-Za-z0-9_-]{1,250})/(?P<name>[a-f0-9-]{36}\.(?:pdf|pptx|docx|txt))"
)


def upload_root() -> Path:
    configured = (os.environ.get("SYLLABLOOM_UPLOAD_DIR") or "").strip()
    return Path(configured) if configured else Path(tempfile.gettempdir()) / "syllabloom-uploads"


def resolve_pathname(pathname: str, user_id: str) -> Path:
    """Map a ticket pathname to a file on disk, only if it belongs to ``user_id``."""
    match = PATHNAME_PATTERN.fullmatch(str(pathname or ""))
    if not match or match.group("user") != user_id:
        raise ValueError("The temporary upload path is invalid.")
    return upload_root() / pathname


def cleanup_expired(now: float | None = None) -> tuple[int, int]:
    """Delete uploads older than the expiry window. Returns (inspected, deleted)."""
    root = upload_root() / "source-uploads"
    cutoff = (time.time() if now is None else now) - EXPIRY_SECONDS
    inspected = deleted = 0
    if not root.is_dir():
        return inspected, deleted
    for path in root.rglob("*"):
        if not path.is_file():
            continue
        inspected += 1
        try:
            if path.stat().st_mtime < cutoff:
                path.unlink()
                deleted += 1
        except OSError:
            continue
    for directory in sorted((p for p in root.rglob("*") if p.is_dir()), reverse=True):
        try:
            directory.rmdir()
        except OSError:
            pass
    return inspected, deleted
