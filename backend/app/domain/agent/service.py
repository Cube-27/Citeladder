"""Workspace-authorized Agent commands and persisted reads.

Admission is where every bound is decided: the member's capability, the
funding route (a verified customer route, else a published platform rate), one
active run per chat, the per-chat turn limit, workspace capacity, idempotency,
and the frozen context manifest and budget. Everything after admission is the
worker's; reads only project persisted rows and never run the agent
(invariant 6).
"""

from __future__ import annotations

import hashlib
import json
import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config.abuse import abuse_settings
from app.core.config.agent import (
    AGENT_CHAT_TITLE_MAX_CHARS,
    AGENT_CHAT_TURN_LIMIT,
    AGENT_LIST_DEFAULT_LIMIT,
    AGENT_LIST_MAX_LIMIT,
    AGENT_MAX_STEPS,
    AGENT_MAX_TOOL_CALLS,
    AGENT_PROTOCOL_VERSION,
    AGENT_REVISION_LIST_MAX,
    AGENT_RUNTIME_VERSION,
    MESSAGE_ROLE_USER,
    RUN_MODE_DRAFT_FROM_OUTLINE,
    RUN_MODE_TURN,
    SKILL_SOURCE_ACTION,
    SKILL_SOURCE_CHAT,
    SKILL_SOURCE_USER,
    default_agent_settings,
)
from app.core.config.agent_skills import AGENT_SKILL_REGISTRY
from app.core.config.app_models import APP_FEATURE_AGENT
from app.core.config.entitlements import KEY_AGENT
from app.core.config.task_queue import (
    TASK_ACTIVE_STATUSES,
    TASK_STATUS_CANCELLED,
    TASK_TERMINAL_STATUSES,
)
from app.domain.abuse.service import reserve_workspace_capacity
from app.domain.agent import outputs
from app.domain.agent.context import build_manifest, latest_instructions
from app.domain.agent.context_builder import (
    ContentContextConflictError,
    ContentContextNotFoundError,
)
from app.domain.agent.model_calls import FUNDING_CUSTOMER_BYOK, FUNDING_PLATFORM
from app.domain.agent.tool_catalog import AGENT_TOOL_REGISTRY_VERSION
from app.domain.billing.accounts import billing_account_id_for
from app.domain.billing.catalog_revisions import (
    CatalogUnavailableError,
    published_ai_credit_policy,
)
from app.domain.entitlements.enforcement import (
    CapabilityNotGrantedError,
    require_workspace_capability,
)
from app.domain.providers.app_routes import (
    AppModelRouteUnavailableError,
    has_configured_app_model_route,
    resolve_app_model_route,
)
from app.models.agent import (
    AgentChat,
    AgentInstructionRevision,
    AgentMessage,
    AgentOutput,
    AgentOutputRevision,
    AgentRun,
)
from app.models.opportunity import Action
from app.models.project import Project

_CHAT_NOT_FOUND = "Chat not found"


class AgentNotFoundError(LookupError): ...


class AgentConflictError(RuntimeError):
    """The request conflicts with the chat's current state (409)."""

    def __init__(self, code: str, detail: str) -> None:
        super().__init__(detail)
        self.code = code


class AgentFundingError(RuntimeError):
    """No capability, route or credit policy can fund this turn (402)."""


def _utcnow() -> datetime:
    return datetime.now(UTC)


def _fingerprint(value: dict[str, Any]) -> str:
    encoded = json.dumps(value, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


async def _project(
    session: AsyncSession, *, workspace_id: uuid.UUID, project_id: uuid.UUID
) -> Project:
    project = await session.scalar(
        select(Project).where(
            Project.id == project_id, Project.workspace_id == workspace_id
        )
    )
    if project is None:
        raise AgentNotFoundError("Project not found")
    return project


async def get_chat(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    chat_id: uuid.UUID,
    lock: bool = False,
) -> AgentChat:
    statement = select(AgentChat).where(
        AgentChat.id == chat_id,
        AgentChat.workspace_id == workspace_id,
        AgentChat.archived_at.is_(None),
    )
    chat = await session.scalar(statement.with_for_update() if lock else statement)
    if chat is None:
        raise AgentNotFoundError(_CHAT_NOT_FOUND)
    return chat


async def _action(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    action_id: uuid.UUID,
) -> Action:
    action = await session.scalar(
        select(Action).where(
            Action.id == action_id,
            Action.workspace_id == workspace_id,
            Action.project_id == project_id,
        )
    )
    if action is None:
        raise AgentNotFoundError("Action not found")
    return action


async def _funding(session: AsyncSession, *, workspace_id: uuid.UUID) -> dict[str, Any]:
    """The frozen funding identity for one turn, or a coded refusal."""
    try:
        await require_workspace_capability(
            session, workspace_id=workspace_id, key=KEY_AGENT
        )
    except CapabilityNotGrantedError as exc:
        raise AgentFundingError(
            "The Agent is not included in this workspace's plan."
        ) from exc
    try:
        route = await resolve_app_model_route(
            session, workspace_id=workspace_id, feature=APP_FEATURE_AGENT, at=_utcnow()
        )
    except AppModelRouteUnavailableError as exc:
        if await has_configured_app_model_route(
            session, workspace_id=workspace_id, feature=APP_FEATURE_AGENT
        ):
            # A configured customer route never silently falls back to
            # platform funding (invariant 16).
            raise AgentFundingError(
                "The configured customer model route is unavailable."
            ) from exc
        route = None
    if route is not None:
        return {
            "funding_source": FUNDING_CUSTOMER_BYOK,
            "route_id": route.route_id,
            "connection_id": route.connection_id,
            "route_revision": route.route_revision,
            "credential_revision": route.credential_revision,
            "requested_model": route.model,
        }
    if not default_agent_settings.configured:
        raise AgentFundingError("The platform Agent model is not configured.")
    try:
        _revision, policy = await published_ai_credit_policy(session)
    except CatalogUnavailableError as exc:
        raise AgentFundingError("No AI-credit policy is published.") from exc
    model = default_agent_settings.model.strip()
    if policy.rate(feature=APP_FEATURE_AGENT, model=model) is None:
        raise AgentFundingError(
            "The platform Agent model has no published AI-credit rate."
        )
    if await billing_account_id_for(session, workspace_id) is None:
        raise AgentFundingError("This workspace has no billing account for AI credits.")
    return {"funding_source": FUNDING_PLATFORM, "requested_model": model}


def _requested_skill(
    *, explicit: str | None, chat: AgentChat, action: Action | None
) -> tuple[str | None, str | None]:
    """Skill precedence: the user's pick, the Action's approach, the chat's pin."""
    if explicit:
        return explicit, SKILL_SOURCE_USER
    if chat.pinned_skill_id:
        return chat.pinned_skill_id, SKILL_SOURCE_CHAT
    if action is not None and action.skill_id in AGENT_SKILL_REGISTRY:
        return action.skill_id, SKILL_SOURCE_ACTION
    return None, None


async def _enqueue_turn(
    session: AsyncSession,
    *,
    chat: AgentChat,
    user_id: uuid.UUID,
    content: str,
    mode: str,
    skill_id: str | None,
    idempotency_key: str,
) -> AgentRun:
    """Append the user message and its run (caller holds the chat lock)."""
    active = await session.scalar(
        select(AgentRun.id).where(
            AgentRun.chat_id == chat.id, AgentRun.status.in_(TASK_ACTIVE_STATUSES)
        )
    )
    if active is not None:
        raise AgentConflictError(
            "agent_run_active", "The agent is still answering this chat."
        )
    if chat.turn_count >= AGENT_CHAT_TURN_LIMIT:
        raise AgentConflictError(
            "agent_turn_limit", "This chat reached its turn limit; start a new chat."
        )
    funding = await _funding(session, workspace_id=chat.workspace_id)
    await reserve_workspace_capacity(
        session,
        workspace_id=chat.workspace_id,
        lock_namespace="agent-enqueue",
        model=AgentRun,
        active_statuses=TASK_ACTIVE_STATUSES,
        active_limit=abuse_settings.active_agent_runs_per_workspace,
        active_operation="agent.active_runs",
        usage_operation="agent.runs",
        usage_limit=abuse_settings.agent_runs_per_workspace_daily,
        retry_after_seconds=abuse_settings.active_job_retry_after_seconds,
    )
    if skill_id is not None and skill_id not in AGENT_SKILL_REGISTRY:
        raise AgentConflictError("validation_error", f"Unknown skill {skill_id!r}.")
    if skill_id is not None:
        chat.pinned_skill_id = skill_id
    action = (
        await session.get(Action, chat.action_id)
        if chat.action_id is not None
        else None
    )
    requested_skill, skill_source = _requested_skill(
        explicit=skill_id, chat=chat, action=action
    )
    try:
        manifest = await build_manifest(session, chat=chat, request=content)
    except (ContentContextNotFoundError, ContentContextConflictError) as exc:
        raise AgentConflictError("agent_context_unavailable", str(exc)) from exc
    sequence = await session.scalar(
        select(func.max(AgentMessage.sequence)).where(AgentMessage.chat_id == chat.id)
    )
    message = AgentMessage(
        workspace_id=chat.workspace_id,
        project_id=chat.project_id,
        chat_id=chat.id,
        sequence=int(sequence or 0) + 1,
        role=MESSAGE_ROLE_USER,
        content=content,
        author_user_id=user_id,
        skill_id=skill_id,
        skill_source=SKILL_SOURCE_USER if skill_id else None,
    )
    session.add(message)
    await session.flush()
    run = AgentRun(
        workspace_id=chat.workspace_id,
        project_id=chat.project_id,
        chat_id=chat.id,
        user_message_id=message.id,
        user_id=user_id,
        idempotency_key=idempotency_key,
        request_fingerprint=_fingerprint(
            {"chat": str(chat.id), "content": content, "mode": mode, "skill": skill_id}
        ),
        mode=mode,
        requested_skill_id=requested_skill,
        requested_skill_source=skill_source,
        context_manifest=manifest,
        budget={"max_steps": AGENT_MAX_STEPS, "max_tool_calls": AGENT_MAX_TOOL_CALLS},
        runtime_version=AGENT_RUNTIME_VERSION,
        protocol_version=AGENT_PROTOCOL_VERSION,
        registry_version=AGENT_TOOL_REGISTRY_VERSION,
        **funding,
    )
    session.add(run)
    chat.turn_count += 1
    chat.last_activity_at = _utcnow()
    return run


async def _replay(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    key: str,
    fingerprint: dict[str, Any],
) -> AgentRun | None:
    run = await session.scalar(
        select(AgentRun).where(
            AgentRun.workspace_id == workspace_id, AgentRun.idempotency_key == key
        )
    )
    if run is None:
        return None
    message = await session.get(AgentMessage, run.user_message_id)
    expected = _fingerprint(fingerprint)
    if run.request_fingerprint != expected or message is None:
        raise AgentConflictError(
            "agent_idempotency_conflict",
            "Idempotency-Key was already used for another request.",
        )
    return run


async def _commit_or_replay(
    session: AsyncSession, *, workspace_id: uuid.UUID, key: str
) -> AgentRun | None:
    try:
        await session.commit()
        return None
    except IntegrityError:
        await session.rollback()
        return await session.scalar(
            select(AgentRun).where(
                AgentRun.workspace_id == workspace_id, AgentRun.idempotency_key == key
            )
        )


async def create_chat(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    user_id: uuid.UUID,
    message: str,
    skill_id: str | None,
    action_id: uuid.UUID | None,
    context_refs: dict[str, Any],
    idempotency_key: str,
) -> tuple[AgentChat, AgentRun]:
    """Start a chat with its first user message and queued run."""
    await _project(session, workspace_id=workspace_id, project_id=project_id)
    existing = await session.scalar(
        select(AgentRun).where(
            AgentRun.workspace_id == workspace_id,
            AgentRun.idempotency_key == idempotency_key,
        )
    )
    if existing is not None:
        chat = await session.get(AgentChat, existing.chat_id)
        assert chat is not None  # noqa: S101 - the run's chat is its parent
        return chat, existing
    if action_id is not None:
        await _action(
            session,
            workspace_id=workspace_id,
            project_id=project_id,
            action_id=action_id,
        )
    chat = AgentChat(
        workspace_id=workspace_id,
        project_id=project_id,
        action_id=action_id,
        created_by_user_id=user_id,
        title=_title(message),
        context_refs=context_refs,
    )
    session.add(chat)
    await session.flush()
    run = await _enqueue_turn(
        session,
        chat=chat,
        user_id=user_id,
        content=message,
        mode=RUN_MODE_TURN,
        skill_id=skill_id,
        idempotency_key=idempotency_key,
    )
    winner = await _commit_or_replay(
        session, workspace_id=workspace_id, key=idempotency_key
    )
    if winner is not None:
        chat = await session.get(AgentChat, winner.chat_id)
        assert chat is not None  # noqa: S101 - the run's chat is its parent
        return chat, winner
    return chat, run


def _title(message: str) -> str:
    first_line = message.strip().splitlines()[0] if message.strip() else "New chat"
    return first_line[:AGENT_CHAT_TITLE_MAX_CHARS]


async def send_message(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    chat_id: uuid.UUID,
    user_id: uuid.UUID,
    message: str,
    skill_id: str | None,
    idempotency_key: str,
) -> AgentRun:
    replay = await _replay(
        session,
        workspace_id=workspace_id,
        key=idempotency_key,
        fingerprint={
            "chat": str(chat_id),
            "content": message,
            "mode": RUN_MODE_TURN,
            "skill": skill_id,
        },
    )
    if replay is not None:
        return replay
    chat = await get_chat(
        session, workspace_id=workspace_id, chat_id=chat_id, lock=True
    )
    run = await _enqueue_turn(
        session,
        chat=chat,
        user_id=user_id,
        content=message,
        mode=RUN_MODE_TURN,
        skill_id=skill_id,
        idempotency_key=idempotency_key,
    )
    winner = await _commit_or_replay(
        session, workspace_id=workspace_id, key=idempotency_key
    )
    return winner or run


async def approve_outline_and_write(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    chat_id: uuid.UUID,
    user_id: uuid.UUID,
    revision_id: uuid.UUID,
    idempotency_key: str,
) -> AgentRun:
    """Record the outline approval and queue the draft from it."""
    chat = await get_chat(
        session, workspace_id=workspace_id, chat_id=chat_id, lock=True
    )
    try:
        await outputs.approve_outline(
            session, chat=chat, revision_id=revision_id, user_id=user_id
        )
    except outputs.OutputError as exc:
        raise AgentConflictError("agent_outline_not_approvable", str(exc)) from exc
    run = await _enqueue_turn(
        session,
        chat=chat,
        user_id=user_id,
        content="Use the approved outline and write the draft.",
        mode=RUN_MODE_DRAFT_FROM_OUTLINE,
        skill_id=None,
        idempotency_key=idempotency_key,
    )
    winner = await _commit_or_replay(
        session, workspace_id=workspace_id, key=idempotency_key
    )
    return winner or run


async def cancel_run(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    chat_id: uuid.UUID,
    run_id: uuid.UUID,
) -> AgentRun:
    run = await session.scalar(
        select(AgentRun)
        .where(
            AgentRun.id == run_id,
            AgentRun.chat_id == chat_id,
            AgentRun.workspace_id == workspace_id,
        )
        .with_for_update()
    )
    if run is None:
        raise AgentNotFoundError("Run not found")
    if run.status not in TASK_TERMINAL_STATUSES:
        run.status = TASK_STATUS_CANCELLED
        run.cancelled_at = _utcnow()
        run.completed_at = run.cancelled_at
        run.lease_owner = None
        run.lease_expires_at = None
        run.error_code = "cancelled"
    await session.commit()
    return run


async def archive_chat(
    session: AsyncSession, *, workspace_id: uuid.UUID, chat_id: uuid.UUID
) -> None:
    chat = await get_chat(
        session, workspace_id=workspace_id, chat_id=chat_id, lock=True
    )
    active = await session.scalar(
        select(AgentRun.id).where(
            AgentRun.chat_id == chat.id, AgentRun.status.in_(TASK_ACTIVE_STATUSES)
        )
    )
    if active is not None:
        raise AgentConflictError(
            "agent_run_active", "Stop the running turn before archiving."
        )
    chat.archived_at = _utcnow()
    await session.commit()


async def list_chats(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    limit: int | None,
    query: str | None,
) -> list[tuple[AgentChat, AgentOutput | None]]:
    await _project(session, workspace_id=workspace_id, project_id=project_id)
    bounded = max(1, min(limit or AGENT_LIST_DEFAULT_LIMIT, AGENT_LIST_MAX_LIMIT))
    statement = (
        select(AgentChat, AgentOutput)
        .outerjoin(AgentOutput, AgentOutput.chat_id == AgentChat.id)
        .where(
            AgentChat.workspace_id == workspace_id,
            AgentChat.project_id == project_id,
            AgentChat.archived_at.is_(None),
        )
    )
    if query and query.strip():
        escaped = (
            query.strip().replace("\\", "\\\\").replace("%", r"\%").replace("_", r"\_")
        )
        statement = statement.where(AgentChat.title.ilike(f"%{escaped}%", escape="\\"))
    rows = (
        await session.execute(
            statement.order_by(
                AgentChat.last_activity_at.desc(), AgentChat.id.desc()
            ).limit(bounded)
        )
    ).all()
    return [(chat, output) for chat, output in rows]


async def chat_detail(
    session: AsyncSession, *, workspace_id: uuid.UUID, chat_id: uuid.UUID
) -> dict[str, Any]:
    chat = await get_chat(session, workspace_id=workspace_id, chat_id=chat_id)
    messages = list(
        (
            await session.scalars(
                select(AgentMessage)
                .where(
                    AgentMessage.chat_id == chat.id,
                    AgentMessage.workspace_id == workspace_id,
                )
                .order_by(AgentMessage.sequence.asc())
            )
        ).all()
    )
    latest_run = await session.scalar(
        select(AgentRun)
        .where(AgentRun.chat_id == chat.id, AgentRun.workspace_id == workspace_id)
        .order_by(AgentRun.created_at.desc(), AgentRun.id.desc())
        .limit(1)
    )
    output = await outputs.output_for_chat(session, chat=chat)
    revision = await outputs.latest_revision(session, output=output) if output else None
    return {
        "chat": chat,
        "messages": messages,
        "latest_run": latest_run,
        "output": output,
        "revision": revision,
    }


async def output_revisions(
    session: AsyncSession, *, workspace_id: uuid.UUID, chat_id: uuid.UUID
) -> list[AgentOutputRevision]:
    chat = await get_chat(session, workspace_id=workspace_id, chat_id=chat_id)
    output = await outputs.output_for_chat(session, chat=chat)
    if output is None:
        return []
    return list(
        (
            await session.scalars(
                select(AgentOutputRevision)
                .where(
                    AgentOutputRevision.output_id == output.id,
                    AgentOutputRevision.workspace_id == workspace_id,
                )
                .order_by(AgentOutputRevision.number.desc())
                .limit(AGENT_REVISION_LIST_MAX)
            )
        ).all()
    )


async def edit_output(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    chat_id: uuid.UUID,
    user_id: uuid.UUID,
    title: str,
    body: str,
    base_revision_id: uuid.UUID,
) -> AgentOutputRevision:
    chat = await get_chat(
        session, workspace_id=workspace_id, chat_id=chat_id, lock=True
    )
    try:
        revision = await outputs.save_user_revision(
            session,
            chat=chat,
            title=title,
            body=body,
            base_revision_id=base_revision_id,
            user_id=user_id,
        )
    except outputs.OutputError as exc:
        raise AgentConflictError("agent_output_conflict", str(exc)) from exc
    chat.last_activity_at = _utcnow()
    await session.commit()
    return revision


async def restore_output_revision(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    chat_id: uuid.UUID,
    user_id: uuid.UUID,
    revision_id: uuid.UUID,
) -> AgentOutputRevision:
    chat = await get_chat(
        session, workspace_id=workspace_id, chat_id=chat_id, lock=True
    )
    try:
        revision = await outputs.restore_revision(
            session, chat=chat, revision_id=revision_id, user_id=user_id
        )
    except outputs.OutputError as exc:
        raise AgentConflictError("agent_output_conflict", str(exc)) from exc
    await session.commit()
    return revision


async def get_instructions(
    session: AsyncSession, *, workspace_id: uuid.UUID, project_id: uuid.UUID
) -> AgentInstructionRevision | None:
    await _project(session, workspace_id=workspace_id, project_id=project_id)
    return await latest_instructions(
        session, workspace_id=workspace_id, project_id=project_id
    )


async def save_instructions(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    user_id: uuid.UUID,
    text: str,
) -> AgentInstructionRevision:
    """Append a new instructions revision; earlier runs keep the one they froze."""
    await _project(session, workspace_id=workspace_id, project_id=project_id)
    await session.execute(
        select(Project.id).where(Project.id == project_id).with_for_update()
    )
    current = await latest_instructions(
        session, workspace_id=workspace_id, project_id=project_id
    )
    row = AgentInstructionRevision(
        workspace_id=workspace_id,
        project_id=project_id,
        revision=(current.revision + 1) if current else 1,
        text=text,
        created_by_user_id=user_id,
    )
    session.add(row)
    await session.commit()
    return row


def skill_catalog() -> list[dict[str, Any]]:
    """Skill names and one-line descriptions; never the methodology text."""
    return [
        {
            "id": skill.id,
            "label": skill.label,
            "group": skill.group,
            "output_kind": skill.output_kind,
            "description": skill.description,
        }
        for skill in AGENT_SKILL_REGISTRY.values()
    ]
