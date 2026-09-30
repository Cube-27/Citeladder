"""Invitation issuance for the retained interactive account manager.

The operator holds the workspace root before its membership and invitation
locks. Tokens are stored only as SHA-256 hashes; acceptance, rotation and
revocation are owned by the TypeScript workspace API.
"""

from __future__ import annotations

import hashlib
import secrets
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql.elements import ColumnElement

from app.core.config.workspaces import (
    INVITATION_TTL_HOURS,
    MAX_PENDING_INVITATIONS_PER_WORKSPACE,
)
from app.domain.workspaces.policy import ASSIGNABLE_WORKSPACE_ROLES
from app.models.user import User
from app.models.workspace import Workspace, WorkspaceInvitation, WorkspaceMember

#: Bytes of entropy in an invitation token.
_TOKEN_BYTES = 32


class InvitationError(ValueError):
    """An invitation operation the workspace rules refuse."""

    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


def normalize_email(email: str) -> str:
    """The comparison form of an address: trimmed and lowercased."""
    return email.strip().lower()


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _new_token() -> tuple[str, str]:
    token = secrets.token_urlsafe(_TOKEN_BYTES)
    return token, _hash_token(token)


def _live_invitation(workspace_id: uuid.UUID, at: datetime) -> ColumnElement[bool]:
    """The predicate for an invitation that can still be accepted at ``at``.

    Stated once so the listing, the workspace budget and the same-address
    block all agree about what "pending" means. An expired row is none of
    those things.
    """
    return and_(
        WorkspaceInvitation.workspace_id == workspace_id,
        WorkspaceInvitation.accepted_at.is_(None),
        WorkspaceInvitation.revoked_at.is_(None),
        WorkspaceInvitation.expires_at > at,
    )


async def create_invitation(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    email: str,
    role: str,
    invited_by: User,
    at: datetime | None = None,
) -> tuple[WorkspaceInvitation, str]:
    """Issue one invitation and return it with its single-use plaintext token.

    Refuses an address that is already a member, a role outside the assignable
    set, and a second pending invitation for the same address (the partial
    unique index is the concurrent-insert guard behind that check).
    """
    if role not in ASSIGNABLE_WORKSPACE_ROLES:
        raise InvitationError("role_not_assignable")
    now = at or datetime.now(UTC)
    normalized = normalize_email(email)
    if not normalized or "@" not in normalized:
        raise InvitationError("email_invalid")

    # Serialize invitation creation for this workspace. The budget check and
    # the insert are otherwise a read-then-write: two concurrent requests for
    # DIFFERENT addresses could both observe the same count and both commit,
    # and two for the SAME expired address could both rotate it and each
    # believe its own token is the live one. The lock is held to commit.
    await session.execute(
        select(Workspace.id).where(Workspace.id == workspace_id).with_for_update()
    )

    already = await session.scalar(
        select(WorkspaceMember.id)
        .join(User, User.id == WorkspaceMember.user_id)
        .where(
            WorkspaceMember.workspace_id == workspace_id,
            func.lower(User.email) == normalized,
        )
    )
    if already is not None:
        raise InvitationError("already_a_member")

    # EXPIRED rows are not pending: they cannot be accepted, so they must
    # neither consume the workspace's invitation budget nor block a fresh
    # invitation to the same address.
    pending = await session.scalar(
        select(func.count(WorkspaceInvitation.id)).where(
            _live_invitation(workspace_id, now)
        )
    )
    if int(pending or 0) >= MAX_PENDING_INVITATIONS_PER_WORKSPACE:
        raise InvitationError("invitation_limit_exceeded")

    existing = await session.scalar(
        select(WorkspaceInvitation)
        .where(
            _live_invitation(workspace_id, now),
            WorkspaceInvitation.email_normalized == normalized,
        )
        .with_for_update()
    )
    if existing is not None:
        raise InvitationError("invitation_already_pending")

    token, token_hash = _new_token()
    # The partial unique index cannot know the clock, so an EXPIRED row for
    # this address still occupies the (workspace, email) slot. Reuse that row
    # rather than colliding with it: same slot, new token, new expiry.
    superseded = await session.scalar(
        select(WorkspaceInvitation)
        .where(
            WorkspaceInvitation.workspace_id == workspace_id,
            WorkspaceInvitation.email_normalized == normalized,
            WorkspaceInvitation.accepted_at.is_(None),
            WorkspaceInvitation.revoked_at.is_(None),
        )
        .with_for_update()
    )
    if superseded is not None:
        superseded.role = role
        superseded.token_sha256 = token_hash
        superseded.invited_by_user_id = invited_by.id
        superseded.expires_at = now + timedelta(hours=INVITATION_TTL_HOURS)
        await session.flush()
        return superseded, token

    invitation = WorkspaceInvitation(
        workspace_id=workspace_id,
        email_normalized=normalized,
        role=role,
        token_sha256=token_hash,
        invited_by_user_id=invited_by.id,
        expires_at=now + timedelta(hours=INVITATION_TTL_HOURS),
    )
    session.add(invitation)
    await session.flush()
    return invitation, token
