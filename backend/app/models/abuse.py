"""PostgreSQL-backed fixed-window counters for shared abuse controls."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


def _utcnow() -> datetime:
    return datetime.now(UTC)


class UsageWindow(Base):
    """One opaque subject/operation counter in a deterministic time window."""

    __tablename__ = "usage_windows"
    __table_args__ = (
        UniqueConstraint(
            "subject_kind",
            "subject_hash",
            "operation",
            "window_started_at",
            name="uq_usage_window_subject_operation_start",
        ),
        Index("ix_usage_windows_expires_at", "expires_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    subject_kind: Mapped[str] = mapped_column(String(32))
    subject_hash: Mapped[str] = mapped_column(String(64))
    operation: Mapped[str] = mapped_column(String(64))
    window_started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )


class QueueWorkspaceTurn(Base):
    """Durable least-recently-served cursor for one queue/workspace pair."""

    __tablename__ = "queue_workspace_turns"
    __table_args__ = (
        UniqueConstraint("queue_name", "workspace_id", name="uq_queue_workspace_turn"),
        Index("ix_queue_workspace_turn_order", "queue_name", "last_claimed_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    queue_name: Mapped[str] = mapped_column(String(64))
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
    )
    last_claimed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )
