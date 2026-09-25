from __future__ import annotations

import json
import tempfile
import threading
import unittest
from http.server import ThreadingHTTPServer
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from pathlib import Path
from unittest.mock import patch

from api.ai_card_generation import (
    AIConfigurationError,
    AIUsageLimitError,
    NoStudyCardsError,
    SourceTextLimitError,
    estimate_max_cost_microdollars,
    generate_ai_cards,
)
from api.ai_source_cards import generate_source_cards
from api.source import handler as source_handler
from server import source_summary


SOURCE = (
    "During systems consolidation, new episodic memories initially depend on the hippocampus, "
    "then become more distributed across neocortical networks over time."
)
QUOTE = SOURCE


def card(**overrides: str) -> dict[str, str]:
    result = {
        "concept": "Systems consolidation",
        "question": "How does systems consolidation change where episodic memories depend on over time?",
        "answer": "They first depend on the hippocampus, then become more distributed across neocortical networks as time passes.",
        "card_type": "mechanism",
        "source_locator": "Page 1",
        "source_quote": QUOTE,
    }
    result.update(overrides)
    return result


class FakeResponse:
    status = 200

    def __init__(self, cards: list[dict[str, str]]) -> None:
        self.body = json.dumps({
            "status": "completed",
            "output": [{
                "type": "message",
                "content": [{"type": "output_text", "text": json.dumps({"cards": cards})}],
            }],
        }).encode()

    def __enter__(self) -> FakeResponse:
        return self

    def __exit__(self, *_: object) -> None:
        return None

    def read(self, _limit: int) -> bytes:
        return self.body


class FakeOpener:
    def __init__(self, cards: list[dict[str, str]]) -> None:
        self.cards = cards
        self.requests = []

    def __call__(self, request, timeout: int) -> FakeResponse:
        self.requests.append((request, timeout))
        return FakeResponse(self.cards)


