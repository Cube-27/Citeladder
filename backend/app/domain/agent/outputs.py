"""The chat's deliverable: one output, revised by the agent or the user.

Every change is a new immutable revision whose parent is the latest one, so a
follow-up after a user edit revises the edit, and nothing is ever overwritten.
Saving an output for a target attaches the chat to that target's Action
(created once if missing); outline approval is an explicit user decision.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config.agent import (
    OUTPUT_PHASE_OUTLINE,
    REVISION_AUTHOR_AGENT,
    REVISION_AUTHOR_USER,
)
from app.core.config.agent_skills import AGENT_SKILL_REGISTRY, CONTENT_FORMATS
from app.domain.opportunities.actions import attach_or_create_action
from app.domain.opportunities.errors import OpportunityValidationError
from app.models.agent import AgentChat, AgentOutput, AgentOutputRevision


class OutputError(ValueError):
    """An output change the lifecycle does not allow (409)."""


def _utcnow() -> datetime:
    return datetime.now(UTC)


async def output_for_chat(
    session: AsyncSession, *, chat: AgentChat
) -> AgentOutput | None:
    return await session.scalar(
        select(AgentOutput).where(
            AgentOutput.workspace_id == chat.workspace_id,
            AgentOutput.chat_id == chat.id,
        )
    )


async def latest_revision(
    session: AsyncSession, *, output: AgentOutput
) -> AgentOutputRevision | None:
    return await session.scalar(
        select(AgentOutputRevision)
        .where(
            AgentOutputRevision.workspace_id == output.workspace_id,
            AgentOutputRevision.output_id == output.id,
        )
        .order_by(AgentOutputRevision.number.desc())
        .limit(1)
    )


async def _next_number(session: AsyncSession, *, output: AgentOutput) -> int:
    current = await session.scalar(
        select(func.max(AgentOutputRevision.number)).where(
            AgentOutputRevision.output_id == output.id
        )
    )
    return int(current or 0) + 1


async def save_agent_output(
    session: AsyncSession,
    *,
    chat: AgentChat,
    skill_id: str,
    payload: dict[str, Any],
    phase: str,
    run_id: uuid.UUID,
    message_id: uuid.UUID,
    source_refs: list[str],
    user_id: uuid.UUID | None,
) -> AgentOutputRevision:
    """Append the agent's revision; attach the chat to its target's Action.

    Runs inside the run's terminal transaction; the caller commits.
    """
    skill = AGENT_SKILL_REGISTRY[skill_id]
    output = await output_for_chat(session, chat=chat)
    format_id = payload.get("format_id")
    if format_id not in CONTENT_FORMATS:
        format_id = None
    if output is None:
        output = AgentOutput(
            workspace_id=chat.workspace_id,
            project_id=chat.project_id,
            chat_id=chat.id,
            kind=skill.output_kind,
            skill_id=skill.id,
            phase=phase,
        )
        session.add(output)
        await session.flush()
    output.phase = phase
    output.format_id = format_id or output.format_id
    await _attach_target(
        session, chat=chat, output=output, payload=payload, user_id=user_id
    )
    parent = await latest_revision(session, output=output)
    revision = AgentOutputRevision(
        workspace_id=chat.workspace_id,
        project_id=chat.project_id,
        output_id=output.id,
        number=await _next_number(session, output=output),
        parent_revision_id=parent.id if parent is not None else None,
        author=REVISION_AUTHOR_AGENT,
        run_id=run_id,
        message_id=message_id,
        phase=phase,
        title=str(payload["title"]),
        body=str(payload["body"]),
        source_refs=list(dict.fromkeys(source_refs)),
    )
    session.add(revision)
    await session.flush()
    return revision


async def _attach_target(
    session: AsyncSession,
    *,
    chat: AgentChat,
    output: AgentOutput,
    payload: dict[str, Any],
    user_id: uuid.UUID | None,
) -> None:
    target_kind = payload.get("target_kind")
    target = str(payload.get("target") or "").strip()
    if chat.action_id is not None:
        # A chat started from an Action keeps it; work on a second target
        # belongs in a new chat, not a silent re-attachment.
        output.action_id = chat.action_id
        return
    if not target_kind or not target:
        return
    try:
        action = await attach_or_create_action(
            session,
            workspace_id=chat.workspace_id,
            project_id=chat.project_id,
            target_kind=str(target_kind),
            target=target,
            user_id=user_id,
        )
    except OpportunityValidationError:
        # An unusable target (another domain, a blank topic) leaves the work
        # unattached rather than failing the turn; the user can retarget it.
        return
    chat.action_id = action.id
    output.action_id = action.id
    output.target_kind = action.target_kind
    output.target_label = action.target_label


async def save_user_revision(
    session: AsyncSession,
    *,
    chat: AgentChat,
    title: str,
    body: str,
    base_revision_id: uuid.UUID,
    user_id: uuid.UUID,
) -> AgentOutputRevision:
    """A direct edit: a new revision on top of the one the user was editing."""
    output = await output_for_chat(session, chat=chat)
    if output is None:
        raise OutputError("this chat has no output to edit yet")
    parent = await latest_revision(session, output=output)
    if parent is None or parent.id != base_revision_id:
        raise OutputError(
            "the output changed since you opened it; reload and edit again"
        )
    revision = AgentOutputRevision(
        workspace_id=chat.workspace_id,
        project_id=chat.project_id,
        output_id=output.id,
        number=parent.number + 1,
        parent_revision_id=parent.id,
        author=REVISION_AUTHOR_USER,
        author_user_id=user_id,
        phase=parent.phase,
        title=title,
        body=body,
        source_refs=list(parent.source_refs or []),
    )
    session.add(revision)
    output.updated_at = _utcnow()
    await session.flush()
    return revision


async def restore_revision(
    session: AsyncSession,
    *,
    chat: AgentChat,
    revision_id: uuid.UUID,
    user_id: uuid.UUID,
) -> AgentOutputRevision:
    """Restore an earlier revision as a NEW latest revision."""
    output = await output_for_chat(session, chat=chat)
    if output is None:
        raise OutputError("this chat has no output")
    source = await session.scalar(
        select(AgentOutputRevision).where(
            AgentOutputRevision.id == revision_id,
            AgentOutputRevision.output_id == output.id,
        )
    )
    latest = await latest_revision(session, output=output)
    if source is None or latest is None:
        raise OutputError("that revision does not belong to this output")
    revision = AgentOutputRevision(
        workspace_id=chat.workspace_id,
        project_id=chat.project_id,
        output_id=output.id,
        number=latest.number + 1,
        parent_revision_id=latest.id,
        author=REVISION_AUTHOR_USER,
        author_user_id=user_id,
        phase=source.phase,
        title=source.title,
        body=source.body,
        source_refs=list(source.source_refs or []),
    )
    output.phase = source.phase
    session.add(revision)
    await session.flush()
    return revision


async def approve_outline(
    session: AsyncSession,
    *,
    chat: AgentChat,
    revision_id: uuid.UUID,
    user_id: uuid.UUID,
) -> AgentOutputRevision:
    """Record the user's approval of the latest outline revision."""
    output = await output_for_chat(session, chat=chat)
    latest = await latest_revision(session, output=output) if output else None
    if (
        output is None
        or latest is None
        or latest.id != revision_id
        or latest.phase != OUTPUT_PHASE_OUTLINE
    ):
        raise OutputError("only the latest outline revision can be approved")
    if latest.approved_at is None:
        latest.approved_at = _utcnow()
        latest.approved_by_user_id = user_id
    await session.flush()
    return latest
