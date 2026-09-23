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
        self.assertIn("const retainedCards = state.lectureCards.filter(card => card.sourceId !== payload.source.id);", self.app)
        self.assertIn("syncLectureCards(unique);", self.app)
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

    def test_empty_review_state_does_not_claim_cards_are_ready(self):
        self.assertIn("id=\"reviewPageTitle\"", (ROOT / "index.html").read_text(encoding="utf-8"))
        self.assertIn("document.querySelector('#reviewPageTitle').textContent = total || approved", self.app)
        self.assertIn("'Your cards will appear here.'", self.app)

    def test_quick_check_uses_uploaded_cards(self):
        self.assertIn("function sourceAssessmentQuestions()", self.app)
        self.assertIn("function activeAssessmentQuestions()", self.app)
        self.assertIn("const questions = activeAssessmentQuestions();", self.app)
        self.assertIn("Quick check from ${latestSource.name}", self.app)
        self.assertIn("card.reviewStatus !== 'skipped'", self.app)
        self.assertIn("sectionCards.length >= 3", self.app)
        self.assertIn("if (prompt.startsWith('when ')) return 'when';", self.app)
        self.assertIn("return 'definition';", self.app)
        self.assertIn("return 'relation';", self.app)
        self.assertIn("questionForm(candidate.front) === questionForm(card.front)", self.app)
        self.assertNotIn("distractors.push('I need to review this topic')", self.app)

    def test_custom_plan_uses_uploaded_concepts_instead_of_anatomy_fixture(self):
        self.assertIn("function sourceConceptNames()", self.app)
        self.assertIn("const customTopics = sourceConceptNames();", self.app)
        self.assertIn("const cardSupply = state.includeSampleMaterial ? 42 : state.lectureCards.length;", self.app)
        self.assertIn("function renderHomeForActiveClass()", self.app)


if __name__ == "__main__":
    unittest.main()
