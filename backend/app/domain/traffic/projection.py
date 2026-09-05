# Traffic projection math (A7) — PURE functions over reduced metric-row
# inputs: no DB, no network, no clock (invariants 7 + 9).
#
# The snapshot refresh executor (``service.py``) reads the project's
# ``IntegrationMetricRow`` rows and reduces them to ``TrafficMetricRowInput``;
# everything from that point on — latest-``resync_seq`` selection, the GA4
# inclusion rule, page/query keying, window bucketing, and the totals / CTR /
# position / trend math — lives here so it is unit-testable without a
# database.
#
# FORMULAS (stamped on every snapshot via ``TRAFFIC_FORMULA_VERSION``):
#   - GSC totals and the chart series come from ``gsc_day_daily`` ONLY — the
#     DATE-ONLY report, whose rows are GSC's own overall totals for a date.
#     No dimensional dataset ever feeds a headline number: every GSC
#     breakdown report drops privacy-filtered rows, so summing one under-
#     reports the total and silently disagrees with Search Console. The
#     dimensional datasets feed exactly one table each
#     (``PERFORMANCE_DIMENSION_DATASETS``) and nothing else. With no
#     ``gsc_day_daily`` evidence the GSC totals are NULL, never zero: an
#     unimported dataset and a measured zero are distinct states.
#   - GA4 totals come from ``ga4_channel_daily`` (Organic Search rows) plus
#     ``ga4_source_medium_daily`` (AI-referrer rows). ``ga4_landing_daily``
#     feeds per-page GA4 metrics ONLY (it re-dimensions the same sessions).
#     The three GA4 datasets are thereby disjoint per level — no GA4 session
#     is ever counted twice.
#   - GA4 inclusion (organic + AI-driven only, traffic.md section 3): a row
#     folds in iff its channel dim is in ``TRAFFIC_GA4_ORGANIC_CHANNEL_GROUPS``
#     (channel dataset) OR its source/medium dims match the deterministic A4
#     AI-referral classifier (source-medium / landing datasets — they carry
#     no channel dim, so the classifier arm is their only inclusion rule).
#   - ctr = clicks / impressions, ``None`` when impressions == 0 (a bucket
#     with zero impressions has no meaningful CTR — never a fake 0).
#   - position = Σ(position_i × impressions_i) / Σ(impressions_i) over the
#     rows carrying a NUMERIC position (impression-weighted mean; the row's
#     own ``ctr``/``position`` ratios are never averaged directly). ``None``
#     when no position-bearing impressions exist.
#   - sessions / conversions are plain sums over included GA4 rows, ``None``
#     when NO included GA4 row feeds the total/bucket (the frontend renders
#     null as "no GA4 connection", never an invented zero).
#   - Trend = the per-bucket series over the window: day buckets are the
#     dates themselves, week buckets start on the ISO Monday, month buckets
#     on the 1st; the first bucket's label is clamped to ``window_start`` so
#     the series stays aligned to the window. A bucket with no source rows
#     reports ``None`` (a chart gap), never a coerced zero.
from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import Any

from app.connectors.web_evidence.url_policy import UrlPolicyError
from app.core.config.integrations_datasets import (
    DATASET_GA4_CHANNEL_DAILY,
    DATASET_GA4_LANDING_DAILY,
    DATASET_GA4_SOURCE_MEDIUM_DAILY,
    DATASET_GSC_DAY_DAILY,
    DATASET_GSC_PAGE_DAILY,
    DATASET_GSC_QUERY_DAILY,
    unpack_dimension_key,
)
from app.core.config.traffic import (
    PERFORMANCE_TABLE_DIMENSION_ORDER,
    TRAFFIC_GA4_ORGANIC_CHANNEL_GROUPS,
    TRAFFIC_GA4_ORGANIC_MEDIUMS,
    TRAFFIC_GRANULARITY_DAY,
    TRAFFIC_GRANULARITY_MONTH,
    TRAFFIC_GRANULARITY_WEEK,
    TRAFFIC_PROVENANCE_ID_LIMIT,
    TRAFFIC_SNAPSHOT_GRANULARITIES,
)
from app.domain.analytics.classification import classify_referral_signals
from app.domain.site_health.normalization import canonical_identity
from app.domain.traffic.accumulators import (
    Ga4Accum,
    GscAccum,
    Provenance,
    TrafficMetricRowInput,
    absolute_page_value,
    bounded_provenance,
    metric_count,
    normalize_query,
)
from app.domain.traffic.dimensions import (
    DimensionAccum,
    DimensionProjection,
    accumulate_dimension,
    build_dimension_projections,
)

# Re-exported so the projection module stays the one import point callers
# already use for the pure fold (invariant 2 — one owner, one door).
__all__ = [
    "TRAFFIC_SERIES_NAMES",
    "DimensionProjection",
    "PageProjection",
    "QueryProjection",
    "SnapshotProjection",
    "TrafficMetricRowInput",
    "TrafficProjectionBuilder",
    "bucket_labels",
    "bucket_start",
    "build_traffic_projection",
    "ga4_channel_included",
    "ga4_landing_included",
    "ga4_source_medium_ai_match",
    "metric_count",
    "normalize_query",
    "select_latest_rows",
    "series_point",
]

# The persisted series names of the headline projection — this module
# writes exactly these into ``TrafficSnapshot.metrics["series"]`` and the
# read service (``domain/traffic/service.py``) imports the one owner.
TRAFFIC_SERIES_NAMES: tuple[str, ...] = (
    "impressions",
    "clicks",
    "ctr",
    "position",
    "sessions",
    "engaged_sessions",
    "key_events",
    "conversions",
)


@dataclass(frozen=True)
class PageProjection:
    """One per-page stat: canonical key, aggregate metrics, provenance."""

    canonical_url: str
    url_hash: str
    metrics: dict[str, Any]
    source_metric_row_ids: list[str]
    source_artifact_ids: list[str]


@dataclass(frozen=True)
class QueryProjection:
    """One per-query stat: normalized key, aggregate metrics, provenance."""

    normalized_query: str
    metrics: dict[str, Any]
    source_metric_row_ids: list[str]
    source_artifact_ids: list[str]


@dataclass(frozen=True)
class SnapshotProjection:
    """The full projection for one (window, granularity), ready to persist.

    ``metrics`` is the dashboard payload ``{"totals": ..., "series": ...}``;
    ``pages`` / ``queries`` are the per-page / per-query stat rows Demand
    reads; ``dimensions`` are the generic Performance table rows for all six
    dimensions, with ``dimension_counts`` recording each one's exact row
    count so a paged table never needs a ``COUNT(*)``. The top-level
    provenance lists are the union of every contributing row's ids (sorted
    string UUIDs, so re-runs serialize identically).
    """

    granularity: str
    metrics: dict[str, Any]
    pages: tuple[PageProjection, ...]
    queries: tuple[QueryProjection, ...]
    dimensions: tuple[DimensionProjection, ...]
    dimension_counts: dict[str, int]
    source_metric_row_ids: list[str]
    source_artifact_ids: list[str]


# --- Small pure primitives ----------------------------------------------------


def bucket_start(day: date, granularity: str) -> date:
    """The natural calendar bucket containing ``day``.

    ``day`` buckets are the date itself; ``week`` buckets start on the ISO
    Monday; ``month`` buckets on the 1st.
    """
    if granularity == TRAFFIC_GRANULARITY_DAY:
        return day
    if granularity == TRAFFIC_GRANULARITY_WEEK:
        return day - timedelta(days=day.weekday())
    if granularity == TRAFFIC_GRANULARITY_MONTH:
        return day.replace(day=1)
    raise ValueError(f"unknown traffic granularity: {granularity!r}")


def _bucket_starts(
    window_start: date, window_end: date, granularity: str
) -> list[date]:
    """Every natural bucket start intersecting the (inclusive) window."""
    starts: list[date] = []
    current = bucket_start(window_start, granularity)
    while current <= window_end:
        starts.append(current)
        if granularity == TRAFFIC_GRANULARITY_MONTH:
            if current.month == 12:
                current = current.replace(year=current.year + 1, month=1)
            else:
                current = current.replace(month=current.month + 1)
        else:
            step = timedelta(days=1 if granularity == TRAFFIC_GRANULARITY_DAY else 7)
            current += step
    return starts


def bucket_labels(window_start: date, window_end: date, granularity: str) -> list[date]:
    """The series labels: natural starts, the first clamped to the window.

    A window opening mid-week/mid-month labels its first (partial) bucket
    with ``window_start`` so every series point stays inside the window —
    bucketing aligned to the window.
    """
    return [
        max(start, window_start)
        for start in _bucket_starts(window_start, window_end, granularity)
    ]


def row_identity(row: TrafficMetricRowInput) -> tuple[object, ...]:
    """The metric row's re-sync identity.

    ``(property_ref, provider, dataset, date, dimension_key)`` — the
    ``uq_integration_metric_row_identity`` columns minus ``resync_seq`` (the
    selection runs per project, so ``project_id`` is constant). Two rows
    sharing this identity are two revisions of the SAME observation.
    """
    return (
        row.property_ref,
        row.provider,
        row.dataset,
        row.date,
        row.dimension_key,
    )


def select_latest_rows(
    rows: list[TrafficMetricRowInput],
) -> list[TrafficMetricRowInput]:
    """Keep the latest ``resync_seq`` per metric-row identity tuple.

    A row superseded by a later re-sync is stale evidence and never folds
    into the projection (traffic.md section 3). The result is sorted
    deterministically so downstream float aggregation is order-independent
    (invariant 9).
    """
    latest: dict[tuple[object, ...], TrafficMetricRowInput] = {}
    for row in rows:
        identity = row_identity(row)
        current = latest.get(identity)
        if current is None or row.resync_seq > current.resync_seq:
            latest[identity] = row
    return sorted(latest.values(), key=_row_sort_key)


def ga4_channel_included(channel: str) -> bool:
    """The channel arm of the GA4 inclusion rule (Organic Search only)."""
    return channel.strip() in TRAFFIC_GA4_ORGANIC_CHANNEL_GROUPS


def ga4_source_medium_ai_match(source: str, medium: str) -> bool:
    """The classifier arm of the GA4 inclusion rule (AI-referrer only).

    GA4 ``sessionSource``/``sessionMedium`` are the session's traffic-source
    tags, so they classify through the A4 deterministic classifier's UTM tier
    (inv. 2 — the one AI-referral taxonomy, owned by
    ``domain/analytics/classification.py``).
    """
    return classify_referral_signals(utm_source=source, utm_medium=medium) is not None


def ga4_landing_included(source: str, medium: str) -> bool:
    """Landing rows represent the same organic-plus-AI Traffic scope."""
    return (
        medium.strip().casefold() in TRAFFIC_GA4_ORGANIC_MEDIUMS
        or ga4_source_medium_ai_match(source, medium)
    )


# --- Aggregation ---------------------------------------------------------------


def _row_sort_key(row: TrafficMetricRowInput) -> tuple[object, ...]:
    return (row.date, row.dataset, row.dimension_key, str(row.id))


@dataclass
class _PageAccum:
    """One canonical page's combined GSC + GA4 aggregate."""

    url_hash: str
    gsc: GscAccum = field(default_factory=GscAccum)
    ga4: Ga4Accum = field(default_factory=Ga4Accum)


@dataclass
class _ProjectionAccumulators:
    """All mutable buckets produced while folding latest metric rows."""

    bucket_gsc: dict[date, GscAccum]
    bucket_ga4: dict[date, Ga4Accum]
    totals_gsc: GscAccum
    totals_ga4: Ga4Accum
    pages: dict[str, _PageAccum]
    queries: dict[str, GscAccum]
    # dimension token -> row key -> that row's accumulator. One dataset feeds
    # exactly one dimension, so a key can never mix two reports.
    dimensions: dict[str, dict[str, DimensionAccum]]


