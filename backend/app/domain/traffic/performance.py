"""Performance read services — persisted projections only (invariant 7).

Two reads back the whole surface. :func:`get_performance_dashboard` resolves
the selected range (and, when asked, its comparison range) to persisted
``TrafficSnapshot`` rows and returns both windows' exact totals and daily
series. :func:`get_performance_table` pages one snapshot's persisted
``PerformanceDimensionStat`` rows for one of the six dimensions, joining the
comparison snapshot's rows for the SAME page of keys.

Neither read calls a provider, recomputes a metric, or repairs state. A range
with no persisted snapshot is reported as unprojected; materializing one is
the custom-range task's job, never a read's.
"""

from __future__ import annotations

import uuid
from datetime import date

from sqlalchemy import Float, and_, cast, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config.traffic import (
    PERFORMANCE_DEFAULT_COMPARE,
    PERFORMANCE_DEFAULT_DIMENSION,
    PERFORMANCE_DEFAULT_PAGE_SIZE,
    PERFORMANCE_DEFAULT_RANGE,
    PERFORMANCE_DIMENSION_DEFAULT_SORT,
    PERFORMANCE_DIMENSION_ORDER,
    PERFORMANCE_SORT_KEY_DIMENSION,
    PERFORMANCE_UNAVAILABLE_DIMENSIONS,
    TRAFFIC_FORMULA_VERSION,
    TRAFFIC_NORMALIZATION_VERSION,
)
from app.domain.analytics.schemas import metric_series_points
from app.domain.site_health.normalization import encode_keyset_cursor
from app.domain.traffic.query_support import (
    PerformanceCursorError,
    PerformanceQueryError,
    comparison_window,
    decode_table_cursor,
    float_or_none,
    int_or_none,
    load_snapshot_by_id,
    parse_sort,
    resolve_selected_window,
    resolve_window_snapshot,
    str_or_none,
    table_filters,
    validate_compare,
    validate_custom_window,
    validate_dimension,
    validate_granularity,
    validate_page_size,
    validate_range,
)
from app.domain.traffic.schemas import (
    PerformanceCoverage,
    PerformanceDashboardResponse,
    PerformanceDimensionCounts,
    PerformanceMetrics,
    PerformanceSeries,
    PerformanceTablePage,
    PerformanceTableRow,
    PerformanceTotals,
    PerformanceWindow,
)
from app.models.traffic import PerformanceDimensionStat, TrafficSnapshot

__all__ = [
    "PerformanceCursorError",
    "PerformanceQueryError",
    "get_performance_dashboard",
    "get_performance_table",
]

# The keyset fingerprint's endpoint label (site-health convention, C4).
_TABLE_CURSOR_SCOPE = "performance-table"

# The four GSC series the chart renders, in card order.
_SERIES_NAMES = ("clicks", "impressions", "ctr", "position")


# =========================================================================
# Dashboard
# =========================================================================


def _totals(raw: object) -> PerformanceTotals:
    metrics = raw if isinstance(raw, dict) else {}
    return PerformanceTotals(
        clicks=int_or_none(metrics.get("clicks")),
        impressions=int_or_none(metrics.get("impressions")),
        ctr=float_or_none(metrics.get("ctr")),
        position=float_or_none(metrics.get("position")),
        sessions=int_or_none(metrics.get("sessions")),
        conversions=int_or_none(metrics.get("conversions")),
    )


def _series(raw: object) -> PerformanceSeries:
    series = raw if isinstance(raw, dict) else {}
    return PerformanceSeries(
        **{name: metric_series_points(series.get(name)) for name in _SERIES_NAMES}
    )


def _evidence_state(totals: PerformanceTotals) -> str:
    """``available`` / ``observed_zero`` / ``not_run`` from the totals alone.

    All-null totals mean nothing was projected for the window; all-zero
    totals mean the window WAS projected and measured nothing. Collapsing
    those two into one state is exactly the mistake the invariant forbids.
    """
    observed = (
        totals.clicks,
        totals.impressions,
        totals.sessions,
        totals.conversions,
    )
    if all(value is None for value in observed):
        return "not_run"
    return "available" if any(value for value in observed) else "observed_zero"


