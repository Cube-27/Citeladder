from __future__ import annotations

import hashlib
import hmac
import json
import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock

import httpx
import pytest
from pydantic import BaseModel, SecretStr, ValidationError
from sqlalchemy.exc import IntegrityError

from app.connectors.billing.base import BillingProviderError, ProviderMetadata
from app.connectors.billing.razorpay import RazorpayBillingProvider
from app.connectors.billing.razorpay_webhook import (
    parse_payment_event,
    verify_signature,
)
from app.core.config.billing_catalog import (
    GrantTemplate,
    plan_checkout_availability,
    resolve_region,
)
from app.core.config.billing_contracts import (
    ADDON_EXTRA_PROJECT,
    CURRENCY_MINOR_UNITS,
    REASON_ADDON_PENDING,
    REASON_CHECKOUT_UNAVAILABLE,
    REASON_CONTACT_ONLY,
    REASON_SUBSCRIPTION_PENDING,
    REGION_CURRENCIES,
    REGION_INDIA,
    REGION_INTERNATIONAL,
    TOPUP_AUDIT_CREDITS,
)
from app.core.config.billing_settings import (
    billing_settings,
)
from app.core.config.entitlements import (
    KEY_AUDIT_CREDITS,
    KEY_PROVIDER_COPILOT,
)
from app.core.config.provider_catalog import (
    ACTIVE_TRANSPORTS,
    MEASUREMENT_ROUTES,
    PUBLIC_PROVIDER_CATALOG,
    public_provider_routes,
)
from app.core.config.razorpay_settings import razorpay_settings
from app.domain.auth import service as auth_service
from app.domain.billing import schemas as billing_schemas
from app.domain.billing.idempotency import (
    _PENDING_SLOT_REASONS,
    TrialUnavailableError,
    _violated_constraint_name,
    reject_deferred_trial,
    request_fingerprint,
    validate_idempotency_key,
)
from app.domain.billing.schemas import (
    BillingEntitlementResponse,
    GrantProvenanceResponse,
    MoneyResponse,
    SubscriptionCreateRequest,
    UsageItemResponse,
)
from scripts.provision_razorpay_plans import (
    _validate_environment,
)
from tests.billing_catalog_support import launch_catalog


