from __future__ import annotations

import hashlib
import hmac
import json
from datetime import UTC, datetime, timedelta

import httpx
import pytest
from pydantic import SecretStr
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config.billing import billing_settings
from app.models.billing import (
    AccountEntitlement,
    BillingAccount,
    BillingSubscription,
    BillingWebhookEvent,
)


async def _register(client: httpx.AsyncClient) -> None:
    response = await client.post(
        "/api/v1/auth/register",
        json={"email": "billing@example.com", "password": "password123"},
    )
    assert response.status_code == 201


@pytest.mark.asyncio
async def test_registration_bootstraps_free_billing_and_workspace_entitlement(
    client: httpx.AsyncClient,
) -> None:
    await _register(client)
    summary = await client.get("/api/v1/billing/me")
    assert summary.status_code == 200
    assert summary.json()["tier_key"] == "free"
    assert summary.json()["billing_country"] == ""
    assert summary.json()["can_checkout"] is False

    workspace = (await client.get("/api/v1/workspaces")).json()[0]
    entitlement = await client.get(f"/api/v1/workspaces/{workspace['id']}/entitlements")
    assert entitlement.status_code == 200
    assert entitlement.json()["tier_key"] == "free"
    assert entitlement.json()["site_health_capability"] == "free"


@pytest.mark.asyncio
async def test_country_is_persisted_but_disabled_checkout_fails_closed(
    client: httpx.AsyncClient,
) -> None:
    await _register(client)
    updated = await client.patch("/api/v1/billing/profile", json={"country_code": "in"})
    assert updated.status_code == 200
    assert updated.json()["billing_country"] == "IN"
    checkout = await client.post(
        "/api/v1/billing/checkout",
        headers={"Idempotency-Key": "billing-checkout-test-0001"},
        json={"tier_key": "paid", "cadence": "monthly"},
    )
    assert checkout.status_code == 503
    assert checkout.json()["detail"] == "checkout_not_enabled"


@pytest.mark.asyncio
async def test_same_country_update_preserves_verification(
    client: httpx.AsyncClient, db_session: AsyncSession
) -> None:
    await _register(client)
    account = (await db_session.scalars(select(BillingAccount))).one()
    account.billing_country = "IN"
    account.country_verification = "verified"
    await db_session.commit()
    response = await client.patch(
        "/api/v1/billing/profile", json={"country_code": "in"}
    )
    assert response.status_code == 200
    assert response.json()["country_verification"] == "verified"


@pytest.mark.asyncio
async def test_catalog_is_public_and_contains_no_provider_ids(
    client: httpx.AsyncClient,
) -> None:
    response = await client.get("/api/v1/billing/catalog?country=US")
    assert response.status_code == 200
    body = response.json()
    assert [plan["tier_key"] for plan in body["plans"]] == [
        "free",
        "paid",
        "enterprise",
    ]
    serialized = response.text.lower()
    assert "plan_id" not in serialized
    assert "razorpay_key" not in serialized


@pytest.mark.asyncio
async def test_webhook_rejects_invalid_signature(client: httpx.AsyncClient) -> None:
    response = await client.post(
        "/api/v1/billing/webhooks/razorpay",
        content=b'{"event":"subscription.activated"}',
        headers={
            "X-Razorpay-Signature": "invalid",
            "X-Razorpay-Event-Id": "evt_invalid",
            "Content-Type": "application/json",
        },
    )
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_signed_unhandled_webhook_is_acknowledged(
    client: httpx.AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    secret = "component-webhook-secret"
    monkeypatch.setattr(billing_settings, "razorpay_webhook_secret", SecretStr(secret))
    raw = b'{"event":"payment.captured"}'
    signature = hmac.new(secret.encode(), raw, hashlib.sha256).hexdigest()
    response = await client.post(
        "/api/v1/billing/webhooks/razorpay",
        content=raw,
        headers={
            "X-Razorpay-Signature": signature,
            "X-Razorpay-Event-Id": "evt_unhandled",
            "Content-Type": "application/json",
        },
    )
    assert response.status_code == 204


@pytest.mark.asyncio
async def test_signed_webhook_is_the_only_paid_grant_and_is_deduplicated(
    client: httpx.AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    await _register(client)
    account = (await db_session.scalars(select(BillingAccount))).one()
    subscription = BillingSubscription(
        billing_account_id=account.id,
        external_subscription_id="sub_component_test",
        external_price_id="plan_test",
        currency="INR",
    )
    db_session.add(subscription)
    await db_session.commit()

    secret = "component-webhook-secret"
    monkeypatch.setattr(billing_settings, "razorpay_webhook_secret", SecretStr(secret))
    now = datetime.now(UTC)
    payload = {
        "event": "subscription.activated",
        "created_at": int(now.timestamp()),
        "payload": {
            "subscription": {
                "entity": {
                    "id": "sub_component_test",
                    "status": "active",
                    "current_start": int(now.timestamp()),
                    "current_end": int((now + timedelta(days=30)).timestamp()),
                    "updated_at": int(now.timestamp()),
                }
            }
        },
    }
    raw = json.dumps(payload, separators=(",", ":")).encode()
    signature = hmac.new(secret.encode(), raw, hashlib.sha256).hexdigest()
    headers = {
        "X-Razorpay-Signature": signature,
        "X-Razorpay-Event-Id": "evt_component_activation",
        "Content-Type": "application/json",
    }
    first = await client.post(
        "/api/v1/billing/webhooks/razorpay", content=raw, headers=headers
    )
    duplicate = await client.post(
        "/api/v1/billing/webhooks/razorpay", content=raw, headers=headers
    )
    assert first.status_code == 204
    assert duplicate.status_code == 204
    summary = await client.get("/api/v1/billing/me")
    assert summary.json()["tier_key"] == "paid"

    db_session.expire_all()
    entitlement = (await db_session.scalars(select(AccountEntitlement))).one()
    assert entitlement.tier_key == "paid"
    assert await db_session.scalar(select(func.count(BillingWebhookEvent.id))) == 1
