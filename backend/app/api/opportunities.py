# Opportunities router: workspace-scoped catalog + recompute API.
#
# Flat API surface under ``/api/v1`` (no workspace_id in the path); the active
# workspace is resolved by ``require_active_workspace`` from the
# ``X-Workspace-Id`` header (or the caller's default workspace) and EVERY
# lookup is filtered by it, so a foreign/missing id is always a 404
# (invariant 5). The router only maps the service layer's coded errors onto
# HTTP — it never fetches, re-scores, or fabricates a row. ``recompute`` is
# the only write beyond the human status patch; it is inline-only in v1 (no
# queue) and returns the immutable snapshot it wrote.
from __future__ import annotations

import uuid
from collections.abc import Callable, Sequence
from typing import Annotated

from fastapi import APIRouter, Depends, Header, Query, status
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.analysis.opportunities.exports import rows_to_csv, rows_to_markdown
from app.api.deps import (
    WorkspaceContext,
    get_db,
    require_active_workspace,
    require_active_workspace_run,
    require_active_workspace_write,
)
from app.core.config.actions import (
    ACTION_LIST_DEFAULT_LIMIT,
    ACTION_LIST_MAX_LIMIT,
)
from app.core.config.errors import (
    CODE_INVALID_CURSOR,
    CODE_NOT_FOUND,
    CODE_VALIDATION_ERROR,
)
from app.core.config.opportunities import (
    CODE_IMPLEMENTATION_IDEMPOTENCY_CONFLICT,
    CODE_IMPLEMENTATION_TARGET_CONFLICT,
    CODE_OPPORTUNITY_ORDER_CONFLICT,
    IMPLEMENTATION_EVENT_DEFAULT_LIMIT,
    IMPLEMENTATION_EVENT_MAX_LIMIT,
    IMPLEMENTATION_IDEMPOTENCY_KEY_MAX_LEN,
    LIST_DEFAULT_LIMIT,
    LIST_MAX_LIMIT,
)
from app.core.errors import ApiException
from app.domain.opportunities import (
    actions,
    commands,
    export,
    history,
    queries,
    recompute,
)
from app.domain.opportunities import (
    summary as summary_service,
)
from app.domain.opportunities.action_schemas import (
    ActionDetail,
    ActionItem,
    ActionsPage,
)
from app.domain.opportunities.errors import (
    InvalidCursorError,
    OpportunityNotFoundError,
    OpportunityOrderConflictError,
    OpportunitySupersededError,
    OpportunityValidationError,
)
from app.domain.opportunities.implementation_events import (
    ImplementationConflictError,
    ImplementationDeclaration,
    ImplementationIdempotencyConflictError,
    ImplementationNotFoundError,
    create_implementation_event,
    get_implementation_event,
    list_implementation_events,
    list_verification_events,
)
from app.domain.opportunities.projection import project_item
from app.domain.opportunities.schemas import (
    ImplementationEventCreate,
    ImplementationEventsPage,
    ImplementationEventView,
    OpportunitiesPage,
    OpportunityDetail,
    OpportunityHistoryResponse,
    OpportunityItem,
    OpportunityOrderResponse,
    OpportunityOrderUpdate,
    OpportunityStatusPatch,
    OpportunitySummary,
    RecomputeRequest,
    RecomputeResponse,
    VerificationEventView,
)
from app.models.opportunity import (
    OpportunityImplementationEvent,
    OpportunityVerificationEvent,
)

router = APIRouter(prefix="", tags=["opportunities"])

_WorkspaceDep = Annotated[WorkspaceContext, Depends(require_active_workspace)]

# Capability-gated variants of the router's workspace dependency. They apply the
# ONE role policy (app/domain/workspaces/policy.py): Viewer is read-only, and
# Member keeps every non-administrative product action. Nothing here spells a
# role set of its own.
_RunDep = Annotated[WorkspaceContext, Depends(require_active_workspace_run)]
_WriteDep = Annotated[WorkspaceContext, Depends(require_active_workspace_write)]
_SessionDep = Annotated[AsyncSession, Depends(get_db)]


