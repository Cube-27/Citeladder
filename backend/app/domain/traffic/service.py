"""Persist deterministic traffic projections (the Performance write path).

Two executors, one fold. ``refresh_traffic_snapshot`` rebuilds the triggering
sync window and then derives the Performance PRESET FAMILY — one day-grained
snapshot per configured window length, all anchored to the latest complete
GSC evidence date, so a preset resolves whether the last sync ran today or
last week. ``project_performance_range`` materializes ONE display snapshot
for a user-requested custom or comparison window and does nothing else.

Both fold persisted integration metrics in bounded batches and replace a
snapshot's page/query/dimension rows atomically. Reads live in
``performance.py``; synchronization stays with integrations.
"""

from __future__ import annotations

import uuid
from datetime import date, timedelta

from sqlalchemy import and_, delete, func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config.integrations_contracts import (
    GRANT_STATUS_CONNECTED,
    MAPPING_STATUS_ACTIVE,
)
from app.core.config.integrations_datasets import DATASET_GSC_DAY_DAILY
from app.core.config.traffic import (
    PERFORMANCE_SNAPSHOT_WINDOW_DAYS,
    TRAFFIC_CONSUMED_DATASETS,
    TRAFFIC_DEFAULT_GRANULARITY,
    TRAFFIC_FORMULA_VERSION,
    TRAFFIC_NORMALIZATION_VERSION,
    TRAFFIC_SNAPSHOT_GRANULARITIES,
    TRAFFIC_SYNC_PROVIDERS,
)
from app.domain.analytics.enqueue import enqueue_demand_snapshot_refresh
from app.domain.analytics.tasks import payload_window, raise_if_task_terminal
from app.domain.demand.projection import stable_hash
from app.domain.traffic.projection import (
    SnapshotProjection,
    TrafficMetricRowInput,
    build_traffic_projection,
)
from app.models.analytics import AnalyticsTask
from app.models.integrations import (
    IntegrationConnection,
    IntegrationMetricRow,
    IntegrationOAuthGrant,
    IntegrationPropertyMapping,
)
from app.models.site_health.runtime import SiteHealthProfile
from app.models.site_health.urls import SiteUrl
from app.models.traffic import (
    PerformanceDimensionStat,
    TrafficPageStat,
    TrafficQueryStat,
    TrafficSnapshot,
)

# Bounded work per read batch: each batch is one cooperative-cancel boundary
# (the WRITE phase is a single transaction). Module constant (not config) —
# the same precedent as A6's ``_CLASSIFY_BATCH_SIZE``; tests monkeypatch it
# down to 1 to exercise the boundary per row.
_METRIC_ROW_BATCH_SIZE = 1000

__all__ = [
    "list_traffic_sync_connections",
    "performance_family_windows",
    "project_performance_range",
    "refresh_traffic_snapshot",
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
    after_id: uuid.UUID | None,
    limit: int,
) -> list[IntegrationMetricRow]:
    """One keyset batch of the window's consumed-dataset metric rows.

    Workspace + project scoped (invariant 5); the id-keyset order keeps the
    scan stable across batches. Latest-``resync_seq`` selection is applied
    by the pure projection (one owner of the rule), not here.
    """
    stmt = (
        select(IntegrationMetricRow)
        .where(IntegrationMetricRow.workspace_id == workspace_id)
        .where(IntegrationMetricRow.project_id == project_id)
        .where(IntegrationMetricRow.dataset.in_(sorted(TRAFFIC_CONSUMED_DATASETS)))
        .where(IntegrationMetricRow.date >= window_start)
        .where(IntegrationMetricRow.date <= window_end)
        .order_by(IntegrationMetricRow.id.asc())
        .limit(limit)
    )
    if after_id is not None:
        stmt = stmt.where(IntegrationMetricRow.id > after_id)
    return list((await session.scalars(stmt)).all())


def _to_input(row: IntegrationMetricRow) -> TrafficMetricRowInput:
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


