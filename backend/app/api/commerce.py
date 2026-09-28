"""Workspace-authorized Commerce replacement API under one project family."""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import (
    WorkspaceContext,
    get_db,
    require_active_workspace_run,
)
from app.core.errors import ApiException
from app.domain.commerce.competitors import (
    enqueue_discoveries,
)
from app.domain.commerce.schemas import (
    DiscoveryRequest,
    DiscoveryResponse,
)
from app.domain.commerce.service import (
    CommerceNotFoundError,
)

router = APIRouter(prefix="/projects", tags=["commerce-python"])

# Capability-gated variants of the router's workspace dependency. They apply the
# ONE role policy (app/domain/workspaces/policy.py): Viewer is read-only, and
# Member keeps every non-administrative product action. Nothing here spells a
# role set of its own.
_RunDep = Annotated[WorkspaceContext, Depends(require_active_workspace_run)]
_SessionDep = Annotated[AsyncSession, Depends(get_db)]


def _not_found(exc: CommerceNotFoundError) -> ApiException:
    return ApiException(status.HTTP_404_NOT_FOUND, "commerce_not_found", str(exc))


@router.post(
    "/{project_id}/commerce/competitors/discover",
    status_code=status.HTTP_202_ACCEPTED,
)
async def competitor_discovery_endpoint(
    project_id: uuid.UUID,
    payload: DiscoveryRequest,
    ctx: _RunDep,
    session: _SessionDep,
) -> DiscoveryResponse:
    try:
        return await enqueue_discoveries(
            session,
            workspace_id=ctx.workspace_id,
            project_id=project_id,
            targets=payload.targets,
        )
    except CommerceNotFoundError as exc:
        raise _not_found(exc) from exc
