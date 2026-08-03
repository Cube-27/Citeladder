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

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import WorkspaceContext, get_db, require_active_workspace
from app.core.config.analytics import ANALYTICS_DEFAULT_GRANULARITY
from app.core.config.errors import (
    CODE_CONFLICT,
    CODE_INVALID_CURSOR,
    CODE_VALIDATION_ERROR,
)
from app.core.errors import ApiException
from app.core.http_errors import raise_not_found
from app.domain.attribution.schemas import (
    AttributionOrdersPage,
    AttributionRecomputeRequest,
    AttributionRecomputeResponse,
    CommerceAttributionResponse,
)
from app.domain.attribution.service import (
    AttributionCursorError,
    AttributionQueryError,
    AttributionRecomputeNotFoundError,
    enqueue_commerce_attribution_recompute,
    get_attribution_orders,
    get_attribution_recompute,
    get_commerce_attribution,
)
from app.domain.commerce.intelligence import (
    CommerceConflictError,
    CommerceDiscoveryNotFoundError,
    CommerceReviewRequiredError,
    accept_candidate,
    create_comparison_snapshot,
    create_discovery_run,
    list_comparison_snapshots,
    list_discovery_candidates,
    list_discovery_runs,
    preview_discovery,
)
from app.domain.commerce.intelligence_schemas import (
    CommerceCandidateAcceptRequest,
    CommerceCandidateAcceptResponse,
    CommerceCandidateResponse,
    CommerceDiscoveryCreateRequest,
    CommerceDiscoveryPreviewRequest,
    CommerceDiscoveryPreviewResponse,
    CommerceDiscoveryRunResponse,
    CompetitorComparisonRequest,
    CompetitorComparisonSnapshotResponse,
)
from app.domain.commerce.schemas import CommerceCatalogHealth
from app.domain.commerce.service import get_catalog_health
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
        raise ApiException(
            status.HTTP_422_UNPROCESSABLE_ENTITY, CODE_VALIDATION_ERROR, str(exc)
        ) from exc


@router.get(
    "/{project_id}/commerce/attribution/orders",
    response_model=AttributionOrdersPage,
)
async def get_attribution_orders_endpoint(
    project_id: uuid.UUID,
    ctx: _WorkspaceDep,
    session: _SessionDep,
    source: Annotated[str | None, Query()] = None,
    attribution_state: Annotated[str | None, Query()] = None,
    from_date: Annotated[date | None, Query(alias="from")] = None,
    to_date: Annotated[date | None, Query(alias="to")] = None,
    cursor: Annotated[str | None, Query()] = None,
) -> AttributionOrdersPage:
    """Page safe latest-order evidence with current deterministic links."""
    await _get_project_or_404(session, ctx.workspace_id, project_id)
    try:
        return await get_attribution_orders(
            session,
            workspace_id=ctx.workspace_id,
            project_id=project_id,
            source=source,
            attribution_state=attribution_state,
            from_date=from_date,
            to_date=to_date,
            cursor=cursor,
        )
    except AttributionCursorError as exc:
        raise ApiException(
            status.HTTP_400_BAD_REQUEST, CODE_INVALID_CURSOR, str(exc)
        ) from exc
    except AttributionQueryError as exc:
        raise ApiException(
            status.HTTP_422_UNPROCESSABLE_ENTITY, CODE_VALIDATION_ERROR, str(exc)
        ) from exc


@router.get(
    "/{project_id}/commerce/catalog-health",
    response_model=CommerceCatalogHealth,
)
async def get_catalog_health_endpoint(
    project_id: uuid.UUID,
    ctx: _WorkspaceDep,
    session: _SessionDep,
) -> CommerceCatalogHealth:
    """Serve persisted Shopify catalog/feed health; never call a provider."""
    await _get_project_or_404(session, ctx.workspace_id, project_id)
    return await get_catalog_health(
        session,
        workspace_id=ctx.workspace_id,
        project_id=project_id,
    )


# ---------------------------------------------------------------------------
# Discovery + competitor intelligence. These routes only write/read durable
# queue, candidate, and comparison evidence; acquisition remains worker-owned.
# ---------------------------------------------------------------------------
@router.post(
    "/{project_id}/commerce/discovery/preview",
    response_model=CommerceDiscoveryPreviewResponse,
)
async def preview_commerce_discovery_endpoint(
    project_id: uuid.UUID,
    request: CommerceDiscoveryPreviewRequest,
    ctx: _WorkspaceDep,
    session: _SessionDep,
) -> CommerceDiscoveryPreviewResponse:
    await _get_project_or_404(session, ctx.workspace_id, project_id)
    return preview_discovery(request)


