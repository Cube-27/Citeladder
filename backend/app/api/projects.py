# Projects router: workspace-scoped CRUD (invariant 5).
#
# The API surface is flat (no workspace_id in the path); the active
# workspace is resolved by ``require_active_workspace`` from the
# ``X-Workspace-Id`` header (or the caller's default workspace). Every query
# filters by that workspace. The visibility reads are served by the
# TypeScript API (route family ``visibility``).
from __future__ import annotations

import asyncio
import re
import uuid
from collections.abc import Awaitable, Callable
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import (
    WorkspaceContext,
    get_db,
    require_active_workspace,
    require_active_workspace_write,
    require_project_member,
)
from app.api.usage_limits import enforce_workspace_request
from app.core.config.abuse import abuse_settings
from app.core.errors import ApiException
from app.core.http_errors import raise_api_error, raise_not_found
from app.domain.command_center.report import render_executive_pdf
from app.domain.command_center.schemas import CommandCenterResponse
from app.domain.command_center.service import get_command_center
from app.domain.entitlements.enforcement import OccupancyError
from app.domain.projects.logos import refresh_project_logos
from app.domain.projects.schemas import (
    ProjectCreate,
    ProjectResponse,
    ProjectUpdate,
)
from app.domain.projects.service import (
    ProjectInUseError,
    ProjectNotFoundError,
    create_project,
    delete_project,
    get_project,
    list_projects,
    project_to_response,
    update_project,
)

router = APIRouter(prefix="/projects", tags=["projects"])


async def _map_occupancy[T](call: Callable[[], Awaitable[T]]) -> T:
    """Run one occupancy-gated mutation, mapping a denial to the coded 403.

    The quota check lives in the domain service (never a route precheck);
    the router only translates the domain error into the API error contract.
    """
    try:
        return await call()
    except OccupancyError as exc:
        raise ApiException.coded(
            status.HTTP_403_FORBIDDEN, exc.code, str(exc), details=exc.details
        ) from exc


_RES_PROJECT = "Project"

_WorkspaceDep = Annotated[WorkspaceContext, Depends(require_active_workspace)]

# Capability-gated variants of the router's workspace dependency. They apply the
# ONE role policy (app/domain/workspaces/policy.py): Viewer is read-only, and
# Member keeps every non-administrative product action. Nothing here spells a
# role set of its own.
_WriteDep = Annotated[WorkspaceContext, Depends(require_active_workspace_write)]
# For routes the browser hits directly (no X-Workspace-Id header can ride on an
# <img src>), authorize through the project id already in the path.
_ProjectMemberDep = Annotated[WorkspaceContext, Depends(require_project_member)]
_SessionDep = Annotated[AsyncSession, Depends(get_db)]


async def _get_project_or_404(
    session: AsyncSession, workspace_id: uuid.UUID, project_id: uuid.UUID
):
    """Authorize the project, translating a cross-workspace/missing project
    into the API's 404 (mirrors ``_get_or_404`` in audits.py)."""
    try:
        return await get_project(
            session, workspace_id=workspace_id, project_id=project_id
        )
    except ProjectNotFoundError as exc:
        raise_not_found(_RES_PROJECT, cause=exc)


@router.get("")
async def list_projects_endpoint(
    ctx: _WorkspaceDep, session: _SessionDep
) -> list[ProjectResponse]:
    projects = await list_projects(session, workspace_id=ctx.workspace_id)
    return [project_to_response(project) for project in projects]


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_project_endpoint(
    payload: ProjectCreate, ctx: _WriteDep, session: _SessionDep
) -> ProjectResponse:
    project = await _map_occupancy(
        lambda: create_project(
            session,
            workspace_id=ctx.workspace_id,
            payload=payload,
            reviewer_id=ctx.user.id,
        )
    )
    return project_to_response(project)


@router.post("/{project_id}/logos/refresh")
async def refresh_project_logos_endpoint(
    project_id: uuid.UUID, ctx: _WriteDep, session: _SessionDep
) -> ProjectResponse:
    await enforce_workspace_request(
        session,
        workspace_id=ctx.workspace_id,
        operation="brand_logo_refresh",
        limit=abuse_settings.brand_logo_refresh_limit,
        window_seconds=abuse_settings.brand_logo_refresh_window_seconds,
    )
    try:
        project = await refresh_project_logos(
            session,
            workspace_id=ctx.workspace_id,
            project_id=project_id,
        )
    except ProjectNotFoundError as exc:
        raise_not_found(_RES_PROJECT, cause=exc)
    return project_to_response(project)


@router.get("/{project_id}")
async def get_project_endpoint(
    project_id: uuid.UUID, ctx: _ProjectMemberDep, session: _SessionDep
) -> ProjectResponse:
    """Resolve one authorized project, workspace derived FROM the project.

    This is the shell's narrow resolution read: the client follows an explicit
    ``?project=<id>`` before it knows which workspace owns it, so authorizing
    through ``X-Workspace-Id`` made the answer depend on the very selection the
    read exists to establish — a link into a second workspace 404ed until the
    header happened to be right. ``require_project_member`` verifies the same
    membership row from the path instead, so the response's ``workspace_id``
    is usable as the workspace for everything that follows.

    Invariant 5 is unchanged: a project in a workspace the caller does not
    belong to stays indistinguishable from a missing one (404).
    """
    project = await _get_project_or_404(session, ctx.workspace_id, project_id)
    return project_to_response(project)


@router.get("/{project_id}/command-center")
async def get_command_center_endpoint(
    project_id: uuid.UUID,
    ctx: _WorkspaceDep,
    session: _SessionDep,
    audit_id: Annotated[uuid.UUID | None, Query()] = None,
) -> CommandCenterResponse:
    project = await _get_project_or_404(session, ctx.workspace_id, project_id)
    try:
        return await get_command_center(
            session,
            workspace_id=ctx.workspace_id,
            project=project,
            audit_id=audit_id,
        )
    except LookupError as exc:
        raise_api_error(
            status.HTTP_404_NOT_FOUND,
            "No completed command-center measurement is available",
            cause=exc,
        )


@router.get("/{project_id}/reports/executive.pdf", response_class=Response)
async def get_executive_report_endpoint(
    project_id: uuid.UUID,
    ctx: _WorkspaceDep,
    session: _SessionDep,
    audit_id: Annotated[uuid.UUID | None, Query()] = None,
) -> Response:
    project = await _get_project_or_404(session, ctx.workspace_id, project_id)
    try:
        command_center = await get_command_center(
            session,
            workspace_id=ctx.workspace_id,
            project=project,
            audit_id=audit_id,
        )
    except LookupError as exc:
        raise_api_error(
            status.HTTP_404_NOT_FOUND,
            "No completed command-center measurement is available",
            cause=exc,
        )
    if not command_center.report_available or command_center.measurement is None:
        raise_api_error(
            status.HTTP_404_NOT_FOUND,
            "No completed command-center measurement is available",
        )
    slug = re.sub(r"[^a-z0-9]+", "-", project.brand_name.lower()).strip("-")
    date = command_center.measurement.completed_at.date().isoformat()
    filename = f"citeladder-{slug or 'report'}-{date}.pdf"
    pdf = await asyncio.to_thread(render_executive_pdf, command_center)
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.patch("/{project_id}")
async def update_project_endpoint(
    project_id: uuid.UUID,
    payload: ProjectUpdate,
    ctx: _WriteDep,
    session: _SessionDep,
) -> ProjectResponse:
    try:
        project = await update_project(
            session,
            workspace_id=ctx.workspace_id,
            project_id=project_id,
            payload=payload,
        )
    except ProjectNotFoundError as exc:
        raise_not_found(_RES_PROJECT, cause=exc)
    return project_to_response(project)


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project_endpoint(
    project_id: uuid.UUID, ctx: _WriteDep, session: _SessionDep
) -> None:
    try:
        await _map_occupancy(
            lambda: delete_project(
                session, workspace_id=ctx.workspace_id, project_id=project_id
            )
        )
    except ProjectNotFoundError as exc:
        raise_not_found(_RES_PROJECT, cause=exc)
    except ProjectInUseError as exc:
        raise_api_error(status.HTTP_409_CONFLICT, str(exc), cause=exc)
