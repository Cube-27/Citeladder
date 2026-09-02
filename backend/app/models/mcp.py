"""OAuth persistence for the account-scoped MCP authorization boundary."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


def _utcnow() -> datetime:
    return datetime.now(UTC)


class McpOAuthClient(Base):
    """Dynamically registered MCP client; secrets are encrypted at rest."""

    __tablename__ = "mcp_oauth_clients"

    id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    client_id: Mapped[str] = mapped_column(String(36), unique=True, index=True)
    client_secret_encrypted: Mapped[str] = mapped_column(Text, default="")
    client_metadata: Mapped[dict] = mapped_column(JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )


class McpAuthorizationRequest(Base):
    """One-time browser handoff between OAuth authorization and app login."""

    __tablename__ = "mcp_authorization_requests"

    id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    transaction_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    client_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("mcp_oauth_clients.client_id", ondelete="CASCADE"),
        index=True,
    )
    state: Mapped[str] = mapped_column(Text, default="")
    scopes: Mapped[list[str]] = mapped_column(JSONB, default=list)
    code_challenge: Mapped[str] = mapped_column(String(128))
    redirect_uri: Mapped[str] = mapped_column(Text)
    redirect_uri_provided_explicitly: Mapped[bool] = mapped_column(Boolean)
    resource: Mapped[str] = mapped_column(Text)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    consumed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )


class McpAuthorizationCode(Base):
    """Short-lived, one-use PKCE authorization code."""

    __tablename__ = "mcp_authorization_codes"

    id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    code_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    client_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("mcp_oauth_clients.client_id", ondelete="CASCADE"),
        index=True,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    scopes: Mapped[list[str]] = mapped_column(JSONB, default=list)
    code_challenge: Mapped[str] = mapped_column(String(128))
    redirect_uri: Mapped[str] = mapped_column(Text)
    redirect_uri_provided_explicitly: Mapped[bool] = mapped_column(Boolean)
    resource: Mapped[str] = mapped_column(Text)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    consumed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )


class McpOAuthGrant(Base):
    """Revocable OAuth token pair issued to one client for one account."""

    __tablename__ = "mcp_oauth_grants"

    id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    client_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("mcp_oauth_clients.client_id", ondelete="CASCADE"),
        index=True,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    access_token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    refresh_token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    scopes: Mapped[list[str]] = mapped_column(JSONB, default=list)
    resource: Mapped[str] = mapped_column(Text)
    access_expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), index=True
    )
    refresh_expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), index=True
    )
    revoked_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )
