"""Maps /api/<name> requests to the handler classes in this package.

One Python process serves every endpoint, so there is no per-file routing.
"""
from __future__ import annotations

import importlib

ROUTES = {
    "study-sheets": "api.study-sheets",
    "ai-usage-cleanup": "api.ai-usage-cleanup",
    "auth-config": "api.auth-config",
    "export-anki": "api.export-anki",
    "health": "api.health",
    "lecture-jobs": "api.lecture-jobs",
    "lecture-upload": "api.lecture-upload",
    "lecture-upload-url": "api.lecture-upload-url",
    "session-latest": "api.session-latest",
    "source": "api.source",
    "source-upload": "api.source-upload",
    "source-upload-cleanup": "api.source-upload-cleanup",
    "source-upload-url": "api.source-upload-url",
    "sources": "api.sources",
    "transcribe": "api.transcribe",
    "transcribe-stream": "api.transcribe-stream",
    "billing-access": "api.user-data",
    "stripe-webhook": "api.user-data",
    "product-events": "api.user-data",
    "user-data": "api.user-data",
}
ALIASES = {"sessions/latest": "session-latest"}
# Routes whose URL carries a trailing id, e.g. /api/source-upload/<uuid>.pdf
PREFIX_ROUTES = {"source-upload", "lecture-upload", "lecture-jobs", "study-sheets"}


def resolve(path: str):
    """Return the handler class for a request path, or None if there is no such endpoint."""
    if not path.startswith("/api/"):
        return None
    rest = path[len("/api/"):].strip("/")
    name = ALIASES.get(rest)
    if name is None:
        head, _, tail = rest.partition("/")
        name = head if (not tail or head in PREFIX_ROUTES) else None
    module = ROUTES.get(name or "")
    return importlib.import_module(module).handler if module else None
