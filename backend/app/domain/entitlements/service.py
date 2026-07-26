"""Resolve and synchronize sponsored workspace capabilities."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config.billing import (
    SUBSCRIPTION_CANCEL_SCHEDULED,
    SUBSCRIPTION_CANCELLED,
    SUBSCRIPTION_PAST_DUE,
    SUBSCRIPTION_UNPAID,
    TIER_FREE,
    TIER_PAID,
    capability_profile,
)
from app.domain.billing.schemas import WorkspaceEntitlementResponse
from app.domain.site_health.entitlements import set_entitlement
from app.models.billing import (
    AccountEntitlement,
    BillingSubscription,
    WorkspaceBillingLink,
)


async def resolve_workspace_entitlement(
    session: AsyncSession, workspace_id: uuid.UUID
) -> WorkspaceEntitlementResponse:
    row = (
        await session.execute(
            select(AccountEntitlement)
            .join(
                WorkspaceBillingLink,
                WorkspaceBillingLink.billing_account_id
                == AccountEntitlement.billing_account_id,
            )
            .where(WorkspaceBillingLink.workspace_id == workspace_id)
        )
    ).scalar_one_or_none()
    if row is not None:
        row, expired = await expire_account_entitlement_if_needed(session, row)
        if expired:
            await session.commit()
    tier_key = row.tier_key if row is not None else TIER_FREE
    profile = capability_profile(tier_key)
    return WorkspaceEntitlementResponse(
        workspace_id=workspace_id,
        tier_key=profile.tier_key,
        capability_revision=row.capability_revision if row is not None else 0,
        audit_web_search=profile.audit_web_search,
        audit_scheduling=profile.audit_scheduling,
        site_health_capability=profile.site_health_capability,
        paid_through=row.paid_through if row is not None else None,
        grace_until=row.grace_until if row is not None else None,
    )


async def expire_account_entitlement_if_needed(
    session: AsyncSession, entitlement: AccountEntitlement
) -> tuple[AccountEntitlement, bool]:
    """Fail closed when a verified grace/paid-through window has elapsed."""
    if entitlement.tier_key != TIER_PAID:
        return entitlement, False
    locked = (
        await session.execute(
            select(AccountEntitlement)
            .where(AccountEntitlement.id == entitlement.id)
            .with_for_update()
        )
    ).scalar_one()
    subscription = (
        await session.get(BillingSubscription, locked.source_subscription_id)
        if locked.source_subscription_id is not None
        else None
    )
    now = datetime.now(UTC)
    grace_elapsed = (
        subscription is not None
        and subscription.status in {SUBSCRIPTION_PAST_DUE, SUBSCRIPTION_UNPAID}
        and locked.grace_until is not None
        and locked.grace_until <= now
    )
    paid_window_elapsed = (
        subscription is not None
        and subscription.status
        in {SUBSCRIPTION_CANCEL_SCHEDULED, SUBSCRIPTION_CANCELLED}
        and locked.paid_through is not None
        and locked.paid_through <= now
    )
    if not grace_elapsed and not paid_window_elapsed:
        return locked, False
    locked.tier_key = TIER_FREE
    locked.grace_until = None
    locked.capability_revision += 1
    if subscription is not None:
        subscription.is_current = False
        subscription.ended_at = now
    await synchronize_sponsored_workspaces(session, locked)
    await session.flush()
    return locked, True


async def synchronize_sponsored_workspaces(
    session: AsyncSession, entitlement: AccountEntitlement
) -> None:
    profile = capability_profile(entitlement.tier_key)
    workspace_ids = (
        await session.scalars(
            select(WorkspaceBillingLink.workspace_id).where(
                WorkspaceBillingLink.billing_account_id
                == entitlement.billing_account_id
            )
        )
    ).all()
    for workspace_id in workspace_ids:
        await set_entitlement(session, workspace_id, profile.site_health_capability)
