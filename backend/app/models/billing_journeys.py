"""Persistence for bounded introductory commercial journeys."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


def _utcnow() -> datetime:
    return datetime.now(UTC)


class IntroductoryOperatorCode(Base):
    """Hashed, bounded operator waiver for the optional work-email policy."""

    __tablename__ = "introductory_operator_codes"
    __table_args__ = (
        CheckConstraint("redemption_limit > 0", name="ck_intro_code_limit_positive"),
        CheckConstraint(
            "redemption_count >= 0", name="ck_intro_code_count_nonnegative"
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    code_sha256: Mapped[str] = mapped_column(String(64), unique=True)
    billing_account_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("billing_accounts.id", ondelete="CASCADE"),
        nullable=True,
    )
    email_normalized: Mapped[str | None] = mapped_column(String(255), nullable=True)
    waiver_scope: Mapped[str] = mapped_column(
        String(64), default="oauth_verified_work_email"
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    redemption_limit: Mapped[int] = mapped_column(Integer, default=1)
    redemption_count: Mapped[int] = mapped_column(Integer, default=0)
    created_by_user_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT")
    )
    reason: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )


class IntroductoryClaim(Base):
    """The immutable once-per-account lifetime introductory slot."""

    __tablename__ = "introductory_claims"

    id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    billing_account_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("billing_accounts.id", ondelete="RESTRICT"),
        unique=True,
        index=True,
    )
    # Stable UUIDv5 offer identity, independent of catalog revision rotation.
    campaign_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True))
    introduction_kind: Mapped[str] = mapped_column(String(32))
    tier_key: Mapped[str] = mapped_column(String(64))
    primary_grant_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("account_grants.id", ondelete="RESTRICT")
    )
    idempotency_key: Mapped[str] = mapped_column(String(255))
    request_fingerprint: Mapped[str] = mapped_column(String(64))
    terms_consent_version: Mapped[str] = mapped_column(String(64))
    data_sharing_consent_version: Mapped[str] = mapped_column(String(64))
    consented_by_user_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT")
    )
    claimed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    operator_code_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("introductory_operator_codes.id", ondelete="RESTRICT"),
        nullable=True,
    )
    ended_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    ended_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )
