# Performance API DTOs — projections only (invariant 7).
#
# These response models are the backend source of truth for the C6 schema
# reconcile: every shape mirrors the frontend zod schemas in
# ``frontend/lib/api/schemas/performance.ts`` EXACTLY — no missing keys, no
# extra keys (the frontend ``strictValidate`` fails loud on any drift).
#
# Nullability is CONTRACTUAL, and every null means "not measured", never a
# zero the reader could mistake for an observation:
#   - a null series point is an unmeasured bucket (a chart gap);
#   - null ``clicks``/``impressions`` mean the window has no ``gsc_day_daily``
#     evidence at all, not that nobody clicked;
#   - null ``ctr``/``position`` mean the aggregate had zero impressions;
#   - null ``sessions``/``conversions`` mean no included GA4 row fed the
#     window;
#   - a null ``comparison`` block means no comparison was requested, and a
#     comparison block with a null ``snapshot_id`` means one was requested
#     but its window is not projected (yet, or at all).
from __future__ import annotations

import uuid
from typing import Literal

from pydantic import BaseModel

# The dated metric-series point is the ONE chart-point contract shared with
# AI Referrals — imported from its owner (invariant 2), never forked.
from app.domain.analytics.schemas import MetricSeriesPoint

EvidenceState = Literal["not_run", "observed_zero", "available"]


class PerformanceTotals(BaseModel):
    """Window totals: the four GSC measures plus the compact GA4 pair."""

    clicks: int | None
    impressions: int | None
    ctr: float | None
    position: float | None
    sessions: int | None
    conversions: int | None


class PerformanceSeries(BaseModel):
    """The four GSC chart series, bucketed by day (nullable points).

    GA4 is deliberately absent: it renders as a compact non-interactive
    summary row, not as chart series, so the chart's four selectable metrics
    all come from one provider and one dataset.
    """

    clicks: list[MetricSeriesPoint]
    impressions: list[MetricSeriesPoint]
    ctr: list[MetricSeriesPoint]
    position: list[MetricSeriesPoint]


class PerformanceWindow(BaseModel):
    """One resolved window: its snapshot identity, dates, totals and series.

    ``snapshot_id`` is null when the window has no persisted projection. The
    client passes a non-null id straight back on every tabular request, so a
    chart and its tables always read the SAME persisted projection rather
    than each recomputing calendar bounds.
    """

    snapshot_id: uuid.UUID | None
    window_start: str
    window_end: str
    evidence_state: EvidenceState
    totals: PerformanceTotals
    series: PerformanceSeries


class PerformanceCoverage(BaseModel):
    """The project's observed evidence extent (persisted with the snapshot).

    Lets the surface say "outside the imported history" instead of showing a
    range that measured nothing as though it measured zero, and gates the
    year-over-year comparison, which needs more than a year of evidence.
    """

    earliest_date: str | None
    latest_date: str | None
    covered_days: int


class PerformanceDimensionCounts(BaseModel):
    """Exact persisted row count per table, written with the rows counted."""

    query: int
    page: int
    country: int
    device: int
    search_appearance: int
    day: int


class PerformanceDashboardResponse(BaseModel):
    """``GET /projects/{id}/performance`` — the selected window, and its peer.

    Served from persisted ``TrafficSnapshot`` rows. An unresolved range
    yields an empty window payload (null snapshot id, ``not_run``), never a
    recomputation and never a 404.
    """

    project_id: uuid.UUID
    range: str
    compare: str
    selected: PerformanceWindow
    comparison: PerformanceWindow | None
    coverage: PerformanceCoverage
    dimension_counts: PerformanceDimensionCounts
    formula_version: str
    normalization_version: str


class PerformanceMetrics(BaseModel):
    """One table row's GSC measures."""

    clicks: int
    impressions: int
    ctr: float | None
    position: float | None


class PerformanceTableRow(BaseModel):
    """One persisted dimension row, optionally paired with its comparison.

    ``comparison_metrics`` is null when no comparison snapshot was named, or
    when this key has no row in it — a key absent from the comparison period
    was NOT observed there, which is different from having been observed at
    zero, so the difference column renders unavailable rather than falling
    back to the row's own value.
    """

    dimension_key: str
    display_value: str
    metrics: PerformanceMetrics
    comparison_metrics: PerformanceMetrics | None


class PerformanceTablePage(BaseModel):
    """The keyset envelope (contract C4) plus the exact persisted total.

    ``total_count`` is read from the snapshot's persisted per-dimension
    counts — never a ``COUNT(*)`` issued per page navigation.
    """

    dimension: str
    items: list[PerformanceTableRow]
    next_cursor: str | None
    total_count: int
    page_size: int


class PerformanceRangeTaskResponse(BaseModel):
    """The custom/comparison range projection task's identity and state."""

    task_id: uuid.UUID
    status: str
    window_start: str
    window_end: str
