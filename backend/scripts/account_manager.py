"""Interactive workspace account manager for trusted workspace operators.

Run inside the backend container with an active workspace Owner/Admin identity
and an explicit workspace UUID. Passwords are read from the terminal, never argv.
This tool creates no entitlement grants or usage limits.
"""

from __future__ import annotations

import argparse
import asyncio
import getpass
import sys
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import SessionLocal, dispose_engine
from app.core.security import hash_password, verify_password
from app.domain.auth.service import get_user_by_email, register_user
from app.domain.workspaces.invitations import create_invitation, normalize_email
from app.domain.workspaces.members import change_member_role, list_members
from app.domain.workspaces.policy import (
    ASSIGNABLE_WORKSPACE_ROLES,
    WorkspaceCapability,
    role_allows,
)
from app.domain.workspaces.service import get_membership
from app.models.user import User
from app.models.workspace import Workspace, WorkspaceMember


def _ask(label: str) -> str:
    return input(f"{label}: ").strip()


def _confirm(label: str) -> bool:
    return _ask(f"{label} [type yes]").lower() == "yes"


async def _member_by_email(
    session: AsyncSession, workspace_id: uuid.UUID, email: str
) -> tuple[User, uuid.UUID]:
    user = await get_user_by_email(session, email)
    if user is None:
        raise ValueError("user_not_found")
    member = await get_membership(session, workspace_id, user.id)
    if member is None:
        raise ValueError("user_not_in_workspace")
    return user, member.id


async def _list(session: AsyncSession, workspace_id: uuid.UUID) -> None:
    for member, user in await list_members(session, workspace_id):
        print(f"{user.email}  role={member.role}  active={user.is_active}")


async def _invite(
    session: AsyncSession, workspace_id: uuid.UUID, actor_id: uuid.UUID
) -> None:
    email = normalize_email(_ask("Email"))
    if not email or "@" not in email:
        raise ValueError("email_invalid")
    role = _ask("Workspace role (admin/member/viewer)").lower()
    if role not in ASSIGNABLE_WORKSPACE_ROLES:
        raise ValueError("role_not_assignable")
    user = await get_user_by_email(session, email)
    password: str | None = None
    if user is None:
        password = getpass.getpass("New login password: ")
        if len(password) < 8 or len(password) > 128:
            raise ValueError("password_length_invalid")
        if not _confirm(f"Create {email} and invite as {role}"):
            return
    elif not _confirm(f"Invite existing user {email} as {role}"):
        return
    actor = await _authorized_operator(
        session, workspace_id, actor_id, lock_membership=True
    )
    user = await get_user_by_email(session, email)
    invitation, token = await create_invitation(
        session,
        workspace_id=workspace_id,
        email=email,
        role=role,
        invited_by=actor,
    )
    if user is None:
        if (
            password is None
            or await register_user(session, email, password, provision_access=False)
            is None
        ):
            raise ValueError("user_already_exists")
    await session.commit()
    print(f"Invitation expires at {invitation.expires_at.isoformat()}")
    print("Share this one-time token securely with the invited user:")
    print(token)
    print("The user must accept it while signed in to their own account.")


async def _change_role(
    session: AsyncSession, workspace_id: uuid.UUID, actor_id: uuid.UUID
) -> None:
    email = _ask("Member email").lower()
    user, member_id = await _member_by_email(session, workspace_id, email)
    role = _ask("New role (admin/member/viewer)").lower()
    if role not in ASSIGNABLE_WORKSPACE_ROLES:
        raise ValueError("role_not_assignable")
    if not _confirm(f"Change {user.email} to {role}"):
        return
    await _authorized_operator(session, workspace_id, actor_id, lock_membership=True)
    _, member_id = await _member_by_email(session, workspace_id, email)
    await change_member_role(
        session, workspace_id=workspace_id, member_id=member_id, role=role
    )
    await session.commit()
    print("Role updated.")


async def _reset_password(
    session: AsyncSession, workspace_id: uuid.UUID, actor_id: uuid.UUID
) -> None:
    email = _ask("Member email").lower()
    user, _ = await _member_by_email(session, workspace_id, email)
    if user.hashed_password is None:
        raise ValueError("passwordless_account")
    password = getpass.getpass("New password: ")
    if len(password) < 8 or len(password) > 128:
        raise ValueError("password_length_invalid")
    if not _confirm(f"Reset password and end sessions for {user.email}"):
        return
    await _authorized_operator(session, workspace_id, actor_id, lock_membership=True)
    user, _ = await _member_by_email(session, workspace_id, email)
    user.hashed_password = hash_password(password)
    user.session_version += 1
    await session.commit()
    print("Password updated; existing sessions are invalidated.")


async def _operator(
    session: AsyncSession, actor_email: str, workspace_id: uuid.UUID
) -> tuple[User, Workspace]:
    actor = await get_user_by_email(session, actor_email)
    workspace = await session.scalar(
        select(Workspace).where(
            Workspace.id == workspace_id, Workspace.is_system.is_(False)
        )
    )
    if actor is None or not actor.is_active:
        raise PermissionError("active_actor_required")
    actor_password = getpass.getpass("Operator password: ")
    if actor.hashed_password is None or not verify_password(
        actor_password, actor.hashed_password
    ):
        raise PermissionError("operator_authentication_failed")
    if workspace is None:
        raise ValueError("workspace_not_found")
    membership = await get_membership(session, workspace_id, actor.id)
    if membership is None or not role_allows(
        membership.role, WorkspaceCapability.MANAGE_MEMBERS
    ):
        raise PermissionError("workspace_admin_required")
    return actor, workspace


async def _authorized_operator(
    session: AsyncSession,
    workspace_id: uuid.UUID,
    actor_id: uuid.UUID,
    *,
    lock_membership: bool = False,
) -> User:
    actor = await session.get(User, actor_id, populate_existing=True)
    statement = select(WorkspaceMember).where(
        WorkspaceMember.workspace_id == workspace_id,
        WorkspaceMember.user_id == actor_id,
    )
    if lock_membership:
        statement = statement.with_for_update()
    member = await session.scalar(statement)
    if member is not None:
        await session.refresh(member)
    if (
        actor is None
        or not actor.is_active
        or member is None
        or not role_allows(member.role, WorkspaceCapability.MANAGE_MEMBERS)
    ):
        raise PermissionError("workspace_admin_required")
    return actor


async def _choice(
    session: AsyncSession, workspace_id: uuid.UUID, actor_id: uuid.UUID, choice: str
) -> None:
    await _authorized_operator(session, workspace_id, actor_id)
    if choice == "1":
        await _list(session, workspace_id)
    elif choice == "2":
        await _invite(session, workspace_id, actor_id)
    elif choice == "3":
        await _change_role(session, workspace_id, actor_id)
    elif choice == "4":
        await _reset_password(session, workspace_id, actor_id)
    else:
        print("Choose 0-4.")


async def _run(actor_email: str, workspace_id: uuid.UUID) -> None:
    async with SessionLocal() as session:
        actor, workspace = await _operator(session, actor_email, workspace_id)
        print(f"Managing {workspace.name} ({workspace.id}) as {actor.email}")
        actor_id = actor.id
        while True:
            print("\n1 List members  2 Create/invite user  3 Change role")
            print("4 Reset password  0 Exit")
            choice = _ask("Choice")
            if choice == "0":
                return
            try:
                await _choice(session, workspace_id, actor_id, choice)
            except (ValueError, PermissionError) as exc:
                await session.rollback()
                print(f"No change: {exc}")


async def _run_and_dispose(actor_email: str, workspace_id: uuid.UUID) -> None:
    try:
        await _run(actor_email, workspace_id)
    finally:
        await dispose_engine()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--actor", required=True, help="Active workspace Owner/Admin email"
    )
    parser.add_argument("--workspace-id", required=True, type=uuid.UUID)
    args = parser.parse_args(argv)
    try:
        asyncio.run(_run_and_dispose(args.actor.strip().lower(), args.workspace_id))
        return 0
    except (ValueError, PermissionError) as exc:
        print(f"Account manager unavailable: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
