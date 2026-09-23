from __future__ import annotations

import io
import json
import sqlite3
import tempfile
import unittest
import zipfile
from pathlib import Path

from server import build_anki_package


class AnkiExportTests(unittest.TestCase):
    def inspect_collection(self, package: bytes) -> tuple[sqlite3.Connection, Path]:
        self.assertEqual(package[:2], b"PK")
        with zipfile.ZipFile(io.BytesIO(package)) as archive:
            self.assertIsNone(archive.testzip())
            collection = archive.read("collection.anki2")
        handle = tempfile.NamedTemporaryFile(suffix=".anki2", delete=False)
        handle.write(collection)
        handle.close()
        path = Path(handle.name)
        return sqlite3.connect(path), path

    def test_basic_package_contains_cards_source_and_deck_preferences(self) -> None:
        package, filename = build_anki_package(
            [
                {
                    "front": "What is the attachment of anterior auricularis?",
                    "back": "Galea aponeurosis to cartilage of auricle",
                    "source": "List of muscles Fall 2023.docx, Attachment",
                    "tags": "syllabloom anatomy attachment",
                },
                {
                    "front": "What action does tibialis anterior perform?",
                    "back": "Dorsiflexes and inverts the foot",
                    "source": "Lecture slides, Slide 18",
                    "tags": "syllabloom anatomy action",
                },
            ],
            {
                "deck": "Human Anatomy",
                "setName": "Beta export test",
                "format": "Basic",
                "presetName": "Syllabloom FSRS",
                "newPerDay": 20,
                "reviewsPerDay": 200,
                "desiredRetention": 0.9,
            },
        )
        self.assertEqual(filename, "human-anatomy-beta-export-test.apkg")
        connection, path = self.inspect_collection(package)
        try:
            self.assertEqual(connection.execute("SELECT count(*) FROM notes").fetchone()[0], 2)
            self.assertEqual(connection.execute("SELECT count(*) FROM cards").fetchone()[0], 2)
            models_json, decks_json, configs_json = connection.execute(
                "SELECT models, decks, dconf FROM col"
            ).fetchone()
            models = json.loads(models_json)
            decks = json.loads(decks_json)
            configs = json.loads(configs_json)
            model = next(item for item in models.values() if item["name"] == "Syllabloom Basic")
            deck = next(
                item for item in decks.values() if item["name"] == "Human Anatomy::Beta export test"
            )
            config = configs[str(deck["conf"])]
            self.assertIn("card-shell", model["tmpls"][0]["qfmt"])
            self.assertIn("{{Source}}", model["tmpls"][0]["afmt"])
            self.assertIn(".mobile .card-shell", model["css"])
            self.assertIn(".nightMode", model["css"])
            self.assertEqual(config["new"]["perDay"], 20)
            self.assertEqual(config["rev"]["perDay"], 200)
            self.assertAlmostEqual(config["desiredRetention"], 0.9)
        finally:
            connection.close()
            path.unlink(missing_ok=True)

    def test_cloze_package_creates_one_importable_card(self) -> None:
        package, _ = build_anki_package(
            [
                {
                    "front": "Tibialis anterior is supplied by the deep fibular nerve.",
                    "back": "deep fibular nerve",
                    "source": "Lecture notes, Week 4",
                    "tags": "syllabloom anatomy innervation",
                }
            ],
            {"deck": "Human Anatomy", "format": "Cloze"},
        )
        connection, path = self.inspect_collection(package)
        try:
            self.assertEqual(connection.execute("SELECT count(*) FROM cards").fetchone()[0], 1)
            fields = connection.execute("SELECT flds FROM notes").fetchone()[0].split("\x1f")
            self.assertIn("{{c1::deep fibular nerve}}", fields[0])
            self.assertEqual(fields[-1], "Lecture notes, Week 4")
        finally:
            connection.close()
            path.unlink(missing_ok=True)

    def test_nested_anki_tags_keep_their_hierarchy_for_string_and_list_inputs(self) -> None:
        package, _ = build_anki_package(
            [
                {
                    "front": "What is demand?",
                    "back": "The quantity buyers will purchase at a given price.",
                    "source": "Economics lecture, Slide 2",
                    "tags": "course::exam 1 economics::market-structures",
                },
                {
                    "front": "What is a negative externality?",
                    "back": "A cost imposed on third parties outside the transaction.",
                    "source": "Economics lecture, Slide 3",
                    "tags": ["course::exam-1", "economics::externalities"],
                },
            ],
            {"deck": "Economics", "setName": "Market structures", "format": "Basic"},
        )
        connection, path = self.inspect_collection(package)
        try:
            note_tags = [row[0] for row in connection.execute("SELECT tags FROM notes")]
            self.assertTrue(any("course::exam-1" in tags for tags in note_tags))
            self.assertTrue(any("economics::market-structures" in tags for tags in note_tags))
            self.assertTrue(any("economics::externalities" in tags for tags in note_tags))
            self.assertFalse(any("course-exam-1" in tags for tags in note_tags))
        finally:
            connection.close()
            path.unlink(missing_ok=True)


if __name__ == "__main__":
    unittest.main()
