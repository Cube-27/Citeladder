from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import (
    WorkspaceContext,
    get_db,
    require_active_workspace,
)
from app.core.http_errors import raise_not_found
from app.domain.integrations.readiness import get_project_readiness
from app.domain.integrations.schemas import ProjectReadinessResponse
from app.domain.projects.service import ProjectNotFoundError, get_project

router = APIRouter(prefix="/projects")
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
