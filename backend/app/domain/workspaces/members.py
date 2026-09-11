"""Workspace membership administration: roles, removal, ownership transfer.

Every function here is an administrative action (``MANAGE_MEMBERS``); the API
dependency has already established that the caller holds it. What this module
owns is the INVARIANT the caller cannot be trusted to preserve: a workspace
always has exactly one Owner.

A role change, a removal, or a departure that would leave the workspace
ownerless is refused unless the very same transaction installs a replacement.
That rule applies equally to Owner and Admin — it is an invariant, not an
Owner-only privilege.
"""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.workspaces.policy import (
    ASSIGNABLE_WORKSPACE_ROLES,
    WORKSPACE_ROLE_ADMIN,
    WORKSPACE_ROLE_OWNER,
)
from app.models.user import User
from app.models.workspace import Workspace, WorkspaceMember


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


async def _locked_owner(
    session: AsyncSession, workspace_id: uuid.UUID
) -> WorkspaceMember:
    owner = await session.scalar(
        select(WorkspaceMember)
        .where(
            WorkspaceMember.workspace_id == workspace_id,
            WorkspaceMember.role == WORKSPACE_ROLE_OWNER,
        )
        .with_for_update()
    )
    if owner is None:  # pragma: no cover - the invariant this module enforces
        raise MembershipError("workspace_has_no_owner")
    return owner


async def change_member_role(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    member_id: uuid.UUID,
    role: str,
) -> WorkspaceMember:
    """Set an existing member's role to an ASSIGNABLE role.

    ``owner`` is not assignable here: promoting to Owner would either create a
    second Owner or silently demote the current one. Use
    :func:`transfer_ownership`, which does both halves atomically.
    """
    if role not in ASSIGNABLE_WORKSPACE_ROLES:
        raise MembershipError("role_not_assignable")
    member = await _locked_member(session, workspace_id, member_id)
    if member.role == WORKSPACE_ROLE_OWNER:
        raise MembershipError("owner_role_requires_transfer")
    member.role = role
    await session.flush()
    return member


async def remove_member(
    session: AsyncSession, *, workspace_id: uuid.UUID, member_id: uuid.UUID
) -> None:
    """Remove a membership. The designated Owner cannot be removed.

    Removing the Owner would leave the workspace ownerless; transfer
    ownership first, which installs the replacement in one transaction.
    """
    member = await _locked_member(session, workspace_id, member_id)
    if member.role == WORKSPACE_ROLE_OWNER:
        raise MembershipError("owner_cannot_be_removed")
    await session.delete(member)
    await session.flush()


async def transfer_ownership(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    new_owner_member_id: uuid.UUID,
) -> tuple[WorkspaceMember, WorkspaceMember]:
    """Move the Owner designation to another member, atomically.

    Both rows change in ONE transaction: the named member becomes Owner and
    the previous Owner becomes Admin, so the workspace is never ownerless and
    never has two Owners. Owner and Admin may both initiate this.

    The billing account is untouched. Ownership is membership authority, not
    the payer identity: the account keeps its id, its accepted subscription
    terms, its receipts and its frozen ``registration_cohort_at``.
    """
    previous = await _locked_owner(session, workspace_id)
    if previous.id == new_owner_member_id:
        raise MembershipError("already_owner")
    incoming = await _locked_member(session, workspace_id, new_owner_member_id)
    previous.role = WORKSPACE_ROLE_ADMIN
    incoming.role = WORKSPACE_ROLE_OWNER
    await session.flush()
    return incoming, previous


async def leave_workspace(
    session: AsyncSession, *, workspace_id: uuid.UUID, user_id: uuid.UUID
) -> None:
    """Drop the caller's own membership.

    The Owner may not simply leave: that would strand the workspace and its
    billing account. Transfer ownership first.
    """
    member = await session.scalar(
        select(WorkspaceMember)
        .where(
            WorkspaceMember.workspace_id == workspace_id,
            WorkspaceMember.user_id == user_id,
        )
        .with_for_update()
    )
    if member is None:
        raise MembershipError("member_not_found")
    if member.role == WORKSPACE_ROLE_OWNER:
        raise MembershipError("owner_cannot_leave")
    await session.delete(member)
    await session.flush()


async def workspace_for_update(
    session: AsyncSession, workspace_id: uuid.UUID
) -> Workspace:
    """Load a tenant workspace row, refusing the reserved system workspace."""
    workspace = await session.scalar(
        select(Workspace).where(
            Workspace.id == workspace_id, Workspace.is_system.is_(False)
        )
    )
    if workspace is None:
        raise MembershipError("workspace_not_found")
    return workspace


__all__ = [
    "MembershipError",
    "change_member_role",
    "leave_workspace",
    "list_members",
    "remove_member",
    "transfer_ownership",
    "workspace_for_update",
]
