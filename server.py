from __future__ import annotations

import cgi
import hashlib
import html
import io
import json
import os
import posixpath
import re
import sqlite3
import tempfile
import threading
import time
import zipfile
from datetime import datetime, timezone
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse
from xml.etree import ElementTree


ROOT = Path(__file__).resolve().parent
MODEL_PATH = Path(
    os.environ.get(
        "SYLLABLOOM_WHISPER_MODEL",
        os.environ.get("ROUNDS_WHISPER_MODEL", str(ROOT / ".models" / "whisper-small")),
    )
)
MAX_UPLOAD_BYTES = 1024 * 1024 * 1024
ALLOWED_SUFFIXES = {".wav", ".mp3", ".m4a", ".webm", ".ogg", ".flac", ".mp4", ".mov"}
SOURCE_SUFFIXES = {".docx", ".pptx", ".pdf", ".txt"}
DATA_DIR = ROOT / "data"
SESSIONS_DIR = DATA_DIR / "sessions"
SOURCE_LIBRARY_PATH = DATA_DIR / "source-library.json"

_model = None
_model_lock = threading.Lock()
_inference_lock = threading.Lock()
_data_lock = threading.Lock()


def safe_slug(value: str, fallback: str = "file") -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug[:80] or fallback


def write_json(path: Path, payload: dict | list) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    temporary.replace(path)


def read_source_library() -> list[dict]:
    if not SOURCE_LIBRARY_PATH.exists():
        return []
    try:
        payload = json.loads(SOURCE_LIBRARY_PATH.read_text(encoding="utf-8"))
        return payload if isinstance(payload, list) else []
    except (OSError, json.JSONDecodeError):
        return []


def extract_source_text(path: Path, suffix: str) -> tuple[str, dict]:
    if suffix == ".docx":
        from docx import Document

        document = Document(path)
        lines = [paragraph.text.strip() for paragraph in document.paragraphs if paragraph.text.strip()]
        for table in document.tables:
            for row in table.rows:
                line = " | ".join(cell.text.strip() for cell in row.cells if cell.text.strip())
                if line:
                    lines.append(line)
        return "\n".join(lines), {"unitLabel": "paragraphs", "unitCount": len(lines)}
    if suffix == ".pptx":
        namespaces = {
            "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
            "p": "http://schemas.openxmlformats.org/presentationml/2006/main",
            "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
            "pr": "http://schemas.openxmlformats.org/package/2006/relationships",
        }
        with zipfile.ZipFile(path) as package:
            presentation_root = ElementTree.fromstring(package.read("ppt/presentation.xml"))
            relationships_root = ElementTree.fromstring(package.read("ppt/_rels/presentation.xml.rels"))
            relationships = {
                relationship.attrib["Id"]: relationship.attrib["Target"]
                for relationship in relationships_root.findall("pr:Relationship", namespaces)
            }
            slide_paths = []
            for slide_id in presentation_root.findall("p:sldIdLst/p:sldId", namespaces):
                relationship_id = slide_id.attrib.get(f"{{{namespaces['r']}}}id")
                target = relationships.get(relationship_id or "")
                if target:
                    slide_paths.append(
                        target.lstrip("/")
                        if target.startswith("/")
                        else posixpath.normpath(posixpath.join("ppt", target))
                    )

            lines = []
            for slide_number, slide_path in enumerate(slide_paths, start=1):
                slide_root = ElementTree.fromstring(package.read(slide_path))
                slide_lines = []
                for paragraph in slide_root.findall(".//a:p", namespaces):
                    paragraph_text = "".join(
                        node.text or "" for node in paragraph.findall(".//a:t", namespaces)
                    ).strip()
                    if paragraph_text:
                        slide_lines.append(paragraph_text)
                if slide_lines:
                    lines.append(f"Slide {slide_number}\n" + "\n".join(slide_lines))
        return "\n".join(lines), {"unitLabel": "slides", "unitCount": len(slide_paths)}
    if suffix == ".pdf":
        from pypdf import PdfReader

        reader = PdfReader(str(path))
        pages = [(page.extract_text() or "").strip() for page in reader.pages]
        return "\n".join(page for page in pages if page), {"unitLabel": "pages", "unitCount": len(reader.pages)}
    return path.read_text(encoding="utf-8", errors="replace"), {"unitLabel": "lines", "unitCount": 0}


def draft_cards_from_structured_slides(text: str, filename: str) -> list[dict]:
    """Create traceable drafts only when a slide exposes an explicit anatomy schema."""
    cards = []
    slide_blocks = re.split(r"(?m)^Slide (\d+)\s*$", text)
    for index in range(1, len(slide_blocks), 2):
        slide_number = int(slide_blocks[index])
        lines = [re.sub(r"\s+", " ", line).strip() for line in slide_blocks[index + 1].splitlines()]
        lines = [line for line in lines if line]
        upper_lines = [line.upper() for line in lines]
        labels = {label: upper_lines.index(label) for label in ("ATTACHMENT", "ACTION", "INNERVATION") if label in upper_lines}
        if len(labels) != 3:
            continue
        first_label_index = min(labels.values())
        subject = next(
            (
                line
                for line in reversed(lines[:first_label_index])
                if not line.isupper() and not re.fullmatch(r"\d+", line)
            ),
            "",
        )
        if not subject:
            continue
        section = next(
            (
                line.title()
                for line in reversed(lines[:first_label_index])
                if line.isupper() and line not in {"ROUNDS", "SOURCE SIGNALS"}
            ),
            "Imported slides",
        )
        prompts = {
            "ATTACHMENT": f"Where does {subject} attach?",
            "ACTION": f"What is the action of {subject}?",
            "INNERVATION": f"What innervates {subject}?",
        }
        for label, prompt in prompts.items():
            value_index = labels[label] + 1
            if value_index >= len(lines):
                continue
            answer = lines[value_index]
            cards.append(
                {
                    "front": prompt,
                    "back": answer,
                    "field": label.lower(),
                    "section": section,
                    "status": "verified",
                    "source": f"{filename} · Slide {slide_number}",
                    "slideNumber": slide_number,
                }
            )
    return cards


_GENERIC_SECTION_TITLES = {
    "agenda",
    "contents",
    "course overview",
    "learning objectives",
    "objectives",
    "references",
    "questions",
    "thank you",
}
_GENERIC_LABELS = {
    "example",
    "examples",
    "note",
    "notes",
    "key point",
    "key points",
    "summary",
    "source",
}
_BRAND_LINES = {"rounds", "syllabloom", "source signals"}
_LECTURE_STOPWORDS = {
    "about", "after", "again", "also", "because", "before", "being", "between",
    "could", "does", "doing", "during", "each", "from", "going", "have", "having",
    "into", "just", "like", "more", "most", "other", "over", "same", "some", "such",
    "than", "that", "their", "them", "then", "there", "these", "they", "this", "those",
    "through", "today", "under", "very", "what", "when", "where", "which", "while", "with",
    "would", "your", "will", "were", "been", "lecture", "class", "thing", "things",
    "everyone", "discuss", "part", "group", "height", "finally", "known", "suggests",
}
_BAD_SUBJECT_STARTS = {
    "and", "or", "but", "so", "because", "at", "by", "during", "for", "from", "if",
    "in", "into", "it", "its", "of", "on", "since", "that", "then", "there", "these",
    "they", "this", "those", "through", "to", "when", "where", "which", "while", "with",
}
_PROMOTIONAL_LECTURE_PHRASES = (
    "interactive quizzes",
    "more videos",
    "reading a textbook",
    "say goodbye",
    "learning partner",
    "subscribe to",
    "visit our",
)


def _clean_study_line(value: str) -> str:
    value = re.sub(r"^[\s\u2022\u25aa\u25cf\u25e6\-*]+", "", value or "")
    value = re.sub(r"\s+", " ", value).strip()
    return value


