"""Server-owned state guards and provider calls for the billing routes.

Extracted from ``api/billing.py`` so the route module stays under the
repository's size ceiling; the rules themselves are unchanged.

Every provider argument built here comes from the SERVER-resolved
quote/intent: a browser can submit only a catalog key, a quantity, a
credential mode, and an ISO country — never an amount, a currency, or a
provider reference (invariant 6).
"""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
from typing import Annotated

from fastapi import Depends, Header, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.connectors.billing.base import (
    BillingProvider,
    BillingProviderError,
    HostedPayment,
    HostedSubscription,
)
from app.connectors.billing.registry import ProviderUnavailableError
from app.core.config.billing_contracts import (
    LIVE_SUBSCRIPTION_STATUSES,
    REASON_ADDON_PENDING,
    REASON_CHECKOUT_UNAVAILABLE,
    REASON_SUBSCRIPTION_EXISTS,
    REASON_SUBSCRIPTION_PENDING,
)
from app.core.config.billing_tax import BillingIdentity, TaxPolicyError
from app.core.http_errors import raise_api_error
from app.domain.billing.catalog_revisions import CatalogUnavailableError
from app.domain.billing.commercial_journeys import IntroductoryAccessError
from app.domain.billing.idempotency import (
    IdempotencyConflictError,
    ProviderCall,
    TrialUnavailableError,
    provider_metadata,
    validate_idempotency_key,
)
from app.domain.billing.service import (
    BillingConflictError,
    ResolvedIntent,
    current_base_subscription,
    live_base_subscription,
    pending_addon_activation,
    pending_base_activation,
)
from app.models.billing import BillingAccount, PendingActivation


def require_idempotency_key(
    idempotency_key: Annotated[str | None, Header(alias="Idempotency-Key")] = None,
) -> str:
    """Require a well-formed ``Idempotency-Key`` on every commercial mutation.

    A missing or malformed key REJECTS with 400: without it a browser retry
    could double-charge.
    """
    try:
        return validate_idempotency_key(idempotency_key)
    except ValueError as exc:
        raise_api_error(400, str(exc), cause=exc)


IdempotencyKey = Annotated[str, Depends(require_idempotency_key)]


@contextmanager
def safe_commercial_errors() -> Iterator[None]:
    """Map domain refusals onto safe HTTP statuses (never a provider message)."""
    try:
        yield
    except ProviderUnavailableError as exc:
        # No provider is configured, or not in this record's environment. That
        # is a commercial refusal the caller can act on, not a server fault —
        # and it is decided before any provider I/O.
        raise_api_error(409, REASON_CHECKOUT_UNAVAILABLE, cause=exc)
    except (
        TrialUnavailableError,
        IdempotencyConflictError,
        BillingConflictError,
        IntroductoryAccessError,
        TaxPolicyError,
    ) as exc:
        raise_api_error(409, str(exc), cause=exc)
    except BillingProviderError as exc:
        raise_api_error(502, exc.code, cause=exc)
    except CatalogUnavailableError as exc:
        raise_api_error(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Commercial catalog unavailable",
            code=str(exc),
            cause=exc,
        )


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


async def _reject_unsettled_addon(
    session: AsyncSession, account: BillingAccount, catalog_key: str
) -> None:
    """Refuse an add-on intent while an earlier one for the SAME (account,
    catalog_key) is still settling; other add-on keys and top-ups are
    unaffected.
    """
    if await pending_addon_activation(session, account.id, catalog_key) is not None:
        raise BillingConflictError(REASON_ADDON_PENDING)


async def reject_unsettled_addon(
    session: AsyncSession, account: BillingAccount, catalog_key: str
) -> None:
    """Refuse a second add-on intent for the same key while one is settling.

    Add-ons are one-time purchases, so buying the same add-on again after the
    first settles is allowed; each purchase carries its own expiry.
    """
    await _reject_unsettled_addon(session, account, catalog_key)


async def require_live_base(session: AsyncSession, account: BillingAccount) -> str:
    """The live base plan key a one-time purchase is priced against.

    Checked twice: here before provider I/O, and again inside the activation
    transaction.
    """
    return (await live_base_subscription(session, account.id)).catalog_key


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


def one_time_provider_call(
    provider: BillingProvider, intent: ResolvedIntent
) -> ProviderCall:
    """Charge an add-on/top-up's exact server-resolved total (price + tax)."""
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
    "IdempotencyKey",
    "base_provider_call",
    "one_time_provider_call",
    "purchase_country",
    "purchase_identity",
    "reject_existing_base",
    "reject_unsettled_addon",
    "require_idempotency_key",
    "require_live_base",
    "safe_commercial_errors",
]
