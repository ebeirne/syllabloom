import hashlib
from pathlib import Path
from unittest.mock import patch

import pytest

import api.source as source_api
from api.ai_card_generation import AIUsageLimitError, CardGenerationError
from api.ai_source_cards import generate_source_cards_batch


BASE_TEXT = (
    "The hippocampus supports the formation of new episodic memories. "
    "Systems consolidation gradually distributes memory representations across neocortical networks.\n"
)


def test_preflight_reports_bounded_batches_without_calling_card_generation(tmp_path):
    path = tmp_path / "memory-lecture.txt"
    text = BASE_TEXT * 650
    path.write_text(text, encoding="utf-8")

    with patch("api.source.generate_source_cards") as generate:
        result = source_api._source_preflight(path, path.name, "material")

    generate.assert_not_called()
    source = result["source"]
    assert source["preflight"]["inputCharacters"] == len(text)
    assert source["preflight"]["chunkCount"] > 4
    assert source["preflight"]["batchCount"] >= 2
    assert source["draftCards"] == []
    assert "generation" not in source
    assert result["extractedText"] == text
    assert source["fileFingerprint"] == hashlib.sha256(path.read_bytes()).hexdigest()
    assert source["id"] == source["fileFingerprint"][:12]
    assert source["fingerprint"] == hashlib.sha256(text.encode("utf-8")).hexdigest()


def test_generation_batch_verifies_text_hash_before_reserving_or_calling_provider():
    text = BASE_TEXT * 2
    body = {
        "filename": "memory.txt",
        "kind": "material",
        "extractedText": text,
        "extractedUnits": {"unitLabel": "lines", "unitCount": 2},
        "textFingerprint": "wrong",
        "batchIndex": 0,
    }
    with patch("api.source.generate_source_cards_batch") as generate:
        with pytest.raises(ValueError, match="source changed"):
            source_api._generate_source_batch(body, "user_test")
    generate.assert_not_called()


def test_generation_batches_reserve_only_their_bounded_source_text():
    text = BASE_TEXT * 650
    units = {"unitLabel": "pages", "pageTexts": [text]}
    fake_result = {"cards": [], "concepts": [], "generation": {"batchIndex": 0}}
    with patch("api.ai_source_cards.is_configured", return_value=True), \
         patch("api.ai_source_cards.reserve_ai_usage") as reserve, \
         patch("api.ai_source_cards.generate_ai_cards", return_value=fake_result) as generate:
        result = generate_source_cards_batch(
            text, "memory.pdf", "material", units, "user_test", 0
        )

    reserved_chars = reserve.call_args.args[1]
    assert 0 < reserved_chars <= 48_000
    assert reserve.call_args.args[2] > 0
    assert result is fake_result
    assert generate.call_args.kwargs["batch_index"] == 0


def test_generation_batch_validates_and_passes_question_style():
    text = BASE_TEXT
    body = {
        "filename": "memory.txt",
        "kind": "material",
        "extractedText": text,
        "extractedUnits": {"unitLabel": "pages", "pageTexts": [text]},
        "textFingerprint": hashlib.sha256(text.encode("utf-8")).hexdigest(),
        "batchIndex": 0,
        "questionStyle": "compare",
    }
    fake_result = {"cards": [], "concepts": [], "generation": {"questionStyle": "compare"}}
    with patch("api.source.generate_source_cards_batch", return_value=fake_result) as generate:
        result = source_api._generate_source_batch(body, "user_test")

    assert result is fake_result
    assert generate.call_args.args[-1] == "compare"


def test_generation_batch_rejects_unknown_question_style_before_provider_call():
    text = BASE_TEXT
    body = {
        "filename": "memory.txt",
        "kind": "material",
        "extractedText": text,
        "extractedUnits": {"unitLabel": "pages", "pageTexts": [text]},
        "textFingerprint": hashlib.sha256(text.encode("utf-8")).hexdigest(),
        "batchIndex": 0,
        "questionStyle": "make-it-up",
    }
    with patch("api.source.generate_source_cards_batch") as generate:
        with pytest.raises(ValueError, match="front question style"):
            source_api._generate_source_batch(body, "user_test")
    generate.assert_not_called()


def test_ambiguous_provider_failure_is_not_retryable_but_preflight_limits_are():
    assert CardGenerationError.retryable is False
    assert AIUsageLimitError.retryable is True
