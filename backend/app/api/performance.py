# Performance router — the GSC-aligned read surface (invariant 7).
#
# Projections only: every read serves persisted ``TrafficSnapshot`` and
# ``PerformanceDimensionStat`` rows. No provider is ever called and nothing
# is recomputed at read time; a range with no persisted projection returns an
# explicit unprojected payload, never a 404 and never a recomputation.
#
# ``POST /performance/range`` is the ONE write on this surface and it is a
# display-only projection request: it queues the isolated
# ``performance_range_projection`` task over already-persisted evidence.
# ``POST /performance/sync`` stays a PASS-THROUGH to the integrations enqueue
# service — it performs no fetch itself.
#
# The active workspace is resolved by ``require_active_workspace`` and the
# project is authorized through it before any read (invariant 5). A snapshot
# id in a query string is authorized the same way: it is never trusted alone.
from __future__ import annotations

import uuid
from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import WorkspaceContext, get_db, require_active_workspace
from app.core.config.analytics import (
    ANALYTICS_TASK_KIND_PERFORMANCE_RANGE_PROJECTION,
)
from app.core.config.errors import CODE_INVALID_CURSOR
from app.core.config.integrations_contracts import (
    ERROR_SYNC_ACTIVE_WINDOW_CONFLICT,
    SYNC_KIND_ON_DEMAND,
)
from app.core.errors import ApiException
from app.core.http_errors import api_error, raise_api_error, raise_not_found
from app.domain.analytics.enqueue import enqueue_performance_range_projection
from app.domain.integrations.schemas import IntegrationSyncEnqueueResponse
from app.domain.integrations.sync import (
    ActiveWindowConflictError,
    enqueue_sync_run,
)
from app.domain.projects.service import ProjectNotFoundError, get_project
from app.domain.traffic.performance import (
    get_performance_dashboard,
    get_performance_table,
)
from app.domain.traffic.query_support import (
    PerformanceCursorError,
    PerformanceQueryError,
    validate_custom_window,
)
from app.domain.traffic.schemas import (
    PerformanceDashboardResponse,
    PerformanceRangeTaskResponse,
    PerformanceTablePage,
)
from app.domain.traffic.service import list_traffic_sync_connections
from app.models.analytics import AnalyticsTask

router = APIRouter(prefix="/projects", tags=["performance"])

_WorkspaceDep = Annotated[WorkspaceContext, Depends(require_active_workspace)]
_SessionDep = Annotated[AsyncSession, Depends(get_db)]


async def _get_project_or_404(
    session: AsyncSession, workspace_id: uuid.UUID, project_id: uuid.UUID
):
    """Authorize the project, translating a cross-workspace/missing project
    into the API's 404 (mirrors ``_get_project_or_404`` in projects.py)."""
    try:
        return await get_project(
            session, workspace_id=workspace_id, project_id=project_id
        )
    except ProjectNotFoundError as exc:
        raise_not_found("Project", cause=exc)


def _unprocessable(exc: PerformanceQueryError) -> ApiException:
    # Query-validation contract: a bad range, compare mode, dimension, sort,
    # window, or page size is a 422 — never a 404 or a 500.
    return api_error(status.HTTP_422_UNPROCESSABLE_CONTENT, str(exc))


def _bad_cursor(exc: PerformanceCursorError) -> ApiException:
    # A cursor replayed against different filters (or tampered/malformed) is
    # a 400 — never a silent row skip (site-health convention, C4).
    return api_error(status.HTTP_400_BAD_REQUEST, str(exc), code=CODE_INVALID_CURSOR)


@router.get("/{project_id}/performance", response_model=PerformanceDashboardResponse)
async def get_performance_endpoint(
    project_id: uuid.UUID,
    ctx: _WorkspaceDep,
    session: _SessionDep,
    range_token: Annotated[str | None, Query(alias="range")] = None,
    from_date: Annotated[date | None, Query(alias="from")] = None,
    to_date: Annotated[date | None, Query(alias="to")] = None,
    compare: Annotated[str | None, Query()] = None,
    compare_from: Annotated[date | None, Query()] = None,
    compare_to: Annotated[date | None, Query()] = None,
    granularity: Annotated[str | None, Query()] = None,
) -> PerformanceDashboardResponse:
    """The selected window's exact GSC totals and daily series, plus its peer.

    Returns the resolved ``snapshot_id`` and the window ACTUALLY covered, so
    the surface always states the dates it is showing and every table request
    can carry the same snapshot identity. An unprojected range comes back
    with a null snapshot id and ``not_run`` — the caller then queues the range
    projection for exactly that window.
    """
    await _get_project_or_404(session, ctx.workspace_id, project_id)
    try:
        return await get_performance_dashboard(
            session,
            workspace_id=ctx.workspace_id,
            project_id=project_id,
            range_token=range_token,
            from_date=from_date,
            to_date=to_date,
            compare=compare,
            compare_from=compare_from,
            compare_to=compare_to,
            granularity=granularity,
        )
    except PerformanceQueryError as exc:
        raise _unprocessable(exc) from exc


@router.get("/{project_id}/performance/table", response_model=PerformanceTablePage)
async def get_performance_table_endpoint(
    project_id: uuid.UUID,
    ctx: _WorkspaceDep,
    session: _SessionDep,
    snapshot_id: Annotated[uuid.UUID, Query()],
    dimension: Annotated[str | None, Query()] = None,
    sort: Annotated[str | None, Query()] = None,
    cursor: Annotated[str | None, Query()] = None,
    page_size: Annotated[int | None, Query()] = None,
    compare_snapshot_id: Annotated[uuid.UUID | None, Query()] = None,
) -> PerformanceTablePage:
    """One keyset page of one dimension of one snapshot (contract C4).

    ``snapshot_id`` is the identity the dashboard returned, so a table and
    the chart above it always read the same persisted projection. Sorting is
    restricted to the config whitelist and hits stored aggregates only; the
    exact ``total_count`` comes from the snapshot's persisted per-dimension
    counts, never from a ``COUNT(*)``. A cursor replayed against a different
    snapshot/dimension/sort/page size returns 400; an invalid dimension,
    sort, or page size returns 422; an unknown or cross-workspace snapshot
    returns an empty page.
    """
    await _get_project_or_404(session, ctx.workspace_id, project_id)
    try:
        return await get_performance_table(
            session,
            workspace_id=ctx.workspace_id,
            project_id=project_id,
            snapshot_id=snapshot_id,
            dimension=dimension,
            sort=sort,
            cursor=cursor,
            page_size=page_size,
            compare_snapshot_id=compare_snapshot_id,
        )
    except PerformanceQueryError as exc:
        raise _unprocessable(exc) from exc
    except PerformanceCursorError as exc:
        raise _bad_cursor(exc) from exc


def _range_task_response(task: AnalyticsTask) -> PerformanceRangeTaskResponse:
    payload = task.payload or {}
    return PerformanceRangeTaskResponse(
        task_id=task.id,
        status=task.status,
        window_start=str(payload.get("window_start") or ""),
        window_end=str(payload.get("window_end") or ""),
    )


@router.post(
    "/{project_id}/performance/range",
    status_code=status.HTTP_202_ACCEPTED,
    response_model=PerformanceRangeTaskResponse,
)
async def enqueue_performance_range_endpoint(
    project_id: uuid.UUID,
    ctx: _WorkspaceDep,
    session: _SessionDep,
    from_date: Annotated[date, Query(alias="from")],
    to_date: Annotated[date, Query(alias="to")],
) -> PerformanceRangeTaskResponse:
    """Queue the display projection for one custom or comparison window.

    Idempotent on ``(project, from, to)``: asking twice returns the SAME task
    id, so the client polls one identity whether it queued the work or joined
    an in-flight request. The task reads only already-persisted evidence —
    it syncs no provider, replaces no preset or current snapshot, refreshes
    no Demand snapshot, enqueues no opportunity or verification work, and
    changes no other product projection.
    """
    await _get_project_or_404(session, ctx.workspace_id, project_id)
    try:
        # Both bounds are required by the signature, so the validator's
        # "neither supplied" branch is unreachable here; it still owns the
        # inverted-range and over-long-span rules.
        window = validate_custom_window(from_date, to_date) or (from_date, to_date)
    except PerformanceQueryError as exc:
        raise _unprocessable(exc) from exc
    window_start, window_end = window
    task_id = await enqueue_performance_range_projection(
        session,
        workspace_id=ctx.workspace_id,
        project_id=project_id,
        window_start=window_start,
        window_end=window_end,
    )
    await session.commit()
    task = await session.get(AnalyticsTask, task_id)
    if task is None:  # committed a moment ago; absence would be a data fault
        raise_not_found("Performance range task")
    return _range_task_response(task)


@router.get(
    "/{project_id}/performance/range/{task_id}",
    response_model=PerformanceRangeTaskResponse,
)
async def get_performance_range_endpoint(
    project_id: uuid.UUID,
    task_id: uuid.UUID,
    ctx: _WorkspaceDep,
    session: _SessionDep,
) -> PerformanceRangeTaskResponse:
    """The persisted state of one range-projection task (poll target).

    Scoped to the workspace, the project AND this task kind, so a task id
    alone never reveals another tenant's work — nor any other analytics
    task's status and payload through a Performance route (invariant 5).
    """
    await _get_project_or_404(session, ctx.workspace_id, project_id)
    task = await session.get(AnalyticsTask, task_id)
    if (
        task is None
        or task.workspace_id != ctx.workspace_id
        or task.project_id != project_id
        or task.task_kind != ANALYTICS_TASK_KIND_PERFORMANCE_RANGE_PROJECTION
    ):
        raise_not_found("Performance range task")
    return _range_task_response(task)


@router.post(
    "/{project_id}/performance/sync",
    status_code=status.HTTP_202_ACCEPTED,
    response_model=list[IntegrationSyncEnqueueResponse],
)
async def sync_performance_endpoint(
    project_id: uuid.UUID,
    ctx: _WorkspaceDep,
    session: _SessionDep,
) -> list[IntegrationSyncEnqueueResponse]:
    """Enqueue one on-demand sync run per active mapped GSC/GA4 connection.

    A pass-through to the integrations enqueue service (NO fetch here,
    invariant 7). The window each run gets is INCREMENTAL — it resumes from
    what the connection already covers rather than re-fetching a fixed
    trailing window (see ``domain/integrations/sync.py``). The snapshot
    refresh fires when the runs complete (C5). Returns 202 with the
    contract-C3 bare array — one ``{sync_run_id, connection_id, status}`` per
    queued run (empty when no active mapped connection feeds the project). A
    run still active for the same window upstream is a 409; because each
    connection's enqueue commits independently, the 409 detail names the
    connections that were ALREADY enqueued before the conflict so the partial
    fan-out is never invisible.
    """
    await _get_project_or_404(session, ctx.workspace_id, project_id)
    connections = await list_traffic_sync_connections(
        session, workspace_id=ctx.workspace_id, project_id=project_id
    )
    enqueued: list[IntegrationSyncEnqueueResponse] = []
    for connection in connections:
        try:
            run = await enqueue_sync_run(
                session,
                workspace_id=ctx.workspace_id,
                connection_id=connection.id,
                sync_kind=SYNC_KIND_ON_DEMAND,
            )
        except ActiveWindowConflictError as exc:
            conflict = {
                "error": ERROR_SYNC_ACTIVE_WINDOW_CONFLICT,
                "enqueued_connection_ids": [str(row.connection_id) for row in enqueued],
            }
            raise_api_error(
                status.HTTP_409_CONFLICT,
                "A sync window is already active for this connection",
                code=ERROR_SYNC_ACTIVE_WINDOW_CONFLICT,
                details=conflict,
                detail=conflict,
                cause=exc,
            )
        enqueued.append(
            IntegrationSyncEnqueueResponse(
                sync_run_id=run.id,
                connection_id=run.connection_id,
                status=run.status,
            )
        )
    return enqueued
