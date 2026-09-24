"""Server-resolved commercial quote and provisioning contracts."""

from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal

import pytest
from pydantic import SecretStr

from app.core.config.billing_catalog import scale_grant_specs
from app.core.config.billing_contracts import (
    ADDON_EXTRA_PROJECT,
    REGION_INDIA,
    REGION_INTERNATIONAL,
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
from tests.billing_catalog_support import TEST_CATALOG_REVISION, launch_catalog
from tests.billing_settings_support import apply_billing_settings
from tests.component.billing_catalog_helpers import (
    apply_seller_settings,
    seller_settings,
)


class _CatalogSession:
    async def scalar(self, _statement):
        return None


# Operator plan refs for the current test, keyed "{plan_key}:{region}".
_refs: dict[str, str] = {}


@pytest.fixture(autouse=True)
def _published_catalog(monkeypatch: pytest.MonkeyPatch) -> None:
    apply_seller_settings(monkeypatch)
    monkeypatch.setattr(billing_settings, "invoice_prefix", "CL")
    _refs.clear()

    async def load(_session):
        return launch_catalog(refs=_refs)

    monkeypatch.setattr("app.domain.billing.service.published_commercial_catalog", load)


def _enable_checkout(monkeypatch, refs: dict[str, str]) -> None:
    _refs.update(refs)
    apply_billing_settings(
        monkeypatch,
        {
            "checkout_enabled": True,
            "razorpay_mode": "test",
            "razorpay_key_id": "rzp_test_fixture",
            "razorpay_key_secret": SecretStr("synthetic-api"),
            "quote_signing_secret": SecretStr("synthetic-quote"),
            "razorpay_test_ready": True,
            "razorpay_test_international_ready": True,
            "razorpay_test_india_ready": True,
            "razorpay_live_ready": True,
            "razorpay_international_ready": True,
            **seller_settings(),
        },
    )


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
    refs = {f"tier_1:{REGION_INTERNATIONAL}": "ref_private"}
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
    ) == ("tier_1", TEST_CATALOG_REVISION, "byok", REGION_INTERNATIONAL)
    assert (
        quote.base_price.amount_minor,
        quote.credit_price,
        quote.tax.amount_minor,
        quote.total_price.amount_minor,
    ) == (4_900, None, 0, 4_900)
    assert "ref_private" not in quote.model_dump_json()
    assert "Ada Buyer" not in quote.model_dump_json()
    # The funded price is published but funded checkout is not sold at launch.
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
    _enable_checkout(monkeypatch, {f"tier_1:{REGION_INTERNATIONAL}": "ref_private"})
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


async def test_india_quote_adds_gst_to_the_frozen_inr_price(monkeypatch) -> None:
    _enable_checkout(monkeypatch, {f"tier_1:{REGION_INDIA}": "ref_private_in"})
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
        449_900,
    )
    assert quote.tax_treatment == "CGST_SGST"
    assert quote.cgst.amount_minor == quote.sgst.amount_minor
    assert (
        quote.total_price.amount_minor
        == quote.base_price.amount_minor + quote.tax.amount_minor
        == 449_900 + 80_982
    )


async def test_addon_quote_bounds_quantity_and_availability(monkeypatch) -> None:
    _enable_checkout(
        monkeypatch,
        {f"{ADDON_EXTRA_PROJECT}:{REGION_INTERNATIONAL}": "ref_private"},
    )
    now = datetime.now(UTC)
    for key, quantity, error in (("nope", 1, "catalog_key_unknown"),):
        with pytest.raises(BillingConflictError, match=error):
            await resolve_addon_intent(
                _CatalogSession(),
                catalog_key=key,
                quantity=quantity,
                country_code="US",
                at=now,
                base_plan_key="tier_1",
                billing_identity=_identity(export=True),
            )
    with pytest.raises(BillingConflictError, match="quantity_out_of_bounds"):
        await resolve_addon_intent(
            _CatalogSession(),
            catalog_key=ADDON_EXTRA_PROJECT,
            quantity=21,
            country_code="US",
            at=now,
            base_plan_key="tier_1",
            billing_identity=_identity(export=True),
        )
    quote = (
        await resolve_addon_intent(
            _CatalogSession(),
            catalog_key=ADDON_EXTRA_PROJECT,
            quantity=3,
            country_code="US",
            at=now,
            base_plan_key="tier_1",
            billing_identity=_identity(export=True),
        )
    ).quote
    assert (quote.total_price.amount_minor, quote.credential_mode) == (
        3 * 1_900,
        "byok",
    )


def test_grant_specs_scale_with_the_purchased_quantity() -> None:
    specs = ((KEY_AUDIT_CREDITS, 1_000),)
    assert scale_grant_specs(specs, 3) == ((KEY_AUDIT_CREDITS, 3_000),)
    with pytest.raises(ValueError, match=">= 1"):
        scale_grant_specs(specs, 0)


async def test_base_quote_applies_interstate_and_export_policy(monkeypatch) -> None:
    _enable_checkout(
        monkeypatch,
        {
            f"tier_1:{REGION_INDIA}": "ref_private_in",
            f"tier_1:{REGION_INTERNATIONAL}": "ref_private_us",
        },
    )
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
        80_982,
    )
    assert (exported.tax_treatment, exported.tax.amount_minor) == (
        "EXPORT_ZERO_RATED",
        0,
    )


async def test_base_quote_fails_closed_without_export_evidence(monkeypatch) -> None:
    _enable_checkout(monkeypatch, {f"tier_1:{REGION_INTERNATIONAL}": "ref"})
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


async def test_checkout_refuses_a_quote_the_provider_plan_would_not_charge(
    monkeypatch,
) -> None:
    """The provider plan bills its provisioned gross; a quote that disagrees
    (the approved GST rate changed after provisioning) must not reach it.
    """
    _enable_checkout(monkeypatch, {f"tier_1:{REGION_INDIA}": "ref_private_in"})
    provisioned = launch_catalog(refs=_refs)  # authored at the fixture 18% GST

    async def load(_session):
        return provisioned

    monkeypatch.setattr("app.domain.billing.service.published_commercial_catalog", load)
    monkeypatch.setattr(billing_settings, "india_gst_rate", Decimal("0.12"))
    with pytest.raises(BillingConflictError, match="checkout_unavailable"):
        await resolve_base_intent(
            _CatalogSession(),
            catalog_key="tier_1",
            credential_mode="byok",
            country_code="IN",
            billing_identity=_identity(state_code="27"),
            at=datetime.now(UTC),
        )
