"""Account-scoped checkpoints for recovering a lost batch response.

Never reclaim an uncertain provider call automatically. A student may explicitly
restart an unfinished attempt; completed results always win, even on a restart.
"""
import hashlib
import json
import uuid
from http import HTTPStatus

import psycopg
from psycopg.types.json import Jsonb

from api.ai_card_generation import CardGenerationError, AIUsageUnavailable
from api.user_data import _database_url

SCHEMA = """
CREATE TABLE IF NOT EXISTS syllabloom_source_jobs (
    owner TEXT NOT NULL, job_key TEXT NOT NULL, attempt TEXT NOT NULL,
    state TEXT NOT NULL, result JSONB, error JSONB,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (owner, job_key)
)
"""


class PendingBatch(CardGenerationError):
    status = HTTPStatus.CONFLICT
    public_message = "This batch is still processing. Wait a moment, then choose Resume import to recover its result."
    retryable = True


class UncertainBatch(CardGenerationError):
    public_message = "This batch was interrupted before its result could be saved. Restart the unfinished batch to continue. Completed batches will be reused."
    retryable = False
    code = "BATCH_RESTART_REQUIRED"


def job_identity(user_id, data):
    owner = hashlib.sha256(user_id.encode()).hexdigest()
    key = hashlib.sha256(json.dumps(data, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode()).hexdigest()
    return owner, key


def run_batch(user_id, data, generate, restart=False):
    owner, key = job_identity(user_id, data)
    attempt = uuid.uuid4().hex
    url = _database_url()
    if not url:
        raise AIUsageUnavailable()
    try:
        with psycopg.connect(url, connect_timeout=5) as db:
            db.execute(SCHEMA)
            # Successful drafts expire after 24h. Keep failure markers longer so
            # a late browser retry does not silently repeat an uncertain call.
            db.execute("DELETE FROM syllabloom_source_jobs WHERE updated_at < now() - interval '7 days'")
            db.execute("DELETE FROM syllabloom_source_jobs WHERE state = 'complete' AND updated_at < now() - interval '24 hours'")
            inserted = db.execute("""INSERT INTO syllabloom_source_jobs(owner,job_key,attempt,state)
                VALUES (%s,%s,%s,'running') ON CONFLICT DO NOTHING RETURNING attempt""", (owner, key, attempt)).fetchone()
            if not inserted:
                row = db.execute("""SELECT state,result,error,updated_at > now() - interval '2 minutes'
                    FROM syllabloom_source_jobs WHERE owner=%s AND job_key=%s FOR UPDATE""", (owner,key)).fetchone()
                state, result, error, fresh = row
                if state == 'complete':
                    return result
                if state == 'running' and fresh:
                    raise PendingBatch()
                if state == 'running' or state == 'uncertain':
                    if not restart:
                        raise UncertainBatch()
                elif not (error or {}).get('retryable', False):
                    raise UncertainBatch()
                db.execute("""UPDATE syllabloom_source_jobs SET state='running',attempt=%s,
                    result=NULL,error=NULL,updated_at=now() WHERE owner=%s AND job_key=%s""", (attempt,owner,key))
        # The running marker is committed before any paid call is made.
    except CardGenerationError:
        raise
    except Exception as exc:
        raise AIUsageUnavailable() from exc

    try:
        result = generate()
    except Exception as exc:
        retryable = isinstance(exc, CardGenerationError) and exc.retryable
        try:
            with psycopg.connect(url, connect_timeout=5) as db:
                db.execute("""UPDATE syllabloom_source_jobs SET state=%s,error=%s,updated_at=now()
                    WHERE owner=%s AND job_key=%s AND attempt=%s""",
                    ('failed' if retryable else 'uncertain', Jsonb({'retryable':retryable}),owner,key,attempt))
        except Exception:
            pass  # The committed running marker still prevents automatic replay.
        if retryable:
            raise
        raise UncertainBatch() from exc
    try:
        with psycopg.connect(url, connect_timeout=5) as db:
            saved = db.execute("""UPDATE syllabloom_source_jobs SET state='complete',result=%s,
                error=NULL,updated_at=now() WHERE owner=%s AND job_key=%s AND attempt=%s RETURNING attempt""",
                (Jsonb(result),owner,key,attempt)).fetchone()
            if not saved:
                raise UncertainBatch()
    except CardGenerationError:
        raise
    except Exception as exc:
        raise UncertainBatch() from exc
    return result