@router.post(
    "/{project_id}/commerce/discovery/runs",
    response_model=CommerceDiscoveryRunResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_commerce_discovery_run_endpoint(
    project_id: uuid.UUID,
    request: CommerceDiscoveryCreateRequest,
    ctx: _WorkspaceDep,
    session: _SessionDep,
) -> CommerceDiscoveryRunResponse:
    try:
        return await create_discovery_run(
            session,
            workspace_id=ctx.workspace_id,
            project_id=project_id,
            request=request,
        )
    except CommerceDiscoveryNotFoundError as exc:
        raise_not_found("Project", cause=exc)
    except ValueError as exc:
        raise ApiException(
            status.HTTP_422_UNPROCESSABLE_ENTITY, CODE_VALIDATION_ERROR, str(exc)
        ) from exc


@router.get(
    "/{project_id}/commerce/discovery/runs",
    response_model=list[CommerceDiscoveryRunResponse],
)
async def list_commerce_discovery_runs_endpoint(
    project_id: uuid.UUID,
    ctx: _WorkspaceDep,
    session: _SessionDep,
) -> list[CommerceDiscoveryRunResponse]:
    try:
        return await list_discovery_runs(
            session, workspace_id=ctx.workspace_id, project_id=project_id
        )
    except CommerceDiscoveryNotFoundError as exc:
        raise_not_found("Project", cause=exc)


@router.get(
    "/{project_id}/commerce/discovery/candidates",
    response_model=list[CommerceCandidateResponse],
)
async def list_commerce_discovery_candidates_endpoint(
    project_id: uuid.UUID,
    ctx: _WorkspaceDep,
    session: _SessionDep,
    run_id: Annotated[uuid.UUID | None, Query()] = None,
) -> list[CommerceCandidateResponse]:
    try:
        return await list_discovery_candidates(
            session,
            workspace_id=ctx.workspace_id,
            project_id=project_id,
            run_id=run_id,
        )
    except CommerceDiscoveryNotFoundError as exc:
        raise_not_found("Project", cause=exc)


@router.post(
    "/commerce/discovery/candidates/{candidate_id}/accept",
    response_model=CommerceCandidateAcceptResponse,
)
async def accept_commerce_discovery_candidate_endpoint(
    candidate_id: uuid.UUID,
    request: CommerceCandidateAcceptRequest,
    ctx: _WorkspaceDep,
    session: _SessionDep,
) -> CommerceCandidateAcceptResponse:
    try:
        return await accept_candidate(
            session,
            workspace_id=ctx.workspace_id,
            candidate_id=candidate_id,
            request=request,
        )
    except CommerceDiscoveryNotFoundError as exc:
        raise_not_found("Commerce discovery candidate", cause=exc)
    except CommerceReviewRequiredError as exc:
        raise ApiException(status.HTTP_409_CONFLICT, CODE_CONFLICT, str(exc)) from exc
    except CommerceConflictError as exc:
        raise ApiException(status.HTTP_409_CONFLICT, CODE_CONFLICT, str(exc)) from exc


@router.post(
    "/{project_id}/commerce/comparisons",
    response_model=CompetitorComparisonSnapshotResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_competitor_comparison_endpoint(
    project_id: uuid.UUID,
    request: CompetitorComparisonRequest,
    ctx: _WorkspaceDep,
    session: _SessionDep,
) -> CompetitorComparisonSnapshotResponse:
    try:
        return await create_comparison_snapshot(
            session,
            workspace_id=ctx.workspace_id,
            project_id=project_id,
            competitor_id=request.competitor_id,
        )
    except CommerceDiscoveryNotFoundError as exc:
        raise_not_found("Project", cause=exc)


@router.get(
    "/{project_id}/commerce/comparisons",
    response_model=list[CompetitorComparisonSnapshotResponse],
)
async def list_competitor_comparisons_endpoint(
    project_id: uuid.UUID,
    ctx: _WorkspaceDep,
    session: _SessionDep,
) -> list[CompetitorComparisonSnapshotResponse]:
    try:
        return await list_comparison_snapshots(
            session, workspace_id=ctx.workspace_id, project_id=project_id
        )
    except CommerceDiscoveryNotFoundError as exc:
        raise_not_found("Project", cause=exc)


@router.post(
    "/{project_id}/commerce/attribution/recompute",
    response_model=AttributionRecomputeResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def enqueue_attribution_recompute_endpoint(
    project_id: uuid.UUID,
    ctx: _WorkspaceDep,
    session: _SessionDep,
    request: AttributionRecomputeRequest | None = None,
) -> AttributionRecomputeResponse:
    """Enqueue a fresh projection rebuild from persisted facts/metrics."""
    await _get_project_or_404(session, ctx.workspace_id, project_id)
    request = request or AttributionRecomputeRequest()
    try:
        return await enqueue_commerce_attribution_recompute(
            session,
            workspace_id=ctx.workspace_id,
            project_id=project_id,
            from_date=request.from_date,
            to_date=request.to_date,
        )
    except AttributionQueryError as exc:
        raise ApiException(
            status.HTTP_422_UNPROCESSABLE_ENTITY, CODE_VALIDATION_ERROR, str(exc)
        ) from exc


@router.get(
    "/{project_id}/commerce/attribution/recompute/{task_id}",
    response_model=AttributionRecomputeResponse,
)
async def get_attribution_recompute_endpoint(
    project_id: uuid.UUID,
    task_id: uuid.UUID,
    ctx: _WorkspaceDep,
    session: _SessionDep,
) -> AttributionRecomputeResponse:
    """Read one project-scoped attribution recompute queue row."""
    await _get_project_or_404(session, ctx.workspace_id, project_id)
    try:
        return await get_attribution_recompute(
            session,
            workspace_id=ctx.workspace_id,
            project_id=project_id,
            task_id=task_id,
        )
    except AttributionRecomputeNotFoundError as exc:
        raise_not_found("Attribution recompute", cause=exc)
