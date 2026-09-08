"""Lease existing subscriptions to recover missed renewal and cancellation evidence."""

from __future__ import annotations

import logging
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.connectors.billing.base import BillingProvider, BillingProviderError
from app.core.config.billing_settings import billing_settings
from app.domain.billing.payments import PaymentReceiptConflictError
from app.domain.billing.service import BillingConflictError, apply_subscription_state
from app.domain.billing.subscription_payments import record_subscription_payment
from app.models.billing import BillingSubscription, PendingActivation


async def reconcile_current_subscriptions(
    session: AsyncSession, provider: BillingProvider
) -> int:
    now = datetime.now(UTC)
    rows = list(
        (
            await session.scalars(
                select(BillingSubscription)
                .where(
                    BillingSubscription.is_current.is_(True),
                    BillingSubscription.provider_mode
                    == billing_settings.require_provider_mode(),
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
            (row.id, row.reconciliation_lease_token, row.external_subscription_id)
        )
    await session.commit()
    for row_id, token, reference in claims:
        await _recover(session, provider, row_id, token, reference)
    return len(claims)


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
