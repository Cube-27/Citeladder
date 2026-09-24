"""Issue immutable CiteLadder tax receipts and credit notes.

Every captured payment yields exactly one receipt and every processed refund
exactly one credit note: the unique ``payment_id`` (one document per payment or
refund receipt) plus unique document numbers make settlement replays and
concurrent deliveries converge on the same row. Numbers come from row-locked
per-series, per-financial-year counters inside the settlement transaction.
"""

from __future__ import annotations

import hashlib
import json
from datetime import UTC, date, datetime
from decimal import ROUND_HALF_UP, Decimal
from typing import Any, cast
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.billing.catalog_revisions import (
    CatalogUnavailableError,
    catalog_revision,
    commercial_catalog_from_row,
)
from app.models.billing import BillingAccount, PendingActivation
from app.models.billing_invoice import BillingInvoice, BillingInvoiceCounter
from app.models.billing_payment import BillingPayment
from app.models.user import User

_INDIA_ZONE = ZoneInfo("Asia/Kolkata")
# Credit notes are numbered in their own consecutive series.
_CREDIT_NOTE_SERIES = "CN"
DOCUMENT_CREDIT_NOTE = "credit_note"


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


async def _next_serial(session: AsyncSession, series: str) -> int:
    """Allocate the next number in one series (row-locked, gap-free per commit)."""
    await session.execute(
        insert(BillingInvoiceCounter)
        .values(financial_year=series, next_value=1)
        .on_conflict_do_nothing(index_elements=["financial_year"])
    )
    counter = await session.scalar(
        select(BillingInvoiceCounter)
        .where(BillingInvoiceCounter.financial_year == series)
        .with_for_update()
    )
    if counter is None:  # pragma: no cover - insert/select are one transaction
        raise InvoiceEvidenceError("invoice_counter_unavailable")
    serial = counter.next_value
    counter.next_value += 1
    return serial


async def _catalog_name(session: AsyncSession, pending: PendingActivation) -> str:
    """The display name frozen in the purchase's catalog revision."""
    try:
        row = await catalog_revision(session, pending.catalog_revision)
    except CatalogUnavailableError:
        return pending.catalog_key.replace("_", " ").title()
    catalog = commercial_catalog_from_row(row)
    entry = (
        catalog.plan(pending.catalog_key)
        or catalog.addon(pending.catalog_key)
        or catalog.topup(pending.catalog_key)
    )
    return entry.name if entry is not None else pending.catalog_key


def _description(pending: PendingActivation, label: str) -> str:
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
    label: str,
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
            "description": _description(pending, label),
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
        label=await _catalog_name(session, pending),
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


def _credit_amounts(original: dict[str, Any], refunded: int) -> dict[str, object]:
    """Split a refund into taxable value and tax in the original's proportion."""
    total = _integer(original.get("total_minor"), "total")
    taxable = _integer(original.get("taxable_minor"), "taxable")
    if not 0 < refunded <= total:
        raise InvoiceEvidenceError("credit_note_amount_invalid")
    credit_taxable = int(
        (Decimal(refunded) * taxable / total).quantize(Decimal("1"), ROUND_HALF_UP)
    )
    credit_tax = refunded - credit_taxable
    treatment = _text(original.get("tax_treatment"), "tax_treatment")
    cgst = sgst = igst = 0
    if treatment == "CGST_SGST":
        cgst = credit_tax // 2
        sgst = credit_tax - cgst
    elif treatment == "IGST":
        igst = credit_tax
    elif credit_tax:
        raise InvoiceEvidenceError("credit_note_tax_invalid")
    return {
        "subtotal_minor": credit_taxable,
        "discount_minor": 0,
        "taxable_minor": credit_taxable,
        "cgst_minor": cgst,
        "sgst_minor": sgst,
        "igst_minor": igst,
        "tax_minor": credit_tax,
        "total_minor": refunded,
        "currency": _text(original.get("currency"), "currency"),
        "tax_rate": _text(original.get("tax_rate"), "tax_rate"),
        "tax_treatment": treatment,
    }


async def issue_credit_note(
    session: AsyncSession, *, refund: BillingPayment, at: datetime | None = None
) -> BillingInvoice:
    """Issue exactly one immutable credit note for one processed refund.

    It references the original receipt and reverses its taxable value and
    tax in proportion, so partial refunds are supported.
    """
    existing = await session.scalar(
        select(BillingInvoice).where(BillingInvoice.payment_id == refund.id)
    )
    if existing is not None:
        return existing
    original = await session.scalar(
        select(BillingInvoice).where(
            BillingInvoice.payment_id == refund.parent_payment_id
        )
    )
    if original is None:
        raise InvoiceEvidenceError("credit_note_invoice_missing")
    source = _object(original.payload, "invoice")
    amounts = _credit_amounts(
        _object(source.get("amounts"), "amounts"), refund.amount_minor
    )
    issued_at = at or datetime.now(UTC)
    issued_day = issued_at.astimezone(_INDIA_ZONE).date()
    year = financial_year(issued_day)
    serial = await _next_serial(session, f"{_CREDIT_NOTE_SERIES}:{year}")
    seller = _object(source.get("seller"), "seller")
    prefix = _text(seller.get("invoice_prefix"), "invoice_prefix")
    number = f"{prefix}-{_CREDIT_NOTE_SERIES}/{year}/{serial:06d}"
    original_line = _object(source.get("line"), "line")
    payload: dict[str, object] = {
        "schema_version": 1,
        "document_kind": DOCUMENT_CREDIT_NOTE,
        "invoice_number": number,
        "receipt_number": number,
        "invoice_date": issued_day.isoformat(),
        "paid_at": issued_at.isoformat(),
        "original_invoice_number": original.invoice_number,
        "seller": seller,
        "customer": _object(source.get("customer"), "customer"),
        "line": {
            "description": (
                f"Credit against {original.invoice_number}: "
                f"{_text(original_line.get('description'), 'description')}"
            ),
            "quantity": 1,
            "unit_price_minor": amounts["taxable_minor"],
            "amount_minor": amounts["taxable_minor"],
            "period_start": original_line.get("period_start"),
            "period_end": original_line.get("period_end"),
            "sac": original_line.get("sac"),
        },
        "amounts": amounts,
        "payment": {
            "method": refund.payment_method or "Refund",
            "provider": refund.provider,
            "receipt_number": number,
        },
        "provenance": {
            "refund_receipt_sha256": refund.receipt_sha256,
            "original_invoice_id": str(original.id),
            "tax_policy_version": original.tax_policy_version,
        },
    }
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()
    credit_note = BillingInvoice(
        billing_account_id=original.billing_account_id,
        payment_id=refund.id,
        invoice_number=number,
        receipt_number=number,
        financial_year=year,
        document_kind=DOCUMENT_CREDIT_NOTE,
        invoice_date=issued_day,
        paid_at=issued_at,
        currency=original.currency,
        total_amount_minor=refund.amount_minor,
        tax_treatment=original.tax_treatment,
        tax_policy_version=original.tax_policy_version,
        payload=payload,
        payload_sha256=hashlib.sha256(encoded).hexdigest(),
    )
    session.add(credit_note)
    await session.flush()
    return credit_note
