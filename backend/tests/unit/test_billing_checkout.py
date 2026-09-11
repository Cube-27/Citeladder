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
from app.connectors.billing.razorpay_webhook import verify_signature
from app.core.config.billing_settings import BillingSettings, billing_settings
from app.core.config.razorpay_settings import RazorpaySettings, razorpay_settings
from app.domain.billing.checkout import (
    CheckoutVerifyRequest,
    checkout_response,
    verify_checkout,
)
from scripts.provision_razorpay_plans import verify_plan


def configured(**overrides) -> RazorpaySettings:
    """A fully configured Razorpay VENDOR block for the adapter under test."""
    return RazorpaySettings(
        _env_file=None,
        mode="test",
        key_id="rzp_test_fixture",
        key_secret=SecretStr("synthetic-api-secret"),
        **overrides,
    )


@pytest.mark.parametrize(
    "overrides",
    [
        {"APP_ENV": "production"},
        {"api_base_url": "https://example.invalid/v1"},
    ],
)
def test_configuration_rejects_unsafe_boundaries(overrides) -> None:
    with pytest.raises(ValidationError):
        configured(**overrides)


def test_aliases_conflicts_and_redaction() -> None:
    settings = RazorpaySettings(
        _env_file=None,
        mode="test",
        RAZORPAY_TEST_KEY_ID="rzp_test_fixture",
        RAZORPAY_TEST_KEY_SECRET="alias-secret",
    )
    assert settings.require_provider_mode() == "test"
    assert "alias-secret" not in repr(settings)
    with pytest.raises(ValidationError, match="Conflicting"):
        configured(RAZORPAY_TEST_KEY_SECRET="different-secret")
    with pytest.raises(ValidationError):
        RazorpaySettings(
            _env_file=None,
            mode="live",
            RAZORPAY_TEST_KEY_ID="rzp_test_fixture",
        )


def test_shared_settings_hold_no_vendor_credentials() -> None:
    """The shared block must not carry a gateway credential (plan 3.4)."""
    shared = set(BillingSettings.model_fields)
    assert not [name for name in shared if name.startswith("razorpay_")]
    assert "checkout_enabled" in shared and "quote_signing_secret" in shared
    vendor = set(RazorpaySettings.model_fields)
    assert {"key_id", "key_secret", "webhook_secret", "mode"} <= vendor


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


@pytest.mark.asyncio
async def test_captured_payment_uses_provider_created_at_and_method() -> None:
    async with httpx.AsyncClient(
        transport=httpx.MockTransport(
            lambda _request: httpx.Response(
                200,
                json={
                    "id": "pay_fixture",
                    "status": "captured",
                    "amount": 118_000,
                    "currency": "INR",
                    "created_at": 1_788_865_200,
                    "method": "upi",
                },
            )
        )
    ) as client:
        payment = await RazorpayBillingProvider(
            client=client, settings=configured()
        ).fetch_payment("pay_fixture")
    assert payment.status == "paid"
    assert payment.paid_at == 1_788_865_200
    assert payment.payment_method == "upi"


def test_previous_webhook_secret_has_bounded_expiry(monkeypatch) -> None:
    now = datetime.now(UTC)
    monkeypatch.setattr(razorpay_settings, "webhook_secret", SecretStr("new"))
    monkeypatch.setattr(razorpay_settings, "webhook_previous_secret", SecretStr("old"))
    raw = b'{"event":"subscription.charged"}'
    signature = hmac.new(b"old", raw, hashlib.sha256).hexdigest()
    monkeypatch.setattr(
        razorpay_settings,
        "webhook_previous_secret_started_at",
        now - timedelta(hours=1),
    )
    monkeypatch.setattr(
        razorpay_settings,
        "webhook_previous_secret_expires_at",
        now + timedelta(hours=1),
    )
    assert verify_signature(raw, signature)
    monkeypatch.setattr(
        razorpay_settings,
        "webhook_previous_secret_expires_at",
        now - timedelta(seconds=1),
    )
    assert not verify_signature(raw, signature)
    monkeypatch.setattr(
        razorpay_settings,
        "webhook_previous_secret_expires_at",
        now + timedelta(hours=25),
    )
    assert not verify_signature(raw, signature)


