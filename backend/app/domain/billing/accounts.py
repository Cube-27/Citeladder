"""The ONE workspace -> billing account resolver (plan §2.1).

Every entitlement, usage, billing-profile, quote, receipt and subscription
operation resolves its account through here. There is no second ownership
mechanism: ``BillingAccount.workspace_id`` is the relationship, and
``owner_user_id`` is audit metadata that never selects a payer or authorizes a
read.

A workspace with no account row is *unresolved* — no capability — rather than
a default free profile, so a provisioning gap fails closed instead of quietly
granting access.
"""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.billing import BillingAccount


class BillingAccountMissingError(LookupError):
    """The workspace has no billing account (a provisioning defect)."""

    def __init__(self, workspace_id: uuid.UUID) -> None:
        super().__init__("workspace_billing_account_missing")
        self.workspace_id = workspace_id


async def billing_account_for(
    session: AsyncSession, workspace_id: uuid.UUID
) -> BillingAccount | None:
    """The workspace's billing account, or ``None`` when it has none."""
    return await session.scalar(
        select(BillingAccount).where(BillingAccount.workspace_id == workspace_id)
    )


async def billing_account_id_for(
    session: AsyncSession, workspace_id: uuid.UUID
) -> uuid.UUID | None:
    """The workspace's billing account id, or ``None``.

    The id-only form for callers that just need to scope a query; it avoids
    loading the account row into the identity map on a hot read path.
    """
    return await session.scalar(
        select(BillingAccount.id).where(BillingAccount.workspace_id == workspace_id)
    )


async def require_billing_account(
    session: AsyncSession, workspace_id: uuid.UUID
) -> BillingAccount:
    """The workspace's billing account or :class:`BillingAccountMissingError`."""
    account = await billing_account_for(session, workspace_id)
    if account is None:
        raise BillingAccountMissingError(workspace_id)
    return account


async def workspace_id_for_account(
    session: AsyncSession, account_id: uuid.UUID
) -> uuid.UUID | None:
    """The single workspace an account bills for (the inverse direction)."""
    return await session.scalar(
        select(BillingAccount.workspace_id).where(BillingAccount.id == account_id)
    )


__all__ = [
    "BillingAccountMissingError",
    "billing_account_for",
    "billing_account_id_for",
    "require_billing_account",
    "workspace_id_for_account",
]
