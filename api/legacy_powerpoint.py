"""Read live PowerPoint 97-2003 slides without running Office or file macros.

MS-PPT 2.1.2: resolve Current User -> UserEdit chain -> persist directory ->
current document slide list. Never scan all historical records for text.
"""
import struct

import olefile


class PowerPointReadError(ValueError):
    pass


def _u32(data, offset=0):
    if offset < 0 or offset + 4 > len(data):
        raise PowerPointReadError('This PowerPoint file is incomplete or damaged. Please upload another copy.')
    return struct.unpack_from('<I', data, offset)[0]


class Reader:
    def __init__(self, data):
        self.data = data
        self.visited = 0

    def record(self, offset, limit=None):
        limit = len(self.data) if limit is None else limit
        if offset < 0 or offset + 8 > limit:
            raise PowerPointReadError('This PowerPoint file has a damaged record.')
        flags, kind, size = struct.unpack_from('<HHI', self.data, offset)
        end = offset + 8 + size
        if end > limit:
            raise PowerPointReadError('This PowerPoint file is incomplete. Please upload another copy.')
        self.visited += 1
        if self.visited > 200000:
            raise PowerPointReadError('This PowerPoint file is too complex to read in one import.')
        return flags, kind, offset + 8, end

    def children(self, start, end):
        while start < end:
            record = self.record(start, end)
            yield record
            start = record[3]

    def text(self, start, end, depth=0, notes=False):
        if depth > 32:
            raise PowerPointReadError('This PowerPoint file contains too many nested shapes.')
        parts = []
        text_type = None
        for flags, kind, body, stop in self.children(start, end):
            value = self.data[body:stop]
            if kind == 3999:
                text_type = _u32(value)
            elif kind in (4000, 4008) and (not notes or text_type == 2):
                # TextBytesAtom stores Unicode characters with zero high bytes,
                # not Windows-1252. TextCharsAtom stores full UTF-16LE.
                text = value.decode('utf-16-le' if kind == 4000 else 'latin-1', errors='replace')
                text = text.replace('\r', '\n').replace('\x0b', '\n').replace('\x00', '').strip()
                if text:
                    parts.append(text)
            elif flags & 15 == 15 or kind == 0xF00D:  # OfficeArtClientTextbox
                parts.extend(self.text(body, stop, depth + 1, notes))
        return parts

    def directory(self, current_user):
        if len(current_user) < 20:
            raise PowerPointReadError('This PowerPoint file is missing its current revision.')
        if _u32(current_user, 12) == 0xF3D1C4DF:
            raise PowerPointReadError('This PowerPoint is password-protected. Upload an unlocked copy.')
        offset = _u32(current_user, 16)
        seen, objects, document_id = set(), {}, None
        while offset:
            if offset in seen or len(seen) >= 10000:
                raise PowerPointReadError('This PowerPoint file has a damaged revision history.')
            seen.add(offset)
            _, kind, start, end = self.record(offset)
            if kind != 4085 or end - start < 28:
                raise PowerPointReadError('This PowerPoint revision could not be read.')
            edit = self.data[start:end]
            if len(edit) >= 32 and _u32(edit, 28):
                raise PowerPointReadError('This PowerPoint is password-protected. Upload an unlocked copy.')
            if document_id is None:
                document_id = _u32(edit, 16)
            _, kind, begin, stop = self.record(_u32(edit, 12))
            if kind != 6002:
                raise PowerPointReadError('This PowerPoint file has a damaged object directory.')
            while begin < stop:
                if begin + 4 > stop:
                    raise PowerPointReadError('This PowerPoint file has an incomplete object directory.')
                packed = _u32(self.data, begin)
                begin += 4
                first, count = packed & 0xFFFFF, packed >> 20
                if not count or begin + count * 4 > stop:
                    raise PowerPointReadError('This PowerPoint file has an incomplete object directory.')
                for index in range(count):
                    objects.setdefault(first + index, _u32(self.data, begin + index * 4))
                begin += count * 4
            offset = _u32(edit, 8)
        if document_id not in objects:
            raise PowerPointReadError('This PowerPoint file has no readable current presentation.')
        return objects, document_id

    def extract(self, current_user):
        objects, document_id = self.directory(current_user)
        _, kind, start, end = self.record(objects[document_id])
        if kind != 1000:
            raise PowerPointReadError('This file does not contain a PowerPoint presentation.')
        slides, notes = [], {}
        for flags, kind, begin, stop in self.children(start, end):
            if kind != 4080 or flags >> 4 not in (0, 2):
                continue
            is_notes = flags >> 4 == 2
            current = None
            for _, child_kind, body, child_end in self.children(begin, stop):
                if child_kind == 1011:
                    value = self.data[body:child_end]
                    current = {'persist': _u32(value), 'id': _u32(value, 12), 'text': []}
                    if not is_notes:
                        slides.append(current)
                    elif current['persist'] in objects:
                        _, note_kind, ns, ne = self.record(objects[current['persist']])
                        if note_kind != 1008:
                            continue
                        for _, nk, nb, nz in self.children(ns, ne):
                            if nk == 1009:
                                notes[_u32(self.data[nb:nz])] = self.text(ns, ne, notes=True)
                elif current is not None and not is_notes and child_kind in (4000, 4008):
                    current['text'].extend(self.text(body - 8, child_end))
        result, notes_count = [], 0
        for number, slide in enumerate(slides, 1):
            if slide['persist'] not in objects:
                raise PowerPointReadError('A slide is missing from this PowerPoint file.')
            _, kind, begin, stop = self.record(objects[slide['persist']])
            if kind != 1006:
                raise PowerPointReadError('A slide in this PowerPoint file could not be read.')
            parts = list(dict.fromkeys(slide['text'] + self.text(begin, stop)))
            note_parts = list(dict.fromkeys(notes.get(slide['id'], [])))
            if note_parts:
                notes_count += 1
                parts.append('Speaker notes:\n' + '\n'.join(note_parts))
            if parts:
                result.append(f'Slide {number}\n' + '\n'.join(parts))
        return '\n'.join(result), {'unitLabel': 'slides', 'unitCount': len(slides), 'speakerNotesCount': notes_count}


def extract_legacy_powerpoint(path):
    try:
        with olefile.OleFileIO(path) as document:
            if not document.exists('PowerPoint Document') or not document.exists('Current User'):
                raise PowerPointReadError('This file does not contain a readable PowerPoint presentation.')
            if document.get_size('PowerPoint Document') > 100 * 1024 * 1024:
                raise PowerPointReadError('This PowerPoint file is too large to read.')
            data = document.openstream('PowerPoint Document').read()
            current_user = document.openstream('Current User').read(4096)
        return Reader(data).extract(current_user)
    except PowerPointReadError:
        raise
    except (OSError, ValueError, struct.error) as exc:
        raise PowerPointReadError('This PowerPoint file could not be read. It may be damaged or password-protected.') from exc
