"""Security receipts commit with membership changes, never ahead of them."""

import uuid

import pytest
from sqlalchemy import select

from app.domain.workspaces.members import MembershipError, change_member_role
from app.models.security_event import SecurityEvent
from app.models.user import User
from app.models.workspace import Workspace, WorkspaceMember


@pytest.mark.asyncio
async def test_role_receipt_is_atomic_and_noops_or_refusals_emit_nothing(db_session):
    actor = User(email="security-owner@example.com")
    target = User(email="security-member@example.com")
    workspace = Workspace(name="Security receipts")
    db_session.add_all([actor, target, workspace])
    await db_session.flush()
    owner = WorkspaceMember(workspace_id=workspace.id, user_id=actor.id, role="owner")
    member = WorkspaceMember(
        workspace_id=workspace.id, user_id=target.id, role="member"
    )
    db_session.add_all([owner, member])
    await db_session.commit()
    actor_id, workspace_id, member_id, owner_id = (
        actor.id,
        workspace.id,
        member.id,
        owner.id,
    )

    async def change(member_id: uuid.UUID, role: str):
        return await change_member_role(
            db_session,
            workspace_id=workspace_id,
            member_id=member_id,
            role=role,
            actor_id=actor_id,
        )

    await change(member_id, "admin")
    await db_session.rollback()
    assert await db_session.scalar(select(SecurityEvent.id)) is None
    restored = await db_session.get(WorkspaceMember, member_id)
    assert restored.role == "member"

    await change(member_id, "admin")
    await db_session.commit()
    await change(member_id, "admin")
    with pytest.raises(MembershipError, match="owner_role_requires_transfer"):
        await change(owner_id, "viewer")
    await db_session.rollback()
    events = (await db_session.scalars(select(SecurityEvent))).all()
    assert [
        (event.event, event.actor_id, event.workspace_id, event.target_id)
        for event in events
    ] == [("membership.role", actor_id, workspace_id, member_id)]
