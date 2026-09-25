"""The project's chat list: newest activity first, searchable, keyset-paged."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import ColumnElement, and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config.agent import AGENT_LIST_DEFAULT_LIMIT, AGENT_LIST_MAX_LIMIT
from app.domain.agent.service import AgentNotFoundError
from app.domain.site_health.normalization import (
    decode_keyset_cursor,
    encode_keyset_cursor,
)
from app.models.agent import AgentChat, AgentOutput
from app.models.opportunity import Action
from app.models.project import Project

_SCOPE = "agent-chats"


class InvalidChatCursorError(ValueError):
    """A cursor was tampered with or replayed across filters (400)."""


ChatRow = tuple[AgentChat, AgentOutput | None, str | None]


async def list_chats(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    limit: int | None,
    query: str | None,
    action_id: uuid.UUID | None = None,
    cursor: str | None = None,
) -> tuple[list[ChatRow], str | None]:
    """Live chats with their output and the attached Action's target label."""
    project = await session.scalar(
        select(Project.id).where(
            Project.id == project_id, Project.workspace_id == workspace_id
        )
    )
    if project is None:
        raise AgentNotFoundError("Project not found")
    bounded = max(1, min(limit or AGENT_LIST_DEFAULT_LIMIT, AGENT_LIST_MAX_LIMIT))
    search = (query or "").strip()
    statement = (
        select(AgentChat, AgentOutput, Action.target_label)
        .outerjoin(AgentOutput, AgentOutput.chat_id == AgentChat.id)
        .outerjoin(
            Action,
            and_(Action.id == AgentChat.action_id, Action.workspace_id == workspace_id),
        )
        .where(
            AgentChat.workspace_id == workspace_id,
            AgentChat.project_id == project_id,
            AgentChat.archived_at.is_(None),
        )
    )
    if search:
        escaped = search.replace("\\", "\\\\").replace("%", r"\%").replace("_", r"\_")
        statement = statement.where(AgentChat.title.ilike(f"%{escaped}%", escape="\\"))
    if action_id is not None:
        statement = statement.where(AgentChat.action_id == action_id)
    filters = {
        "project_id": str(project_id),
        "q": search or None,
        "action_id": str(action_id) if action_id else None,
    }
    if cursor:
        statement = statement.where(_after(cursor, filters))
    rows = (
        await session.execute(
            statement.order_by(
                AgentChat.last_activity_at.desc(), AgentChat.id.desc()
            ).limit(bounded + 1)
        )
    ).all()
    page: list[ChatRow] = [(chat, output, label) for chat, output, label in rows]
    if len(page) <= bounded:
        return page, None
    last = page[bounded - 1][0]
    next_cursor = encode_keyset_cursor(
        scope=_SCOPE,
        filters=filters,
        sort_values=[last.last_activity_at.isoformat(), last.id],
    )
    return page[:bounded], next_cursor


def _after(cursor: str, filters: dict[str, str | None]) -> ColumnElement[bool]:
    try:
        last_at, last_id = decode_keyset_cursor(cursor, scope=_SCOPE, filters=filters)
        at, chat_id = datetime.fromisoformat(last_at), uuid.UUID(last_id)
    except ValueError as exc:
        raise InvalidChatCursorError("invalid cursor") from exc
    return or_(
        AgentChat.last_activity_at < at,
        and_(AgentChat.last_activity_at == at, AgentChat.id < chat_id),
    )
