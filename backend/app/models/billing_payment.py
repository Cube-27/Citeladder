"""Normalized durable billing payment and refund receipts."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    text,
)
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.config.billing_contracts import PROVIDER_RAZORPAY
from app.core.database import Base


def _utcnow() -> datetime:
    return datetime.now(UTC)


class BillingPayment(Base):
    """Normalized append-only provider payment or refund receipt."""

    __tablename__ = "billing_payments"
    __table_args__ = (
        # External payment/refund identity is namespaced by provider AND
        # environment (plan §3.3): the same id string in a provider's test and
        # live environments names two different transactions.
        Index(
            "uq_billing_payment_external",
            "provider",
            "provider_mode",
            "external_payment_id",
            unique=True,
            postgresql_where=text("receipt_kind = 'payment'"),
        ),
        Index(
            "uq_billing_refund_external",
            "provider",
            "provider_mode",
            "external_refund_id",
            unique=True,
            postgresql_where=text("external_refund_id IS NOT NULL"),
        ),
        CheckConstraint("amount_minor >= 0", name="ck_billing_payment_amount_nonneg"),
        Index("ix_billing_payment_account_paid", "billing_account_id", "paid_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    billing_account_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("billing_accounts.id", ondelete="RESTRICT"),
        index=True,
    )
    pending_activation_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("pending_activations.id", ondelete="RESTRICT"),
        nullable=True,
    )
    subscription_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("billing_subscriptions.id", ondelete="RESTRICT"),
        nullable=True,
    )
    parent_payment_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("billing_payments.id", ondelete="RESTRICT"),
        nullable=True,
    )
    provider: Mapped[str] = mapped_column(String(24), default=PROVIDER_RAZORPAY)
    receipt_kind: Mapped[str] = mapped_column(String(16), default="payment")
    external_payment_id: Mapped[str] = mapped_column(String(255))
    external_payment_link_id: Mapped[str | None] = mapped_column(
        String(255), nullable=True
    )
    external_invoice_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    external_refund_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    amount_minor: Mapped[int] = mapped_column(Integer)
    currency: Mapped[str] = mapped_column(String(3))
    provider_mode: Mapped[str] = mapped_column(String(8))
    payment_method: Mapped[str] = mapped_column(String(24), default="")
    status: Mapped[str] = mapped_column(String(24))
    paid_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    period_start: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    period_end: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    receipt_sha256: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )
