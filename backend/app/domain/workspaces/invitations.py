"""Workspace invitations: issue, list, revoke, resend, accept.

The token is generated once, returned once to the inviting administrator, and
stored only as a SHA-256 hash — a database read cannot mint a working
acceptance link. Acceptance is single-use, expiring, and bound to an
authenticated identity whose email matches the invited address.

Role choice is enforced server-side against ``ASSIGNABLE_WORKSPACE_ROLES``, so
a Member or Viewer calling the endpoint directly cannot invite or promote
anybody — the API dependency already refused them the ``MANAGE_MEMBERS``
capability, and an invitation can never name ``owner`` even for an
administrator.

There is no mail transport in this repository, so the acceptance link is
handed back to the inviting administrator to deliver (recorded in the plan's
§2.4 delivery note). When a mail-delivery owner exists, that becomes the one
place this module calls; nothing else about the token lifecycle changes.
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


async def list_invitations(
    session: AsyncSession, workspace_id: uuid.UUID, *, at: datetime | None = None
) -> list[WorkspaceInvitation]:
    """Every invitation that can still be accepted, newest first."""
    result = await session.scalars(
        select(WorkspaceInvitation)
        .where(_live_invitation(workspace_id, at or datetime.now(UTC)))
        .order_by(WorkspaceInvitation.created_at.desc())
    )
    return list(result.all())


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


async def revoke_invitation(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    invitation_id: uuid.UUID,
    at: datetime | None = None,
) -> WorkspaceInvitation:
    """Mark one pending invitation revoked. Its token stops working at once."""
    invitation = await _pending_invitation(session, workspace_id, invitation_id)
    invitation.revoked_at = at or datetime.now(UTC)
    await session.flush()
    return invitation


async def resend_invitation(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    invitation_id: uuid.UUID,
    at: datetime | None = None,
) -> tuple[WorkspaceInvitation, str]:
    """Rotate the token and extend the expiry, returning the new token.

    Resending deliberately INVALIDATES the previous link rather than
    re-delivering it: only one acceptance link per address is ever live.
    """
    invitation = await _pending_invitation(session, workspace_id, invitation_id)
    now = at or datetime.now(UTC)
    token, token_hash = _new_token()
    invitation.token_sha256 = token_hash
    invitation.expires_at = now + timedelta(hours=INVITATION_TTL_HOURS)
    await session.flush()
    return invitation, token


async def _pending_invitation(
    session: AsyncSession, workspace_id: uuid.UUID, invitation_id: uuid.UUID
) -> WorkspaceInvitation:
    invitation = await session.scalar(
        select(WorkspaceInvitation)
        .where(
            WorkspaceInvitation.id == invitation_id,
            WorkspaceInvitation.workspace_id == workspace_id,
        )
        .with_for_update()
    )
    if invitation is None:
        raise InvitationError("invitation_not_found")
    if invitation.accepted_at is not None or invitation.revoked_at is not None:
        raise InvitationError("invitation_not_pending")
    return invitation


async def accept_invitation(
    session: AsyncSession,
    *,
    token: str,
    user: User,
    at: datetime | None = None,
) -> tuple[Workspace, WorkspaceMember]:
    """Join the invited workspace as the authenticated, matching identity.

    Repeated acceptance is inert: membership is unique per
    ``(workspace_id, user_id)``, so a second call returns the existing
    membership instead of duplicating it, and it never creates a second
    billing account — the target workspace already has its own.

    An invitation is refused when it is expired, revoked, or addressed to a
    different identity than the signed-in one.
    """
    now = at or datetime.now(UTC)
    invitation = await session.scalar(
        select(WorkspaceInvitation)
        .where(WorkspaceInvitation.token_sha256 == _hash_token(token))
        .with_for_update()
    )
    if invitation is None:
        raise InvitationError("invitation_not_found")
    if invitation.revoked_at is not None:
        raise InvitationError("invitation_revoked")
    if invitation.expires_at <= now:
        raise InvitationError("invitation_expired")
    if normalize_email(user.email) != invitation.email_normalized:
        raise InvitationError("invitation_identity_mismatch")

    workspace = await session.scalar(
        select(Workspace).where(
            Workspace.id == invitation.workspace_id,
            Workspace.is_system.is_(False),
        )
    )
    if workspace is None:
        raise InvitationError("workspace_not_found")

    member = await session.scalar(
        select(WorkspaceMember).where(
            WorkspaceMember.workspace_id == workspace.id,
            WorkspaceMember.user_id == user.id,
        )
    )
    if member is not None:
        # Repeated acceptance is inert: the existing membership is returned
        # and nothing is duplicated.
        if invitation.accepted_at is None:
            invitation.accepted_at = now
            invitation.accepted_by_user_id = user.id
            await session.flush()
        return workspace, member
    if invitation.accepted_at is not None:
        # The token was already spent AND the membership it created is gone —
        # removed by an administrator. A spent token must not let the removed
        # member walk back in; they need a fresh invitation.
        raise InvitationError("invitation_already_accepted")
    member = WorkspaceMember(
        workspace_id=workspace.id,
        user_id=user.id,
        role=invitation.role,
    )
    session.add(member)
    invitation.accepted_at = now
    invitation.accepted_by_user_id = user.id
    await session.flush()
    return workspace, member


__all__ = [
    "InvitationError",
    "accept_invitation",
    "create_invitation",
    "list_invitations",
    "normalize_email",
    "resend_invitation",
    "revoke_invitation",
]
