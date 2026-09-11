# Workspace + membership persistence models (UUID PKs).
#
# A ``Workspace`` is the tenancy boundary: every project-owned resource is
# scoped by ``workspace_id`` and access is granted via ``WorkspaceMember``
# rows (invariant 5 — workspace auth on every query, never a user-id shortcut).
from __future__ import annotations

import uuid
from datetime import UTC, datetime
from enum import StrEnum

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    String,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class ProductTourStatus(StrEnum):
    NOT_STARTED = "not_started"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    SKIPPED = "skipped"


class Workspace(Base):
    __tablename__ = "workspaces"
    __table_args__ = (
        # Exactly ONE system workspace may exist: it holds the operator's
        # platform-funded provider connections, can never have memberships,
        # and is excluded from every tenant workspace list.
        Index(
            "uq_workspaces_single_system",
            "is_system",
            unique=True,
            postgresql_where=text("is_system"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(255))
    # True only for the reserved platform-provisioning workspace (T11).
    is_system: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="false"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )


class WorkspaceMember(Base):
    """Join row granting a ``User`` a ``role`` within a ``Workspace``.

    The unique ``(workspace_id, user_id)`` constraint keeps membership
    single-valued so ``require_workspace_member`` resolves at most one row.
    """

    __tablename__ = "workspace_members"
    __table_args__ = (
        UniqueConstraint("workspace_id", "user_id", name="uq_workspace_member"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        index=True,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
    )
    role: Mapped[str] = mapped_column(String(20), default="owner")
    product_tour_version: Mapped[str | None] = mapped_column(String(32), nullable=True)
    product_tour_status: Mapped[str] = mapped_column(
        String(20), default=ProductTourStatus.NOT_STARTED.value
    )
    product_tour_step_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    product_tour_started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    product_tour_completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )


class WorkspaceInvitation(Base):
    """A pending invitation of one email address into one workspace.

    The token is never stored: only its SHA-256 hash, so a database read
    cannot mint a working acceptance link. Acceptance is bound to an
    authenticated identity whose verified email matches ``email_normalized``,
    is single-use (``accepted_at``), and expires.

    ``role`` is constrained to the assignable roles: an invitation can never
    install a second Owner, because the single designated Owner changes only
    through an ownership transfer.
    """

    __tablename__ = "workspace_invitations"
    __table_args__ = (
        Index(
            "uq_workspace_invitation_pending_email",
            "workspace_id",
            "email_normalized",
            unique=True,
            postgresql_where=text("accepted_at IS NULL AND revoked_at IS NULL"),
        ),
        Index("ix_workspace_invitation_workspace", "workspace_id", "created_at"),
        CheckConstraint(
            "role IN ('admin', 'member', 'viewer')",
            name="ck_workspace_invitation_role",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        index=True,
    )
    email_normalized: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(20))
    token_sha256: Mapped[str] = mapped_column(String(64), unique=True)
    invited_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    accepted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    accepted_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    revoked_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )
