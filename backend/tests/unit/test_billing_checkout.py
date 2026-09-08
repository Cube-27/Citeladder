from __future__ import annotations

import hashlib
import hmac
import uuid
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock

import httpx
import pytest
from pydantic import SecretStr, ValidationError

from app.connectors.billing.base import BillingProviderError
from app.connectors.billing.razorpay import RazorpayBillingProvider
from app.core.config.billing_settings import BillingSettings, billing_settings
from app.domain.billing.checkout import (
    CheckoutVerifyRequest,
    checkout_response,
    verify_checkout,
)
from app.domain.billing.webhooks import verify_razorpay_signature
from scripts.provision_razorpay_plans import verify_plan


def configured(**overrides) -> BillingSettings:
    return BillingSettings(
        _env_file=None,
        razorpay_mode="test",
        razorpay_key_id="rzp_test_fixture",
        razorpay_key_secret=SecretStr("synthetic-api-secret"),
        **overrides,
    )


@pytest.mark.parametrize(
    "overrides",
    [
        {"APP_ENV": "production"},
        {"razorpay_api_base_url": "https://example.invalid/v1"},
    ],
)
def test_configuration_rejects_unsafe_boundaries(overrides) -> None:
    with pytest.raises(ValidationError):
        configured(**overrides)


def test_aliases_conflicts_and_redaction() -> None:
    settings = BillingSettings(
        _env_file=None,
        razorpay_mode="test",
        RAZORPAY_TEST_KEY_ID="rzp_test_fixture",
        RAZORPAY_TEST_KEY_SECRET="alias-secret",
    )
    assert settings.require_provider_mode() == "test"
    assert "alias-secret" not in repr(settings)
    with pytest.raises(ValidationError, match="Conflicting"):
        configured(RAZORPAY_TEST_KEY_SECRET="different-secret")
    with pytest.raises(ValidationError):
        BillingSettings(
            _env_file=None,
            razorpay_mode="live",
            RAZORPAY_TEST_KEY_ID="rzp_test_fixture",
        )


@pytest.mark.asyncio
async def test_redirect_never_forwards_credentials() -> None:
    requests = []

    def respond(request):
        requests.append(request)
        return httpx.Response(
            307, headers={"location": "https://example.invalid/steal"}
        )

    async with httpx.AsyncClient(
        transport=httpx.MockTransport(respond), follow_redirects=True
    ) as client:
        with pytest.raises(BillingProviderError, match="redirect"):
            await RazorpayBillingProvider(
                client=client, settings=configured()
            ).fetch_plan("plan_fixture")
    assert len(requests) == 1 and requests[0].url.host == "api.razorpay.com"


def test_previous_webhook_secret_has_bounded_expiry(monkeypatch) -> None:
    now = datetime.now(UTC)
    monkeypatch.setattr(billing_settings, "razorpay_webhook_secret", SecretStr("new"))
    monkeypatch.setattr(
        billing_settings, "razorpay_webhook_previous_secret", SecretStr("old")
    )
    raw = b'{"event":"subscription.charged"}'
    signature = hmac.new(b"old", raw, hashlib.sha256).hexdigest()
    monkeypatch.setattr(
        billing_settings,
        "razorpay_webhook_previous_secret_started_at",
        now - timedelta(hours=1),
    )
    monkeypatch.setattr(
        billing_settings,
        "razorpay_webhook_previous_secret_expires_at",
        now + timedelta(hours=1),
    )
    assert verify_razorpay_signature(raw, signature)
    monkeypatch.setattr(
        billing_settings,
        "razorpay_webhook_previous_secret_expires_at",
        now - timedelta(seconds=1),
    )
    assert not verify_razorpay_signature(raw, signature)
    monkeypatch.setattr(
        billing_settings,
        "razorpay_webhook_previous_secret_expires_at",
        now + timedelta(hours=25),
    )
    assert not verify_razorpay_signature(raw, signature)


def pending() -> SimpleNamespace:
    expires = datetime.now(UTC) + timedelta(minutes=5)
    money = {"currency": "USD", "amount_minor": 4900}
    return SimpleNamespace(
        id=uuid.uuid4(),
        activation_kind="base",
        catalog_key="tier_1",
        quantity=1,
        status="pending",
        provider_mode="test",
        external_reference="sub_fixture",
        expires_at=expires,
        failure_code=None,
        quote={
            "quote_id": "digest",
            "catalog_revision": "fixture",
            "catalog_key": "tier_1",
            "credential_mode": "byok",
            "country_code": "US",
            "region": "international",
            "base_price": money,
            "credit_price": None,
            "tax": {"currency": "USD", "amount_minor": 0},
            "total_price": money,
            "expires_at": expires,
        },
    )


@pytest.mark.asyncio
async def test_valid_callback_only_requests_reconciliation(monkeypatch) -> None:
    for key, value in configured().model_dump().items():
        if hasattr(billing_settings, key):
            monkeypatch.setattr(billing_settings, key, value)
    monkeypatch.setattr(
        billing_settings, "razorpay_key_secret", SecretStr("synthetic-api-secret")
    )
    row = pending()
    session = SimpleNamespace(commit=AsyncMock())
    signature = hmac.new(
        b"synthetic-api-secret", b"pay_fixture|sub_fixture", hashlib.sha256
    ).hexdigest()
    callback = CheckoutVerifyRequest(
        razorpay_payment_id="pay_fixture",
        razorpay_subscription_id="sub_fixture",
        razorpay_signature=signature,
    )
    result = await verify_checkout(session, row, callback)
    assert result.status == "pending" and row.reconciliation_next_at is not None
    assert not hasattr(row, "razorpay_signature")
    session.commit.assert_awaited_once()
    with pytest.raises(ValueError):
        await verify_checkout(
            session,
            row,
            callback.model_copy(update={"razorpay_subscription_id": "sub_foreign"}),
        )
    with pytest.raises(ValueError):
        await verify_checkout(
            session, row, callback.model_copy(update={"razorpay_signature": "0" * 64})
        )
    row.expires_at = datetime.now(UTC) - timedelta(seconds=1)
    with pytest.raises(ValueError):
        await verify_checkout(session, row, callback)
    with pytest.raises(ValueError):
        checkout_response(row)


def test_provider_plan_verification_checks_terms_and_tax() -> None:
    price = {
        "provider_plan_name": "Tier 1",
        "amount_minor": 4900,
        "currency": "USD",
        "period": "monthly",
        "interval": 1,
        "tax_minor": 0,
    }
    actual = {
        "item": {"name": "Tier 1", "amount": 4900, "currency": "USD"},
        "period": "monthly",
        "interval": 1,
    }
    verify_plan(actual, price)
    with pytest.raises(ValueError):
        verify_plan({**actual, "interval": 2}, price)
    with pytest.raises(ValueError):
        verify_plan(actual, {**price, "amount_minor": 4901})
    with pytest.raises(ValueError):
        verify_plan(actual, {**price, "tax_minor": 100, "tax_verified": False})
