from __future__ import annotations

import hashlib
import hmac
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock

import httpx
import pytest
from pydantic import BaseModel, SecretStr, ValidationError

from app.connectors.billing.base import BillingProviderError
from app.connectors.billing.razorpay import RazorpayBillingProvider
from app.core.config.billing import (
    ADDON_EXTRA_PROJECT,
    CURRENCY_MINOR_UNITS,
    REASON_CHECKOUT_UNAVAILABLE,
    REASON_CONTACT_ONLY,
    REGION_CURRENCIES,
    REGION_INDIA,
    REGION_INTERNATIONAL,
    GrantTemplate,
    billing_settings,
    commercial_catalog,
    plan_checkout_availability,
    plan_period_grant_specs,
    resolve_region,
)
from app.core.config.entitlements import (
    BENCHMARK_CADENCE_VALUES,
    COMING_SOON_PROVIDER_KEYS,
    HISTORY_WINDOW_VALUES,
    KEY_BENCHMARK_CADENCE,
    KEY_BENCHMARK_CREDITS,
    KEY_EXPORTS,
    KEY_FANOUT,
    KEY_HISTORY_WINDOW,
    KEY_MANUAL_RUNS_PER_DAY,
    KEY_MONITORED_URLS,
    KEY_PROJECT_SLOTS,
    KEY_PROMPT_SLOTS,
    KEY_PROVIDER_COPILOT,
    KEY_PULSE_CADENCE,
    PULSE_CADENCE_VALUES,
)
from app.core.config.provider_catalog import (
    ACTIVE_TRANSPORTS,
    APPROVED_ROUTES,
    PUBLIC_PROVIDER_CATALOG,
    public_provider_routes,
)
from app.domain.auth import service as auth_service
from app.domain.billing import schemas as billing_schemas
from app.domain.billing.schemas import (
    BillingEntitlementResponse,
    GrantProvenanceResponse,
    MoneyResponse,
    SubscriptionCreateRequest,
    UsageItemResponse,
)
from app.domain.billing.webhooks import verify_razorpay_signature
from scripts.provision_razorpay_plans import _validate_environment


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


# --- v8 commercial catalog + strict DTOs -----------------------------------
def test_catalog_has_final_plan_keys_in_order_with_exact_defaults() -> None:
    catalog = commercial_catalog()
    assert [plan.key for plan in catalog.plans] == [
        "tier_1",
        "tier_2",
        "tier_3",
        "enterprise",
    ]
    base = {
        plan.key: plan.base_price(REGION_INTERNATIONAL) for plan in catalog.plans[:3]
    }
    assert [price.amount_minor for price in base.values()] == [9_900, 19_900, 29_900]
    assert {price.currency for price in base.values()} == {"USD"}
    enterprise = catalog.plans[3]
    assert enterprise.contact_only is True
    assert enterprise.self_serve is False
    assert enterprise.base_prices == {}
    assert enterprise.credit_prices_by_cadence == {}
    assert enterprise.grant_bundle == ()


def test_catalog_vocabulary_has_no_free_paid_or_bundle_tokens() -> None:
    catalog = commercial_catalog()
    text = " ".join(
        f"{plan.key} {plan.name} {plan.description}" for plan in catalog.plans
    ).lower()
    assert "free" not in text
    assert "paid" not in text
    assert "bundle" not in text


