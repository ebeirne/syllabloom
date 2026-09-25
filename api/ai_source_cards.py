from __future__ import annotations

from api.ai_card_generation import (
    AIConfigurationError,
    MAX_SOURCE_TEXT_CHARS,
    NoStudyCardsError,
    SourceTextLimitError,
    estimate_max_cost_microdollars,
    generate_ai_cards,
    is_configured,
)
from api.ai_usage import reserve_ai_usage


def generate_source_cards(text: str, filename: str, kind: str, units: dict | None, user_id: str) -> dict:
    """Generate and validate a source-bound card set before the source is saved."""
    if not is_configured():
        raise AIConfigurationError()
    if len(text or "") > MAX_SOURCE_TEXT_CHARS:
        raise SourceTextLimitError()
    max_cost_microdollars = estimate_max_cost_microdollars(text, filename, kind, units)
    reserve_ai_usage(user_id, len(text or ""), max_cost_microdollars)
    result = generate_ai_cards(text, filename, kind, units)
    if not result.get("cards"):
        raise NoStudyCardsError()
    return result