def _page_accum(
    pages: dict[str, _PageAccum],
    raw_page_value: str,
    project_origin: str | None,
) -> _PageAccum | None:
    """The page's accumulator keyed by its canonical URL identity.

    The page dimension value is canonicalized with the ONE canonical-form
    owner (``canonical_identity``, invariant 2) so GSC/GA4 page rows join
    the crawled ``SiteUrl`` identity by ``(project_id, url_hash)``. A value
    the URL policy rejects (e.g. a bare GA4 landing path with no site
    origin to resolve it against — the pinned C1 landing template carries
    none) cannot form a page key and is skipped from page stats; its
    totals-level contribution is unaffected.
    """
    try:
        canonical, url_hash = canonical_identity(
            absolute_page_value(raw_page_value, project_origin)
        )
    except UrlPolicyError:
        return None
    accum = pages.get(canonical)
    if accum is None:
        accum = _PageAccum(url_hash=url_hash)
        pages[canonical] = accum
    return accum


def series_point(label: date, value: int | float | None) -> dict[str, Any]:
    """One persisted series point shared with AI Referrals snapshots."""
    return {"date": label.isoformat(), "value": value}


def _validate_projection_inputs(
    *, window_start: date, window_end: date, granularity: str
) -> None:
    if granularity not in TRAFFIC_SNAPSHOT_GRANULARITIES:
        raise ValueError(f"unknown traffic granularity: {granularity!r}")
    if window_end < window_start:
        raise ValueError("traffic window_end before window_start")


def _empty_accumulators(starts: list[date]) -> _ProjectionAccumulators:
    """The zeroed buckets one projection folds into."""
    return _ProjectionAccumulators(
        bucket_gsc={start: GscAccum() for start in starts},
        bucket_ga4={start: Ga4Accum() for start in starts},
        totals_gsc=GscAccum(),
        totals_ga4=Ga4Accum(),
        pages={},
        queries={},
        dimensions={dimension: {} for dimension in PERFORMANCE_TABLE_DIMENSION_ORDER},
    )


def _accumulate_row(
    *,
    row: TrafficMetricRowInput,
    dimension_values: tuple[str, ...],
    bucket_start_value: date,
    project_origin: str | None,
    accumulators: _ProjectionAccumulators,
) -> None:
    # Every GSC dataset feeds its own Performance table, independently of
    # whether it also feeds the headline or a Demand-facing stat row.
    accumulate_dimension(
        row=row,
        dimension_values=dimension_values,
        project_origin=project_origin,
        buckets=accumulators.dimensions,
    )
    if row.dataset == DATASET_GSC_DAY_DAILY:
        # The ONLY headline source: GSC's own overall totals for the date.
        accumulators.totals_gsc.add(row)
        accumulators.bucket_gsc[bucket_start_value].add(row)
        return
    if row.dataset == DATASET_GSC_PAGE_DAILY:
        (page_value,) = dimension_values
        page = _page_accum(accumulators.pages, page_value, project_origin)
        if page is not None:
            page.gsc.add(row)
        return
    if row.dataset == DATASET_GSC_QUERY_DAILY:
        (query_value,) = dimension_values
        normalized = normalize_query(query_value)
        if normalized:
            accumulators.queries.setdefault(normalized, GscAccum()).add(row)
        return
    _accumulate_ga4_row(
        row=row,
        dimension_values=dimension_values,
        bucket_start_value=bucket_start_value,
        project_origin=project_origin,
        accumulators=accumulators,
    )


def _accumulate_ga4_row(
    *,
    row: TrafficMetricRowInput,
    dimension_values: tuple[str, ...],
    bucket_start_value: date,
    project_origin: str | None,
    accumulators: _ProjectionAccumulators,
) -> None:
    """Fold one GA4 row under the organic-plus-AI inclusion rule.

    The three GA4 datasets are disjoint per level, so no session is counted
    twice: channel and source/medium rows feed the totals and buckets, while
    landing rows re-dimension the same sessions and feed per-page metrics
    only.
    """
    if row.dataset == DATASET_GA4_CHANNEL_DAILY:
        (channel,) = dimension_values
        if ga4_channel_included(channel):
            accumulators.totals_ga4.add(row)
            accumulators.bucket_ga4[bucket_start_value].add(row)
        return
    if row.dataset == DATASET_GA4_SOURCE_MEDIUM_DAILY:
        source, medium = dimension_values
        if ga4_source_medium_ai_match(source, medium):
            accumulators.totals_ga4.add(row)
            accumulators.bucket_ga4[bucket_start_value].add(row)
        return
    if row.dataset != DATASET_GA4_LANDING_DAILY:
        return
    landing, source, medium = dimension_values
    if ga4_landing_included(source, medium):
        page = _page_accum(accumulators.pages, landing, project_origin)
        if page is not None:
            page.ga4.add(row)


