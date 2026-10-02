"""Readable source sections retained for coverage inspection and targeted drafts."""
import re


def study_sections(text, units):
    pages = units.get('pageTexts')
    if isinstance(pages, list):
        sections = [(f'Page {i + 1}', str(value or '')) for i, value in enumerate(pages)]
    else:
        matches = list(re.finditer(r'(?m)^Slide\s+(\d+)\s*$', text))
        if matches:
            sections = [(f'Slide {m.group(1)}', text[m.end():matches[i+1].start() if i+1 < len(matches) else len(text)]) for i, m in enumerate(matches)]
            present = {label for label, _ in sections}
            sections.extend((f'Slide {i}', '') for i in range(1, min(int(units.get('unitCount') or 0), 10000) + 1) if f'Slide {i}' not in present)
            sections.sort(key=lambda value: int(value[0].split()[-1]))
        else:
            # Keep section boundaries small enough for an explicit targeted request.
            sections = [(f'Section {i//6000 + 1}', text[i:i+6000]) for i in range(0, len(text), 6000)]
    image_gaps = set(units.get('slidesWithUnlabeledImages') or [])
    return [{'label': label, 'title': next((line.strip()[:100] for line in value.splitlines() if line.strip()), 'No readable text'),
             'text': value.strip(), 'lowText': len(re.findall(r'\w+', value)) < 15,
             'imageWarning': label.startswith('Slide ') and int(label.split()[-1]) in image_gaps}
            for label, value in sections]
