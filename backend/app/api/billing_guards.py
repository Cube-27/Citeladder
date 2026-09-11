"""Server-owned state guards and provider calls for the billing routes.

Extracted from ``api/billing.py`` so the route module stays under the
repository's size ceiling; the rules themselves are unchanged.

Every provider argument built here comes from the SERVER-resolved
quote/intent: a browser can submit only a catalog key, a quantity, a
credential mode, and an ISO country — never an amount, a currency, or a
provider reference (invariant 6).
"""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.connectors.billing.base import (
    BillingProvider,
    HostedPayment,
    HostedSubscription,
)
from app.core.config.billing_contracts import (
    LIVE_SUBSCRIPTION_STATUSES,
    REASON_ADDON_EXISTS,
    REASON_ADDON_PENDING,
    REASON_SUBSCRIPTION_EXISTS,
    REASON_SUBSCRIPTION_PENDING,
)
from app.core.config.billing_tax import BillingIdentity, TaxPolicyError
from app.domain.billing.idempotency import ProviderCall, provider_metadata
from app.domain.billing.service import (
    BillingConflictError,
    ResolvedIntent,
    current_addon_subscription,
    current_base_subscription,
    live_base_subscription,
    pending_addon_activation,
    pending_base_activation,
)
from app.models.billing import BillingAccount, PendingActivation


def purchase_country(account: BillingAccount) -> str:
    """The ISO country an add-on/top-up is priced for.

    Only the base purchase carries a country, so it is the single writer of the
    persisted account country; every later purchase re-resolves the region from
    that locked value server-side.
    """
    return account.billing_country


def purchase_identity(account: BillingAccount) -> BillingIdentity:
    """Restore normalized facts for later add-on/top-up tax decisions."""
    if account.billing_profile is None:
        raise BillingConflictError("checkout_unavailable")
    try:
        return BillingIdentity.from_snapshot(account.billing_profile)
    except TaxPolicyError as exc:
        raise BillingConflictError("checkout_unavailable") from exc


async def _reject_live_base(session: AsyncSession, account: BillingAccount) -> None:
    """Refuse a second base purchase while one is LIVE."""
    subscription = await current_base_subscription(session, account.id)
    if subscription is not None and subscription.status in LIVE_SUBSCRIPTION_STATUSES:
        raise BillingConflictError(REASON_SUBSCRIPTION_EXISTS)


async def _reject_unsettled_base(
    session: AsyncSession, account: BillingAccount
) -> None:
    """Refuse a base purchase while an earlier intent is still SETTLING.

    A committed ``pending`` base holds the one-base slot exactly as a live
    subscription does — otherwise two different-key intents both reach the
    provider. The partial unique index stays the final TOCTOU guard inside
    the intent commit.
    """
    if await pending_base_activation(session, account.id) is not None:
        raise BillingConflictError(REASON_SUBSCRIPTION_PENDING)


async def reject_existing_base(session: AsyncSession, account: BillingAccount) -> None:
    """Refuse a second base purchase while one is live OR still settling."""
    await _reject_live_base(session, account)
    await _reject_unsettled_base(session, account)


async def _reject_live_addon(
    session: AsyncSession, account: BillingAccount, catalog_key: str
) -> None:
    """Refuse a duplicate add-on while one is LIVE (quantity changes are a
    separate, later operation).
    """
    subscription = await current_addon_subscription(session, account.id, catalog_key)
    if subscription is not None and subscription.status in LIVE_SUBSCRIPTION_STATUSES:
        raise BillingConflictError(REASON_ADDON_EXISTS)


async def _reject_unsettled_addon(
    session: AsyncSession, account: BillingAccount, catalog_key: str
) -> None:
    """Refuse an add-on intent while an earlier one for the SAME (account,
    catalog_key) is still settling; other add-on keys and top-ups are
    unaffected.
    """
    if await pending_addon_activation(session, account.id, catalog_key) is not None:
        raise BillingConflictError(REASON_ADDON_PENDING)


async def reject_existing_addon(
    session: AsyncSession, account: BillingAccount, catalog_key: str
) -> None:
    """Refuse a duplicate add-on while one is live OR still settling."""
    await _reject_live_addon(session, account, catalog_key)
    await _reject_unsettled_addon(session, account, catalog_key)


async def require_live_base(session: AsyncSession, account: BillingAccount) -> None:
    """A top-up requires a readable LIVE base subscription (checked twice: here
    before provider I/O, and again inside the activation transaction).
    """
    await live_base_subscription(session, account.id)


def base_provider_call(
    provider: BillingProvider, intent: ResolvedIntent
) -> ProviderCall:
    """Create the hosted base subscription from the SERVER-resolved price ref.

    Trial checkout is deferred, so ``trial_days`` is always None here.
    """

    async def call(pending: PendingActivation) -> HostedSubscription:
        return await provider.create_base_subscription(
            price_ref=intent.price_ref,
            intent_id=str(pending.id),
            account_ref=str(pending.billing_account_id),
            trial_days=None,
            metadata=provider_metadata(pending),
        )

    return call


def addon_provider_call(
    provider: BillingProvider, intent: ResolvedIntent
) -> ProviderCall:
    async def call(pending: PendingActivation) -> HostedSubscription:
        return await provider.create_addon_subscription(
            price_ref=intent.price_ref,
            quantity=pending.quantity,
            intent_id=str(pending.id),
            account_ref=str(pending.billing_account_id),
            metadata=provider_metadata(pending),
        )

    return call


def topup_provider_call(
    provider: BillingProvider, intent: ResolvedIntent
) -> ProviderCall:
    """Charge exactly the server-resolved total (base + credit + tax)."""
    total = intent.quote.total_price

    async def call(pending: PendingActivation) -> HostedPayment:
        return await provider.create_one_time_payment(
            amount_minor=total.amount_minor,
            currency=total.currency,
            intent_id=str(pending.id),
            account_ref=str(pending.billing_account_id),
            metadata=provider_metadata(pending),
        )

    return call


__all__ = [
    "addon_provider_call",
    "base_provider_call",
    "purchase_country",
    "purchase_identity",
    "reject_existing_addon",
    "reject_existing_base",
    "require_live_base",
    "topup_provider_call",
]
