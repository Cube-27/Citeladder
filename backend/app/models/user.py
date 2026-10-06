# User persistence model (UUID PK, workspace-scoped auth per invariant 5).
from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class User(Base):
    """An authenticated account. Identity only — no per-user data scoping.

    Access to workspace-owned resources is granted through
    ``WorkspaceMember`` rows and enforced by ``require_workspace_member``
    (invariant 5): there is no ``user_id`` scoping anywhere.
    """

    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    # NULL for an account that only signs in through a third-party
    # provider (``UserIdentity``). ``authenticate_user`` refuses such a
    # row outright, so a passwordless account is unreachable by password.
    hashed_password: Mapped[str | None] = mapped_column(String(255), nullable=True)
    role: Mapped[str] = mapped_column(String(20), default="user")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    registration_origin: Mapped[str] = mapped_column(
        String(24), server_default="legacy"
    )
    email_verified_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    email_verification_method: Mapped[str | None] = mapped_column(
        String(24), nullable=True
    )
    session_version: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )


class AuthChallenge(Base):
    """Current purpose-bound mailbox challenge; raw bearer values are never stored."""

    __tablename__ = "auth_challenges"
    __table_args__ = (
        UniqueConstraint("user_id", "purpose", name="uq_auth_challenge_purpose"),
    )

    id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE")
    )
    email: Mapped[str] = mapped_column(String(255))
    purpose: Mapped[str] = mapped_column(String(24))
    token_digest: Mapped[str] = mapped_column(String(64), unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    consumed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
