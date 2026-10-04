"""Background lecture processing for hosted uploads.

The browser keeps the original media in IndexedDB. The server copy is temporary and
is removed after the transcript and study package have been persisted.
"""
from __future__ import annotations

import base64
import io
import os
import re
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

from api.lecture_storage import active_job, public_job, read_job, write_job

_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="syllabloom-lecture")
_active: set[str] = set()
_active_lock = threading.Lock()
_create_lock = threading.Lock()


class LectureJobConflict(RuntimeError):
    pass


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _update(owner: str, job_id: str, **changes) -> dict:
    job = read_job(owner, job_id)
    if not job:
        raise RuntimeError("Lecture job disappeared.")
    job.update(changes)
    job["updatedAt"] = _now()
    write_job(job)
    return job


def create_job(owner: str, path: Path, filename: str, title: str, markers: list[float]) -> dict:
    with _create_lock:
        if active_job(owner):
            raise LectureJobConflict("Finish the current lecture before starting another one.")
        job_id = str(uuid.uuid4())
        job = {
            "id": job_id,
            "owner": owner,
            "pathname": str(path),
            "filename": filename,
            "title": title,
            "markers": markers,
            "status": "queued",
            "stage": "Waiting for the lecture worker",
            "progress": 5,
            "createdAt": _now(),
            "updatedAt": _now(),
        }
        write_job(job)
    _schedule_job(owner, job_id)
    return public_job(job)


def _schedule_job(owner: str, job_id: str) -> None:
    with _active_lock:
        if job_id in _active:
            return
        _active.add(job_id)
    _executor.submit(_run_job, owner, job_id)


def resume_job(owner: str, job_id: str) -> None:
    """Resume a queued/in-flight job after an API process restart."""
    job = read_job(owner, job_id)
    if job and job.get("status") in {"queued", "processing"}:
        _schedule_job(owner, job_id)


def _signature(image) -> bytes:
    return image.resize((16, 16)).convert("L").tobytes()


def _difference(left: bytes, right: bytes) -> float:
    if not left or len(left) != len(right):
        return 255.0
    return sum(abs(a - b) for a, b in zip(left, right)) / len(left)