def _study_units(text: str) -> list[dict]:
    slide_blocks = re.split(r"(?m)^Slide (\d+)\s*$", text)
    if len(slide_blocks) > 1:
        units = []
        for index in range(1, len(slide_blocks), 2):
            lines = [_clean_study_line(line) for line in slide_blocks[index + 1].splitlines()]
            lines = [line for line in lines if line and not re.fullmatch(r"\d+", line)]
            if lines:
                units.append({"number": int(slide_blocks[index]), "lines": lines})
        return units

    lines = [_clean_study_line(line) for line in text.splitlines()]
    lines = [line for line in lines if line and not re.fullmatch(r"\d+", line)]
    if not lines:
        return []
    chunks = [lines[index : index + 8] for index in range(0, len(lines), 8)]
    return [{"number": index + 1, "lines": chunk} for index, chunk in enumerate(chunks)]


def _study_sentences(lines: list[str]) -> list[str]:
    sentences = []
    for line in lines:
        parts = re.split(r"(?<=[.!?])\s+(?=[A-Z0-9])", line)
        for part in parts:
            cleaned = _clean_study_line(part).strip(" ;")
            if len(re.findall(r"\b\w+\b", cleaned)) >= 4:
                sentences.append(cleaned)
    return sentences


def _unit_topic(lines: list[str], fallback: str) -> tuple[str, int]:
    usable = [(index, line) for index, line in enumerate(lines) if line.lower() not in _BRAND_LINES]
    if not usable:
        return fallback, 0

    normalized = [line.upper() for line in lines]
    label_indexes = [
        normalized.index(label)
        for label in ("ATTACHMENT", "ACTION", "INNERVATION")
        if label in normalized
    ]
    if label_indexes:
        before_schema = [
            (index, line)
            for index, line in usable
            if index < min(label_indexes) and line.upper() not in {"ATTACHMENT", "ACTION", "INNERVATION"}
        ]
        natural_title = next(
            ((index, line) for index, line in reversed(before_schema) if not line.isupper()),
            None,
        )
        if natural_title:
            return natural_title[1].rstrip(".:"), natural_title[0]
        if before_schema:
            return before_schema[-1][1].title().rstrip(".:"), before_schema[-1][0]

    first_index, first = usable[0]
    if first.isupper() and len(usable) > 1:
        second_index, second = usable[1]
        if not second.isupper() and second.lower() not in _GENERIC_LABELS:
            return second.rstrip(".:"), second_index
        return first.title().rstrip(".:"), first_index
    return first.rstrip(".:"), first_index


def _valid_card_subject(value: str) -> bool:
    subject = re.sub(r"\s+", " ", value).strip(" ,;:.-")
    words = subject.split()
    if not (1 <= len(words) <= 11) or len(subject) > 90:
        return False
    if words[0].lower() in _BAD_SUBJECT_STARTS or words[-1].lower() in {"which", "that", "who"}:
        return False
    if "," in subject or ";" in subject:
        return False
    return any(character.isalpha() for character in subject)


def _question_subject(value: str) -> str:
    value = value.strip()
    if value.startswith("The "):
        return "the " + value[4:]
    if value.startswith("A "):
        return "a " + value[2:]
    if value.startswith("An "):
        return "an " + value[3:]
    return value


def _fact_card(statement: str, topic: str) -> tuple[str, str] | None:
    statement = statement.strip().rstrip(".")
    if len(statement) < 18 or len(statement) > 520:
        return None

    colon = re.match(r"^([^:]{2,72}):\s+(.{12,})$", statement)
    if colon:
        label, answer = colon.group(1).strip(), colon.group(2).strip()
        if label.lower() not in _GENERIC_LABELS and _valid_card_subject(label):
            return f"What is {_question_subject(label)}?", answer

    definition = re.match(
        r"^(.{2,90}?)\s+(is|are|means|refers to|is defined as|are defined as)\s+(.{12,})$",
        statement,
        flags=re.IGNORECASE,
    )
    if definition:
        subject, verb, answer = definition.group(1).strip(), definition.group(2).lower(), definition.group(3).strip()
        if _valid_card_subject(subject):
            question_word = "are" if verb.startswith("are") else "is"
            return f"What {question_word} {_question_subject(subject)}?", answer

    location = re.match(r"^(.{2,90}?)\s+(occurs?|takes place|is found|are found)\s+(in|at|within|on)\s+(.{4,})$", statement, flags=re.IGNORECASE)
    if location and _valid_card_subject(location.group(1)):
        return f"Where does {_question_subject(location.group(1))} occur?", f"{location.group(3)} {location.group(4).strip()}"

    inclusion = re.match(r"^(.{2,90}?)\s+(includes?|contains?|comprises?|consists of)\s+(.{8,})$", statement, flags=re.IGNORECASE)
    if inclusion and _valid_card_subject(inclusion.group(1)):
        return f"What does {_question_subject(inclusion.group(1))} include?", inclusion.group(3).strip()

    causal = re.match(r"^(.{2,90}?)\s+(causes?|leads to|results in|increases?|decreases?)\s+(.{8,})$", statement, flags=re.IGNORECASE)
    if causal and _valid_card_subject(causal.group(1)):
        return f"What effect does {_question_subject(causal.group(1))} have?", f"It {causal.group(2).lower()} {causal.group(3).strip()}."

    function = re.match(r"^(.{2,90}?)\s+(allows?|enables?|helps?|functions? to|is responsible for)\s+(.{8,})$", statement, flags=re.IGNORECASE)
    if function and _valid_card_subject(function.group(1)):
        return f"What is the function of {_question_subject(function.group(1))}?", f"It {function.group(2).lower()} {function.group(3).strip()}."
    return None


def _topic_question(topic: str, lines: list[str]) -> str:
    normalized = topic.strip().rstrip(".?")
    patterns = (
        (r"^(types|forms|classes) of (.+)$", "What are the main {0} of {1}?"),
        (r"^(functions|roles) of (.+)$", "What are the main {0} of {1}?"),
        (r"^(stages|steps|phases) of (.+)$", "What are the {0} of {1}?"),
        (r"^(causes|effects|risk factors|features|components) of (.+)$", "What are the main {0} of {1}?"),
    )
    for pattern, template in patterns:
        match = re.match(pattern, normalized, flags=re.IGNORECASE)
        if match:
            return template.format(match.group(1).lower(), match.group(2))
    if re.search(r"\b(vs\.?|versus)\b", normalized, flags=re.IGNORECASE):
        return f"How do {normalized} differ?"
    return f"What are the key ideas about {normalized}?" if len(lines) > 1 else f"What is the key idea about {normalized}?"


def _infer_lecture_topic(text: str) -> str:
    talk_about = re.search(
        r"\b(?:talk|talking|learn|learning|focus|focusing|cover|covering)\s+(?:about|on)\s+(.{3,70}?)(?:[.,]|\band how\b|\band why\b|$)",
        text,
        flags=re.IGNORECASE,
    )
    if talk_about:
        return talk_about.group(1).strip().rstrip(".")
    for sentence in _study_sentences([text]):
        definition = re.match(r"^(.{2,90}?)\s+(?:is|are|means|refers to)\s+", sentence, flags=re.IGNORECASE)
        if definition and _valid_card_subject(definition.group(1)):
            candidate = definition.group(1).strip()
            candidate = re.sub(r"^(?:the|a|an)\s+", "", candidate, flags=re.IGNORECASE)
            return candidate
    words = [word.lower() for word in re.findall(r"\b[A-Za-z][A-Za-z-]{3,}\b", text)]
    useful = [word for word in words if word not in _LECTURE_STOPWORDS]
    if len(useful) >= 2:
        bigrams = [f"{useful[index]} {useful[index + 1]}" for index in range(len(useful) - 1)]
        counts = {phrase: bigrams.count(phrase) for phrase in dict.fromkeys(bigrams)}
        return max(counts, key=lambda phrase: (counts[phrase], -bigrams.index(phrase))).replace("-", " ")
    if useful:
        return useful[0].replace("-", " ")
    return "this lecture section"


