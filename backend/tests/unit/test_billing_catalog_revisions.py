from __future__ import annotations

import copy

import pytest
from pydantic import ValidationError

from app.domain.billing.admin import OperatorContext, redact, require_operator
from app.domain.billing.catalog_revisions import (
    RegionalPricePayload,
    approved_phase1_payload,
    validate_payload,
)
from app.models.user import User


def test_phase1_seed_has_approved_terms_and_disabled_campaign() -> None:
    payload = validate_payload(approved_phase1_payload())
    plans = {plan.key: plan for plan in payload.plans}
    assert (
        plans["tier_1"].byok_price.amount_minor,
        plans["tier_1"].funded_price.amount_minor,
    ) == (4_900, 9_900)
    assert (
        plans["tier_2"].byok_price.amount_minor,
        plans["tier_2"].funded_price.amount_minor,
    ) == (9_900, 14_900)
    assert (
        plans["tier_3"].byok_price.amount_minor,
        plans["tier_3"].funded_price.amount_minor,
    ) == (14_900, 29_900)
    assert "checkout_enabled" not in payload.model_dump()
    assert payload.campaign.state == "draft"
    assert payload.campaign.enabled is False
    assert payload.campaign.claim_available is False
    assert payload.campaign.cohort_started_at is None
    assert payload.campaign.ends_at is None
    assert payload.campaign.duration_days == 7


def test_invalid_catalog_rejects_unknown_capability_and_changed_price() -> None:
    unknown = copy.deepcopy(approved_phase1_payload())
    unknown["plans"][0]["grants"].append({"key": "unknown", "value": 1})
    with pytest.raises((ValidationError, ValueError)):
        validate_payload(unknown)
    changed = copy.deepcopy(approved_phase1_payload())
    changed["plans"][0]["byok_price"]["amount_minor"] = 1
    with pytest.raises(ValidationError, match="approved terms"):
        validate_payload(changed)


def test_explicit_ai_credit_policy_is_finite_versioned_and_bounded() -> None:
    payload = approved_phase1_payload()
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
    payload = approved_phase1_payload()
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