def extract_visual_keyframes(path: Path, markers: list[float] | None = None, maximum: int = 12) -> list[dict]:
    """Return compact scene-change frames suitable for an evidence timeline."""
    import av

    markers = sorted(max(0.0, float(value)) for value in (markers or []))
    captured_markers: set[int] = set()
    selected: list[dict] = []
    candidate_limit = max(maximum, maximum * 4)
    with av.open(str(path)) as container:
        streams = [stream for stream in container.streams if stream.type == "video"]
        if not streams:
            return []
        stream = streams[0]
        duration = float(container.duration / av.time_base) if container.duration else 0.0
        sample_interval = max(8.0, duration / candidate_limit) if duration else 8.0
        next_sample = 0.0
        prior = b""
        for frame in container.decode(stream):
            if frame.pts is None:
                continue
            timestamp = float(frame.pts * frame.time_base)
            nearby_markers = [
                index for index, marker in enumerate(markers)
                if index not in captured_markers and abs(timestamp - marker) <= 1.5
            ]
            near_marker = bool(nearby_markers)
            if timestamp + 0.01 < next_sample and not near_marker:
                continue
            if selected and timestamp - float(selected[-1]["time"]) < 2.0:
                continue
            next_sample = timestamp + sample_interval
            image = frame.to_image().convert("RGB")
            image.thumbnail((640, 360))
            current = _signature(image)
            difference = _difference(prior, current)
            if selected and difference < 13.0 and not near_marker:
                continue
            output = io.BytesIO()
            image.save(output, format="JPEG", quality=72, optimize=True)
            selected.append({
                "time": round(timestamp, 2),
                "width": image.width,
                "height": image.height,
                "reason": "marked moment" if near_marker else "visual change",
                "image": "data:image/jpeg;base64," + base64.b64encode(output.getvalue()).decode("ascii"),
            })
            captured_markers.update(nearby_markers)
            prior = current
            if len(selected) >= candidate_limit:
                break
    if len(selected) <= maximum:
        return selected
    marked = [frame for frame in selected if frame["reason"] == "marked moment"][:maximum]
    ordinary = [frame for frame in selected if frame["reason"] != "marked moment"]
    slots = maximum - len(marked)
    if slots <= 0:
        return sorted(marked, key=lambda frame: frame["time"])
    if len(ordinary) <= slots:
        sampled = ordinary
    elif slots == 1:
        sampled = [ordinary[len(ordinary) // 2]]
    else:
        sampled = [ordinary[round(index * (len(ordinary) - 1) / (slots - 1))] for index in range(slots)]
    return sorted(marked + sampled, key=lambda frame: frame["time"])


def build_chapters(result: dict) -> list[dict]:
    chapters: list[dict] = []
    seen: set[str] = set()
    for note in result.get("notes") or []:
        title = " ".join(str(note.get("title") or "").split())
        time_value = note.get("heardAt")
        key = title.casefold()
        if not title or key in seen or not isinstance(time_value, (int, float)):
            continue
        seen.add(key)
        chapters.append({"title": title[:100], "time": round(max(0.0, float(time_value)), 2)})
    if chapters:
        return chapters[:16]
    last_bucket = -1
    for segment in result.get("segments") or []:
        start = float(segment.get("start") or 0)
        bucket = int(start // 300)
        if bucket == last_bucket:
            continue
        words = str(segment.get("text") or "").strip().split()
        if len(words) < 3:
            continue
        last_bucket = bucket
        chapters.append({"title": " ".join(words[:8]).rstrip(".,:;"), "time": round(start, 2)})
    return chapters[:16]


_IMPORTANCE_CUES = re.compile(
    r"\b(?:important|key|remember|exam|test|definition|defined|means|because|therefore|"
    r"causes?|results? in|leads? to|difference|compared with|for example)\b",
    re.IGNORECASE,
)


def build_key_notes(result: dict, markers: list[float] | None = None) -> list[dict]:
    """Rank transcript-backed notes without inventing facts or removing evidence."""
    markers = [max(0.0, float(value)) for value in (markers or [])]
    transcript = " ".join(str(segment.get("text") or "") for segment in result.get("segments") or []).casefold()
    ranked: list[tuple[float, int, dict]] = []
    for index, note in enumerate(result.get("notes") or []):
        if not isinstance(note, dict):
            continue
        lines = [" ".join(str(line).split()) for line in (note.get("lines") or []) if str(line).strip()]
        title = " ".join(str(note.get("title") or "Key point").split())[:100]
        if not lines:
            continue
        heard_at = note.get("heardAt")
        timestamp = float(heard_at) if isinstance(heard_at, (int, float)) else None
        combined = f"{title} {' '.join(lines)}"
        score = 3.0 if note.get("status") != "provisional" else 0.0
        score += min(4, len(_IMPORTANCE_CUES.findall(combined))) * 1.5
        normalized_title = title.casefold()
        if len(normalized_title) >= 4:
            score += min(3, transcript.count(normalized_title))
        if timestamp is not None and any(abs(timestamp - marker) <= 25 for marker in markers):
            score += 4.0
        ranked.append((score, index, {
            "title": title,
            "heardAt": round(timestamp, 2) if timestamp is not None else None,
            "status": note.get("status") or "provisional",
            "source": note.get("source") or "",
            "lines": lines[:4],
            "importanceScore": round(score, 2),
        }))
    meaningful = [item for item in ranked if item[0] >= 1.0]
    selected = sorted(meaningful or ranked, key=lambda item: (-item[0], item[1]))[:12 if meaningful else 4]
    # Preserve lecture order after selecting the strongest supported notes.
    return [item[2] for item in sorted(selected, key=lambda item: (
        item[2]["heardAt"] is None,
        item[2]["heardAt"] if item[2]["heardAt"] is not None else item[1],
    ))]


def _run_job(owner: str, job_id: str) -> None:
    job = read_job(owner, job_id)
    path = Path(str(job.get("pathname"))) if job else None
    try:
        if not job or not path or not path.is_file():
            raise ValueError("The temporary lecture file is no longer available.")
        _update(owner, job_id, status="processing", stage="Transcribing the lecture", progress=20)
        # Import lazily so API route discovery does not load the transcription model.
        from server import transcribe

        cloud = os.environ.get('SYLLABLOOM_LECTURE_PROVIDER') == 'openai'
        if cloud:
            from api.lecture_cloud import transcribe_lecture
            result = transcribe_lecture(path, owner, job, lambda **changes: _update(owner, job_id, **changes))
        else:
            result = transcribe(path)
        if not cloud:
            _update(owner, job_id, status="processing", stage="Finding useful video frames", progress=78)
        try:
            visuals = [] if cloud else extract_visual_keyframes(path, job.get("markers") or [])
        except Exception as exc:
            print(f"Lecture frame extraction skipped: {type(exc).__name__}", flush=True)
            visuals = []
        result["visualKeyframes"] = visuals
        if not cloud:
            result["chapters"] = build_chapters(result)
            result["keyNotes"] = build_key_notes(result, job.get("markers") or [])
        result["filename"] = job["filename"]
        result["title"] = job["title"]
        result["sessionId"] = job_id
        result["processingMode"] = "hosted-temporary"
        _update(
            owner,
            job_id,
            status="ready",
            stage="Study package ready",
            progress=100,
            result=result,
            error=None,
        )
    except Exception as exc:
        print(f"Lecture job failed: {type(exc).__name__}", flush=True)
        try:
            _update(
                owner,
                job_id,
                status="failed",
                stage="Lecture processing failed",
                progress=100,
                error=("A provider result could not be confirmed. It was not retried to avoid duplicate processing. Contact support before starting this lecture again."
                       if (read_job(owner, job_id) or {}).get('providerPending')
                       else "The lecture could not be processed. Check that it has an audio track and is no longer than three hours."),
            )
        except Exception:
            pass
    finally:
        if path is not None:
            path.unlink(missing_ok=True)
        with _active_lock:
            _active.discard(job_id)
