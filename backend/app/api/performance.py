from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import (
    WorkspaceContext,
    get_db,
    require_active_workspace,
    require_active_workspace_run,
)
from app.core.config.integrations_contracts import (
    ERROR_SYNC_ACTIVE_WINDOW_CONFLICT,
    SYNC_KIND_ON_DEMAND,
)
from app.core.http_errors import raise_api_error, raise_not_found
from app.domain.integrations.readiness import get_project_readiness
from app.domain.integrations.schemas import (
    IntegrationSyncEnqueueResponse,
    ProjectReadinessResponse,
)
from app.domain.integrations.sync import (
    ActiveWindowConflictError,
    SyncTargetAmbiguousError,
    SyncTargetUnmappedError,
    enqueue_sync_run,
)
from app.domain.projects.service import ProjectNotFoundError, get_project
from app.domain.traffic.service import list_traffic_sync_targets

router = APIRouter(prefix="/projects")
_WorkspaceDep = Annotated[WorkspaceContext, Depends(require_active_workspace)]
_RunDep = Annotated[WorkspaceContext, Depends(require_active_workspace_run)]
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


@router.post(
    "/{project_id}/performance/sync",
    tags=["performance-sync"],
    status_code=status.HTTP_202_ACCEPTED,
)
async def sync_performance_endpoint(
    project_id: uuid.UUID, ctx: _RunDep, session: _SessionDep
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
    targets = await list_traffic_sync_targets(
        session, workspace_id=ctx.workspace_id, project_id=project_id
    )
    enqueued: list[IntegrationSyncEnqueueResponse] = []
    for target in targets:
        try:
            run = await enqueue_sync_run(
                session,
                workspace_id=ctx.workspace_id,
                connection_id=target.connection_id,
                mapping_id=target.id,
                sync_kind=SYNC_KIND_ON_DEMAND,
            )
        except (SyncTargetUnmappedError, SyncTargetAmbiguousError):
            continue
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
                sync_run_id=run.id, connection_id=run.connection_id, status=run.status
            )
        )
    return enqueued


@router.get("/{project_id}/readiness", tags=["readiness"])
async def get_project_readiness_endpoint(
    project_id: uuid.UUID, ctx: _WorkspaceDep, session: _SessionDep
) -> ProjectReadinessResponse:
    """Where the project sits on the post-connect ladder (projection only).

    Lets the surface render "importing", "core data ready" or "analysis
    ready" instead of one spinner: the user's own GSC/GA4 numbers appear as
    soon as they exist, with the analysis layer explicitly still computing
    rather than looking empty. Reads persisted rows only (invariant 7).
    """
    await _get_project_or_404(session, ctx.workspace_id, project_id)
    return await get_project_readiness(
        session, workspace_id=ctx.workspace_id, project_id=project_id
    )
