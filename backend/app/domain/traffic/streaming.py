"""The projection's READ half: one bounded, streaming scan of metric rows.

Split from ``service.py`` (which owns the write path) because the two are
separate concerns and the module has one size budget. Everything here is
about getting evidence OUT of ``integration_metric_rows`` cheaply:

- ``_metric_row_batch`` — one keyset page, ordered by re-sync identity so
  revisions of the same observation arrive adjacent.
- ``stream_metric_rows`` — the scan itself, folding each batch into every
  consumer and releasing it. This is what bounds a refresh's memory on
  DISTINCT KEYS rather than on the window's row count, and so what makes a
  long window projectable at all.
- ``DemandRevision`` — the Demand hand-off's source digest, accumulated as
  rows go by instead of from a retained id list.

No writes happen here, so a cooperative cancel at any batch boundary leaves
nothing partial behind.
"""

from __future__ import annotations

import hashlib
import uuid
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date
from typing import Any

from sqlalchemy import select, tuple_
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config.traffic import TRAFFIC_CONSUMED_DATASETS
from app.domain.analytics.tasks import raise_if_task_terminal
from app.domain.demand.projection import stable_hash
from app.domain.traffic.projection import (
    TrafficMetricRowInput,
    TrafficProjectionBuilder,
)
from app.models.analytics import AnalyticsTask
from app.models.integrations import IntegrationMetricRow

# Bounded work per read batch: each batch is one cooperative-cancel boundary
# (the WRITE phase is a single transaction). Module constant (not config) —
# the same precedent as A6's ``_CLASSIFY_BATCH_SIZE``; tests monkeypatch it
# down to 1 to exercise the boundary per row.
_METRIC_ROW_BATCH_SIZE = 1000

# The read scan's ordering: re-sync identity, then revision, then id. Keeps
# every revision of one observation adjacent so the projection can dedup as
# a stream (see ``_metric_row_batch``).
_METRIC_ROW_SCAN_ORDER = (
    IntegrationMetricRow.property_ref.asc(),
    IntegrationMetricRow.provider.asc(),
    IntegrationMetricRow.dataset.asc(),
    IntegrationMetricRow.date.asc(),
    IntegrationMetricRow.dimension_key.asc(),
    IntegrationMetricRow.resync_seq.asc(),
    IntegrationMetricRow.id.asc(),
)

__all__ = [
    "DemandRevision",
    "stream_metric_rows",
    "to_projection_input",
]


async def _raise_if_task_terminal(
    session_factory: async_sessionmaker[AsyncSession], task_id: uuid.UUID | None
) -> None:
    """Cooperative-cancel boundary check (invariant 9).

    Thin label adapter over the single owner (``domain/analytics/tasks.py``)
    so this executor's message names its own batch boundary and tests keep
    a module-local patch point. The refresh writes nothing before its
    single write transaction, so stopping here leaves no partial
    projection behind.
    """
    await raise_if_task_terminal(session_factory, task_id, boundary="metric-row batch")


async def _metric_row_batch(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    window_start: date,
    window_end: date,
    after: tuple[Any, ...] | None,
    limit: int,
) -> list[IntegrationMetricRow]:
    """One keyset batch of the window's consumed-dataset metric rows.

    Workspace + project scoped (invariant 5). Ordered by the metric row's
    RE-SYNC IDENTITY (property, provider, dataset, date, dimension_key) and
    then ``resync_seq``, so every revision of one observation arrives
    adjacent and in ascending revision order. That is what lets the
    projection builder apply latest-``resync_seq`` selection as a STREAM,
    holding one candidate row rather than one per observation in the window
    — the bound that makes a long window affordable.

    ``id`` is the final ordering column purely to make the keyset total:
    the identity tuple plus ``resync_seq`` is already unique
    (``uq_integration_metric_row_identity``), so it never actually breaks a
    tie — it just gives the cursor a single unambiguous column to resume on.
    Latest-revision SELECTION still belongs to the pure projection (one
    owner of the rule); this only guarantees the order it can rely on.
    """
    stmt = (
        select(IntegrationMetricRow)
        .where(IntegrationMetricRow.workspace_id == workspace_id)
        .where(IntegrationMetricRow.project_id == project_id)
        .where(IntegrationMetricRow.dataset.in_(sorted(TRAFFIC_CONSUMED_DATASETS)))
        .where(IntegrationMetricRow.date >= window_start)
        .where(IntegrationMetricRow.date <= window_end)
        .order_by(*_METRIC_ROW_SCAN_ORDER)
        .limit(limit)
    )
    if after is not None:
        stmt = stmt.where(_metric_row_scan_cursor() > after)
    return list((await session.scalars(stmt)).all())