def test_plan_grant_templates_match_the_registry_and_omit_coming_soon() -> None:
    catalog = commercial_catalog()
    grants = {
        plan.key: {template.key: template.value for template in plan.grant_bundle}
        for plan in catalog.plans
    }
    assert grants["tier_1"] == {
        KEY_PULSE_CADENCE: PULSE_CADENCE_VALUES.index("daily"),
        KEY_BENCHMARK_CADENCE: BENCHMARK_CADENCE_VALUES.index("weekly"),
        KEY_PROJECT_SLOTS: 1,
        KEY_PROMPT_SLOTS: 10,
        KEY_MONITORED_URLS: 50,
        KEY_HISTORY_WINDOW: HISTORY_WINDOW_VALUES.index("90d"),
        KEY_MANUAL_RUNS_PER_DAY: 3,
        KEY_EXPORTS: 1,
    }
    assert grants["tier_2"][KEY_PROJECT_SLOTS] == 3
    assert grants["tier_2"][KEY_PROMPT_SLOTS] == 30
    assert grants["tier_2"][KEY_MONITORED_URLS] == 150
    assert grants["tier_2"][KEY_HISTORY_WINDOW] == HISTORY_WINDOW_VALUES.index("12mo")
    assert grants["tier_2"][KEY_MANUAL_RUNS_PER_DAY] == 6
    assert grants["tier_2"][KEY_FANOUT] == 1
    assert grants["tier_3"][KEY_PROJECT_SLOTS] == 10
    assert grants["tier_3"][KEY_PROMPT_SLOTS] == 60
    assert grants["tier_3"][KEY_MONITORED_URLS] == 400
    assert grants["tier_3"][KEY_HISTORY_WINDOW] == HISTORY_WINDOW_VALUES.index("24mo")
    assert grants["tier_3"][KEY_MANUAL_RUNS_PER_DAY] == 12
    # No plan issues a runnable coming-soon provider grant, and no plan carries
    # a benchmark-credit grant (included counts are unconfigured).
    for bundle in grants.values():
        assert not COMING_SOON_PROVIDER_KEYS & set(bundle)
        assert KEY_BENCHMARK_CREDITS not in bundle


def test_grant_template_rejects_non_issuable_and_unknown_keys() -> None:
    with pytest.raises(ValueError, match="non-issuable"):
        GrantTemplate(KEY_PROVIDER_COPILOT, 1)
    with pytest.raises(KeyError):
        GrantTemplate("not_a_capability", 1)


