"""Seed helpers for account-occupancy enforcement tests (real Postgres).

Mirrors ``site_health_helpers.seed_monitored_urls_allowance`` but targets the
occupancy capabilities (``project_slots`` / ``prompt_slots``) with an
arbitrary grant bundle. Uses the production override-grant path so the
account lifecycle-version bump (and therefore resolver-cache identity)
behaves exactly as in production.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.billing.accounts import billing_account_id_for
from app.domain.entitlements.grants import issue_override_bundle, revoke_grants
from app.domain.entitlements.types import GrantSpec
from app.domain.workspaces.policy import WORKSPACE_ROLE_OWNER
from app.models.billing import AccountGrant, BillingAccount
from app.models.user import User
from app.models.workspace import Workspace, WorkspaceMember


async def seed_occupancy_grants(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    grants: tuple[GrantSpec, ...],
) -> BillingAccount:
    """Wire the workspace's billing account + an override grant bundle.

    When the workspace already has its account (API-registered users bootstrap
    one), the grant lands on the EXISTING account. Callers own the commit.
    """
    account_id = await billing_account_id_for(session, workspace_id)
    if account_id is not None:
        account = await session.get(BillingAccount, account_id)
        assert account is not None
        operator = await account_operator(session, account, workspace_id)
    else:
        operator = User(
            email=f"occupancy-{uuid.uuid4().hex[:8]}@example.com",
            hashed_password="x",
            is_active=True,
        )
        session.add(operator)
        await session.flush()
        account = BillingAccount(workspace_id=workspace_id, owner_user_id=operator.id)
        session.add(account)
        await session.flush()
    await issue_override_bundle(
        session,
        operator_user=operator,
        account_id=account.id,
        grants=grants,
        reason="test seed occupancy allowance",
        valid_from=datetime.now(UTC) - timedelta(days=1),
        valid_until=None,
        idempotency_key=f"test-occupancy:{workspace_id}:{uuid.uuid4().hex[:12]}",
    )
    return account


async def revoke_signup_baseline_grants(
    session: AsyncSession, *, workspace_id: uuid.UUID
) -> BillingAccount:
    """Make an API-registered account explicitly bare for boundary tests.

    Registration intentionally creates the public free baseline. Tests that
    exercise a precise grant boundary revoke that baseline instead of treating
    an additive override as a replacement for it.
    """
    account_id = await billing_account_id_for(session, workspace_id)
    assert account_id is not None
    account = await session.get(BillingAccount, account_id)
    assert account is not None
    grant_ids = tuple(
        (
            await session.scalars(
                select(AccountGrant.id).where(
                    AccountGrant.billing_account_id == account.id,
                    AccountGrant.source_kind == "override",
                    AccountGrant.source_ref == "system:public-signup",
                )
            )
        ).all()
    )
    assert grant_ids, "registered account must have an explicit public baseline"
    await revoke_grants(
        session,
        grant_ids=grant_ids,
        effective_from=datetime.now(UTC),
        reason="test bare account fixture",
        actor_kind="system",
        actor_user_id=None,
        idempotency_key=f"test-bare:{workspace_id}",
    )
    return account


async def seed_account_workspace(
    session: AsyncSession,
) -> tuple[BillingAccount, Workspace, User]:
    """ORM-seed an owner user, a workspace, and the workspace's account.

    Commits so independent sessions (the concurrency tests) see the rows.
    """
    user = User(
        email=f"occ-{uuid.uuid4().hex[:8]}@example.com",
        hashed_password="x",
        is_active=True,
    )
    session.add(user)
    await session.flush()
    workspace = Workspace(name="Occupancy WS")
    session.add(workspace)
    await session.flush()
    session.add(
        WorkspaceMember(
            workspace_id=workspace.id, user_id=user.id, role=WORKSPACE_ROLE_OWNER
        )
    )
    account = BillingAccount(workspace_id=workspace.id, owner_user_id=user.id)
    session.add(account)
    await session.commit()
    return account, workspace, user


async def account_operator(
    session: AsyncSession, account: BillingAccount, workspace_id: uuid.UUID
) -> User:
    """An actor for an audited override grant.

    Prefers the workspace's designated Owner; ``owner_user_id`` is only
    provisioning metadata now and may be null.
    """
    owner = await session.scalar(
        select(User)
        .join(WorkspaceMember, WorkspaceMember.user_id == User.id)
        .where(
            WorkspaceMember.workspace_id == workspace_id,
            WorkspaceMember.role == WORKSPACE_ROLE_OWNER,
        )
    )
    if owner is not None:
        return owner
    assert account.owner_user_id is not None
    operator = await session.get(User, account.owner_user_id)
    assert operator is not None
    return operator