def _metric_row_scan_cursor() -> Any:
    """The scan's ordering columns as one row-value cursor expression."""
    return tuple_(*_METRIC_ROW_SCAN_ORDER)


def _scan_cursor_value(row: IntegrationMetricRow) -> tuple[Any, ...]:
    """The cursor value of the last row in a batch."""
    return (
        row.property_ref,
        row.provider,
        row.dataset,
        row.date,
        row.dimension_key,
        row.resync_seq,
        row.id,
    )


def to_projection_input(row: IntegrationMetricRow) -> TrafficMetricRowInput:
    return TrafficMetricRowInput(
        id=row.id,
        property_ref=row.property_ref,
        provider=row.provider,
        dataset=row.dataset,
        date=row.date,
        dimension_key=row.dimension_key,
        metrics=row.metrics,
        source_artifact_id=row.source_artifact_id,
        resync_seq=row.resync_seq,
        importer_version=row.importer_version,
    )


@dataclass
class DemandRevision:
    """The Demand hand-off's source revision, accumulated as rows stream by.

    The hand-off used to hash the sorted ids of every row in the window,
    which meant holding them. It hashes the same evidence incrementally
    instead: an order-independent XOR fold over the sync window's row ids
    plus their count, so the digest still changes whenever the contributing
    evidence does, without a list.
    """

    window_start: date
    window_end: date
    count: int = 0
    digest: int = 0

    def add(self, row: TrafficMetricRowInput) -> None:
        if not (self.window_start <= row.date <= self.window_end):
            return
        self.count += 1
        self.digest ^= int.from_bytes(
            hashlib.blake2b(str(row.id).encode("utf-8"), digest_size=16).digest(),
            "big",
        )

    def source_revision(self) -> str:
        return stable_hash(
            {
                "metric_row_count": self.count,
                "metric_row_digest": f"{self.digest:032x}",
                "window": [
                    self.window_start.isoformat(),
                    self.window_end.isoformat(),
                ],
            }
        )[:24]


async def stream_metric_rows(
    session: AsyncSession,
    session_factory: async_sessionmaker[AsyncSession],
    *,
    task: AnalyticsTask,
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    window_start: date,
    window_end: date,
    consumers: Sequence[TrafficProjectionBuilder],
    demand: DemandRevision | None = None,
) -> None:
    """Scan the span once and fold every batch into each consumer.

    The read is bounded keyset batches with a cooperative-cancel check at
    every boundary, exactly as before; what changed is that a batch is
    FOLDED and released instead of accumulated, so peak memory is the batch
    plus each builder's distinct keys — never the window's row count.

    One scan feeds every window because the builders each filter to their
    own window as they fold; the caller sizes the scan to their union.
    """
    after: tuple[Any, ...] | None = None
    while True:
        await _raise_if_task_terminal(session_factory, task.id)
        batch = await _metric_row_batch(
            session,
            workspace_id=workspace_id,
            project_id=project_id,
            window_start=window_start,
            window_end=window_end,
            after=after,
            limit=_METRIC_ROW_BATCH_SIZE,
        )
        if not batch:
            break
        inputs = [to_projection_input(row) for row in batch]
        for builder in consumers:
            # The scan is ordered by identity, so each builder can retire an
            # observation as soon as the next one starts.
            builder.add_batch(inputs, ordered_by_identity=True)
        if demand is not None:
            for row in inputs:
                demand.add(row)
        after = _scan_cursor_value(batch[-1])
        if len(batch) < _METRIC_ROW_BATCH_SIZE:
            break
