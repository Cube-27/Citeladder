"""Read and inspect endpoints for the external pages AI answers cited.

Its own router rather than more surface on ``projects``: that module already
carries the project lifecycle, visibility evidence and run selection, and these
two endpoints have their own owner underneath them.

Reads render persisted projections. Neither endpoint here fetches anything, and
the inspect route is an explicit authorized command that pays the same budget as
automatic selection -- a page someone asked for is not free.
"""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Path
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import WorkspaceContext, get_db, require_active_workspace
from app.core.http_errors import raise_not_found
from app.domain.projects.service import ProjectNotFoundError, get_project
from app.domain.source_pages.admission import claim_pages, current_budget
from app.domain.source_pages.projection import SourcePageView, get_source_page
from app.domain.source_pages.schemas import (
    SourcePageDetail,
    SourcePageEntityView,
    SourcePageInspectionRequested,
)

router = APIRouter(prefix="/projects", tags=["source-pages"])

_SessionDep = Annotated[AsyncSession, Depends(get_db)]
_WorkspaceDep = Annotated[WorkspaceContext, Depends(require_active_workspace)]
_UrlHash = Annotated[str, Path(min_length=64, max_length=64)]


def _detail(view: SourcePageView) -> SourcePageDetail:
    return SourcePageDetail(
        id=view.id,
        canonical_url=view.canonical_url,
        registrable_domain=view.registrable_domain,
        source_class=view.source_class,
        page_format=view.page_format,
        page_format_method=view.page_format_method,
        inspection_state=view.inspection_state,
        inspection_reason=view.inspection_reason,
        last_inspected_at=view.last_inspected_at,
        last_cited_at=view.last_cited_at,
        recurrence_count=view.recurrence_count,
        title=view.title,
        extracted_chars=view.extracted_chars,
        entities=[
            SourcePageEntityView(
                entity_kind=entity.entity_kind,
                entity_name=entity.entity_name,
                state=entity.state,
                match_method=entity.match_method,
                match_count=entity.match_count,
                passages=list(entity.passages),
                limitations=list(entity.limitations),
            )
            for entity in view.entities
        ],
        limitations=list(view.limitations),
    )


async def _resolve(
    session: AsyncSession,
    *,
    ctx: WorkspaceContext,
    project_id: uuid.UUID,
    url_hash: str,
) -> SourcePageView:
    try:
        await get_project(session, workspace_id=ctx.workspace_id, project_id=project_id)
    except ProjectNotFoundError as exc:
        raise_not_found("Project", cause=exc)
    view = await get_source_page(
        session,
        workspace_id=ctx.workspace_id,
        project_id=project_id,
        url_hash=url_hash,
    )
    if view is None:
        raise_not_found("Source page")
    return view


@router.get("/{project_id}/source-pages/{url_hash}", response_model=SourcePageDetail)
async def get_source_page_endpoint(
    project_id: uuid.UUID,
    url_hash: _UrlHash,
    ctx: _WorkspaceDep,
    session: _SessionDep,
) -> SourcePageDetail:
    """What is known about one cited page. Never triggers an inspection."""
    return _detail(
        await _resolve(session, ctx=ctx, project_id=project_id, url_hash=url_hash)
    )


@router.post(
    "/{project_id}/source-pages/{url_hash}/inspect",
    response_model=SourcePageInspectionRequested,
)
async def inspect_source_page_endpoint(
    project_id: uuid.UUID,
    url_hash: _UrlHash,
    ctx: _WorkspaceDep,
    session: _SessionDep,
) -> SourcePageInspectionRequested:
    """Ask for one page to be inspected ahead of the automatic selection.

    An explicit request is still an admission: same lock, same budget, same
    spend accounting. Saying so is what keeps the remaining allowance
    meaningful.
    """
    view = await _resolve(session, ctx=ctx, project_id=project_id, url_hash=url_hash)
    claims = await claim_pages(
        session,
        workspace_id=ctx.workspace_id,
        project_id=project_id,
        limit=1,
        page_ids=[view.id],
    )
    await session.commit()
    budget = await current_budget(session, project_id=project_id)
    return SourcePageInspectionRequested(
        accepted=bool(claims),
        reason=None if claims else "budget_exhausted_or_not_claimable",
        budget_remaining=budget.remaining,
    )
