"""Operator account-manager bridge: roster and assignable role changes only."""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.auth.security_events import record_security_event
from app.domain.workspaces.policy import (
    ASSIGNABLE_WORKSPACE_ROLES,
    WORKSPACE_ROLE_OWNER,
)
from app.models.user import User
from app.models.workspace import WorkspaceMember


class MembershipError(ValueError):
    """A membership change the workspace invariants refuse."""

    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


async def list_members(
    session: AsyncSession, workspace_id: uuid.UUID
) -> list[tuple[WorkspaceMember, User]]:
    """Every membership in the workspace with its user, oldest first."""
    result = await session.execute(
        select(WorkspaceMember, User)
        .join(User, User.id == WorkspaceMember.user_id)
        .where(WorkspaceMember.workspace_id == workspace_id)
        .order_by(WorkspaceMember.created_at.asc())
    )
    return [(member, user) for member, user in result.all()]


async def _locked_member(
    session: AsyncSession, workspace_id: uuid.UUID, member_id: uuid.UUID
) -> WorkspaceMember:
    member = await session.scalar(
        select(WorkspaceMember)
        .where(
            WorkspaceMember.id == member_id,
            WorkspaceMember.workspace_id == workspace_id,
        )
        .with_for_update()
    )
    if member is None:
        raise MembershipError("member_not_found")
    return member


async def change_member_role(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    member_id: uuid.UUID,
    role: str,
    actor_id: uuid.UUID,
) -> WorkspaceMember:
    """Set an existing member's role to an ASSIGNABLE role.

    ``owner`` is not assignable here: promoting to Owner would either create a
    second Owner or silently demote the current one. Ownership transfer is
    handled by the TypeScript workspace API.
    """
    if role not in ASSIGNABLE_WORKSPACE_ROLES:
        raise MembershipError("role_not_assignable")
    member = await _locked_member(session, workspace_id, member_id)
    if member.role == WORKSPACE_ROLE_OWNER:
        raise MembershipError("owner_role_requires_transfer")
    if member.role == role:
        return member
    member.role = role
    record_security_event(
        session,
        event="membership.role",
        actor_id=actor_id,
        workspace_id=workspace_id,
        target_id=member.user_id,
    )
    await session.flush()
    return member
