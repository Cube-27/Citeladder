"""Recognising a grounding-redirect URL without fetching it.

A grounded Gemini answer cites through Google's redirector rather than the
publisher, so the citation URL is a token, not a page identity. Telling the two
apart is a pure, offline question about URL shape; resolving the token to a
publisher is a network question and belongs to the inspector.

Keeping the predicate here, below both ``analysis`` and ``domain``, means the
scorer and the inspector agree on what "this is not a publisher URL" means
instead of each deciding for itself.
"""

from __future__ import annotations

from typing import Any
from urllib.parse import urlparse

# The real shape is
# ``https://vertexaisearch.cloud.google.com/grounding-api-redirect/<token>``.
# Some payloads carry the marker as a bare host instead.
GOOGLE_REDIRECT_HOST = "vertexaisearch.cloud.google.com"
GROUNDING_REDIRECT_MARKER = "grounding-api-redirect"


def is_grounding_redirect(value: Any) -> bool:
    """True when this URL is a redirect token rather than a publisher URL.

    Matched on the PARSED host and path, never as a substring of the whole URL.
    A genuine publisher URL that merely echoes one of these markers in a query
    parameter -- ``https://pub.example/a?ref=grounding-api-redirect`` -- is a
    real page and must keep its own identity.
    """
    raw = str(value or "").strip()
    if not raw:
        return False
    try:
        parts = urlparse(raw)
        host = (parts.hostname or "").lower().rstrip(".")
    except ValueError:
        return False
    if host == GOOGLE_REDIRECT_HOST or host.endswith(f".{GOOGLE_REDIRECT_HOST}"):
        return True
    if host == GROUNDING_REDIRECT_MARKER:
        return True
    # Only when there is no host at all. The real redirect always carries the
    # Google host matched above, so reading the marker out of any path would
    # only ever misclassify a publisher writing about grounding redirects --
    # and that page would silently lose its identity.
    return not host and GROUNDING_REDIRECT_MARKER in parts.path.lower()