class AICardGenerationTests(unittest.TestCase):
    def test_material_upload_endpoint_returns_ai_cards_and_usage_metadata(self) -> None:
        ai_cards = [{
            "id": "ai-source-card",
            "front": card()["question"],
            "back": card()["answer"],
            "concept": "Systems consolidation",
            "section": "Systems consolidation",
            "source": "cognition.txt",
            "sourceQuote": QUOTE,
            "sourceLocation": "cognition.txt",
            "generatedBy": "openai",
        }]
        ai_result = {
            "cards": ai_cards,
            "concepts": [{"name": "Systems consolidation", "status": "verified"}],
            "generation": {"provider": "OpenAI", "model": "gpt-5.4-nano", "cardsAccepted": 1},
        }
        api_server = ThreadingHTTPServer(("127.0.0.1", 0), source_handler)
        worker = threading.Thread(target=api_server.serve_forever, daemon=True)
        worker.start()
        boundary = "----SyllabloomAIUploadTest"
        body = b"".join((
            f"--{boundary}\r\nContent-Disposition: form-data; name=\"kind\"\r\n\r\nmaterial\r\n".encode(),
            f"--{boundary}\r\nContent-Disposition: form-data; name=\"source\"; filename=\"cognition.txt\"\r\nContent-Type: text/plain\r\n\r\n".encode(),
            SOURCE.encode(),
            f"\r\n--{boundary}--\r\n".encode(),
        ))
        request = Request(
            f"http://127.0.0.1:{api_server.server_port}/api/source",
            data=body,
            headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
            method="POST",
        )
        try:
            with patch("api.source.generate_source_cards", return_value=ai_result) as generate:
                with urlopen(request, timeout=10) as response:
                    payload = json.loads(response.read())
            generate.assert_called_once()
            self.assertEqual(payload["source"]["draftCards"], ai_cards)
            self.assertEqual(payload["source"]["generation"], ai_result["generation"])
        except HTTPError as response:
            self.fail(f"Source upload returned {response.code}: {response.read().decode('utf-8')}")
        finally:
            api_server.shutdown()
            api_server.server_close()
            worker.join(timeout=2)

    def test_source_summary_uses_ai_cards_without_heuristic_fallback(self) -> None:
        ai_cards = [
            {
                "id": "ai-card-1",
                "front": card()["question"],
                "back": card()["answer"],
                "section": "Systems consolidation",
                "sourceQuote": QUOTE,
                "sourceLocation": "notes.txt",
                "generatedBy": "openai",
            }
        ]
        ai_result = {
            "cards": ai_cards,
            "concepts": [{"name": "Systems consolidation", "status": "verified"}],
            "generation": {"provider": "OpenAI", "model": "gpt-5.4-nano", "cardsAccepted": 1},
        }
        calls = []

        def generator(text: str, filename: str, kind: str, units: dict) -> dict:
            calls.append((text, filename, kind, units))
            return ai_result

        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "notes.txt"
            path.write_text(SOURCE, encoding="utf-8")
            summary = source_summary(path, "notes.txt", "material", card_generator=generator)

        self.assertEqual(len(calls), 1)
        self.assertEqual(calls[0][2], "material")
        self.assertEqual(summary["draftCards"], ai_cards)
        self.assertEqual(summary["concepts"], ai_result["concepts"])
        self.assertEqual(summary["generation"], ai_result["generation"])

    def test_documents_categorized_as_syllabus_bypass_card_generation(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "course-syllabus.txt"
            path.write_text("Course Syllabus\nFall 2026\nSeptember 20 | Midterm Exam", encoding="utf-8")
            with patch("api.source.generate_source_cards") as generator:
                from api.source import _source_summary

                summary = _source_summary(path, path.name, "syllabus", "user_test")

        generator.assert_not_called()
        self.assertEqual(summary["kind"], "syllabus")
        self.assertNotIn("generation", summary)
        self.assertEqual(summary["draftCards"], [])

    def test_structured_responses_call_is_private_source_limited_and_page_aware(self) -> None:
        opener = FakeOpener([card()])
        result = generate_ai_cards(
            f"Page 1\n{SOURCE}",
            "cognition.pdf",
            "material",
            {"pageTexts": [SOURCE]},
            api_key="test-key-not-real",
            opener=opener,
        )

        request, timeout = opener.requests[0]
        body = json.loads(request.data)
        self.assertEqual(request.full_url, "https://api.openai.com/v1/responses")
        self.assertEqual(request.get_header("Authorization"), "Bearer test-key-not-real")
        self.assertEqual(body["model"], "gpt-5.4-nano")
        self.assertEqual(body["reasoning"], {"effort": "low"})
        self.assertIs(body["store"], False)
        self.assertEqual(body["text"]["format"]["type"], "json_schema")
        self.assertTrue(body["text"]["format"]["strict"])
        self.assertEqual(body["text"]["format"]["schema"]["properties"]["cards"]["items"]["properties"]["source_locator"]["enum"], ["Page 1"])
        self.assertIn("Use ONLY claims directly supported", body["input"][0]["content"])
        self.assertLessEqual(timeout, 40)
        self.assertEqual(result["cards"][0]["sourceLocation"], "Page 1")
        self.assertEqual(result["cards"][0]["sourceQuote"], QUOTE)
        self.assertEqual(result["cards"][0]["generatedBy"], "openai")

    def test_rejects_ungrounded_link_and_non_question_output(self) -> None:
        opener = FakeOpener([
            card(),
            card(source_quote="The hippocampus stores everything forever, and this is not in the source."),
            card(question="https://example.edu/notes"),
            card(question="Systems consolidation").copy(),
        ])
        opener.cards[-1]["question"] = "Systems consolidation"
        result = generate_ai_cards(
            SOURCE,
            "cognition.txt",
            "material",
            {"pageTexts": [SOURCE]},
            api_key="test-key-not-real",
            opener=opener,
        )
        self.assertEqual(len(result["cards"]), 1)
        self.assertEqual(result["cards"][0]["front"], card()["question"])

    def test_locator_quote_must_belong_to_that_exact_page(self) -> None:
        opener = FakeOpener([card(source_locator="Page 2")])
        result = generate_ai_cards(
            "Page 1\n" + SOURCE + "\nPage 2\nPhotosynthesis converts light energy into chemical energy stored in sugars.",
            "science.pdf",
            "material",
            {"pageTexts": [SOURCE, "Photosynthesis converts light energy into chemical energy stored in sugars."]},
            api_key="test-key-not-real",
            opener=opener,
        )
        self.assertEqual(result["cards"], [])

    def test_deduplicates_identical_cards(self) -> None:
        opener = FakeOpener([card(), card()])
        result = generate_ai_cards(
            SOURCE,
            "cognition.txt",
            "material",
            {"pageTexts": [SOURCE]},
            api_key="test-key-not-real",
            opener=opener,
        )
        self.assertEqual(len(result["cards"]), 1)

    def test_source_alignment_gate_handles_multiple_course_subjects(self) -> None:
        examples = [
            (
                "biology",
                "Competitive inhibition occurs when a substrate-like molecule binds the enzyme's active site, preventing the normal substrate from binding.",
                {
                    "concept": "Competitive inhibition",
                    "question": "How does competitive inhibition reduce enzyme activity?",
                    "answer": "A substrate-like molecule occupies the active site, so the normal substrate cannot bind.",
                    "card_type": "mechanism",
                },
            ),
            (
                "computer science",
                "Binary search repeatedly halves a sorted search interval, reducing the number of comparisons to logarithmic growth.",
                {
                    "concept": "Binary search complexity",
                    "question": "Why does binary search need logarithmic comparisons on a sorted interval?",
                    "answer": "Each comparison discards half of the remaining interval, so the steps grow logarithmically.",
                    "card_type": "mechanism",
                },
            ),
            (
                "economics",
                "An increase in interest rates raises the cost of borrowing, which tends to reduce investment spending when other factors are unchanged.",
                {
                    "concept": "Interest rates and investment",
                    "question": "How can higher interest rates affect investment spending, all else equal?",
                    "answer": "Higher rates make borrowing more costly, which tends to reduce investment.",
                    "card_type": "cause-effect",
                },
            ),
            (
                "history",
                "The Treaty of Versailles imposed reparations on Germany after World War I, contributing to financial pressure during the postwar period.",
                {
                    "concept": "Treaty of Versailles reparations",
                    "question": "What financial obligation did the Treaty of Versailles impose on Germany after World War I?",
                    "answer": "It imposed reparations on Germany, contributing to postwar financial pressure.",
                    "card_type": "cause-effect",
                },
            ),
        ]
        for subject, source, draft in examples:
            with self.subTest(subject=subject):
                draft = {**draft, "source_locator": "Page 1", "source_quote": source}
                result = generate_ai_cards(
                    source,
                    f"{subject}.pdf",
                    "material",
                    {"pageTexts": [source]},
                    api_key="test-key-not-real",
                    opener=FakeOpener([draft]),
                )
                self.assertEqual(len(result["cards"]), 1)
                self.assertEqual(result["cards"][0]["sourceQuote"], source)

    def test_missing_key_and_oversized_text_fail_before_provider_call(self) -> None:
        with patch.dict("os.environ", {"OPENAI_API_KEY": ""}):
            with self.assertRaises(AIConfigurationError):
                generate_ai_cards(SOURCE, "notes.txt", "material", {}, opener=FakeOpener([]))
        with self.assertRaises(SourceTextLimitError):
            generate_ai_cards("x" * 48_001, "notes.txt", "material", {}, api_key="test-key-not-real", opener=FakeOpener([]))

    def test_model_is_pinned_to_the_beta_allowlist(self) -> None:
        with patch.dict("os.environ", {"OPENAI_CARDS_MODEL": "gpt-expensive-model"}):
            with self.assertRaises(AIConfigurationError):
                generate_ai_cards(SOURCE, "notes.txt", "material", {}, api_key="test-key-not-real", opener=FakeOpener([]))

    def test_cost_reservation_covers_maximum_output_and_is_within_beta_budget(self) -> None:
        estimate = estimate_max_cost_microdollars(SOURCE, "notes.txt", "material", {"pageTexts": [SOURCE]})
        self.assertGreaterEqual(estimate, 1_400 * 1.25)
        self.assertLess(estimate, 100_000)

    def test_ai_source_wrapper_fails_closed_on_daily_quota(self) -> None:
        with patch("api.ai_source_cards.is_configured", return_value=True), \
             patch("api.ai_source_cards.reserve_ai_usage", side_effect=AIUsageLimitError()), \
             patch("api.ai_source_cards.generate_ai_cards") as provider:
            with self.assertRaises(AIUsageLimitError):
                generate_source_cards(SOURCE, "notes.txt", "material", {}, "user_test")
        provider.assert_not_called()

    def test_ai_source_wrapper_reserves_monthly_cost_before_provider_call(self) -> None:
        with patch("api.ai_source_cards.is_configured", return_value=True), \
             patch("api.ai_source_cards.reserve_ai_usage") as reserve, \
             patch("api.ai_source_cards.generate_ai_cards", return_value={"cards": [card()]}) as provider:
            generate_source_cards(SOURCE, "notes.txt", "material", {"pageTexts": [SOURCE]}, "user_test")
        reserved_cost = reserve.call_args.args[2]
        self.assertGreater(reserved_cost, 0)
        self.assertLess(reserved_cost, 100_000)
        provider.assert_called_once()

    def test_ai_source_wrapper_rejects_a_generation_with_no_verified_cards(self) -> None:
        with patch("api.ai_source_cards.is_configured", return_value=True), \
             patch("api.ai_source_cards.reserve_ai_usage"), \
             patch("api.ai_source_cards.generate_ai_cards", return_value={"cards": []}):
            with self.assertRaises(NoStudyCardsError):
                generate_source_cards(SOURCE, "notes.txt", "material", {}, "user_test")

    def test_oversized_source_is_rejected_before_usage_reservation(self) -> None:
        with patch("api.ai_source_cards.is_configured", return_value=True), \
             patch("api.ai_source_cards.reserve_ai_usage") as reserve:
            with self.assertRaises(SourceTextLimitError):
                generate_source_cards("x" * 48_001, "notes.txt", "material", {}, "user_test")
        reserve.assert_not_called()


if __name__ == "__main__":
    unittest.main()