def _window_payload(
    snapshot: TrafficSnapshot | None, window: tuple[date, date] | None
) -> PerformanceWindow:
    """One window block, whether or not it resolved to a snapshot."""
    if snapshot is None:
        window_start, window_end = window if window is not None else (None, None)
        empty = _totals(None)
        return PerformanceWindow(
            snapshot_id=None,
            window_start=window_start.isoformat() if window_start else "",
            window_end=window_end.isoformat() if window_end else "",
            evidence_state="not_run",
            totals=empty,
            series=_series(None),
        )
    metrics = snapshot.metrics or {}
    totals = _totals(metrics.get("totals"))
    return PerformanceWindow(
        snapshot_id=snapshot.id,
        window_start=snapshot.window_start.isoformat(),
        window_end=snapshot.window_end.isoformat(),
        evidence_state=_evidence_state(totals),
        totals=totals,
        series=_series(metrics.get("series")),
    )


def _coverage(snapshot: TrafficSnapshot | None) -> PerformanceCoverage:
    raw = (snapshot.coverage if snapshot is not None else None) or {}
    covered = raw.get("covered_days")
    return PerformanceCoverage(
        earliest_date=str_or_none(raw.get("earliest_date")),
        latest_date=str_or_none(raw.get("latest_date")),
        covered_days=int(covered) if isinstance(covered, (int, float)) else 0,
    )


def _dimension_counts(snapshot: TrafficSnapshot | None) -> PerformanceDimensionCounts:
    raw = (snapshot.dimension_counts if snapshot is not None else None) or {}
    return PerformanceDimensionCounts(
        **{
            dimension: (
                int(raw[dimension])
                if isinstance(raw.get(dimension), (int, float))
                else 0
            )
            for dimension in PERFORMANCE_DIMENSION_ORDER
        }
    )


async def get_performance_dashboard(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    range_token: str | None = None,
    from_date: date | None = None,
    to_date: date | None = None,
    compare: str | None = None,
    compare_from: date | None = None,
    compare_to: date | None = None,
    granularity: str | None = None,
) -> PerformanceDashboardResponse:
    """Serve the selected window — and its comparison — from persisted rows.

    The comparison window is derived from the SELECTED window's actual dates,
    so "previous period" always means the period before what is on screen,
    not before what was requested. Both halves resolve independently: either
    can come back unprojected, and the surface then queues the range task for
    exactly that window.
    """
    resolved_range = validate_range(range_token, PERFORMANCE_DEFAULT_RANGE)
    resolved_granularity = validate_granularity(granularity)
    resolved_compare = validate_compare(compare, PERFORMANCE_DEFAULT_COMPARE)
    custom = validate_custom_window(from_date, to_date)

    snapshot, window = await resolve_selected_window(
        session,
        workspace_id=workspace_id,
        project_id=project_id,
        range_token=resolved_range,
        custom=custom,
        granularity=resolved_granularity,
    )
    comparison: PerformanceWindow | None = None
    if window is not None:
        compare_span = comparison_window(
            compare=resolved_compare,
            selected=window,
            compare_from=compare_from,
            compare_to=compare_to,
        )
        if compare_span is not None:
            comparison = _window_payload(
                await resolve_window_snapshot(
                    session,
                    workspace_id=workspace_id,
                    project_id=project_id,
                    window=compare_span,
                    granularity=resolved_granularity,
                ),
                compare_span,
            )
    return PerformanceDashboardResponse(
        project_id=project_id,
        range=resolved_range,
        granularity=resolved_granularity,
        compare=resolved_compare,
        selected=_window_payload(snapshot, window),
        comparison=comparison,
        coverage=_coverage(snapshot),
        dimension_counts=_dimension_counts(snapshot),
        unavailable_dimensions=list(PERFORMANCE_UNAVAILABLE_DIMENSIONS),
        formula_version=(
            snapshot.formula_version if snapshot else TRAFFIC_FORMULA_VERSION
        ),
        normalization_version=(
            snapshot.normalization_version
            if snapshot
            else TRAFFIC_NORMALIZATION_VERSION
        ),
    )


# =========================================================================
# Dimension table
# =========================================================================


def _sort_expression(sort_key: str):
    """The persisted column a sort key orders by.

    ``dimension_key`` orders by the row's own key — which is what makes DAYS
    chronological, since its keys are ISO dates and ISO dates sort
    lexicographically. Every other key reads the stored aggregate out of the
    metrics JSONB: ``->>`` yields SQL NULL for an absent or JSON-null value,
    so undefined CTR/position sort NULLS LAST and cast cleanly.
    """
    if sort_key == PERFORMANCE_SORT_KEY_DIMENSION:
        return PerformanceDimensionStat.dimension_key
    return cast(PerformanceDimensionStat.metrics[sort_key].astext, Float)


def _resume_after_cursor(
    stmt, expression, *, keyset: tuple[str, uuid.UUID], descending: bool
):
    """Narrow a keyset scan to the rows after the cursor's row.

    An empty cursor value means the cursor sat on a NULL-valued row: ordering
    puts NULLs last, so only NULL rows with a later id can remain. Otherwise
    the scan resumes past the cursor's sort value, ties break by id, and the
    trailing NULL run stays reachable.
    """
    cursor_value, cursor_id = keyset
    if cursor_value == "":
        return stmt.where(expression.is_(None), PerformanceDimensionStat.id > cursor_id)
    typed = expression.type.python_type(cursor_value)
    return stmt.where(
        or_(
            expression < typed if descending else expression > typed,
            and_(expression == typed, PerformanceDimensionStat.id > cursor_id),
            expression.is_(None),
        )
    )


def _row_sort_value(stat: PerformanceDimensionStat, sort_key: str) -> str:
    if sort_key == PERFORMANCE_SORT_KEY_DIMENSION:
        return stat.dimension_key
    value = float_or_none((stat.metrics or {}).get(sort_key))
    return "" if value is None else repr(value)


async def _page_rows(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    snapshot_id: uuid.UUID,
    dimension: str,
    sort_key: str,
    descending: bool,
    keyset: tuple[str, uuid.UUID] | None,
    page_size: int,
    filters: dict[str, object],
) -> tuple[list[PerformanceDimensionStat], str | None]:
    """One bounded keyset page of a snapshot's dimension rows, plus its cursor.

    Ordering is ``(sort value [direction] NULLS LAST, id ASC)`` over persisted
    aggregates. The scan reads at most ``page_size + 1`` rows — the extra one
    only decides whether a continuation cursor exists — so no page navigation
    ever issues an ``OFFSET``, a full-result fetch, or a ``COUNT(*)``.
    """
    expression = _sort_expression(sort_key)
    stmt = (
        select(PerformanceDimensionStat)
        .where(PerformanceDimensionStat.workspace_id == workspace_id)
        .where(PerformanceDimensionStat.project_id == project_id)
        .where(PerformanceDimensionStat.snapshot_id == snapshot_id)
        .where(PerformanceDimensionStat.dimension == dimension)
    )
    if keyset is not None:
        stmt = _resume_after_cursor(
            stmt, expression, keyset=keyset, descending=descending
        )
    direction = expression.desc() if descending else expression.asc()
    stmt = stmt.order_by(
        direction.nulls_last(), PerformanceDimensionStat.id.asc()
    ).limit(page_size + 1)

    rows = list((await session.scalars(stmt)).all())
    if len(rows) <= page_size:
        return rows, None
    rows = rows[:page_size]
    last = rows[-1]
    return rows, encode_keyset_cursor(
        scope=_TABLE_CURSOR_SCOPE,
        filters=filters,
        sort_values=[_row_sort_value(last, sort_key), str(last.id)],
    )


def _metrics(raw: object) -> PerformanceMetrics:
    metrics = raw if isinstance(raw, dict) else {}
    return PerformanceMetrics(
        clicks=int_or_none(metrics.get("clicks")) or 0,
        impressions=int_or_none(metrics.get("impressions")) or 0,
        ctr=float_or_none(metrics.get("ctr")),
        position=float_or_none(metrics.get("position")),
    )


