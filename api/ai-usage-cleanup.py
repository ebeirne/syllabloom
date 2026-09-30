from datetime import datetime, timedelta, timezone
import hmac
import os
from http import HTTPStatus

import psycopg

from api._common import JsonHandler
from api.user_data import _database_url
from api.source_jobs import SCHEMA as SOURCE_JOBS_SCHEMA


class handler(JsonHandler):
    def do_GET(self) -> None:
        expected = (os.environ.get("CRON_SECRET") or "").strip()
        supplied = self.headers.get("Authorization", "")
        if not expected or not hmac.compare_digest(supplied, f"Bearer {expected}"):
            self.send_json({"error": "Unauthorized."}, HTTPStatus.UNAUTHORIZED)
            return
        database_url = _database_url()
        if not database_url:
            self.send_json({"error": "Usage cleanup is not configured."}, HTTPStatus.SERVICE_UNAVAILABLE)
            return
        cutoff = datetime.now(timezone.utc).date() - timedelta(days=90)
        try:
            with psycopg.connect(database_url, connect_timeout=5) as connection:
                connection.execute(SOURCE_JOBS_SCHEMA)
                connection.execute("DELETE FROM syllabloom_source_jobs WHERE updated_at < now() - interval '7 days' OR (state='complete' AND updated_at < now() - interval '24 hours')")
                connection.execute(
                    """
                    CREATE TABLE IF NOT EXISTS syllabloom_ai_usage_daily (
                        usage_date DATE NOT NULL,
                        scope_key TEXT NOT NULL,
                        source_chars BIGINT NOT NULL DEFAULT 0 CHECK (source_chars >= 0),
                        PRIMARY KEY (usage_date, scope_key)
                    )
                    """
                )
                result = connection.execute(
                    "DELETE FROM syllabloom_ai_usage_daily WHERE usage_date < %s",
                    (cutoff,),
                )
                deleted = max(0, result.rowcount)
            self.send_json({"ok": True, "deletedUsageRows": deleted})
        except Exception as exc:
            print(f"AI usage cleanup failed: {type(exc).__name__}", flush=True)
            self.send_json({"error": "Usage cleanup is temporarily unavailable."}, HTTPStatus.SERVICE_UNAVAILABLE)