async def _upsert_snapshot(
    session: AsyncSession,
    *,
    task: AnalyticsTask,
    window_start: date,
    window_end: date,
    granularity: str,
    projection: SnapshotProjection,
    coverage: dict[str, object] | None = None,
    preset_window_days: int | None = None,
) -> uuid.UUID:
    """The transactional upsert of the one current snapshot row.

    ``INSERT ... ON CONFLICT (project_id, window_start, window_end,
    granularity) DO UPDATE`` — concurrent refreshes serialize on the unique
    row and can never create a duplicate "current" snapshot (traffic.md
    section 3). The conflict target's workspace cannot drift (one project
    lives in one workspace), so only the projection payload + provenance +
    version stamps are updated.
    """
    stmt = (
        pg_insert(TrafficSnapshot)
        .values(
            workspace_id=task.workspace_id,
            project_id=task.project_id,
            window_start=window_start,
            window_end=window_end,
            granularity=granularity,
            metrics=projection.metrics,
            dimension_counts=projection.dimension_counts,
            coverage=coverage,
            preset_window_days=preset_window_days,
            source_metric_row_ids=projection.source_metric_row_ids,
            source_artifact_ids=projection.source_artifact_ids,
            formula_version=TRAFFIC_FORMULA_VERSION,
            normalization_version=TRAFFIC_NORMALIZATION_VERSION,
        )
        .on_conflict_do_update(
            index_elements=[
                "project_id",
                "window_start",
                "window_end",
                "granularity",
            ],
            set_={
                "metrics": projection.metrics,
                "dimension_counts": projection.dimension_counts,
                "coverage": coverage,
                "preset_window_days": preset_window_days,
                "source_metric_row_ids": projection.source_metric_row_ids,
                "source_artifact_ids": projection.source_artifact_ids,
                "formula_version": TRAFFIC_FORMULA_VERSION,
                "normalization_version": TRAFFIC_NORMALIZATION_VERSION,
                "created_at": func.now(),
            },
        )
        .returning(TrafficSnapshot.id)
    )
    snapshot_id = await session.scalar(stmt)
    if snapshot_id is None:  # RETURNING always yields the upserted row's id
        raise RuntimeError("traffic snapshot upsert returned no id")
    return snapshot_id


async def _resolve_site_url_ids(
    session: AsyncSession,
    *,
    task: AnalyticsTask,
    url_hashes: list[str],
) -> dict[str, uuid.UUID]:
    """Map page url_hashes to crawled ``SiteUrl`` ids (unmatched -> absent).

    The page join resolves by ``(project_id, url_hash)`` —
    ``uq_site_url_project_hash`` (traffic.md section 5); an unmatched page
    keeps ``site_url_id NULL`` and stays a valid measured page.
    """
    if not url_hashes:
        return {}
    stmt = (
        select(SiteUrl.url_hash, SiteUrl.id)
        .where(SiteUrl.workspace_id == task.workspace_id)
        .where(SiteUrl.project_id == task.project_id)
        .where(SiteUrl.url_hash.in_(url_hashes))
    )
    return {
        url_hash: site_url_id
        for url_hash, site_url_id in (await session.execute(stmt)).all()
    }


async def _replace_page_stats(
    session: AsyncSession,
    *,
    task: AnalyticsTask,
    snapshot_id: uuid.UUID,
    projection: SnapshotProjection,
) -> None:
    """Delete-then-insert the snapshot's page stat rows (same tx)."""
    await session.execute(
        delete(TrafficPageStat).where(TrafficPageStat.snapshot_id == snapshot_id)
    )
    if not projection.pages:
        return
    site_url_ids = await _resolve_site_url_ids(
        session, task=task, url_hashes=[page.url_hash for page in projection.pages]
    )
    await session.execute(
        pg_insert(TrafficPageStat).values(
            [
                {
                    "workspace_id": task.workspace_id,
                    "project_id": task.project_id,
                    "snapshot_id": snapshot_id,
                    "site_url_id": site_url_ids.get(page.url_hash),
                    "canonical_url": page.canonical_url,
                    "metrics": page.metrics,
                    "source_metric_row_ids": page.source_metric_row_ids,
                    "source_artifact_ids": page.source_artifact_ids,
                }
                for page in projection.pages
            ]
        )
    )


async def _replace_query_stats(
    session: AsyncSession,
    *,
    task: AnalyticsTask,
    snapshot_id: uuid.UUID,
    projection: SnapshotProjection,
) -> None:
    """Delete-then-insert the snapshot's query stat rows (same tx)."""
    await session.execute(
        delete(TrafficQueryStat).where(TrafficQueryStat.snapshot_id == snapshot_id)
    )
    if not projection.queries:
        return
    await session.execute(
        pg_insert(TrafficQueryStat).values(
            [
                {
                    "workspace_id": task.workspace_id,
                    "project_id": task.project_id,
                    "snapshot_id": snapshot_id,
                    "normalized_query": query.normalized_query,
                    "metrics": query.metrics,
                    "source_metric_row_ids": query.source_metric_row_ids,
                    "source_artifact_ids": query.source_artifact_ids,
                }
                for query in projection.queries
            ]
        )
    )


async def _replace_dimension_stats(
    session: AsyncSession,
    *,
    task: AnalyticsTask,
    snapshot_id: uuid.UUID,
    projection: SnapshotProjection,
) -> None:
    """Delete-then-insert the snapshot's generic dimension rows (same tx).

    All six Performance tables land in one statement, so a snapshot can
    never hold QUERIES from one fold beside DAYS from another.
    """
    await session.execute(
        delete(PerformanceDimensionStat).where(
            PerformanceDimensionStat.snapshot_id == snapshot_id
        )
    )
    if not projection.dimensions:
        return
    await session.execute(
        pg_insert(PerformanceDimensionStat).values(
            [
                {
                    "workspace_id": task.workspace_id,
                    "project_id": task.project_id,
                    "snapshot_id": snapshot_id,
                    "dimension": row.dimension,
                    "dimension_key": row.dimension_key,
                    "display_value": row.display_value,
                    "metrics": row.metrics,
                    "source_metric_row_ids": row.source_metric_row_ids,
                    "source_artifact_ids": row.source_artifact_ids,
                }
                for row in projection.dimensions
            ]
        )
    )


async def _evidence_coverage(
    session: AsyncSession, *, workspace_id: uuid.UUID, project_id: uuid.UUID
) -> dict[str, object]:
    """The project's observed evidence extent over the consumed datasets.

    Persisted with every snapshot so the surface can tell "this range is
    outside the imported history" apart from "this range measured zero"
    without scanning evidence at read time (invariant 7).
    """
    earliest, latest = (
        await session.execute(
            select(
                func.min(IntegrationMetricRow.date),
                func.max(IntegrationMetricRow.date),
            )
            .where(IntegrationMetricRow.workspace_id == workspace_id)
            .where(IntegrationMetricRow.project_id == project_id)
            .where(IntegrationMetricRow.dataset.in_(sorted(TRAFFIC_CONSUMED_DATASETS)))
        )
    ).one()
    return {
        "earliest_date": earliest.isoformat() if earliest is not None else None,
        "latest_date": latest.isoformat() if latest is not None else None,
        "covered_days": (
            (latest - earliest).days + 1
            if earliest is not None and latest is not None
            else 0
        ),
    }


async def _performance_anchor_date(
    session: AsyncSession, *, workspace_id: uuid.UUID, project_id: uuid.UUID
) -> date | None:
    """The latest complete GSC date the preset family anchors to.

    Read from ``gsc_day_daily`` — the same date-only report the headline
    totals come from — so a preset window can never end on a date the
    headline has no evidence for. ``None`` when the project has imported no
    GSC day rows yet; the family is then simply not derived.
    """
    return await session.scalar(
        select(func.max(IntegrationMetricRow.date))
        .where(IntegrationMetricRow.workspace_id == workspace_id)
        .where(IntegrationMetricRow.project_id == project_id)
        .where(IntegrationMetricRow.dataset == DATASET_GSC_DAY_DAILY)
    )


async def _write_snapshot(
    session: AsyncSession,
    *,
    task: AnalyticsTask,
    inputs: list[TrafficMetricRowInput],
    window_start: date,
    window_end: date,
    granularity: str,
    project_origin: str | None,
    coverage: dict[str, object] | None,
    preset_window_days: int | None = None,
) -> uuid.UUID:
    """Build and persist one snapshot with all of its stat rows (same tx)."""
    projection = build_traffic_projection(
        rows=inputs,
        window_start=window_start,
        window_end=window_end,
        granularity=granularity,
        project_origin=project_origin,
    )
    snapshot_id = await _upsert_snapshot(
        session,
        task=task,
        window_start=window_start,
        window_end=window_end,
        granularity=granularity,
        projection=projection,
        coverage=coverage,
        preset_window_days=preset_window_days,
    )
    await _replace_page_stats(
        session, task=task, snapshot_id=snapshot_id, projection=projection
    )
    await _replace_query_stats(
        session, task=task, snapshot_id=snapshot_id, projection=projection
    )
    await _replace_dimension_stats(
        session, task=task, snapshot_id=snapshot_id, projection=projection
    )
    return snapshot_id


def performance_family_windows(anchor: date) -> list[tuple[date, date]]:
    """The preset family's inclusive windows, newest edge first.

    Every window ENDS on ``anchor`` (the latest complete GSC date), so the
    presets are nested and one read of the widest span feeds them all.
    """
    return [
        (anchor - timedelta(days=days - 1), anchor)
        for days in PERFORMANCE_SNAPSHOT_WINDOW_DAYS
    ]


async def _collect_inputs(
    session: AsyncSession,
    session_factory: async_sessionmaker[AsyncSession],
    *,
    task: AnalyticsTask,
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    window_start: date,
    window_end: date,
) -> list[TrafficMetricRowInput]:
    """Read the span's consumed-dataset rows in bounded keyset batches.

    Cooperative cancel is checked at every batch boundary. Nothing is
    written during the read, so stopping here leaves no partial projection.
    """
    inputs: list[TrafficMetricRowInput] = []
    after_id: uuid.UUID | None = None
    while True:
        await _raise_if_task_terminal(session_factory, task.id)
        batch = await _metric_row_batch(
            session,
            workspace_id=workspace_id,
            project_id=project_id,
            window_start=window_start,
            window_end=window_end,
            after_id=after_id,
            limit=_METRIC_ROW_BATCH_SIZE,
        )
        if not batch:
            break
        inputs.extend(_to_input(row) for row in batch)
        after_id = batch[-1].id
        if len(batch) < _METRIC_ROW_BATCH_SIZE:
            break
    return inputs


async def _project_origin(
    session: AsyncSession, *, workspace_id: uuid.UUID, project_id: uuid.UUID
) -> str | None:
    return await session.scalar(
        select(SiteHealthProfile.root_url).where(
            SiteHealthProfile.workspace_id == workspace_id,
            SiteHealthProfile.project_id == project_id,
        )
    )


async def _refresh_sync_window(
    session: AsyncSession,
    *,
    task: AnalyticsTask,
    project_id: uuid.UUID,
    inputs: list[TrafficMetricRowInput],
    window_start: date,
    window_end: date,
    project_origin: str | None,
    coverage: dict[str, object],
) -> None:
    """Rebuild the triggering sync window at every configured granularity.

    This is the snapshot Demand reads by exact window, and the one
    implementation verification is triggered against, so its granularity set
    and its downstream chain are unchanged.
    """
    for granularity in sorted(TRAFFIC_SNAPSHOT_GRANULARITIES):
        snapshot_id = await _write_snapshot(
            session,
            task=task,
            inputs=inputs,
            window_start=window_start,
            window_end=window_end,
            granularity=granularity,
            project_origin=project_origin,
            coverage=coverage,
        )
        if granularity == TRAFFIC_DEFAULT_GRANULARITY:
            from app.domain.opportunities.verification import (
                enqueue_implementation_verification,
            )

            await enqueue_implementation_verification(
                session,
                workspace_id=task.workspace_id,
                project_id=project_id,
                trigger_kind="traffic_snapshot",
                trigger_id=snapshot_id,
                trigger_revision=str(task.id),
            )


async def _refresh_performance_family(
    session: AsyncSession,
    *,
    task: AnalyticsTask,
    inputs: list[TrafficMetricRowInput],
    anchor: date,
    project_origin: str | None,
    coverage: dict[str, object],
) -> None:
    """Derive the Performance presets, all anchored at the latest GSC date.

    Day granularity only: the surface charts daily buckets and offers no
    bucket control, so week/month rows for these windows would never be read.
    The family fires no verification and no Demand hand-off — those belong to
    the sync window above, and repeating them per preset would recompute the
    same downstream work several times for one sync.
    """
    for window_start, window_end in performance_family_windows(anchor):
        await _write_snapshot(
            session,
            task=task,
            inputs=inputs,
            window_start=window_start,
            window_end=window_end,
            granularity=TRAFFIC_DEFAULT_GRANULARITY,
            project_origin=project_origin,
            coverage=coverage,
            # Marks the row as THIS preset's snapshot, so preset resolution
            # can never land on a same-length custom display range. The
            # family writes after the sync window, so a window that is both
            # keeps the marker.
            preset_window_days=(window_end - window_start).days + 1,
        )


async def refresh_traffic_snapshot(
    session_factory: async_sessionmaker[AsyncSession], task: AnalyticsTask
) -> None:
    """``traffic_snapshot_refresh`` executor: sync window + preset family.

    Read phase: ONE keyset scan over the union of the triggering sync window
    and the preset family's widest span, in bounded batches with a
    cooperative-cancel check at every boundary. Write phase: the sync window
    at every configured granularity, then the day-grained preset family, then
    the Demand hand-off — ALL in ONE transaction, so a refresh never leaves a
    half-written snapshot family behind.
    """
    if task.project_id is None:
        raise ValueError("traffic_snapshot_refresh task missing project_id")
    window_start, window_end = payload_window(task, kind="traffic_snapshot_refresh")
    async with session_factory() as session:
        project_origin = await _project_origin(
            session, workspace_id=task.workspace_id, project_id=task.project_id
        )
        anchor = await _performance_anchor_date(
            session, workspace_id=task.workspace_id, project_id=task.project_id
        )
        # One scan covers both write phases: the family's windows all end at
        # the anchor and are nested, so the widest of them plus the sync
        # window bounds every row either phase can need.
        family = performance_family_windows(anchor) if anchor is not None else []
        read_start = min([window_start, *(start for start, _ in family)])
        read_end = max([window_end, *(end for _, end in family)])
        inputs = await _collect_inputs(
            session,
            session_factory,
            task=task,
            workspace_id=task.workspace_id,
            project_id=task.project_id,
            window_start=read_start,
            window_end=read_end,
        )
        coverage = await _evidence_coverage(
            session, workspace_id=task.workspace_id, project_id=task.project_id
        )
        await _refresh_sync_window(
            session,
            task=task,
            project_id=task.project_id,
            inputs=inputs,
            window_start=window_start,
            window_end=window_end,
            project_origin=project_origin,
            coverage=coverage,
        )
        if anchor is not None:
            await _refresh_performance_family(
                session,
                task=task,
                inputs=inputs,
                anchor=anchor,
                project_origin=project_origin,
                coverage=coverage,
            )
        await _enqueue_demand_refresh(
            session,
            task=task,
            inputs=inputs,
            window_start=window_start,
            window_end=window_end,
        )
        await session.commit()