async def _comparison_metrics(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    compare_snapshot_id: uuid.UUID | None,
    dimension: str,
    keys: list[str],
) -> dict[str, PerformanceMetrics]:
    """The comparison snapshot's rows for exactly THIS page's keys.

    The table pages the selected snapshot and looks the comparison up by key,
    because two independently ordered result sets cannot be keyset-paged in
    parallel. The lookup is therefore bounded by the page size, and a key the
    comparison period never observed is simply absent — never defaulted to
    zero.
    """
    if compare_snapshot_id is None or not keys:
        return {}
    rows = (
        await session.scalars(
            select(PerformanceDimensionStat)
            .where(PerformanceDimensionStat.workspace_id == workspace_id)
            .where(PerformanceDimensionStat.project_id == project_id)
            .where(PerformanceDimensionStat.snapshot_id == compare_snapshot_id)
            .where(PerformanceDimensionStat.dimension == dimension)
            .where(PerformanceDimensionStat.dimension_key.in_(keys))
        )
    ).all()
    return {row.dimension_key: _metrics(row.metrics) for row in rows}


def _empty_page(dimension: str, page_size: int) -> PerformanceTablePage:
    return PerformanceTablePage(
        dimension=dimension,
        items=[],
        next_cursor=None,
        total_count=0,
        page_size=page_size,
    )


async def get_performance_table(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    snapshot_id: uuid.UUID,
    dimension: str | None = None,
    sort: str | None = None,
    cursor: str | None = None,
    page_size: int | None = None,
    compare_snapshot_id: uuid.UUID | None = None,
) -> PerformanceTablePage:
    """Page one dimension of a snapshot, with its comparison columns.

    The caller passes back the snapshot identity the dashboard returned, so
    the table and the chart above it always read the same projection. A
    snapshot outside this workspace/project resolves to an empty page rather
    than to another tenant's rows.
    """
    resolved_dimension = validate_dimension(dimension, PERFORMANCE_DEFAULT_DIMENSION)
    resolved_page_size = validate_page_size(page_size, PERFORMANCE_DEFAULT_PAGE_SIZE)
    sort_key, descending = parse_sort(
        sort, default=PERFORMANCE_DIMENSION_DEFAULT_SORT[resolved_dimension]
    )
    filters = table_filters(
        project_id=project_id,
        snapshot_id=snapshot_id,
        dimension=resolved_dimension,
        sort=f"-{sort_key}" if descending else sort_key,
        page_size=resolved_page_size,
    )
    keyset = (
        decode_table_cursor(cursor, scope=_TABLE_CURSOR_SCOPE, filters=filters)
        if cursor
        else None
    )
    snapshot = await load_snapshot_by_id(
        session,
        workspace_id=workspace_id,
        project_id=project_id,
        snapshot_id=snapshot_id,
    )
    if snapshot is None:
        return _empty_page(resolved_dimension, resolved_page_size)

    rows, next_cursor = await _page_rows(
        session,
        workspace_id=workspace_id,
        project_id=project_id,
        snapshot_id=snapshot_id,
        dimension=resolved_dimension,
        sort_key=sort_key,
        descending=descending,
        keyset=keyset,
        page_size=resolved_page_size,
        filters=filters,
    )
    comparison = await _comparison_metrics(
        session,
        workspace_id=workspace_id,
        project_id=project_id,
        compare_snapshot_id=compare_snapshot_id,
        dimension=resolved_dimension,
        keys=[row.dimension_key for row in rows],
    )
    counts = snapshot.dimension_counts or {}
    total = counts.get(resolved_dimension)
    return PerformanceTablePage(
        dimension=resolved_dimension,
        items=[
            PerformanceTableRow(
                dimension_key=row.dimension_key,
                display_value=row.display_value,
                metrics=_metrics(row.metrics),
                comparison_metrics=comparison.get(row.dimension_key),
            )
            for row in rows
        ],
        next_cursor=next_cursor,
        total_count=int(total) if isinstance(total, (int, float)) else 0,
        page_size=resolved_page_size,
    )
