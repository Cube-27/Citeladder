"""Workspace-authorized Content generation API."""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Header, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import WorkspaceContext, get_db, require_active_workspace
from app.core.config.content import (
    CONTENT_IDEMPOTENCY_KEY_MAX_LEN,
    CONTENT_LIST_DEFAULT_LIMIT,
    CONTENT_LIST_MAX_LIMIT,
    ERROR_CANCEL_NOT_ALLOWED,
    ERROR_CONTENT_CONTEXT_CONFLICT,
    ERROR_DELETE_NOT_ALLOWED,
    ERROR_IDEMPOTENCY_CONFLICT,
    ERROR_PROVIDER_NOT_CONFIGURED,
)
from app.core.errors import ApiException
from app.core.http_errors import api_error, raise_api_error
from app.domain.abuse.service import UsageLimitExceededError
from app.domain.content.schemas import (
    ContentContextPreview,
    ContentFeedbackRequest,
    ContentGenerationCreate,
    ContentGenerationDetail,
    ContentGenerationListItem,
    ContentSkillCatalog,
    ContentTargetPage,
    SiteHealthReference,
    skill_catalog,
)
from app.domain.content.service import (
    CancelNotAllowedError,
    ContentGenerationConflictError,
    ContentGenerationNotFoundError,
    DeleteNotAllowedError,
    IdempotencyConflictError,
    ProviderNotConfiguredError,
    cancel_generation,
    clear_terminal_generations,
    context_preview,
    delete_generation,
    enqueue_generation,
    get_generation,
    list_generations,
    list_target_pages,
    record_feedback,
    regenerate,
    to_detail,
    to_list_item,
    try_again,
)

router = APIRouter(prefix="/content", tags=["content"])

_WorkspaceDep = Annotated[WorkspaceContext, Depends(require_active_workspace)]
_SessionDep = Annotated[AsyncSession, Depends(get_db)]


def _not_found(exc: Exception) -> ApiException:
    return api_error(status.HTTP_404_NOT_FOUND, str(exc))


def _usage_limited(exc: UsageLimitExceededError) -> ApiException:
    return api_error(
        status.HTTP_429_TOO_MANY_REQUESTS,
        "Workspace usage limit exceeded",
        headers={"Retry-After": str(exc.retry_after_seconds)},
    )


def _enqueue_conflict(exc: Exception) -> ApiException:
    if isinstance(exc, ProviderNotConfiguredError):
        detail = ERROR_PROVIDER_NOT_CONFIGURED
    elif isinstance(exc, ContentGenerationConflictError):
        detail = ERROR_CONTENT_CONTEXT_CONFLICT
    else:
        detail = ERROR_IDEMPOTENCY_CONFLICT
    return api_error(status.HTTP_409_CONFLICT, detail)


@router.get("/skills", response_model=ContentSkillCatalog)
async def list_skills_endpoint(ctx: _WorkspaceDep) -> ContentSkillCatalog:
    """The reusable output formats a generation may request.

    Static config rather than workspace data, but kept behind the workspace
    dependency like the rest of the router — the directive scaffolding is not
    something to serve anonymously.
    """
    del ctx
    return skill_catalog()


@router.get("/context-preview", response_model=ContentContextPreview)
async def context_preview_endpoint(
    ctx: _WorkspaceDep,
    session: _SessionDep,
    project_id: Annotated[uuid.UUID, Query()],
    target_site_url_id: Annotated[uuid.UUID | None, Query()] = None,
    target_url: Annotated[str | None, Query(max_length=2048)] = None,
    opportunity_id: Annotated[uuid.UUID | None, Query()] = None,
    demand_signal_id: Annotated[uuid.UUID | None, Query()] = None,
    site_health_crawl_id: Annotated[uuid.UUID | None, Query()] = None,
    site_health_site_url_id: Annotated[uuid.UUID | None, Query()] = None,
    site_health_source_analysis_id: Annotated[uuid.UUID | None, Query()] = None,
    site_health_dimension: Annotated[str | None, Query(max_length=32)] = None,
    site_health_checkpoint_ids: Annotated[str | None, Query(max_length=1039)] = None,
) -> ContentContextPreview:
    """What CiteLadder would ground a draft with, before one is requested."""
    try:
        preview = await context_preview(
            session,
            workspace_id=ctx.workspace_id,
            project_id=project_id,
            target_site_url_id=target_site_url_id,
            target_url=target_url,
            opportunity_id=opportunity_id,
            demand_signal_id=demand_signal_id,
            site_health_reference=_preview_site_health_reference(
                project_id=project_id,
                crawl_id=site_health_crawl_id,
                site_url_id=site_health_site_url_id,
                source_analysis_id=site_health_source_analysis_id,
                dimension=site_health_dimension,
                checkpoint_ids=site_health_checkpoint_ids,
            ),
        )
    except ContentGenerationNotFoundError as exc:
        raise _not_found(exc) from exc
    except ContentGenerationConflictError as exc:
        raise _enqueue_conflict(exc) from exc
    return ContentContextPreview.model_validate(preview)


def _preview_site_health_reference(
    *,
    project_id: uuid.UUID,
    crawl_id: uuid.UUID | None,
    site_url_id: uuid.UUID | None,
    source_analysis_id: uuid.UUID | None,
    dimension: str | None,
    checkpoint_ids: str | None,
) -> SiteHealthReference | None:
    """Build the existing typed reference only when the complete identity is present."""
    if (
        crawl_id is None
        or site_url_id is None
        or source_analysis_id is None
        or not dimension
        or not checkpoint_ids
    ):
        return None
    return SiteHealthReference(
        project_id=project_id,
        crawl_id=crawl_id,
        site_url_id=site_url_id,
        source_analysis_id=source_analysis_id,
        dimension=dimension,
        checkpoint_ids=[item for item in checkpoint_ids.split(",") if item],
    )


@router.get("/generations", response_model=list[ContentGenerationListItem])
async def list_generations_endpoint(
    ctx: _WorkspaceDep,
    session: _SessionDep,
    project_id: Annotated[uuid.UUID, Query()],
    limit: Annotated[
        int, Query(ge=1, le=CONTENT_LIST_MAX_LIMIT)
    ] = CONTENT_LIST_DEFAULT_LIMIT,
) -> list[ContentGenerationListItem]:
    try:
        rows = await list_generations(
            session,
            workspace_id=ctx.workspace_id,
            project_id=project_id,
            limit=limit,
        )
    except ContentGenerationNotFoundError as exc:
        raise _not_found(exc) from exc
    return [to_list_item(row) for row in rows]


@router.get("/target-pages", response_model=list[ContentTargetPage])
async def list_target_pages_endpoint(
    ctx: _WorkspaceDep,
    session: _SessionDep,
    project_id: Annotated[uuid.UUID, Query()],
    query: Annotated[str, Query(max_length=256)] = "",
) -> list[ContentTargetPage]:
    try:
        return await list_target_pages(
            session,
            workspace_id=ctx.workspace_id,
            project_id=project_id,
            query=query,
        )
    except ContentGenerationNotFoundError as exc:
        raise _not_found(exc) from exc


@router.post(
    "/generations",
    response_model=ContentGenerationDetail,
    status_code=status.HTTP_201_CREATED,
)
async def enqueue_generation_endpoint(
    payload: ContentGenerationCreate,
    ctx: _WorkspaceDep,
    session: _SessionDep,
    idempotency_key: Annotated[
        str | None,
        Header(alias="Idempotency-Key", max_length=CONTENT_IDEMPOTENCY_KEY_MAX_LEN),
    ] = None,
) -> ContentGenerationDetail:
    try:
        row, _created = await enqueue_generation(
            session,
            workspace_id=ctx.workspace_id,
            project_id=payload.project_id,
            user_instruction=payload.user_instruction,
            idempotency_key=(idempotency_key or "").strip(),
            skill_id=payload.skill_id,
            target_site_url_id=payload.target_site_url_id,
            target_url=payload.target_url,
            opportunity_id=payload.opportunity_id,
            demand_signal_id=payload.demand_signal_id,
            site_health_reference=payload.site_health_reference,
        )
    except ContentGenerationNotFoundError as exc:
        raise _not_found(exc) from exc
    except (
        ProviderNotConfiguredError,
        IdempotencyConflictError,
        ContentGenerationConflictError,
    ) as exc:
        raise _enqueue_conflict(exc) from exc
    except UsageLimitExceededError as exc:
        raise _usage_limited(exc) from exc
    return to_detail(row)


