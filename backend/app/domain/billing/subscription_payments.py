"""Shared captured-payment gate for initial settlement and renewals."""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.connectors.billing.base import ProviderSubscription
from app.domain.billing.payments import (
    PaymentReceiptConflictError,
    record_payment_receipt,
)
from app.models.billing import BillingSubscription, PendingActivation


async def record_subscription_payment(
    session: AsyncSession,
    *,
    pending: PendingActivation,
    subscription: BillingSubscription,
    record: ProviderSubscription,
) -> None:
    payment = record.payment
    total = (pending.quote or {}).get("total_price", {})
    if payment is None:
        raise PaymentReceiptConflictError("subscription_payment_missing")
    expected = (
        "paid",
        subscription.external_subscription_id,
        subscription.external_price_id,
        str(pending.id),
        str(subscription.billing_account_id),
        subscription.catalog_revision,
        subscription.provider_mode,
        subscription.provider_mode,
        total.get("amount_minor"),
        total.get("currency"),
        record.current_start,
        record.current_end,
    )
    observed = (
        payment.status,
        payment.external_subscription_id,
        record.price_ref,
        record.intent_id,
        record.account_ref,
        record.catalog_revision,
        record.provider_mode,
        payment.provider_mode,
        payment.amount_minor,
        payment.currency,
        payment.period_start,
        payment.period_end,
    )
    # Razorpay's invoice tax fields are not CiteLadder's GST authority. The
    # provider must prove the final paid amount; the frozen intent snapshot
    # supplies the customer receipt's tax allocation.
    if observed != expected:
        raise PaymentReceiptConflictError("subscription_payment_mismatch")
    if not payment.external_invoice_id or payment.paid_at is None:
        raise PaymentReceiptConflictError("subscription_invoice_missing")
    if (
        payment.period_start is None
        or payment.period_end is None
        or payment.period_start >= payment.period_end
    ):
        raise PaymentReceiptConflictError("subscription_period_invalid")
    await record_payment_receipt(
        session, pending=pending, payment=payment, subscription=subscription
    )
