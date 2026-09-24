from __future__ import annotations

import copy
from decimal import Decimal

import pytest
from pydantic import ValidationError

from app.core.config.billing_pricing import (
    AUTHORING_USD_INR_RATE,
    inr_minor_from_usd_minor,
)
from app.core.config.billing_settings import billing_settings
from app.domain.billing.admin import OperatorContext, redact, require_operator
from app.domain.billing.catalog_revisions import (
    RegionalPricePayload,
    validate_payload,
)
from app.domain.billing.launch_catalog import launch_pricing_v1_payload
from app.models.user import User
from scripts.provision_razorpay_plans import bind_plan_refs, recurring_prices


@pytest.mark.parametrize(
    ("usd_minor", "inr_minor"),
    [
        (4_900, 449_900),
        (9_900, 899_900),
        (19_900, 1_799_900),
        (24_900, 2_249_900),
        (49_900, 4_499_900),
        (1_500, 139_900),
        (1_900, 179_900),
        (2_500, 229_900),
    ],
)
def test_inr_rule_reproduces_the_approved_prices(
    usd_minor: int, inr_minor: int
) -> None:
    assert inr_minor_from_usd_minor(usd_minor, AUTHORING_USD_INR_RATE) == inr_minor


def test_launch_seed_keeps_checkout_and_campaign_disabled() -> None:
    payload = validate_payload(launch_pricing_v1_payload(provider_mode="test"))
    assert payload.campaign.state == "draft"
    assert payload.campaign.enabled is False
    assert payload.campaign.claim_available is False
    # Authored regional prices name no provider plan until an operator imports
    # and verifies one, so nothing is purchasable from the seed alone.
    for plan in payload.plans:
        for price in plan.regional_byok_prices.values():
            assert price.provider_price_ref == ""
            assert (price.period, price.interval) == ("monthly", 1)


def test_launch_seed_authors_checkout_prices_only_where_sellable(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    no_provider = validate_payload(launch_pricing_v1_payload(provider_mode=None))
    assert all(not plan.regional_byok_prices for plan in no_provider.plans)
    # Without an approved GST rate India is not authored at all.
    monkeypatch.setattr(billing_settings, "india_gst_rate", None)
    monkeypatch.setattr(billing_settings, "india_gst_approval_reference", "")
    unapproved = validate_payload(launch_pricing_v1_payload(provider_mode="test"))
    assert {
        region for plan in unapproved.plans for region in plan.regional_byok_prices
    } == {"international"}
    monkeypatch.setattr(billing_settings, "india_gst_rate", Decimal("0.18"))
    monkeypatch.setattr(billing_settings, "india_gst_approval_reference", "CA-1")
    approved = validate_payload(launch_pricing_v1_payload(provider_mode="test"))
    starter = next(plan for plan in approved.plans if plan.key == "tier_1")
    india = starter.regional_byok_prices["india"]
    assert (india.amount_minor, india.tax_minor, india.tax_verified) == (
        449_900,
        80_982,
        True,
    )


def test_regional_prices_must_follow_the_currency_rule() -> None:
    payload = launch_pricing_v1_payload(provider_mode="test")
    off_rule = copy.deepcopy(payload)
    usd = off_rule["plans"][0]["regional_byok_prices"]["international"]
    usd["amount_minor"] = 5_000
    with pytest.raises(ValidationError, match="USD catalog price"):
        validate_payload(off_rule)
    item = copy.deepcopy(payload)
    item["addons"][0]["modes"]["byok"]["regional_prices"]["india"]["amount_minor"] = (
        100_000
    )
    with pytest.raises(ValidationError, match="catalog rule"):
        validate_payload(item)


def test_invalid_catalog_rejects_unknown_capability_and_underpriced_funding() -> None:
    unknown = launch_pricing_v1_payload(provider_mode=None)
    unknown["plans"][0]["grants"].append({"key": "unknown", "value": 1})
    with pytest.raises((ValidationError, ValueError)):
        validate_payload(unknown)
    underpriced = launch_pricing_v1_payload(provider_mode=None)
    underpriced["plans"][0]["funded_price"]["amount_minor"] = 100
    with pytest.raises(ValidationError, match="below the BYOK price"):
        validate_payload(underpriced)


def test_items_reject_duplicate_keys_and_non_consumable_topups() -> None:
    duplicate = launch_pricing_v1_payload(provider_mode=None)
    duplicate["topups"][0]["key"] = duplicate["addons"][0]["key"]
    with pytest.raises(ValidationError, match="must be unique"):
        validate_payload(duplicate)
    occupancy = launch_pricing_v1_payload(provider_mode=None)
    for terms in occupancy["topups"][0]["modes"].values():
        terms["grants"] = [{"key": "project_slots", "value": 1}]
    with pytest.raises(ValidationError, match="consumable"):
        validate_payload(occupancy)


def test_explicit_ai_credit_policy_is_finite_versioned_and_bounded() -> None:
    payload = launch_pricing_v1_payload(provider_mode=None)
    payload["ai_credit_policy"] = {
        "version": "verified-rates-v1",
        "rates": [
            {
                "feature": "content",
                "model": "verified-model",
                "input_credits_per_million": 100,
                "cached_input_credits_per_million": 25,
                "output_credits_per_million": 300,
                "reasoning_credits_per_million": 300,
                "call_credit_cap": 50,
                "unknown_usage_charge": 10,
            }
        ],
    }
    policy = validate_payload(payload).ai_credit_policy
    assert policy is not None
    rate = policy.rate(feature="content", model="verified-model")
    assert rate is not None
    assert rate.charge({"input_tokens": 1_000_000, "output_tokens": 0}) == 50
    assert rate.charge({}) is None

    payload["ai_credit_policy"]["rates"][0]["unknown_usage_charge"] = 51
    with pytest.raises(ValidationError, match="must not exceed"):
        validate_payload(payload)


def test_platform_metadata_rejects_secret_shaped_fields() -> None:
    payload = launch_pricing_v1_payload(provider_mode=None)
    payload["platform_routes"] = [
        {
            "logical_engine": "chatgpt",
            "transport_provider": "openai",
            "model": "m",
            "api_key": "no",
        }
    ]
    with pytest.raises(ValidationError, match="invalid shape"):
        validate_payload(payload)


def test_operator_authorization_and_redaction() -> None:
    admin = User(email="admin@example.com", role="admin", is_active=True)
    require_operator(
        OperatorContext(
            actor=admin,
            reason="reviewed correction",
            idempotency_key="op-1",
            dry_run=True,
        )
    )
    user = User(email="user@example.com", role="user", is_active=True)
    with pytest.raises(PermissionError, match="active_admin_required"):
        require_operator(
            OperatorContext(
                actor=user, reason="x", idempotency_key="op-2", dry_run=True
            )
        )
    assert redact(
        {"api_key": "value", "nested": {"credential": "value"}, "account_id": "safe"}
    ) == {
        "api_key": "[REDACTED]",
        "nested": {"credential": "[REDACTED]"},
        "account_id": "safe",
    }


def test_inclusive_regional_price_rejects_additional_tax() -> None:
    with pytest.raises(ValidationError, match="Inclusive prices"):
        RegionalPricePayload(
            currency="USD",
            amount_minor=4900,
            tax_behavior="inclusive",
            tax_minor=100,
            provider_mode="test",
            provider_plan_name="Tier 1",
            fx_inr_per_usd="85",
            tax_rate="0",
            metadata="reviewed",
        )


def test_binding_provider_plans_covers_every_recurring_sku_exactly_once() -> None:
    """A new revision binds one immutable provider plan per SKU x region."""
    payload = launch_pricing_v1_payload(provider_mode="test")
    keys = {f"{key}:{region}" for key, region, _ in recurring_prices(payload)}
    assert keys == {
        "tier_1:international",
        "tier_2:international",
        "tier_3:international",
    }
    refs = {key: f"plan_{index}abc" for index, key in enumerate(sorted(keys))}
    bound = bind_plan_refs(payload, refs)
    assert {
        f"{key}:{region}": price["provider_price_ref"]
        for key, region, price in recurring_prices(bound)
    } == refs
    # The source revision is untouched: revisions are immutable.
    assert all(
        not price["provider_price_ref"] for _, _, price in recurring_prices(payload)
    )

    partial = dict(list(refs.items())[:2])
    with pytest.raises(ValueError, match="cover exactly"):
        bind_plan_refs(payload, partial)
    malformed = {**refs, "tier_1:international": "price_x"}
    with pytest.raises(ValueError, match="malformed"):
        bind_plan_refs(payload, malformed)
    shared = dict.fromkeys(refs, "plan_shared")
    with pytest.raises(ValidationError, match="only one SKU"):
        bind_plan_refs(payload, shared)
