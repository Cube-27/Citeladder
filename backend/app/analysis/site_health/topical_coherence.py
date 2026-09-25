"""Bounded deterministic TF-IDF clustering over persisted page text."""

from __future__ import annotations

import math
import uuid
from collections import Counter
from dataclasses import dataclass

from app.analysis.lexical import lexical_token_sequence
from app.core.config.site_health_topical import (
    TOPICAL_CLUSTER_TOP_TERMS,
    TOPICAL_FORMULA_VERSION,
    TOPICAL_MAX_CLUSTERS,
    TOPICAL_MAX_FEATURES,
    TOPICAL_MAX_ITERATIONS,
    TOPICAL_MAX_OUTLIERS,
    TOPICAL_MAX_PAGES,
    TOPICAL_MIN_CORPUS_PAGES,
    TOPICAL_MIN_PAGE_TERMS,
    TOPICAL_OUTLIER_THRESHOLD,
)


@dataclass(frozen=True, slots=True)
class TopicalPage:
    site_url_id: uuid.UUID
    url: str
    indexable: bool | None
    text: str


def _normalize(vector: dict[str, float]) -> dict[str, float]:
    magnitude = math.sqrt(sum(value * value for value in vector.values()))
    if magnitude == 0:
        return {}
    return {term: value / magnitude for term, value in vector.items()}


def _similarity(left: dict[str, float], right: dict[str, float]) -> float:
    if len(left) > len(right):
        left, right = right, left
    return sum(value * right.get(term, 0.0) for term, value in left.items())


def _vectors(token_rows: list[list[str]]) -> list[dict[str, float]]:
    document_frequency = Counter(term for row in token_rows for term in set(row))
    vocabulary = {
        term
        for term, _count in sorted(
            document_frequency.items(), key=lambda item: (-item[1], item[0])
        )[:TOPICAL_MAX_FEATURES]
    }
    document_count = len(token_rows)
    result: list[dict[str, float]] = []
    for row in token_rows:
        counts = Counter(term for term in row if term in vocabulary)
        maximum = max(counts.values(), default=1)
        result.append(
            _normalize(
                {
                    term: (count / maximum)
                    * (
                        math.log((1 + document_count) / (1 + document_frequency[term]))
                        + 1
                    )
                    for term, count in counts.items()
                }
            )
        )
    return result


def _cluster_count(page_count: int) -> int:
    return min(
        TOPICAL_MAX_CLUSTERS, page_count, max(2, round(math.sqrt(page_count / 2)))
    )


def _initial_centroids(
    vectors: list[dict[str, float]], count: int
) -> list[dict[str, float]]:
    selected = [0]
    while len(selected) < count:
        candidate = max(
            (index for index in range(len(vectors)) if index not in selected),
            key=lambda index: (
                min(
                    1.0 - _similarity(vectors[index], vectors[item])
                    for item in selected
                ),
                -index,
            ),
        )
        selected.append(candidate)
    return [vectors[index] for index in selected]


def _assign(
    vectors: list[dict[str, float]], centroids: list[dict[str, float]]
) -> list[int]:
    return [
        max(
            range(len(centroids)),
            key=lambda index: (_similarity(vector, centroids[index]), -index),
        )
        for vector in vectors
    ]


def _recenter(
    vectors: list[dict[str, float]], assignments: list[int], count: int
) -> list[dict[str, float]]:
    centroids: list[dict[str, float]] = []
    for cluster in range(count):
        members = [
            vectors[index]
            for index, value in enumerate(assignments)
            if value == cluster
        ]
        if not members:
            centroids.append({})
            continue
        sums: Counter[str] = Counter()
        for member in members:
            sums.update(member)
        centroids.append(
            _normalize({term: value / len(members) for term, value in sums.items()})
        )
    return centroids


def _eligibility(
    page: TopicalPage,
) -> tuple[list[str] | None, dict[str, object] | None]:
    if page.indexable is False:
        return None, {"state": "ineligible", "reason": "non_indexable"}
    if page.indexable is None:
        return None, {"state": "unknown", "reason": "indexability_unknown"}
    tokens = list(lexical_token_sequence(page.text, min_length=2))
    if len(tokens) < TOPICAL_MIN_PAGE_TERMS:
        return None, {"state": "unknown", "reason": "insufficient_ascii_text"}
    return tokens, None


def _eligible_corpus(
    ordered: list[TopicalPage],
) -> tuple[dict[uuid.UUID, dict[str, object]], list[TopicalPage], list[list[str]]]:
    assignments: dict[uuid.UUID, dict[str, object]] = {}
    eligible_pages: list[TopicalPage] = []
    token_rows: list[list[str]] = []
    for page in ordered:
        tokens, state = _eligibility(page)
        if tokens is None:
            assignments[page.site_url_id] = state or {}
            continue
        if len(eligible_pages) >= TOPICAL_MAX_PAGES:
            assignments[page.site_url_id] = {
                "state": "ineligible",
                "reason": "computation_limit",
            }
            continue
        eligible_pages.append(page)
        token_rows.append(tokens)
    return assignments, eligible_pages, token_rows


