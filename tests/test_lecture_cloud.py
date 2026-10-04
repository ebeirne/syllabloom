import json
from pathlib import Path
from types import SimpleNamespace

import pytest

from api import lecture_cloud


def test_evidence_spanning_segments_preserves_actual_passage():
    segments = [{'start': 10, 'text': "Python doesn't require a"},
                {'start': 12, 'text': 'declared type for this assignment.'}]
    match = lecture_cloud.evidence_segment("[10.0s] Python doesn’t require a\ndeclared type", segments)
    assert match['start'] == 10
    assert match['evidence'] == "Python doesn't require a declared type for this assignment."
    assert lecture_cloud.evidence_segment('Java always stores everything on the stack.', segments) is None


def test_rejects_oversize_duration_before_provider(monkeypatch):
    info = {'format': {'duration': 10801}, 'streams': [{'codec_type': 'audio'}]}
    monkeypatch.setattr(lecture_cloud.subprocess, 'run', lambda *a, **kw: SimpleNamespace(stdout=json.dumps(info)))
    monkeypatch.setattr(lecture_cloud, '_exchange', lambda *a: pytest.fail('Unexpected provider call'))
    with pytest.raises(ValueError, match='three hours'):
        lecture_cloud.transcribe_lecture(Path('test.mp4'), 'user_test', {}, lambda **kw: {})


def test_ambiguous_exchange_is_not_retried(monkeypatch):
    info = {'format': {'duration': 20}, 'streams': [{'codec_type': 'audio'}]}
    monkeypatch.setattr(lecture_cloud.subprocess, 'run', lambda *a, **kw: SimpleNamespace(stdout=json.dumps(info)))
    monkeypatch.setattr(lecture_cloud, '_exchange', lambda *a: pytest.fail('Unexpected provider retry'))
    with pytest.raises(RuntimeError, match='could not be confirmed'):
        lecture_cloud.transcribe_lecture(Path('test.mp4'), 'user_test', {'providerPending': True}, lambda **kw: {})


def test_resume_uses_cached_transcript_and_notes_and_filters_unquoted_notes(monkeypatch):
    info = {'format': {'duration': 20}, 'streams': [{'codec_type': 'audio'}]}
    monkeypatch.setattr(lecture_cloud.subprocess, 'run', lambda *a, **kw: SimpleNamespace(stdout=json.dumps(info)))
    monkeypatch.setattr(lecture_cloud, '_exchange', lambda *a: pytest.fail('Cached work must not be charged again'))
    job = {'usageReserved': True, 'completedChunks': 1,
           'transcribedSegments': [{'start': 2, 'end': 6, 'text': 'Cells contain a plasma membrane.'}],
           'noteSections': [{'summary': 'Cell structure.', 'notes': [
               {'title': 'Membrane', 'quote': 'Cells contain a plasma membrane.', 'lines': ['A membrane surrounds the cell.']},
               {'title': 'Unsupported', 'quote': 'Invented content.', 'lines': ['Do not include.']}]}]}
    result = lecture_cloud.transcribe_lecture(Path('test.mp4'), 'user_test', job, lambda **kw: {})
    assert len(result['notes']) == 1
    assert result['notes'][0]['heardAt'] == 2
    assert result['chapters'][0]['time'] == 2
    assert result['summary'] == 'Cell structure.'
