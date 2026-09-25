# Agent router: chats, turns, outputs, instructions and the skill list.
#
# Flat ``/api/v1`` surface; the active workspace comes from
# ``require_active_workspace`` and every lookup is filtered by it, so a foreign
# or missing id is a 404 (invariant 3). Writes need the run capability; reads
# project persisted rows only and never run the agent (invariant 6).
from __future__ import annotations

import uuid
from collections.abc import Iterator
from contextlib import contextmanager
from typing import Annotated

from fastapi import APIRouter, Depends, Header, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import (
    WorkspaceContext,
    get_db,
    require_active_workspace,
    require_active_workspace_run,
)
from app.core.config.agent import (
    AGENT_IDEMPOTENCY_KEY_MAX_CHARS,
    AGENT_LIST_DEFAULT_LIMIT,
    AGENT_LIST_MAX_LIMIT,
    CODE_AGENT_FUNDING_UNAVAILABLE,
)
from app.core.config.errors import CODE_INVALID_CURSOR, CODE_NOT_FOUND
from app.core.errors import ApiException
from app.core.http_errors import raise_api_error
from app.domain.abuse.service import UsageLimitExceededError
from app.domain.agent import chat_list, service
from app.domain.agent.schemas import (
    ChatCreate,
    ChatDetail,
    ChatsPage,
    ChatSummary,
    InstructionsUpdate,
    InstructionsView,
    MessageCreate,
    MessageView,
    OutlineApproval,
    OutputEdit,
    OutputView,
    RevisionsPage,
    RevisionView,
    RunView,
    SkillCatalog,
    TurnAccepted,
)
from app.models.agent import AgentChat, AgentOutput, AgentOutputRevision, AgentRun

router = APIRouter(prefix="", tags=["agent"])

_WorkspaceDep = Annotated[WorkspaceContext, Depends(require_active_workspace)]
_RunDep = Annotated[WorkspaceContext, Depends(require_active_workspace_run)]
_SessionDep = Annotated[AsyncSession, Depends(get_db)]
_IdempotencyKey = Annotated[
    str | None,
    Header(alias="Idempotency-Key", max_length=AGENT_IDEMPOTENCY_KEY_MAX_CHARS),
]


@contextmanager
def _mapped_errors() -> Iterator[None]:
    try:
        yield
    except service.AgentNotFoundError as exc:
        raise ApiException(status.HTTP_404_NOT_FOUND, CODE_NOT_FOUND, str(exc)) from exc
    except chat_list.InvalidChatCursorError as exc:
        raise ApiException(
            status.HTTP_400_BAD_REQUEST, CODE_INVALID_CURSOR, str(exc)
        ) from exc
    except service.AgentConflictError as exc:
        raise ApiException(status.HTTP_409_CONFLICT, exc.code, str(exc)) from exc
    except service.AgentFundingError as exc:
        raise ApiException(
            status.HTTP_402_PAYMENT_REQUIRED, CODE_AGENT_FUNDING_UNAVAILABLE, str(exc)
        ) from exc
    except UsageLimitExceededError as exc:
        raise_api_error(
            status.HTTP_429_TOO_MANY_REQUESTS,
            "Workspace Agent usage limit exceeded",
            headers={"Retry-After": str(exc.retry_after_seconds)},
            cause=exc,
        )


def _key(value: str | None) -> str:
    return (value or "").strip() or str(uuid.uuid4())


def _run_view(run: AgentRun) -> RunView:
    return RunView(
        id=run.id,
        status=run.status,
        mode=run.mode,
        skill_id=run.skill_id or run.requested_skill_id,
        skill_source=run.skill_source or run.requested_skill_source,
        steps_used=run.steps_used,
        error_code=run.error_code,
        error_detail=run.error_detail,
        created_at=run.created_at,
        completed_at=run.completed_at,
    )


def _revision_view(row: AgentOutputRevision) -> RevisionView:
    return RevisionView(
        id=row.id,
        number=row.number,
        parent_revision_id=row.parent_revision_id,
        author=row.author,
        phase=row.phase,
        title=row.title,
        body=row.body,
        source_refs=list(row.source_refs or []),
        approved_at=row.approved_at,
        created_at=row.created_at,
    )


def _summary(
    chat: AgentChat, output: AgentOutput | None, action_label: str | None
) -> ChatSummary:
    return ChatSummary(
        id=chat.id,
        project_id=chat.project_id,
        action_id=chat.action_id,
        target_label=(output.target_label if output else None) or action_label,
        title=chat.title,
        turn_count=chat.turn_count,
        output_kind=output.kind if output else None,
        output_phase=output.phase if output else None,
        last_activity_at=chat.last_activity_at,
        created_at=chat.created_at,
    )


