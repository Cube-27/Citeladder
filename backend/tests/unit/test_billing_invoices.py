from __future__ import annotations

from datetime import date

import pytest

from app.domain.billing.invoices import _credit_amounts, document_number, financial_year


def test_financial_year_uses_indian_april_boundary() -> None:
    assert financial_year(date(2026, 3, 31)) == "2025-26"
    assert financial_year(date(2026, 4, 1)) == "2026-27"


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