def compile_study_material(text: str, filename: str, status: str = "verified") -> dict:
    concepts = []
    notes = []
    cards = []
    seen_cards = set()
    stem = Path(filename).stem.replace("_", " ").replace("-", " ").strip()

    for unit in _study_units(text):
        lines = unit["lines"]
        if not lines:
            continue
        topic, title_index = _unit_topic(lines, stem)
        has_title = len(topic) <= 120 and len(topic.split()) <= 16
        body = lines[title_index + 1 :] if has_title and title_index + 1 < len(lines) else lines
        body = [line for line in body if line.lower() not in _BRAND_LINES]
        body = [line for line in body if line.lower() not in _GENERIC_SECTION_TITLES]
        if not body:
            continue
        if topic.lower() in _GENERIC_SECTION_TITLES:
            topic = _infer_lecture_topic(" ".join(body))

        citation = f"{filename} · Slide {unit['number']}" if text.lstrip().startswith("Slide ") else filename
        note_lines = body[:6]
        concepts.append({
            "name": topic,
            "status": status,
            "source": citation,
            "slideNumber": unit["number"] if text.lstrip().startswith("Slide ") else None,
        })
        notes.append({
            "title": topic,
            "section": topic,
            "heardAt": None,
            "status": status,
            "source": citation,
            "slideNumber": unit["number"] if text.lstrip().startswith("Slide ") else None,
            "lines": note_lines,
        })

        unit_cards = []
        for statement in _study_sentences(body):
            generated = _fact_card(statement, topic)
            if not generated:
                continue
            front, back = generated
            key = (front.lower(), back.lower())
            if key in seen_cards:
                continue
            seen_cards.add(key)
            unit_cards.append((front, back))
            if len(unit_cards) >= 2:
                break

        if len(body) > 1:
            answer = "\n".join(f"• {line}" for line in body[:6])
            summary = (_topic_question(topic, body), answer)
            key = (summary[0].lower(), summary[1].lower())
            if key not in seen_cards:
                seen_cards.add(key)
                unit_cards.append(summary)

        for front, back in unit_cards[:3]:
            cards.append({
                "muscle": topic,
                "field": "concept",
                "front": front,
                "back": back,
                "section": topic,
                "source": citation,
                "status": status,
                "slideNumber": unit["number"] if text.lstrip().startswith("Slide ") else None,
            })

    return {"concepts": concepts, "notes": notes, "cards": cards}


def compile_lecture_window(text: str, filename: str, heard_at: float, window_number: int) -> dict:
    cleaned = re.sub(r"\s+", " ", text).strip()
    if len(re.findall(r"\b\w+\b", cleaned)) < 8:
        return {"concepts": [], "notes": [], "cards": []}
    sentences = _study_sentences([cleaned]) or [cleaned]
    sentences = [
        sentence for sentence in sentences
        if not any(phrase in sentence.lower() for phrase in _PROMOTIONAL_LECTURE_PHRASES)
    ]
    if not sentences:
        return {"concepts": [], "notes": [], "cards": []}
    instructional_text = " ".join(sentences)
    topic = _infer_lecture_topic(instructional_text)
    citation = f"{filename} · {int(heard_at // 60):02d}:{int(heard_at % 60):02d}"
    card_pairs = []
    seen = set()
    for sentence in sentences:
        generated = _fact_card(sentence, topic)
        if not generated or generated[0].lower() in seen:
            continue
        seen.add(generated[0].lower())
        card_pairs.append(generated)
        if len(card_pairs) >= 2:
            break
    if not card_pairs and topic not in {"this lecture section", "and", "anterior", "muscle", "this muscle"}:
        answer = " ".join(sentences[:2])[:520]
        card_pairs.append((f"What did the lecturer explain about {topic}?", answer))
    concept = {"name": topic, "status": "provisional", "source": citation}
    note = {
        "title": topic,
        "section": "Lecture notes",
        "heardAt": round(heard_at, 2),
        "status": "provisional",
        "source": citation,
        "lines": sentences[:3],
    }
    cards = [
        {
            "muscle": topic,
            "field": "lecture",
            "front": front,
            "back": back,
            "section": "Lecture notes",
            "source": citation,
            "status": "provisional",
            "windowNumber": window_number,
        }
        for front, back in card_pairs
    ]
    return {"concepts": [concept], "notes": [note], "cards": cards}


def compile_lecture_segments(segments: list[dict], filename: str) -> dict:
    concepts = []
    notes = []
    cards = []
    seen_questions = set()
    window_size = 5
    for offset in range(0, len(segments), window_size):
        window = segments[offset : offset + window_size]
        if not window:
            continue
        compiled = compile_lecture_window(
            " ".join(segment.get("text", "") for segment in window),
            filename,
            float(window[0].get("start", 0)),
            offset // window_size + 1,
        )
        new_cards = []
        for card in compiled["cards"]:
            key = card["front"].strip().lower()
            if key in seen_questions:
                continue
            seen_questions.add(key)
            new_cards.append(card)
        concepts.extend(compiled["concepts"])
        notes.extend(compiled["notes"])
        cards.extend(new_cards)
    return {"concepts": concepts, "notes": notes, "cards": cards}


def source_summary(path: Path, filename: str, kind: str) -> dict:
    suffix = path.suffix.lower()
    text, units = extract_source_text(path, suffix)
    cleaned_lines = [re.sub(r"\s+", " ", line).strip() for line in text.splitlines()]
    cleaned_lines = [line for line in cleaned_lines if line]
    headings = []
    objectives = []
    for line in cleaned_lines:
        normalized = line.lower()
        if len(line) <= 90 and (line.isupper() or re.match(r"^(unit|week|lecture|chapter|exam|section)\b", normalized)):
            headings.append(line)
        if re.search(r"\b(objective|outcome|students will|able to)\b", normalized):
            objectives.append(line)
    fingerprint = hashlib.sha256(text.encode("utf-8", errors="ignore")).hexdigest()
    compiled = compile_study_material(text, filename)
    structured_cards = draft_cards_from_structured_slides(text, filename) if suffix == ".pptx" else []
    draft_cards = structured_cards or compiled["cards"]
    return {
        "id": fingerprint[:12],
        "name": filename,
        "kind": kind if kind in {"syllabus", "material", "assessment"} else "material",
        "format": suffix.lstrip(".").upper(),
        "wordCount": len(re.findall(r"\b\w+\b", text)),
        "unitLabel": units["unitLabel"],
        "unitCount": units["unitCount"] or len(cleaned_lines),
        "headings": headings[:8],
        "objectiveCount": len(objectives),
        "preview": cleaned_lines[:5],
        "concepts": compiled["concepts"],
        "notes": compiled["notes"],
        "draftCards": draft_cards,
        "fingerprint": fingerprint,
        "addedAt": datetime.now(timezone.utc).isoformat(),
        "localOnly": True,
    }


def persist_session(payload: dict) -> str:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    session_id = f"{stamp}-{safe_slug(payload.get('filename', 'lecture'))[:28]}"
    payload = {"id": session_id, "savedAt": datetime.now(timezone.utc).isoformat(), **payload}
    with _data_lock:
        write_json(SESSIONS_DIR / f"{session_id}.json", payload)
        write_json(DATA_DIR / "latest-session.json", payload)
    return session_id


def _bounded_int(value, fallback: int, minimum: int, maximum: int) -> int:
    try:
        return max(minimum, min(maximum, int(float(value))))
    except (TypeError, ValueError):
        return fallback


def _bounded_float(value, fallback: float, minimum: float, maximum: float) -> float:
    try:
        return max(minimum, min(maximum, float(value)))
    except (TypeError, ValueError):
        return fallback