def _build_series(
    *,
    starts: list[date],
    labels: list[date],
    bucket_gsc: dict[date, GscAccum],
    bucket_ga4: dict[date, Ga4Accum],
) -> dict[str, list[dict[str, Any]]]:
    series: dict[str, list[dict[str, Any]]] = {
        name: [] for name in TRAFFIC_SERIES_NAMES
    }
    for start, label in zip(starts, labels, strict=True):
        gsc = bucket_gsc[start]
        ga4 = bucket_ga4[start]
        series["impressions"].append(
            series_point(label, gsc.impressions if gsc.has_rows else None)
        )
        series["clicks"].append(
            series_point(label, gsc.clicks if gsc.has_rows else None)
        )
        series["ctr"].append(series_point(label, gsc.ctr()))
        series["position"].append(series_point(label, gsc.position()))
        ga4_measures = ga4.measures()
        series["sessions"].append(series_point(label, ga4_measures["sessions"]))
        series["engaged_sessions"].append(
            series_point(label, ga4_measures["engaged_sessions"])
        )
        series["key_events"].append(series_point(label, ga4_measures["key_events"]))
        series["conversions"].append(series_point(label, ga4_measures["conversions"]))
    return series


def _build_page_projections(
    pages: dict[str, _PageAccum],
) -> tuple[PageProjection, ...]:
    rows: list[PageProjection] = []
    for canonical_url, accum in sorted(pages.items()):
        metric_rows = bounded_provenance(accum.gsc.row_ids | accum.ga4.row_ids)
        artifacts = bounded_provenance(accum.gsc.artifact_ids | accum.ga4.artifact_ids)
        rows.append(
            PageProjection(
                canonical_url=canonical_url,
                url_hash=accum.url_hash,
                metrics=accum.gsc.measures()
                | accum.ga4.measures()
                | _provenance_counts(metric_rows, artifacts),
                source_metric_row_ids=metric_rows.ids,
                source_artifact_ids=artifacts.ids,
            )
        )
    return tuple(rows)


def _build_query_projections(
    queries: dict[str, GscAccum],
) -> tuple[QueryProjection, ...]:
    rows: list[QueryProjection] = []
    for normalized, accum in sorted(queries.items()):
        metric_rows = bounded_provenance(accum.row_ids)
        artifacts = bounded_provenance(accum.artifact_ids)
        rows.append(
            QueryProjection(
                normalized_query=normalized,
                metrics=accum.measures() | _provenance_counts(metric_rows, artifacts),
                source_metric_row_ids=metric_rows.ids,
                source_artifact_ids=artifacts.ids,
            )
        )
    return tuple(rows)


def _provenance_counts(
    metric_rows: Provenance, artifacts: Provenance
) -> dict[str, Any]:
    """The true contributing counts beside a possibly-sampled id list.

    Emitted ONLY when a list was actually capped, so an uncapped row's
    metrics keep the exact shape every existing consumer reads. A row that
    carries these keys is stating "these ids are a sample of this many" —
    the distinction invariant 7 requires between a complete record and a
    bounded one.
    """
    counts: dict[str, Any] = {}
    if metric_rows.sampled:
        counts["source_metric_row_count"] = metric_rows.total
    if artifacts.sampled:
        counts["source_artifact_count"] = artifacts.total
    return counts


