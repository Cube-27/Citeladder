"""Source-pattern taxonomy: deterministic classification + gap summarization."""

from __future__ import annotations

import pytest

from app.analysis.opportunities.source_patterns import (
    CitationEvidence,
    classify_source_domain,
    summarize_source_pattern,
)
from app.core.config.source_patterns import (
    ACTION_INVESTIGATE_COMPETITOR_SOURCES,
    ACTION_PURSUE_COMMUNITY_EVIDENCE,
    ACTION_PURSUE_INDEPENDENT_EVIDENCE,
    ACTION_STRENGTHEN_OWNED_ANSWER,
    MAX_TOP_CITATIONS,
    MULTIPLE_INDEPENDENT_DOMAIN_MIN,
    PATTERN_COMMUNITY_EVIDENCE,
    PATTERN_COMPETITOR_OWNED_SOURCES,
    PATTERN_INDEPENDENT_VALIDATION,
    PATTERN_MULTIPLE_INDEPENDENT_DOMAINS,
    PATTERN_VIDEO_EVIDENCE,
    SOURCE_TAXONOMY_VERSION,
)


def _citation(
    domain: str,
    *,
    owned: bool = False,
    competitor: str | None = None,
    title: str = "",
) -> CitationEvidence:
    return CitationEvidence(
        domain=domain,
        url=f"https://{domain}/page",
        title=title or domain,
        is_owned=owned,
        matched_competitor=competitor,
    )


# =========================================================================
# classify_source_domain
# =========================================================================
@pytest.mark.parametrize(
    ("domain", "expected"),
    [
        ("reddit.com", "community"),
        ("old.reddit.com", "community"),
        ("news.ycombinator.com", "community"),
        ("youtube.com", "video"),
        ("youtu.be", "video"),
        ("g2.com", "review_marketplace"),
        ("www.capterra.com", "review_marketplace"),
        ("trustpilot.com", "review_marketplace"),
        ("techcrunch.com", "editorial_third_party"),
        # Unknown domains ABSTAIN rather than being guessed into a class.
        ("some-random-blog.example", "other_third_party"),
        ("", "other_third_party"),
    ],
)
def test_classify_known_and_unknown_domains(domain: str, expected: str) -> None:
    classified = classify_source_domain(domain, is_owned=False, matched_competitor=None)
    assert classified == expected


def test_classify_is_identity_first() -> None:
    """Analyzer-resolved identity outranks the domain tables."""
    # A competitor's own YouTube channel is competitor-owned content, not a
    # neutral "video" source.
    assert (
        classify_source_domain(
            "youtube.com", is_owned=False, matched_competitor="Globex"
        )
        == "competitor_owned"
    )
    assert (
        classify_source_domain("reddit.com", is_owned=True, matched_competitor=None)
        == "brand_owned"
    )


def test_classify_accepts_full_urls() -> None:
    assert (
        classify_source_domain(
            "https://www.G2.com/products/x/reviews",
            is_owned=False,
            matched_competitor=None,
        )
        == "review_marketplace"
    )


# =========================================================================
# summarize_source_pattern
# =========================================================================
def test_summary_of_empty_citations_is_a_measured_zero() -> None:
    summary = summarize_source_pattern([])
    assert summary["distinct_domain_count"] == 0
    assert summary["class_counts"] == {}
    assert summary["observed_patterns"] == []
    assert summary["top_citations"] == []
    assert summary["recommended_action"] == ACTION_STRENGTHEN_OWNED_ANSWER
    assert summary["taxonomy_version"] == SOURCE_TAXONOMY_VERSION


def test_summary_dedupes_by_domain_across_repetitions() -> None:
    summary = summarize_source_pattern(
        [_citation("reddit.com"), _citation("old.reddit.com"), _citation("reddit.com")]
    )
    # Subdomains are distinct DOMAINS but the repeated exact domain is one.
    assert summary["distinct_domain_count"] == 2
    assert summary["class_counts"] == {"community": 2}


def test_summary_reports_competitor_owned_sources() -> None:
    summary = summarize_source_pattern(
        [
            _citation("globex.com", competitor="Globex"),
            _citation("docs.globex.com", competitor="Globex"),
            _citation("initech.com", competitor="Initech"),
        ]
    )
    assert summary["class_counts"] == {"competitor_owned": 3}
    assert PATTERN_COMPETITOR_OWNED_SOURCES in summary["observed_patterns"]
    assert summary["competitor_source_domains"] == {
        "Globex": ["docs.globex.com", "globex.com"],
        "Initech": ["initech.com"],
    }
    # Competitor-owned domains are NOT independent evidence.
    assert summary["independent_domain_count"] == 0
    assert summary["recommended_action"] == ACTION_INVESTIGATE_COMPETITOR_SOURCES


def test_summary_reports_independent_validation() -> None:
    summary = summarize_source_pattern(
        [_citation("g2.com"), _citation("techcrunch.com")]
    )
    assert PATTERN_INDEPENDENT_VALIDATION in summary["observed_patterns"]
    assert summary["independent_domain_count"] == 2
    # Two independent domains is below the corroboration threshold.
    assert PATTERN_MULTIPLE_INDEPENDENT_DOMAINS not in summary["observed_patterns"]
    assert summary["recommended_action"] == ACTION_PURSUE_INDEPENDENT_EVIDENCE


def test_summary_flags_multiple_independent_domains_at_threshold() -> None:
    citations = [
        _citation(f"independent-{index}.example")
        for index in range(MULTIPLE_INDEPENDENT_DOMAIN_MIN)
    ]
    summary = summarize_source_pattern(citations)
    assert summary["independent_domain_count"] == MULTIPLE_INDEPENDENT_DOMAIN_MIN
    assert PATTERN_MULTIPLE_INDEPENDENT_DOMAINS in summary["observed_patterns"]
    assert summary["class_counts"] == {
        "other_third_party": MULTIPLE_INDEPENDENT_DOMAIN_MIN
    }


def test_summary_reports_community_and_video_evidence() -> None:
    summary = summarize_source_pattern(
        [_citation("reddit.com"), _citation("youtube.com")]
    )
    assert PATTERN_COMMUNITY_EVIDENCE in summary["observed_patterns"]
    assert PATTERN_VIDEO_EVIDENCE in summary["observed_patterns"]
    # No review/editorial source, so this is not independent VALIDATION.
    assert PATTERN_INDEPENDENT_VALIDATION not in summary["observed_patterns"]
    assert summary["recommended_action"] == ACTION_PURSUE_COMMUNITY_EVIDENCE


def test_summary_bounds_and_orders_top_citations() -> None:
    citations = [
        *(_citation(f"blog-{index}.example") for index in range(MAX_TOP_CITATIONS)),
        _citation("globex.com", competitor="Globex"),
        _citation("g2.com"),
    ]
    summary = summarize_source_pattern(citations)
    top = summary["top_citations"]
    assert len(top) == MAX_TOP_CITATIONS
    assert summary["top_citations_truncated"] is True
    # Config render order: ownership first, then independence, then unknown.
    assert [item["source_class"] for item in top[:2]] == [
        "competitor_owned",
        "review_marketplace",
    ]
    assert top[0]["matched_competitor"] == "Globex"


def test_summary_is_deterministic_for_the_same_input() -> None:
    citations = [_citation("g2.com"), _citation("reddit.com"), _citation("youtube.com")]
    assert summarize_source_pattern(citations) == summarize_source_pattern(citations)
