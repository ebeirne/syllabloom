from __future__ import annotations

from http import HTTPStatus
from pathlib import Path
from urllib.parse import urlsplit

from api._common import JsonHandler
from api.lecture_processing import LectureJobConflict, create_job, resume_job
from api.lecture_storage import JOB_PATTERN, public_job, read_job, resolve_upload
from api.user_data import authenticated_user


def _job_id(path: str) -> str:
    parts = urlsplit(path).path.strip("/").split("/")
    value = parts[2] if len(parts) == 3 and parts[:2] == ["api", "lecture-jobs"] else ""
    return value if JOB_PATTERN.fullmatch(value) else ""


class handler(JsonHandler):
    def do_POST(self) -> None:
        user_id = authenticated_user(self.headers)
        if not user_id:
            self.send_json({"error": "Sign in before processing a lecture."}, HTTPStatus.UNAUTHORIZED)
            return
        try:
            body = self.read_json(64 * 1024)
            filename = Path(str(body.get("filename") or "lecture").replace("\\", "/")).name[:255]
            title = " ".join(str(body.get("title") or filename).split())[:100]
            path = resolve_upload(str(body.get("pathname") or ""), user_id)
            markers_value = body.get("markers") or []
            if not isinstance(markers_value, list):
                raise ValueError("Invalid markers")
            markers = [round(max(0.0, float(value)), 2) for value in markers_value[:100]]
            if not path.is_file():
                raise ValueError("Missing upload")
        except (TypeError, ValueError):
            self.send_json({"error": "The uploaded lecture could not be prepared."}, HTTPStatus.BAD_REQUEST)
            return
        try:
            job = create_job(user_id, path, filename, title, markers)
        except LectureJobConflict as exc:
            self.send_json({"error": str(exc)}, HTTPStatus.CONFLICT)
            return
        self.send_json({"job": job}, HTTPStatus.ACCEPTED)

    def do_GET(self) -> None:
        user_id = authenticated_user(self.headers)
        if not user_id:
            self.send_json({"error": "Sign in before opening a lecture job."}, HTTPStatus.UNAUTHORIZED)
            return
        job_id = _job_id(self.path)
        job = read_job(user_id, job_id) if job_id else None
        if not job:
            self.send_json({"error": "This lecture job was not found."}, HTTPStatus.NOT_FOUND)
            return
        resume_job(user_id, job_id)
        self.send_json({"job": public_job(job)})
