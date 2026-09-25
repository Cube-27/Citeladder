"""Action workflow status: the effective read and the one user write.

A user stores ``open`` or ``dismissed``. ``in_progress`` is never stored: an
open Action reads as in progress while a linked chat has an output, so the
Agent never sets a status and deleting the chat's work cannot strand one.
"""

from __future__ import annotations

import uuid

from sqlalchemy import ColumnElement, and_, case, exists, func, literal, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config.actions import (
    ACTION_ACTIVE_STATUSES,
    ACTION_ORIGIN_AGENT,
    ACTION_STATUS_IN_PROGRESS,
    ACTION_STATUS_OPEN,
    ACTION_STATUSES,
    ACTION_USER_STATUSES,
)
from app.domain.opportunities.errors import (
    OpportunityNotFoundError,
    OpportunityValidationError,
)
from app.models.agent import AgentOutput
from app.models.opportunity import Action, ActionStatusEvent, Opportunity

_ACTION_NOT_FOUND = "Action not found"


def effective_status() -> ColumnElement[str]:
    """The status a reader sees, derived in SQL so filters and reads agree."""
    has_output = exists().where(AgentOutput.action_id == Action.id)
    return case(
        (
            and_(Action.status == ACTION_STATUS_OPEN, has_output),
            literal(ACTION_STATUS_IN_PROGRESS),
        ),
        else_=Action.status,
    )


def listed_actions() -> ColumnElement[bool]:
    """Actions a list shows: live evidence, or agent work kept by its chat."""
    return Action.evidence_cleared_at.is_(None) | (Action.origin == ACTION_ORIGIN_AGENT)


def opportunity_status_clause(status: str | None) -> ColumnElement[bool]:
    """Opportunities whose Action has ``status``; by default the work queue.

    A row recomputed before Actions existed has no Action and stays in the
    default queue rather than disappearing.
    """
    if status:
        return Opportunity.action_id.in_(
            select(Action.id).where(effective_status() == status)
        )
    active = select(Action.id).where(
        effective_status().in_(sorted(ACTION_ACTIVE_STATUSES))
    )
    return or_(Opportunity.action_id.is_(None), Opportunity.action_id.in_(active))


def validate_status(status: str) -> None:
    if status not in ACTION_STATUSES:
        raise OpportunityValidationError(f"unknown action status: {status!r}")


async def status_counts(
    session: AsyncSession, *, workspace_id: uuid.UUID, project_id: uuid.UUID
) -> dict[str, int]:
    """Listed Actions per effective status; every status present, zero or not."""
    status = effective_status()
    rows = await session.execute(
        select(status, func.count())
        .where(
            Action.workspace_id == workspace_id,
            Action.project_id == project_id,
            listed_actions(),
        )
        .group_by(status)
    )
    counts = dict.fromkeys(ACTION_STATUSES, 0)
    for name, count in rows.all():
        counts[str(name)] = int(count)
    return counts


async def action_status(session: AsyncSession, *, action_id: uuid.UUID) -> str:
    value = await session.scalar(
        select(effective_status()).where(Action.id == action_id)
    )
    return str(value or ACTION_STATUS_OPEN)


async def update_status(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    action_id: uuid.UUID,
    status: str,
    changed_by_user_id: uuid.UUID,
) -> Action:
    """Store a user's workflow decision and append its audit event."""
    if status not in ACTION_USER_STATUSES:
        raise OpportunityValidationError(
            f"an action can only be set to {sorted(ACTION_USER_STATUSES)}"
        )
    action = await session.scalar(
        select(Action)
        .where(Action.id == action_id, Action.workspace_id == workspace_id)
        .with_for_update()
    )
    if action is None:
        raise OpportunityNotFoundError(_ACTION_NOT_FOUND)
    previous = action.status
    if previous != status:
        action.status = status
        session.add(
            ActionStatusEvent(
                workspace_id=workspace_id,
                project_id=action.project_id,
                action_id=action.id,
                previous_status=previous,
                next_status=status,
                changed_by_user_id=changed_by_user_id,
            )
        )
    await session.commit()
    return action
