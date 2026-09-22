from __future__ import annotations

import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class BetaReadinessContractTests(unittest.TestCase):
    def test_hosted_copy_is_honest_about_transcription(self) -> None:
        page = (ROOT / "index.html").read_text(encoding="utf-8")
        self.assertIn("Hosted lecture transcription is not included in this beta yet", page)
        self.assertNotIn("Syllabloom listens to the lecture", page)
        self.assertNotIn("60 live lecture minutes", page)
        self.assertNotIn("20 live lecture hours", page)

    def test_baseline_security_headers_are_configured(self) -> None:
        config = json.loads((ROOT / "vercel.json").read_text(encoding="utf-8"))
        catch_all = next(item for item in config["headers"] if item["source"] == "/(.*)")
        headers = {item["key"]: item["value"] for item in catch_all["headers"]}
        self.assertEqual(headers["X-Content-Type-Options"], "nosniff")
        self.assertEqual(headers["X-Frame-Options"], "DENY")
        self.assertIn("microphone=(self)", headers["Permissions-Policy"])
        self.assertIn("max-age=63072000", headers["Strict-Transport-Security"])

    def test_generated_source_surfaces_are_dynamic(self) -> None:
        page = (ROOT / "index.html").read_text(encoding="utf-8")
        self.assertIn('id="homeSourceButton"', page)
        self.assertIn('id="knowledgeRows"', page)
        self.assertIn('id="todayHeroCopy"', page)


if __name__ == "__main__":
    unittest.main()
