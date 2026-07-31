"""Billing account access and subscription lifecycle projection.

The lifecycle projector replaces the old entitlement-projection mutation:
every accepted base/add-on provider event projects subscription fields,
transactionally bumps the owning account's ``entitlement_lifecycle_version``
(the cross-process entitlement invalidator), issues the period's plan/add-on
grant bundle once (deterministic idempotency key, provider-authoritative
states only — never ``trialing``), and writes effective revocations on
immediate terminal loss. Cancellation at period end leaves current grants to
their natural end and prevents the next bundle; base cancellation still bumps
the account version because moving top-up effective expiry changes even when
no grant row changes.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.connectors.billing.base import BillingProvider
from app.core.config.billing import (
    RAZORPAY_STATUS_MAP,
    SUBSCRIPTION_ACTIVE,
    SUBSCRIPTION_CANCEL_SCHEDULED,
    SUBSCRIPTION_CANCELLED,
    SUBSCRIPTION_EXPIRED,
    SUBSCRIPTION_KIND_ADDON,
    SUBSCRIPTION_KIND_BASE,
    billing_settings,
    plan_period_grant_specs,
)
from app.core.config.entitlements import GRANT_SOURCE_ADDON, GRANT_SOURCE_PLAN
from app.domain.billing.bootstrap import ensure_user_billing
from app.domain.entitlements.grants import issue_grant_bundle, revoke_grants
from app.domain.entitlements.service import refresh_site_health_runtime_for_account
from app.domain.entitlements.types import GrantSpec
from app.models.billing import (
    AccountGrant,
    BillingAccount,
    BillingSubscription,
)
from app.models.user import User

# Provider-authoritative states that fund the current period's grant bundle.
# ``trialing`` is deliberately NOT grant authority in PR1.
_GRANT_AUTHORITY_STATUSES = frozenset(
    {SUBSCRIPTION_ACTIVE, SUBSCRIPTION_CANCEL_SCHEDULED}
)
_TERMINAL_STATUSES = frozenset({SUBSCRIPTION_CANCELLED, SUBSCRIPTION_EXPIRED})


class BillingConflictError(ValueError):
    pass


@dataclass(frozen=True, slots=True)
class SubscriptionEvent:
    """One accepted provider lifecycle projection."""

    status: str
    period_start: datetime | None
    period_end: datetime | None
    updated_at: int


def accept_subscription_event(
    subscription: BillingSubscription,
    *,
    provider_status: str,
    current_start: int | None,
    current_end: int | None,
    updated_at: int,
    cancel_at_period_end: bool,
) -> SubscriptionEvent | None:
    """Reject stale provider versions and project status/period fields.

    Returns None for a stale event (``provider_state_version`` rejects stale
    events for this subscription only — it is not a cross-process entitlement
    invalidator). Same-status events with a newer provider version are
    accepted and projected.
    """
    if updated_at and updated_at < subscription.provider_state_version:
        return None
    normalized = RAZORPAY_STATUS_MAP.get(provider_status)
    if normalized is None:
        raise BillingConflictError("unsupported_subscription_status")
    if cancel_at_period_end and normalized == SUBSCRIPTION_ACTIVE:
        normalized = SUBSCRIPTION_CANCEL_SCHEDULED
    subscription.status = normalized
    subscription.current_period_start = _timestamp(current_start)
    subscription.current_period_end = _timestamp(current_end)
    subscription.cancel_at_period_end = cancel_at_period_end
    subscription.provider_state_version = max(
        subscription.provider_state_version, updated_at
    )
    return SubscriptionEvent(
        status=normalized,
        period_start=subscription.current_period_start,
        period_end=subscription.current_period_end,
        updated_at=updated_at,
    )


def _apply_terminal_state(
    subscription: BillingSubscription, event: SubscriptionEvent, now: datetime
) -> bool:
    """Set ``is_current``/``ended_at`` on immediate terminal loss."""
    if event.status not in _TERMINAL_STATUSES:
        return False
    if event.period_end is not None and event.period_end > now:
        # Cancelled at period end: access continues to the natural end.
        return False
    subscription.is_current = False
    subscription.ended_at = now
    return True


async def _bump_account_entitlement_version(
    session: AsyncSession, account_id: uuid.UUID
) -> None:
    account = (
        await session.execute(
            select(BillingAccount)
            .where(BillingAccount.id == account_id)
            .with_for_update()
        )
    ).scalar_one()
    account.entitlement_lifecycle_version += 1


async def _issue_period_bundle(
    session: AsyncSession,
    subscription: BillingSubscription,
    event: SubscriptionEvent,
) -> None:
    """Issue the period's plan/add-on bundle once (idempotent, append-only).

    Only provider-authoritative active/charged states issue; old period
    grants are never rewritten (a replayed event resolves to the same
    deterministic idempotency key and is safely suppressed).
    """
    if event.status not in _GRANT_AUTHORITY_STATUSES:
        return
    if event.period_start is None:
        return
    templates = plan_period_grant_specs(
        subscription.catalog_key, billing_settings.catalog_version
    )
    if not templates:
        return
    period_start_key = event.period_start.isoformat()
    await issue_grant_bundle(
        session,
        account_id=subscription.billing_account_id,
        source_kind=(
            GRANT_SOURCE_ADDON
            if subscription.subscription_kind == SUBSCRIPTION_KIND_ADDON
            else GRANT_SOURCE_PLAN
        ),
        source_ref=f"subscription:{subscription.id}",
        grants=tuple(GrantSpec(key=key, value=value) for key, value in templates),
        catalog_revision=billing_settings.catalog_version,
        idempotency_key=(
            f"sub:{subscription.id}:{period_start_key}:"
            f"{billing_settings.catalog_version}"
        ),
        valid_from=event.period_start,
        valid_until=event.period_end,
        period_start=event.period_start,
        period_end=event.period_end,
    )


async def _write_terminal_revocations(
    session: AsyncSession,
    subscription: BillingSubscription,
    event: SubscriptionEvent,
    now: datetime,
) -> None:
    """Revoke this subscription's grants whose natural end is still future.

    Immediate terminal loss ends access before the grant's natural period
    end; cancellation at period end (``is_current`` kept) never reaches here.
    """
    grants = (
        (
            await session.execute(
                select(AccountGrant).where(
                    AccountGrant.billing_account_id
                    == subscription.billing_account_id,
                    AccountGrant.source_ref == f"subscription:{subscription.id}",
                )
            )
        )
        .scalars()
        .all()
    )
    revocable = tuple(
        grant.id
        for grant in grants
        if grant.period_end is None or grant.period_end > now
    )
    if not revocable:
        return
    await revoke_grants(
        session,
        grant_ids=revocable,
        effective_from=now,
        reason="subscription_ended",
        actor_kind="system",
        actor_user_id=None,
        # Keyed by the logical event (not the per-call clock) so a redelivered
        # terminal webhook hits revoke_grants' duplicate-suppression branch
        # instead of appending a second set of revocation rows.
        idempotency_key=f"sub:{subscription.id}:terminal:{event.updated_at}",
    )


async def apply_subscription_state(
    session: AsyncSession,
    subscription: BillingSubscription,
    *,
    provider_status: str,
    current_start: int | None,
    current_end: int | None,
    updated_at: int,
    cancel_at_period_end: bool,
) -> bool:
    """Apply an authoritative provider projection; return False when stale.

    Orchestrator only: event acceptance/projection, terminal handling, the
    account-version bump, period bundle issuance, and terminal revocations
    are extracted and separately tested.
    """
    subscription = (
        await session.execute(
            select(BillingSubscription)
            .where(BillingSubscription.id == subscription.id)
            .with_for_update()
        )
    ).scalar_one()
    event = accept_subscription_event(
        subscription,
        provider_status=provider_status,
        current_start=current_start,
        current_end=current_end,
        updated_at=updated_at,
        cancel_at_period_end=cancel_at_period_end,
    )
    if event is None:
        return False
    now = datetime.now(UTC)
    terminal = _apply_terminal_state(subscription, event, now)
    await _bump_account_entitlement_version(
        session, subscription.billing_account_id
    )
    await _issue_period_bundle(session, subscription, event)
    if terminal:
        await _write_terminal_revocations(session, subscription, event, now)
    # Synchronous Site Health re-projection on every accepted lifecycle event
    # (a lost allowance must reach the worker analyze guard's runtime row
    # without waiting for a lazy planner/selection read).
    await refresh_site_health_runtime_for_account(
        session, account_id=subscription.billing_account_id, at=now
    )
    await session.flush()
    return True


async def owned_account(session: AsyncSession, user: User) -> BillingAccount:
    account = await session.scalar(
        select(BillingAccount).where(BillingAccount.owner_user_id == user.id)
    )
    if account is None:
        account = await ensure_user_billing(session, user)
        await session.commit()
    return account


async def cancel_current_subscription(
    session: AsyncSession, user: User, provider: BillingProvider
) -> tuple[str, bool]:
    account = await owned_account(session, user)
    subscription = await session.scalar(
        select(BillingSubscription).where(
            BillingSubscription.billing_account_id == account.id,
            BillingSubscription.is_current.is_(True),
            BillingSubscription.subscription_kind == SUBSCRIPTION_KIND_BASE,
        )
    )
    if subscription is None:
        raise BillingConflictError("no_current_subscription")
    if subscription.cancel_at_period_end:
        return subscription.status, True
    result = await provider.cancel_subscription(
        subscription.external_subscription_id, at_cycle_end=True
    )
    await apply_subscription_state(
        session,
        subscription,
        provider_status=result.status,
        current_start=result.current_start,
        current_end=result.current_end,
        updated_at=result.updated_at,
        cancel_at_period_end=True,
    )
    await session.commit()
    return subscription.status, True


def _timestamp(value: int | None) -> datetime | None:
    return datetime.fromtimestamp(value, tz=UTC) if value is not None else None


__all__ = [
    "BillingConflictError",
    "SubscriptionEvent",
    "accept_subscription_event",
    "apply_subscription_state",
    "cancel_current_subscription",
    "owned_account",
]