@router.delete("/generations/{generation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_generation_endpoint(
    generation_id: uuid.UUID, ctx: _WorkspaceDep, session: _SessionDep
) -> None:
    try:
        await delete_generation(
            session, workspace_id=ctx.workspace_id, generation_id=generation_id
        )
    except ContentGenerationNotFoundError as exc:
        raise _not_found(exc) from exc
    except DeleteNotAllowedError as exc:
        raise_api_error(
            status.HTTP_409_CONFLICT,
            "This content generation is still active. Cancel it before deleting it.",
            code=ERROR_DELETE_NOT_ALLOWED,
            detail=ERROR_DELETE_NOT_ALLOWED,
            cause=exc,
        )


@router.delete("/generations", status_code=status.HTTP_204_NO_CONTENT)
async def clear_generation_history_endpoint(
    ctx: _WorkspaceDep,
    session: _SessionDep,
    project_id: Annotated[uuid.UUID, Query()],
) -> None:
    try:
        await clear_terminal_generations(
            session, workspace_id=ctx.workspace_id, project_id=project_id
        )
    except ContentGenerationNotFoundError as exc:
        raise _not_found(exc) from exc


@router.get("/generations/{generation_id}", response_model=ContentGenerationDetail)
async def get_generation_endpoint(
    generation_id: uuid.UUID, ctx: _WorkspaceDep, session: _SessionDep
) -> ContentGenerationDetail:
    try:
        row = await get_generation(
            session, workspace_id=ctx.workspace_id, generation_id=generation_id
        )
    except ContentGenerationNotFoundError as exc:
        raise _not_found(exc) from exc
    return to_detail(row)


@router.post(
    "/generations/{generation_id}/feedback", response_model=ContentGenerationDetail
)
async def content_feedback_endpoint(
    generation_id: uuid.UUID,
    payload: ContentFeedbackRequest,
    ctx: _WorkspaceDep,
    session: _SessionDep,
) -> ContentGenerationDetail:
    try:
        row = await record_feedback(
            session,
            workspace_id=ctx.workspace_id,
            generation_id=generation_id,
            feedback=payload.feedback,
            reason=payload.reason,
        )
    except ContentGenerationNotFoundError as exc:
        raise _not_found(exc) from exc
    except ValueError as exc:
        raise_api_error(status.HTTP_409_CONFLICT, str(exc), cause=exc)
    return to_detail(row)


async def _repeat_generation(
    operation,
    *,
    generation_id: uuid.UUID,
    workspace_id: uuid.UUID,
    session: AsyncSession,
) -> ContentGenerationDetail:
    try:
        row = await operation(
            session, workspace_id=workspace_id, generation_id=generation_id
        )
    except ContentGenerationNotFoundError as exc:
        raise _not_found(exc) from exc
    except ProviderNotConfiguredError as exc:
        raise _enqueue_conflict(exc) from exc
    except UsageLimitExceededError as exc:
        raise _usage_limited(exc) from exc
    return to_detail(row)


@router.post(
    "/generations/{generation_id}/regenerate",
    response_model=ContentGenerationDetail,
    status_code=status.HTTP_201_CREATED,
)
async def regenerate_endpoint(
    generation_id: uuid.UUID, ctx: _WorkspaceDep, session: _SessionDep
) -> ContentGenerationDetail:
    return await _repeat_generation(
        regenerate,
        generation_id=generation_id,
        workspace_id=ctx.workspace_id,
        session=session,
    )


@router.post(
    "/generations/{generation_id}/try-again",
    response_model=ContentGenerationDetail,
    status_code=status.HTTP_201_CREATED,
)
async def try_again_endpoint(
    generation_id: uuid.UUID, ctx: _WorkspaceDep, session: _SessionDep
) -> ContentGenerationDetail:
    return await _repeat_generation(
        try_again,
        generation_id=generation_id,
        workspace_id=ctx.workspace_id,
        session=session,
    )


@router.post(
    "/generations/{generation_id}/cancel", response_model=ContentGenerationDetail
)
async def cancel_generation_endpoint(
    generation_id: uuid.UUID, ctx: _WorkspaceDep, session: _SessionDep
) -> ContentGenerationDetail:
    try:
        row = await cancel_generation(
            session, workspace_id=ctx.workspace_id, generation_id=generation_id
        )
    except ContentGenerationNotFoundError as exc:
        raise _not_found(exc) from exc
    except CancelNotAllowedError as exc:
        raise_api_error(
            status.HTTP_409_CONFLICT,
            "This content generation can no longer be cancelled",
            code=ERROR_CANCEL_NOT_ALLOWED,
            detail=ERROR_CANCEL_NOT_ALLOWED,
            cause=exc,
        )
    return to_detail(row)
