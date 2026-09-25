from __future__ import annotations

import math

from api.ai_card_generation import (
    AIConfigurationError,
    CHUNKS_PER_BATCH,
    MAX_SYNC_SOURCE_TEXT_CHARS,
    MAX_SOURCE_TEXT_CHARS,
    NoStudyCardsError,
    QUESTION_STYLES,
    SourceTextLimitError,
    _selected_chunks,
    _source_chunks,
    estimate_max_cost_microdollars,
    generate_ai_cards,
    is_configured,
)
from api.ai_usage import reserve_ai_usage


def generate_source_cards(
    text: str, filename: str, kind: str, units: dict | None, user_id: str,
    question_style: str = "balanced",
) -> dict:
    """Generate and validate a source-bound card set before the source is saved."""
    if not is_configured():
        raise AIConfigurationError()
    if len(text or "") > MAX_SYNC_SOURCE_TEXT_CHARS:
        raise SourceTextLimitError()
    if question_style not in QUESTION_STYLES:
        raise ValueError("Choose a supported question style.")
    max_cost_microdollars = estimate_max_cost_microdollars(
        text, filename, kind, units, question_style=question_style
    )
    reserve_ai_usage(user_id, len(text or ""), max_cost_microdollars)
    result = generate_ai_cards(text, filename, kind, units, question_style=question_style)
    if not result.get("cards"):
        raise NoStudyCardsError()
    return result


def generate_source_cards_batch(
    text: str,
    filename: str,
    kind: str,
    units: dict | None,
    user_id: str,
    batch_index: int,
    question_style: str = "balanced",
) -> dict:
    """Generate one bounded group so large sources fit the serverless request window."""
    if not is_configured():
        raise AIConfigurationError()
    if question_style not in QUESTION_STYLES:
        raise ValueError("Choose a supported question style.")
    if len(text or "") > MAX_SOURCE_TEXT_CHARS:
        raise SourceTextLimitError()
    chunks = _source_chunks(text or "", filename, units)
    batch_count = math.ceil(len(chunks) / CHUNKS_PER_BATCH)
    if not isinstance(batch_index, int) or not 0 <= batch_index < batch_count:
        raise SourceTextLimitError()
    batch_chunks = _selected_chunks(chunks, batch_index)
    batch_source_chars = sum(len(chunk["source"]) for chunk in batch_chunks)
    max_cost_microdollars = estimate_max_cost_microdollars(
        text, filename, kind, units, batch_index=batch_index, question_style=question_style
    )
    reserve_ai_usage(user_id, batch_source_chars, max_cost_microdollars)
    return generate_ai_cards(
        text, filename, kind, units, batch_index=batch_index, question_style=question_style
    )