async def project_performance_range(
    session_factory: async_sessionmaker[AsyncSession], task: AnalyticsTask
) -> None:
    """``performance_range_projection`` executor: ONE display snapshot.

    Materializes the day-grained snapshot for a user-requested custom or
    comparison window over ALREADY-PERSISTED evidence, and does nothing else:
    it calls no provider, refreshes no Demand snapshot, enqueues no
    opportunity recompute or implementation verification, and touches no
    other product projection. A window a snapshot already covers is left
    exactly as it is — a display request must never replace the preset or
    sync-window snapshot another surface is reading.
    """
    if task.project_id is None:
        raise ValueError("performance_range_projection task missing project_id")
    window_start, window_end = payload_window(task, kind="performance_range_projection")
    async with session_factory() as session:
        existing = await session.scalar(
            select(TrafficSnapshot.id).where(
                TrafficSnapshot.workspace_id == task.workspace_id,
                TrafficSnapshot.project_id == task.project_id,
                TrafficSnapshot.window_start == window_start,
                TrafficSnapshot.window_end == window_end,
                TrafficSnapshot.granularity == TRAFFIC_DEFAULT_GRANULARITY,
            )
        )
        if existing is not None:
            return
        project_origin = await _project_origin(
            session, workspace_id=task.workspace_id, project_id=task.project_id
        )
        inputs = await _collect_inputs(
            session,
            session_factory,
            task=task,
            workspace_id=task.workspace_id,
            project_id=task.project_id,
            window_start=window_start,
            window_end=window_end,
        )
        coverage = await _evidence_coverage(
            session, workspace_id=task.workspace_id, project_id=task.project_id
        )
        await _write_snapshot(
            session,
            task=task,
            inputs=inputs,
            window_start=window_start,
            window_end=window_end,
            granularity=TRAFFIC_DEFAULT_GRANULARITY,
            project_origin=project_origin,
            coverage=coverage,
        )
        await session.commit()


async def _enqueue_demand_refresh(
    session: AsyncSession,
    *,
    task: AnalyticsTask,
    inputs: list[TrafficMetricRowInput],
    window_start: date,
    window_end: date,
) -> None:
    if task.project_id is None:
        raise ValueError("traffic refresh requires project_id")
    source_revision = stable_hash(
        {
            "metric_row_ids": sorted(str(row.id) for row in inputs),
            "window": [window_start.isoformat(), window_end.isoformat()],
        }
    )[:24]
    await enqueue_demand_snapshot_refresh(
        session,
        workspace_id=task.workspace_id,
        project_id=task.project_id,
        window_start=window_start,
        window_end=window_end,
        source_revision=source_revision,
    )


# =========================================================================
# A11 — traffic-sync fan-out read (the enqueue stays in integrations)
# =========================================================================


async def list_traffic_sync_connections(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
) -> list[IntegrationConnection]:
    """The distinct ACTIVE mapped GSC/GA4 connections of the project.

    The ``POST /projects/{id}/traffic/sync`` fan-out set: every ACTIVE
    ``IntegrationPropertyMapping`` of the project joined to its connection,
    restricted to the Traffic-consumed providers (``TRAFFIC_SYNC_PROVIDERS``
    — Bing carries no Traffic dataset) on a CONNECTED grant. One entry per
    connection (a connection with several mapped properties gets ONE run —
    sync runs are connection-scoped). Read-only; the enqueue per connection
    is owned by ``domain/integrations/sync.py`` (invariant 2).
    """
    stmt = (
        select(IntegrationConnection)
        .join(
            IntegrationPropertyMapping,
            and_(
                IntegrationPropertyMapping.workspace_id
                == IntegrationConnection.workspace_id,
                IntegrationPropertyMapping.connection_id == IntegrationConnection.id,
            ),
        )
        .join(
            IntegrationOAuthGrant,
            and_(
                IntegrationOAuthGrant.workspace_id
                == IntegrationConnection.workspace_id,
                IntegrationOAuthGrant.id == IntegrationConnection.grant_id,
            ),
        )
        .where(IntegrationConnection.workspace_id == workspace_id)
        .where(IntegrationPropertyMapping.project_id == project_id)
        .where(IntegrationPropertyMapping.status == MAPPING_STATUS_ACTIVE)
        .where(IntegrationConnection.provider.in_(sorted(TRAFFIC_SYNC_PROVIDERS)))
        .where(IntegrationOAuthGrant.status == GRANT_STATUS_CONNECTED)
        .order_by(
            IntegrationConnection.created_at.asc(), IntegrationConnection.id.asc()
        )
        .distinct()
    )
    return list((await session.scalars(stmt)).all())
