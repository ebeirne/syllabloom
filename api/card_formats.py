"""Source-backed cloze statements and bounded image-occlusion export."""
import base64
import hashlib
import html
import re


def add_cloze(card):
    quote = str(card.get('sourceQuote') or '').strip()
    if not 30 <= len(quote) <= 600 or '{{' in quote:
        return card
    answer = str(card.get('back') or '').strip()
    candidates = [answer, str(card.get('concept') or card.get('section') or '')]
    words = re.findall(r'[\w-]+', answer)
    for size in (5, 4, 3, 2):
        candidates.extend(' '.join(words[i:i+size]) for i in range(len(words)-size+1))
    for candidate in candidates:
        if not 3 <= len(candidate) <= 100:
            continue
        match = re.search(r'(?<!\w)' + re.escape(candidate) + r'(?!\w)', quote, re.I)
        if not match or len(quote) - len(match.group()) < 25:
            continue
        return {**card, 'noteType': 'Cloze',
                'clozeText': quote[:match.start()] + '{{c1::' + match.group() + '}}' + quote[match.end():]}
    return card


def image_bytes(data_url):
    match = re.fullmatch(r'data:image/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)', str(data_url))
    if not match or len(match.group(2)) > 400000:
        raise ValueError('Use a smaller PNG, JPEG or WebP diagram.')
    try:
        data = base64.b64decode(match.group(2), validate=True)
    except ValueError as exc:
        raise ValueError('The diagram image is invalid.') from exc
    signatures = {'png': data.startswith(b'\x89PNG\r\n\x1a\n'), 'jpeg': data.startswith(b'\xff\xd8\xff'),
                  'webp': data.startswith(b'RIFF') and data[8:12] == b'WEBP'}
    if not signatures[match.group(1)]:
        raise ValueError('The diagram data does not match its image type.')
    name = 'syllabloom-' + hashlib.sha256(data).hexdigest()[:24] + '.' + match.group(1)
    return data, name


def occlusion_html(occlusion, image_name, reveal=False):
    masks = occlusion.get('masks')
    target = occlusion.get('target')
    if not isinstance(masks, list) or not 1 <= len(masks) <= 12 or any(not isinstance(m, dict) for m in masks) or not any(m.get('id') == target for m in masks):
        raise ValueError('The diagram masks are invalid.')
    rectangles = []
    for mask in masks:
        values = [mask.get(k) for k in ('x', 'y', 'w', 'h')]
        if any(type(v) not in (int, float) or not 0 <= v <= 100 for v in values):
            raise ValueError('Diagram masks must stay inside the image.')
        x, y, width, height = values
        if width < .5 or height < .5 or x + width > 100.01 or y + height > 100.01:
            raise ValueError('Diagram masks must stay inside the image.')
        if reveal and mask['id'] == target:
            continue
        color = '#f37783' if mask['id'] == target else '#ffe283'
        rectangles.append(f'<span style="position:absolute;left:{x}%;top:{y}%;width:{width}%;height:{height}%;background:{color};border:2px solid #213a30;box-sizing:border-box"></span>')
    return '<div style="position:relative;max-width:100%;line-height:0"><img style="width:100%;display:block" src="' + html.escape(image_name, quote=True) + '">' + ''.join(rectangles) + '</div>'
