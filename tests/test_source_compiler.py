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

    def test_psychology_slides_keep_only_direct_source_supported_cards(self) -> None:
        text = """Slide 1
Memory, Attention, and Decision Making
PSY 241 Unit lecture and cumulative review
How people hold information, lose it, find it again, and use it to choose
PSY 241
Slide 2
Questions for this unit
Which memory system is required by a task?
Identify one condition where automatic processing helps.
PSY 241
Slide 3
Memory systems differ by function and duration
Sensory memory briefly preserves modality-specific detail after stimulation ends.
Working memory maintains and manipulates a limited amount of information for an active goal.
Episodic memory represents personally experienced events with contextual detail.
PSY 241
Slide 4
Task switching creates measurable costs
A switch cost is the increase in response time or error when the required task changes from the previous trial.
Multitasking often means rapid switching.
PSY 241
Slide 5
Experimental design challenge
Question: Does retrieval practice improve delayed explanation more than restudy?
Independent variable: retrieval practice with feedback versus matched-time restudy.
Dependent variable: accuracy on a delayed explanation test one week later.
PSY 241
Slide 6
Key terms for review
Encoding specificity: cue effectiveness depends on overlap with encoding.
Consolidation: stabilization and reorganization after learning.
PSY 241
"""

        compiled = compile_study_material(text, "PSY241_Memory_Attention_Decision_Making.pptx")
        fronts = {card["front"] for card in compiled["cards"]}
        backs = [card["back"] for card in compiled["cards"]]
        concept_names = {concept["name"] for concept in compiled["concepts"]}

        self.assertIn("What does sensory memory briefly preserve?", fronts)
        self.assertIn("What is a switch cost?", fronts)
        self.assertIn("What does multitasking often mean?", fronts)
        self.assertIn("What outcome does the experiment test?", fronts)
        self.assertIn("What is the independent variable in the experiment?", fronts)
        self.assertIn("What is encoding specificity?", fronts)
        self.assertNotIn("Questions for this unit", concept_names)
        self.assertFalse(any(front.startswith("What are the key ideas") for front in fronts))
        self.assertFalse(any(front in {"What is question?", "What is independent variable?"} for front in fronts))
        self.assertTrue(all("PSY 241" not in back and "\n" not in back for back in backs))
        outcome_card = next(card for card in compiled["cards"] if card["front"] == "What outcome does the experiment test?")
        self.assertEqual(outcome_card["back"], "whether retrieval practice improves delayed explanation more than restudy")

    def test_card_templates_keep_grammar_and_answers_atomic(self) -> None:
        text = """Slide 1
Attention mechanisms
Source-monitoring errors occur when a person remembers a detail but misattributes its source.
Late-selection theories allow semantic processing before response selection.
Controlled processing requires attention, responds flexibly to goals, and becomes vulnerable when tasks compete.
Slide 2
Learning conditions
Interleaving mixes categories or problem types across practice.
Practice can reduce resource demands, but an automatic response can become costly when the mapping changes.
Slide 3
Bias
Search bias favors questions and evidence that could confirm an existing belief.
Interpretation bias treats ambiguous evidence as supportive of a preferred conclusion.
"""

        compiled = compile_study_material(text, "psychology-notes.pptx")
        cards = {card["front"]: card["back"] for card in compiled["cards"]}

        self.assertIn("When do source-monitoring errors occur?", cards)
        self.assertIn("What do late-selection theories allow?", cards)
        self.assertEqual(cards["What does controlled processing require?"], "attention")
        self.assertEqual(cards["What does interleaving mix?"], "categories or problem types across practice")
        self.assertIn("What does search bias favor?", cards)
        self.assertIn("What does interpretation bias treat?", cards)
        self.assertFalse(any(" practice can " in question.lower() for question in cards))

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

        transcript_fragments = compile_lecture_window(
            "My name is John Sullivan and this is the first lecture. "
            "The body to help maintain that homeostasis is all about vital mechanisms. "
            "The example he gave here is smooth muscle cells. "
            "Muscular and as well as nervous tissue those are four basic types. "
            "Instead what it does may rely primarily on something cocholine. "
            "Remember the intestines help with digestion. "
            "Could be is an entirely different function. "
            "You'll see that many different types of cells help catalyze products glucose.",
            "lecture.webm",
            1509,
            12,
        )
        self.assertEqual(transcript_fragments["concepts"], [])
        self.assertEqual(transcript_fragments["notes"], [])
        self.assertEqual(transcript_fragments["cards"], [])

    def test_generic_lecture_requires_a_clear_testable_fact(self) -> None:
        compiled = compile_lecture_window(
            "Inflation is a sustained increase in the general price level. "
            "Contractionary monetary policy decreases aggregate demand by raising interest rates.",
            "economics-lecture.m4a",
            420,
            4,
        )

        self.assertEqual(compiled["concepts"][0]["name"], "Inflation")
        self.assertEqual(len(compiled["cards"]), 2)
        self.assertEqual(compiled["cards"][0]["front"], "What is inflation?")
        self.assertTrue(all(card["status"] == "provisional" for card in compiled["cards"]))

    def test_lecture_compiler_rejects_singular_are_and_formats_unit_equivalence(self) -> None:
        compiled = compile_lecture_window(
            "Urine are typical again between 1 and 1.5 liters. "
            "Kilogram is equal to 2.2 pounds approximately.",
            "physiology-lecture.m4a",
            2522.37,
            106,
        )

        self.assertEqual(len(compiled["cards"]), 1)
        self.assertEqual(compiled["cards"][0]["front"], "What is one kilogram equal to?")
        self.assertEqual(compiled["cards"][0]["back"], "2.2 pounds approximately")
        self.assertEqual(compiled["concepts"][0]["name"], "Kilogram")

    def test_lecture_compiler_removes_discourse_words_from_inclusion_cards(self) -> None:
        compiled = compile_lecture_window(
            "Whole blood also contains cellular components, like red blood cells and white blood cells, right?",
            "physiology-lecture.m4a",
            3192.55,
            137,
        )

        self.assertEqual(compiled["concepts"][0]["name"], "Whole blood")
        self.assertEqual(compiled["cards"][0]["front"], "What does whole blood include?")
        self.assertEqual(
            compiled["cards"][0]["back"],
            "cellular components, like red blood cells and white blood cells",
        )

    def test_lecture_compiler_rejects_context_only_and_run_on_cards(self) -> None:
        fragments = (
            "The reverse is true with potassium. "
            "Milligram out of 100 ml is a 1% 10 milligrams out of 100 ml is 10% it's easy right now let's give you a sort of a real world example here. "
            "Millimoles is the number of sodium molecules in that. "
            "Osmoles are very important because we're gonna be talking about osmoles in the next slides. "
            "The idea is I want to know how many particles are in solution because that number directly affects fluid shift."
        )
        compiled = compile_lecture_window(
            fragments,
            "physiology-lecture.m4a",
            3600,
            150,
        )

        self.assertEqual(compiled["concepts"], [])
        self.assertEqual(compiled["notes"], [])
        self.assertEqual(compiled["cards"], [])

    def test_unrelated_subjects_create_specific_study_questions(self) -> None:
        subjects = {
            "chemistry.txt": (
                "Chemical kinetics\n"
                "Activation energy is the minimum energy required for a reaction to proceed.\n"
                "A catalyst decreases activation energy without being consumed by the reaction.\n",
                "What is activation energy?",
            ),
            "economics.txt": (
                "Monetary policy\n"
                "Inflation is a sustained increase in the general price level.\n"
                "Contractionary monetary policy decreases aggregate demand by raising interest rates.\n",
                "What is inflation?",
            ),
            "contract-law.txt": (
                "Contract formation\n"
                "Consideration is the exchange of value that supports an enforceable contract.\n"
                "An offer is a definite promise made with intent to be bound.\n",
                "What is consideration?",
            ),
            "cold-war-history.txt": (
                "Postwar Europe\n"
                "The Marshall Plan was a United States program that funded European economic recovery.\n"
                "The Berlin Airlift was an Allied operation that supplied West Berlin by air.\n",
                "What was the Marshall Plan?",
            ),
            "computer-science.txt": (
                "Data structures\n"
                "A hash table is a data structure that maps keys to storage locations.\n"
                "A collision is an event in which two keys map to the same location.\n",
                "What is a hash table?",
            ),
            "literature.txt": (
                "Narrative technique\n"
                "Dramatic irony is a technique in which the audience knows more than a character.\n"
                "A motif is a recurring image or idea that develops a theme.\n",
                "What is dramatic irony?",
            ),
        }

        for filename, (text, expected_question) in subjects.items():
            with self.subTest(filename=filename):
                compiled = compile_study_material(text, filename)
                self.assertGreaterEqual(len(compiled["notes"]), 1)
                self.assertGreaterEqual(len(compiled["cards"]), 2)
                self.assertIn(expected_question, {card["front"] for card in compiled["cards"]})
                self.assertTrue(all(card["source"] == filename for card in compiled["cards"]))


if __name__ == "__main__":
    unittest.main()
