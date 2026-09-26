"""Append-only user acceptance, separate from optional processing consent."""

import uuid
from datetime import UTC, datetime

from sqlalchemy import DateTime, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class PolicyAcceptance(Base):
    __tablename__ = "policy_acceptances"
    __table_args__ = (
        UniqueConstraint(
            "actor_id",
            "workspace_id",
            "terms_revision",
            name="uq_policy_acceptance_revision",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    actor_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True))
    workspace_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), index=True)
    terms_revision: Mapped[str] = mapped_column(String(64))
    privacy_notice_revision: Mapped[str] = mapped_column(String(64))
    context: Mapped[str] = mapped_column(String(32))
    accepted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )


class EnterpriseAgreementReference(Base):
    """Verified operator reference to a signed document in the contract archive.

    Independent of ordinary Terms receipts and retained customer row cascades.
    The reference is opaque: never a signed URL, agreement body or credential.
    """

    __tablename__ = "enterprise_agreement_references"
    __table_args__ = (
        UniqueConstraint(
            "workspace_id", "reference", name="uq_enterprise_agreement_reference"
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    workspace_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), index=True)
    actor_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True))
    signatory_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True))
    reference: Mapped[str] = mapped_column(String(128))
    document_sha256: Mapped[str] = mapped_column(String(64))
    signed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    recorded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )
