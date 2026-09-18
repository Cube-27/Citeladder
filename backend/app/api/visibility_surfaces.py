"""The observed-search-surface rates for one measurement selection.

Its own router for the same reason ``visibility_sources`` has one: the
``projects`` module is at its size ceiling, and this answers a different
question with a different shape.

The five rates this serves all divide by something, and they divide by
DIFFERENT things -- two by every successful observation, three by only the
observations that contained an overview. Each therefore travels with the
denominator it used. A rate published without one gets read as whichever of
the five the reader already had in mind.

A read of persisted projections. Nothing is fetched.
"""

from __future__ import annotations

import uuid
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import WorkspaceContext, get_db, require_active_workspace
from app.core.http_errors import raise_api_error, raise_not_found
from app.domain.analysis.aio_evidence import surface_rates
from app.domain.analysis.aio_schemas import SurfaceRatesResponse
from app.domain.analysis.errors import AnalysisNotFoundError, TrendQueryError
from app.domain.projects.service import ProjectNotFoundError, get_project

router = APIRouter(prefix="/projects", tags=["visibility"])

_SessionDep = Annotated[AsyncSession, Depends(get_db)]
_WorkspaceDep = Annotated[WorkspaceContext, Depends(require_active_workspace)]


@router.get(
    "/{project_id}/visibility/surface-rates",
    response_model=SurfaceRatesResponse,
)
async def get_surface_rates_endpoint(
    project_id: uuid.UUID,
    ctx: _WorkspaceDep,
    session: _SessionDep,
    engine: Annotated[str, Query()],
    audit_id: Annotated[uuid.UUID | None, Query()] = None,
    audit_ids: Annotated[list[uuid.UUID] | None, Query()] = None,
    cohort: Annotated[Literal["core", "comparison"], Query()] = "core",
) -> SurfaceRatesResponse:
    """Serve the AI Overview rates for one run selection.

    ``engine`` is required and must name an observed surface. An LLM engine
    answers with no rates at all rather than zeroes: a trigger rate for a
    surface that is asked rather than observed is a category error, and
    zeroes would read as a measurement that found nothing.

    Failed and pending observations are excluded from every denominator and
    reported separately as ``excluded``. An empty denominator yields a null
    ``value`` -- unavailable, never ``0``.
    """
    try:
        await get_project(session, workspace_id=ctx.workspace_id, project_id=project_id)
    except ProjectNotFoundError as exc:
        raise_not_found("Project", cause=exc)
    try:
        return await surface_rates(
            session,
            workspace_id=ctx.workspace_id,
            project_id=project_id,
            logical_engine=engine,
            audit_id=audit_id,
            audit_ids=audit_ids,
            cohort=cohort,
        )
    except AnalysisNotFoundError as exc:
        raise_not_found("Audit", cause=exc)
    except TrendQueryError as exc:
        raise_api_error(status.HTTP_422_UNPROCESSABLE_CONTENT, str(exc), cause=exc)
