# Workspace + membership service (workspace-scoped, invariant 5).
from __future__ import annotations

import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config.workspaces import MAX_OWNED_WORKSPACES_PER_USER
from app.domain.abuse.service import lock_subject
from app.domain.billing.bootstrap import ensure_workspace_billing
from app.domain.workspaces.policy import WORKSPACE_ROLE_OWNER
from app.models.user import User
from app.models.workspace import Workspace, WorkspaceMember


class WorkspaceLimitExceededError(ValueError):
    """The user already OWNS the maximum number of tenant roots.

    Memberships held by invitation never count: those workspaces belong to
    somebody else and carry somebody else's billing account.
    """

    def __init__(self, *, limit: int) -> None:
        super().__init__(f"Owned workspace limit of {limit} reached")
        self.limit = limit


def _default_workspace_name(user: User) -> str:
    local_part = (user.email or "").split("@", 1)[0].strip()
    label = local_part or "My"
    return f"{label}'s Workspace"


async def get_membership(
    session: AsyncSession, workspace_id: uuid.UUID, user_id: uuid.UUID
) -> WorkspaceMember | None:
    """Resolve the caller's membership row for a workspace, or None.

    This is the single source of truth used by ``require_workspace_member``;
    a missing row means no access (403/404), never a user-id fallback. A
    membership row pointing at the reserved SYSTEM workspace never authorizes
    (T11): system workspaces cannot have memberships, so even a stray row is
    inert here.
    """
    result = await session.execute(
        select(WorkspaceMember)
        .join(Workspace, Workspace.id == WorkspaceMember.workspace_id)
        .where(
            WorkspaceMember.workspace_id == workspace_id,
            WorkspaceMember.user_id == user_id,
            Workspace.is_system.is_(False),
        )
    )
    return result.scalar_one_or_none()


async def list_workspaces_for_user(
    session: AsyncSession, user: User
) -> list[tuple[Workspace, WorkspaceMember]]:
    """Return the workspaces the user is a member of, with their membership.

    The reserved system workspace is never a tenant workspace (T11): it is
    excluded even if a stray membership row exists.
    """
    result = await session.execute(
        select(Workspace, WorkspaceMember)
        .join(WorkspaceMember, WorkspaceMember.workspace_id == Workspace.id)
        .where(
            WorkspaceMember.user_id == user.id,
            Workspace.is_system.is_(False),
        )
        .order_by(Workspace.created_at.asc())
    )
    return [row.tuple() for row in result.all()]


async def count_owned_workspaces(session: AsyncSession, user_id: uuid.UUID) -> int:
    """How many non-system workspaces ``user_id`` is the Owner of."""
    return int(
        await session.scalar(
            select(func.count(WorkspaceMember.id))
            .join(Workspace, Workspace.id == WorkspaceMember.workspace_id)
            .where(
                WorkspaceMember.user_id == user_id,
                WorkspaceMember.role == WORKSPACE_ROLE_OWNER,
                Workspace.is_system.is_(False),
            )
        )
        or 0
    )


async def create_workspace(
    session: AsyncSession, user: User, name: str
) -> tuple[Workspace, WorkspaceMember]:
    """Create a workspace, its billing account, and ``user``'s Owner row.

    The workspace and its single billing account are created in ONE
    transaction (plan §2.1/§2.2): a workspace never exists without the
    account that bills it, and the new workspace provisions only its own
    baseline terms — never a copy of another workspace's paid subscription
    or grants.
    """
    await lock_subject(session, namespace="workspace.create", subject=user.id)
    owned = await count_owned_workspaces(session, user.id)
    if owned >= MAX_OWNED_WORKSPACES_PER_USER:
        raise WorkspaceLimitExceededError(limit=MAX_OWNED_WORKSPACES_PER_USER)
    workspace = Workspace(name=name)
    session.add(workspace)
    await session.flush()
    member = WorkspaceMember(
        workspace_id=workspace.id,
        user_id=user.id,
        role=WORKSPACE_ROLE_OWNER,
    )
    session.add(member)
    await session.flush()
    await ensure_workspace_billing(
        session, workspace_id=workspace.id, provisioning_user=user
    )
    await session.commit()
    await session.refresh(workspace)
    await session.refresh(member)
    return workspace, member


async def ensure_personal_workspace(
    session: AsyncSession, user: User
) -> Workspace | None:
    """Auto-create the user's OWN workspace + Owner row if they own none.

    Returns the newly created workspace, or ``None`` when the user already
    owns one. Membership held by invitation deliberately does not suppress
    this: a user who has only ever been invited into somebody else's
    workspace still gets the one workspace they own. Flushes but does not
    commit — the caller owns the transaction boundary.
    """
    await lock_subject(session, namespace="workspace.create", subject=user.id)
    if await count_owned_workspaces(session, user.id) > 0:
        return None
    workspace = Workspace(name=_default_workspace_name(user))
    session.add(workspace)
    await session.flush()
    member = WorkspaceMember(
        workspace_id=workspace.id,
        user_id=user.id,
        role=WORKSPACE_ROLE_OWNER,
    )
    session.add(member)
    await session.flush()
    return workspace
