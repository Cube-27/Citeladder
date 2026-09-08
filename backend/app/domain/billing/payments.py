"""Normalized durable payment/refund receipts and cumulative refund caps."""

from __future__ import annotations

import hashlib
import json
import uuid
from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.connectors.billing.base import ProviderPayment, ProviderRefund
from app.models.billing import BillingSubscription, PendingActivation
from app.models.billing_payment import BillingPayment


class PaymentReceiptConflictError(ValueError):
    """Provider evidence conflicts with an existing normalized receipt."""


def _digest(payload: dict[str, object]) -> str:
    return hashlib.sha256(
        json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()


def _payment_payload(
    pending: PendingActivation,
    payment: ProviderPayment,
    subscription: BillingSubscription | None,
) -> dict[str, object]:
    return {
        "account": str(pending.billing_account_id),
        "intent": str(pending.id),
        "payment": payment.external_payment_id,
        "payment_link": payment.external_payment_link_id
        or (pending.external_reference if subscription is None else ""),
        "invoice": payment.external_invoice_id,
        "subscription": str(subscription.id) if subscription else None,
        "period_start": payment.period_start,
        "period_end": payment.period_end,
        "amount": payment.amount_minor,
        "tax": payment.tax_minor,
        "currency": payment.currency,
        "paid_at": payment.paid_at,
        "mode": payment.provider_mode,
    }


async def record_payment_receipt(
    session: AsyncSession,
    *,
    pending: PendingActivation,
    payment: ProviderPayment,
    subscription: BillingSubscription | None = None,
) -> BillingPayment:
    """Normalize one captured transaction independently of its Payment Link."""
    existing = await session.scalar(
        select(BillingPayment)
        .where(
            BillingPayment.provider == pending.provider,
            BillingPayment.external_payment_id == payment.external_payment_id,
            BillingPayment.receipt_kind == "payment",
        )
        .with_for_update()
    )
    payload = _payment_payload(pending, payment, subscription)
    digest = _digest(payload)
    if existing is not None:
        if existing.receipt_sha256 != digest:
            raise PaymentReceiptConflictError("payment_receipt_conflict")
        return existing
    receipt = BillingPayment(
        billing_account_id=pending.billing_account_id,
        pending_activation_id=pending.id,
        subscription_id=subscription.id if subscription else None,
        period_start=datetime.fromtimestamp(payment.period_start, tz=UTC)
        if payment.period_start
        else None,
        period_end=datetime.fromtimestamp(payment.period_end, tz=UTC)
        if payment.period_end
        else None,
        provider=pending.provider,
        receipt_kind="payment",
        external_payment_id=payment.external_payment_id,
        external_payment_link_id=payment.external_payment_link_id
        or (pending.external_reference if subscription is None else None),
        external_invoice_id=payment.external_invoice_id or None,
        amount_minor=payment.amount_minor,
        currency=payment.currency,
        provider_mode=payment.provider_mode,
        status=payment.status,
        paid_at=(
            datetime.fromtimestamp(payment.paid_at, tz=UTC)
            if payment.paid_at is not None
            else None
        ),
        receipt_sha256=digest,
    )
    session.add(receipt)
    await session.flush()
    return receipt


async def record_refund_receipt(
    session: AsyncSession,
    *,
    payment_id: uuid.UUID,
    refund: ProviderRefund,
) -> BillingPayment:
    """Append a refund only when cumulative receipts stay within payment."""
    payment = await session.scalar(
        select(BillingPayment)
        .where(
            BillingPayment.id == payment_id, BillingPayment.receipt_kind == "payment"
        )
        .with_for_update()
    )
    if payment is None or payment.external_payment_id != refund.external_payment_id:
        raise PaymentReceiptConflictError("refund_payment_mismatch")
    if payment.currency != refund.currency or refund.amount_minor <= 0:
        raise PaymentReceiptConflictError("refund_amount_mismatch")
    digest = _digest(
        {
            "payment": refund.external_payment_id,
            "refund": refund.external_refund_id,
            "amount": refund.amount_minor,
            "currency": refund.currency,
            "status": refund.status,
        }
    )
    existing = await session.scalar(
        select(BillingPayment).where(
            BillingPayment.provider == payment.provider,
            BillingPayment.external_refund_id == refund.external_refund_id,
        )
    )
    if existing is not None:
        if existing.receipt_sha256 != digest:
            raise PaymentReceiptConflictError("refund_receipt_conflict")
        return existing
    refunded = await session.scalar(
        select(func.coalesce(func.sum(BillingPayment.amount_minor), 0)).where(
            BillingPayment.parent_payment_id == payment.id,
            BillingPayment.receipt_kind == "refund",
        )
    )
    if int(refunded or 0) + refund.amount_minor > payment.amount_minor:
        raise PaymentReceiptConflictError("refund_cap_exceeded")
    receipt = BillingPayment(
        billing_account_id=payment.billing_account_id,
        pending_activation_id=payment.pending_activation_id,
        subscription_id=payment.subscription_id,
        parent_payment_id=payment.id,
        provider=payment.provider,
        receipt_kind="refund",
        external_payment_id=payment.external_payment_id,
        external_refund_id=refund.external_refund_id,
        amount_minor=refund.amount_minor,
        currency=refund.currency,
        provider_mode=payment.provider_mode,
        status=refund.status,
        receipt_sha256=digest,
    )
    session.add(receipt)
    await session.flush()
    return receipt
