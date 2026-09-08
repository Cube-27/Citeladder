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

import logging
import uuid
from dataclasses import dataclass, replace
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.connectors.billing.base import BillingProvider
from app.core.config.billing_catalog import plan_checkout_availability
from app.core.config.billing_contracts import (
    ACTIVATION_KIND_ADDON,
    ACTIVATION_KIND_BASE,
    ACTIVATION_PENDING,
    CANCELLATION_ALREADY_SCHEDULED,
    CANCELLATION_SCHEDULED,
    COUNTRY_VERIFICATION_DECLARED,
    LIVE_SUBSCRIPTION_STATUSES,
    RAZORPAY_STATUS_MAP,
    REASON_BASE_SUBSCRIPTION_REQUIRED,
    REASON_NO_CURRENT_SUBSCRIPTION,
    SUBSCRIPTION_ACTIVE,
    SUBSCRIPTION_CANCEL_SCHEDULED,
    SUBSCRIPTION_CANCELLED,
    SUBSCRIPTION_EXPIRED,
    SUBSCRIPTION_KIND_ADDON,
    SUBSCRIPTION_KIND_BASE,
)
from app.core.config.billing_tax import BillingIdentity
from app.core.config.entitlements import (
    CapabilityType,
)
from app.domain.billing import quotes as _quotes
from app.domain.billing.bootstrap import ensure_user_billing
from app.domain.billing.catalog_revisions import published_commercial_catalog
from app.domain.billing.periods import (
    PeriodEvidenceError,
    issue_period_bundle,
    verified_paid_end,
)
from app.domain.billing.quotes import (
    BillingConflictError,
    ResolvedIntent,
    resolve_quote,
)
from app.domain.entitlements.grants import revoke_grants
from app.domain.entitlements.service import (
    refresh_site_health_runtime_for_account,
)
from app.models.billing import (
    AccountGrant,
    BillingAccount,
    BillingSubscription,
    PendingActivation,
)
from app.models.user import User

logger = logging.getLogger("app.billing")
_TERMINAL_STATUSES = frozenset({SUBSCRIPTION_CANCELLED, SUBSCRIPTION_EXPIRED})
# Counter capability types the usage read projects.
_COUNTER_TYPES = frozenset(
    {
        CapabilityType.COUNTER_CONSUMABLE,
        CapabilityType.COUNTER_OCCUPANCY,
        CapabilityType.COUNTER_RATE,
    }
)


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
    if subscription.status in _TERMINAL_STATUSES:
        return _expired_terminal_event(subscription, updated_at)
    if (
        current_start
        and subscription.current_period_start
        and current_start < int(subscription.current_period_start.timestamp())
    ):
        return None
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


def _expired_terminal_event(
    subscription: BillingSubscription, updated_at: int
) -> SubscriptionEvent | None:
    end = subscription.current_period_end
    if not subscription.is_current or end is None or end > datetime.now(UTC):
        return None
    # Release the paid-time slot at expiry, without accepting a stale active
    # provider projection that could resurrect a terminal subscription.
    return SubscriptionEvent(
        status=subscription.status,
        period_start=subscription.current_period_start,
        period_end=end,
        updated_at=max(subscription.provider_state_version, updated_at),
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
                    AccountGrant.billing_account_id == subscription.billing_account_id,
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
    if event.status in _TERMINAL_STATUSES:
        paid_end = await verified_paid_end(session, subscription, at=now)
        if paid_end is not None:
            subscription.current_period_end = paid_end
            event = replace(event, period_end=paid_end)
    terminal = _apply_terminal_state(subscription, event, now)
    await _bump_account_entitlement_version(session, subscription.billing_account_id)
    try:
        await issue_period_bundle(
            session,
            subscription=subscription,
            status=event.status,
            period_start=event.period_start,
            period_end=event.period_end,
        )
    except PeriodEvidenceError as exc:
        raise BillingConflictError(str(exc)) from exc
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
    # Also idempotently applies the current public/dev baseline so an account
    # created before the policy shipped is repaired on its next entitlement read.
    account = await ensure_user_billing(session, user)
    await session.commit()
    return account


def _timestamp(value: int | None) -> datetime | None:
    return datetime.fromtimestamp(value, tz=UTC) if value is not None else None


async def resolve_base_intent(
    session: AsyncSession,
    *,
    catalog_key: str,
    credential_mode: str,
    country_code: str,
    billing_identity: BillingIdentity,
    at: datetime,
) -> ResolvedIntent:
    """Compatibility seam retaining the historical service import path."""
    return await _quotes.resolve_base_intent(
        session,
        catalog_key=catalog_key,
        credential_mode=credential_mode,
        country_code=country_code,
        billing_identity=billing_identity,
        at=at,
        _catalog_loader=published_commercial_catalog,
        _checkout_availability=plan_checkout_availability,
    )


async def resolve_addon_intent(
    session: AsyncSession,
    *,
    catalog_key: str,
    quantity: int,
    country_code: str,
    at: datetime,
    billing_identity: BillingIdentity | None = None,
) -> ResolvedIntent:
    """Compatibility seam retaining the historical service import path."""
    return await _quotes.resolve_addon_intent(
        session,
        catalog_key=catalog_key,
        quantity=quantity,
        country_code=country_code,
        at=at,
        billing_identity=billing_identity,
        _catalog_loader=published_commercial_catalog,
    )


async def resolve_topup_intent(
    session: AsyncSession,
    *,
    catalog_key: str,
    quantity: int,
    country_code: str,
    at: datetime,
    billing_identity: BillingIdentity | None = None,
) -> ResolvedIntent:
    """Compatibility seam retaining the historical service import path."""
    return await _quotes.resolve_topup_intent(
        session,
        catalog_key=catalog_key,
        quantity=quantity,
        country_code=country_code,
        at=at,
        billing_identity=billing_identity,
        _catalog_loader=published_commercial_catalog,
    )


async def current_base_subscription(
    session: AsyncSession, account_id: uuid.UUID
) -> BillingSubscription | None:
    """The account's current base subscription (read-only; commits nothing)."""
    return await session.scalar(
        select(BillingSubscription).where(
            BillingSubscription.billing_account_id == account_id,
            BillingSubscription.is_current.is_(True),
            BillingSubscription.subscription_kind == SUBSCRIPTION_KIND_BASE,
        )
    )


async def current_addon_subscription(
    session: AsyncSession, account_id: uuid.UUID, catalog_key: str
) -> BillingSubscription | None:
    return await session.scalar(
        select(BillingSubscription).where(
            BillingSubscription.billing_account_id == account_id,
            BillingSubscription.is_current.is_(True),
            BillingSubscription.subscription_kind == SUBSCRIPTION_KIND_ADDON,
            BillingSubscription.catalog_key == catalog_key,
        )
    )


async def pending_base_activation(
    session: AsyncSession, account_id: uuid.UUID
) -> PendingActivation | None:
    """The account's UNSETTLED base intent, if one holds the one-base slot.

    A committed ``pending`` row blocks a second base purchase until
    reconciliation settles/abandons it (transitions out of ``pending`` free
    the slot); the partial unique index is the final concurrent-insert guard.
    """
    return await session.scalar(
        select(PendingActivation).where(
            PendingActivation.billing_account_id == account_id,
            PendingActivation.activation_kind == ACTIVATION_KIND_BASE,
            PendingActivation.status == ACTIVATION_PENDING,
        )
    )


async def pending_addon_activation(
    session: AsyncSession, account_id: uuid.UUID, catalog_key: str
) -> PendingActivation | None:
    """The UNSETTLED add-on intent for (account, key), if one holds the slot."""
    return await session.scalar(
        select(PendingActivation).where(
            PendingActivation.billing_account_id == account_id,
            PendingActivation.activation_kind == ACTIVATION_KIND_ADDON,
            PendingActivation.catalog_key == catalog_key,
            PendingActivation.status == ACTIVATION_PENDING,
        )
    )


async def live_base_subscription(
    session: AsyncSession, account_id: uuid.UUID
) -> BillingSubscription:
    """The account's LIVE base subscription or a safe conflict.

    A top-up funds nothing without a readable live base subscription, so the
    purchase is refused before any provider I/O.
    """
    subscription = await current_base_subscription(session, account_id)
    if subscription is None or subscription.status not in LIVE_SUBSCRIPTION_STATUSES:
        raise BillingConflictError(REASON_BASE_SUBSCRIPTION_REQUIRED)
    return subscription


def persist_billing_country(account: BillingAccount, country_code: str) -> None:
    """LOCK the submitted ISO country on the account (single owner).

    ``/billing/profile`` is deleted, so the base purchase is the only writer of
    the persisted billing country.
    """
    account.billing_country = country_code
    account.country_verification = COUNTRY_VERIFICATION_DECLARED


def persist_billing_profile(
    account: BillingAccount, country_code: str, identity: BillingIdentity
) -> None:
    """Persist normalized current facts while every intent keeps its snapshot."""
    persist_billing_country(account, country_code)
    account.billing_profile = identity.snapshot()


async def _schedule_cancellation(
    session: AsyncSession,
    provider: BillingProvider,
    subscription: BillingSubscription,
) -> tuple[str, datetime]:
    """Ask the provider to cancel at cycle end and project the result.

    A subscription already scheduled is reported as ``already_scheduled``
    without a second provider call; current grant rows are never touched —
    period-end revocation is the natural end of the issued period and no next
    bundle is issued once cancellation is scheduled.
    """
    effective_at = subscription.current_period_end or datetime.now(UTC)
    if subscription.cancel_at_period_end:
        return CANCELLATION_ALREADY_SCHEDULED, effective_at
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
    return CANCELLATION_SCHEDULED, subscription.current_period_end or effective_at


async def schedule_base_cancellation(
    session: AsyncSession,
    provider: BillingProvider,
    *,
    account_id: uuid.UUID,
) -> tuple[str, str, datetime]:
    """Schedule the current base subscription's period-end cancellation."""
    subscription = await current_base_subscription(session, account_id)
    if subscription is None:
        raise BillingConflictError(REASON_NO_CURRENT_SUBSCRIPTION)
    catalog_key = subscription.catalog_key
    status, effective_at = await _schedule_cancellation(session, provider, subscription)
    return catalog_key, status, effective_at


async def schedule_addon_cancellation(
    session: AsyncSession,
    provider: BillingProvider,
    *,
    account_id: uuid.UUID,
    catalog_key: str,
) -> tuple[str, datetime]:
    """Schedule one add-on's period-end cancellation."""
    subscription = await current_addon_subscription(session, account_id, catalog_key)
    if subscription is None:
        raise BillingConflictError(REASON_NO_CURRENT_SUBSCRIPTION)
    return await _schedule_cancellation(session, provider, subscription)


__all__ = [
    "BillingConflictError",
    "ResolvedIntent",
    "SubscriptionEvent",
    "accept_subscription_event",
    "apply_subscription_state",
    "current_addon_subscription",
    "current_base_subscription",
    "live_base_subscription",
    "owned_account",
    "persist_billing_country",
    "persist_billing_profile",
    "resolve_addon_intent",
    "resolve_base_intent",
    "resolve_quote",
    "resolve_topup_intent",
    "schedule_addon_cancellation",
    "schedule_base_cancellation",
]
