"""Immutable CiteLadder tax invoices and paid receipts."""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


def _utcnow() -> datetime:
    return datetime.now(UTC)


class BillingInvoiceCounter(Base):
    """One locked, fiscal-year receipt serial allocator."""

    __tablename__ = "billing_invoice_counters"

    financial_year: Mapped[str] = mapped_column(String(7), primary_key=True)
    next_value: Mapped[int] = mapped_column(Integer)

    __table_args__ = (
        CheckConstraint("next_value > 0", name="ck_billing_invoice_counter_positive"),
    )


class BillingInvoice(Base):
    """Append-only paid receipt derived from one normalized captured payment."""

    __tablename__ = "billing_invoices"
    __table_args__ = (
        CheckConstraint(
            "total_amount_minor >= 0", name="ck_billing_invoice_total_nonneg"
        ),
        CheckConstraint("tax_policy_version = 1", name="ck_billing_invoice_policy_v1"),
        Index("ix_billing_invoice_account_date", "billing_account_id", "invoice_date"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    billing_account_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("billing_accounts.id", ondelete="RESTRICT"),
        index=True,
    )
    payment_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("billing_payments.id", ondelete="RESTRICT"),
        unique=True,
    )
    invoice_number: Mapped[str] = mapped_column(String(32), unique=True)
    receipt_number: Mapped[str] = mapped_column(String(36), unique=True)
    financial_year: Mapped[str] = mapped_column(String(7))
    document_kind: Mapped[str] = mapped_column(String(24))
    invoice_date: Mapped[date] = mapped_column(Date)
    paid_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    currency: Mapped[str] = mapped_column(String(3))
    total_amount_minor: Mapped[int] = mapped_column(Integer)
    tax_treatment: Mapped[str] = mapped_column(String(24))
    tax_policy_version: Mapped[int] = mapped_column(Integer, default=1)
    # Complete frozen supplier, customer, line, tax, and provider provenance.
    payload: Mapped[dict] = mapped_column(JSONB)
    payload_sha256: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )
