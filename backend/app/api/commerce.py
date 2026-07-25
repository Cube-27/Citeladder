# Commerce router (WS-B): the attribution read surface.
#
# Projections only (invariant 7): the endpoint serves the persisted
# ``AttributionSnapshot`` rows built by the ``attribution_snapshot``
# refresh executor. No provider is ever called and nothing is recomputed
# at read time: an absent snapshot yields the empty contract (the
# trends/A9 empty-history precedent).
#
# The surface is flat like the other MVP routers (AC12): the active
# workspace is resolved by ``require_active_workspace`` (``X-Workspace-Id``
# header or the caller's default workspace) and the project is authorized
# through the workspace before any read (invariant 5) — a cross-workspace
# project returns 404, never data.
from __future__ import annotations

import uuid
from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import WorkspaceContext, get_db, require_active_workspace
from app.core.config.analytics import ANALYTICS_DEFAULT_GRANULARITY
from app.core.http_errors import raise_not_found
from app.domain.attribution.schemas import CommerceAttributionResponse
from app.domain.attribution.service import (
    AttributionQueryError,
    get_commerce_attribution,
)
from app.domain.projects.service import ProjectNotFoundError, get_project

router = APIRouter(prefix="/projects", tags=["commerce"])

_WorkspaceDep = Annotated[WorkspaceContext, Depends(require_active_workspace)]
_SessionDep = Annotated[AsyncSession, Depends(get_db)]


async def _get_project_or_404(
    session: AsyncSession, workspace_id: uuid.UUID, project_id: uuid.UUID
):
    """Authorize the project, translating a cross-workspace/missing project
    into the API's 404 (mirrors ``_get_project_or_404`` in traffic.py)."""
    try:
        return await get_project(
            session, workspace_id=workspace_id, project_id=project_id
        )
    except ProjectNotFoundError as exc:
        raise_not_found("Project", cause=exc)


@router.get(
    "/{project_id}/commerce/attribution",
    response_model=CommerceAttributionResponse,
)
async def get_commerce_attribution_endpoint(
    project_id: uuid.UUID,
    ctx: _WorkspaceDep,
    session: _SessionDep,
    from_date: Annotated[date | None, Query(alias="from")] = None,
    to_date: Annotated[date | None, Query(alias="to")] = None,
    granularity: Annotated[str, Query()] = ANALYTICS_DEFAULT_GRANULARITY,
) -> CommerceAttributionResponse:
    """Commerce attribution projection for a project (invariant 7).

    The deterministic A1 (GA4 platform-attributed) method sections —
    currency-partitioned totals, per-AI-source rows, and per-product rows
    — plus the permanently ``not_offered`` statistical namespace, served
    from the persisted ``AttributionSnapshot`` matching ``(from, to,
    granularity)`` (or the project's latest snapshot at the granularity
    when the window is omitted). An absent snapshot returns the empty
    contract (not 404); an invalid granularity/window returns 422.
    """
    # Authorize the project first (404 for a cross-workspace/missing project).
    await _get_project_or_404(session, ctx.workspace_id, project_id)
    try:
        return await get_commerce_attribution(
            session,
            workspace_id=ctx.workspace_id,
            project_id=project_id,
            from_date=from_date,
            to_date=to_date,
            granularity=granularity,
        )
    except AttributionQueryError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc
