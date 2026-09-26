from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]


class SourceProvenanceUiTests(unittest.TestCase):
    def test_study_quick_check_calendar_and_milestone_surfaces_show_source_evidence(self) -> None:
        page = (ROOT / "index.html").read_text(encoding="utf-8")
        app = (ROOT / "app.js").read_text(encoding="utf-8")

        self.assertIn('id="studySourceEvidence"', page)
        self.assertIn('id="studySourceQuote"', page)
        self.assertIn('id="courseMilestoneEvidence"', page)
        self.assertIn("item.sourceQuote", app)
        self.assertIn("item.sourceLocation", app)
        self.assertIn("event.sourcePage", app)
        self.assertIn("sourceEvidenceDetailsMarkup", app)
        self.assertIn("Check source", app)
        self.assertIn('data-calendar-event-id="${escapeHtml(event.id || \'\')}"', app)
        self.assertIn("renderCalendarEventEvidence(eventItem)", app)
        self.assertIn('id="calendarSelectedEvent"', page)

    def test_source_evidence_never_invents_page_for_formats_without_page_data(self) -> None:
        app = (ROOT / "app.js").read_text(encoding="utf-8")

        self.assertIn("No page or slide number is available for this source", app)
        self.assertIn("Number.isInteger(Number(event.sourcePage))", app)

    def test_confirmed_schedule_photo_dates_keep_only_their_matching_excerpt(self) -> None:
        page = (ROOT / "index.html").read_text(encoding="utf-8")
        app = (ROOT / "app.js").read_text(encoding="utf-8")
        privacy = (ROOT / "privacy.html").read_text(encoding="utf-8")

        self.assertIn("data-source-line=\"${escapeHtml(sourceExcerpt)}\"", app)
        self.assertIn("sourceText: row.dataset.sourceLine || ''", app)
        self.assertIn("sourceName: 'Imported schedule photo'", app)
        self.assertIn("slice(0, 500)", app)
        self.assertIn("full extracted text stay on this device and are discarded after review", page)
        self.assertIn("up to 500 characters from its matching OCR line are saved", privacy)


if __name__ == "__main__":
    unittest.main()
