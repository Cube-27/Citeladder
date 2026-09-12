"""Deterministic provider fixtures for durable webhook processing."""

import hashlib
import hmac
import json
from dataclasses import replace

import httpx
from pydantic import SecretStr
from sqlalchemy import select

from app.connectors.billing.base import ProviderPayment, ProviderSubscription
from app.connectors.billing.razorpay_webhook import (
    parse_payment_event,
    parse_subscription_event,
)
from app.core.database import get_session
from app.domain.billing.webhook_recovery import recover_webhook_receipts
from app.main import app
from app.models.billing import PendingActivation
from tests.billing_settings_support import apply_billing_settings


def configure_test_provider(monkeypatch):
    apply_billing_settings(
        monkeypatch,
        {
            "razorpay_mode": "test",
            "razorpay_key_id": "rzp_test_fixture",
            "razorpay_key_secret": SecretStr("synthetic-api-secret"),
            "quote_signing_secret": SecretStr("synthetic-quote-secret"),
            "razorpay_test_ready": True,
            "razorpay_test_international_ready": True,
        },
    )


def captured_payment(
    record: ProviderSubscription, amount: int, currency: str = "USD"
) -> ProviderPayment:
    return ProviderPayment(
        external_payment_id=f"pay_{record.external_subscription_id}_{record.current_start}",
        external_invoice_id=f"inv_{record.external_subscription_id}_{record.current_start}",
        external_subscription_id=record.external_subscription_id,
        status="paid",
        amount_minor=amount,
        currency=currency,
        updated_at=record.updated_at,
        paid_at=record.current_start,
        period_start=record.current_start,
        period_end=record.current_end,
        provider_mode="test",
        tax_minor=0,
    )


async def drain_webhook(payload: dict) -> None:
    class FixtureProvider:
        async def fetch_payment(self, _reference):
            return parse_payment_event(payload, provider_mode="test")

        async def fetch_subscription(self, _reference):
            record = parse_subscription_event(payload, provider_mode="test")
            async for session in app.dependency_overrides[get_session]():
                pending = await session.scalar(
                    select(PendingActivation).where(
                        PendingActivation.external_reference == _reference
                    )
                )
                if pending is not None:
                    total = pending.quote["total_price"]
                    return replace(
                        record,
                        price_ref=record.price_ref or pending.external_price_id,
                        catalog_revision=pending.catalog_revision,
                        intent_id=record.intent_id or str(pending.id),
                        account_ref=record.account_ref
                        or str(pending.billing_account_id),
                        payment=captured_payment(
                            record, total["amount_minor"], total["currency"]
                        )
                        if record.status == "active"
                        else None,
                    )
            return record

    async for session in app.dependency_overrides[get_session]():
        await recover_webhook_receipts(session, FixtureProvider())


def sign_webhook(raw: bytes, secret: str) -> str:
    """The provider's HMAC-SHA256 body signature."""
    return hmac.new(secret.encode(), raw, hashlib.sha256).hexdigest()


async def post_webhook(
    client: httpx.AsyncClient, raw: bytes, *, event_id: str, secret: str
) -> httpx.Response:
    """POST a signed webhook and drain the receipt the endpoint enqueues.

    Both billing suites used to carry a byte-identical copy of this, differing
    only in the secret they signed with — so the drain-on-204 step (the part
    that is easy to forget and silently leaves the receipt unprocessed) had two
    places to go wrong.
    """
    response = await client.post(
        "/api/v1/billing/webhooks/razorpay",
        content=raw,
        headers={
            "X-Razorpay-Signature": sign_webhook(raw, secret),
            "X-Razorpay-Event-Id": event_id,
            "Content-Type": "application/json",
        },
    )
    if response.status_code == 204:
        await drain_webhook(json.loads(raw))
    return response