def pending() -> SimpleNamespace:
    expires = datetime.now(UTC) + timedelta(minutes=5)
    money = {"currency": "USD", "amount_minor": 4900}
    return SimpleNamespace(
        id=uuid.uuid4(),
        activation_kind="base",
        catalog_key="tier_1",
        quantity=1,
        status="pending",
        provider="razorpay",
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
            "subtotal_price": money,
            "discount": {"currency": "USD", "amount_minor": 0},
            "taxable_value": money,
            "tax_treatment": "EXPORT_ZERO_RATED",
            "tax_rate": "0",
            "cgst": {"currency": "USD", "amount_minor": 0},
            "sgst": {"currency": "USD", "amount_minor": 0},
            "igst": {"currency": "USD", "amount_minor": 0},
            "tax_policy_version": 1,
            "tax": {"currency": "USD", "amount_minor": 0},
            "total_price": money,
            "expires_at": expires,
        },
    )


@pytest.mark.asyncio
async def test_valid_callback_only_requests_reconciliation(monkeypatch) -> None:
    """The shared controller never inspects a vendor field name.

    It hands the neutral wrapper to the ORIGINATING adapter, which owns the
    ``razorpay_*`` names, their formats and the HMAC scheme.
    """
    monkeypatch.setattr(razorpay_settings, "mode", "test")
    monkeypatch.setattr(razorpay_settings, "key_id", "rzp_test_fixture")
    monkeypatch.setattr(
        razorpay_settings, "key_secret", SecretStr("synthetic-api-secret")
    )
    row = pending()
    session = SimpleNamespace(commit=AsyncMock())
    signature = hmac.new(
        b"synthetic-api-secret", b"pay_fixture|sub_fixture", hashlib.sha256
    ).hexdigest()
    fields = {
        "razorpay_payment_id": "pay_fixture",
        "razorpay_subscription_id": "sub_fixture",
        "razorpay_signature": signature,
    }
    callback = CheckoutVerifyRequest(fields=fields)
    result = await verify_checkout(session, row, callback)
    assert result.status == "pending" and row.reconciliation_next_at is not None
    session.commit.assert_awaited_once()
    with pytest.raises(ValueError):
        await verify_checkout(
            session,
            row,
            CheckoutVerifyRequest(
                fields={**fields, "razorpay_subscription_id": "sub_foreign"}
            ),
        )
    with pytest.raises(ValueError):
        await verify_checkout(
            session,
            row,
            CheckoutVerifyRequest(fields={**fields, "razorpay_signature": "0" * 64}),
        )
    # An unknown callback field is refused by the adapter's allowlist: a
    # neutral wrapper is not permission to accept arbitrary data.
    with pytest.raises(ValueError):
        await verify_checkout(
            session,
            row,
            CheckoutVerifyRequest(fields={**fields, "return_url": "http://evil"}),
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
        "tax_verified": True,
    }
    actual = {
        "item": {"name": "Tier 1", "amount": 4900, "currency": "USD"},
        "period": "monthly",
        "interval": 1,
    }
    verify_plan(actual, price)
    # Provider tax metadata is irrelevant; CiteLadder owns the allocation.
    verify_plan({**actual, "item": {**actual["item"], "tax_amount": 100}}, price)
    with pytest.raises(ValueError):
        verify_plan({**actual, "interval": 2}, price)
    with pytest.raises(ValueError):
        verify_plan(actual, {**price, "amount_minor": 4901})
    with pytest.raises(ValueError):
        verify_plan(actual, {**price, "tax_minor": 100, "tax_verified": False})
    verify_plan(
        {**actual, "item": {**actual["item"], "amount": 5000}},
        {**price, "tax_minor": 100, "tax_verified": True},
    )


@pytest.mark.asyncio
async def test_subscription_lookup_pages_and_rejects_truncated_search(
    monkeypatch,
) -> None:
    # Page size and page bound are SHARED settings, not vendor credentials.
    monkeypatch.setattr(billing_settings, "reconciliation_list_count", 1)
    offsets = []

    def respond(request):
        skip = int(request.url.params.get("skip", 0))
        offsets.append(skip)
        return httpx.Response(
            200, json={"items": [{"id": "sub_other"}] if skip == 0 else []}
        )

    async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as client:
        provider = RazorpayBillingProvider(client=client, settings=configured())
        assert await provider.find_subscription("intent", "account") is None
        assert offsets == [0, 1]
        monkeypatch.setattr(billing_settings, "reconciliation_max_pages", 1)
        with pytest.raises(
            BillingProviderError, match="collection_incomplete"
        ) as failure:
            await provider.find_subscription("intent", "account")
        assert failure.value.retryable
