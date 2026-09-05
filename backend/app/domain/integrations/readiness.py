# The post-connect readiness ladder (Slice 4.1).
#
# One PURE projection over already-persisted rows — grant status, backfill
# runs, snapshot presence, demand snapshot presence, live opportunity count.
# No new table, no recomputation, no provider I/O (invariant 7).
#
# It exists so a user who has just connected sees WHERE their data is rather
# than one undifferentiated spinner or a dashboard that looks broken: core
# GSC/GA4 numbers can render as soon as the first chunk derives, while the
# analysis layer is explicitly still computing.
from __future__ import annotations

import uuid
from collections import defaultdict
from collections.abc import Sequence
from datetime import date

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config.integrations_contracts import (
    BACKFILL_STATE_COMPLETE,
    BACKFILL_STATE_IMPORTING,
    BACKFILL_STATE_NOT_STARTED,
    BACKFILL_STATE_PARTIAL,
    GRANT_STATUS_CONNECTED,
    MAPPING_STATUS_ACTIVE,
    READINESS_ANALYSIS_READY,
    READINESS_CONNECTED,
    READINESS_CORE_DATA_READY,
    READINESS_IMPORT_FAILED,
    READINESS_IMPORTING,
    READINESS_NOT_CONNECTED,
    SYNC_KIND_BACKFILL,
)
from app.domain.integrations.schemas import (
    IntegrationBackfillProgressResponse,
    ProjectReadinessResponse,
)
from app.domain.integrations.sync import backfill_progress_rollup
from app.models.demand import DemandSnapshot
from app.models.integrations import (
    IntegrationConnection,
    IntegrationOAuthGrant,
    IntegrationPropertyMapping,
    IntegrationSyncRun,
)
from app.models.opportunity import Opportunity
from app.models.traffic import TrafficSnapshot

__all__ = ["get_project_readiness"]


async def _mapped_connection_ids(
    session: AsyncSession, *, workspace_id: uuid.UUID, project_id: uuid.UUID
) -> list[uuid.UUID]:
    """The project's ACTIVE mapped connections on a CONNECTED grant.

    The same set "Sync now" fans out over, minus the provider restriction:
    readiness is about whether the project has a live connection at all, not
    about which providers feed the Performance tables.
    """
    stmt = (
        select(IntegrationConnection.id)
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
        .where(IntegrationOAuthGrant.status == GRANT_STATUS_CONNECTED)
        .distinct()
    )
    return list((await session.scalars(stmt)).all())


def _project_backfill(
    rollups: Sequence[IntegrationBackfillProgressResponse],
) -> tuple[str | None, date | None, int]:
    """Roll every mapped connection's import into ONE project-level answer.

    Per connection FIRST, then combined. A single rollup over the pooled rows
    cannot see a connection that never enqueued a backfill — it contributes
    no rows — so a project with one finished connection and one untouched
    connection would report a complete import.

    - ``not_started`` only when NO connection has enqueued anything.
    - ``importing`` while any connection still has a window in flight.
    - ``complete`` only when every connection finished every window.
    - ``partial`` otherwise: a failed window, or a connection sitting at
      ``not_started`` beside one that ran. Both mean the import did not fully
      land, and neither has anything still in flight.

    Coverage is the MINIMUM ``covered_through``, and null as soon as one
    connection has none: the project has evidence through the earliest date
    ALL of its connections reach, never through the furthest one.
    """
    if not rollups:
        return None, None, 0
    states = {rollup.state for rollup in rollups}
    if states == {BACKFILL_STATE_NOT_STARTED}:
        state = BACKFILL_STATE_NOT_STARTED
    elif BACKFILL_STATE_IMPORTING in states:
        state = BACKFILL_STATE_IMPORTING
    elif states == {BACKFILL_STATE_COMPLETE}:
        state = BACKFILL_STATE_COMPLETE
    else:
        state = BACKFILL_STATE_PARTIAL
    covered_through: date | None = None
    if all(rollup.covered_through is not None for rollup in rollups):
        covered_through = min(
            rollup.covered_through
            for rollup in rollups
            if rollup.covered_through is not None
        )
    return state, covered_through, sum(r.completed_windows for r in rollups)


def _stage(
    *,
    connection_count: int,
    backfill_state: str | None,
    imported_windows: int,
    has_performance_snapshot: bool,
    has_demand_snapshot: bool,
) -> str:
    """The HIGHEST stage the observed facts support.

    Ordered so a later stage never hides an earlier truth: an import still
    running reports ``importing`` even once a first snapshot exists, because
    the numbers on screen are not yet the whole history the user asked for.
    """
    if connection_count == 0:
        return READINESS_NOT_CONNECTED
    if backfill_state in (None, BACKFILL_STATE_NOT_STARTED):
        # Connected, nothing enqueued. A snapshot from an on-demand sync can
        # still exist, and saying so beats reporting a bare "connected".
        return (
            READINESS_CORE_DATA_READY
            if has_performance_snapshot
            else (READINESS_CONNECTED)
        )
    if backfill_state == BACKFILL_STATE_IMPORTING:
        return READINESS_IMPORTING
    if has_performance_snapshot:
        return (
            READINESS_ANALYSIS_READY
            if has_demand_snapshot
            else (READINESS_CORE_DATA_READY)
        )
    if imported_windows == 0:
        # Every window reached a terminal status and none of them succeeded:
        # nothing is still in flight, so reporting ``importing`` would spin
        # forever over an import that has already failed.
        return READINESS_IMPORT_FAILED
    # Windows landed but nothing projected yet — the chain between derivation
    # and the snapshot refresh is still running.
    return READINESS_IMPORTING


async def get_project_readiness(
    session: AsyncSession, *, workspace_id: uuid.UUID, project_id: uuid.UUID
) -> ProjectReadinessResponse:
    """Where this project sits on the post-connect ladder, and the facts why.

    Workspace + project scoped throughout (invariant 5). Every field is read
    from persisted rows; nothing here triggers a sync, a projection or a
    provider call.
    """
    connection_ids = await _mapped_connection_ids(
        session, workspace_id=workspace_id, project_id=project_id
    )

    backfill_state: str | None = None
    imported_through: date | None = None
    imported_windows = 0
    if connection_ids:
        runs = list(
            (
                await session.scalars(
                    select(IntegrationSyncRun)
                    .where(IntegrationSyncRun.connection_id.in_(connection_ids))
                    .where(IntegrationSyncRun.sync_kind == SYNC_KIND_BACKFILL)
                )
            ).all()
        )
        by_connection: dict[uuid.UUID, list[IntegrationSyncRun]] = defaultdict(list)
        for run in runs:
            by_connection[run.connection_id].append(run)
        # Every MAPPED connection gets its own rollup, the ones with no rows
        # included: that is a ``not_started`` import, and pooling the rows
        # would erase it entirely.
        backfill_state, imported_through, imported_windows = _project_backfill(
            [
                backfill_progress_rollup(
                    connection_id=connection_id, rows=by_connection[connection_id]
                )
                for connection_id in connection_ids
            ]
        )

    has_performance_snapshot = bool(
        await session.scalar(
            select(TrafficSnapshot.id)
            .where(TrafficSnapshot.workspace_id == workspace_id)
            .where(TrafficSnapshot.project_id == project_id)
            .limit(1)
        )
    )
    has_demand_snapshot = bool(
        await session.scalar(
            select(DemandSnapshot.id)
            .where(DemandSnapshot.workspace_id == workspace_id)
            .where(DemandSnapshot.project_id == project_id)
            .limit(1)
        )
    )
    # LIVE opportunities only: a superseded row is history, and counting it
    # would report work the project no longer has.
    opportunity_count = int(
        await session.scalar(
            select(func.count(Opportunity.id))
            .where(Opportunity.workspace_id == workspace_id)
            .where(Opportunity.project_id == project_id)
            .where(Opportunity.superseded_at.is_(None))
        )
        or 0
    )

    return ProjectReadinessResponse(
        project_id=project_id,
        stage=_stage(
            connection_count=len(connection_ids),
            backfill_state=backfill_state,
            imported_windows=imported_windows,
            has_performance_snapshot=has_performance_snapshot,
            has_demand_snapshot=has_demand_snapshot,
        ),
        connection_count=len(connection_ids),
        backfill_state=backfill_state,
        imported_through=imported_through,
        has_performance_snapshot=has_performance_snapshot,
        has_demand_snapshot=has_demand_snapshot,
        opportunity_count=opportunity_count,
    )
