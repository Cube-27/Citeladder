"""The interactive operator gate must observe revocations between choices."""

from __future__ import annotations

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.domain.auth.service import register_user
from app.domain.workspaces.service import get_membership, list_workspaces_for_user
from app.models.user import User
from app.models.workspace import WorkspaceMember
from scripts import account_manager


@pytest.mark.asyncio
@pytest.mark.parametrize("revocation", ["deactivate", "demote"])
async def test_account_manager_rechecks_operator_before_next_choice(
    session_factory: async_sessionmaker[AsyncSession],
    monkeypatch: pytest.MonkeyPatch,
    revocation: str,
) -> None:
    async with session_factory() as setup:
        owner = await register_user(setup, "account-owner@example.com", "password123")
        actor = await register_user(setup, "account-admin@example.com", "password123")
        assert owner is not None and actor is not None
        workspace, _ = (await list_workspaces_for_user(setup, owner))[0]
        member = WorkspaceMember(
            workspace_id=workspace.id, user_id=actor.id, role="admin"
        )
        setup.add(member)
        await setup.commit()
        actor_id = actor.id
        workspace_id = workspace.id

    async def unexpected_invite(*_args: object) -> None:
        raise AssertionError("revoked operator reached account mutation")

    monkeypatch.setattr(account_manager, "_invite", unexpected_invite)

    async with session_factory() as operator:
        cached_actor = await operator.get(User, actor_id)
        cached_member = await get_membership(operator, workspace_id, actor_id)
        assert cached_actor is not None and cached_member is not None
        await account_manager._choice(operator, workspace_id, actor_id, "1")

        async with session_factory() as administrator:
            if revocation == "deactivate":
                current_actor = await administrator.get(User, actor_id)
                assert current_actor is not None
                current_actor.is_active = False
            else:
                current_member = await get_membership(
                    administrator, workspace_id, actor_id
                )
                assert current_member is not None
                current_member.role = "member"
            await administrator.commit()

        with pytest.raises(PermissionError, match="workspace_admin_required"):
            await account_manager._choice(operator, workspace_id, actor_id, "2")


@pytest.mark.asyncio
async def test_account_manager_rechecks_operator_after_invite_confirmation(
    session_factory: async_sessionmaker[AsyncSession],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async with session_factory() as setup:
        owner = await register_user(setup, "account-owner@example.com", "password123")
        actor = await register_user(setup, "account-admin@example.com", "password123")
        invitee = await register_user(
            setup, "account-invitee@example.com", "password123"
        )
        assert owner is not None and actor is not None and invitee is not None
        workspace, _ = (await list_workspaces_for_user(setup, owner))[0]
        setup.add(
            WorkspaceMember(workspace_id=workspace.id, user_id=actor.id, role="admin")
        )
        await setup.commit()
        actor_id = actor.id
        workspace_id = workspace.id

    monkeypatch.setattr(
        account_manager,
        "_ask",
        lambda _label: "account-invitee@example.com" if _label == "Email" else "member",
    )
    monkeypatch.setattr(account_manager, "_confirm", lambda _label: True)

    async def authorization_lapsed(
        _session: AsyncSession,
        _workspace_id: object,
        _actor_id: object,
        *,
        lock_membership: bool = False,
    ) -> User:
        if lock_membership:
            raise PermissionError("workspace_admin_required")
        raise AssertionError("invite flow must authorize only before the mutation")

    async def unexpected_invitation(*_args: object, **_kwargs: object) -> None:
        raise AssertionError("revoked operator reached account mutation")

    monkeypatch.setattr(account_manager, "_authorized_operator", authorization_lapsed)
    monkeypatch.setattr(account_manager, "create_invitation", unexpected_invitation)

    async with session_factory() as operator:
        with pytest.raises(PermissionError, match="workspace_admin_required"):
            await account_manager._invite(operator, workspace_id, actor_id)