def _verification_view(row: OpportunityVerificationEvent) -> VerificationEventView:
    return VerificationEventView(
        id=row.id,
        observation_kind=row.observation_kind,
        observed_at=row.observed_at,
        crawl_id=row.crawl_id,
        audit_id=row.audit_id,
        source_analysis_ids=list(row.source_analysis_ids or []),
        source_rule_evaluation_ids=list(row.source_rule_evaluation_ids or []),
        source_metric_ids=list(row.source_metric_ids or []),
        result=row.result or {},
        verifier_version=row.verifier_version,
        limitations=list(row.limitations or []),
        created_at=row.created_at,
    )


def _implementation_view(
    row: OpportunityImplementationEvent,
    verification_rows: Sequence[OpportunityVerificationEvent] = (),
) -> ImplementationEventView:
    latest = verification_rows[-1] if verification_rows else None
    return ImplementationEventView(
        id=row.id,
        project_id=row.project_id,
        opportunity_id=row.opportunity_id,
        opportunity_snapshot_id=row.opportunity_snapshot_id,
        target_site_url_ids=list(row.target_site_url_ids or []),
        target_external_url=row.target_external_url,
        declared_implemented_at=row.declared_implemented_at,
        expected_checks=list(row.expected_checks or []),
        state=latest.observation_kind if latest is not None else "declared",
        limitations=list(latest.limitations or []) if latest is not None else [],
        verification_events=[_verification_view(item) for item in verification_rows],
        created_at=row.created_at,
    )


def _not_found(exc: OpportunityNotFoundError) -> ApiException:
    return ApiException(status.HTTP_404_NOT_FOUND, CODE_NOT_FOUND, str(exc))


def _validation(exc: OpportunityValidationError) -> ApiException:
    return ApiException(
        status.HTTP_422_UNPROCESSABLE_CONTENT, CODE_VALIDATION_ERROR, str(exc)
    )


def _bad_cursor(exc: InvalidCursorError) -> ApiException:
    return ApiException(status.HTTP_400_BAD_REQUEST, CODE_INVALID_CURSOR, str(exc))


def _superseded(exc: OpportunitySupersededError) -> ApiException:
    # Coded dialect: the legacy ``detail`` dict keeps its exact shape (WS-A A1).
    return ApiException.coded(status.HTTP_409_CONFLICT, exc.code, str(exc))


# =========================================================================
# Catalog (priority-sorted, keyset-paginated)
# =========================================================================
@router.get(
    "/projects/{project_id}/opportunities",
)
async def list_opportunities_endpoint(
    project_id: uuid.UUID,
    ctx: _WorkspaceDep,
    session: _SessionDep,
    type_filter: Annotated[str | None, Query(alias="type")] = None,
    severity: Annotated[str | None, Query()] = None,
    status_filter: Annotated[str | None, Query(alias="status")] = None,
    rule_id: Annotated[str | None, Query()] = None,
    min_priority: Annotated[float | None, Query()] = None,
    action_path: Annotated[str | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=LIST_MAX_LIMIT)] = LIST_DEFAULT_LIMIT,
    cursor: Annotated[str | None, Query()] = None,
) -> OpportunitiesPage:
    try:
        page = await queries.list_opportunities(
            session,
            workspace_id=ctx.workspace_id,
            project_id=project_id,
            opportunity_type=type_filter,
            severity=severity,
            status=status_filter,
            rule_id=rule_id,
            min_priority=min_priority,
            action_path=action_path,
            limit=limit,
            cursor=cursor,
        )
    except OpportunityNotFoundError as exc:
        raise _not_found(exc) from exc
    except OpportunityValidationError as exc:
        raise _validation(exc) from exc
    except InvalidCursorError as exc:
        raise _bad_cursor(exc) from exc
    return OpportunitiesPage.model_validate(page)


@router.get(
    "/projects/{project_id}/opportunities/summary",
)
async def get_summary_endpoint(
    project_id: uuid.UUID, ctx: _WorkspaceDep, session: _SessionDep
) -> OpportunitySummary:
    try:
        summary = await summary_service.get_summary(
            session, workspace_id=ctx.workspace_id, project_id=project_id
        )
    except OpportunityNotFoundError as exc:
        raise _not_found(exc) from exc
    return OpportunitySummary.model_validate(summary)


@router.post(
    "/projects/{project_id}/opportunities/recompute",
)
async def recompute_endpoint(
    project_id: uuid.UUID,
    ctx: _RunDep,
    session: _SessionDep,
    payload: RecomputeRequest | None = None,
) -> RecomputeResponse:
    try:
        snapshot = await recompute.recompute(
            session,
            workspace_id=ctx.workspace_id,
            project_id=project_id,
            audit_id=payload.audit_id if payload is not None else None,
            site_crawl_id=payload.site_crawl_id if payload is not None else None,
        )
    except OpportunityNotFoundError as exc:
        raise _not_found(exc) from exc
    return RecomputeResponse.model_validate(snapshot)


@router.get(
    "/projects/{project_id}/opportunities/history",
)
async def get_grouped_history_endpoint(
    project_id: uuid.UUID, ctx: _WorkspaceDep, session: _SessionDep
) -> OpportunityHistoryResponse:
    try:
        projection = await history.get_grouped_history(
            session, workspace_id=ctx.workspace_id, project_id=project_id
        )
    except OpportunityNotFoundError as exc:
        raise _not_found(exc) from exc
    return OpportunityHistoryResponse.model_validate(projection)


@router.post(
    "/projects/{project_id}/opportunities/implementation-events",
    status_code=status.HTTP_201_CREATED,
)
async def create_implementation_event_endpoint(
    project_id: uuid.UUID,
    payload: ImplementationEventCreate,
    ctx: _WriteDep,
    session: _SessionDep,
    response: Response,
    idempotency_key: Annotated[
        str | None,
        Header(
            alias="Idempotency-Key",
            max_length=IMPLEMENTATION_IDEMPOTENCY_KEY_MAX_LEN,
        ),
    ] = None,
) -> ImplementationEventView:
    key = (idempotency_key or "").strip()
    if not key:
        raise ApiException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            CODE_VALIDATION_ERROR,
            "Idempotency-Key is required",
        )
    try:
        row, created = await create_implementation_event(
            session,
            workspace_id=ctx.workspace_id,
            project_id=project_id,
            actor_user_id=ctx.user.id,
            idempotency_key=key,
            declaration=ImplementationDeclaration(
                opportunity_id=payload.opportunity_id,
                target_site_url_ids=payload.target_site_url_ids,
                declared_implemented_at=payload.declared_implemented_at,
                expected_checks=[
                    item.model_dump(mode="json") for item in payload.expected_checks
                ],
            ),
        )
        await session.commit()
    except ImplementationNotFoundError as exc:
        raise ApiException(status.HTTP_404_NOT_FOUND, CODE_NOT_FOUND, str(exc)) from exc
    except ImplementationIdempotencyConflictError as exc:
        raise ApiException(
            status.HTTP_409_CONFLICT,
            CODE_IMPLEMENTATION_IDEMPOTENCY_CONFLICT,
            str(exc),
        ) from exc
    except ImplementationConflictError as exc:
        raise ApiException(
            status.HTTP_409_CONFLICT,
            CODE_IMPLEMENTATION_TARGET_CONFLICT,
            str(exc),
        ) from exc
    if not created:
        response.status_code = status.HTTP_200_OK
    verification = await list_verification_events(
        session,
        workspace_id=ctx.workspace_id,
        project_id=project_id,
        implementation_event_ids=[row.id],
    )
    return _implementation_view(row, verification.get(row.id, []))


@router.get(
    "/projects/{project_id}/opportunities/implementation-events",
)
async def list_implementation_events_endpoint(
    project_id: uuid.UUID,
    ctx: _WorkspaceDep,
    session: _SessionDep,
    limit: Annotated[
        int, Query(ge=1, le=IMPLEMENTATION_EVENT_MAX_LIMIT)
    ] = IMPLEMENTATION_EVENT_DEFAULT_LIMIT,
    opportunity_id: Annotated[uuid.UUID | None, Query()] = None,
) -> ImplementationEventsPage:
    try:
        rows = await list_implementation_events(
            session,
            workspace_id=ctx.workspace_id,
            project_id=project_id,
            limit=limit,
            opportunity_id=opportunity_id,
        )
    except ImplementationNotFoundError as exc:
        raise ApiException(status.HTTP_404_NOT_FOUND, CODE_NOT_FOUND, str(exc)) from exc
    verification = await list_verification_events(
        session,
        workspace_id=ctx.workspace_id,
        project_id=project_id,
        implementation_event_ids=[row.id for row in rows],
    )
    return ImplementationEventsPage(
        items=[_implementation_view(row, verification.get(row.id, [])) for row in rows]
    )


@router.get(
    "/projects/{project_id}/opportunities/implementation-events/{event_id}",
)
async def get_implementation_event_endpoint(
    project_id: uuid.UUID,
    event_id: uuid.UUID,
    ctx: _WorkspaceDep,
    session: _SessionDep,
) -> ImplementationEventView:
    try:
        row = await get_implementation_event(
            session,
            workspace_id=ctx.workspace_id,
            project_id=project_id,
            event_id=event_id,
        )
    except ImplementationNotFoundError as exc:
        raise ApiException(status.HTTP_404_NOT_FOUND, CODE_NOT_FOUND, str(exc)) from exc
    verification = await list_verification_events(
        session,
        workspace_id=ctx.workspace_id,
        project_id=project_id,
        implementation_event_ids=[row.id],
    )
    return _implementation_view(row, verification.get(row.id, []))


# =========================================================================
# Row read + the one mutation (human workflow status)
# =========================================================================
@router.get("/opportunities/{opportunity_id}")
async def get_opportunity_endpoint(
    opportunity_id: uuid.UUID, ctx: _WorkspaceDep, session: _SessionDep
) -> OpportunityDetail:
    try:
        detail = await queries.get_opportunity(
            session, workspace_id=ctx.workspace_id, opportunity_id=opportunity_id
        )
    except OpportunityNotFoundError as exc:
        raise _not_found(exc) from exc
    return OpportunityDetail.model_validate(detail)


@router.patch("/opportunities/{opportunity_id}")
async def update_status_endpoint(
    opportunity_id: uuid.UUID,
    payload: OpportunityStatusPatch,
    ctx: _WriteDep,
    session: _SessionDep,
) -> OpportunityItem:
    try:
        item = await commands.update_status(
            session,
            workspace_id=ctx.workspace_id,
            opportunity_id=opportunity_id,
            status=payload.status,
            changed_by_user_id=ctx.user.id,
        )
    except OpportunityNotFoundError as exc:
        raise _not_found(exc) from exc
    except OpportunityValidationError as exc:
        raise _validation(exc) from exc
    except OpportunitySupersededError as exc:
        raise _superseded(exc) from exc
    return OpportunityItem.model_validate(item)


@router.put(
    "/projects/{project_id}/opportunities/order",
)
async def update_order_endpoint(
    project_id: uuid.UUID,
    payload: OpportunityOrderUpdate,
    ctx: _WriteDep,
    session: _SessionDep,
) -> OpportunityOrderResponse:
    try:
        result = await commands.update_order(
            session,
            workspace_id=ctx.workspace_id,
            project_id=project_id,
            ordered_opportunity_ids=payload.ordered_opportunity_ids,
            expected_version=payload.expected_version,
            updated_by_user_id=ctx.user.id,
        )
    except OpportunityNotFoundError as exc:
        raise _not_found(exc) from exc
    except OpportunityValidationError as exc:
        raise _validation(exc) from exc
    except OpportunityOrderConflictError as exc:
        raise ApiException(
            status.HTTP_409_CONFLICT,
            CODE_OPPORTUNITY_ORDER_CONFLICT,
            str(exc),
        ) from exc
    return OpportunityOrderResponse.model_validate(result)


