"""Workspace-authorized Search Intelligence API."""

from __future__ import annotations

import uuid
from typing import Annotated, NoReturn

from fastapi import APIRouter, Depends, Header, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import (
    WorkspaceContext,
    get_db,
    require_project_member,
    require_project_run,
    require_project_write,
)
from app.core.errors import ApiException
from app.domain.demand.search_intelligence.citations import derive_citation_matches
from app.domain.demand.search_intelligence.schemas import (
    CitationMatchRequest,
    ContentHandoffRequest,
    ContentHandoffResponse,
    DatasetPageResponse,
    ReadinessResponse,
    ReviewCreate,
    RunResponse,
    SearchIntelligencePreferences,
)
from app.domain.demand.search_intelligence.service import (
    SearchIntelligenceError,
    cancel_run,
    confirm_review,
    content_handoff,
    create_review,
    dataset_page,
    readiness,
    update_preferences,
)
from app.models.search_intelligence import SearchIntelligenceRun

router = APIRouter(
    prefix="/projects/{project_id}/search-intelligence", tags=["search-intelligence"]
)
_Session = Annotated[AsyncSession, Depends(get_db)]
_Read = Annotated[WorkspaceContext, Depends(require_project_member)]
_Run = Annotated[WorkspaceContext, Depends(require_project_run)]
_Write = Annotated[WorkspaceContext, Depends(require_project_write)]


def _raise(exc: SearchIntelligenceError) -> NoReturn:
    status_code = (
        status.HTTP_404_NOT_FOUND
        if exc.code == "not_found"
        else status.HTTP_409_CONFLICT
        if exc.code
        in {
            "review_expired",
            "pricing_changed",
            "connection_changed",
            "acquisition_in_progress",
        }
        else status.HTTP_422_UNPROCESSABLE_CONTENT
    )
    raise ApiException.coded(status_code, exc.code, str(exc)) from exc


@router.get("", response_model=ReadinessResponse)
async def get_readiness(
    project_id: uuid.UUID, ctx: _Read, session: _Session
) -> ReadinessResponse:
    try:
        return await readiness(
            session, workspace_id=ctx.workspace_id, project_id=project_id
        )
    except SearchIntelligenceError as exc:
        _raise(exc)


@router.put("/preferences", response_model=SearchIntelligencePreferences)
async def put_preferences(
    project_id: uuid.UUID,
    payload: SearchIntelligencePreferences,
    ctx: _Write,
    session: _Session,
) -> SearchIntelligencePreferences:
    try:
        return await update_preferences(
            session,
            workspace_id=ctx.workspace_id,
            project_id=project_id,
            preferences=payload,
        )
    except SearchIntelligenceError as exc:
        _raise(exc)


@router.post(
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


@router.post(
    "/runs/{run_id}/confirm",
    response_model=RunResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def post_confirm(
    project_id: uuid.UUID, run_id: uuid.UUID, ctx: _Run, session: _Session
) -> SearchIntelligenceRun:
    try:
        return await confirm_review(
            session, workspace_id=ctx.workspace_id, project_id=project_id, run_id=run_id
        )
    except SearchIntelligenceError as exc:
        _raise(exc)


@router.post("/runs/{run_id}/cancel", response_model=RunResponse)
async def post_cancel(
    project_id: uuid.UUID, run_id: uuid.UUID, ctx: _Run, session: _Session
) -> SearchIntelligenceRun:
    try:
        return await cancel_run(
            session, workspace_id=ctx.workspace_id, project_id=project_id, run_id=run_id
        )
    except SearchIntelligenceError as exc:
        _raise(exc)


@router.get("/runs", response_model=list[RunResponse])
async def get_runs(
    project_id: uuid.UUID,
    ctx: _Read,
    session: _Session,
    offset: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=100)] = 25,
) -> list[SearchIntelligenceRun]:
    return list(
        (
            await session.scalars(
                select(SearchIntelligenceRun)
                .where(
                    SearchIntelligenceRun.workspace_id == ctx.workspace_id,
                    SearchIntelligenceRun.project_id == project_id,
                )
                .order_by(SearchIntelligenceRun.created_at.desc())
                .offset(offset)
                .limit(limit)
            )
        ).all()
    )


@router.get("/runs/{run_id}", response_model=RunResponse)
async def get_run(
    project_id: uuid.UUID, run_id: uuid.UUID, ctx: _Read, session: _Session
) -> SearchIntelligenceRun:
    row = await session.scalar(
        select(SearchIntelligenceRun).where(
            SearchIntelligenceRun.workspace_id == ctx.workspace_id,
            SearchIntelligenceRun.project_id == project_id,
            SearchIntelligenceRun.id == run_id,
        )
    )
    if row is None:
        raise ApiException.coded(
            status.HTTP_404_NOT_FOUND, "not_found", "Run not found"
        )
    return row


@router.get("/datasets/{dataset_id}/rows", response_model=DatasetPageResponse)
async def get_dataset_rows(
    project_id: uuid.UUID,
    dataset_id: uuid.UUID,
    ctx: _Read,
    session: _Session,
    cursor: Annotated[str | None, Query(max_length=100)] = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
) -> DatasetPageResponse:
    try:
        dataset, rows, next_cursor = await dataset_page(
            session,
            workspace_id=ctx.workspace_id,
            project_id=project_id,
            dataset_id=dataset_id,
            cursor=cursor,
            limit=limit,
        )
        return DatasetPageResponse(dataset=dataset, rows=rows, next_cursor=next_cursor)
    except SearchIntelligenceError as exc:
        _raise(exc)


@router.post("/content-handoff", response_model=ContentHandoffResponse)
async def post_content_handoff(
    project_id: uuid.UUID,
    payload: ContentHandoffRequest,
    ctx: _Write,
    session: _Session,
) -> ContentHandoffResponse:
    try:
        return await content_handoff(
            session,
            workspace_id=ctx.workspace_id,
            project_id=project_id,
            dataset_id=payload.dataset_id,
            row_ids=payload.row_ids,
            user_instructions=payload.user_instructions,
        )
    except SearchIntelligenceError as exc:
        _raise(exc)


@router.post(
    "/citation-matches", response_model=dict, status_code=status.HTTP_201_CREATED
)
async def post_citation_matches(
    project_id: uuid.UUID, payload: CitationMatchRequest, ctx: _Write, session: _Session
) -> dict:
    try:
        return await derive_citation_matches(
            session,
            workspace_id=ctx.workspace_id,
            project_id=project_id,
            backlink_dataset_id=payload.backlink_dataset_id,
            audit_ids=payload.audit_ids,
        )
    except SearchIntelligenceError as exc:
        _raise(exc)
