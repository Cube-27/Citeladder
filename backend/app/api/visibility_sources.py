"""The two Sources reads that are not the source table itself.

Their own router rather than more surface on ``projects``: that module already
carries the project lifecycle, run selection and the paged source projection,
and it is at its size ceiling. These two answer different questions with
different shapes -- a bucketed series, and one page's own detail -- and each
has its own owner underneath it.

Reads render persisted projections. Neither fetches anything.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import WorkspaceContext, get_db, require_active_workspace
from app.core.http_errors import raise_api_error, raise_not_found
from app.domain.analysis.errors import AnalysisNotFoundError, TrendQueryError
from app.domain.analysis.schemas import SourceSeriesResponse, SourceUrlDetail
from app.domain.analysis.source_series import (
    SOURCE_SERIES_MAX_SERIES,
    get_visibility_source_series,
)
from app.domain.analysis.source_url_detail import get_visibility_source_url
from app.domain.projects.service import ProjectNotFoundError, get_project

router = APIRouter(prefix="/projects", tags=["visibility"])

_SessionDep = Annotated[AsyncSession, Depends(get_db)]
_WorkspaceDep = Annotated[WorkspaceContext, Depends(require_active_workspace)]


async def _get_project_or_404(
    session: AsyncSession, workspace_id: uuid.UUID, project_id: uuid.UUID
) -> None:
    try:
        await get_project(session, workspace_id=workspace_id, project_id=project_id)
    except ProjectNotFoundError as exc:
        raise_not_found("Project", cause=exc)


@router.get(
    "/{project_id}/visibility/sources/series",
    response_model=SourceSeriesResponse,
)
async def get_visibility_source_series_endpoint(
    project_id: uuid.UUID,
    ctx: _WorkspaceDep,
    session: _SessionDep,
    dimension: Annotated[Literal["domain", "url"], Query()] = "domain",
    granularity: Annotated[Literal["day", "week", "month"], Query()] = "day",
    audit_id: Annotated[uuid.UUID | None, Query()] = None,
    audit_ids: Annotated[list[uuid.UUID] | None, Query()] = None,
    engine: Annotated[str | None, Query()] = None,
    cohort: Annotated[Literal["core", "comparison"], Query()] = "core",
    domain: Annotated[str | None, Query(max_length=255)] = None,
    source_type: Annotated[str | None, Query(max_length=64)] = None,
    from_at: Annotated[datetime | None, Query(alias="from")] = None,
    to_at: Annotated[datetime | None, Query(alias="to")] = None,
    limit: Annotated[int, Query(ge=1, le=SOURCE_SERIES_MAX_SERIES)] = (
        SOURCE_SERIES_MAX_SERIES
    ),
) -> SourceSeriesResponse:
    """The leading sources' use over the selected period, one line each.

    Declared BEFORE the ``{url_hash}``-shaped routes on this prefix so a path
    parameter cannot swallow the literal segment.
    """
    await _get_project_or_404(session, ctx.workspace_id, project_id)
    try:
        return await get_visibility_source_series(
            session,
            workspace_id=ctx.workspace_id,
            project_id=project_id,
            dimension=dimension,
            granularity=granularity,
            audit_id=audit_id,
            audit_ids=audit_ids,
            logical_engine=engine,
            cohort=cohort,
            domain=domain,
            source_class=source_type,
            from_at=from_at,
            to_at=to_at,
            limit=limit,
        )
    except AnalysisNotFoundError as exc:
        raise_not_found("Audit", cause=exc)
    except TrendQueryError as exc:
        raise_api_error(status.HTTP_422_UNPROCESSABLE_CONTENT, str(exc), cause=exc)


@router.get("/{project_id}/visibility/sources/url", response_model=SourceUrlDetail)
async def get_visibility_source_url_endpoint(
    project_id: uuid.UUID,
    ctx: _WorkspaceDep,
    session: _SessionDep,
    url: Annotated[str, Query(min_length=1, max_length=2048)],
    audit_id: Annotated[uuid.UUID | None, Query()] = None,
    audit_ids: Annotated[list[uuid.UUID] | None, Query()] = None,
    engine: Annotated[str | None, Query()] = None,
    cohort: Annotated[Literal["core", "comparison"], Query()] = "core",
    from_at: Annotated[datetime | None, Query(alias="from")] = None,
    to_at: Annotated[datetime | None, Query(alias="to")] = None,
) -> SourceUrlDetail:
    """One cited URL: its overview, engines, prompts and co-named brands.

    Keyed by the URL the engines reported rather than by page identity, so a
    citation whose identity was never resolved -- a grounding redirect, say --
    still has a page to open.
    """
    await _get_project_or_404(session, ctx.workspace_id, project_id)
    try:
        return await get_visibility_source_url(
            session,
            workspace_id=ctx.workspace_id,
            project_id=project_id,
            url=url,
            audit_id=audit_id,
            audit_ids=audit_ids,
            logical_engine=engine,
            cohort=cohort,
            from_at=from_at,
            to_at=to_at,
        )
    except AnalysisNotFoundError as exc:
        raise_not_found("Audit", cause=exc)
    except TrendQueryError as exc:
        raise_api_error(status.HTTP_422_UNPROCESSABLE_CONTENT, str(exc), cause=exc)
