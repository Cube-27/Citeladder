"""Normalize paid invoice/payment evidence without inventing missing periods."""

from __future__ import annotations

from dataclasses import replace
from typing import Any

from app.connectors.billing.base import (
    BillingProviderError,
    ProviderPayment,
    ProviderSubscription,
)


def matching_invoice(
    collection: dict[str, Any], subscription: ProviderSubscription
) -> dict[str, Any] | None:
    items = collection.get("items")
    if not isinstance(items, list):
        raise BillingProviderError("provider_invalid_response")
    matches = [
        item
        for item in items
        if isinstance(item, dict)
        and item.get("subscription_id") == subscription.external_subscription_id
        and item.get("status") == "paid"
        and item.get("billing_start") == subscription.current_start
        and item.get("billing_end") == subscription.current_end
        and isinstance(item.get("payment_id"), str)
    ]
    if len(matches) > 1:
        raise BillingProviderError("provider_invoice_ambiguous")
    return matches[0] if matches else None


def invoice_payment(
    invoice: dict[str, Any],
    payment: ProviderPayment,
    subscription: ProviderSubscription,
) -> ProviderPayment:
    if (
        invoice.get("payment_id") != payment.external_payment_id
        or invoice.get("id") != payment.external_invoice_id
        or invoice.get("subscription_id") != subscription.external_subscription_id
        or invoice.get("status") != "paid"
        or invoice.get("amount_paid") != payment.amount_minor
        or invoice.get("currency") != payment.currency
        or invoice.get("amount_due") != 0
    ):
        raise BillingProviderError("provider_invoice_mismatch")
    paid_at = invoice.get("paid_at")
    if not isinstance(paid_at, int) or isinstance(paid_at, bool):
        raise BillingProviderError("provider_paid_at_missing")
    tax_amount = invoice.get("tax_amount")
    tax_minor = tax_amount if type(tax_amount) is int else None
    return replace(
        payment,
        paid_at=paid_at,
        tax_minor=tax_minor,
        external_subscription_id=subscription.external_subscription_id,
        period_start=subscription.current_start,
        period_end=subscription.current_end,
    )
