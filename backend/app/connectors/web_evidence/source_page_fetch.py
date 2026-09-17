"""The request shape for fetching one third-party page.

Bounds only; no robots handling, no pacing, no persistence. Those belong to the
worker, which is where politeness has to be enforced anyway because the robots
cache and host gate live there.

The limits here are deliberately tighter than owned-site crawling. These are
publishers whose goodwill is the thing being pursued, and a page we are about
to ask for a listing is the last place to be expensive or impatient.
"""

from __future__ import annotations

from app.connectors.web_evidence.contracts import FetchRequest
from app.core.config.site_health_acquisition import FETCH_PURPOSE_ANALYZE
from app.core.config.source_pages import (
    SOURCE_PAGE_ALLOWED_CONTENT_TYPES,
    SOURCE_PAGE_MAX_DECODED_BYTES,
    SOURCE_PAGE_MAX_REDIRECTS,
    SOURCE_PAGE_MAX_WIRE_BYTES,
    SOURCE_PAGE_REQUEST_TIMEOUT_SECONDS,
)


def source_page_request(url: str) -> FetchRequest:
    """One bounded GET for an external page whose content we want to read."""
    return FetchRequest(
        url=url,
        purpose=FETCH_PURPOSE_ANALYZE,
        max_wire_bytes=SOURCE_PAGE_MAX_WIRE_BYTES,
        max_decoded_bytes=SOURCE_PAGE_MAX_DECODED_BYTES,
        timeout_seconds=SOURCE_PAGE_REQUEST_TIMEOUT_SECONDS,
        max_redirects=SOURCE_PAGE_MAX_REDIRECTS,
        allowed_content_types=frozenset(SOURCE_PAGE_ALLOWED_CONTENT_TYPES),
    )


def redirect_resolution_request(url: str) -> FetchRequest:
    """One fetch whose only purpose is learning where a token points.

    Identical bounds. The publisher is unknown until the hops are followed, so
    the request cannot be cheaper than a page fetch -- but the result is reused
    as the page inspection rather than being thrown away and refetched.
    """
    return source_page_request(url)
