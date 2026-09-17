"""Citations carry a page identity, established without leaving the process.

Analysis runs inside audit scoring. If establishing a citation's identity meant
following a redirect, an audit's evidence would depend on a third party being
reachable at that moment.
"""

from __future__ import annotations

from app.core.config.source_pages import (
    URL_IDENTITY_UNRESOLVED,
    URL_IDENTITY_VERBATIM,
)
from app.domain.source_pages.identity import identify_citation_url

_GEMINI_TOKEN = (
    "https://vertexaisearch.cloud.google.com/grounding-api-redirect/AbCdEfGh"
)


def _citation_identity(citation: dict) -> object:
    """Mirror of what ``analysis.service`` passes to the resolver."""
    return identify_citation_url(citation.get("resolved_url") or citation.get("url"))


def test_a_direct_provider_citation_is_identified_verbatim() -> None:
    identity = _citation_identity(
        {"url": "https://techreview.com/best-crm", "title": "techreview.com"}
    )

    assert identity.method == URL_IDENTITY_VERBATIM
    assert identity.url_hash is not None


def test_a_gemini_citation_is_recorded_as_unresolved_with_no_hash() -> None:
    """The token is not a page, so it must not be hashed as one."""
    identity = _citation_identity({"url": _GEMINI_TOKEN, "title": "techreview.com"})

    assert identity.method == URL_IDENTITY_UNRESOLVED
    assert identity.url_hash is None
    assert identity.canonical_url is None


def test_a_provider_supplied_resolved_url_wins_over_the_redirect() -> None:
    """Where a provider already resolved the hop, no later fetch is needed."""
    identity = _citation_identity(
        {"url": _GEMINI_TOKEN, "resolved_url": "https://techreview.com/best-crm"}
    )

    assert identity.method == URL_IDENTITY_VERBATIM
    assert identity.registrable_domain == "techreview.com"


def test_one_page_cited_in_several_answers_shares_one_identity() -> None:
    """Recurrence is only measurable if the same page hashes the same way."""
    first = _citation_identity({"url": "https://techreview.com/best-crm?utm_source=ai"})
    second = _citation_identity({"url": "https://techreview.com/best-crm"})

    assert first.url_hash == second.url_hash
