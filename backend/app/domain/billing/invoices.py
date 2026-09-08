"""Issue immutable CiteLadder paid tax receipts from captured payments."""

from __future__ import annotations

import hashlib
import json
from datetime import date
from typing import Any, cast
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.billing import BillingAccount, PendingActivation
from app.models.billing_invoice import BillingInvoice, BillingInvoiceCounter
from app.models.billing_payment import BillingPayment
from app.models.user import User

_INDIA_ZONE = ZoneInfo("Asia/Kolkata")


class InvoiceEvidenceError(ValueError):
    """Captured payment and frozen tax evidence cannot form a receipt."""


def financial_year(day: date) -> str:
    start = day.year if day.month >= 4 else day.year - 1
    return f"{start:04d}-{(start + 1) % 100:02d}"


def _object(value: object, field: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise InvoiceEvidenceError(f"invoice_{field}_missing")
    return cast(dict[str, Any], value)


def _integer(value: object, field: str) -> int:
    if type(value) is not int or value < 0:
        raise InvoiceEvidenceError(f"invoice_{field}_invalid")
    return value


def _text(value: object, field: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise InvoiceEvidenceError(f"invoice_{field}_missing")
    return value.strip()


async def _next_serial(session: AsyncSession, year: str) -> int:
    await session.execute(
        insert(BillingInvoiceCounter)
        .values(financial_year=year, next_value=1)
        .on_conflict_do_nothing(index_elements=["financial_year"])
    )
    counter = await session.scalar(
        select(BillingInvoiceCounter)
        .where(BillingInvoiceCounter.financial_year == year)
        .with_for_update()
    )
    if counter is None:  # pragma: no cover - insert/select are one transaction
        raise InvoiceEvidenceError("invoice_counter_unavailable")
    serial = counter.next_value
    counter.next_value += 1
    return serial


def _description(pending: PendingActivation) -> str:
    label = pending.catalog_key.replace("_", " ").title()
    if pending.activation_kind == "base":
        return f"CiteLadder {label} subscription"
    if pending.activation_kind == "addon":
        return f"CiteLadder {label} add-on"
    return f"CiteLadder {label} top-up"


def _invoice_payload(
    *,
    pending: PendingActivation,
    payment: BillingPayment,
    owner_email: str,
    invoice_number: str,
    receipt_number: str,
    invoice_day: date,
) -> dict[str, object]:
    snapshot = _object(pending.tax_snapshot, "tax_snapshot")
    seller = _object(snapshot.get("seller"), "seller")
    customer = _object(snapshot.get("customer"), "customer")
    tax = _object(snapshot.get("tax"), "tax")
    quote = _object(pending.quote, "quote")
    subtotal = _integer(tax.get("subtotal_minor"), "subtotal")
    discount = _integer(tax.get("discount_minor"), "discount")
    taxable = _integer(tax.get("taxable_minor"), "taxable")
    tax_minor = _integer(tax.get("tax_minor"), "tax")
    total = _integer(tax.get("total_minor"), "total")
    if payment.paid_at is None or payment.status != "paid":
        raise InvoiceEvidenceError("invoice_payment_not_paid")
    if (payment.amount_minor, payment.currency) != (
        total,
        _text(
            _object(quote.get("total_price"), "quote_total").get("currency"), "currency"
        ),
    ):
        raise InvoiceEvidenceError("invoice_payment_total_mismatch")
    return {
        "schema_version": 1,
        "document_kind": (
            "export_receipt" if pending.country_code != "IN" else "gst_tax_receipt"
        ),
        "invoice_number": invoice_number,
        "receipt_number": receipt_number,
        "invoice_date": invoice_day.isoformat(),
        "paid_at": payment.paid_at.isoformat(),
        "seller": seller,
        "customer": {
            **customer,
            "country_code": pending.country_code,
            "email": owner_email,
        },
        "line": {
            "description": _description(pending),
            "quantity": pending.quantity,
            "unit_price_minor": subtotal // pending.quantity,
            "amount_minor": subtotal,
            "period_start": payment.period_start.isoformat()
            if payment.period_start
            else None,
            "period_end": payment.period_end.isoformat()
            if payment.period_end
            else None,
            "sac": seller.get("sac"),
        },
        "amounts": {
            "subtotal_minor": subtotal,
            "discount_minor": discount,
            "taxable_minor": taxable,
            "cgst_minor": _integer(tax.get("cgst_minor"), "cgst"),
            "sgst_minor": _integer(tax.get("sgst_minor"), "sgst"),
            "igst_minor": _integer(tax.get("igst_minor"), "igst"),
            "tax_minor": tax_minor,
            "total_minor": total,
            "currency": payment.currency,
            "tax_rate": _text(tax.get("tax_rate"), "tax_rate"),
            "tax_treatment": _text(tax.get("treatment"), "tax_treatment"),
        },
        "payment": {
            "method": payment.payment_method or "Online payment",
            "provider": payment.provider,
            "receipt_number": receipt_number,
        },
        "provenance": {
            "payment_receipt_sha256": payment.receipt_sha256,
            "quote_id": quote.get("quote_id"),
            "catalog_revision": pending.catalog_revision,
            "tax_policy_version": _integer(tax.get("policy_version"), "policy_version"),
        },
    }


async def issue_paid_invoice(
    session: AsyncSession,
    *,
    pending: PendingActivation,
    payment: BillingPayment,
) -> BillingInvoice:
    """Issue exactly one immutable receipt for one accepted payment."""
    existing = await session.scalar(
        select(BillingInvoice).where(BillingInvoice.payment_id == payment.id)
    )
    if existing is not None:
        return existing
    if payment.paid_at is None:
        raise InvoiceEvidenceError("invoice_paid_at_missing")
    # BillingAccount owns the user boundary; resolve its owner without trusting
    # any customer-supplied identifier.
    owner_email = await session.scalar(
        select(User.email)
        .join(BillingAccount, BillingAccount.owner_user_id == User.id)
        .where(BillingAccount.id == pending.billing_account_id)
    )
    if owner_email is None:
        raise InvoiceEvidenceError("invoice_customer_email_missing")
    invoice_day = payment.paid_at.astimezone(_INDIA_ZONE).date()
    year = financial_year(invoice_day)
    serial = await _next_serial(session, year)
    snapshot = _object(pending.tax_snapshot, "tax_snapshot")
    seller = _object(snapshot.get("seller"), "seller")
    prefix = _text(seller.get("invoice_prefix"), "invoice_prefix")
    invoice_number = f"{prefix}/{year}/{serial:06d}"
    receipt_number = f"{prefix}-R/{year}/{serial:06d}"
    payload = _invoice_payload(
        pending=pending,
        payment=payment,
        owner_email=owner_email,
        invoice_number=invoice_number,
        receipt_number=receipt_number,
        invoice_day=invoice_day,
    )
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()
    amounts = _object(payload["amounts"], "amounts")
    invoice = BillingInvoice(
        billing_account_id=pending.billing_account_id,
        payment_id=payment.id,
        invoice_number=invoice_number,
        receipt_number=receipt_number,
        financial_year=year,
        document_kind=cast(str, payload["document_kind"]),
        invoice_date=invoice_day,
        paid_at=payment.paid_at,
        currency=payment.currency,
        total_amount_minor=payment.amount_minor,
        tax_treatment=cast(str, amounts["tax_treatment"]),
        tax_policy_version=cast(
            int, _object(payload["provenance"], "provenance")["tax_policy_version"]
        ),
        payload=payload,
        payload_sha256=hashlib.sha256(encoded).hexdigest(),
    )
    session.add(invoice)
    await session.flush()
    return invoice
