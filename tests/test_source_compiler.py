from __future__ import annotations

import tempfile
import unittest
import zipfile
from pathlib import Path

from docx import Document
from pypdf import PdfWriter
from pypdf.generic import DecodedStreamObject, DictionaryObject, NameObject

from server import compile_lecture_window, compile_study_material, source_summary


class SourceCompilerTests(unittest.TestCase):
    def test_pdf_import_creates_notes_and_cards(self) -> None:
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as handle:
            path = Path(handle.name)
        try:
            writer = PdfWriter()
            page = writer.add_blank_page(width=612, height=792)
            font = DictionaryObject({
                NameObject("/Type"): NameObject("/Font"),
                NameObject("/Subtype"): NameObject("/Type1"),
                NameObject("/BaseFont"): NameObject("/Helvetica"),
            })
            page[NameObject("/Resources")] = DictionaryObject({
                NameObject("/Font"): DictionaryObject({NameObject("/F1"): writer._add_object(font)}),
            })
            content = DecodedStreamObject()
            content.set_data(
                b"BT /F1 12 Tf 72 720 Td (Photosynthesis) Tj "
                b"0 -18 Td (Photosynthesis is the process plants use to convert light into chemical energy.) Tj "
                b"0 -18 Td (The light reactions occur in the thylakoid membrane.) Tj "
                b"0 -18 Td (The Calvin cycle is the pathway that fixes carbon dioxide into sugars.) Tj ET"
            )
            page[NameObject("/Contents")] = writer._add_object(content)
            with path.open("wb") as stream:
                writer.write(stream)

            summary = source_summary(path, "photosynthesis-reading.pdf", "material")
            self.assertGreaterEqual(len(summary["notes"]), 1)
            self.assertGreaterEqual(len(summary["draftCards"]), 2)
            self.assertTrue(any("photosynthesis" in card["front"].lower() for card in summary["draftCards"]))
        finally:
            path.unlink(missing_ok=True)

    def test_plain_text_import_creates_notes_and_cards(self) -> None:
        with tempfile.NamedTemporaryFile(suffix=".txt", delete=False, mode="w", encoding="utf-8") as handle:
            path = Path(handle.name)
            handle.write(
                "Operant conditioning\n"
                "Operant conditioning is learning in which consequences change behavior.\n"
                "Positive reinforcement is the addition of a desirable stimulus after a behavior.\n"
                "Negative reinforcement is the removal of an aversive stimulus after a behavior.\n"
            )
        try:
            summary = source_summary(path, "learning-theory.txt", "material")
            self.assertGreaterEqual(len(summary["notes"]), 1)
            self.assertGreaterEqual(len(summary["draftCards"]), 2)
            self.assertTrue(any("operant conditioning" in card["front"].lower() for card in summary["draftCards"]))
        finally:
            path.unlink(missing_ok=True)

    def test_word_import_creates_source_traced_cards(self) -> None:
        with tempfile.NamedTemporaryFile(suffix=".docx", delete=False) as handle:
            path = Path(handle.name)
        try:
            document = Document()
            document.add_heading("Supply and demand", level=1)
            document.add_paragraph("Demand is the quantity consumers are willing and able to buy at a given price.")
            document.add_paragraph("A price ceiling is a legal maximum price for a good or service.")
            document.add_paragraph("A binding price ceiling set below equilibrium creates a shortage.")
            document.save(path)

            summary = source_summary(path, "microeconomics-notes.docx", "material")
            self.assertGreaterEqual(len(summary["notes"]), 1)
            self.assertGreaterEqual(len(summary["draftCards"]), 2)
            self.assertTrue(all("microeconomics-notes.docx" in card["source"] for card in summary["draftCards"]))
        finally:
            path.unlink(missing_ok=True)
    def test_general_slides_create_concepts_notes_and_real_questions(self) -> None:
        text = """Slide 1
Cellular respiration
Cellular respiration is the process cells use to convert glucose into usable ATP.
Glycolysis occurs in the cytosol.
The citric acid cycle produces electron carriers for oxidative phosphorylation.
Slide 2
Action potentials
An action potential is a rapid change in membrane voltage.
Depolarization occurs when sodium enters the neuron.
Repolarization results from potassium leaving the neuron.
"""

        compiled = compile_study_material(text, "week-3-physiology.pptx")

        self.assertEqual(len(compiled["concepts"]), 2)
        self.assertEqual(len(compiled["notes"]), 2)
        self.assertGreaterEqual(len(compiled["cards"]), 4)
        fronts = {card["front"].lower() for card in compiled["cards"]}
        self.assertIn("what is cellular respiration?", fronts)
        self.assertIn("where does glycolysis occur?", fronts)
        self.assertIn("what is an action potential?", fronts)
        self.assertTrue(all("Slide" in card["source"] for card in compiled["cards"]))
        self.assertTrue(all(card["status"] == "verified" for card in compiled["cards"]))

    def test_end_to_end_powerpoint_import_uses_normal_slide_text(self) -> None:
        presentation = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldIdLst><p:sldId id="256" r:id="rId1"/><p:sldId id="257" r:id="rId2"/></p:sldIdLst></p:presentation>"""
        relationships = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide2.xml"/></Relationships>"""

        def slide_xml(*lines: str) -> str:
            paragraphs = "".join(f"<a:p><a:r><a:t>{line}</a:t></a:r></a:p>" for line in lines)
            return f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:sp><p:txBody><a:bodyPr/><a:lstStyle/>{paragraphs}</p:txBody></p:sp></p:spTree></p:cSld></p:sld>"""

        with tempfile.NamedTemporaryFile(suffix=".pptx", delete=False) as handle:
            path = Path(handle.name)
        try:
            with zipfile.ZipFile(path, "w") as package:
                package.writestr("ppt/presentation.xml", presentation)
                package.writestr("ppt/_rels/presentation.xml.rels", relationships)
                package.writestr(
                    "ppt/slides/slide1.xml",
                    slide_xml(
                        "Renal filtration",
                        "Glomerular filtration is the movement of fluid from glomerular capillaries into Bowman's space.",
                        "Filtration rate depends on hydrostatic and oncotic pressures.",
                    ),
                )
                package.writestr(
                    "ppt/slides/slide2.xml",
                    slide_xml(
                        "Tubular reabsorption",
                        "Tubular reabsorption returns filtered substances to the blood.",
                        "Most sodium reabsorption occurs in the proximal tubule.",
                    ),
                )

            summary = source_summary(path, "renal-physiology.pptx", "material")
            self.assertEqual(summary["unitCount"], 2)
            self.assertEqual(len(summary["notes"]), 2)
            self.assertEqual(len(summary["concepts"]), 2)
            self.assertGreaterEqual(len(summary["draftCards"]), 2)
            self.assertTrue(any("glomerular filtration" in card["front"].lower() for card in summary["draftCards"]))
        finally:
            path.unlink(missing_ok=True)

    def test_lecture_window_creates_timestamped_notes_and_questions(self) -> None:
        compiled = compile_lecture_window(
            "An action potential is a rapid change in membrane voltage. Depolarization occurs when sodium enters the neuron. Potassium leaving the cell causes repolarization.",
            "Neurophysiology lecture.webm",
            125.4,
            2,
        )

        self.assertEqual(len(compiled["notes"]), 1)
        self.assertGreaterEqual(len(compiled["cards"]), 1)
        self.assertEqual(compiled["notes"][0]["heardAt"], 125.4)
        self.assertIn("02:05", compiled["cards"][0]["source"])
        self.assertEqual(compiled["cards"][0]["status"], "provisional")

    def test_lecture_compiler_rejects_promotional_and_broken_subjects(self) -> None:
        compiled = compile_lecture_window(
            "And is part of a group of extensor muscles. This muscle runs from the lateral tibia toward the ankle.",
            "lecture.webm",
            30,
            1,
        )
        self.assertFalse(any(card["front"].lower().startswith("what is and") for card in compiled["cards"]))

        promotional = compile_lecture_window(
            "This video is more fun than reading a textbook. Visit our site for more videos and interactive quizzes.",
            "lecture.webm",
            90,
            2,
        )
        self.assertEqual(promotional["cards"], [])
        self.assertEqual(promotional["notes"], [])


if __name__ == "__main__":
    unittest.main()