def _step_minutes(value, fallback: list[float]) -> list[float]:
    if isinstance(value, list):
        parsed = []
        for step in value:
            try:
                parsed.append(max(0.0, float(step)))
            except (TypeError, ValueError):
                continue
        return parsed
    if not isinstance(value, str):
        return fallback
    parsed = []
    for raw_step in re.split(r"[\s,]+", value.strip()):
        if not raw_step:
            continue
        match = re.fullmatch(r"(\d+(?:\.\d+)?)([smhd]?)", raw_step, re.IGNORECASE)
        if not match:
            continue
        amount = float(match.group(1))
        unit = match.group(2).lower()
        if unit == "s":
            amount /= 60
        elif unit == "h":
            amount *= 60
        elif unit == "d":
            amount *= 1440
        parsed.append(amount)
    return parsed if parsed else fallback


def _anki_deck_config(preferences: dict, config_id: int) -> dict:
    gather_order = {
        "deck": 0,
        "ascending": 1,
        "descending": 2,
        "random-notes": 3,
        "random-cards": 4,
        "deck-random-notes": 5,
    }
    sort_order = {
        "template": 0,
        "gathered": 1,
        "template-random": 2,
        "random-note-template": 3,
        "random-card": 4,
    }
    review_order = {
        "due": 0,
        "due-deck": 1,
        "deck-due": 2,
        "interval-asc": 3,
        "interval-desc": 4,
        "ease-asc": 5,
        "ease-desc": 6,
        "retrievability-asc": 7,
        "random": 8,
        "added": 9,
        "reverse-added": 10,
        "retrievability-desc": 11,
        "relative-overdue": 12,
    }
    mix_order = {"mix": 0, "after": 1, "before": 2}
    answer_actions = {"bury": 0, "again": 1, "good": 2, "hard": 3, "reminder": 4}
    fsrs_parameters = preferences.get("fsrsParameters") or []
    if isinstance(fsrs_parameters, str):
        fsrs_parameters = [
            float(value)
            for value in re.split(r"[\s,]+", fsrs_parameters.strip())
            if value and re.fullmatch(r"-?\d+(?:\.\d+)?", value)
        ]
    easy_days = preferences.get("easyDays")
    if not isinstance(easy_days, list) or len(easy_days) != 7:
        easy_days = [1, 1, 1, 1, 1, 1, 1]
    easy_days = [_bounded_float(day, 1.0, 0.0, 1.0) for day in easy_days]
    return {
        "id": config_id,
        "mod": int(time.time()),
        "name": str(preferences.get("presetName") or "Syllabloom").strip()[:120] or "Syllabloom",
        "usn": -1,
        "maxTaken": _bounded_int(preferences.get("maximumAnswerSeconds"), 60, 0, 86400),
        "autoplay": not bool(preferences.get("disableAutoplay", False)),
        "timer": 1 if preferences.get("showTimer") else 0,
        "replayq": not bool(preferences.get("skipQuestionAudio", False)),
        "new": {
            "bury": bool(preferences.get("buryNew", True)),
            "delays": _step_minutes(preferences.get("learningSteps"), [1.0, 10.0]),
            "initialFactor": int(_bounded_float(preferences.get("startingEase"), 2.5, 1.3, 5.0) * 1000),
            "ints": [
                _bounded_int(preferences.get("graduatingInterval"), 1, 1, 36500),
                _bounded_int(preferences.get("easyInterval"), 4, 1, 36500),
                0,
            ],
            "order": 1 if preferences.get("insertionOrder") == "random" else 0,
            "perDay": _bounded_int(preferences.get("newPerDay", preferences.get("dailyLimit")), 20, 0, 9999),
        },
        "rev": {
            "bury": bool(preferences.get("buryReviews", True)),
            "ease4": _bounded_float(preferences.get("easyBonus"), 1.3, 1.0, 5.0),
            "ivlFct": _bounded_float(preferences.get("intervalModifier"), 1.0, 0.1, 5.0),
            "maxIvl": _bounded_int(preferences.get("maximumInterval"), 36500, 1, 36500),
            "perDay": _bounded_int(preferences.get("reviewsPerDay"), 9999, 0, 99999),
            "hardFactor": _bounded_float(preferences.get("hardInterval"), 1.2, 1.0, 2.0),
        },
        "lapse": {
            "delays": _step_minutes(preferences.get("relearningSteps"), [10.0]),
            "leechAction": 1 if preferences.get("leechAction") == "tag" else 0,
            "leechFails": _bounded_int(preferences.get("leechThreshold"), 8, 1, 999),
            "minInt": _bounded_int(preferences.get("minimumInterval"), 1, 1, 36500),
            "mult": _bounded_float(preferences.get("newInterval"), 0.0, 0.0, 1.0),
        },
        "dyn": False,
        "newMix": mix_order.get(str(preferences.get("newReviewOrder")), 1),
        "newPerDayMinimum": 0,
        "interdayLearningMix": mix_order.get(str(preferences.get("interdayOrder")), 0),
        "reviewOrder": review_order.get(str(preferences.get("reviewOrder")), 0),
        "newSortOrder": sort_order.get(str(preferences.get("sortOrder")), 0),
        "newGatherPriority": gather_order.get(str(preferences.get("gatherOrder")), 0),
        "buryInterdayLearning": bool(preferences.get("buryInterday", True)),
        "fsrsWeights": [],
        "fsrsParams5": [],
        "fsrsParams6": [float(value) for value in fsrs_parameters if isinstance(value, (int, float))],
        "desiredRetention": _bounded_float(preferences.get("desiredRetention"), 0.9, 0.7, 0.99),
        "ignoreRevlogsBeforeDate": str(preferences.get("ignoreBefore") or ""),
        "easyDaysPercentages": easy_days,
        "stopTimerOnAnswer": bool(preferences.get("stopTimerOnAnswer", False)),
        "secondsToShowQuestion": _bounded_float(preferences.get("questionSeconds"), 0.0, 0.0, 86400.0),
        "secondsToShowAnswer": _bounded_float(preferences.get("answerSeconds"), 0.0, 0.0, 86400.0),
        "questionAction": 1 if preferences.get("questionAction") == "show-reminder" else 0,
        "answerAction": answer_actions.get(str(preferences.get("answerAction")), 0),
        "waitForAudio": bool(preferences.get("waitForAudio", True)),
        "sm2Retention": _bounded_float(preferences.get("historicalRetention"), 0.9, 0.7, 0.99),
        "weightSearch": "",
    }


def _attach_anki_deck_config(package_path: Path, deck_id: int, config: dict) -> None:
    with zipfile.ZipFile(package_path, "r") as archive:
        entries = [(info, archive.read(info.filename)) for info in archive.infolist()]
    collection_bytes = next(data for info, data in entries if info.filename == "collection.anki2")
    with tempfile.NamedTemporaryFile(prefix="syllabloom-collection-", suffix=".anki2", delete=False) as database:
        database_path = Path(database.name)
        database.write(collection_bytes)
    repacked_path = package_path.with_suffix(".configured.apkg")
    try:
        connection = sqlite3.connect(database_path)
        decks_json, configs_json = connection.execute("SELECT decks, dconf FROM col").fetchone()
        decks = json.loads(decks_json)
        configs = json.loads(configs_json)
        decks[str(deck_id)]["conf"] = config["id"]
        configs[str(config["id"])] = config
        connection.execute("UPDATE col SET decks = ?, dconf = ?", (json.dumps(decks), json.dumps(configs)))
        connection.commit()
        connection.close()
        configured_collection = database_path.read_bytes()
        with zipfile.ZipFile(repacked_path, "w") as archive:
            for info, data in entries:
                archive.writestr(info, configured_collection if info.filename == "collection.anki2" else data)
        repacked_path.replace(package_path)
    finally:
        database_path.unlink(missing_ok=True)
        repacked_path.unlink(missing_ok=True)


def build_anki_package(cards: list[dict], preferences: dict) -> tuple[bytes, str]:
    import genanki

    parent_deck = str(preferences.get("deck") or "Syllabloom").strip()[:120] or "Syllabloom"
    set_name = str(preferences.get("setName") or "").strip()[:120]
    deck_name = f"{parent_deck}::{set_name}" if set_name else parent_deck
    card_format = str(preferences.get("format") or "Basic")
    seed = int(hashlib.sha256(deck_name.encode("utf-8")).hexdigest()[:12], 16)
    deck_id = 1_000_000_000 + seed % 999_999_999
    model_id = deck_id - 17 if deck_id > 1_000_000_017 else deck_id + 17
    css = """
.card {
  margin: 0;
  padding: 24px 16px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif;
  font-size: 20px;
  line-height: 1.55;
  text-align: left;
  color: #252a27;
  background: #efeee8;
}
.card-shell {
  box-sizing: border-box;
  width: 100%;
  max-width: 720px;
  margin: 0 auto;
  padding: 28px;
  overflow-wrap: anywhere;
  background: #fbfaf6;
  border: 1px solid #c5cbc7;
  border-radius: 18px;
}
.prompt {
  font-size: 28px;
  font-weight: 650;
  line-height: 1.28;
  letter-spacing: -0.02em;
}
.answer {
  font-size: 20px;
  line-height: 1.55;
}
#answer {
  margin: 24px 0;
  border: 0;
  border-top: 1px solid #c9ceca;
}
.source {
  margin-top: 24px;
  padding-top: 12px;
  color: #626c66;
  font-size: 13px;
  line-height: 1.4;
  border-top: 1px solid #d8dcd9;
}
.mobile .card {
  padding: 12px 8px;
  font-size: 18px;
}
.mobile .card-shell {
  padding: 22px 18px;
  border-radius: 14px;
}
.mobile .prompt {
  font-size: 24px;
}
.nightMode.card {
  color: #eef1ee;
  background: #1d211f;
}
.nightMode .card-shell {
  background: #282e2a;
  border-color: #465049;
}
.nightMode .source {
  color: #b8c2bc;
  border-color: #465049;
}
.nightMode #answer {
  border-color: #465049;
}
"""
    if card_format == "Cloze":
        model = genanki.Model(
            model_id,
            "Syllabloom Cloze",
            fields=[{"name": "Text"}, {"name": "Back Extra"}, {"name": "Source"}],
            templates=[{
                "name": "Cloze",
                "qfmt": "<main class='card-shell'><div class='prompt'>{{cloze:Text}}</div></main>",
                "afmt": "<main class='card-shell'><div class='answer'>{{cloze:Text}}</div>{{#Back Extra}}<hr id='answer'><div class='answer'>{{Back Extra}}</div>{{/Back Extra}}<div class='source'>{{Source}}</div></main>",
            }],
            css=css,
            model_type=genanki.Model.CLOZE,
        )
    else:
        model = genanki.Model(
            model_id,
            "Syllabloom Basic",
            fields=[{"name": "Front"}, {"name": "Back"}, {"name": "Source"}],
            templates=[{
                "name": "Card 1",
                "qfmt": "<main class='card-shell'><div class='prompt'>{{Front}}</div></main>",
                "afmt": "<main class='card-shell'><div class='prompt'>{{Front}}</div><hr id='answer'><div class='answer'>{{Back}}</div><div class='source'>{{Source}}</div></main>",
            }],
            css=css,
        )
    preset_name = str(preferences.get("presetName") or "Syllabloom").strip()[:120] or "Syllabloom"
    deck = genanki.Deck(deck_id, deck_name, description=f"Created by Syllabloom with the {preset_name} deck preset.")
    for card in cards[:5000]:
        front = html.escape(str(card.get("front") or "").strip()).replace("\n", "<br>")
        back = html.escape(str(card.get("back") or "").strip()).replace("\n", "<br>")
        source = html.escape(str(card.get("source") or "Syllabloom source library").strip())
        if not front or not back:
            continue
        tags = [safe_slug(tag, "syllabloom") for tag in str(card.get("tags") or "syllabloom").split()]
        if card_format == "Cloze":
            text = front if "{{c" in front else f"{front}<br>{{{{c1::{back}}}}}"
            note = genanki.Note(model=model, fields=[text, "", source], tags=tags)
        else:
            note = genanki.Note(model=model, fields=[front, back, source], tags=tags)
        deck.add_note(note)
    if not deck.notes:
        raise ValueError("No complete cards were provided.")
    with tempfile.NamedTemporaryFile(prefix="syllabloom-anki-", suffix=".apkg", delete=False) as output:
        output_path = Path(output.name)
    try:
        genanki.Package(deck).write_to_file(str(output_path))
        config_id = 2_000_000_000 + seed % 999_999_999
        _attach_anki_deck_config(output_path, deck_id, _anki_deck_config(preferences, config_id))
        return output_path.read_bytes(), f"{safe_slug(deck_name, 'syllabloom')}.apkg"
    finally:
        output_path.unlink(missing_ok=True)


# Prototype concept schema. In production this is generated from each class's
# syllabus and source library rather than being fixed in application code.
PHYSIOLOGY_CONCEPT_SCHEMA = (
    {
        "id": "homeostasis",
        "requires": ("homeostasis", "internal environment"),
        "title": "Homeostasis",
        "lines": (
            "The body uses regulatory mechanisms to preserve stable conditions in its internal environment.",
            "Fluid homeostasis is one example of this broader physiological goal.",
        ),
        "front": "What is homeostasis?",
        "back": "Maintenance of relatively stable conditions in the body’s internal environment through regulatory mechanisms.",
    },
    {
        "id": "organization-levels",
        "requires": ("chemical level", "cellular level", "tissue level"),
        "title": "Levels of structural organization",
        "lines": ("Chemical → cellular → tissue → organ → organ system → organism.",),
        "front": "Order the levels of structural organization from simplest to most complex.",
        "back": "Chemical → cellular → tissue → organ → organ system → organism.",
    },
    {
        "id": "tissue-types",
        "requires": ("four types of tissue", "epithelial tissue", "connective tissue"),
        "title": "Four basic tissue types",
        "lines": ("Epithelial, connective, muscular, and nervous tissue are the four basic tissue classes.",),
        "front": "What are the four basic tissue types?",
        "back": "Epithelial, connective, muscular, and nervous tissue.",
    },
    {
        "id": "microvilli",
        "requires": ("microvilli", "increase surface area"),
        "title": "Microvilli",
        "lines": ("Microvilli increase cell surface area and support absorption, including in the digestive tract.",),
        "front": "What is the main functional effect of microvilli?",
        "back": "They increase surface area for absorption.",
    },
    {
        "id": "rough-er",
        "requires": ("rough endoplasmic reticulum", "ribosomes make proteins"),
        "title": "Rough endoplasmic reticulum",
        "lines": ("Ribosomes give rough ER its appearance and synthesize proteins.",),
        "front": "Why does rough endoplasmic reticulum appear rough?",
        "back": "It is studded with ribosomes, which synthesize proteins.",
    },
    {
        "id": "golgi",
        "requires": ("packaging system", "outside of the cell"),
        "title": "Golgi apparatus",
        "lines": ("The Golgi modifies, sorts, and packages material for destinations inside, at the membrane, or outside the cell.",),
        "front": "What is the Golgi apparatus’s core role?",
        "back": "Modifying, sorting, and packaging cellular products for delivery.",
    },
    {
        "id": "plasma-membrane",
        "requires": ("plasma membrane", "lipid bilayer", "phospholipids"),
        "title": "Plasma membrane",
        "lines": (
            "The plasma membrane is primarily a phospholipid bilayer separating intracellular and extracellular environments.",
            "Its proteins, channels, receptors, carbohydrates, and lipids determine signaling and selective permeability.",
        ),
        "front": "What is the basic structure and purpose of the plasma membrane?",
        "back": "A phospholipid bilayer that separates internal from external environments and selectively controls transport and signaling.",
    },
    {
        "id": "passive-transport",
        "requires": ("passive", "doesn't require any energy", "diffusion"),
        "title": "Passive transport",
        "lines": ("Passive transport requires no ATP and moves substances down their concentration gradient.",),
        "front": "What defines passive transport?",
        "back": "It requires no ATP and moves substances down their concentration gradient.",
    },
    {
        "id": "simple-diffusion",
        "requires": ("simple diffusion", "high concentration to low concentration"),
        "title": "Simple diffusion",
        "lines": ("Small or lipid-soluble substances can cross the membrane directly from high to low concentration.",),
        "front": "Which substances cross by simple diffusion, and in what direction?",
        "back": "Small or lipid-soluble substances move directly through the membrane from high to low concentration.",
    },
    {
        "id": "facilitated-diffusion",
        "requires": ("facilitated diffusion", "glucose transporters"),
        "title": "Facilitated diffusion",
        "lines": ("A specific carrier moves a substance such as glucose down its gradient without ATP.",),
        "front": "How does facilitated diffusion differ from simple diffusion?",
        "back": "It still moves down the concentration gradient without ATP, but requires a specific carrier or transport protein.",
    },
    {
        "id": "active-transport",
        "requires": ("active", "requires", "atp", "against the gradient"),
        "title": "Active transport",
        "lines": ("Active transport uses energy, commonly ATP, to move substances against their concentration gradient.",),
        "front": "Why does active transport require energy?",
        "back": "It moves substances against their concentration gradient, from lower toward higher concentration.",
    },
    {
        "id": "osmosis",
        "requires": ("osmosis", "water"),
        "title": "Osmosis",
        "lines": ("Osmosis is the passive movement of water across a selectively permeable membrane.",),
        "front": "What is osmosis?",
        "back": "Passive movement of water across a selectively permeable membrane.",
    },
    {
        "id": "fluid-compartments",
        "requires": ("intracellular fluid", "extracellular fluid"),
        "title": "Body-fluid compartments",
        "lines": ("Body water is divided into intracellular and extracellular fluid compartments.",),
        "front": "What are the two major body-fluid compartments?",
        "back": "Intracellular fluid and extracellular fluid.",
    },
)


class NoAudioTrackError(ValueError):
    pass


def load_muscle_source() -> dict:
    raw = (ROOT / "muscle-data.js").read_text(encoding="utf-8").strip()
    prefix = "window.MUSCLE_SOURCE = "
    if not raw.startswith(prefix):
        raise RuntimeError("Muscle source is not in the expected format")
    payload = raw[len(prefix) :]
    if payload.endswith(";"):
        payload = payload[:-1]
    return json.loads(payload)


MUSCLE_SOURCE = load_muscle_source()


def get_model():
    global _model
    if _model is not None:
        return _model
    with _model_lock:
        if _model is None:
            if not MODEL_PATH.is_dir():
                raise RuntimeError(
                    "Local Whisper model not found. Set SYLLABLOOM_WHISPER_MODEL "
                    f"to a downloaded faster-whisper model directory. Checked: {MODEL_PATH}"
                )
            os.environ["ORT_DISABLE_TELEMETRY"] = "1"
            from faster_whisper import WhisperModel

            _model = WhisperModel(
                str(MODEL_PATH),
                device="cpu",
                compute_type="int8",
                local_files_only=True,
            )
    return _model


def find_course_matches(transcript: str) -> list[dict]:
    normalized = " ".join(transcript.lower().split())
    matches = []
    for record in MUSCLE_SOURCE["records"]:
        name = record["muscle"].lower()
        if name in normalized:
            matches.append(record)
    return matches


def find_lecture_concepts(transcript: str) -> list[dict]:
    normalized = " ".join(transcript.lower().replace("’", "'").split())
    return [
        rule
        for rule in PHYSIOLOGY_CONCEPT_SCHEMA
        if all(phrase in normalized for phrase in rule["requires"])
    ]


def build_lecture_items(rule: dict, heard_at: float) -> tuple[list[dict], list[dict]]:
    notes = [
        {
            "title": rule["title"],
            "section": "Medical Physiology",
            "heardAt": round(heard_at, 2),
            "status": "provisional",
            "lines": list(rule["lines"]),
        }
    ]
    cards = [
        {
            "muscle": rule["title"],
            "field": "lecture",
            "front": rule["front"],
            "back": rule["back"],
            "section": "Medical Physiology",
            "source": "Lecture transcript",
            "status": "provisional",
        }
    ]
    return notes, cards


def build_cards(records: list[dict]) -> list[dict]:
    cards = []
    field_prompts = {
        "attachment": "What are the attachments of {muscle}?",
        "action": "What is the action of {muscle}?",
        "innervation": "What is the innervation of {muscle}?",
    }
    for record in records:
        for field, prompt in field_prompts.items():
            cards.append(
                {
                    "muscle": record["muscle"],
                    "field": field,
                    "front": prompt.format(muscle=record["muscle"]),
                    "back": record[field],
                    "section": record["section"],
                    "source": MUSCLE_SOURCE["document"],
                }
            )
    return cards


def build_notes(records: list[dict], heard_at: float | None = None) -> list[dict]:
    return [
        {
            "title": record["muscle"],
            "section": record["section"],
            "heardAt": round(heard_at, 2) if heard_at is not None else None,
            "lines": [
                f'Attachments: {record["attachment"]}',
                f'Action: {record["action"]}',
                f'Innervation: {record["innervation"]}',
            ],
        }
        for record in records
    ]


def inspect_media(path: Path) -> dict:
    import av

    with av.open(str(path)) as container:
        audio_streams = [stream for stream in container.streams if stream.type == "audio"]
        video_streams = [stream for stream in container.streams if stream.type == "video"]
        duration = float(container.duration / av.time_base) if container.duration else 0.0
        if not audio_streams:
            raise NoAudioTrackError(
                "This video has no audio track. Download a merged YouTube file that includes both video and audio."
            )
        return {
            "durationSeconds": round(duration, 2),
            "hasVideo": bool(video_streams),
            "audioCodec": audio_streams[0].codec_context.name,
        }


def find_terminology_warnings(segments: list[dict]) -> list[dict]:
    """Flag a few high-risk anatomy substitutions without pretending to correct them."""
    checks = (
        ("planter", "Possible anatomy term: “planter” may be “plantar”."),
        ("interior tibial", "Possible vessel name: “interior tibial” may be “anterior tibial”."),
        ("mediocotally", "Unrecognized anatomical term; compare this phrase with the lecture audio."),
    )
    warnings = []
    seen = set()
    for index, segment in enumerate(segments):
        next_text = segments[index + 1]["text"] if index + 1 < len(segments) else ""
        normalized = f'{segment["text"]} {next_text}'.lower()
        for needle, message in checks:
            if needle in normalized and needle not in seen:
                seen.add(needle)
                warnings.append(
                    {
                        "time": segment["start"],
                        "term": needle,
                        "message": message,
                    }
                )
    return warnings


