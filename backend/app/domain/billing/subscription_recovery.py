"""Lease existing subscriptions to recover missed renewal and cancellation evidence."""

from __future__ import annotations

import logging
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select, tuple_
from sqlalchemy.ext.asyncio import AsyncSession

from app.connectors.billing.base import BillingProvider, BillingProviderError
from app.connectors.billing.factory import provider_for_record
from app.connectors.billing.registry import ProviderUnavailableError
from app.core.config.billing_settings import billing_settings
from app.domain.billing.payments import PaymentReceiptConflictError
from app.domain.billing.service import BillingConflictError, apply_subscription_state
from app.domain.billing.subscription_payments import record_subscription_payment
from app.models.billing import BillingSubscription, PendingActivation


def configured_provider_pairs() -> list[tuple[str, str]]:
    """(provider, environment) pairs currently registered AND configured."""
    from app.connectors.billing.registry import registrations

    return [
        (registration.provider, mode)
        for registration in registrations().values()
        if (mode := registration.configured_mode())
    ]


async def reconcile_current_subscriptions(
    session: AsyncSession, provider: BillingProvider | None = None
) -> int:
    """Re-read each current subscription from ITS OWN provider.

    Every claimed row is served by the adapter for the provider/environment
    persisted on that row, so a deployment running two providers never asks
    one of them about the other's subscription. ``provider`` overrides that
    binding and exists for tests.
    """
    now = datetime.now(UTC)
    rows = list(
        (
            await session.scalars(
                select(BillingSubscription)
                .where(
                    BillingSubscription.is_current.is_(True),
                    # Only subscriptions whose ORIGINATING provider/environment
                    # is still configured; never another provider's records.
                    tuple_(
                        BillingSubscription.provider,
                        BillingSubscription.provider_mode,
                    ).in_(configured_provider_pairs()),
                    (BillingSubscription.reconciliation_next_at.is_(None))
                    | (BillingSubscription.reconciliation_next_at <= now),
                    (BillingSubscription.reconciliation_lease_expires_at.is_(None))
                    | (BillingSubscription.reconciliation_lease_expires_at <= now),
                )
                .order_by(BillingSubscription.created_at)
                .limit(billing_settings.reconciliation_batch_size)
                .with_for_update(skip_locked=True)
            )
        ).all()
    )
    claims = []
    for row in rows:
        row.reconciliation_lease_token = uuid.uuid4()
        row.reconciliation_lease_expires_at = now + timedelta(
            seconds=billing_settings.reconciliation_lease_seconds
        )
        row.reconciliation_next_at = now + timedelta(
            seconds=billing_settings.reconciliation_stale_after_seconds
        )
        claims.append(
            (
                row.id,
                row.reconciliation_lease_token,
                row.external_subscription_id,
                row.provider,
                row.provider_mode,
            )
        )
    await session.commit()
    claimed = 0
    for row_id, token, reference, name, mode in claims:
        adapter = provider or _adapter_for(name, mode)
        if adapter is None:
            # The originating provider is no longer usable. Leave the row for
            # a later sweep rather than reading it from another provider.
            continue
        claimed += 1
        await _recover(session, adapter, row_id, token, reference)
    return claimed


def _adapter_for(provider: str, provider_mode: str) -> BillingProvider | None:
    try:
        return provider_for_record(provider, provider_mode)
    except ProviderUnavailableError:
        return None


async def _recover(
    session: AsyncSession,
    provider: BillingProvider,
    row_id: uuid.UUID,
    token: uuid.UUID,
    reference: str,
) -> None:
    try:
        record = await provider.fetch_subscription(reference)
        subscription = await session.scalar(
            select(BillingSubscription)
            .where(
                BillingSubscription.id == row_id,
                BillingSubscription.reconciliation_lease_token == token,
                BillingSubscription.reconciliation_lease_expires_at > datetime.now(UTC),
            )
            .with_for_update()
            .execution_options(populate_existing=True)
        )
        if subscription is None:
            return
        pending = await session.scalar(
            select(PendingActivation).where(
                PendingActivation.external_reference == reference,
                PendingActivation.billing_account_id == subscription.billing_account_id,
                PendingActivation.provider_mode == subscription.provider_mode,
            )
        )
        if record.provider_mode != subscription.provider_mode:
            return
        if pending is not None and record.payment is not None:
            await record_subscription_payment(
                session, pending=pending, subscription=subscription, record=record
            )
        await apply_subscription_state(
            session,
            subscription,
            provider_status=record.status,
            current_start=record.current_start,
            current_end=record.current_end,
            updated_at=record.updated_at,
            cancel_at_period_end=record.cancel_at_period_end,
        )
        await session.commit()
    except (
        BillingProviderError,
        BillingConflictError,
        PaymentReceiptConflictError,
    ) as exc:
        await session.rollback()
        logging.getLogger("app.billing").warning(
            "billing.subscription_recovery_deferred",
            extra={"error_kind": type(exc).__name__},
        )
    finally:
        await session.rollback()
