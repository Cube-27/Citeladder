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
from app.core.config.billing_tax import BillingIdentity, calculate_tax
from app.core.config.entitlements import KEY_AUDIT_CREDITS
from app.domain.billing.schemas import SubscriptionCreateRequest
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
    for name, value in (
        ("seller_legal_name", "CiteLadder Private Limited"),
        ("seller_legal_address", "1 Seller Street, Mumbai"),
        ("seller_email", "billing@example.test"),
        ("seller_gstin", "27ABCDE1234F1Z5"),
        ("seller_gst_state_code", "27"),
        ("seller_gst_state_name", "Maharashtra"),
        ("seller_sac", "998313"),
        ("invoice_prefix", "CL"),
    ):
        monkeypatch.setattr(billing_settings, name, value)

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
        ("seller_legal_name", "CiteLadder Private Limited"),
        ("seller_legal_address", "1 Seller Street, Mumbai"),
        ("seller_email", "billing@example.test"),
        ("seller_gstin", "27ABCDE1234F1Z5"),
        ("seller_gst_state_code", "27"),
        ("seller_gst_state_name", "Maharashtra"),
        ("seller_sac", "998313"),
        ("seller_lut_reference", "LUT/2026/001"),
    ):
        monkeypatch.setattr(billing_settings, name, value)


def _identity(
    *, state_code: str | None = None, export: bool = False
) -> BillingIdentity:
    return BillingIdentity(
        name="Ada Buyer",
        address_line1="1 Buyer Street",
        city="Mumbai",
        state_code=state_code,
        postal_code="400001",
        customer_gstin=None,
        export_eligibility_attested=export,
    )


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
            billing_identity=_identity(export=True),
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
    assert "Ada Buyer" not in quote.model_dump_json()
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
            billing_identity=_identity(export=True),
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
                _CatalogSession(),
                **kwargs,
                country_code="US",
                billing_identity=_identity(export=True),
                at=now,
            )
    monkeypatch.setattr(billing_settings, "checkout_enabled", False)
    with pytest.raises(BillingConflictError, match="checkout_unavailable"):
        await resolve_base_intent(
            _CatalogSession(),
            catalog_key="tier_1",
            credential_mode="byok",
            country_code="US",
            billing_identity=_identity(export=True),
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
            billing_identity=_identity(state_code="27"),
            at=datetime.now(UTC),
        )
    ).quote
    assert (quote.region, quote.base_price.currency, quote.base_price.amount_minor) == (
        REGION_INDIA,
        "INR",
        9_900 * 83,
    )
    assert (
        quote.tax_treatment == "CGST_SGST"
        and quote.cgst.amount_minor == quote.sgst.amount_minor
        and quote.total_price.amount_minor
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
                billing_identity=_identity(export=True),
            )
    monkeypatch.setattr(billing_settings, "addon_extra_project_usd_minor", 1_900)
    with pytest.raises(BillingConflictError, match="quantity_out_of_bounds"):
        await resolve_addon_intent(
            _CatalogSession(),
            catalog_key=ADDON_EXTRA_PROJECT,
            quantity=21,
            country_code="US",
            at=now,
            billing_identity=_identity(export=True),
        )
    quote = (
        await resolve_addon_intent(
            _CatalogSession(),
            catalog_key=ADDON_EXTRA_PROJECT,
            quantity=3,
            country_code="US",
            at=now,
            billing_identity=_identity(export=True),
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


async def test_base_quote_applies_interstate_and_export_policy(monkeypatch) -> None:
    _enable_checkout(
        monkeypatch,
        {
            f"tier_1:{REGION_INDIA}:base": "ref_private_in",
            f"tier_1:{REGION_INTERNATIONAL}:base": "ref_private_us",
        },
    )
    monkeypatch.setattr(billing_settings, "usd_inr_rate", Decimal("83"))
    now = datetime.now(UTC)
    interstate = (
        await resolve_base_intent(
            _CatalogSession(),
            catalog_key="tier_1",
            credential_mode="byok",
            country_code="IN",
            billing_identity=_identity(state_code="29"),
            at=now,
        )
    ).quote
    exported = (
        await resolve_base_intent(
            _CatalogSession(),
            catalog_key="tier_1",
            credential_mode="byok",
            country_code="US",
            billing_identity=_identity(export=True),
            at=now,
        )
    ).quote
    assert (interstate.tax_treatment, interstate.igst.amount_minor) == (
        "IGST",
        round(9_900 * 83 * 0.18),
    )
    assert (exported.tax_treatment, exported.tax.amount_minor) == (
        "EXPORT_ZERO_RATED",
        0,
    )


async def test_base_quote_fails_closed_without_export_evidence(monkeypatch) -> None:
    _enable_checkout(monkeypatch, {f"tier_1:{REGION_INTERNATIONAL}:base": "ref"})
    now = datetime.now(UTC)
    for identity in (_identity(), _identity(export=True)):
        if identity.export_eligibility_attested:
            monkeypatch.setattr(billing_settings, "seller_lut_reference", "")
        with pytest.raises(BillingConflictError, match="checkout_unavailable"):
            await resolve_base_intent(
                _CatalogSession(),
                catalog_key="tier_1",
                credential_mode="byok",
                country_code="US",
                billing_identity=identity,
                at=now,
            )


def test_billing_identity_validation_and_discount_before_tax(monkeypatch) -> None:
    with pytest.raises(ValueError, match="state prefix"):
        SubscriptionCreateRequest(
            catalog_key="tier_1",
            credential_mode="byok",
            country_code="IN",
            billing_name="Buyer",
            billing_address_line1="1 Street",
            billing_city="Pune",
            billing_state_code="27",
            billing_postal_code="400001",
            customer_gstin="29ABCDE1234F1Z5",
        )
    monkeypatch.setattr(billing_settings, "seller_gstin", "27ABCDE1234F1Z5")
    monkeypatch.setattr(billing_settings, "seller_gst_state_code", "27")
    calculation = calculate_tax(
        subtotal_minor=10_000,
        discount_minor=1_000,
        currency="INR",
        country_code="IN",
        identity=_identity(state_code="27"),
    )
    assert (
        calculation.taxable_minor,
        calculation.tax_minor,
        calculation.total_minor,
    ) == (9_000, 1_620, 10_620)