def _projection_provenance(
    *,
    totals_gsc: GscAccum,
    totals_ga4: Ga4Accum,
    pages: tuple[PageProjection, ...],
    queries: tuple[QueryProjection, ...],
    dimensions: tuple[DimensionProjection, ...],
) -> tuple[Provenance, Provenance]:
    """The snapshot's own bounded provenance over every contributing row.

    The union of the headline accumulators and each stat row's (already
    bounded) lists, capped once more at the same limit. The returned
    ``total`` is therefore the size of that union — itself a lower bound
    when the stat rows were sampled, which is exactly why the snapshot
    records the sampled-row count too (``_provenance_summary``).
    """
    row_ids = set(totals_gsc.row_ids) | set(totals_ga4.row_ids)
    artifact_ids = set(totals_gsc.artifact_ids) | set(totals_ga4.artifact_ids)
    # All three stat shapes carry the same two provenance lists; the explicit
    # union keeps that visible instead of widening to ``object``.
    contributors: tuple[PageProjection | QueryProjection | DimensionProjection, ...] = (
        *pages,
        *queries,
        *dimensions,
    )
    for projection in contributors:
        row_ids.update(projection.source_metric_row_ids)
        artifact_ids.update(projection.source_artifact_ids)
    return bounded_provenance(row_ids), bounded_provenance(artifact_ids)


def _provenance_summary(
    *,
    metric_rows: Provenance,
    artifacts: Provenance,
    pages: tuple[PageProjection, ...],
    queries: tuple[QueryProjection, ...],
    dimensions: tuple[DimensionProjection, ...],
) -> dict[str, Any]:
    """How much of this snapshot's provenance is a sample, stated explicitly.

    The plan's requirement that a capped list "say so in the snapshot's
    provenance rather than silently truncating". Present on EVERY snapshot,
    so a reader never has to infer completeness from the absence of a
    marker: ``sampled_row_count == 0`` is the positive statement that every
    list is whole.
    """
    # Same explicit union as ``_projection_provenance``: all three stat
    # shapes carry ``metrics``, and naming them keeps the type from widening
    # to ``object``.
    rows: tuple[PageProjection | QueryProjection | DimensionProjection, ...] = (
        *pages,
        *queries,
        *dimensions,
    )
    sampled = sum(
        1
        for row in rows
        if "source_metric_row_count" in row.metrics
        or "source_artifact_count" in row.metrics
    )
    return {
        "id_limit": TRAFFIC_PROVENANCE_ID_LIMIT,
        "metric_row_total": metric_rows.total,
        "artifact_total": artifacts.total,
        "metric_rows_sampled": metric_rows.sampled,
        "artifacts_sampled": artifacts.sampled,
        "sampled_stat_rows": sampled,
    }


class TrafficProjectionBuilder:
    """An INCREMENTAL fold of metric rows into one snapshot projection.

    The streaming half of the projection contract. ``build_traffic_projection``
    below is the batch convenience over it; the executor drives this directly
    so a window is never materialized as a row list.

    Memory bounds on DISTINCT keys — pages, queries, dimension values, and
    buckets — plus each row's capped provenance, rather than on the number
    of metric rows in the window. That is what lets a window be long.

    **Feeding contract.** ``add_batch`` accepts rows in ANY order and applies
    latest-``resync_seq`` selection itself, buffering one candidate row per
    identity. Callers that can supply rows ordered by
    ``(identity, resync_seq)`` — as the executor's keyset scan does — should
    say so with ``ordered_by_identity=True``: the builder then folds each
    identity as soon as the next one begins, so its buffer holds ONE row
    instead of one per distinct observation in the window.

    Determinism is preserved either way: a row folds exactly once, the
    accumulators are order-independent sums and sets, and the emitted rows
    are sorted by key.
    """

    def __init__(
        self,
        *,
        window_start: date,
        window_end: date,
        granularity: str,
        project_origin: str | None = None,
    ) -> None:
        _validate_projection_inputs(
            window_start=window_start,
            window_end=window_end,
            granularity=granularity,
        )
        self._window_start = window_start
        self._window_end = window_end
        self._granularity = granularity
        self._project_origin = project_origin
        self._starts = _bucket_starts(window_start, window_end, granularity)
        self._accumulators = _empty_accumulators(self._starts)
        # Pending latest-revision candidates awaiting their fold. In the
        # ordered mode this holds at most one identity at a time.
        self._pending: dict[tuple[object, ...], TrafficMetricRowInput] = {}
        self._ordered_identity: tuple[object, ...] | None = None

    def add_batch(
        self,
        rows: Iterable[TrafficMetricRowInput],
        *,
        ordered_by_identity: bool = False,
    ) -> None:
        """Fold one batch of candidate rows into the running projection."""
        for row in rows:
            identity = row_identity(row)
            if ordered_by_identity:
                if (
                    self._ordered_identity is not None
                    and identity != self._ordered_identity
                ):
                    self._flush_pending()
                self._ordered_identity = identity
            current = self._pending.get(identity)
            if current is None or row.resync_seq > current.resync_seq:
                self._pending[identity] = row

    def _flush_pending(self) -> None:
        """Fold the buffered latest revisions, in deterministic row order."""
        if not self._pending:
            return
        for row in sorted(self._pending.values(), key=_row_sort_key):
            self._fold(row)
        self._pending.clear()

    def _fold(self, row: TrafficMetricRowInput) -> None:
        if not (self._window_start <= row.date <= self._window_end):
            return
        values = unpack_dimension_key(row.dataset, row.dimension_key)
        if values is None:
            return
        _accumulate_row(
            row=row,
            dimension_values=values[:-1],
            bucket_start_value=bucket_start(row.date, self._granularity),
            project_origin=self._project_origin,
            accumulators=self._accumulators,
        )

    def build(self) -> SnapshotProjection:
        """Finalize: fold anything buffered, then emit the projection."""
        self._flush_pending()
        self._ordered_identity = None
        return _finalize_projection(
            accumulators=self._accumulators,
            window_start=self._window_start,
            window_end=self._window_end,
            granularity=self._granularity,
            starts=self._starts,
        )


def build_traffic_projection(
    *,
    rows: list[TrafficMetricRowInput],
    window_start: date,
    window_end: date,
    granularity: str,
    project_origin: str | None = None,
) -> SnapshotProjection:
    """Project the latest metric rows into one snapshot + its stat rows.

    PURE: the caller supplies the candidate rows (already scoped to the
    project + window + consumed datasets); latest-``resync_seq`` selection
    is applied inside so a stale revision can never leak in. Deterministic:
    the same inputs always yield byte-identical metrics and provenance.

    The batch door onto :class:`TrafficProjectionBuilder` — identical output
    for the same rows. Callers holding a whole window in memory already (the
    unit tests, and any small fixed window) use this; the executor streams
    the builder instead.
    """
    builder = TrafficProjectionBuilder(
        window_start=window_start,
        window_end=window_end,
        granularity=granularity,
        project_origin=project_origin,
    )
    builder.add_batch(rows)
    return builder.build()


def _finalize_projection(
    *,
    accumulators: _ProjectionAccumulators,
    window_start: date,
    window_end: date,
    granularity: str,
    starts: list[date],
) -> SnapshotProjection:
    labels = bucket_labels(window_start, window_end, granularity)
    series = _build_series(
        starts=starts,
        labels=labels,
        bucket_gsc=accumulators.bucket_gsc,
        bucket_ga4=accumulators.bucket_ga4,
    )

    page_projections = _build_page_projections(accumulators.pages)
    query_projections = _build_query_projections(accumulators.queries)
    dimension_projections, dimension_counts = build_dimension_projections(
        accumulators.dimensions
    )
    metric_rows, artifacts = _projection_provenance(
        totals_gsc=accumulators.totals_gsc,
        totals_ga4=accumulators.totals_ga4,
        pages=page_projections,
        queries=query_projections,
        dimensions=dimension_projections,
    )

    return SnapshotProjection(
        granularity=granularity,
        metrics={
            "totals": accumulators.totals_gsc.observed_measures()
            | accumulators.totals_ga4.measures(),
            "series": series,
            "provenance": _provenance_summary(
                metric_rows=metric_rows,
                artifacts=artifacts,
                pages=page_projections,
                queries=query_projections,
                dimensions=dimension_projections,
            ),
        },
        pages=page_projections,
        queries=query_projections,
        dimensions=dimension_projections,
        dimension_counts=dimension_counts,
        source_metric_row_ids=metric_rows.ids,
        source_artifact_ids=artifacts.ids,
    )