@router.get("/agent/skills")
async def list_skills_endpoint(ctx: _WorkspaceDep) -> SkillCatalog:
    del ctx
    return SkillCatalog.model_validate({"skills": service.skill_catalog()})


@router.get("/projects/{project_id}/agent/chats")
async def list_chats_endpoint(
    project_id: uuid.UUID,
    ctx: _WorkspaceDep,
    session: _SessionDep,
    limit: Annotated[
        int, Query(ge=1, le=AGENT_LIST_MAX_LIMIT)
    ] = AGENT_LIST_DEFAULT_LIMIT,
    q: Annotated[str | None, Query(max_length=120)] = None,
    action_id: Annotated[uuid.UUID | None, Query()] = None,
    cursor: Annotated[str | None, Query(max_length=512)] = None,
) -> ChatsPage:
    with _mapped_errors():
        rows, next_cursor = await chat_list.list_chats(
            session,
            workspace_id=ctx.workspace_id,
            project_id=project_id,
            limit=limit,
            query=q,
            action_id=action_id,
            cursor=cursor,
        )
    return ChatsPage(
        items=[_summary(chat, output, label) for chat, output, label in rows],
        next_cursor=next_cursor,
    )


@router.post("/projects/{project_id}/agent/chats", status_code=status.HTTP_202_ACCEPTED)
async def create_chat_endpoint(
    project_id: uuid.UUID,
    payload: ChatCreate,
    ctx: _RunDep,
    session: _SessionDep,
    idempotency_key: _IdempotencyKey = None,
) -> TurnAccepted:
    with _mapped_errors():
        chat, run = await service.create_chat(
            session,
            workspace_id=ctx.workspace_id,
            project_id=project_id,
            user_id=ctx.user.id,
            message=payload.message,
            skill_id=payload.skill_id,
            action_id=payload.action_id,
            context_refs=payload.context.model_dump(mode="json", exclude_none=True),
            idempotency_key=_key(idempotency_key),
        )
    return TurnAccepted(chat_id=chat.id, run=_run_view(run))


@router.get("/agent/chats/{chat_id}")
async def get_chat_endpoint(
    chat_id: uuid.UUID, ctx: _WorkspaceDep, session: _SessionDep
) -> ChatDetail:
    with _mapped_errors():
        detail = await service.chat_detail(
            session, workspace_id=ctx.workspace_id, chat_id=chat_id
        )
    chat: AgentChat = detail["chat"]
    output: AgentOutput | None = detail["output"]
    revision: AgentOutputRevision | None = detail["revision"]
    return ChatDetail(
        chat=_summary(chat, output, detail["action_label"]),
        pinned_skill_id=chat.pinned_skill_id,
        context=dict(chat.context_refs or {}),
        messages=[
            MessageView(
                id=row.id,
                sequence=row.sequence,
                role=row.role,
                content=row.content,
                skill_id=row.skill_id,
                skill_source=row.skill_source,
                evidence_refs=list(row.evidence_refs or []),
                steps=list(row.steps or []),
                created_at=row.created_at,
            )
            for row in detail["messages"]
        ],
        latest_run=_run_view(detail["latest_run"]) if detail["latest_run"] else None,
        output=_output_view(output, revision),
    )


def _output_view(
    output: AgentOutput | None, revision: AgentOutputRevision | None
) -> OutputView | None:
    if output is None:
        return None
    latest = _revision_view(revision) if revision else None
    return OutputView(
        id=output.id,
        action_id=output.action_id,
        kind=output.kind,
        skill_id=output.skill_id,
        format_id=output.format_id,
        target_kind=output.target_kind,
        target_label=output.target_label,
        phase=output.phase,
        latest_revision=latest,
    )


@router.post("/agent/chats/{chat_id}/messages", status_code=status.HTTP_202_ACCEPTED)
async def send_message_endpoint(
    chat_id: uuid.UUID,
    payload: MessageCreate,
    ctx: _RunDep,
    session: _SessionDep,
    idempotency_key: _IdempotencyKey = None,
) -> TurnAccepted:
    with _mapped_errors():
        run = await service.send_message(
            session,
            workspace_id=ctx.workspace_id,
            chat_id=chat_id,
            user_id=ctx.user.id,
            message=payload.message,
            skill_id=payload.skill_id,
            idempotency_key=_key(idempotency_key),
        )
    return TurnAccepted(chat_id=chat_id, run=_run_view(run))


@router.post("/agent/chats/{chat_id}/runs/{run_id}/cancel")
async def cancel_run_endpoint(
    chat_id: uuid.UUID, run_id: uuid.UUID, ctx: _RunDep, session: _SessionDep
) -> RunView:
    with _mapped_errors():
        run = await service.cancel_run(
            session, workspace_id=ctx.workspace_id, chat_id=chat_id, run_id=run_id
        )
    return _run_view(run)


@router.delete("/agent/chats/{chat_id}", status_code=status.HTTP_204_NO_CONTENT)
async def archive_chat_endpoint(
    chat_id: uuid.UUID, ctx: _RunDep, session: _SessionDep
) -> None:
    with _mapped_errors():
        await service.archive_chat(
            session, workspace_id=ctx.workspace_id, chat_id=chat_id
        )


@router.get("/agent/chats/{chat_id}/output/revisions")
async def list_revisions_endpoint(
    chat_id: uuid.UUID, ctx: _WorkspaceDep, session: _SessionDep
) -> RevisionsPage:
    with _mapped_errors():
        rows = await service.output_revisions(
            session, workspace_id=ctx.workspace_id, chat_id=chat_id
        )
    return RevisionsPage(items=[_revision_view(row) for row in rows])


@router.post(
    "/agent/chats/{chat_id}/output/revisions", status_code=status.HTTP_201_CREATED
)
async def edit_output_endpoint(
    chat_id: uuid.UUID, payload: OutputEdit, ctx: _RunDep, session: _SessionDep
) -> RevisionView:
    with _mapped_errors():
        row = await service.edit_output(
            session,
            workspace_id=ctx.workspace_id,
            chat_id=chat_id,
            user_id=ctx.user.id,
            title=payload.title,
            body=payload.body,
            base_revision_id=payload.base_revision_id,
        )
    return _revision_view(row)


@router.post(
    "/agent/chats/{chat_id}/output/revisions/{revision_id}/restore",
    status_code=status.HTTP_201_CREATED,
)
async def restore_revision_endpoint(
    chat_id: uuid.UUID, revision_id: uuid.UUID, ctx: _RunDep, session: _SessionDep
) -> RevisionView:
    with _mapped_errors():
        row = await service.restore_output_revision(
            session,
            workspace_id=ctx.workspace_id,
            chat_id=chat_id,
            user_id=ctx.user.id,
            revision_id=revision_id,
        )
    return _revision_view(row)


@router.post(
    "/agent/chats/{chat_id}/output/approve-outline",
    status_code=status.HTTP_202_ACCEPTED,
)
async def approve_outline_endpoint(
    chat_id: uuid.UUID,
    payload: OutlineApproval,
    ctx: _RunDep,
    session: _SessionDep,
    idempotency_key: _IdempotencyKey = None,
) -> TurnAccepted:
    with _mapped_errors():
        run = await service.approve_outline_and_write(
            session,
            workspace_id=ctx.workspace_id,
            chat_id=chat_id,
            user_id=ctx.user.id,
            revision_id=payload.revision_id,
            idempotency_key=_key(idempotency_key),
        )
    return TurnAccepted(chat_id=chat_id, run=_run_view(run))


@router.get("/projects/{project_id}/agent/instructions")
async def get_instructions_endpoint(
    project_id: uuid.UUID, ctx: _WorkspaceDep, session: _SessionDep
) -> InstructionsView:
    with _mapped_errors():
        row = await service.get_instructions(
            session, workspace_id=ctx.workspace_id, project_id=project_id
        )
    if row is None:
        return InstructionsView(revision=None, text="", created_at=None)
    return InstructionsView(
        revision=row.revision, text=row.text, created_at=row.created_at
    )


@router.put("/projects/{project_id}/agent/instructions")
async def save_instructions_endpoint(
    project_id: uuid.UUID,
    payload: InstructionsUpdate,
    ctx: _RunDep,
    session: _SessionDep,
) -> InstructionsView:
    with _mapped_errors():
        row = await service.save_instructions(
            session,
            workspace_id=ctx.workspace_id,
            project_id=project_id,
            user_id=ctx.user.id,
            text=payload.text.strip(),
        )
    return InstructionsView(
        revision=row.revision, text=row.text, created_at=row.created_at
    )
