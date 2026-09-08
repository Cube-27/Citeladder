from __future__ import annotations

import hashlib
import uuid
from datetime import UTC, datetime

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.billing import BillingAccount
from app.models.billing_invoice import BillingInvoice
from app.models.billing_payment import BillingPayment
from app.models.user import User
from tests.component.auth_helpers import register_and_login


@pytest.mark.asyncio
async def test_paid_receipt_list_download_and_account_isolation(
    client: httpx.AsyncClient, db_session: AsyncSession
) -> None:
    owner_email = f"invoice-owner-{uuid.uuid4().hex[:12]}@example.com"
    await register_and_login(client, owner_email)
    owner = await db_session.scalar(select(User).where(User.email == owner_email))
    assert owner is not None
    account = await db_session.scalar(
        select(BillingAccount).where(BillingAccount.owner_user_id == owner.id)
    )
    assert account is not None
    paid_at = datetime(2026, 9, 8, 10, 30, tzinfo=UTC)
    payment = BillingPayment(
        billing_account_id=account.id,
        provider="razorpay",
        receipt_kind="payment",
        external_payment_id=f"pay_{uuid.uuid4().hex}",
        amount_minor=118_000,
        currency="INR",
        provider_mode="test",
        payment_method="upi",
        status="paid",
        paid_at=paid_at,
        receipt_sha256="a" * 64,
    )
    db_session.add(payment)
    await db_session.flush()
    payload = {
        "paid_at": paid_at.isoformat(),
        "seller": {
            "legal_name": "CiteLadder Private Limited",
            "address": "Registered office",
            "email": "billing@example.test",
            "gstin": "27ABCDE1234F1Z5",
        },
        "customer": {
            "name": "Invoice Owner",
            "address_line1": "1 Test Road",
            "city": "Bengaluru",
            "postal_code": "560001",
            "state_code": "29",
            "country_code": "IN",
            "email": owner_email,
        },
        "line": {
            "description": "CiteLadder Tier 1 subscription",
            "quantity": 1,
            "unit_price_minor": 100_000,
            "amount_minor": 100_000,
            "sac": "998313",
        },
        "amounts": {
            "subtotal_minor": 100_000,
            "discount_minor": 0,
            "taxable_minor": 100_000,
            "cgst_minor": 0,
            "sgst_minor": 0,
            "igst_minor": 18_000,
            "tax_minor": 18_000,
            "total_minor": 118_000,
            "currency": "INR",
            "tax_rate": "0.18",
            "tax_treatment": "IGST",
        },
        "payment": {"method": "upi"},
    }
    invoice = BillingInvoice(
        billing_account_id=account.id,
        payment_id=payment.id,
        invoice_number="CL/2026-27/000001",
        receipt_number="CL-R/2026-27/000001",
        financial_year="2026-27",
        document_kind="gst_tax_receipt",
        invoice_date=paid_at.date(),
        paid_at=paid_at,
        currency="INR",
        total_amount_minor=118_000,
        tax_treatment="IGST",
        tax_policy_version=1,
        payload=payload,
        payload_sha256=hashlib.sha256(repr(payload).encode()).hexdigest(),
    )
    db_session.add(invoice)
    await db_session.commit()

    listed = await client.get("/api/v1/billing/invoices")
    assert listed.status_code == 200
    assert listed.json()["invoices"][0] == {
        "invoice_id": str(invoice.id),
        "invoice_number": invoice.invoice_number,
        "receipt_number": invoice.receipt_number,
        "status": "paid",
        "paid_at": paid_at.isoformat().replace("+00:00", "Z"),
        "amount_paid": {"currency": "INR", "amount_minor": 118_000},
        "subtotal_price": {"currency": "INR", "amount_minor": 100_000},
        "discount": {"currency": "INR", "amount_minor": 0},
        "taxable_value": {"currency": "INR", "amount_minor": 100_000},
        "tax_treatment": "IGST",
        "tax_rate": "0.18",
        "cgst": {"currency": "INR", "amount_minor": 0},
        "sgst": {"currency": "INR", "amount_minor": 0},
        "igst": {"currency": "INR", "amount_minor": 18_000},
        "payment_id": None,
    }
    downloaded = await client.get(f"/api/v1/billing/invoices/{invoice.id}/pdf")
    assert downloaded.status_code == 200
    assert downloaded.headers["content-type"] == "application/pdf"
    assert downloaded.content.startswith(b"%PDF-")

    await register_and_login(
        client, f"invoice-other-{uuid.uuid4().hex[:12]}@example.com"
    )
    forbidden = await client.get(f"/api/v1/billing/invoices/{invoice.id}/pdf")
    assert forbidden.status_code == 404
