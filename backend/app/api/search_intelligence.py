"""Workspace-authorized Search Intelligence cost review.

The rest of the Search Intelligence family is served by the TypeScript API
service (TypeScript migration PR 8a). Review creation stays here: it
resolves competitor websites through the Site Health secure fetcher.
"""

from __future__ import annotations

import uuid
from typing import Annotated, NoReturn

from fastapi import APIRouter, Depends, Header, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import WorkspaceContext, get_db, require_project_run
from app.core.errors import ApiException
from app.domain.demand.search_intelligence.schemas import ReviewCreate, RunResponse
from app.domain.demand.search_intelligence.service import (
    SearchIntelligenceError,
    create_review,
)
from app.models.search_intelligence import SearchIntelligenceRun

reviews_router = APIRouter(
    prefix="/projects/{project_id}/search-intelligence",
    tags=["search-intelligence-reviews"],
)
_Session = Annotated[AsyncSession, Depends(get_db)]
_Run = Annotated[WorkspaceContext, Depends(require_project_run)]


def _raise(exc: SearchIntelligenceError) -> NoReturn:
    status_code = (
        status.HTTP_404_NOT_FOUND
        if exc.code == "not_found"
        else status.HTTP_422_UNPROCESSABLE_CONTENT
    )
    raise ApiException.coded(status_code, exc.code, str(exc)) from exc


@reviews_router.post(
    "/reviews", response_model=RunResponse, status_code=status.HTTP_201_CREATED
)
async def post_review(
    project_id: uuid.UUID,
    payload: ReviewCreate,
    ctx: _Run,
    session: _Session,
    idempotency_key: Annotated[
        str, Header(alias="Idempotency-Key", min_length=1, max_length=160)
    ],
) -> SearchIntelligenceRun:
    try:
        return await create_review(
            session,
            workspace_id=ctx.workspace_id,
            project_id=project_id,
            actor_user_id=ctx.user.id,
            idempotency_key=idempotency_key,
            payload=payload,
        )
    except SearchIntelligenceError as exc:
        _raise(exc)
