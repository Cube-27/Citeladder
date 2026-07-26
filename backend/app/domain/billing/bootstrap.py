"""Race-safe Free billing bootstrap for users and owner workspaces."""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config.billing import TIER_FREE
from app.domain.site_health.entitlements import resolve_entitlement
from app.models.billing import AccountEntitlement, BillingAccount, WorkspaceBillingLink
from app.models.user import User
from app.models.workspace import WorkspaceMember


async def ensure_user_billing(
    session: AsyncSession,
    user: User,
    *,
    workspace_ids: tuple[uuid.UUID, ...] | None = None,
) -> BillingAccount:
    """Ensure one account, Free entitlement, and links for owned workspaces.

    The caller owns the transaction boundary. PostgreSQL upserts make login
    repair and concurrent first requests idempotent without rolling back the
    caller's registration/workspace transaction.
    """
    await session.execute(
        pg_insert(BillingAccount)
        .values(owner_user_id=user.id)
        .on_conflict_do_nothing(index_elements=["owner_user_id"])
    )
    account = await session.scalar(
        select(BillingAccount).where(BillingAccount.owner_user_id == user.id)
    )
    if account is None:  # pragma: no cover - impossible after insert/select
        raise RuntimeError("billing account bootstrap failed")

    await session.execute(
        pg_insert(AccountEntitlement)
        .values(billing_account_id=account.id, tier_key=TIER_FREE)
        .on_conflict_do_nothing(index_elements=["billing_account_id"])
    )

    if workspace_ids is None:
        workspace_ids = tuple(
            (
                await session.scalars(
                    select(WorkspaceMember.workspace_id).where(
                        WorkspaceMember.user_id == user.id,
                        WorkspaceMember.role == "owner",
                    )
                )
            ).all()
        )

    for workspace_id in dict.fromkeys(workspace_ids):
        await session.execute(
            pg_insert(WorkspaceBillingLink)
            .values(workspace_id=workspace_id, billing_account_id=account.id)
            .on_conflict_do_nothing(index_elements=["workspace_id"])
        )
        await resolve_entitlement(session, workspace_id, default_capability=TIER_FREE)

    await session.flush()
    return account


async def user_billing_bootstrap_complete(session: AsyncSession, user: User) -> bool:
    """Cheap read-only guard for the common successful-login path."""
    account = await session.scalar(
        select(BillingAccount).where(BillingAccount.owner_user_id == user.id)
    )
    if account is None:
        return False
    entitlement_id = await session.scalar(
        select(AccountEntitlement.id).where(
            AccountEntitlement.billing_account_id == account.id
        )
    )
    if entitlement_id is None:
        return False
    owner_workspace_ids = set(
        (
            await session.scalars(
                select(WorkspaceMember.workspace_id).where(
                    WorkspaceMember.user_id == user.id,
                    WorkspaceMember.role == "owner",
                )
            )
        ).all()
    )
    linked_workspace_ids = set(
        (
            await session.scalars(
                select(WorkspaceBillingLink.workspace_id).where(
                    WorkspaceBillingLink.billing_account_id == account.id,
                    WorkspaceBillingLink.workspace_id.in_(owner_workspace_ids),
                )
            )
        ).all()
    )
    return owner_workspace_ids == linked_workspace_ids
