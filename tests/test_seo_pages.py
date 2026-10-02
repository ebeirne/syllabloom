from __future__ import annotations

import json
import re
import unittest
import xml.etree.ElementTree as ET
from html.parser import HTMLParser
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PRODUCTION_ORIGIN = "https://syllabloom-beta.vercel.app"
GUIDES = {
    "make-anki-cards-from-lecture-slides.html": (
        "Make Anki Cards from Lecture Slides",
        "source-linked",
        "Anki",
    ),
    "turn-syllabus-into-study-calendar.html": (
        "Turn a Syllabus into a Study Calendar",
        "campus schedules vary",
        "calendar",
    ),
    "syllabloom-vs-ai-flashcard-tools.html": (
        "Syllabloom vs. AI Flashcard Tools",
        "not a benchmark",
        "one-class",
    ),
}


class LocalReferenceParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.references: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = dict(attrs)
        for name in ("href", "src"):
            value = values.get(name)
            if value and value.startswith("/") and not value.startswith("//"):
                self.references.append(value.split("?", 1)[0].split("#", 1)[0])


class SeoPageTests(unittest.TestCase):
    def test_landing_page_has_share_metadata_and_truthful_application_schema(self) -> None:
        page = (ROOT / "index.html").read_text(encoding="utf-8")
        self.assertIn(f'<link rel="canonical" href="{PRODUCTION_ORIGIN}/"', page)
        self.assertIn('property="og:title"', page)
        self.assertIn('property="og:description"', page)
        self.assertIn('property="og:image"', page)
        self.assertIn('name="twitter:card" content="summary_large_image"', page)
        self.assertIn('application/ld+json', page)

        match = re.search(
            r'<script type="application/ld\+json">\s*(.*?)\s*</script>', page, re.DOTALL
        )
        self.assertIsNotNone(match)
        schema = json.loads(match.group(1))
        self.assertEqual(schema["@type"], "WebApplication")
        self.assertFalse(schema["isAccessibleForFree"])
        self.assertEqual(schema["offers"]["price"], "12")
        self.assertNotIn("aggregateRating", schema)

    def test_sample_export_demo_opens_the_real_sample_class(self) -> None:
        page = (ROOT / "index.html").read_text(encoding="utf-8")
        app = (ROOT / "app.js").read_text(encoding="utf-8")
        demo = page.split('<div class="anki-export-demo"', 1)[1].split('<section id="made-for-class"', 1)[0]
        self.assertIn("Preview the sample card set", demo)
        self.assertIn("data-open-sample", demo)
        self.assertIn('document.querySelectorAll(\'[data-open-sample]\')', app)
        self.assertNotIn("Export 32 ready cards", page)

    def test_each_guide_is_standalone_self_canonical_and_has_substantive_content(self) -> None:
        for filename, (title, truthful_detail, subject) in GUIDES.items():
            with self.subTest(page=filename):
                page = (ROOT / filename).read_text(encoding="utf-8")
                canonical = f'{PRODUCTION_ORIGIN}/{filename}'
                self.assertIn('<html lang="en">', page)
                self.assertIn(f"<title>{title} | Syllabloom</title>", page)
                self.assertIn(f'<link rel="canonical" href="{canonical}"', page)
                self.assertIn('property="og:title"', page)
                self.assertIn('name="twitter:card"', page)
                self.assertIn('id="main"', page)
                self.assertIn(subject.lower(), page.lower())
                self.assertIn(truthful_detail.lower(), page.lower())
                self.assertGreater(len(re.findall(r"<section>", page)), 3)
                self.assertIn("/terms.html", page)
                self.assertIn("/privacy.html", page)
                self.assertIn('href="/"', page)

    def test_guides_keep_review_quality_and_beta_limits_explicit(self) -> None:
        slides = (ROOT / "make-anki-cards-from-lecture-slides.html").read_text(encoding="utf-8")
        calendar = (ROOT / "turn-syllabus-into-study-calendar.html").read_text(encoding="utf-8")
        comparison = (ROOT / "syllabloom-vs-ai-flashcard-tools.html").read_text(encoding="utf-8")
        self.assertIn("not a guarantee", slides)
        self.assertIn("not enabled yet", slides)
        self.assertIn("not saved as a hosted document", calendar)
        self.assertIn("campus schedules vary", calendar)
        self.assertIn("not a benchmark", comparison)
        self.assertIn("should review, correct, or remove cards", comparison)
        self.assertIn("$108 billed annually", comparison)

    def test_robots_and_sitemap_only_advertise_intended_public_pages(self) -> None:
        robots = (ROOT / "robots.txt").read_text(encoding="utf-8")
        self.assertIn("Allow: /", robots)
        self.assertIn("Disallow: /api/", robots)
        self.assertIn(f"Sitemap: {PRODUCTION_ORIGIN}/sitemap.xml", robots)

        sitemap = ET.parse(ROOT / "sitemap.xml").getroot()
        namespace = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}
        locations = {
            element.text
            for element in sitemap.findall("sm:url/sm:loc", namespace)
        }
        expected = {f"{PRODUCTION_ORIGIN}/"}
        expected.update(f"{PRODUCTION_ORIGIN}/{filename}" for filename in GUIDES)
        self.assertEqual(locations, expected)
        self.assertFalse(any("/api/" in location for location in locations))

    def test_landing_and_guides_have_no_broken_internal_links_or_assets(self) -> None:
        for filename in ("index.html", *GUIDES):
            with self.subTest(page=filename):
                parser = LocalReferenceParser()
                parser.feed((ROOT / filename).read_text(encoding="utf-8"))
                broken = [
                    reference
                    for reference in parser.references
                    if not (ROOT / (reference.lstrip("/") or "index.html")).is_file()
                ]
                self.assertEqual(broken, [])


if __name__ == "__main__":
    unittest.main()
