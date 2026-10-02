import os
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor

import psycopg
from psycopg import sql
import pytest

from api import source_jobs as jobs
from api.ai_card_generation import AIUsageUnavailable


@pytest.fixture
def database(monkeypatch):
    url = os.environ.get('TEST_DATABASE_URL')
    if not url:
        pytest.skip('TEST_DATABASE_URL required for real PostgreSQL concurrency checks')
    connect = psycopg.connect
    schema = 'source_job_test_' + uuid.uuid4().hex
    with connect(url) as db:
        db.execute(sql.SQL('CREATE SCHEMA {}').format(sql.Identifier(schema)))
    monkeypatch.setattr(jobs, '_database_url', lambda: url)
    def isolated_connect(*args, **kwargs):
        db = connect(*args, **kwargs)
        db.execute(sql.SQL('SET LOCAL search_path TO {}').format(sql.Identifier(schema)))
        return db
    monkeypatch.setattr(jobs.psycopg, 'connect', isolated_connect)
    try:
        yield lambda: isolated_connect(url)
    finally:
        with connect(url) as db:
            db.execute(sql.SQL('DROP SCHEMA {} CASCADE').format(sql.Identifier(schema)))


def test_completed_result_survives_lost_http_reply_and_is_account_scoped(database):
    calls = []
    def generate():
        calls.append(1)
        return {'cards': [{'front': 'Question?', 'back': 'Answer'}]}
    first = jobs.run_batch('user_a', {'batch': 0}, generate)
    assert jobs.run_batch('user_a', {'batch': 0}, generate) == first
    assert jobs.run_batch('user_a', {'batch': 0}, generate, restart=True) == first
    assert len(calls) == 1
    jobs.run_batch('user_b', {'batch': 0}, generate)
    assert len(calls) == 2


def test_concurrent_resume_does_not_start_a_second_provider_call(database):
    started, finish = threading.Event(), threading.Event()
    calls = []
    def generate():
        calls.append(1)
        started.set()
        assert finish.wait(15)
        return {'cards': []}
    with ThreadPoolExecutor(2) as pool:
        worker = pool.submit(jobs.run_batch, 'user_a', {'batch': 0}, generate)
        assert started.wait(15)
        try:
            with pytest.raises(jobs.PendingBatch):
                jobs.run_batch('user_a', {'batch': 0}, generate, restart=True)
        finally:
            finish.set()
        assert worker.result() == {'cards': []}
    assert len(calls) == 1


def test_ambiguous_call_requires_explicit_restart_and_reuses_other_batches(database):
    calls = []
    def failed():
        calls.append('failed')
        raise TimeoutError()
    jobs.run_batch('user_a', {'batch': 0}, lambda: {'cards': ['saved']})
    with pytest.raises(jobs.UncertainBatch):
        jobs.run_batch('user_a', {'batch': 1}, failed)
    with pytest.raises(jobs.UncertainBatch):
        jobs.run_batch('user_a', {'batch': 1}, failed)
    assert calls == ['failed']
    assert jobs.run_batch('user_a', {'batch': 0}, failed, restart=True) == {'cards': ['saved']}
    assert jobs.run_batch('user_a', {'batch': 1}, lambda: {'cards': ['recovered']}, restart=True) == {'cards': ['recovered']}


def test_server_termination_marker_is_not_silently_replayed(database):
    owner, key = jobs.job_identity('user_a', {'batch': 0})
    with database() as db:
        db.execute(jobs.SCHEMA)
        db.execute("INSERT INTO syllabloom_source_jobs(owner,job_key,attempt,state,updated_at) VALUES (%s,%s,'dead','running',now()-interval '3 minutes')", (owner,key))
    with pytest.raises(jobs.UncertainBatch):
        jobs.run_batch('user_a', {'batch': 0}, lambda: pytest.fail('must not generate'))
    assert jobs.run_batch('user_a', {'batch': 0}, lambda: {'cards': []}, restart=True) == {'cards': []}


def test_pre_provider_failure_can_be_retried(database):
    def unavailable():
        raise AIUsageUnavailable()
    with pytest.raises(AIUsageUnavailable):
        jobs.run_batch('user_a', {}, unavailable)
    assert jobs.run_batch('user_a', {}, lambda: {'cards': []}) == {'cards': []}


def test_draft_retention_expires_and_different_input_does_not_reuse_results(database):
    jobs.run_batch('user_a', {'text': 'old'}, lambda: {'cards': ['old']})
    assert jobs.run_batch('user_a', {'text': 'new'}, lambda: {'cards': ['new']}) == {'cards': ['new']}
    with database() as db:
        db.execute("UPDATE syllabloom_source_jobs SET updated_at=now()-interval '25 hours'")
    assert jobs.run_batch('user_a', {'text': 'old'}, lambda: {'cards': ['fresh']}) == {'cards': ['fresh']}
