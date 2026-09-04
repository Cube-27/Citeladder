# Performance dimension folding — the PURE per-dimension half of the traffic
# projection (no DB, no network, no clock; invariants 7 + 9).
#
# Six GSC reports, one row shape. ``projection.py`` owns the headline totals,
# the chart series, and the Demand-facing page/query stat rows; this module
# owns the generic ``PerformanceDimensionStat`` rows behind the QUERIES,
# PAGES, COUNTRIES, DEVICES, SEARCH APPEARANCE, and DAYS tables, plus each
# dimension's exact row count.
#
# The routing is strictly one dataset -> one dimension
# (``PERFORMANCE_DATASET_DIMENSIONS``): a dimensional GSC report drops
# privacy-filtered rows, so mixing two of them into one table — or summing
# one into a headline — would silently disagree with Search Console.
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from app.connectors.web_evidence.url_policy import UrlPolicyError
from app.core.config.traffic import (
    PERFORMANCE_DATASET_DIMENSIONS,
    PERFORMANCE_DIMENSION_DAY,
    PERFORMANCE_DIMENSION_ORDER,
    PERFORMANCE_DIMENSION_PAGE,
    PERFORMANCE_DIMENSION_QUERY,
)
from app.domain.site_health.normalization import canonical_identity
from app.domain.traffic.accumulators import (
    GscAccum,
    TrafficMetricRowInput,
    absolute_page_value,
    normalize_query,
)


@dataclass(frozen=True)
class DimensionProjection:
    """One persisted Performance dimension row (GSC measures only)."""

    dimension: str
    dimension_key: str
    display_value: str
    metrics: dict[str, Any]
    source_metric_row_ids: list[str]
    source_artifact_ids: list[str]


@dataclass
class DimensionAccum:
    """One Performance dimension row while folding (key -> display + measures)."""

    display_value: str
    gsc: GscAccum = field(default_factory=GscAccum)


def dimension_row_key(
    *,
    dimension: str,
    row: TrafficMetricRowInput,
    dimension_values: tuple[str, ...],
    project_origin: str | None,
) -> tuple[str, str] | None:
    """The ``(key, display_value)`` of one row within its dimension.

    Each dimension keys by the same normalized identity its dedicated table
    reads, so a Performance row and the projection row beside it always
    agree: DAYS keys by the row's own ISO date (the date-only dataset
    carries no other dimension value), PAGES by the canonical URL identity
    that joins the crawled ``SiteUrl``, QUERIES by the normalized query
    string, and the remaining GSC dimensions by their provider token. A
    value that cannot form a key (an empty token, or a page URL the URL
    policy rejects) yields ``None`` and is skipped — never guessed.
    """
    if dimension == PERFORMANCE_DIMENSION_DAY:
        iso = row.date.isoformat()
        return iso, iso
    if not dimension_values:
        return None
    raw = dimension_values[0]
    if dimension == PERFORMANCE_DIMENSION_PAGE:
        try:
            canonical, _ = canonical_identity(absolute_page_value(raw, project_origin))
        except UrlPolicyError:
            return None
        return canonical, canonical
    if dimension == PERFORMANCE_DIMENSION_QUERY:
        normalized = normalize_query(raw)
        return (normalized, normalized) if normalized else None
    token = raw.strip()
    return (token, token) if token else None


def accumulate_dimension(
    *,
    row: TrafficMetricRowInput,
    dimension_values: tuple[str, ...],
    project_origin: str | None,
    buckets: dict[str, dict[str, DimensionAccum]],
) -> None:
    """Fold one GSC row into the single Performance dimension it belongs to.

    ``buckets`` is the caller's ``dimension -> key -> accumulator`` map. A
    row whose dataset feeds no Performance table, or whose value cannot form
    a key, is skipped rather than folded somewhere approximate.
    """
    dimension = PERFORMANCE_DATASET_DIMENSIONS.get(row.dataset)
    if dimension is None:
        return
    keyed = dimension_row_key(
        dimension=dimension,
        row=row,
        dimension_values=dimension_values,
        project_origin=project_origin,
    )
    if keyed is None:
        return
    key, display_value = keyed
    bucket = buckets[dimension]
    accum = bucket.get(key)
    if accum is None:
        accum = DimensionAccum(display_value=display_value)
        bucket[key] = accum
    accum.gsc.add(row)


def build_dimension_projections(
    dimensions: dict[str, dict[str, DimensionAccum]],
) -> tuple[tuple[DimensionProjection, ...], dict[str, int]]:
    """The generic Performance rows plus each dimension's exact row count.

    Emitted in tab order, then by key, so a rebuild serializes identically.
    The counts are produced HERE, from the same rows that are about to be
    written, so a table's stated total can never describe a different result
    set than the rows it pages.
    """
    rows: list[DimensionProjection] = []
    counts: dict[str, int] = {}
    for dimension in PERFORMANCE_DIMENSION_ORDER:
        bucket = dimensions.get(dimension) or {}
        counts[dimension] = len(bucket)
        rows.extend(
            DimensionProjection(
                dimension=dimension,
                dimension_key=key,
                display_value=accum.display_value,
                metrics=accum.gsc.measures(),
                source_metric_row_ids=sorted(accum.gsc.row_ids),
                source_artifact_ids=sorted(accum.gsc.artifact_ids),
            )
            for key, accum in sorted(bucket.items())
        )
    return tuple(rows), counts
