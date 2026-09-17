"""What a citation URL resolves to, and what it must refuse to guess.

The costly mistake here is treating a redirect token as a page. Every token is
textually unique, so counting them as distinct pages makes one publisher look
like many and makes a genuinely recurrent source look like it was cited once.
"""

from __future__ import annotations

import pytest

from app.connectors.answer_engines.grounding_redirect import is_grounding_redirect
from app.core.config.source_pages import (
    URL_IDENTITY_UNRESOLVED,
    URL_IDENTITY_UNWRAPPED_REDIRECT,
    URL_IDENTITY_VERBATIM,
)
from app.domain.source_pages.identity import (
    identify_citation_url,
    identify_unwrapped_redirect,
)

_REDIRECT = "https://vertexaisearch.cloud.google.com/grounding-api-redirect/AbCdEf123"


def test_a_publisher_url_resolves_to_a_stable_identity() -> None:
    identity = identify_citation_url("https://publisher.com/best-crm-tools")

    assert identity.method == URL_IDENTITY_VERBATIM
    assert identity.is_resolved
    assert identity.registrable_domain == "publisher.com"
    assert len(identity.url_hash or "") == 64
    assert identity.resolved_url is None


def test_url_variants_of_one_page_share_an_identity() -> None:
    """Otherwise the same page is inspected repeatedly and counted separately."""
    plain = identify_citation_url("https://publisher.com/guide")
    noisy = identify_citation_url("https://publisher.com:443/guide#section-2?")

    assert plain.url_hash == noisy.url_hash


def test_a_redirect_token_is_unresolved_rather_than_a_page() -> None:
    identity = identify_citation_url(_REDIRECT)

    assert identity.method == URL_IDENTITY_UNRESOLVED
    assert identity.is_resolved is False
    assert identity.url_hash is None
    assert identity.canonical_url is None


def test_two_redirect_tokens_do_not_become_two_pages() -> None:
    first = identify_citation_url(f"{_REDIRECT}-one")
    second = identify_citation_url(f"{_REDIRECT}-two")

    assert (first.url_hash, second.url_hash) == (None, None)


def test_a_publisher_url_echoing_the_marker_keeps_its_own_identity() -> None:
    """The marker in a query parameter is not a redirect; the page is real."""
    url = "https://publisher.com/a?ref=grounding-api-redirect"

    identity = identify_citation_url(url)

    assert is_grounding_redirect(url) is False
    assert identity.method == URL_IDENTITY_VERBATIM
    assert identity.registrable_domain == "publisher.com"


def test_following_a_redirect_yields_the_publisher_identity() -> None:
    identity = identify_unwrapped_redirect("https://publisher.com/best-crm-tools")

    assert identity.method == URL_IDENTITY_UNWRAPPED_REDIRECT
    assert identity.registrable_domain == "publisher.com"
    assert identity.resolved_url == "https://publisher.com/best-crm-tools"
    assert (
        identity.url_hash
        == identify_citation_url("https://publisher.com/best-crm-tools").url_hash
    )


def test_a_redirect_landing_on_another_redirect_stays_unresolved() -> None:
    identity = identify_unwrapped_redirect(_REDIRECT)

    assert identity.method == URL_IDENTITY_UNRESOLVED


@pytest.mark.parametrize(
    "value", ["", "   ", None, "not a url", "javascript:alert(1)", "ftp://x.example/a"]
)
def test_a_url_the_policy_refuses_is_unresolved_not_an_error(value: object) -> None:
    """One malformed citation must never fail the analysis of a whole answer."""
    identity = identify_citation_url(value)  # type: ignore[arg-type]

    assert identity.method == URL_IDENTITY_UNRESOLVED
    assert identity.url_hash is None


def test_a_publisher_writing_about_redirects_keeps_its_identity() -> None:
    """The marker in a PATH is prose, not a redirect; the page is real."""
    url = "https://blog.example.com/posts/grounding-api-redirect-explained"

    assert is_grounding_redirect(url) is False
    assert identify_citation_url(url).method == URL_IDENTITY_VERBATIM


def test_a_provider_resolved_url_is_retained_not_discarded() -> None:
    """It IS the resolution; nulling it throws away work already done."""
    identity = identify_citation_url(
        "https://publisher.com/best-crm", provider_resolved=True
    )

    assert identity.resolved_url == "https://publisher.com/best-crm"
    assert identity.method == URL_IDENTITY_VERBATIM
