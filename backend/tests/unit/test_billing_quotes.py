"""Server-resolved commercial quote and provisioning contracts."""

from __future__ import annotations

from dataclasses import replace
from datetime import UTC, datetime
from decimal import Decimal

import pytest
from pydantic import SecretStr

from app.core.config.billing_catalog import (
    commercial_catalog,
    scale_grant_specs,
    topup_grant_specs,
)
from app.core.config.billing_contracts import (
    ADDON_EXTRA_PROJECT,
    REGION_INDIA,
    REGION_INTERNATIONAL,
    TOPUP_AUDIT_CREDITS,
)
from app.core.config.billing_settings import (
    billing_settings,
)
from app.core.config.entitlements import KEY_AUDIT_CREDITS
from app.domain.billing.service import (
    BillingConflictError,
    resolve_addon_intent,
    resolve_base_intent,
)


class _CatalogSession:
    async def scalar(self, _statement):
        return None


@pytest.fixture(autouse=True)
def _published_catalog(monkeypatch: pytest.MonkeyPatch) -> None:
    async def load(_session):
        catalog = commercial_catalog()
        return replace(
            catalog,
            plans=tuple(
                replace(
                    plan,
                    base_prices={
                        region: replace(price, provider_mode="test", tax_verified=True)
                        for region, price in plan.base_prices.items()
                    },
                )
                for plan in catalog.plans
            ),
        )

    monkeypatch.setattr("app.domain.billing.service.published_commercial_catalog", load)


def _enable_checkout(monkeypatch, refs) -> None:
    for name, value in (
        ("checkout_enabled", True),
        ("razorpay_mode", "test"),
        ("razorpay_key_id", "rzp_test_fixture"),
        ("razorpay_key_secret", SecretStr("synthetic-api")),
        ("quote_signing_secret", SecretStr("synthetic-quote")),
        ("razorpay_test_ready", True),
        ("razorpay_test_international_ready", True),
        ("razorpay_test_india_ready", True),
        ("razorpay_live_ready", True),
        ("razorpay_international_ready", True),
        ("provider_price_refs", refs),
    ):
        monkeypatch.setattr(billing_settings, name, value)


async def test_base_quote_separates_byok_and_funded_prices(monkeypatch) -> None:
    refs = {f"tier_1:{REGION_INTERNATIONAL}:base": "ref_private"}
    _enable_checkout(monkeypatch, refs)
    now = datetime.now(UTC)
    quote = (
        await resolve_base_intent(
            _CatalogSession(),
            catalog_key="tier_1",
            credential_mode="byok",
            country_code=" us ",
            at=now,
        )
    ).quote
    assert (
        quote.catalog_key,
        quote.catalog_revision,
        quote.credential_mode,
        quote.region,
    ) == ("tier_1", billing_settings.catalog_version, "byok", REGION_INTERNATIONAL)
    assert (
        quote.base_price.amount_minor,
        quote.credit_price,
        quote.tax.amount_minor,
        quote.total_price.amount_minor,
    ) == (9_900, None, 0, 9_900)
    assert "ref_private" not in quote.model_dump_json()
    monkeypatch.setattr(billing_settings, "funded_margin_bps", 2_000)
    monkeypatch.setattr(
        billing_settings,
        "provider_price_refs",
        {**refs, f"tier_1:{REGION_INTERNATIONAL}:credit": "ref_credit"},
    )
    with pytest.raises(BillingConflictError, match="checkout_unavailable"):
        await resolve_base_intent(
            _CatalogSession(),
            catalog_key="tier_1",
            credential_mode="funded",
            country_code="US",
            at=now,
        )


async def test_base_quote_refuses_unknown_or_unavailable_checkout(monkeypatch) -> None:
    _enable_checkout(
        monkeypatch, {f"tier_1:{REGION_INTERNATIONAL}:base": "ref_private"}
    )
    now = datetime.now(UTC)
    for kwargs, error in (
        ({"catalog_key": "nope", "credential_mode": "byok"}, "catalog_key_unknown"),
        (
            {"catalog_key": "tier_1", "credential_mode": "funded"},
            "checkout_unavailable",
        ),
    ):
        with pytest.raises(BillingConflictError, match=error):
            await resolve_base_intent(
                _CatalogSession(), **kwargs, country_code="US", at=now
            )
    monkeypatch.setattr(billing_settings, "checkout_enabled", False)
    with pytest.raises(BillingConflictError, match="checkout_unavailable"):
        await resolve_base_intent(
            _CatalogSession(),
            catalog_key="tier_1",
            credential_mode="byok",
            country_code="US",
            at=now,
        )


async def test_india_quote_applies_configured_gst(monkeypatch) -> None:
    _enable_checkout(monkeypatch, {f"tier_1:{REGION_INDIA}:base": "ref_private_in"})
    monkeypatch.setattr(billing_settings, "usd_inr_rate", Decimal("83"))
    quote = (
        await resolve_base_intent(
            _CatalogSession(),
            catalog_key="tier_1",
            credential_mode="byok",
            country_code="IN",
            at=datetime.now(UTC),
        )
    ).quote
    assert (quote.region, quote.base_price.currency, quote.base_price.amount_minor) == (
        REGION_INDIA,
        "INR",
        9_900 * 83,
    )
    assert (
        quote.total_price.amount_minor
        == quote.base_price.amount_minor + quote.tax.amount_minor
        == 9_900 * 83 + round(9_900 * 83 * 0.18)
    )


async def test_addon_quote_bounds_quantity_and_availability(monkeypatch) -> None:
    _enable_checkout(
        monkeypatch,
        {f"{ADDON_EXTRA_PROJECT}:{REGION_INTERNATIONAL}:base": "ref_private"},
    )
    now = datetime.now(UTC)
    for key, quantity, error in (
        (ADDON_EXTRA_PROJECT, 1, "checkout_unavailable"),
        ("nope", 1, "catalog_key_unknown"),
    ):
        with pytest.raises(BillingConflictError, match=error):
            await resolve_addon_intent(
                _CatalogSession(),
                catalog_key=key,
                quantity=quantity,
                country_code="US",
                at=now,
            )
    monkeypatch.setattr(billing_settings, "addon_extra_project_usd_minor", 1_900)
    with pytest.raises(BillingConflictError, match="quantity_out_of_bounds"):
        await resolve_addon_intent(
            _CatalogSession(),
            catalog_key=ADDON_EXTRA_PROJECT,
            quantity=21,
            country_code="US",
            at=now,
        )
    quote = (
        await resolve_addon_intent(
            _CatalogSession(),
            catalog_key=ADDON_EXTRA_PROJECT,
            quantity=3,
            country_code="US",
            at=now,
        )
    ).quote
    assert (quote.total_price.amount_minor, quote.credential_mode) == (
        3 * 1_900,
        "byok",
    )


def test_topup_specs_and_provisioning_refs(monkeypatch) -> None:
    version = billing_settings.catalog_version
    assert topup_grant_specs(TOPUP_AUDIT_CREDITS, version) is None
    monkeypatch.setattr(billing_settings, "topup_audit_credits_per_pack", 25)
    specs = topup_grant_specs(TOPUP_AUDIT_CREDITS, version)
    assert specs == ((KEY_AUDIT_CREDITS, 25),)
    assert scale_grant_specs(specs, 3) == ((KEY_AUDIT_CREDITS, 75),)
    with pytest.raises(ValueError, match=">= 1"):
        scale_grant_specs(specs, 0)
    assert (
        topup_grant_specs(TOPUP_AUDIT_CREDITS, "billing-v1")
        is topup_grant_specs("nope", version)
        is None
    )
