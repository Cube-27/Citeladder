"""Read and inspect endpoints for the external pages AI answers cited.

Its own router rather than more surface on ``projects``: that module already
carries the project lifecycle, visibility evidence and run selection, and these
endpoints have their own owner underneath them.

Reads render persisted projections. No read here fetches anything, and the
inspect route is an explicit authorized command that pays the same budget as
automatic selection -- a page someone asked for is not free.
"""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Path
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import WorkspaceContext, get_db, require_active_workspace
from app.core.http_errors import raise_not_found
from app.domain.analytics.enqueue import enqueue_source_page_inspection
from app.domain.projects.service import ProjectNotFoundError, get_project
from app.domain.source_pages.admission import current_budget, mark_inspection_requested
from app.domain.source_pages.projection import SourcePageView, get_source_page
from app.domain.source_pages.schemas import (
    SourcePageDetail,
    SourcePageInspectionRequested,
)
from app.models.audit import Audit

router = APIRouter(prefix="/projects", tags=["source-pages"])

_SessionDep = Annotated[AsyncSession, Depends(get_db)]
_WorkspaceDep = Annotated[WorkspaceContext, Depends(require_active_workspace)]
_UrlHash = Annotated[str, Path(min_length=64, max_length=64)]


async def _project(
    session: AsyncSession, *, ctx: WorkspaceContext, project_id: uuid.UUID
) -> None:
    try:
        await get_project(session, workspace_id=ctx.workspace_id, project_id=project_id)
    except ProjectNotFoundError as exc:
        raise_not_found("Project", cause=exc)


async def _resolve(
    session: AsyncSession,
    *,
    ctx: WorkspaceContext,
    project_id: uuid.UUID,
    url_hash: str,
) -> SourcePageView:
    await _project(session, ctx=ctx, project_id=project_id)
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
    return SourcePageDetail.model_validate(
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

    Queues the work rather than claiming the page here. Claiming in the request
    would spend a budget unit and leave the page leased with nothing running,
    so the user would be charged for an inspection that never happens and the
    page would sit untouched until the lease expired.

    A never-inspected page sorts first in admission, so the queued run picks it
    up; if it loses to a full batch of other new pages it is taken by the next
    one. The budget is reported as it stands now and is spent, as always, at
    claim time.
    """
    await _resolve(session, ctx=ctx, project_id=project_id, url_hash=url_hash)
    # Record the ask before anything can decline it. Asking is not spending:
    # the request is remembered whether or not today's budget admits it, and
    # a source somebody went looking for stays worth resolving either way.
    await mark_inspection_requested(session, project_id=project_id, url_hash=url_hash)
    outcome = await _admit(session, ctx=ctx, project_id=project_id, url_hash=url_hash)
    # One commit, after the decision. A per-branch commit would mean the next
    # decline reason someone adds silently discards the recorded request --
    # the exact failure marking it up front was introduced to prevent.
    await session.commit()
    return outcome


async def _admit(
    session: AsyncSession,
    *,
    ctx: WorkspaceContext,
    project_id: uuid.UUID,
    url_hash: str,
) -> SourcePageInspectionRequested:
    """Queue the inspection, or say why it was declined. Never commits."""
    budget = await current_budget(session, project_id=project_id)
    if budget.remaining <= 0:
        return SourcePageInspectionRequested(
            accepted=False, reason="budget_exhausted", budget_remaining=0
        )
    audit_id = await session.scalar(
        select(Audit.id)
        .where(
            Audit.workspace_id == ctx.workspace_id,
            Audit.project_id == project_id,
            Audit.completed_at.is_not(None),
        )
        .order_by(Audit.completed_at.desc())
        .limit(1)
    )
    if audit_id is None:
        # Inspection is scoped to an audit's cited evidence, so with no
        # completed audit there is nothing to inspect this page as part of.
        return SourcePageInspectionRequested(
            accepted=False,
            reason="no_completed_audit",
            budget_remaining=budget.remaining,
        )
    await enqueue_source_page_inspection(
        session,
        workspace_id=ctx.workspace_id,
        project_id=project_id,
        audit_id=audit_id,
    )
    return SourcePageInspectionRequested(
        accepted=True, reason=None, budget_remaining=budget.remaining
    )
