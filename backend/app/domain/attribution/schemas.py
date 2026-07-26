# Commerce attribution API DTOs (WS-B) — projections only (invariant 7).
#
# These response models are the backend source of truth for the schema
# reconcile: every shape mirrors the frontend zod schemas (the Attribution
# section: ``attributionMetricsSchema`` / ``attributionSnapshotSchema``)
# EXACTLY — no missing keys, no extra keys (the frontend
# ``strictValidate`` fails loud on any drift). Nullability is contractual:
# null metric values are an UNMEASURED/unavailable method (never an
# invented zero), null denominators stay null, ``source_granularity`` is
# non-null only on available A1 rows, and ``currency`` is non-null on
# every available revenue-bearing row.
from __future__ import annotations

import uuid
from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class StrictResponseModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class AttributionMetricSet(StrictResponseModel):
    """One metric bundle (``attributionMetricSetSchema``).

    Non-null revenue/AOV requires non-null currency; null denominators
    (orders = 0 / sessions = 0) keep AOV/conversion-rate null.
    """

    currency: str | None
    revenue: float | None
    orders: int | None
    average_order_value: float | None
    sessions: int | None
    conversion_rate: float | None


class AttributionSourceRow(StrictResponseModel):
    """One per-AI-source row of an available method partition."""

    ai_source: str
    currency: str
    metrics: AttributionMetricSet


class AttributionProductRow(StrictResponseModel):
    """One per-product row (``attributionProductRowSchema``).

    ``ai_source`` is null and ``source_label`` carries the channel-group
    label when the GA4 item granularity is reduced (never a guessed
    source); ``product_id`` is null when the itemId resolves to no
    own-catalog sku.
    """

    product_id: uuid.UUID | None
    sku: str
    name: str
    ai_source: str | None
    source_label: str
    currency: str
    revenue: float | None
    orders: int | None


class AttributionMethodMetrics(StrictResponseModel):
    """One method/currency partition (``attributionMethodMetricsSchema``).

    ``source_granularity`` is non-null (``session_source_medium`` |
    ``default_channel_group``) ONLY on available A1 rows; ``currency`` is
    non-null on every available row. An unavailable method reports
    ``no_data``/``not_connected`` with null metrics and empty sections —
    never a fabricated zero.
    """

    method: str
    state: str
    source_granularity: str | None
    reduced_granularity: bool
    currency: str | None
    coverage_rate: float | None
    totals: AttributionMetricSet
    by_ai_source: list[AttributionSourceRow]
    by_product: list[AttributionProductRow]


class AttributionCoverage(StrictResponseModel):
    total_latest_orders: int
    orders_with_evidence: int
    linked_ai_orders: int
    unattributed_orders: int
    evidence_coverage_rate: float | None
    attributed_share: float | None
    window_start: str
    window_end: str


class AttributionDelta(StrictResponseModel):
    """One within-currency A1-minus-A2 delta (values may be negative).

    Non-``comparable`` rows carry null metric values. Empty in this scope
    (A2 lands with the Shopify order facts).
    """

    currency: str
    state: str
    revenue: float | None
    orders: int | None
    average_order_value: float | None
    conversion_rate: float | None


class AttributionUnattributed(StrictResponseModel):
    """Orders without a current A2 link (empty in this scope)."""

    currency: str
    orders: int
    order_share: float | None
    revenue: float | None


class AttributionStatisticalAllocation(StrictResponseModel):
    """One statistical allocation row (never emitted in this scope)."""

    ai_source: str
    currency: str
    estimated_revenue: float | None
    estimated_orders: float | None
    estimated_share: float | None


class AttributionStatistical(StrictResponseModel):
    """The statistical namespace: persistently ``not_offered`` here."""

    state: str
    sample_size: int | None
    allocations: list[AttributionStatisticalAllocation]


class AttributionDeterministic(StrictResponseModel):
    """The deterministic namespace: a1 (GA4 platform) + a2/delta/unattributed."""

    a1: list[AttributionMethodMetrics]
    a2: list[AttributionMethodMetrics]
    delta: list[AttributionDelta]
    unattributed: list[AttributionUnattributed]
    coverage: AttributionCoverage


class AttributionMetrics(StrictResponseModel):
    """The persisted + served attribution metrics document."""

    deterministic: AttributionDeterministic
    statistical: AttributionStatistical


class CommerceAttributionResponse(StrictResponseModel):
    """``GET /projects/{id}/commerce/attribution`` — the persisted snapshot.

    Served from the persisted ``AttributionSnapshot`` matching
    ``(window, granularity)`` (or the latest at the granularity when the
    window is omitted); an absent snapshot yields the empty contract,
    never a recomputation (invariant 7).
    """

    project_id: uuid.UUID
    window_start: str
    window_end: str
    granularity: str
    metrics: AttributionMetrics
    source_link_ids: list[uuid.UUID]
    source_order_fact_ids: list[uuid.UUID]
    source_metric_row_ids: list[uuid.UUID]
    source_snapshot_ids: list[uuid.UUID]
    formula_version: str
    analyzer_version: str
    created_at: str | None


class AttributionOrderLineItem(StrictResponseModel):
    sku: str
    quantity: int
    unit_price: str
    product_id: uuid.UUID | None


class AttributionOrderRow(StrictResponseModel):
    fact_id: uuid.UUID
    occurred_at: str
    line_items: list[AttributionOrderLineItem]
    amount: float
    currency: str
    attribution_state: str
    method: str | None
    ai_source: str | None
    confidence: str | None
    rule_version: str | None


class AttributionOrdersPage(StrictResponseModel):
    items: list[AttributionOrderRow]
    next_cursor: str | None


class AttributionRecomputeRequest(StrictResponseModel):
    from_date: date | None = Field(default=None, alias="from")
    to_date: date | None = Field(default=None, alias="to")


class AttributionRecomputeResponse(StrictResponseModel):
    task_id: uuid.UUID
    project_id: uuid.UUID
    status: Literal[
        "queued",
        "leased",
        "running",
        "retry_wait",
        "succeeded",
        "failed",
        "cancelled",
    ]
    error_code: str
    updated_at: str
    completed_at: str | None


# Plan vocabulary aliases kept explicit without duplicating response shapes.
AttributionMethodSummary = AttributionMethodMetrics
UnattributedSummary = AttributionUnattributed
AttributionStatisticalMetrics = AttributionStatistical
