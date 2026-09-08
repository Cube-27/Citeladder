"""Deterministic, transaction-level billing tax policy (version 1)."""

from __future__ import annotations

from dataclasses import asdict, dataclass
from decimal import ROUND_HALF_UP, Decimal
from typing import cast

from app.core.config.billing_settings import billing_settings

TAX_POLICY_VERSION = 1
INDIA_COUNTRY_CODE = "IN"


class TaxPolicyError(ValueError):
    """A buyer's declared facts cannot support a safe tax treatment."""


@dataclass(frozen=True, slots=True)
class BillingIdentity:
    name: str
    address_line1: str
    city: str
    state_code: str | None
    postal_code: str
    customer_gstin: str | None
    export_eligibility_attested: bool

    def snapshot(self) -> dict[str, object]:
        return asdict(self)

    @classmethod
    def from_snapshot(cls, value: dict[str, object]) -> BillingIdentity:
        """Restore the normalized facts retained with a billing profile."""
        required = ("name", "address_line1", "city", "postal_code")
        incomplete = any(
            not isinstance(value.get(key), str) or not value[key] for key in required
        )
        if incomplete:
            raise TaxPolicyError("billing profile is incomplete")
        state_code = value.get("state_code")
        customer_gstin = value.get("customer_gstin")
        if state_code is not None and not isinstance(state_code, str):
            raise TaxPolicyError("billing profile state is invalid")
        if customer_gstin is not None and not isinstance(customer_gstin, str):
            raise TaxPolicyError("billing profile GSTIN is invalid")
        return cls(
            name=cast(str, value["name"]),
            address_line1=cast(str, value["address_line1"]),
            city=cast(str, value["city"]),
            state_code=state_code,
            postal_code=cast(str, value["postal_code"]),
            customer_gstin=customer_gstin,
            export_eligibility_attested=value.get("export_eligibility_attested")
            is True,
        )


@dataclass(frozen=True, slots=True)
class TaxCalculation:
    subtotal_minor: int
    discount_minor: int
    taxable_minor: int
    treatment: str
    tax_rate: Decimal
    cgst_minor: int
    sgst_minor: int
    igst_minor: int
    tax_minor: int
    total_minor: int
    policy_version: int = TAX_POLICY_VERSION

    def snapshot(self) -> dict[str, object]:
        return {
            "subtotal_minor": self.subtotal_minor,
            "discount_minor": self.discount_minor,
            "taxable_minor": self.taxable_minor,
            "treatment": self.treatment,
            "tax_rate": str(self.tax_rate),
            "cgst_minor": self.cgst_minor,
            "sgst_minor": self.sgst_minor,
            "igst_minor": self.igst_minor,
            "tax_minor": self.tax_minor,
            "total_minor": self.total_minor,
            "policy_version": self.policy_version,
        }


def _tax_minor(amount_minor: int, rate: Decimal) -> int:
    return int((Decimal(amount_minor) * rate).quantize(Decimal("1"), ROUND_HALF_UP))


def _require_invoice_configuration() -> None:
    required = (
        billing_settings.seller_legal_name,
        billing_settings.seller_legal_address,
        billing_settings.seller_email,
        billing_settings.seller_gstin,
        billing_settings.seller_gst_state_code,
        billing_settings.seller_gst_state_name,
        billing_settings.seller_sac,
        billing_settings.invoice_prefix,
    )
    if any(not value.strip() for value in required):
        raise TaxPolicyError("seller invoice configuration is incomplete")


def calculate_tax(
    *,
    subtotal_minor: int,
    discount_minor: int,
    currency: str,
    country_code: str,
    identity: BillingIdentity,
) -> TaxCalculation:
    """Determine one final charge from normalized buyer facts.

    Discounts are deliberately applied before tax.  The caller must retain the
    returned snapshot with its seller settings; a provider charge is never tax
    evidence by itself.
    """
    _require_invoice_configuration()
    if subtotal_minor < 0 or not 0 <= discount_minor <= subtotal_minor:
        raise TaxPolicyError("discount must be between zero and the subtotal")
    taxable_minor = subtotal_minor - discount_minor
    if country_code == INDIA_COUNTRY_CODE:
        return _calculate_india(
            subtotal_minor, discount_minor, taxable_minor, currency, identity
        )
    return _calculate_export(
        subtotal_minor, discount_minor, taxable_minor, currency, identity
    )


def _calculate_india(
    subtotal_minor: int,
    discount_minor: int,
    taxable_minor: int,
    currency: str,
    identity: BillingIdentity,
) -> TaxCalculation:
    gst_rate = billing_settings.india_gst_rate
    if not Decimal("0") <= gst_rate <= Decimal("1"):
        raise TaxPolicyError("Indian GST rate is invalid")
    if currency != "INR" or not identity.state_code:
        raise TaxPolicyError("Indian billing requires INR and a billing state")
    total_gst_minor = _tax_minor(taxable_minor, gst_rate)
    if identity.state_code == billing_settings.seller_gst_state_code:
        cgst_minor = total_gst_minor // 2
        sgst_minor = total_gst_minor - cgst_minor
        return TaxCalculation(
            subtotal_minor,
            discount_minor,
            taxable_minor,
            "CGST_SGST",
            gst_rate,
            cgst_minor,
            sgst_minor,
            0,
            total_gst_minor,
            taxable_minor + total_gst_minor,
        )
    return TaxCalculation(
        subtotal_minor,
        discount_minor,
        taxable_minor,
        "IGST",
        gst_rate,
        0,
        0,
        total_gst_minor,
        total_gst_minor,
        taxable_minor + total_gst_minor,
    )


def _calculate_export(
    subtotal_minor: int,
    discount_minor: int,
    taxable_minor: int,
    currency: str,
    identity: BillingIdentity,
) -> TaxCalculation:
    if (
        currency != "USD"
        or not billing_settings.seller_lut_reference.strip()
        or not identity.export_eligibility_attested
    ):
        raise TaxPolicyError("export checkout requires USD, LUT, and attestation")
    return TaxCalculation(
        subtotal_minor,
        discount_minor,
        taxable_minor,
        "EXPORT_ZERO_RATED",
        Decimal("0"),
        0,
        0,
        0,
        0,
        taxable_minor,
    )


def tax_snapshot(
    *, identity: BillingIdentity, calculation: TaxCalculation
) -> dict[str, object]:
    """Private invoice evidence bound to the quote digest and pending intent."""
    return {
        "customer": identity.snapshot(),
        "seller": {
            "legal_name": billing_settings.seller_legal_name,
            "address": billing_settings.seller_legal_address,
            "email": billing_settings.seller_email,
            "gstin": billing_settings.seller_gstin,
            "state_code": billing_settings.seller_gst_state_code,
            "state_name": billing_settings.seller_gst_state_name,
            "sac": billing_settings.seller_sac,
            "lut_reference": billing_settings.seller_lut_reference,
            "invoice_prefix": billing_settings.invoice_prefix,
        },
        "tax": calculation.snapshot(),
    }
