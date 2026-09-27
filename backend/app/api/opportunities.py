# Actions router: the Python-owned half of the Opportunity family.
#
# The Opportunity catalog, its refresh and exports moved to the TypeScript
# service (TypeScript migration PR 7a); the Action list/detail, workflow
# status and implementation declaration stay here until PR 7b. Flat API
# surface under ``/api/v1``; the active workspace is resolved by
# ``require_active_workspace`` and EVERY lookup is filtered by it, so a
# foreign/missing id is always a 404 (invariant 5). The router only maps the
# service layer's coded errors onto HTTP.
from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Header, Query, status
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import (
    WorkspaceContext,
    get_db,
    require_active_workspace,
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
    IMPLEMENTATION_IDEMPOTENCY_KEY_MAX_LEN,
)
from app.core.errors import ApiException
from app.domain.opportunities import action_status, actions
from app.domain.opportunities.action_schemas import (
    ActionDeclarationCreate,
    ActionDeclarationView,
    ActionDetail,
    ActionItem,
    ActionsPage,
    ActionStatusPatch,
    MeasurementLegView,
)
from app.domain.opportunities.errors import (
    InvalidCursorError,
    OpportunityNotFoundError,
    OpportunityValidationError,
)
from app.domain.opportunities.implementation_events import (
    ImplementationConflictError,
    ImplementationDeclaration,
    ImplementationIdempotencyConflictError,
    ImplementationNotFoundError,
    action_declaration,
    declare_action_implemented,
    list_verification_events,
)
from app.domain.opportunities.measurement_legs import measurement_legs
from app.domain.opportunities.projection import project_item
from app.domain.opportunities.schemas import VerificationEventView
from app.models.opportunity import (
    OpportunityImplementationEvent,
    OpportunityVerificationEvent,
)

router = APIRouter(prefix="", tags=["actions"])

_WorkspaceDep = Annotated[WorkspaceContext, Depends(require_active_workspace)]

# The capability-gated variant of the router's workspace dependency. It
# applies the ONE role policy (app/domain/workspaces/policy.py): Viewer is
# read-only, and Member keeps every non-administrative product action.
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


async def _declaration_view(
    session: AsyncSession, row: OpportunityImplementationEvent
) -> ActionDeclarationView:
    """The declaration, its observations and what each loop leg awaits."""
    observations = (
        await list_verification_events(
            session,
            workspace_id=row.workspace_id,
            project_id=row.project_id,
            implementation_event_ids=[row.id],
        )
    ).get(row.id, [])
    latest = observations[-1] if observations else None
    legs = await measurement_legs(session, declaration=row, observations=observations)
    return ActionDeclarationView(
        id=row.id,
        action_id=row.action_id,
        output_revision_id=row.output_revision_id,
        member_opportunity_ids=list(row.member_opportunity_ids or []),
        opportunity_snapshot_id=row.opportunity_snapshot_id,
        target_site_url_ids=list(row.target_site_url_ids or []),
        target_external_url=row.target_external_url,
        declared_implemented_at=row.declared_implemented_at,
        expected_checks=list(row.expected_checks or []),
        state=latest.observation_kind if latest is not None else "declared",
        limitations=list(latest.limitations or []) if latest is not None else [],
        verification_events=[_verification_view(item) for item in observations],
        legs=[
            MeasurementLegView(
                leg=leg.leg,
                state=leg.state,
                due_at=leg.due_at,
                last_evidence_at=leg.last_evidence_at,
                source_id=leg.source_id,
            )
            for leg in legs
        ],
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
    status_filter: Annotated[str | None, Query(alias="status")] = None,
    target_kind: Annotated[str | None, Query()] = None,
) -> ActionsPage:
    try:
        rows, next_cursor = await actions.list_actions(
            session,
            workspace_id=ctx.workspace_id,
            project_id=project_id,
            limit=limit,
            cursor=cursor,
            status=status_filter,
            target_kind=target_kind,
        )
    except OpportunityNotFoundError as exc:
        raise _not_found(exc) from exc
    except OpportunityValidationError as exc:
        raise _validation(exc) from exc
    except InvalidCursorError as exc:
        raise _bad_cursor(exc) from exc
    counts = await action_status.status_counts(
        session, workspace_id=ctx.workspace_id, project_id=project_id
    )
    return ActionsPage(
        items=[
            ActionItem.model_validate(actions.action_projection(row, current))
            for row, current in rows
        ],
        next_cursor=next_cursor,
        status_counts=counts,
    )


@router.get("/actions/{action_id}")
async def get_action_endpoint(
    action_id: uuid.UUID, ctx: _WorkspaceDep, session: _SessionDep
) -> ActionDetail:
    try:
        action, current, members = await actions.get_action(
            session, workspace_id=ctx.workspace_id, action_id=action_id
        )
    except OpportunityNotFoundError as exc:
        raise _not_found(exc) from exc
    declaration = await action_declaration(
        session, workspace_id=ctx.workspace_id, action_id=action.id
    )
    return ActionDetail.model_validate(
        {
            **actions.action_projection(action, current),
            "diagnosis": action.diagnosis or {},
            "members": [project_item(member) for member in members],
            "declaration": (
                await _declaration_view(session, declaration) if declaration else None
            ),
        }
    )


@router.post("/actions/{action_id}/declaration", status_code=status.HTTP_201_CREATED)
async def declare_action_endpoint(
    action_id: uuid.UUID,
    payload: ActionDeclarationCreate,
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
) -> ActionDeclarationView:
    """Declare an Action implemented, anchored to the revision the user shipped."""
    key = (idempotency_key or "").strip()
    if not key:
        raise ApiException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            CODE_VALIDATION_ERROR,
            "Idempotency-Key is required",
        )
    try:
        row, created = await declare_action_implemented(
            session,
            workspace_id=ctx.workspace_id,
            actor_user_id=ctx.user.id,
            idempotency_key=key,
            declaration=ImplementationDeclaration(
                action_id=action_id,
                output_revision_id=payload.output_revision_id,
                declared_implemented_at=payload.declared_implemented_at,
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
    return await _declaration_view(session, row)


@router.patch("/actions/{action_id}")
async def update_action_status_endpoint(
    action_id: uuid.UUID,
    payload: ActionStatusPatch,
    ctx: _WriteDep,
    session: _SessionDep,
) -> ActionItem:
    """Store a user's workflow decision (open or dismissed) on one Action."""
    try:
        action = await action_status.update_status(
            session,
            workspace_id=ctx.workspace_id,
            action_id=action_id,
            status=payload.status,
            changed_by_user_id=ctx.user.id,
        )
    except OpportunityNotFoundError as exc:
        raise _not_found(exc) from exc
    except OpportunityValidationError as exc:
        raise _validation(exc) from exc
    current = await action_status.action_status(session, action_id=action.id)
    return ActionItem.model_validate(actions.action_projection(action, current))
