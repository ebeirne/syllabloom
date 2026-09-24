import io

import pytest

import api.source as source_api


def test_large_upload_path_is_scoped_to_the_signed_in_user():
    user_id = "user_beta123"
    path = "source-uploads/user_beta123/12345678-abcd-1234-abcd-123456789abc.pdf"

    assert source_api._source_path(path, user_id) == path
    with pytest.raises(ValueError):
        source_api._source_path(path, "user_someone_else")


def test_large_upload_path_rejects_traversal_and_wrong_file_types():
    with pytest.raises(ValueError):
        source_api._source_path("source-uploads/user_beta123/../../private.pdf", "user_beta123")
    with pytest.raises(ValueError):
        source_api._source_path("source-uploads/user_beta123/12345678-abcd-1234-abcd-123456789abc.exe", "user_beta123")


def test_signed_blob_links_must_be_private_and_bound_to_the_upload_path():
    path = "source-uploads/user_beta123/12345678-abcd-1234-abcd-123456789abc.pdf"
    signed = f"https://store_abc.private.blob.vercel-storage.com/{path}?signature=temporary"

    assert source_api._private_blob_url(signed, path) == signed
    for unsafe in (
        "http://store_abc.private.blob.vercel-storage.com/" + path + "?signature=x",
        "https://example.com/" + path + "?signature=x",
        "https://store_abc.private.blob.vercel-storage.com/other.pdf?signature=x",
    ):
        with pytest.raises(ValueError):
            source_api._private_blob_url(unsafe, path)


class FakeBlobResponse:
    status = 200

    def __init__(self, data: bytes):
        self.data = io.BytesIO(data)
        self.headers = {"Content-Length": str(len(data))}

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return None

    def read(self, size: int) -> bytes:
        return self.data.read(size)


def test_large_source_download_is_streamed_and_has_a_single_document_limit(tmp_path, monkeypatch):
    monkeypatch.setattr(source_api, "MAX_SOURCE_BYTES", 8)
    monkeypatch.setattr(source_api, "urlopen", lambda *_args, **_kwargs: FakeBlobResponse(b"12345678"))
    destination = tmp_path / "source.pdf"

    source_api._download_temporary_source("https://store.private.blob.vercel-storage.com/source.pdf?sig=x", destination)

    assert destination.read_bytes() == b"12345678"
    monkeypatch.setattr(source_api, "urlopen", lambda *_args, **_kwargs: FakeBlobResponse(b"123456789"))
    with pytest.raises(ValueError, match="100 MB"):
        source_api._download_temporary_source("https://store.private.blob.vercel-storage.com/source.pdf?sig=x", destination)
