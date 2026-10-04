import os
import shutil
from http import HTTPStatus
from pathlib import Path

from api.ai_card_generation import DEFAULT_MODEL, is_configured
from api._common import JsonHandler
from api.user_data import _database_url


class handler(JsonHandler):
    def do_GET(self) -> None:
        default_model = Path(__file__).resolve().parents[1] / ".models" / "whisper-small"
        whisper_model = Path((os.environ.get("SYLLABLOOM_WHISPER_MODEL") or str(default_model)).strip())
        cloud_ready = (os.environ.get('SYLLABLOOM_LECTURE_PROVIDER') == 'openai'
                       and is_configured() and bool(shutil.which('ffmpeg')) and bool(shutil.which('ffprobe')))
        transcription_ready = cloud_ready or whisper_model.is_dir()
        self.send_json(
            {
                "ok": True,
                "mode": "beta-cloud",
                "sourceImport": True,
                "aiCardGeneration": is_configured(),
                "aiCardGenerationModel": DEFAULT_MODEL,
                "aiCardUsageGuard": bool(_database_url()),
                "ankiExport": True,
                "mediaCapture": True,
                "mediaImport": True,
                "mediaStorage": "browser-per-user",
                "transcription": transcription_ready,
                "lectureJobs": True,
                "videoKeyframes": transcription_ready and not cloud_ready,
            },
            HTTPStatus.OK,
        )
