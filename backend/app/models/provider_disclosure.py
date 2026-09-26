"""Immutable acknowledgement of a customer-selected Agent destination."""

import uuid
from datetime import UTC, datetime

from sqlalchemy import DateTime, String
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class ProviderDisclosure(Base):
    __tablename__ = "provider_disclosures"
    id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    workspace_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), index=True)
    actor_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True))
    connection_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True))
    destination: Mapped[str] = mapped_column(String(1024))
    model: Mapped[str] = mapped_column(String(255))
    disclosure_revision: Mapped[str] = mapped_column(String(32))
    acknowledged_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )
