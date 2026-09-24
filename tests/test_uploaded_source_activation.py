from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]


class UploadedSourceActivationContractTests(unittest.TestCase):
    def setUp(self):
        self.app = (ROOT / "app.js").read_text(encoding="utf-8")

    def test_upload_replaces_demo_and_activates_generated_cards(self):
        self.assertIn("state.includeSampleMaterial = false;", self.app)
        self.assertIn("state.classMode = 'custom';", self.app)
        self.assertIn("persistClassProfile();", self.app)
        self.assertIn("const sourceCards = sourceCardsFromLibrary();", self.app)
        self.assertIn("syncLectureCards([...retainedLectureCards, ...sourceCards]);", self.app)
        self.assertIn("const wasSampleClass = state.classMode === 'sample';", self.app)
        self.assertIn("setClassLabels(inferredClassName, 'Term not set');", self.app)
        self.assertIn("state.calendarEvents = [];", self.app)

    def test_reload_rehydrates_cards_from_stored_sources(self):
        self.assertIn("function sourceCardsFromLibrary()", self.app)
        self.assertIn("const cards = sourceCardsFromLibrary();", self.app)
        self.assertIn("state.latestSessionId = `source-${latestSource.id}`;", self.app)
        self.assertIn("syncLectureCards(cards);", self.app)

    def test_opening_sample_class_clears_stale_source_cards_from_the_visible_queue(self):
        sample_loader = self.app.split("function loadSampleClass()", 1)[1].split("function showClassLimit()", 1)[0]
        self.assertIn("state.latestSessionId = null;", sample_loader)
        self.assertIn("syncLectureCards([]);", sample_loader)
        self.assertIn("syncStateToOnboardingAnki();", sample_loader)

    def test_anki_defaults_and_imported_class_setup_do_not_leak_sample_tags(self):
        defaults = self.app.split("const defaultAnkiPreferences = {", 1)[1].split("};", 1)[0]
        self.assertIn("tags: '',", defaults)
        upload = self.app.split("async function uploadSource(file, kind = 'auto', options = {})", 1)[1].split("function", 1)[0]
        self.assertIn("state.anki.tags = classTag(inferredClassName);", upload)
        self.assertIn("syncStateToOnboardingAnki();", upload)

    def test_empty_review_state_does_not_claim_cards_are_ready(self):
        self.assertIn("id=\"reviewPageTitle\"", (ROOT / "index.html").read_text(encoding="utf-8"))
        self.assertIn("document.querySelector('#reviewPageTitle').textContent = total || approved", self.app)
        self.assertIn("'Your cards will appear here.'", self.app)

    def test_quick_check_uses_uploaded_cards(self):
        self.assertIn("function sourceAssessmentQuestions()", self.app)
        self.assertIn("function activeAssessmentQuestions()", self.app)
        self.assertIn("const questions = activeAssessmentQuestions();", self.app)
        self.assertIn("Quick check across your class", self.app)
        self.assertIn("source-backed recall prompt", self.app)
        self.assertNotIn("Quick check from ${latestSource.name}", self.app)
        self.assertIn("if (!state.includeSampleMaterial && questions.length)", self.app)
        self.assertIn("return window.SyllabloomSourceStudy.quickCheckItems(state.lectureCards);", self.app)
        self.assertIn("Reveal answer", self.app)
        self.assertIn("Need to review", self.app)
        self.assertNotIn("const distractors =", self.app)
        self.assertNotIn("distractors.push('I need to review this topic')", self.app)

    def test_custom_plan_uses_uploaded_concepts_instead_of_anatomy_fixture(self):
        self.assertIn("function sourceConceptNames()", self.app)
        self.assertIn("const customTopics = sourceConceptNames();", self.app)
        self.assertIn("const cardSupply = state.includeSampleMaterial ? 42 : state.lectureCards.length;", self.app)
        self.assertIn("function renderHomeForActiveClass()", self.app)


if __name__ == "__main__":
    unittest.main()