def transcribe(path: Path) -> dict:
    media = inspect_media(path)
    started = time.perf_counter()
    model = get_model()
    with _inference_lock:
        generated, info = model.transcribe(
            str(path),
            language="en",
            task="transcribe",
            beam_size=3,
            vad_filter=True,
            condition_on_previous_text=False,
        )
        segments = []
        transcript_parts = []
        weighted_logprob = 0.0
        weighted_seconds = 0.0
        for item in generated:
            text = item.text.strip()
            if not text:
                continue
            duration = max(0.01, float(item.end) - float(item.start))
            avg_logprob = float(getattr(item, "avg_logprob", -1.0))
            weighted_logprob += avg_logprob * duration
            weighted_seconds += duration
            transcript_parts.append(text)
            segments.append(
                {
                    "start": round(float(item.start), 2),
                    "end": round(float(item.end), 2),
                    "text": text,
                    "avgLogprob": round(avg_logprob, 3),
                    "needsReview": avg_logprob < -0.55,
                }
            )

    transcript = " ".join(transcript_parts)
    matches = find_course_matches(transcript)
    generic = compile_lecture_segments(segments, path.name)
    schema_concepts = []
    schema_notes = []
    schema_cards = []
    for rule in find_lecture_concepts(transcript):
        notes, cards = build_lecture_items(rule, 0)
        schema_concepts.append({"name": rule["title"], "status": "provisional"})
        schema_notes.extend(notes)
        schema_cards.extend(cards)
    matched_cards = build_cards(matches)
    seen_questions = {card["front"].strip().lower() for card in matched_cards + schema_cards}
    generic_cards = [
        card for card in generic["cards"]
        if card["front"].strip().lower() not in seen_questions
    ]
    terminology_warnings = find_terminology_warnings(segments)
    average_logprob = weighted_logprob / weighted_seconds if weighted_seconds else -2.0
    from faster_whisper.audio import decode_audio

    samples = decode_audio(str(path), sampling_rate=16000)
    bucket_count = 160
    bucket_size = max(1, len(samples) // bucket_count)
    waveform = []
    for index in range(bucket_count):
        bucket = samples[index * bucket_size : (index + 1) * bucket_size]
        waveform.append(round(float(abs(bucket).max()), 4) if len(bucket) else 0.0)
    peak = max(waveform, default=1.0) or 1.0
    waveform = [round(value / peak, 3) for value in waveform]
    return {
        "engine": "faster-whisper small · local CPU int8",
        "language": info.language,
        "durationSeconds": round(float(info.duration), 2),
        "processingSeconds": round(time.perf_counter() - started, 2),
        "averageLogprob": round(average_logprob, 3),
        "transcript": transcript,
        "segments": segments,
        "detectedConcepts": (
            [{"name": record["muscle"], "status": "verified"} for record in matches]
            + schema_concepts
            + generic["concepts"]
        ),
        "cards": matched_cards + schema_cards + generic_cards,
        "notes": build_notes(matches) + schema_notes + generic["notes"],
        "reviewSegmentCount": sum(1 for segment in segments if segment["needsReview"]),
        "qualityWarnings": terminology_warnings,
        "waveform": waveform,
        "media": media,
    }


def transcribe_events(path: Path, filename: str, markers: list[float] | None = None):
    markers = markers or []
    media = inspect_media(path)
    started = time.perf_counter()
    yield {
        "type": "metadata",
        "filename": filename,
        "durationSeconds": media["durationSeconds"],
        "hasVideo": media["hasVideo"],
        "engine": "faster-whisper small · local CPU int8",
    }
    model = get_model()

    with _inference_lock:
        generated, info = model.transcribe(
            str(path),
            language="en",
            task="transcribe",
            beam_size=3,
            vad_filter=True,
            condition_on_previous_text=False,
        )
        segments = []
        transcript_parts = []
        matched_names = set()
        matched_lecture_ids = set()
        seen_card_questions = set()
        session_concepts = []
        session_notes = []
        session_cards = []
        generic_buffer = []
        generic_window_number = 0
        for item in generated:
            text = item.text.strip()
            if not text:
                continue
            avg_logprob = float(getattr(item, "avg_logprob", -1.0))
            segment = {
                "start": round(float(item.start), 2),
                "end": round(float(item.end), 2),
                "text": text,
                "avgLogprob": round(avg_logprob, 3),
                "needsReview": avg_logprob < -0.55,
            }
            segments.append(segment)
            transcript_parts.append(text)
            yield {
                "type": "segment",
                "segment": segment,
                "processedSeconds": segment["end"],
                "durationSeconds": round(float(info.duration), 2),
            }

            matches = find_course_matches(" ".join(transcript_parts))
            for record in matches:
                if record["muscle"] in matched_names:
                    continue
                matched_names.add(record["muscle"])
                notes = build_notes([record], segment["start"])
                cards = build_cards([record])
                seen_card_questions.update(card["front"].strip().lower() for card in cards)
                session_concepts.append({"name": record["muscle"], "status": "verified"})
                session_notes.extend(notes)
                session_cards.extend(cards)
                yield {
                    "type": "concept",
                    "concept": record["muscle"],
                    "status": "verified",
                    "section": record["section"],
                    "notes": notes,
                    "cards": cards,
                }


            for rule in find_lecture_concepts(" ".join(transcript_parts)):
                if rule["id"] in matched_lecture_ids:
                    continue
                matched_lecture_ids.add(rule["id"])
                notes, cards = build_lecture_items(rule, segment["start"])
                seen_card_questions.update(card["front"].strip().lower() for card in cards)
                session_concepts.append({"name": rule["title"], "status": "provisional"})
                session_notes.extend(notes)
                session_cards.extend(cards)
                yield {
                    "type": "concept",
                    "concept": rule["title"],
                    "status": "provisional",
                    "section": "Medical Physiology",
                    "notes": notes,
                    "cards": cards,
                }

            generic_buffer.append(segment)
            buffered_words = sum(len(item["text"].split()) for item in generic_buffer)
            if len(generic_buffer) >= 5 or buffered_words >= 110:
                generic_window_number += 1
                compiled = compile_lecture_window(
                    " ".join(item["text"] for item in generic_buffer),
                    filename,
                    generic_buffer[0]["start"],
                    generic_window_number,
                )
                cards = [
                    card for card in compiled["cards"]
                    if card["front"].strip().lower() not in seen_card_questions
                ]
                if compiled["notes"]:
                    seen_card_questions.update(card["front"].strip().lower() for card in cards)
                    session_concepts.extend(compiled["concepts"])
                    session_notes.extend(compiled["notes"])
                    session_cards.extend(cards)
                    yield {
                        "type": "concept",
                        "concept": compiled["concepts"][0]["name"],
                        "status": "provisional",
                        "section": "Lecture notes",
                        "notes": compiled["notes"],
                        "cards": cards,
                    }
                generic_buffer = []

    transcript = " ".join(transcript_parts)
    if generic_buffer:
        generic_window_number += 1
        compiled = compile_lecture_window(
            " ".join(item["text"] for item in generic_buffer),
            filename,
            generic_buffer[0]["start"],
            generic_window_number,
        )
        cards = [
            card for card in compiled["cards"]
            if card["front"].strip().lower() not in seen_card_questions
        ]
        if compiled["notes"]:
            session_concepts.extend(compiled["concepts"])
            session_notes.extend(compiled["notes"])
            session_cards.extend(cards)
            yield {
                "type": "concept",
                "concept": compiled["concepts"][0]["name"],
                "status": "provisional",
                "section": "Lecture notes",
                "notes": compiled["notes"],
                "cards": cards,
            }
    warnings = find_terminology_warnings(segments)
    completed_at = datetime.now(timezone.utc).isoformat()
    session_id = persist_session(
        {
            "filename": filename,
            "durationSeconds": round(float(info.duration), 2),
            "processingSeconds": round(time.perf_counter() - started, 2),
            "completedAt": completed_at,
            "transcript": transcript,
            "segments": segments,
            "concepts": session_concepts,
            "notes": session_notes,
            "cards": session_cards,
            "qualityWarnings": warnings,
            "markers": markers,
            "sourceMatch": "matched" if matched_names else "review-only",
        }
    )
    yield {
        "type": "complete",
        "sessionId": session_id,
        "savedAt": completed_at,
        "durationSeconds": round(float(info.duration), 2),
        "processingSeconds": round(time.perf_counter() - started, 2),
        "transcript": transcript,
        "qualityWarnings": warnings,
        "reviewSegmentCount": sum(1 for segment in segments if segment["needsReview"]),
    }


class SyllabloomHandler(SimpleHTTPRequestHandler):
    server_version = "SyllabloomLocal/0.1"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def send_json(self, payload: dict, status: HTTPStatus = HTTPStatus.OK) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def send_bytes(self, payload: bytes, content_type: str, filename: str) -> None:
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Disposition", f'attachment; filename="{filename}"')
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(payload)

    def send_event_stream(self, events) -> None:
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "application/x-ndjson; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Connection", "close")
        self.end_headers()
        for event in events:
            line = (json.dumps(event, ensure_ascii=False) + "\n").encode("utf-8")
            self.wfile.write(line)
            self.wfile.flush()

    def do_GET(self) -> None:
        request_path = urlparse(self.path).path
        if request_path == "/api/health":
            self.send_json(
                {
                    "ok": True,
                    "engine": "faster-whisper",
                    "modelPresent": MODEL_PATH.is_dir(),
                    "mode": "local",
                }
            )
            return
        if request_path == "/api/auth-config":
            publishable_key = (
                os.environ.get("CLERK_PUBLISHABLE_KEY")
                or os.environ.get("VITE_CLERK_PUBLISHABLE_KEY")
                or os.environ.get("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY")
                or ""
            ).strip()
            self.send_json(
                {
                    "configured": publishable_key.startswith("pk_"),
                    "publishableKey": publishable_key,
                }
            )
            return
        if request_path == "/api/sources":
            self.send_json({"sources": read_source_library()})
            return
        if request_path == "/api/sessions/latest":
            latest = DATA_DIR / "latest-session.json"
            if not latest.exists():
                self.send_json({"session": None})
                return
            try:
                self.send_json({"session": json.loads(latest.read_text(encoding="utf-8"))})
            except (OSError, json.JSONDecodeError):
                self.send_json({"session": None})
            return
        super().do_GET()

    def do_POST(self) -> None:
        request_path = urlparse(self.path).path
        if request_path == "/api/export-anki":
            self.handle_anki_export()
            return
        if request_path == "/api/source":
            self.handle_source_upload()
            return
        if request_path not in {"/api/transcribe", "/api/transcribe-stream"}:
            self.send_json({"error": "Not found"}, HTTPStatus.NOT_FOUND)
            return

        try:
            content_length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            content_length = 0
        if content_length <= 0 or content_length > MAX_UPLOAD_BYTES:
            self.send_json({"error": "Lecture files must be between 1 byte and 1 GB."}, HTTPStatus.BAD_REQUEST)
            return

        content_type = self.headers.get("Content-Type", "")
        if not content_type.startswith("multipart/form-data"):
            self.send_json({"error": "Expected multipart audio upload."}, HTTPStatus.BAD_REQUEST)
            return

        form = cgi.FieldStorage(
            fp=self.rfile,
            headers=self.headers,
            environ={"REQUEST_METHOD": "POST", "CONTENT_TYPE": content_type},
        )
        if "audio" not in form:
            self.send_json({"error": "No audio file was provided."}, HTTPStatus.BAD_REQUEST)
            return

        upload = form["audio"]
        markers = []
        if "markers" in form:
            try:
                raw_markers = json.loads(str(form.getvalue("markers") or "[]"))
                markers = [round(max(0.0, float(value)), 2) for value in raw_markers[:100]] if isinstance(raw_markers, list) else []
            except (TypeError, ValueError, json.JSONDecodeError):
                markers = []
        filename = Path(upload.filename or "recording.webm").name
        suffix = Path(filename).suffix.lower() or ".webm"
        if suffix not in ALLOWED_SUFFIXES:
            self.send_json({"error": "Unsupported audio format."}, HTTPStatus.BAD_REQUEST)
            return

        temporary_path = None
        try:
            with tempfile.NamedTemporaryFile(prefix="rounds-audio-", suffix=suffix, delete=False) as temporary:
                temporary_path = Path(temporary.name)
                while True:
                    chunk = upload.file.read(1024 * 1024)
                    if not chunk:
                        break
                    temporary.write(chunk)
            media = inspect_media(temporary_path)
            if request_path == "/api/transcribe-stream":
                self.send_event_stream(transcribe_events(temporary_path, filename, markers))
            else:
                result = transcribe(temporary_path)
                result["filename"] = filename
                result["media"] = media
                self.send_json(result)
        except NoAudioTrackError as exc:
            self.send_json({"error": str(exc), "code": "NO_AUDIO_TRACK"}, HTTPStatus.UNPROCESSABLE_ENTITY)
        except Exception as exc:  # keep native model errors out of the browser
            print(f"Transcription failed: {type(exc).__name__}: {exc}", flush=True)
            self.send_json(
                {"error": "Local transcription failed. Check the audio format and model readiness."},
                HTTPStatus.INTERNAL_SERVER_ERROR,
            )
        finally:
            if temporary_path is not None:
                temporary_path.unlink(missing_ok=True)

    def handle_anki_export(self) -> None:
        try:
            content_length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            content_length = 0
        if content_length <= 0 or content_length > 5 * 1024 * 1024:
            self.send_json({"error": "Card export payload is missing or too large."}, HTTPStatus.BAD_REQUEST)
            return
        try:
            payload = json.loads(self.rfile.read(content_length).decode("utf-8"))
            cards = payload.get("cards") or []
            if not isinstance(cards, list) or not cards:
                raise ValueError("Approve at least one card before exporting.")
            package, filename = build_anki_package(cards, payload.get("preferences") or {})
            self.send_bytes(package, "application/octet-stream", filename)
        except (json.JSONDecodeError, UnicodeDecodeError, ValueError) as exc:
            self.send_json({"error": str(exc)}, HTTPStatus.BAD_REQUEST)
        except Exception as exc:
            print(f"Anki export failed: {type(exc).__name__}: {exc}", flush=True)
            self.send_json({"error": "Anki package export failed locally."}, HTTPStatus.INTERNAL_SERVER_ERROR)

    def handle_source_upload(self) -> None:
        try:
            content_length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            content_length = 0
        if content_length <= 0 or content_length > 100 * 1024 * 1024:
            self.send_json({"error": "Source files must be between 1 byte and 100 MB."}, HTTPStatus.BAD_REQUEST)
            return
        content_type = self.headers.get("Content-Type", "")
        if not content_type.startswith("multipart/form-data"):
            self.send_json({"error": "Expected a document upload."}, HTTPStatus.BAD_REQUEST)
            return
        form = cgi.FieldStorage(
            fp=self.rfile,
            headers=self.headers,
            environ={"REQUEST_METHOD": "POST", "CONTENT_TYPE": content_type},
        )
        if "source" not in form:
            self.send_json({"error": "No source document was provided."}, HTTPStatus.BAD_REQUEST)
            return
        upload = form["source"]
        filename = Path(upload.filename or "source.txt").name
        suffix = Path(filename).suffix.lower()
        if suffix not in SOURCE_SUFFIXES:
            self.send_json({"error": "Use a DOCX, PPTX, PDF, or TXT source."}, HTTPStatus.BAD_REQUEST)
            return
        kind_value = form.getfirst("kind", "material")
        temporary_path = None
        try:
            with tempfile.NamedTemporaryFile(prefix="rounds-source-", suffix=suffix, delete=False) as temporary:
                temporary_path = Path(temporary.name)
                while True:
                    chunk = upload.file.read(1024 * 1024)
                    if not chunk:
                        break
                    temporary.write(chunk)
            summary = source_summary(temporary_path, filename, kind_value)
            with _data_lock:
                library = [item for item in read_source_library() if item.get("id") != summary["id"]]
                library.append(summary)
                write_json(SOURCE_LIBRARY_PATH, library)
            self.send_json({"source": summary})
        except Exception as exc:
            print(f"Source import failed: {type(exc).__name__}: {exc}", flush=True)
            self.send_json({"error": "The source could not be read locally."}, HTTPStatus.UNPROCESSABLE_ENTITY)
        finally:
            if temporary_path is not None:
                temporary_path.unlink(missing_ok=True)


if __name__ == "__main__":
    host = os.environ.get("SYLLABLOOM_HOST", os.environ.get("ROUNDS_HOST", "127.0.0.1"))
    port = int(os.environ.get("SYLLABLOOM_PORT", os.environ.get("ROUNDS_PORT", "4174")))
    print(f"Syllabloom listening on http://{host}:{port}", flush=True)
    ThreadingHTTPServer((host, port), SyllabloomHandler).serve_forever()