def test_webhook_signature_uses_exact_raw_body(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    secret = "webhook-test-secret"
    monkeypatch.setattr(razorpay_settings, "webhook_secret", SecretStr(secret))
    raw = b'{"event":"subscription.activated"}'
    signature = hmac.new(secret.encode(), raw, hashlib.sha256).hexdigest()
    assert verify_signature(raw, signature)
    assert not verify_signature(raw + b"\n", signature)


def test_payment_webhook_discards_oversized_optional_method(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(razorpay_settings, "mode", "test")
    monkeypatch.setattr(razorpay_settings, "key_id", "rzp_test_fixture")
    monkeypatch.setattr(
        razorpay_settings, "key_secret", SecretStr("synthetic-api-secret")
    )
    payment = parse_payment_event(
        {
            "created_at": 1_788_865_200,
            "payload": {
                "payment": {
                    "entity": {
                        "id": "pay_fixture",
                        "status": "captured",
                        "amount": 118_000,
                        "currency": "INR",
                        "created_at": 1_788_865_200,
                        "method": "x" * 25,
                        "notes": {},
                    }
                }
            },
        },
        provider_mode="test",
    )
    assert payment.payment_method == ""


@pytest.mark.asyncio
async def test_login_rechecks_billing_bootstrap_idempotently(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    user = SimpleNamespace(
        id="11111111-1111-4111-8111-111111111111",
        is_active=True,
        hashed_password="hash",
        session_version=0,
    )
    repair = AsyncMock()
    session = SimpleNamespace(commit=AsyncMock())
    monkeypatch.setattr(auth_service, "get_user_by_email", AsyncMock(return_value=user))
    monkeypatch.setattr(auth_service, "verify_password", lambda *_args: True)
    monkeypatch.setattr(
        auth_service, "ensure_personal_workspace", AsyncMock(return_value=None)
    )
    monkeypatch.setattr(auth_service, "ensure_billing_for_user_workspaces", repair)
    monkeypatch.setattr(
        auth_service,
        "create_access_token",
        lambda _user_id, *, token_version: f"token-{token_version}",
    )

    result = await auth_service.authenticate_user(
        session, "user@example.com", "password"
    )

    assert result == ("token-0", user)
    repair.assert_awaited_once_with(session, user, workspace_ids=None)
    session.commit.assert_awaited_once()


def _metadata() -> ProviderMetadata:
    return ProviderMetadata(
        intent_id="intent-1", account_ref="account-1", catalog_revision="commercial-v9"
    )


@pytest.mark.asyncio
async def test_razorpay_adapter_creates_hosted_subscription(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(razorpay_settings, "mode", "test")
    monkeypatch.setattr(razorpay_settings, "key_id", "rzp_test_key")
    monkeypatch.setattr(razorpay_settings, "key_secret", SecretStr("test-secret"))

    async def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/v1/subscriptions"
        assert request.method == "POST"
        assert request.headers["authorization"].startswith("Basic ")
        body = request.content.decode()
        assert '"plan_id":"plan_test"' in body
        assert '"total_count":1200' in body
        assert "citeladder_intent_id" in body
        assert "test-secret" not in body
        return httpx.Response(
            200,
            json={
                "id": "sub_test",
                "status": "created",
                "plan_id": "plan_test",
                "short_url": "https://rzp.io/i/hosted-test",
            },
        )

    async with httpx.AsyncClient(
        transport=httpx.MockTransport(handler), base_url="https://api.razorpay.com"
    ) as client:
        provider = RazorpayBillingProvider(client=client)
        hosted = await provider.create_base_subscription(
            price_ref="plan_test",
            intent_id="intent-1",
            account_ref="account-1",
            trial_days=None,
            metadata=_metadata(),
        )
    assert hosted.external_subscription_id == "sub_test"
    assert hosted.checkout_url == ""
    assert hosted.price_ref == "plan_test"


@pytest.mark.asyncio
async def test_subscription_does_not_use_provider_checkout_url(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(razorpay_settings, "mode", "test")
    monkeypatch.setattr(razorpay_settings, "key_id", "rzp_test_key")
    monkeypatch.setattr(razorpay_settings, "key_secret", SecretStr("test-secret"))

    async def handler(_request: httpx.Request) -> httpx.Response:
        assert _request.method == "POST"
        return httpx.Response(
            200,
            json={
                "id": "sub_test",
                "status": "created",
                "plan_id": "plan_test",
                "short_url": "https://example.com/phishing",
            },
        )

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        provider = RazorpayBillingProvider(client=client)
        hosted = await provider.create_base_subscription(
            price_ref="plan_test",
            intent_id="intent-1",
            account_ref="account-1",
            trial_days=None,
            metadata=_metadata(),
        )
        assert hosted.checkout_url == ""


@pytest.mark.asyncio
async def test_razorpay_fetch_subscription_echoes_intent_identity(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(razorpay_settings, "mode", "test")
    monkeypatch.setattr(razorpay_settings, "key_id", "rzp_test_key")
    monkeypatch.setattr(razorpay_settings, "key_secret", SecretStr("test-secret"))
    requests: list[httpx.Request] = []

    async def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        if request.url.path == "/v1/invoices":
            return httpx.Response(200, json={"items": []})
        return httpx.Response(
            200,
            json={
                "id": "sub_existing",
                "status": "active",
                "plan_id": "plan_test",
                "current_start": 1,
                "current_end": 2,
                "updated_at": 3,
                "cancel_at_cycle_end": 1,
                "notes": {
                    "citeladder_intent_id": "intent-1",
                    "citeladder_account_ref": "account-1",
                },
            },
        )

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        provider = RazorpayBillingProvider(client=client)
        record = await provider.fetch_subscription("sub_existing")
    assert record.external_subscription_id == "sub_existing"
    assert record.price_ref == "plan_test"
    # The opaque identity refs echoed from the metadata we sent are what the
    # activation transaction verifies before granting anything.
    assert record.intent_id == "intent-1"
    assert record.account_ref == "account-1"
    assert record.cancel_at_period_end is True
    assert [request.method for request in requests] == ["GET", "GET"]


@pytest.mark.asyncio
async def test_razorpay_adapter_rejects_an_echoed_price_ref_mismatch(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(razorpay_settings, "mode", "test")
    monkeypatch.setattr(razorpay_settings, "key_id", "rzp_test_key")
    monkeypatch.setattr(razorpay_settings, "key_secret", SecretStr("test-secret"))

    async def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                "id": "sub_test",
                "status": "created",
                "plan_id": "plan_other",
                "short_url": "https://rzp.io/i/hosted-test",
            },
        )

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        provider = RazorpayBillingProvider(client=client)
        with pytest.raises(BillingProviderError, match="provider_price_ref_mismatch"):
            await provider.create_base_subscription(
                price_ref="plan_test",
                intent_id="intent-1",
                account_ref="account-1",
                trial_days=None,
                metadata=_metadata(),
            )


@pytest.mark.asyncio
async def test_razorpay_one_time_payment_creates_an_order_for_the_exact_amount(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(razorpay_settings, "mode", "test")
    monkeypatch.setattr(razorpay_settings, "key_id", "rzp_test_key")
    monkeypatch.setattr(razorpay_settings, "key_secret", SecretStr("test-secret"))
    bodies: list[dict[str, object]] = []

    async def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/v1/orders"
        bodies.append(json.loads(request.content))
        amount = 1_000 if len(bodies) == 1 else 500
        return httpx.Response(
            200,
            json={
                "id": "order_test",
                "status": "created",
                "amount": amount,
                "currency": "USD",
            },
        )

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        provider = RazorpayBillingProvider(client=client)
        hosted = await provider.create_one_time_payment(
            amount_minor=1_000,
            currency="USD",
            intent_id="intent-1",
            account_ref="account-1",
            metadata=_metadata(),
        )
        assert hosted.external_order_id == "order_test"
        assert hosted.checkout_url == ""
        assert bodies[0]["receipt"] == "intent-1"
        with pytest.raises(BillingProviderError, match="provider_amount_mismatch"):
            await provider.create_one_time_payment(
                amount_minor=1_000,
                currency="USD",
                intent_id="intent-1",
                account_ref="account-1",
                metadata=_metadata(),
            )


def _order_handler(attempts: list[dict[str, object]]):
    notes = {"citeladder_intent_id": "intent-1", "citeladder_account_ref": "acct"}

    async def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/v1/orders/order_test":
            return httpx.Response(
                200,
                json={
                    "id": "order_test",
                    "amount": 1_000,
                    "currency": "USD",
                    "notes": notes,
                    "created_at": 1_700_000_000,
                },
            )
        assert request.url.path == "/v1/orders/order_test/payments"
        return httpx.Response(200, json={"items": attempts})

    return handler


@pytest.mark.asyncio
async def test_razorpay_order_settles_only_on_its_captured_payment(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(razorpay_settings, "mode", "test")
    monkeypatch.setattr(razorpay_settings, "key_id", "rzp_test_key")
    monkeypatch.setattr(razorpay_settings, "key_secret", SecretStr("test-secret"))
    failed = {
        "id": "pay_failed",
        "status": "failed",
        "amount": 1_000,
        "currency": "USD",
        "order_id": "order_test",
    }
    # Checkout lets the browser set payment notes; they must never name the
    # intent or account.
    captured = {
        **failed,
        "id": "pay_ok",
        "status": "captured",
        "method": "upi",
        "notes": {"citeladder_intent_id": "spoofed", "citeladder_account_ref": "x"},
    }
    transport = httpx.MockTransport(_order_handler([failed]))
    async with httpx.AsyncClient(transport=transport) as client:
        pending = await RazorpayBillingProvider(client=client).fetch_payment(
            "order_test"
        )
    # A failed attempt is not a failed purchase: the buyer may retry.
    assert pending.status == "payment_pending"
    assert pending.intent_id == "intent-1"

    transport = httpx.MockTransport(_order_handler([failed, captured]))
    async with httpx.AsyncClient(transport=transport) as client:
        paid = await RazorpayBillingProvider(client=client).fetch_payment("order_test")
    assert (paid.status, paid.external_payment_id) == ("paid", "pay_ok")
    assert paid.external_order_id == "order_test"
    # Only the server-set order notes identify the purchase.
    assert (paid.intent_id, paid.account_ref) == ("intent-1", "acct")

    underpaid = {**captured, "amount": 999}
    transport = httpx.MockTransport(_order_handler([underpaid]))
    async with httpx.AsyncClient(transport=transport) as client:
        provider = RazorpayBillingProvider(client=client)
        with pytest.raises(BillingProviderError, match="provider_amount_mismatch"):
            await provider.fetch_payment("order_test")


@pytest.mark.asyncio
async def test_razorpay_throttling_is_retryable(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(razorpay_settings, "mode", "test")
    monkeypatch.setattr(razorpay_settings, "key_id", "rzp_test_key")
    monkeypatch.setattr(razorpay_settings, "key_secret", SecretStr("test-secret"))

    async def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(429, json={"error": {}})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        provider = RazorpayBillingProvider(client=client)
        with pytest.raises(BillingProviderError, match="provider_rate_limited") as exc:
            await provider.fetch_payment("pay_x")
    assert exc.value.retryable is True


@pytest.mark.asyncio
async def test_razorpay_adapter_maps_all_transport_errors(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(razorpay_settings, "mode", "test")
    monkeypatch.setattr(razorpay_settings, "key_id", "rzp_test_key")
    monkeypatch.setattr(razorpay_settings, "key_secret", SecretStr("test-secret"))

    async def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ProtocolError("broken transport", request=request)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        provider = RazorpayBillingProvider(client=client)
        with pytest.raises(BillingProviderError, match="provider_unavailable") as exc:
            await provider.create_base_subscription(
                price_ref="plan_test",
                intent_id="intent-1",
                account_ref="account-1",
                trial_days=None,
                metadata=_metadata(),
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
    monkeypatch.setattr(razorpay_settings, "mode", environment)
    monkeypatch.setattr(razorpay_settings, "key_secret", SecretStr("synthetic-api"))
    monkeypatch.setattr(razorpay_settings, "key_id", key_id)
    if valid:
        _validate_environment(environment)
    else:
        with pytest.raises((RuntimeError, ValueError), match="does not match"):
            _validate_environment(environment)


# --- commercial catalog + strict DTOs -------------------------------------
def test_grant_template_rejects_non_issuable_and_unknown_keys() -> None:
    with pytest.raises(ValueError, match="non-issuable"):
        GrantTemplate(KEY_PROVIDER_COPILOT, 1)
    with pytest.raises(KeyError):
        GrantTemplate("not_a_capability", 1)


def test_one_time_items_need_no_plan_ref_but_honor_the_sell_switch() -> None:
    catalog = launch_catalog()
    by_key = {item.key: item for item in (*catalog.addons, *catalog.topups)}
    project = by_key[ADDON_EXTRA_PROJECT]
    price = project.price(REGION_INTERNATIONAL)
    assert price is not None and price.purchasable
    assert project.availability == "available"
    # Published but not sold: the operator switch keeps it unavailable.
    answers = by_key[TOPUP_AUDIT_CREDITS]
    assert answers.availability == "unavailable"
    assert answers.unavailable_reason == REASON_CHECKOUT_UNAVAILABLE
    enabled = launch_catalog(available_items=[TOPUP_AUDIT_CREDITS])
    topup = enabled.topup(TOPUP_AUDIT_CREDITS)
    assert topup is not None and topup.availability == "available"


def test_plan_checkout_requires_a_private_ref_and_enabled_region(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    unpriced = launch_catalog().plan("tier_1")
    assert unpriced is not None
    assert plan_checkout_availability(unpriced, REGION_INTERNATIONAL) == (
        False,
        REASON_CHECKOUT_UNAVAILABLE,
    )
    enterprise = launch_catalog().plan("enterprise")
    assert enterprise is not None
    assert plan_checkout_availability(enterprise, REGION_INTERNATIONAL) == (
        False,
        REASON_CONTACT_ONLY,
    )
    monkeypatch.setattr(billing_settings, "checkout_enabled", True)
    monkeypatch.setattr(razorpay_settings, "mode", "test")
    monkeypatch.setattr(razorpay_settings, "key_id", "rzp_test_fixture")
    monkeypatch.setattr(razorpay_settings, "key_secret", SecretStr("synthetic"))
    monkeypatch.setattr(razorpay_settings, "test_ready", True)
    monkeypatch.setattr(razorpay_settings, "test_international_ready", True)
    priced = launch_catalog(refs={"tier_1:international": "plan_private"}).plan(
        "tier_1"
    )
    assert priced is not None
    assert plan_checkout_availability(priced, REGION_INTERNATIONAL) == (True, None)
    # A price authored for another environment never admits checkout here.
    live = launch_catalog(
        provider_mode="live", refs={"tier_1:international": "plan_private"}
    ).plan("tier_1")
    assert live is not None
    assert plan_checkout_availability(live, REGION_INTERNATIONAL) == (
        False,
        REASON_CHECKOUT_UNAVAILABLE,
    )


def test_region_and_currency_resolution_stays_server_side() -> None:
    assert resolve_region("in") == REGION_INDIA
    assert resolve_region("US") == REGION_INTERNATIONAL
    # No country = public preview only.
    assert resolve_region(None) == REGION_INTERNATIONAL
    assert REGION_CURRENCIES[REGION_INDIA] == "INR"
    assert CURRENCY_MINOR_UNITS["INR"] == 2


def test_coming_soon_providers_never_reach_the_active_write_surface() -> None:
    """A display-only provider must stay unroutable and unwritable.

    The point is the SEPARATION between the public catalog and the executable
    surface, not the size of either. Asserting a count instead is what makes
    adding a real surface look like a regression.
    """
    assert ACTIVE_TRANSPORTS == frozenset(
        {"openai", "anthropic", "google", "dataforseo"}
    )
    assert set(MEASUREMENT_ROUTES) == {
        "chatgpt",
        "claude",
        "gemini",
        "google_ai_overview",
        "chatgpt_search",
        "gemini_consumer",
    }
    coming_soon = {"grok", "perplexity", "copilot"}
    assert not coming_soon & set(MEASUREMENT_ROUTES)
    assert not coming_soon & ACTIVE_TRANSPORTS
    for key in coming_soon:
        assert public_provider_routes(key) == ()


def test_public_provider_catalog_marks_coming_soon_providers_unavailable() -> None:
    entries = {entry.key: entry for entry in PUBLIC_PROVIDER_CATALOG}
    for key in ("grok", "perplexity", "copilot"):
        entry = entries[key]
        assert entry.availability == "unavailable"
        assert entry.unavailable_reason == "provider_unavailable"
        assert entry.adapter_shipped is False
    assert entries["copilot"].issuable is False
    assert entries["grok"].issuable is True
    assert entries["perplexity"].issuable is True


def test_no_dto_field_can_carry_a_provider_price_ref() -> None:
    forbidden = ("provider_price_ref", "external", "provider_plan", "payment_id")
    for name in billing_schemas.__all__:
        model = getattr(billing_schemas, name)
        if not isinstance(model, type) or not issubclass(model, BaseModel):
            continue
        for field in model.model_fields:
            assert not any(token in field for token in forbidden), (name, field)


def test_response_models_forbid_extra_fields() -> None:
    with pytest.raises(ValidationError):
        MoneyResponse(currency="USD", amount_minor=1, provider_price_ref="ref")
    with pytest.raises(ValidationError):
        MoneyResponse(currency="EUR", amount_minor=1)
    with pytest.raises(ValidationError):
        MoneyResponse(currency="USD", amount_minor=-1)


def test_usage_item_limit_state_nullability_is_explicit() -> None:
    base = {
        "key": KEY_AUDIT_CREDITS,
        "capability_type": "counter.consumable",
        "unit": "credits",
        "window_started_at": None,
        "resets_at": None,
        "earliest_expiry": None,
        "grants": [],
    }
    finite = UsageItemResponse(
        **base,
        limit_state="finite",
        allowance=10,
        consumed=2,
        reserved=1,
        remaining=7,
    )
    assert finite.grants == []
    with pytest.raises(ValidationError, match="finite"):
        UsageItemResponse(
            **base,
            limit_state="finite",
            allowance=None,
            consumed=2,
            reserved=1,
            remaining=7,
        )
    unlimited = UsageItemResponse(
        **base,
        limit_state="unlimited",
        allowance=None,
        consumed=4,
        reserved=0,
        remaining=None,
    )
    assert unlimited.consumed == 4
    with pytest.raises(ValidationError, match="unlimited"):
        UsageItemResponse(
            **base,
            limit_state="unlimited",
            allowance=None,
            consumed=None,
            reserved=0,
            remaining=None,
        )
    unknown = UsageItemResponse(
        **base,
        limit_state="unknown",
        allowance=None,
        consumed=None,
        reserved=None,
        remaining=None,
    )
    assert unknown.limit_state == "unknown"
    with pytest.raises(ValidationError, match="unknown"):
        UsageItemResponse(
            **base,
            limit_state="unknown",
            allowance=5,
            consumed=None,
            reserved=None,
            remaining=None,
        )


def test_entitlement_response_has_no_funded_execution_flag() -> None:
    assert "funded_execution_allowed" not in BillingEntitlementResponse.model_fields
    assert "source_ref" not in GrantProvenanceResponse.model_fields


def test_subscription_create_request_normalizes_and_bounds_the_country() -> None:
    customer = {
        "billing_name": "Fixture Buyer",
        "billing_address_line1": "1 Test Road",
        "billing_city": "Bhopal",
        "billing_state_code": "23",
        "billing_postal_code": "462001",
    }
    request = SubscriptionCreateRequest(
        catalog_key="tier_1",
        credential_mode="byok",
        country_code=" in ",
        **customer,
    )
    assert request.country_code == "IN"
    assert request.trial_requested is False
    international = SubscriptionCreateRequest(
        catalog_key="tier_1",
        credential_mode="byok",
        country_code="US",
        export_eligibility_attested=True,
        **{**customer, "billing_state_code": ""},
    )
    assert international.billing_state_code is None
    with pytest.raises(ValidationError):
        SubscriptionCreateRequest(
            catalog_key="tier_1", credential_mode="byok", country_code="IND", **customer
        )
    with pytest.raises(ValidationError):
        SubscriptionCreateRequest(
            catalog_key="enterprise",
            credential_mode="byok",
            country_code="US",
            export_eligibility_attested=True,
            **{**customer, "billing_state_code": None},
        )
    # A browser cannot submit an amount, a currency, or a provider reference.
    with pytest.raises(ValidationError):
        SubscriptionCreateRequest(
            catalog_key="tier_1",
            credential_mode="byok",
            country_code="US",
            export_eligibility_attested=True,
            **{**customer, "billing_state_code": None},
            amount_minor=1,
        )


# --- Idempotent intent: key validation, fingerprint, deferred trial --------
def test_validate_idempotency_key_requires_a_bounded_token() -> None:
    for bad in (None, "", "short", "has whitespace", "tab\tkey", "x" * 256):
        with pytest.raises(ValueError, match="idempotency_key_required"):
            validate_idempotency_key(bad)
    assert validate_idempotency_key("  abcdefgh  ") == "abcdefgh"
    assert validate_idempotency_key("x" * 255) == "x" * 255


def test_request_fingerprint_is_canonical_and_sensitive_to_the_body() -> None:
    account_id = uuid.uuid4()
    base = {
        "operation": "subscription.create",
        "account_id": account_id,
        "catalog_revision": "commercial-v9",
        "catalog_key": "tier_1",
        "quantity": 1,
        "credential_mode": "byok",
    }
    fingerprint = request_fingerprint(**base)
    assert fingerprint == request_fingerprint(**base)
    assert len(fingerprint) == 64
    for change in (
        {"catalog_key": "tier_2"},
        {"quantity": 2},
        {"credential_mode": "funded"},
        {"operation": "addon.activate"},
    ):
        assert request_fingerprint(**{**base, **change}) != fingerprint


def test_reject_deferred_trial_raises_before_any_write() -> None:
    reject_deferred_trial(False)
    with pytest.raises(TrialUnavailableError, match="trial_unavailable"):
        reject_deferred_trial(True)


class _UniqueViolation(Exception):
    """Minimal asyncpg/psycopg-shaped driver error (constraint_name carrier)."""

    def __init__(self, constraint_name: str) -> None:
        super().__init__(constraint_name)
        self.constraint_name = constraint_name


def test_pending_slot_violations_map_to_the_guard_reasons() -> None:
    """The different-key slot race surfaces the SAME safe 409 codes the
    pre-insert guards return; a same-key violation stays on the replay path.
    """
    assert REASON_SUBSCRIPTION_PENDING == "subscription_pending"
    assert REASON_ADDON_PENDING == "addon_pending"
    cases = (
        ("uq_pending_activation_one_pending_base", REASON_SUBSCRIPTION_PENDING),
        ("uq_pending_activation_one_pending_addon", REASON_ADDON_PENDING),
        ("uq_pending_activation_account_idempotency", None),
        ("uq_idempotency_record_account_key", None),
    )
    for constraint_name, expected in cases:
        violation = IntegrityError("INSERT", {}, _UniqueViolation(constraint_name))
        name = _violated_constraint_name(violation)
        assert name == constraint_name
        assert _PENDING_SLOT_REASONS.get(name or "") == expected


def test_violated_constraint_name_unwraps_the_driver_adapter() -> None:
    """SQLAlchemy's asyncpg dialect re-raises a fresh IntegrityError FROM the
    driver error, so the name must be recovered from the ``__cause__`` chain.
    """
    adapted = Exception("adapted IntegrityError")
    adapted.__cause__ = _UniqueViolation("uq_pending_activation_one_pending_addon")
    violation = IntegrityError("INSERT", {}, adapted)
    assert (
        _violated_constraint_name(violation)
        == "uq_pending_activation_one_pending_addon"
    )
