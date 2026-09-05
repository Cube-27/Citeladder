"""Persist deterministic traffic projections (the Performance write path).

Two executors, one fold. ``refresh_traffic_snapshot`` rebuilds the triggering
sync window and then derives the Performance PRESET FAMILY — one day-grained
snapshot per configured window length, all anchored to the latest complete
GSC evidence date, so a preset resolves whether the last sync ran today or
last week. ``project_performance_range`` materializes ONE display snapshot
for a user-requested custom or comparison window and does nothing else.

Both fold persisted integration metrics and replace a snapshot's
page/query/dimension rows atomically. The bounded, streaming SCAN that feeds
them lives in ``streaming.py``; the surface's own reads live in
``performance.py``; synchronization stays with integrations.
"""

from __future__ import annotations

import uuid
from collections.abc import Sequence
from dataclasses import dataclass
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
from app.domain.analytics.tasks import payload_window
from app.domain.traffic.projection import (
    SnapshotProjection,
    TrafficProjectionBuilder,
)
from app.domain.traffic.streaming import DemandRevision, stream_metric_rows
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

__all__ = [
    "list_traffic_sync_connections",
    "performance_family_windows",
    "project_performance_range",
    "refresh_traffic_snapshot",
]


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
    projection: SnapshotProjection,
    window_start: date,
    window_end: date,
    granularity: str,
    coverage: dict[str, object] | None,
    preset_window_days: int | None = None,
) -> uuid.UUID:
    """Persist one already-folded projection with its stat rows (same tx)."""
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


async def _project_origin(
    session: AsyncSession, *, workspace_id: uuid.UUID, project_id: uuid.UUID
) -> str | None:
    return await session.scalar(
        select(SiteHealthProfile.root_url).where(
            SiteHealthProfile.workspace_id == workspace_id,
            SiteHealthProfile.project_id == project_id,
        )
    )


@dataclass
class _SnapshotTarget:
    """One snapshot the refresh will write, and the builder folding it.

    A target owns its own builder, so the single scan below folds each row
    into every window that contains it exactly once. ``preset_window_days``
    marks the row as a preset's snapshot; ``verifies`` marks the one target
    that triggers implementation verification.
    """

    window_start: date
    window_end: date
    granularity: str
    builder: TrafficProjectionBuilder
    preset_window_days: int | None = None
    verifies: bool = False


def _snapshot_target(
    *,
    window_start: date,
    window_end: date,
    granularity: str,
    project_origin: str | None,
    preset_window_days: int | None = None,
    verifies: bool = False,
) -> _SnapshotTarget:
    return _SnapshotTarget(
        window_start=window_start,
        window_end=window_end,
        granularity=granularity,
        builder=TrafficProjectionBuilder(
            window_start=window_start,
            window_end=window_end,
            granularity=granularity,
            project_origin=project_origin,
        ),
        preset_window_days=preset_window_days,
        verifies=verifies,
    )


def _refresh_targets(
    *,
    window_start: date,
    window_end: date,
    anchor: date | None,
    project_origin: str | None,
) -> list[_SnapshotTarget]:
    """Every snapshot one refresh writes: the sync window, then the presets.

    Both are rebuilt at every configured granularity. The sync window is the
    snapshot Demand reads by exact window and the one verification triggers
    against; the preset family is what the Performance surface lands on, and
    that surface DOES offer a bucket control — a preset written at day grain
    alone leaves Weekly and Monthly with no rows to read, which the surface
    can only report as a range nothing has imported.

    One extra builder per preset per bucket is cheap next to that: the scan
    below is shared, so the added cost is the fold, not another read.

    The family is listed AFTER the sync window so a window that is both
    keeps its preset marker (the later write wins the upsert).
    """
    targets = [
        _snapshot_target(
            window_start=window_start,
            window_end=window_end,
            granularity=granularity,
            project_origin=project_origin,
            verifies=granularity == TRAFFIC_DEFAULT_GRANULARITY,
        )
        for granularity in sorted(TRAFFIC_SNAPSHOT_GRANULARITIES)
    ]
    if anchor is None:
        return targets
    targets.extend(
        _snapshot_target(
            window_start=preset_start,
            window_end=preset_end,
            granularity=granularity,
            project_origin=project_origin,
            preset_window_days=(preset_end - preset_start).days + 1,
        )
        for preset_start, preset_end in performance_family_windows(anchor)
        for granularity in sorted(TRAFFIC_SNAPSHOT_GRANULARITIES)
    )
    return targets


async def _write_targets(
    session: AsyncSession,
    *,
    task: AnalyticsTask,
    project_id: uuid.UUID,
    targets: Sequence[_SnapshotTarget],
    coverage: dict[str, object],
) -> None:
    """Persist every folded target, in order, inside the caller's tx.

    Only the sync window's default-granularity target hands off to
    verification; repeating that per preset would recompute the same
    downstream work several times for one sync.
    """
    for target in targets:
        snapshot_id = await _write_snapshot(
            session,
            task=task,
            projection=target.builder.build(),
            window_start=target.window_start,
            window_end=target.window_end,
            granularity=target.granularity,
            coverage=coverage,
            preset_window_days=target.preset_window_days,
        )
        if not target.verifies:
            continue
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


async def refresh_traffic_snapshot(
    session_factory: async_sessionmaker[AsyncSession], task: AnalyticsTask
) -> None:
    """``traffic_snapshot_refresh`` executor: sync window + preset family.

    Read phase: ONE keyset scan over the union of the triggering sync window
    and the preset family's widest span, in bounded batches with a
    cooperative-cancel check at every boundary. Each batch is FOLDED into
    every target's builder and released, so the executor's memory bounds on
    distinct keys rather than on the window's row count — what lets a long
    window be projected at all.

    Write phase: every folded target, then the Demand hand-off — ALL in ONE
    transaction, so a refresh never leaves a half-written snapshot family
    behind.
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
        targets = _refresh_targets(
            window_start=window_start,
            window_end=window_end,
            anchor=anchor,
            project_origin=project_origin,
        )
        # One scan covers every target: the family's windows all end at the
        # anchor and are nested, so the widest of them plus the sync window
        # bounds every row any target can need.
        read_start = min(target.window_start for target in targets)
        read_end = max(target.window_end for target in targets)
        demand = DemandRevision(window_start=window_start, window_end=window_end)
        await stream_metric_rows(
            session,
            session_factory,
            task=task,
            workspace_id=task.workspace_id,
            project_id=task.project_id,
            window_start=read_start,
            window_end=read_end,
            consumers=[target.builder for target in targets],
            demand=demand,
        )
        coverage = await _evidence_coverage(
            session, workspace_id=task.workspace_id, project_id=task.project_id
        )
        await _write_targets(
            session,
            task=task,
            project_id=task.project_id,
            targets=targets,
            coverage=coverage,
        )
        await _enqueue_demand_refresh(session, task=task, demand=demand)
        await session.commit()


async def project_performance_range(
    session_factory: async_sessionmaker[AsyncSession], task: AnalyticsTask
) -> None:
    """``performance_range_projection`` executor: ONE display window.

    Materializes a user-requested custom or comparison window over
    ALREADY-PERSISTED evidence at every bucket size the chart can ask for,
    and does nothing else: it calls no provider, refreshes no Demand
    snapshot, enqueues no opportunity recompute or implementation
    verification, and touches no other product projection. A bucket size the
    window already has is left exactly as it is — a display request must
    never replace the preset or sync-window snapshot another surface is
    reading — so a window already complete is a no-op.

    All three granularities rather than day alone, because this is the path
    that heals a window the surface reported as unprojected: the reader who
    switched the chart to Weekly is waiting on the WEEK rows, and rebuilding
    only the day rows would leave the request that queued this task
    unanswered and requeuing forever.

    This is the one path a user can point at a long window, so it is also
    the one that most needs the streaming fold: the request is bounded by
    ``PERFORMANCE_CUSTOM_RANGE_MAX_DAYS``, not by a sync window. The three
    builders share that single scan.
    """
    if task.project_id is None:
        raise ValueError("performance_range_projection task missing project_id")
    window_start, window_end = payload_window(task, kind="performance_range_projection")
    async with session_factory() as session:
        existing = set(
            (
                await session.scalars(
                    select(TrafficSnapshot.granularity).where(
                        TrafficSnapshot.workspace_id == task.workspace_id,
                        TrafficSnapshot.project_id == task.project_id,
                        TrafficSnapshot.window_start == window_start,
                        TrafficSnapshot.window_end == window_end,
                    )
                )
            ).all()
        )
        missing = sorted(TRAFFIC_SNAPSHOT_GRANULARITIES - existing)
        if not missing:
            return
        project_origin = await _project_origin(
            session, workspace_id=task.workspace_id, project_id=task.project_id
        )
        targets = [
            _snapshot_target(
                window_start=window_start,
                window_end=window_end,
                granularity=granularity,
                project_origin=project_origin,
            )
            for granularity in missing
        ]
        await stream_metric_rows(
            session,
            session_factory,
            task=task,
            workspace_id=task.workspace_id,
            project_id=task.project_id,
            window_start=window_start,
            window_end=window_end,
            consumers=[target.builder for target in targets],
        )
        coverage = await _evidence_coverage(
            session, workspace_id=task.workspace_id, project_id=task.project_id
        )
        await _write_targets(
            session,
            task=task,
            project_id=task.project_id,
            targets=targets,
            coverage=coverage,
        )
        await session.commit()


async def _enqueue_demand_refresh(
    session: AsyncSession,
    *,
    task: AnalyticsTask,
    demand: DemandRevision,
) -> None:
    if task.project_id is None:
        raise ValueError("traffic refresh requires project_id")
    await enqueue_demand_snapshot_refresh(
        session,
        workspace_id=task.workspace_id,
        project_id=task.project_id,
        window_start=demand.window_start,
        window_end=demand.window_end,
        source_revision=demand.source_revision(),
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
    """The distinct ACTIVE mapped sync-provider connections of the project.

    The "Sync now" fan-out set: every ACTIVE
    ``IntegrationPropertyMapping`` of the project joined to its connection,
    restricted to ``TRAFFIC_SYNC_PROVIDERS`` on a CONNECTED grant. One entry
    per connection (a connection with several mapped properties gets ONE run
    — sync runs are connection-scoped). Bing is in that set so a connected
    Bing property keeps importing; whether a provider's rows feed the
    Performance tables is a projection question, not a collection one.
    Read-only; the enqueue per connection is owned by
    ``domain/integrations/sync.py`` (invariant 2).
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