# =========================================================================
# Actions (one unit of work per target over the live Opportunity set)
# =========================================================================
@router.get("/projects/{project_id}/actions")
async def list_actions_endpoint(
    project_id: uuid.UUID,
    ctx: _WorkspaceDep,
    session: _SessionDep,
    limit: Annotated[
        int, Query(ge=1, le=ACTION_LIST_MAX_LIMIT)
    ] = ACTION_LIST_DEFAULT_LIMIT,
    cursor: Annotated[str | None, Query()] = None,
) -> ActionsPage:
    try:
        rows, next_cursor = await actions.list_actions(
            session,
            workspace_id=ctx.workspace_id,
            project_id=project_id,
            limit=limit,
            cursor=cursor,
        )
    except OpportunityNotFoundError as exc:
        raise _not_found(exc) from exc
    except InvalidCursorError as exc:
        raise _bad_cursor(exc) from exc
    return ActionsPage(
        items=[
            ActionItem.model_validate(actions.action_projection(row)) for row in rows
        ],
        next_cursor=next_cursor,
    )


@router.get("/actions/{action_id}")
async def get_action_endpoint(
    action_id: uuid.UUID, ctx: _WorkspaceDep, session: _SessionDep
) -> ActionDetail:
    try:
        action, members = await actions.get_action(
            session, workspace_id=ctx.workspace_id, action_id=action_id
        )
    except OpportunityNotFoundError as exc:
        raise _not_found(exc) from exc
    return ActionDetail.model_validate(
        {
            **actions.action_projection(action),
            "diagnosis": action.diagnosis or {},
            "members": [project_item(member) for member in members],
        }
    )


# =========================================================================
# Exports (same projection + filters as the catalog, workspace-safe)
# =========================================================================
async def _export_response(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    type_filter: str | None,
    severity: str | None,
    status_filter: str | None,
    rule_id: str | None,
    min_priority: float | None,
    render: Callable[[list[dict]], str],
    media_type: str,
    filename: str,
) -> Response:
    """The shared export pipeline: load the projection, render, attach."""
    try:
        rows = await export.load_export_rows(
            session,
            workspace_id=workspace_id,
            project_id=project_id,
            opportunity_type=type_filter,
            severity=severity,
            status=status_filter,
            rule_id=rule_id,
            min_priority=min_priority,
        )
    except OpportunityNotFoundError as exc:
        raise _not_found(exc) from exc
    except OpportunityValidationError as exc:
        raise _validation(exc) from exc
    headers = {"Content-Disposition": f'attachment; filename="{filename}"'}
    return Response(content=render(rows), media_type=media_type, headers=headers)


@router.get("/projects/{project_id}/opportunities/export.csv")
async def export_csv_endpoint(
    project_id: uuid.UUID,
    ctx: _WorkspaceDep,
    session: _SessionDep,
    type_filter: Annotated[str | None, Query(alias="type")] = None,
    severity: Annotated[str | None, Query()] = None,
    status_filter: Annotated[str | None, Query(alias="status")] = None,
    rule_id: Annotated[str | None, Query()] = None,
    min_priority: Annotated[float | None, Query()] = None,
) -> Response:
    return await _export_response(
        session,
        workspace_id=ctx.workspace_id,
        project_id=project_id,
        type_filter=type_filter,
        severity=severity,
        status_filter=status_filter,
        rule_id=rule_id,
        min_priority=min_priority,
        render=rows_to_csv,
        media_type="text/csv",
        filename=f"opportunities-{project_id}.csv",
    )


@router.get("/projects/{project_id}/opportunities/export.md")
async def export_markdown_endpoint(
    project_id: uuid.UUID,
    ctx: _WorkspaceDep,
    session: _SessionDep,
    type_filter: Annotated[str | None, Query(alias="type")] = None,
    severity: Annotated[str | None, Query()] = None,
    status_filter: Annotated[str | None, Query(alias="status")] = None,
    rule_id: Annotated[str | None, Query()] = None,
    min_priority: Annotated[float | None, Query()] = None,
) -> Response:
    return await _export_response(
        session,
        workspace_id=ctx.workspace_id,
        project_id=project_id,
        type_filter=type_filter,
        severity=severity,
        status_filter=status_filter,
        rule_id=rule_id,
        min_priority=min_priority,
        render=rows_to_markdown,
        media_type="text/markdown",
        filename=f"opportunities-{project_id}.md",
    )
