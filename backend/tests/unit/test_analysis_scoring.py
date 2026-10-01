"""Citation classification for retained Python AIO and source inspection readers.
Native audit scoring and aggregation are covered by the TypeScript tests."""

from __future__ import annotations

import pytest

from app.analysis.scoring import (
    ScoringConfig,
    classify_citation,
)

# Inlined Best&Less identity (same shape as project_scoring_identity output).
BEST_AND_LESS_PROJECT: dict = {
    "brand_name": "Best&Less",
    "brand_aliases": ["Best & Less", "Best and Less"],
    "owned_domains": ["bestandless.com.au"],
    "unintended_domains": [
        "bestlesscomau.zendesk.com",
        "jsapps.co6tqo-bestlesss1-p1-public.model-t.cc.commerce.ondemand.com",
    ],
    "competitors": [
        {"name": "Kmart", "aliases": ["Kmart Australia"], "domains": ["kmart.com.au"]},
        {
            "name": "Target",
            "aliases": ["Target Australia"],
            "domains": ["target.com.au"],
        },
        {"name": "BIG W", "aliases": ["Big W", "BigW"], "domains": ["bigw.com.au"]},
    ],
    "country_code": "AU",
    "language_code": "en-AU",
    "benchmark_mode": "controlled_localized",
}


def _config() -> ScoringConfig:
    return ScoringConfig.from_project(BEST_AND_LESS_PROJECT)


def _citation(domain: str) -> dict:
    return {
        "domain": domain,
        "title": domain,
        "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/x",
    }


def test_resolved_url_has_domain_authority_over_title() -> None:
    classified = classify_citation(
        {
            "resolved_url": "https://www.bestandless.com.au/products/uniform",
            "redirect_url": (
                "https://vertexaisearch.cloud.google.com/grounding-api-redirect/x"
            ),
            "title": "unrelated.example",
            "domain": "unrelated.example",
        },
        _config(),
    )
    assert classified["domain"] == "bestandless.com.au"
    assert classified["is_owned"] is True


def test_direct_annotation_url_has_domain_authority_over_title() -> None:
    classified = classify_citation(
        {
            "url": "https://www.bestandless.com.au/schoolwear",
            "title": "Schoolwear",
            "domain": "schoolwear",
        },
        _config(),
    )
    assert classified["domain"] == "bestandless.com.au"
    assert classified["is_owned"] is True


@pytest.mark.parametrize(
    "url",
    [
        "https://vertexaisearch.cloud.google.com/grounding-api-redirect/x",
        # Subdomain of the redirect host.
        "https://eu.vertexaisearch.cloud.google.com/grounding-api-redirect/x",
        # Trailing-dot (fully qualified) form of the same host.
        "https://vertexaisearch.cloud.google.com./grounding-api-redirect/x",
        # The marker carried as a bare host.
        "https://grounding-api-redirect/xyz",
    ],
)
def test_google_redirect_url_never_becomes_the_citation_domain(url: str) -> None:
    """A redirect URL's own host must not be mistaken for the publisher."""
    classified = classify_citation(
        {"url": url, "title": "runnersworld.com", "domain": "runnersworld.com"},
        _config(),
    )
    assert classified["domain"] == "runnersworld.com"


@pytest.mark.parametrize(
    "url",
    [
        # Redirect markers in the QUERY of a real publisher URL: the publisher's
        # own hostname still wins. A substring match over the whole URL would
        # discard these and fall back to the (weaker) title/domain fields.
        "https://www.bestandless.com.au/a?ref=grounding-api-redirect",
        "https://www.bestandless.com.au/a?from=vertexaisearch.cloud.google.com",
        # The redirect host as a suffix of an unrelated registrable domain.
        "https://vertexaisearch.cloud.google.com.evil.example/a",
    ],
)
def test_publisher_url_survives_redirect_markers_outside_host_and_path(
    url: str,
) -> None:
    classified = classify_citation(
        {"url": url, "title": "unrelated.example", "domain": "unrelated.example"},
        _config(),
    )
    assert classified["domain"] != "unrelated.example"


def test_classify_citation_labels() -> None:
    """Owned / unintended / competitor / third-party classification (invariant 4)."""
    config = _config()
    assert classify_citation(_citation("bestandless.com.au"), config)["is_owned"]
    assert classify_citation(_citation("bestlesscomau.zendesk.com"), config)[
        "is_unintended"
    ]
    assert (
        classify_citation(_citation("kmart.com.au"), config)["matched_competitor"]
        == "Kmart"
    )
    third = classify_citation(_citation("wikipedia.org"), config)
    assert not third["is_owned"]
    assert not third["is_unintended"]
    assert third["matched_competitor"] is None
