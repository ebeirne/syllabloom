from pathlib import Path
import struct
import zipfile

import pytest

from api.legacy_powerpoint import Reader, PowerPointReadError, extract_legacy_powerpoint
from api.source import _source_preflight, _source_path
from server import extract_source_text

FIXTURES = Path(__file__).parent / 'fixtures' / 'legacy-ppt'


def test_real_binary_ppt_preserves_slides_and_speaker_notes():
    text, units = extract_source_text(FIXTURES / 'basic.ppt', '.ppt')
    assert units == {'unitLabel': 'slides', 'unitCount': 2, 'speakerNotesCount': 2}
    assert 'This is a test title' in text
    assert text.index('These are the notes for page 1') < text.index('Slide 2')
    assert 'These are the notes on page two' in text
    assert text.count('This is a test title') == 1


def test_textboxes_and_presentation_order_are_read_from_live_records():
    text, units = extract_legacy_powerpoint(FIXTURES / 'with_textbox.ppt')
    assert units['unitCount'] == 1
    assert 'Hello, World!!!' in text and 'This is Times New Roman' in text
    text, units = extract_legacy_powerpoint(FIXTURES / 'incorrect_slide_order.ppt')
    assert units['unitCount'] == 3
    assert text.index('First slide I added') < text.index('Third slide I added') < text.index('Second slide I added')


@pytest.mark.parametrize('filename,message', [
    ('ppt_with_png_encrypted.ppt', 'password-protected'),
    ('57272_corrupted_usereditatom.ppt', 'damaged revision history'),
])
def test_protected_or_cyclic_files_fail_with_specific_errors(filename, message):
    with pytest.raises(PowerPointReadError, match=message):
        extract_legacy_powerpoint(FIXTURES / filename)


@pytest.mark.parametrize('extension', ['.ppt', '.pptw'])
def test_preflight_and_large_upload_paths_accept_legacy_decks(extension):
    result = _source_preflight(FIXTURES / 'basic.ppt', 'lecture' + extension, 'material')
    assert result['source']['preflight']['unitCount'] == 2
    assert result['source']['preflight']['unitsWithText'] == 2
    assert result['source']['preflight']['requiresCards']
    path = 'source-uploads/user_test/12345678-abcd-1234-abcd-123456789abc' + extension
    assert _source_path(path, 'user_test') == path


def test_pptw_with_modern_pptx_contents_is_detected_without_renaming(tmp_path):
    path = tmp_path / 'lecture.pptw'
    with zipfile.ZipFile(path, 'w') as package:
        package.writestr('ppt/presentation.xml', '<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst><p:sldId id="256" r:id="r1"/></p:sldIdLst></p:presentation>')
        package.writestr('ppt/_rels/presentation.xml.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="r1" Target="slides/slide1.xml"/></Relationships>')
        package.writestr('ppt/slides/slide1.xml', '<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:p><a:r><a:t>Modern lecture contents</a:t></a:r></a:p></p:sld>')
    text, units = extract_source_text(path, '.pptw')
    assert 'Modern lecture contents' in text and units['unitCount'] == 1


def record(kind, body=b'', flags=0):
    return struct.pack('<HHI', flags, kind, len(body)) + body


def test_latest_revision_wins_and_deleted_slide_text_does_not_leak():
    data = bytearray(b'\0' * 8)
    def add(value):
        offset = len(data)
        data.extend(value)
        return offset
    def slide(text):
        return record(1006, record(4000, text.encode('utf-16-le')), 15)
    old = add(slide('Old incorrect text'))
    deleted = add(slide('Deleted private text'))
    new = add(slide('Corrected Ω text'))
    refs = record(1011, struct.pack('<5I', 2, 0, 0, 256, 0))
    document = add(record(1000, record(4080, refs, 15), 15))
    old_directory = add(record(6002, struct.pack('<4I', (3 << 20) | 1, document, old, deleted)))
    old_edit = add(record(4085, struct.pack('<7I', 0, 0, 0, old_directory, 1, 4, 0)))
    new_directory = add(record(6002, struct.pack('<2I', (1 << 20) | 2, new)))
    new_edit = add(record(4085, struct.pack('<7I', 0, 0, old_edit, new_directory, 1, 4, 0)))
    current = record(4086, struct.pack('<3I', 20, 0xE391C05F, new_edit))
    text, units = Reader(bytes(data)).extract(current)
    assert text == 'Slide 1\nCorrected Ω text'
    assert units['unitCount'] == 1


def test_truncated_record_fails_before_text_extraction():
    with pytest.raises(PowerPointReadError):
        Reader(struct.pack('<HHI', 15, 1000, 1000)).record(0)
