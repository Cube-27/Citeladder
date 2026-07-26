from __future__ import annotations

import hashlib
import hmac
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock

import httpx
import pytest
from pydantic import SecretStr

from app.connectors.billing.base import BillingProviderError
from app.connectors.billing.razorpay import RazorpayBillingProvider
from app.core.config.billing import billing_settings, quote_for_country
from app.domain.auth import service as auth_service
from app.domain.billing.service import catalog
from app.domain.billing.webhooks import verify_razorpay_signature
from scripts.provision_razorpay_plans import _validate_environment


def _ready(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(billing_settings, "checkout_enabled", True)
    monkeypatch.setattr(billing_settings, "razorpay_live_ready", True)
    monkeypatch.setattr(billing_settings, "razorpay_international_ready", True)
    monkeypatch.setattr(billing_settings, "usd_inr_rate", Decimal("83.5"))
    monkeypatch.setattr(
        billing_settings, "razorpay_paid_monthly_inr_plan_id", "plan_inr"
    )
    monkeypatch.setattr(
        billing_settings, "razorpay_paid_monthly_usd_plan_id", "plan_usd"
    )


def test_country_quote_selects_fixed_inr_plus_gst(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _ready(monkeypatch)
    quote = quote_for_country("in")
    assert quote.currency == "INR"
    assert quote.base_amount_minor == 409_150
    assert quote.tax_amount_minor == 73_647
    assert quote.total_amount_minor == 482_797
    assert quote.available is True


def test_international_quote_stays_usd(monkeypatch: pytest.MonkeyPatch) -> None:
    _ready(monkeypatch)
    quote = quote_for_country("GB")
    assert quote.currency == "USD"
    assert quote.total_amount_minor == 4_900
    assert quote.tax_amount_minor == 0


def test_public_catalog_never_exposes_provider_configuration(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _ready(monkeypatch)
    payload = catalog("IN").model_dump()
    serialized = str(payload).lower()
    assert [plan["tier_key"] for plan in payload["plans"]] == [
        "free",
        "paid",
        "enterprise",
    ]
    assert "plan_inr" not in serialized
    assert "razorpay" not in serialized
    assert "secret" not in serialized


def test_webhook_signature_uses_exact_raw_body(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    secret = "webhook-test-secret"
    monkeypatch.setattr(billing_settings, "razorpay_webhook_secret", SecretStr(secret))
    raw = b'{"event":"subscription.activated"}'
    signature = hmac.new(secret.encode(), raw, hashlib.sha256).hexdigest()
    assert verify_razorpay_signature(raw, signature)
    assert not verify_razorpay_signature(raw + b"\n", signature)


@pytest.mark.asyncio
async def test_login_skips_billing_repair_when_bootstrap_is_complete(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    user = SimpleNamespace(
        id="11111111-1111-4111-8111-111111111111",
        is_active=True,
        hashed_password="hash",
    )
    repair = AsyncMock()
    session = SimpleNamespace(commit=AsyncMock())
    monkeypatch.setattr(auth_service, "get_user_by_email", AsyncMock(return_value=user))
    monkeypatch.setattr(auth_service, "verify_password", lambda *_args: True)
    monkeypatch.setattr(
        auth_service, "ensure_personal_workspace", AsyncMock(return_value=None)
    )
    monkeypatch.setattr(
        auth_service,
        "user_billing_bootstrap_complete",
        AsyncMock(return_value=True),
    )
    monkeypatch.setattr(auth_service, "ensure_user_billing", repair)
    monkeypatch.setattr(auth_service, "create_access_token", lambda _user_id: "token")

    result = await auth_service.authenticate_user(
        session, "user@example.com", "password"
    )

    assert result == ("token", user)
    repair.assert_not_awaited()
    session.commit.assert_not_awaited()


@pytest.mark.asyncio
async def test_razorpay_adapter_creates_hosted_subscription(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(billing_settings, "razorpay_key_id", "rzp_test_key")
    monkeypatch.setattr(
        billing_settings, "razorpay_key_secret", SecretStr("test-secret")
    )

    async def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/v1/subscriptions"
        assert request.method == "POST"
        assert request.headers["authorization"].startswith("Basic ")
        body = request.content.decode()
        assert '"plan_id":"plan_test"' in body
        assert "test-secret" not in body
        return httpx.Response(
            200,
            json={
                "id": "sub_test",
                "status": "created",
                "short_url": "https://rzp.io/i/hosted-test",
            },
        )

    async with httpx.AsyncClient(
        transport=httpx.MockTransport(handler), base_url="https://api.razorpay.com"
    ) as client:
        provider = RazorpayBillingProvider(client=client)
        hosted = await provider.create_subscription(
            plan_id="plan_test", attempt_id="attempt", billing_account_id="account"
        )
    assert hosted.external_subscription_id == "sub_test"
    assert hosted.checkout_url == "https://rzp.io/i/hosted-test"


@pytest.mark.asyncio
async def test_razorpay_adapter_rejects_untrusted_checkout_host(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(billing_settings, "razorpay_key_id", "rzp_test_key")
    monkeypatch.setattr(
        billing_settings, "razorpay_key_secret", SecretStr("test-secret")
    )

    async def handler(_request: httpx.Request) -> httpx.Response:
        assert _request.method == "POST"
        return httpx.Response(
            200,
            json={
                "id": "sub_test",
                "status": "created",
                "short_url": "https://example.com/phishing",
            },
        )

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        provider = RazorpayBillingProvider(client=client)
        with pytest.raises(BillingProviderError, match="provider_invalid_checkout_url"):
            await provider.create_subscription(
                plan_id="plan_test",
                attempt_id="attempt",
                billing_account_id="account",
            )


@pytest.mark.asyncio
async def test_razorpay_adapter_reuses_subscription_found_by_attempt_note(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(billing_settings, "razorpay_key_id", "rzp_test_key")
    monkeypatch.setattr(
        billing_settings, "razorpay_key_secret", SecretStr("test-secret")
    )
    requests: list[httpx.Request] = []

    async def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(
            200,
            json={
                "items": [
                    {
                        "id": "sub_existing",
                        "status": "created",
                        "short_url": "https://rzp.io/i/existing",
                        "notes": {"searchify_attempt_id": "attempt"},
                    }
                ]
            },
        )

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        provider = RazorpayBillingProvider(client=client)
        hosted = await provider.create_subscription(
            plan_id="plan_test",
            attempt_id="attempt",
            billing_account_id="account",
            reconcile_existing=True,
        )
    assert hosted.external_subscription_id == "sub_existing"
    assert [request.method for request in requests] == ["GET"]


@pytest.mark.asyncio
async def test_razorpay_reconciliation_paginates_until_attempt_is_found(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(billing_settings, "razorpay_key_id", "rzp_test_key")
    monkeypatch.setattr(
        billing_settings, "razorpay_key_secret", SecretStr("test-secret")
    )
    monkeypatch.setattr(billing_settings, "reconciliation_list_count", 1)
    skips: list[str | None] = []

    async def handler(request: httpx.Request) -> httpx.Response:
        skips.append(request.url.params.get("skip"))
        if request.url.params.get("skip") == "0":
            return httpx.Response(
                200,
                json={
                    "items": [
                        {
                            "id": "sub_other",
                            "status": "created",
                            "notes": {"searchify_attempt_id": "other"},
                        }
                    ]
                },
            )
        return httpx.Response(
            200,
            json={
                "items": [
                    {
                        "id": "sub_existing",
                        "status": "created",
                        "short_url": "https://rzp.io/i/existing",
                        "notes": {"searchify_attempt_id": "attempt"},
                    }
                ]
            },
        )

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        provider = RazorpayBillingProvider(client=client)
        hosted = await provider.create_subscription(
            plan_id="plan_test",
            attempt_id="attempt",
            billing_account_id="account",
            reconcile_existing=True,
        )

    assert hosted.external_subscription_id == "sub_existing"
    assert skips == ["0", "1"]


@pytest.mark.asyncio
async def test_razorpay_adapter_maps_all_transport_errors(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(billing_settings, "razorpay_key_id", "rzp_test_key")
    monkeypatch.setattr(
        billing_settings, "razorpay_key_secret", SecretStr("test-secret")
    )

    async def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ProtocolError("broken transport", request=request)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        provider = RazorpayBillingProvider(client=client)
        with pytest.raises(BillingProviderError, match="provider_unavailable") as exc:
            await provider.create_subscription(
                plan_id="plan_test",
                attempt_id="attempt",
                billing_account_id="account",
            )
    assert exc.value.retryable is True


@pytest.mark.parametrize(
    ("environment", "key_id", "valid"),
    [
        ("test", "rzp_test_example", True),
        ("live", "rzp_live_example", True),
        ("test", "rzp_live_example", False),
        ("live", "rzp_test_example", False),
    ],
)
def test_plan_provisioning_validates_credential_environment(
    monkeypatch: pytest.MonkeyPatch,
    environment: str,
    key_id: str,
    valid: bool,
) -> None:
    monkeypatch.setattr(billing_settings, "razorpay_key_id", key_id)
    if valid:
        _validate_environment(environment)
    else:
        with pytest.raises(RuntimeError, match="does not match"):
            _validate_environment(environment)
