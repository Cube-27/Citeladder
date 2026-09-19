from __future__ import annotations

import uuid

import app.analysis.site_health.topical_coherence as topical
from app.analysis.site_health.topical_coherence import (
    TopicalPage,
    build_topical_coherence,
)


def _page(
    value: int, prefix: str, *, indexable: bool | None = True, terms: int = 24
) -> TopicalPage:
    return TopicalPage(
        site_url_id=uuid.UUID(int=value),
        url=f"https://example.test/{value}",
        indexable=indexable,
        text=" ".join(f"{prefix}{index}" for index in range(terms)),
    )


def test_topical_coherence_is_deterministic_and_accounts_for_every_page() -> None:
    pages = [
        _page(1, "analytics"),
        _page(2, "analytics"),
        _page(3, "analytics"),
        _page(4, "commerce"),
        _page(5, "commerce"),
        _page(6, "ignored", indexable=False),
        _page(7, "unknown", indexable=None),
        _page(8, "thin", terms=2),
    ]

    expected = build_topical_coherence(pages)
    actual = build_topical_coherence(list(reversed(pages)))

    assert actual == expected
    assert actual["state"] == "available"
    assert actual["eligible_page_count"] == 5
    assert sum(cluster["page_count"] for cluster in actual["clusters"]) == 5
    assignments = {item["site_url_id"]: item for item in actual["assignments"]}
    assert len(assignments) == len(pages)
    assert assignments[str(uuid.UUID(int=6))]["state"] == "ineligible"
    assert assignments[str(uuid.UUID(int=7))]["state"] == "unknown"
    assert assignments[str(uuid.UUID(int=8))]["reason"] == "insufficient_ascii_text"


def test_small_eligible_corpus_is_unavailable_not_approximately_clustered() -> None:
    pages = [_page(index, "topic") for index in range(1, 5)]

    result = build_topical_coherence(pages)

    assert result["state"] == "unavailable"
    assert result["clusters"] == []
    assert {item["reason"] for item in result["assignments"]} == {"corpus_too_small"}


def test_page_limit_counts_only_eligible_pages(monkeypatch) -> None:
    monkeypatch.setattr(topical, "TOPICAL_MAX_PAGES", 5)
    pages = [
        _page(1, "ignored", indexable=False),
        _page(2, "unknown", indexable=None),
        *[_page(index, "topic") for index in range(3, 9)],
    ]

    result = build_topical_coherence(pages)
    assignments = {item["site_url_id"]: item for item in result["assignments"]}

    assert result["eligible_page_count"] == 5
    assert assignments[str(uuid.UUID(int=1))]["reason"] == "non_indexable"
    assert assignments[str(uuid.UUID(int=2))]["reason"] == "indexability_unknown"
    assert assignments[str(uuid.UUID(int=8))]["reason"] == "computation_limit"


def test_exhausted_clustering_recenters_final_assignments(monkeypatch) -> None:
    vectors = topical._vectors(
        [
            ["alpha", "alpha", "shared"],
            ["alpha", "shared", "bridge"],
            ["omega", "omega", "shared"],
            ["omega", "shared", "bridge"],
            ["middle", "shared", "bridge"],
        ]
    )
    monkeypatch.setattr(topical, "TOPICAL_MAX_ITERATIONS", 0)

    centroids, assignments = topical._fit_clusters(vectors)

    assert centroids == topical._recenter(
        vectors, assignments, topical._cluster_count(len(vectors))
    )
