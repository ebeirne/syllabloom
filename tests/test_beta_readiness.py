from __future__ import annotations

import unittest
from pathlib import Path

from api._common import clerk_auth_config


ROOT = Path(__file__).resolve().parents[1]


class BetaReadinessContractTests(unittest.TestCase):
    def test_hosted_copy_is_honest_about_transcription(self) -> None:
        page = (ROOT / "index.html").read_text(encoding="utf-8")
        self.assertIn("lecture transcription is not included yet", page)
        self.assertIn("Local audio/video library; no hosted transcription or cross-device media sync", page)
        self.assertNotIn("Syllabloom listens to the lecture", page)
        self.assertNotIn("60 live lecture minutes", page)
        self.assertNotIn("20 live lecture hours", page)

    def test_baseline_security_headers_are_configured(self) -> None:
        config = (ROOT / "deploy" / "nginx.conf").read_text(encoding="utf-8")
        for header in (
            'X-Content-Type-Options "nosniff"',
            'X-Frame-Options "DENY"',
            "microphone=(self)",
            "max-age=63072000",
        ):
            self.assertIn(header, config)

    def test_generated_source_surfaces_are_dynamic(self) -> None:
        page = (ROOT / "index.html").read_text(encoding="utf-8")
        self.assertIn('id="homeSourceButton"', page)
        self.assertIn('id="knowledgeRows"', page)
        self.assertIn('id="todayHeroCopy"', page)

    def test_auth_copy_matches_the_rendered_clerk_options(self) -> None:
        page = (ROOT / "index.html").read_text(encoding="utf-8")
        self.assertIn("Use your email and password, or continue with Google", page)
        self.assertNotIn("We use a one-time email code for beta access", page)

    def test_clerk_test_keys_are_blocked_on_production_without_leaking_the_key(self) -> None:
        test_key = "pk_test_example"
        blocked = clerk_auth_config(test_key, "production")
        preview = clerk_auth_config(test_key, "preview")
        beta = clerk_auth_config(test_key, "production", allow_test_key_in_production=True)
        live = clerk_auth_config("pk_live_example", "production")

        self.assertFalse(blocked["configured"])
        self.assertEqual(blocked["reason"], "test-key-in-production")
        self.assertEqual(blocked["publishableKey"], "")
        self.assertTrue(preview["configured"])
        self.assertEqual(preview["publishableKey"], test_key)
        self.assertTrue(beta["configured"])
        self.assertEqual(beta["publishableKey"], test_key)
        self.assertEqual(beta["mode"], "test")
        self.assertTrue(live["configured"])
        self.assertEqual(live["mode"], "live")

    def test_auth_config_failure_shows_recovery_instead_of_a_stuck_sign_in_button(self) -> None:
        auth = (ROOT / "auth.js").read_text(encoding="utf-8")

        self.assertIn("if (!response.ok)", auth)
        self.assertIn("markAuthUnavailable('config-error')", auth)
        self.assertIn("test-key-in-production", auth)

    def test_sign_in_opened_during_clerk_load_mounts_when_clerk_becomes_ready(self) -> None:
        auth = (ROOT / "auth.js").read_text(encoding="utf-8")
        dialog_open = auth.index("if (opening) dialog.showModal();")
        open_mount_attempt = auth.index("mountSignInIfReady();", dialog_open)
        clerk_ready = auth.index("await clerk.load(", auth.index("async function configureClerk()"))
        ready_mount_attempt = auth.index("if (dialog.open && !clerk.isSignedIn) mountSignInIfReady();", clerk_ready)

        self.assertIn("function mountSignInIfReady()", auth)
        self.assertIn("let clerkLoaded = false;", auth)
        self.assertIn("if (!clerk || !clerkLoaded) return false;", auth)
        self.assertIn("if (signInMounted && mount.childElementCount > 0) return false;", auth)
        self.assertLess(auth.index("await clerk.load("), auth.index("clerkLoaded = true;"))
        self.assertLess(dialog_open, open_mount_attempt)
        self.assertLess(clerk_ready, ready_mount_attempt)

    def test_sign_in_component_resets_when_switching_accounts(self) -> None:
        auth = (ROOT / "auth.js").read_text(encoding="utf-8")

        self.assertIn("let lastSignedInState = null;", auth)
        self.assertIn("lastSignedInState !== null && lastSignedInState !== signedIn && signInMounted", auth)
        self.assertIn("clerk?.unmountSignIn?.(mount);", auth)
        self.assertIn("resetSignInMount();\n    await clerk.signOut({", auth)
        self.assertIn("signInMounted = false;", auth)

    def test_profile_can_sign_out_only_the_current_clerk_session(self) -> None:
        page = (ROOT / "index.html").read_text(encoding="utf-8")
        auth = (ROOT / "auth.js").read_text(encoding="utf-8")
        app = (ROOT / "app.js").read_text(encoding="utf-8")

        self.assertIn('id="signOutAccount"', page)
        self.assertIn("Signs out on this device only.", page)
        self.assertIn("recordings remain on this device.", page)
        self.assertIn("async function signOutCurrentSession()", auth)
        self.assertIn("const sessionId = clerk?.session?.id;", auth)
        self.assertIn("await clerk.signOut({ sessionId });", auth)
        self.assertIn("landingUrl.hash = '#landing';", auth)
        self.assertIn("window.history.replaceState(null, '', landingUrl);", auth)
        self.assertIn("window.location.reload();", auth)
        self.assertNotIn("redirectUrl:", auth)
        sign_out = auth.split("async function signOutCurrentSession()", 1)[1].split("function updateAuthState()", 1)[0]
        self.assertLess(sign_out.index("await clerk.signOut({ sessionId });"), sign_out.index("window.location.reload();"))
        self.assertIn("await window.SyllabloomAuth?.signOutCurrentSession?.();", app)
        self.assertIn("document.querySelector('#signOutAccount').hidden = !state.account.signedIn;", app)

    def test_public_beta_is_free_one_class_and_has_no_checkout_path(self) -> None:
        page = (ROOT / "index.html").read_text(encoding="utf-8")
        auth = (ROOT / "auth.js").read_text(encoding="utf-8")
        app = (ROOT / "app.js").read_text(encoding="utf-8")
        styles = (ROOT / "redesign.css").read_text(encoding="utf-8")

        self.assertIn("Free student beta", page)
        self.assertIn("There is no subscription or checkout in this beta.", page)
        self.assertIn("const betaClassLimit = 1;", app)
        self.assertIn("if (accountClassUsage() >= betaClassLimit)", app)
        self.assertIn("state.account.plan = 'free';", app)
        class_setup = app.split("function startClassSetup()", 1)[1].split("function classIsReadyForCurrentUser()", 1)[0]
        self.assertLess(class_setup.index("if (accountClassUsage() >= betaClassLimit)"), class_setup.index("if (!state.account.signedIn)"))
        self.assertNotIn("Student", page)
        self.assertNotIn("$9", page)
        self.assertNotIn("mountBilling", app + auth)
        self.assertNotIn('id="billingCheckoutDialog"', page)
        self.assertNotIn(".billing-page .cl-pricingTableCard", styles)

    def test_free_beta_offer_and_course_to_anki_value_are_clear_at_first_glance(self) -> None:
        page = (ROOT / "index.html").read_text(encoding="utf-8")
        hero = page.split('<section class="marketing-hero">', 1)[1].split("</section>", 1)[0]

        self.assertIn("Free student beta", hero)
        self.assertIn("one class", hero)
        self.assertIn("$0", hero)
        self.assertIn("No payment details", hero)
        self.assertIn("Turn your course files into editable study cards.", hero)
        self.assertIn("creates source-linked cards you can check, edit, study here, or export to Anki", hero)
        self.assertIn("Start my free class", hero)
        self.assertNotIn("Cards arrive ready to use", hero)

    def test_media_copy_distinguishes_device_storage_from_account_sync(self) -> None:
        page = (ROOT / "index.html").read_text(encoding="utf-8")
        app = (ROOT / "app.js").read_text(encoding="utf-8")

        self.assertIn("Audio and video stay on this device", page)
        self.assertIn("They do not sync across devices", page)
        self.assertIn("function mediaStorageMessage()", app)
        self.assertIn("Sign in to separate your library by account.", app)
        self.assertIn("Saved for this account on this device only. Recordings do not sync across devices.", app)
        self.assertNotIn("Saved under your account on this device", app)

    def test_hosted_source_upload_attaches_auth_and_server_rejects_anonymous_imports(self) -> None:
        app = (ROOT / "app.js").read_text(encoding="utf-8")
        source_api = (ROOT / "api/source.py").read_text(encoding="utf-8")
        auth_api = (ROOT / "api/user_data.py").read_text(encoding="utf-8")

        self.assertIn("headers: token ? { Authorization: `Bearer ${token}` } : {}", app)
        self.assertIn("require_authenticated_beta_request(self, \"adding course materials\")", source_api)
        self.assertIn("if not _runtime_auth_configured():", auth_api)
        self.assertIn("Beta sign-in is unavailable until production authentication is configured.", auth_api)

    def test_sample_syllabus_does_not_claim_a_deadline_missing_from_its_source(self) -> None:
        page = (ROOT / "index.html").read_text(encoding="utf-8")

        self.assertIn("0</strong><span>calendar dates in the sample syllabus", page)
        self.assertIn("192</strong><span>muscles in the sample document", page)
        self.assertNotIn("Until the demo assessment", page)

    def test_learning_map_and_anki_copy_do_not_invent_performance_or_review_history(self) -> None:
        page = (ROOT / "index.html").read_text(encoding="utf-8")
        app = (ROOT / "app.js").read_text(encoding="utf-8")
        course_map = (ROOT / "course-map.js").read_text(encoding="utf-8")

        self.assertIn('baselineAssessed: savedCourseState.baselineAssessed === true', app)
        self.assertIn("state.reviewCount = state.reviewHistory.length;", app)
        self.assertIn("function recordQuickCheckResponse", app)
        self.assertIn("activity: 'quick-check'", app)
        self.assertIn("activity: 'study'", app)
        self.assertIn("window.SyllabloomCourseMap?.buildCourseMap", app)
        self.assertIn("concept.sourceReferences", app)
        self.assertIn("recommendNext(courseMap)", app)
        self.assertIn("mapObjectiveCues", app)
        self.assertIn("state.studyFocusConcept", app)
        self.assertIn('id="courseFocusAction"', page)
        self.assertIn('id="courseObjectivePanel"', page)
        self.assertIn("coveragePercent", course_map)
        self.assertIn('id="reviewCount">0</b>', page)
        self.assertNotIn("baselineScore: 62", app)
        self.assertNotIn("146 + state.reviewHistory.length", app)
        self.assertNotIn('id="reviewCount">146</b>', page)
        self.assertNotIn("objectives below target", page)
        self.assertNotIn("Due in Anki", app)
        self.assertIn("Anki schedules due reviews after export.", app)
        self.assertIn("until study results identify weak topics", app)
        self.assertIn("not assessed yet", page)

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

    def test_anki_export_destination_defaults_to_the_class_and_keeps_subdecks(self) -> None:
        page = (ROOT / "index.html").read_text(encoding="utf-8")
        app = (ROOT / "app.js").read_text(encoding="utf-8")

        self.assertIn('placeholder="Uses your class name"', page)
        self.assertNotIn('id="ankiDeckName" class="text-input" value="Human Anatomy"', page)
        self.assertIn("deck: '',", app)
        self.assertIn("state.anki.deck.trim() || state.className.trim() || 'Syllabloom'", app)
        self.assertIn("return setName ? `${deck}::${setName}` : deck;", app)
        self.assertIn("if (exportHeading) exportHeading.textContent = `Export ${fullDeck} cards to Anki`;", app)

    def test_source_type_picker_uses_themed_accessible_menu(self) -> None:
        page = (ROOT / "index.html").read_text(encoding="utf-8")
        app = (ROOT / "app.js").read_text(encoding="utf-8")
        styles = (ROOT / "redesign.css").read_text(encoding="utf-8")

        self.assertIn('id="sourceKindTrigger"', page)
        self.assertIn('id="sourceKindMenu"', page)
        self.assertIn('role="listbox"', page)
        self.assertIn('role="option"', page)
        self.assertIn("function initializeSourceKindPicker", app)
        self.assertIn("menu.showPopover()", app)
        self.assertIn("sourceKindValue", app)
        self.assertIn(".source-kind-menu", styles)
        self.assertIn('.source-kind-option[aria-selected="true"]', styles)
        self.assertIn('<option value="auto" selected>Auto-detect</option>', page)
        self.assertIn("Choose a type to override detection", page)

    def test_materials_accepts_mixed_document_batches_with_per_file_types(self) -> None:
        page = (ROOT / "index.html").read_text(encoding="utf-8")
        app = (ROOT / "app.js").read_text(encoding="utf-8")
        batch = (ROOT / "source-batch.js").read_text(encoding="utf-8")
        styles = (ROOT / "redesign.css").read_text(encoding="utf-8")

        self.assertIn('id="sourceUpload" type="file" accept=".docx,.pptx,.pdf,.txt" multiple', page)
        self.assertIn('id="sourceQueue"', page)
        self.assertIn('id="sourceQueueList"', page)
        self.assertIn('id="sourceQueueProgress" role="status" aria-live="polite"', page)
        self.assertIn("window.SyllabloomSourceBatch.createQueueItems", app)
        self.assertIn("window.SyllabloomSourceBatch.processQueue", app)
        self.assertIn("data-source-queue-kind", app)
        self.assertIn("One unreadable file will not stop the others.", app)
        self.assertIn("const allowedKinds = new Set(['auto', 'material', 'syllabus', 'assessment'])", batch)
        self.assertIn("source-batch-queue", styles)
        self.assertIn("@media (max-width: 760px)", styles)

    def test_active_navigation_pill_matches_its_icon_color(self) -> None:
        styles = (ROOT / "memphis.css").read_text(encoding="utf-8")

        self.assertIn("--nav-accent: var(--sky)", styles)
        self.assertIn("--nav-accent: var(--pink)", styles)
        self.assertIn("--nav-accent: var(--sun)", styles)
        self.assertIn("--nav-accent: var(--grass)", styles)
        self.assertIn("background: var(--nav-accent) !important", styles)

    def test_primary_navigation_uses_one_themed_svg_icon_family(self) -> None:
        page = (ROOT / "index.html").read_text(encoding="utf-8")
        styles = (ROOT / "redesign.css").read_text(encoding="utf-8")

        self.assertEqual(page.count('class="nav-icon"'), 12)
        self.assertGreaterEqual(page.count('aria-hidden="true"><svg viewBox="0 0 24 24"'), 12)
        self.assertIn(".nav-button .nav-icon svg", styles)
        self.assertIn('.nav-button[data-view="capture"] .nav-icon', styles)
        self.assertIn('.nav-button[data-view="cards"] .nav-icon', styles)
        self.assertIn('.nav-button[data-view="study"] .nav-icon', styles)
        self.assertIn("content: none !important", styles)

    def test_marketing_copy_contrast_and_calendar_preview(self) -> None:
        page = (ROOT / "index.html").read_text(encoding="utf-8")
        theme = (ROOT / "memphis.css").read_text(encoding="utf-8")

        self.assertIn('class="feature-illustration feature-syllabus" aria-hidden="true"', page)
        self.assertIn('class="feature-illustration feature-syllabus" aria-hidden="true"', page)
        self.assertIn('class="calendar-preview"', page)
        self.assertIn("Source-matched cards", page)
        self.assertNotIn("Verified cards", page)
        self.assertIn("Source linked</span><b>Ready to review", page)
        self.assertNotIn("62%", page)
        self.assertIn('id="baselineScoreLabel">not assessed yet</span>', page)
        self.assertIn("recording-based cards are not included in this beta", page)
        self.assertIn("September 2026", page)
        self.assertIn("SAMPLE · SYLLABUS-DERIVED DATES", page)
        self.assertIn("UP NEXT", page)
        self.assertIn("Exam 1", page)
        self.assertIn(".calendar-preview-week {", theme)
        self.assertIn(".calendar-preview-agenda {", theme)
        self.assertIn("color: #353833 !important;", theme)
        self.assertIn(".calendar-preview-day.has-exam", theme)

    def test_beta_legal_pages_disclose_current_data_flows_and_contact(self) -> None:
        privacy = (ROOT / "privacy.html").read_text(encoding="utf-8")
        terms = (ROOT / "terms.html").read_text(encoding="utf-8")
        app = (ROOT / "index.html").read_text(encoding="utf-8")

        self.assertIn("individual project owner", privacy)
        self.assertIn("Neon Postgres", privacy)
        self.assertIn("browser storage on the device", privacy)
        self.assertIn("Hosted transcription is currently disabled", privacy)
        self.assertIn("ethan.g.beirne@gmail.com", privacy)
        self.assertIn("live payment checkout is not enabled", terms)
        self.assertIn("governing-law location", terms)
        self.assertIn("ethan.g.beirne@gmail.com", terms)
        self.assertIn('href="/privacy.html"', app)
        self.assertIn('href="/terms.html"', app)
        self.assertIn('class="legal-consent-note"', app)

    def test_calendar_select_and_observed_statuses_use_theme_styles(self) -> None:
        app = (ROOT / "app.js").read_text(encoding="utf-8")
        styles = (ROOT / "redesign.css").read_text(encoding="utf-8")

        self.assertIn('knowledge-status--${escapeHtml(concept.statusKind)}', app)
        self.assertIn(".source-kind-trigger:focus-visible", styles)
        self.assertIn("box-shadow: 0 0 0 7px var(--memphis-aqua", styles)
        self.assertIn(".source-kind-trigger-arrow {\n  background-color: transparent;", styles)
        self.assertIn(".knowledge-row > .knowledge-status--review", styles)
        self.assertIn(".knowledge-row > .knowledge-status--recent", styles)
        self.assertIn("white-space: nowrap !important;", styles)
        self.assertIn("grid-template-columns: minmax(220px, 1.2fr) minmax(180px, 1fr) 64px max-content !important;", styles)

    def test_schedule_photo_import_is_local_reviewed_and_holiday_references_are_explicit(self) -> None:
        page = (ROOT / "index.html").read_text(encoding="utf-8")
        app = (ROOT / "app.js").read_text(encoding="utf-8")
        features = (ROOT / "calendar-features.js").read_text(encoding="utf-8")
        privacy = (ROOT / "privacy.html").read_text(encoding="utf-8")

        self.assertIn('id="showFederalHolidays"', page)
        self.assertIn("Reference dates only; your school may follow a different calendar.", page)
        self.assertIn('capture="environment"', page)
        self.assertIn('accept="image/jpeg,image/png,image/webp"', page)
        self.assertIn('id="calendarScheduleImportDialog"', page)
        self.assertIn("nothing is added until you confirm", page)
        self.assertIn("tesseract.js@7.0.0", app)
        self.assertIn("parseDatedSchedule", app)
        self.assertIn("federalReference", features)
        self.assertIn("photo and full extracted text stay on this device and are discarded after review", page)
        self.assertIn("each date’s matching text excerpt are saved to your calendar", page)
        self.assertIn("Tesseract.js OCR library", privacy)
        self.assertIn("English-language model on demand from jsDelivr", privacy)

    def test_card_deletion_is_confirmed_and_updates_the_anki_ready_set(self) -> None:
        page = (ROOT / "index.html").read_text(encoding="utf-8")
        app = (ROOT / "app.js").read_text(encoding="utf-8")
        styles = (ROOT / "redesign.css").read_text(encoding="utf-8")

        self.assertIn('id="removeCardDialog"', page)
        self.assertIn('id="confirmRemoveCard"', page)
        self.assertIn('data-lecture-action="delete"', app)
        self.assertIn("Card removed from your set and Anki queue", app)
        self.assertIn("removeCardFromSet(state.lectureCards, state.sources, card)", app)
        self.assertIn("approved = collectApprovedCards().length", app)
        self.assertIn("card-set.js", page)
        self.assertIn(".remove-card-preview", styles)


if __name__ == "__main__":
    unittest.main()
