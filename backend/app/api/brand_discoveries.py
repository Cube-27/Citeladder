"""Workspace-scoped persisted onboarding discovery API."""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import WorkspaceContext, get_db, require_active_workspace
from app.domain.projects.discovery import (
    BrandDiscoveryError,
    confirm_discovery,
    create_discovery,
    create_project_from_discovery,
    discovery_catalog,
    get_discovery,
)
from app.domain.projects.discovery_schemas import (
    BrandDiscoveryCatalogResponse,
    BrandDiscoveryConfirm,
    BrandDiscoveryCreate,
    BrandDiscoveryCreateProject,
    BrandDiscoveryProjectResponse,
    BrandDiscoveryResponse,
)

router = APIRouter(tags=["brand-discoveries"])
_WorkspaceDep = Annotated[WorkspaceContext, Depends(require_active_workspace)]
_SessionDep = Annotated[AsyncSession, Depends(get_db)]


@router.get("/brand-discovery-catalog", response_model=BrandDiscoveryCatalogResponse)
async def get_brand_discovery_catalog() -> BrandDiscoveryCatalogResponse:
    return BrandDiscoveryCatalogResponse(**discovery_catalog())


@router.post(
    "/brand-discoveries",
    response_model=BrandDiscoveryResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def create_brand_discovery(
    payload: BrandDiscoveryCreate,
    ctx: _WorkspaceDep,
    session: _SessionDep,
    idempotency_key: Annotated[str, Header(alias="Idempotency-Key")],
) -> BrandDiscoveryResponse:
    try:
        row = await create_discovery(
            session,
            workspace_id=ctx.workspace_id,
            payload=payload,
            idempotency_key=idempotency_key,
        )
    except BrandDiscoveryError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc
    return BrandDiscoveryResponse.model_validate(row)


@router.get("/brand-discoveries/{discovery_id}", response_model=BrandDiscoveryResponse)
async def get_brand_discovery(
    discovery_id: uuid.UUID, ctx: _WorkspaceDep, session: _SessionDep
) -> BrandDiscoveryResponse:
    try:
        row = await get_discovery(
            session, workspace_id=ctx.workspace_id, discovery_id=discovery_id
        )
    except LookupError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc
    return BrandDiscoveryResponse.model_validate(row)


@router.post(
    "/brand-discoveries/{discovery_id}/confirm",
    response_model=BrandDiscoveryResponse,
)
async def confirm_brand_discovery(
    discovery_id: uuid.UUID,
    payload: BrandDiscoveryConfirm,
    ctx: _WorkspaceDep,
    session: _SessionDep,
    idempotency_key: Annotated[str, Header(alias="Idempotency-Key")],
) -> BrandDiscoveryResponse:
    try:
        row = await confirm_discovery(
            session,
            workspace_id=ctx.workspace_id,
            discovery_id=discovery_id,
            payload=payload,
            idempotency_key=idempotency_key,
        )
    except LookupError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc
    except BrandDiscoveryError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc
    return BrandDiscoveryResponse.model_validate(row)


@router.post(
    "/brand-discoveries/{discovery_id}/create-project",
    response_model=BrandDiscoveryProjectResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_discovered_project(
    discovery_id: uuid.UUID,
    payload: BrandDiscoveryCreateProject,
    ctx: _WorkspaceDep,
    session: _SessionDep,
    idempotency_key: Annotated[str, Header(alias="Idempotency-Key")],
) -> BrandDiscoveryProjectResponse:
    if not idempotency_key.strip():
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY, "Idempotency-Key is required"
        )
    try:
        row = await create_project_from_discovery(
            session,
            workspace_id=ctx.workspace_id,
            discovery_id=discovery_id,
            payload=payload,
            idempotency_key=idempotency_key,
        )
    except LookupError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc
    except BrandDiscoveryError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc
    if row.project_id is None:
        raise RuntimeError("Project creation completed without a project_id")
    return BrandDiscoveryProjectResponse(
        discovery=BrandDiscoveryResponse.model_validate(row), project_id=row.project_id
    )
