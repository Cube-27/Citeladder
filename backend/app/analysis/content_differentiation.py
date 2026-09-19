"""Deterministic comparison of one owned page with inspected organic results."""

from __future__ import annotations

from collections import Counter
from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from typing import Any

from app.core.config.content_differentiation import (
    DIFFERENTIATION_FORMULA_VERSION,
    DIFFERENTIATION_MAX_FEATURE_VALUES,
    DIFFERENTIATION_MIN_INSPECTED_PAGES,
    DIFFERENTIATION_MOST_PAGES_RATIO,
    DIFFERENTIATION_RESULT_LIMIT,
)
from app.domain.content.lexical import lexical_tokens


@dataclass(frozen=True, slots=True)
class DifferentiationPage:
    page_id: str
    headings: tuple[str, ...] = ()
    table_headers: tuple[tuple[str, ...], ...] = ()
    outbound_domains: tuple[str, ...] = ()


def _provider_items(
    payload: Mapping[str, Any] | None,
) -> tuple[Mapping[str, Any], ...]:
    if not isinstance(payload, Mapping):
        return ()
    results = payload.get("result")
    if not isinstance(results, list):
        return ()
    items: list[Mapping[str, Any]] = []
    for result in results:
        if not isinstance(result, Mapping):
            continue
        result_items = result.get("items")
        if isinstance(result_items, list):
            items.extend(item for item in result_items if isinstance(item, Mapping))
    return tuple(items)


def _organic_row(
    item: Mapping[str, Any], *, fallback_rank: int
) -> dict[str, Any] | None:
    if item.get("type") != "organic":
        return None
    url = str(item.get("url") or "").strip()
    if not url:
        return None
    return {
        "url": url,
        "title": str(item.get("title") or "")[:1000],
        "rank": int(
            item.get("rank_absolute") or item.get("rank_group") or fallback_rank
        ),
    }


def organic_results(
    payload: Mapping[str, Any] | None,
    *,
    limit: int | None = DIFFERENTIATION_RESULT_LIMIT,
) -> tuple[dict[str, Any], ...]:
    """Return ranked organic rows; callers may defer the final identity limit."""
    rows: list[dict[str, Any]] = []
    seen: set[str] = set()
    for item in _provider_items(payload):
        row = _organic_row(item, fallback_rank=len(rows) + 1)
        if row is None or row["url"] in seen:
            continue
        seen.add(row["url"])
        rows.append(row)
    rows.sort(key=lambda row: (row["rank"], row["url"]))
    return tuple(rows if limit is None else rows[: max(0, limit)])


def _heading_signals(page: DifferentiationPage) -> set[str]:
    signals: set[str] = set()
    for heading in page.headings:
        tokens = lexical_tokens(heading, min_length=2)
        if tokens:
            signals.add(" ".join(sorted(tokens)))
    return signals


def _table_signals(page: DifferentiationPage) -> set[str]:
    signals: set[str] = set()
    for headers in page.table_headers:
        tokens = lexical_tokens(" ".join(headers), min_length=2)
        signals.add("table:" + (" ".join(sorted(tokens)) if tokens else "unlabelled"))
    return signals


def _features(page: DifferentiationPage) -> dict[str, set[str]]:
    return {
        "heading_topics": _heading_signals(page),
        "table_structures": _table_signals(page),
        "outbound_sources": {
            domain.casefold() for domain in page.outbound_domains if domain
        },
    }


def _entry(feature: str, value: str, count: int, denominator: int) -> dict[str, Any]:
    return {
        "feature": feature,
        "value": value,
        "observed_pages": count,
        "inspected_pages": denominator,
        "share": round(count / denominator, 4) if denominator else None,
    }


def analyze_content_differentiation(
    owned: DifferentiationPage,
    competitors: Iterable[DifferentiationPage],
    *,
    selected_result_count: int,
    candidate_ids: Iterable[str] = (),
    snapshot_ids: Iterable[str] = (),
    search_context: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    """Classify parity, gaps and unique contributions with explicit denominators."""
    compared = tuple(competitors)
    denominator = len(compared)
    provenance = {
        "selected_result_count": selected_result_count,
        "inspected_page_count": denominator,
        "unusable_page_count": max(0, selected_result_count - denominator),
        "candidate_ids": sorted(set(candidate_ids)),
        "snapshot_ids": sorted(set(snapshot_ids)),
        "search_context": dict(search_context or {}),
    }
    base = {
        "formula_version": DIFFERENTIATION_FORMULA_VERSION,
        "state": "available",
        "minimum_inspected_pages": DIFFERENTIATION_MIN_INSPECTED_PAGES,
        "most_pages_ratio": DIFFERENTIATION_MOST_PAGES_RATIO,
        "comparison_policy": {
            "result_limit": DIFFERENTIATION_RESULT_LIMIT,
            "canonical_deduplication": (
                "one candidate per canonical source-page identity"
            ),
            "duplicate_domain_treatment": (
                "distinct canonical pages on one domain are retained"
            ),
            "freshness": "provider observation timestamp recorded in search_context",
        },
        "provenance": provenance,
        "parity": [],
        "gaps": [],
        "unique_contributions": [],
    }
    if denominator < DIFFERENTIATION_MIN_INSPECTED_PAGES:
        base["state"] = "insufficient_evidence"
        base["limitations"] = [
            "Too few selected organic results had usable inspected evidence."
        ]
        return base

    owned_features = _features(owned)
    counts: dict[str, Counter[str]] = {feature: Counter() for feature in owned_features}
    for page in compared:
        for feature, values in _features(page).items():
            counts[feature].update(values)

    required = max(1, int(denominator * DIFFERENTIATION_MOST_PAGES_RATIO + 0.999999))
    parity: list[dict[str, Any]] = []
    gaps: list[dict[str, Any]] = []
    unique: list[dict[str, Any]] = []
    for feature in sorted(counts):
        own_values = owned_features[feature]
        for value, count in sorted(counts[feature].items()):
            if count >= required:
                target = parity if value in own_values else gaps
                target.append(_entry(feature, value, count, denominator))
        for value in sorted(own_values):
            if counts[feature][value] == 0:
                unique.append(_entry(feature, value, 0, denominator))
    base["parity"] = parity[:DIFFERENTIATION_MAX_FEATURE_VALUES]
    base["gaps"] = gaps[:DIFFERENTIATION_MAX_FEATURE_VALUES]
    base["unique_contributions"] = unique[:DIFFERENTIATION_MAX_FEATURE_VALUES]
    base["limitations"] = [
        "Comparison covers selected inspected organic results, not the whole "
        "search result set.",
        "Heading, table and outbound-domain structure are descriptive evidence, "
        "not quality or causation.",
    ]
    return base
