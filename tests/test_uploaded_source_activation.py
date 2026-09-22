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

    def test_reload_rehydrates_cards_from_stored_sources(self):
        self.assertIn("function sourceCardsFromLibrary()", self.app)
        self.assertIn("const cards = sourceCardsFromLibrary();", self.app)
        self.assertIn("state.latestSessionId = `source-${latestSource.id}`;", self.app)
        self.assertIn("syncLectureCards(cards);", self.app)

    def test_quick_check_uses_uploaded_cards(self):
        self.assertIn("function sourceAssessmentQuestions()", self.app)
        self.assertIn("function activeAssessmentQuestions()", self.app)
        self.assertIn("const questions = activeAssessmentQuestions();", self.app)
        self.assertIn("Quick check from ${latestSource.name}", self.app)


if __name__ == "__main__":
    unittest.main()
