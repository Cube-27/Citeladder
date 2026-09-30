"""Executive PDF bridge, retired with the billing PDF owner in PR 16."""

from __future__ import annotations

import asyncio
import re
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import WorkspaceContext, get_db, require_active_workspace
from app.core.http_errors import raise_api_error, raise_not_found
from app.domain.command_center.report import render_executive_pdf
from app.domain.command_center.service import get_command_center
from app.domain.projects.service import ProjectNotFoundError, get_project

router = APIRouter(prefix="/projects", tags=["executive-report"])


@router.get("/{project_id}/reports/executive.pdf", response_class=Response)
async def get_executive_report_endpoint(
    project_id: uuid.UUID,
    ctx: Annotated[WorkspaceContext, Depends(require_active_workspace)],
    session: Annotated[AsyncSession, Depends(get_db)],
    audit_id: Annotated[uuid.UUID | None, Query()] = None,
) -> Response:
    try:
        project = await get_project(
            session, workspace_id=ctx.workspace_id, project_id=project_id
        )
        command_center = await get_command_center(
            session, workspace_id=ctx.workspace_id, project=project, audit_id=audit_id
        )
    except ProjectNotFoundError as exc:
        raise_not_found("Project", cause=exc)
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
    pdf = await asyncio.to_thread(render_executive_pdf, command_center)
    filename = f"citeladder-{slug or 'report'}-{date}.pdf"
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
