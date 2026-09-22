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

    def test_auth_copy_matches_the_rendered_clerk_options(self) -> None:
        page = (ROOT / "index.html").read_text(encoding="utf-8")
        self.assertIn("Use your email and password, or continue with Google", page)
        self.assertNotIn("We use a one-time email code for beta access", page)

    def test_test_mode_billing_cannot_look_like_a_live_checkout(self) -> None:
        page = (ROOT / "index.html").read_text(encoding="utf-8")
        auth = (ROOT / "auth.js").read_text(encoding="utf-8")
        app = (ROOT / "app.js").read_text(encoding="utf-8")
        styles = (ROOT / "redesign.css").read_text(encoding="utf-8")

        self.assertIn("The public beta is free. Live payments are not enabled on this build.", page)
        self.assertIn("if (!liveBilling) return { ready: false, reason: 'billing-preview' };", auth)
        self.assertIn("liveBilling = publishableKey.startsWith('pk_live_');", auth)
        self.assertIn("fallback.hidden = false;", app)
        self.assertNotIn("fallback.hidden = true;", app)
        self.assertIn('id="billingCheckoutDialog"', page)
        self.assertNotIn(".billing-page .cl-pricingTableCard", styles)

    def test_tablet_account_navigation_and_mobile_lecture_actions_stay_reachable(self) -> None:
        styles = (ROOT / "redesign.css").read_text(encoding="utf-8")
        theme = (ROOT / "memphis.css").read_text(encoding="utf-8")

        self.assertIn("grid-template-columns: auto minmax(150px, 200px) 1fr auto !important;", styles)
        self.assertIn(".account-nav-action {", styles)
        self.assertIn(".lecture-result-actions {", theme)
        self.assertIn("flex-direction: column;", theme)
        self.assertIn(".lecture-result-actions .button {", theme)

    def test_mobile_review_honors_hidden_content_and_study_reveal_state(self) -> None:
        app = (ROOT / "app.js").read_text(encoding="utf-8")
        styles = (ROOT / "redesign.css").read_text(encoding="utf-8")

        self.assertIn("#cards #classCardWorkspace[hidden]", styles)
        self.assertIn("#showAnswer[hidden]", styles)
        self.assertIn(".rating-controls.open", styles)
        self.assertIn("document.querySelector('#showAnswer').hidden = true;", app)
        self.assertIn("document.querySelector('#showAnswer').hidden = false;", app)

    def test_browser_storage_copy_does_not_claim_cloud_persistence(self) -> None:
        app = (ROOT / "app.js").read_text(encoding="utf-8")

        self.assertIn("cards saved in this browser; original file not stored", app)
        self.assertNotIn("available this session", app)

    def test_study_difficulty_is_prominent_and_persisted(self) -> None:
        page = (ROOT / "index.html").read_text(encoding="utf-8")
        app = (ROOT / "app.js").read_text(encoding="utf-8")
        styles = (ROOT / "redesign.css").read_text(encoding="utf-8")

        self.assertIn("How difficult was that recall?", page)
        self.assertIn('id="studyRatingReceipt"', page)
        self.assertIn('aria-live="polite"', page)
        self.assertIn("syllabloom-review-history", app)
        self.assertIn("function recordStudyRating", app)
        self.assertIn("showRatingReceipt(rating, persisted);", app)
        self.assertIn("#study .rating-options", styles)
        self.assertIn(".study-rating-receipt", styles)


if __name__ == "__main__":
    unittest.main()