def _assignment_rows(
    ordered: list[TopicalPage],
    assignments: dict[uuid.UUID, dict[str, object]],
) -> list[dict[str, object]]:
    return [
        {
            "site_url_id": str(page.site_url_id),
            "url": page.url,
            **assignments[page.site_url_id],
        }
        for page in ordered
    ]


def _unavailable_topical_report(
    ordered: list[TopicalPage],
    eligible_pages: list[TopicalPage],
    assignments: dict[uuid.UUID, dict[str, object]],
) -> dict[str, object]:
    for page in eligible_pages:
        assignments[page.site_url_id] = {
            "state": "unknown",
            "reason": "corpus_too_small",
        }
    return {
        "state": "unavailable",
        "formula_version": TOPICAL_FORMULA_VERSION,
        "eligible_page_count": len(eligible_pages),
        "total_page_count": len(ordered),
        "clusters": [],
        "assignments": _assignment_rows(ordered, assignments),
        "outliers": [],
        "limitations": [
            (
                f"At least {TOPICAL_MIN_CORPUS_PAGES} indexable pages with "
                "sufficient ASCII text are required."
            )
        ],
    }


def _fit_clusters(
    vectors: list[dict[str, float]],
) -> tuple[list[dict[str, float]], list[int]]:
    count = _cluster_count(len(vectors))
    centroids = _initial_centroids(vectors, count)
    assignments = _assign(vectors, centroids)
    for _ in range(TOPICAL_MAX_ITERATIONS):
        centroids = _recenter(vectors, assignments, count)
        current = _assign(vectors, centroids)
        if current == assignments:
            return centroids, assignments
        assignments = current
    return _recenter(vectors, assignments, count), assignments


def _cluster_rows(
    centroids: list[dict[str, float]], assignments: list[int]
) -> list[dict[str, object]]:
    return [
        {
            "cluster_id": f"cluster-{index + 1}",
            "page_count": assignments.count(index),
            "top_terms": [
                term
                for term, _value in sorted(
                    centroid.items(), key=lambda item: (-item[1], item[0])
                )[:TOPICAL_CLUSTER_TOP_TERMS]
            ],
        }
        for index, centroid in enumerate(centroids)
    ]


def _apply_cluster_assignments(
    pages: list[TopicalPage],
    vectors: list[dict[str, float]],
    clusters: list[int],
    centroids: list[dict[str, float]],
    assignments: dict[uuid.UUID, dict[str, object]],
) -> list[dict[str, str | float]]:
    outliers: list[dict[str, str | float]] = []
    for page, vector, cluster in zip(pages, vectors, clusters, strict=True):
        distance = round(1.0 - _similarity(vector, centroids[cluster]), 6)
        assignments[page.site_url_id] = {
            "state": "clustered",
            "reason": None,
            "cluster_id": f"cluster-{cluster + 1}",
            "lexical_outlier_score": distance,
        }
        if distance >= TOPICAL_OUTLIER_THRESHOLD:
            outliers.append(
                {
                    "site_url_id": str(page.site_url_id),
                    "url": page.url,
                    "cluster_id": f"cluster-{cluster + 1}",
                    "lexical_outlier_score": distance,
                }
            )
    outliers.sort(
        key=lambda row: (-float(row["lexical_outlier_score"]), str(row["url"]))
    )
    return outliers[:TOPICAL_MAX_OUTLIERS]


def build_topical_coherence(pages: list[TopicalPage]) -> dict[str, object]:
    """Return a crawl-local inventory; every supplied page receives a state."""
    ordered = sorted(pages, key=lambda page: (page.url, str(page.site_url_id)))
    assignments, eligible_pages, token_rows = _eligible_corpus(ordered)
    if len(eligible_pages) < TOPICAL_MIN_CORPUS_PAGES:
        return _unavailable_topical_report(ordered, eligible_pages, assignments)
    vectors = _vectors(token_rows)
    centroids, clusters = _fit_clusters(vectors)
    outliers = _apply_cluster_assignments(
        eligible_pages, vectors, clusters, centroids, assignments
    )
    return {
        "state": "available",
        "formula_version": TOPICAL_FORMULA_VERSION,
        "eligible_page_count": len(eligible_pages),
        "total_page_count": len(ordered),
        "clusters": _cluster_rows(centroids, clusters),
        "assignments": _assignment_rows(ordered, assignments),
        "outliers": outliers,
        "limitations": [
            "Crawl-local ASCII lexical clusters; identifiers are not comparable "
            "across crawls."
        ],
    }


__all__ = ["TopicalPage", "build_topical_coherence"]
