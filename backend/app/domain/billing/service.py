"""Billing catalog, checkout, account projection, and lifecycle service."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.connectors.billing.base import BillingProvider, BillingProviderError
from app.core.config.billing import (
    CATALOG_ENTRIES,
    RAZORPAY_STATUS_MAP,
    SUBSCRIPTION_ACTIVE,
    SUBSCRIPTION_CANCEL_SCHEDULED,
    SUBSCRIPTION_CANCELLED,
    SUBSCRIPTION_EXPIRED,
    SUBSCRIPTION_PAST_DUE,
    SUBSCRIPTION_UNPAID,
    TIER_FREE,
    TIER_PAID,
    billing_settings,
    quote_for_country,
)
from app.domain.billing.bootstrap import ensure_user_billing
from app.domain.billing.schemas import (
    BillingCatalogResponse,
    BillingSummaryResponse,
    CatalogPlanResponse,
    CheckoutResponse,
    PriceResponse,
)
from app.domain.entitlements.service import (
    expire_account_entitlement_if_needed,
    synchronize_sponsored_workspaces,
)
from app.models.billing import (
    AccountEntitlement,
    BillingAccount,
    BillingCheckoutAttempt,
    BillingSubscription,
)
from app.models.user import User


class BillingConflictError(ValueError):
    pass


class BillingUnavailableError(RuntimeError):
    pass


def catalog(country_code: str | None) -> BillingCatalogResponse:
    quote = quote_for_country(country_code)
    price = PriceResponse(
        region=quote.region,
        currency=quote.currency,
        base_amount_minor=quote.base_amount_minor,
        tax_amount_minor=quote.tax_amount_minor,
        total_amount_minor=quote.total_amount_minor,
        tax_label=quote.tax_label,
        checkout_available=quote.available,
    )
    plans: list[CatalogPlanResponse] = []
    for entry in CATALOG_ENTRIES:
        plans.append(
            CatalogPlanResponse(
                tier_key=entry.tier_key,
                name=entry.name,
                cadence=entry.cadence,
                self_serve=entry.self_serve,
                description=entry.description,
                features=list(entry.features),
                price=(
                    PriceResponse(
                        region="international",
                        currency="USD",
                        base_amount_minor=0,
                        tax_amount_minor=0,
                        total_amount_minor=0,
                        tax_label=None,
                        checkout_available=True,
                    )
                    if entry.tier_key == TIER_FREE
                    else price
                    if entry.tier_key == TIER_PAID
                    else None
                ),
            )
        )
    return BillingCatalogResponse(
        catalog_version=billing_settings.catalog_version,
        country_code=(country_code or "").strip().upper() or None,
        plans=plans,
    )


async def owned_account(session: AsyncSession, user: User) -> BillingAccount:
    account = await session.scalar(
        select(BillingAccount).where(BillingAccount.owner_user_id == user.id)
    )
    if account is None:
        account = await ensure_user_billing(session, user)
        await session.commit()
    return account


async def billing_summary(session: AsyncSession, user: User) -> BillingSummaryResponse:
    account = await owned_account(session, user)
    entitlement = await session.scalar(
        select(AccountEntitlement).where(
            AccountEntitlement.billing_account_id == account.id
        )
    )
    if entitlement is not None:
        entitlement = await expire_account_entitlement_if_needed(session, entitlement)
    subscription = await session.scalar(
        select(BillingSubscription).where(
            BillingSubscription.billing_account_id == account.id,
            BillingSubscription.is_current.is_(True),
        )
    )
    quote = quote_for_country(account.billing_country)
    reason: str | None = None
    if not account.billing_country:
        reason = "billing_country_required"
    elif subscription is not None:
        reason = "subscription_already_exists"
    elif not quote.available:
        reason = "checkout_not_enabled"
    return BillingSummaryResponse(
        billing_account_id=account.id,
        billing_country=account.billing_country,
        country_verification=account.country_verification,
        tier_key=entitlement.tier_key if entitlement is not None else TIER_FREE,
        subscription_status=subscription.status if subscription is not None else None,
        current_period_end=(
            subscription.current_period_end if subscription is not None else None
        ),
        cancel_at_period_end=(
            subscription.cancel_at_period_end if subscription is not None else False
        ),
        paid_through=entitlement.paid_through if entitlement is not None else None,
        grace_until=entitlement.grace_until if entitlement is not None else None,
        can_checkout=reason is None,
        checkout_block_reason=reason,
    )


async def update_country(
    session: AsyncSession, user: User, country_code: str
) -> BillingSummaryResponse:
    account = await owned_account(session, user)
    current = await session.scalar(
        select(BillingSubscription.id).where(
            BillingSubscription.billing_account_id == account.id,
            BillingSubscription.is_current.is_(True),
        )
    )
    if current is not None and account.billing_country != country_code:
        raise BillingConflictError("billing_country_locked_by_subscription")
    if account.billing_country != country_code:
        account.billing_country = country_code
        account.country_verification = "provisional"
    await session.commit()
    return await billing_summary(session, user)


async def create_checkout(
    session: AsyncSession,
    user: User,
    *,
    idempotency_key: str,
    provider: BillingProvider,
) -> CheckoutResponse:
    account = await owned_account(session, user)
    account = (
        await session.execute(
            select(BillingAccount)
            .where(BillingAccount.id == account.id)
            .with_for_update()
        )
    ).scalar_one()
    existing_attempt = await session.scalar(
        select(BillingCheckoutAttempt).where(
            BillingCheckoutAttempt.billing_account_id == account.id,
            BillingCheckoutAttempt.idempotency_key == idempotency_key,
        )
    )
    if existing_attempt is not None:
        if existing_attempt.status == "created" and existing_attempt.checkout_url:
            return CheckoutResponse(
                checkout_url=existing_attempt.checkout_url,
                expires_at=existing_attempt.expires_at,
            )
        raise BillingConflictError("checkout_already_in_progress")
    live_subscription = await session.scalar(
        select(BillingSubscription.id).where(
            BillingSubscription.billing_account_id == account.id,
            BillingSubscription.is_current.is_(True),
        )
    )
    if live_subscription is not None:
        raise BillingConflictError("subscription_already_exists")
    pending_attempt = await session.scalar(
        select(BillingCheckoutAttempt.id).where(
            BillingCheckoutAttempt.billing_account_id == account.id,
            BillingCheckoutAttempt.status.in_(("pending", "created", "unknown")),
            BillingCheckoutAttempt.expires_at > datetime.now(UTC),
        )
    )
    if pending_attempt is not None:
        raise BillingConflictError("checkout_already_in_progress")
    if not account.billing_country:
        raise BillingConflictError("billing_country_required")
    quote = quote_for_country(account.billing_country)
    if not quote.available:
        raise BillingUnavailableError("checkout_not_enabled")
    expires_at = datetime.now(UTC) + timedelta(
        minutes=billing_settings.checkout_expiry_minutes
    )
    attempt = BillingCheckoutAttempt(
        billing_account_id=account.id,
        currency=quote.currency,
        idempotency_key=idempotency_key,
        expires_at=expires_at,
    )
    session.add(attempt)
    await session.commit()  # reservation is durable before provider I/O
    try:
        hosted = await provider.create_subscription(
            plan_id=quote.provider_plan_id,
            attempt_id=str(attempt.id),
            billing_account_id=str(account.id),
        )
    except BillingProviderError:
        attempt.status = "unknown"
        await session.commit()
        raise
    subscription = BillingSubscription(
        billing_account_id=account.id,
        external_subscription_id=hosted.external_subscription_id,
        external_price_id=quote.provider_plan_id,
        currency=quote.currency,
        status=RAZORPAY_STATUS_MAP.get(hosted.status, "pending"),
    )
    session.add(subscription)
    attempt.status = "created"
    attempt.external_reference = hosted.external_subscription_id
    attempt.checkout_url = hosted.checkout_url
    await session.commit()
    return CheckoutResponse(checkout_url=hosted.checkout_url, expires_at=expires_at)


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
    """Apply an authoritative provider projection; return False when stale."""
    subscription = (
        await session.execute(
            select(BillingSubscription)
            .where(BillingSubscription.id == subscription.id)
            .with_for_update()
        )
    ).scalar_one()
    if updated_at and updated_at < subscription.provider_state_version:
        return False
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
    entitlement = (
        await session.execute(
            select(AccountEntitlement)
            .where(
                AccountEntitlement.billing_account_id == subscription.billing_account_id
            )
            .with_for_update()
        )
    ).scalar_one()
    now = datetime.now(UTC)
    paid_through = subscription.current_period_end
    should_pay = normalized in {SUBSCRIPTION_ACTIVE, SUBSCRIPTION_CANCEL_SCHEDULED}
    if normalized == SUBSCRIPTION_CANCELLED:
        should_pay = paid_through is not None and paid_through > now
    if normalized in {SUBSCRIPTION_PAST_DUE, SUBSCRIPTION_UNPAID}:
        if entitlement.tier_key == TIER_PAID and entitlement.grace_until is None:
            entitlement.grace_until = now + timedelta(
                days=billing_settings.past_due_grace_days
            )
        should_pay = bool(entitlement.grace_until and entitlement.grace_until > now)
    else:
        entitlement.grace_until = None
    entitlement.tier_key = TIER_PAID if should_pay else TIER_FREE
    entitlement.source_subscription_id = subscription.id
    entitlement.paid_through = paid_through
    entitlement.capability_revision += 1
    if normalized in {SUBSCRIPTION_CANCELLED, SUBSCRIPTION_EXPIRED} and not should_pay:
        subscription.is_current = False
        subscription.ended_at = now
    await synchronize_sponsored_workspaces(session, entitlement)
    await session.flush()
    return True


async def cancel_current_subscription(
    session: AsyncSession, user: User, provider: BillingProvider
) -> tuple[str, bool]:
    account = await owned_account(session, user)
    subscription = await session.scalar(
        select(BillingSubscription).where(
            BillingSubscription.billing_account_id == account.id,
            BillingSubscription.is_current.is_(True),
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
