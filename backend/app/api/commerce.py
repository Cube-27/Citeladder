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
    require_active_workspace_write,
)
from app.api.usage_limits import enforce_workspace_request
from app.connectors.agent.client import AgentNotConfiguredError
from app.connectors.agent.factory import create_model_gateway
from app.connectors.agent.gateway import ModelGateway
from app.core.config.abuse import abuse_settings
from app.core.errors import ApiException
from app.domain.commerce.competitors import (
    enqueue_discoveries,
)
from app.domain.commerce.prompts import (
    BuyerPromptGenerationUnavailable,
    add_manual_buyer_prompt,
    generate_buyer_prompts,
    validate_buyer_prompt_targets,
)
from app.domain.commerce.schemas import (
    BuyerPromptGenerateRequest,
    BuyerPromptManualRequest,
    BuyerPromptResponse,
    DiscoveryRequest,
    DiscoveryResponse,
)
from app.domain.commerce.service import (
    CommerceNotFoundError,
)
from app.domain.entitlements.enforcement import OccupancyError

router = APIRouter(prefix="/projects", tags=["commerce-python"])

# Capability-gated variants of the router's workspace dependency. They apply the
# ONE role policy (app/domain/workspaces/policy.py): Viewer is read-only, and
# Member keeps every non-administrative product action. Nothing here spells a
# role set of its own.
_RunDep = Annotated[WorkspaceContext, Depends(require_active_workspace_run)]
_WriteDep = Annotated[WorkspaceContext, Depends(require_active_workspace_write)]
_SessionDep = Annotated[AsyncSession, Depends(get_db)]


def _map_error(exc: Exception) -> ApiException:
    if isinstance(exc, CommerceNotFoundError):
        return ApiException(status.HTTP_404_NOT_FOUND, "commerce_not_found", str(exc))
    return ApiException.coded(
        status.HTTP_422_UNPROCESSABLE_CONTENT, "commerce_invalid", str(exc)
    )


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
        raise _map_error(exc) from exc


@router.post(
    "/{project_id}/commerce/buyer-prompts/generate",
    status_code=status.HTTP_201_CREATED,
)
async def buyer_prompts_generate_endpoint(
    project_id: uuid.UUID,
    payload: BuyerPromptGenerateRequest,
    ctx: _RunDep,
    session: _SessionDep,
) -> list[BuyerPromptResponse]:
    try:
        gateway: ModelGateway = create_model_gateway()
    except AgentNotConfiguredError as exc:
        raise ApiException.coded(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "commerce_prompt_generation_unavailable",
            "No structured model is configured; manual prompt entry remains available.",
        ) from exc
    try:
        await validate_buyer_prompt_targets(
            session,
            workspace_id=ctx.workspace_id,
            project_id=project_id,
            targets=payload.targets,
        )
        await enforce_workspace_request(
            session,
            workspace_id=ctx.workspace_id,
            operation="agent.provider_call",
            limit=abuse_settings.agent_call_limit,
            window_seconds=abuse_settings.agent_call_window_seconds,
            amount=len(payload.targets),
        )
        return await generate_buyer_prompts(
            session,
            workspace_id=ctx.workspace_id,
            project_id=project_id,
            targets=payload.targets,
            count=payload.count,
            gateway=gateway,
        )
    except CommerceNotFoundError as exc:
        raise _map_error(exc) from exc
    except OccupancyError as exc:
        raise ApiException.coded(
            status.HTTP_403_FORBIDDEN, exc.code, str(exc), details=exc.details
        ) from exc
    except BuyerPromptGenerationUnavailable as exc:
        raise ApiException.coded(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "commerce_prompt_generation_unavailable",
            str(exc),
        ) from exc


@router.post(
    "/{project_id}/commerce/buyer-prompts/manual",
    status_code=status.HTTP_201_CREATED,
)
async def buyer_prompt_manual_endpoint(
    project_id: uuid.UUID,
    payload: BuyerPromptManualRequest,
    ctx: _WriteDep,
    session: _SessionDep,
) -> BuyerPromptResponse:
    try:
        return await add_manual_buyer_prompt(
            session,
            workspace_id=ctx.workspace_id,
            project_id=project_id,
            target=payload.target,
            text=payload.text,
        )
    except OccupancyError as exc:
        raise ApiException.coded(
            status.HTTP_403_FORBIDDEN, exc.code, str(exc), details=exc.details
        ) from exc
    except CommerceNotFoundError as exc:
        raise _map_error(exc) from exc
