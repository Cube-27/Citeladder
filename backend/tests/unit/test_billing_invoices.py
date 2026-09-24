from __future__ import annotations

import uuid
from datetime import UTC, date, datetime

import pytest

from app.domain.billing.invoice_pdf import render_invoice_pdf
from app.domain.billing.invoices import _credit_amounts, document_number, financial_year
from app.models.billing_invoice import BillingInvoice


def _invoice() -> BillingInvoice:
    paid_at = datetime(2026, 9, 8, 10, 30, tzinfo=UTC)
    return BillingInvoice(
        id=uuid.uuid4(),
        billing_account_id=uuid.uuid4(),
        payment_id=uuid.uuid4(),
        invoice_number="CL/2026-27/000001",
        receipt_number="CL-R/2026-27/000001",
        financial_year="2026-27",
        document_kind="gst_tax_receipt",
        invoice_date=paid_at.date(),
        paid_at=paid_at,
        currency="INR",
        total_amount_minor=199_900,
        tax_treatment="IGST",
        tax_policy_version=1,
        payload={
            "document_kind": "gst_tax_receipt",
            "invoice_number": "CL/2026-27/000001",
            "receipt_number": "CL-R/2026-27/000001",
            "paid_at": paid_at.isoformat(),
            "seller": {
                "legal_name": "CiteLadder Private Limited",
                "address": "Registered office address",
                "email": "billing@example.test",
                "gstin": "23ABCDE1234F1Z5",
            },
            "customer": {
                "name": "Fixture Buyer",
                "address_line1": "55 Ahinsa Vihar",
                "city": "Bhopal",
                "postal_code": "462001",
                "state_code": "23",
                "country_code": "IN",
                "email": "buyer@example.test",
            },
            "line": {
                "description": "CiteLadder Pro subscription",
                "quantity": 1,
                "unit_price_minor": 169_407,
                "amount_minor": 169_407,
                "period_start": "2026-09-08T00:00:00+00:00",
                "period_end": "2026-10-08T00:00:00+00:00",
            },
            "amounts": {
                "subtotal_minor": 169_407,
                "discount_minor": 0,
                "taxable_minor": 169_407,
                "cgst_minor": 0,
                "sgst_minor": 0,
                "igst_minor": 30_493,
                "tax_minor": 30_493,
                "total_minor": 199_900,
                "currency": "INR",
                "tax_rate": "0.18",
                "tax_treatment": "IGST",
            },
            "payment": {"method": "upi"},
        },
        payload_sha256="a" * 64,
    )


def test_financial_year_uses_indian_april_boundary() -> None:
    assert financial_year(date(2026, 3, 31)) == "2025-26"
    assert financial_year(date(2026, 4, 1)) == "2026-27"


def test_paid_receipt_pdf_is_a_nonempty_static_pdf() -> None:
    rendered = render_invoice_pdf(_invoice())
    assert rendered.startswith(b"%PDF-")
    assert len(rendered) > 2_000


@pytest.mark.parametrize(
    ("treatment", "cgst", "sgst", "igst"),
    [("IGST", 0, 0, 18), ("CGST_SGST", 9, 9, 0)],
)
def test_partial_credits_always_sum_to_the_original_components(
    treatment: str, cgst: int, sgst: int, igst: int
) -> None:
    original = {
        "taxable_minor": 100,
        "cgst_minor": cgst,
        "sgst_minor": sgst,
        "igst_minor": igst,
        "total_minor": 118,
        "currency": "INR",
        "tax_rate": "0.18",
        "tax_treatment": treatment,
    }
    credited = dict.fromkeys(
        ("taxable_minor", "cgst_minor", "sgst_minor", "igst_minor"), 0
    )
    # Eighteen tiny refunds, then the remainder: rounding never drifts.
    for refund in [1] * 18 + [100]:
        note = _credit_amounts(original, credited, refund)
        for key in credited:
            credited[key] += note[key]
            assert credited[key] <= original[key]
    assert credited == {
        "taxable_minor": 100,
        "cgst_minor": cgst,
        "sgst_minor": sgst,
        "igst_minor": igst,
    }


def test_document_numbers_fit_the_gst_limit() -> None:
    assert document_number("CL", "", "2026-27", 1) == "CL/2627/000001"
    assert document_number("ABC", "C", "2026-27", 999_999) == "ABCC/2627/999999"