def test_base_and_credit_prices_stay_separate_and_funded_needs_a_margin(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    tier_1 = commercial_catalog().plan("tier_1")
    assert tier_1 is not None
    # Funded margin UNSET: no credit price exists, so base is never derived
    # from (or confused with) a credit price.
    assert tier_1.credit_price(REGION_INTERNATIONAL) is None
    monkeypatch.setattr(billing_settings, "funded_margin_bps", 2_000)
    funded = commercial_catalog().plan("tier_1")
    assert funded is not None
    base = funded.base_price(REGION_INTERNATIONAL)
    credit = funded.credit_price(REGION_INTERNATIONAL)
    assert base is not None and credit is not None
    assert base.amount_minor == 9_900
    assert credit.amount_minor == 60_000
    assert base.amount_minor != credit.amount_minor


def test_items_are_unavailable_until_the_open_config_is_set(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    catalog = commercial_catalog()
    for addon in catalog.addons:
        assert addon.availability == "unavailable"
        assert addon.unavailable_reason == REASON_CHECKOUT_UNAVAILABLE
    topup = catalog.topups[0]
    assert topup.availability == "unavailable"
    assert topup.unavailable_reason == REASON_CHECKOUT_UNAVAILABLE
    assert topup.grant_bundle_per_unit == ()
    assert topup.expiry_days == 30
    # A configured price alone is not enough: the private provider ref must
    # also be present before anything becomes purchasable.
    monkeypatch.setattr(billing_settings, "addon_extra_project_usd_minor", 1_900)
    assert commercial_catalog().addons[0].availability == "unavailable"
    monkeypatch.setattr(
        billing_settings,
        "provider_price_refs",
        {f"{ADDON_EXTRA_PROJECT}:{REGION_INTERNATIONAL}:base": "ref_private"},
    )
    assert commercial_catalog().addons[0].availability == "available"


def test_plan_checkout_requires_a_private_ref_and_enabled_region(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    tier_1 = commercial_catalog().plan("tier_1")
    assert tier_1 is not None
    assert plan_checkout_availability(tier_1, REGION_INTERNATIONAL) == (
        False,
        REASON_CHECKOUT_UNAVAILABLE,
    )
    enterprise = commercial_catalog().plan("enterprise")
    assert enterprise is not None
    assert plan_checkout_availability(enterprise, REGION_INTERNATIONAL) == (
        False,
        REASON_CONTACT_ONLY,
    )
    monkeypatch.setattr(billing_settings, "checkout_enabled", True)
    monkeypatch.setattr(billing_settings, "razorpay_live_ready", True)
    monkeypatch.setattr(billing_settings, "razorpay_international_ready", True)
    monkeypatch.setattr(
        billing_settings,
        "provider_price_refs",
        {f"tier_1:{REGION_INTERNATIONAL}:base": "ref_private"},
    )
    priced = commercial_catalog().plan("tier_1")
    assert priced is not None
    assert plan_checkout_availability(priced, REGION_INTERNATIONAL) == (True, None)


def test_region_and_currency_resolution_stays_server_side() -> None:
    assert resolve_region("in") == REGION_INDIA
    assert resolve_region("US") == REGION_INTERNATIONAL
    # No country = public preview only.
    assert resolve_region(None) == REGION_INTERNATIONAL
    assert REGION_CURRENCIES[REGION_INDIA] == "INR"
    assert CURRENCY_MINOR_UNITS["INR"] == 2


def test_india_price_is_zero_until_the_operator_sets_a_rate(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    tier_1 = commercial_catalog().plan("tier_1")
    assert tier_1 is not None
    india = tier_1.base_price(REGION_INDIA)
    assert india is not None
    assert india.currency == "INR"
    assert india.amount_minor == 0
    assert india.purchasable is False
    monkeypatch.setattr(billing_settings, "usd_inr_rate", Decimal("83"))
    rated = commercial_catalog().plan("tier_1")
    assert rated is not None
    priced = rated.base_price(REGION_INDIA)
    assert priced is not None
    assert priced.amount_minor == 9_900 * 83


def test_plan_period_grant_specs_reads_the_catalog_and_rejects_stale_revisions(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    specs = plan_period_grant_specs("tier_1", billing_settings.catalog_version)
    assert specs is not None
    assert dict(specs)[KEY_PROJECT_SLOTS] == 1
    assert plan_period_grant_specs("tier_1", "billing-v1") is None
    assert (
        plan_period_grant_specs("enterprise", billing_settings.catalog_version) is None
    )
    assert plan_period_grant_specs("nope", billing_settings.catalog_version) is None


def test_active_write_enums_stay_openai_anthropic_google_only() -> None:
    assert ACTIVE_TRANSPORTS == frozenset({"openai", "anthropic", "google"})
    assert APPROVED_ROUTES == {
        "chatgpt": {"openai": "gpt-5.4"},
        "claude": {"anthropic": "claude-sonnet-4-6"},
        "gemini": {"google": "gemini-flash-latest"},
    }
    coming_soon = {"grok", "perplexity", "copilot"}
    assert not coming_soon & set(APPROVED_ROUTES)
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
        "key": KEY_BENCHMARK_CREDITS,
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
    request = SubscriptionCreateRequest(
        catalog_key="tier_1", credential_mode="byok", country_code=" in "
    )
    assert request.country_code == "IN"
    assert request.trial_requested is False
    with pytest.raises(ValidationError):
        SubscriptionCreateRequest(
            catalog_key="tier_1", credential_mode="byok", country_code="IND"
        )
    with pytest.raises(ValidationError):
        SubscriptionCreateRequest(
            catalog_key="enterprise", credential_mode="byok", country_code="US"
        )
    # A browser cannot submit an amount, a currency, or a provider reference.
    with pytest.raises(ValidationError):
        SubscriptionCreateRequest(
            catalog_key="tier_1",
            credential_mode="byok",
            country_code="US",
            amount_minor=1,
        )
