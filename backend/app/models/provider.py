# BYOK provider settings persistence models (B4, UUID PKs, workspace-scoped).
#
# ``ProviderConnection`` holds a Fernet-encrypted BYOK secret (invariant 6): the
# ciphertext lives in ``api_key_encrypted`` and is NEVER serialized into any
# response DTO or log line. ``ProviderRoute`` records the logical -> transport
# identity resolution (invariant 10). ``ProviderConnectionTest`` is an
# append-only history of connectivity checks. ``DiscoveryModelConfig`` is
# plumbing-only per decision B-4 — stored, not invoked yet.
#
# Everything is scoped by ``workspace_id`` (invariant 5).
from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.config.provider_catalog import CREDENTIAL_SOURCE_BYOK
from app.core.database import Base
from app.models.constants import CASCADE_ALL_DELETE_ORPHAN, ON_DELETE_SET_NULL


class ProviderConnection(Base):
    """A workspace-owned credential for one transport provider.

    Tenant rows are BYOK (``credential_source == "byok"``); the operator's
    platform-funded rows (``"platform"``) live only in the reserved system
    workspace and are never tenant-visible. The API key is stored
    Fernet-encrypted in ``api_key_encrypted`` and is decrypted only at
    execution time to build an adapter (invariant 6). No code path places the
    decrypted key — or the ciphertext — into a response DTO.

    ``active`` is operator enablement. The pause fields are a SEPARATE,
    recoverable state: an auth-key failure pause marks ``paused_at`` with a
    safe classification token in ``pause_reason`` and a recovery deadline in
    ``pause_until`` — a paused connection is skipped by credential resolution
    but never retired.
    """

    __tablename__ = "provider_connections"
    __table_args__ = (
        # Credential resolution looks rows up by workspace + source +
        # transport (BYOK in the tenant workspace, platform in the system
        # workspace), so those identity columns share one composite index.
        Index(
            "ix_provider_connections_workspace_source",
            "workspace_id",
            "credential_source",
            "transport_provider",
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
    # Human label for the connection (for example, "Production OpenAI key").
    label: Mapped[str] = mapped_column(String(255), default="")
    # Active connections use openai|anthropic|google; historical persisted rows
    # may retain a no-longer-supported provider value for provenance.
    transport_provider: Mapped[str] = mapped_column(String(32))
    # Optional endpoint override (self-hosted gateway / proxy); "" = catalog URL.
    base_url: Mapped[str] = mapped_column(String(1024), default="")
    # Fernet ciphertext of the BYOK secret. NEVER returned in a DTO.
    api_key_encrypted: Mapped[str] = mapped_column(Text, default="")
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    # Non-empty marker naming why an inactive connection was retired; empty for
    # connections that have never been auto-deactivated.
    deactivation_reason: Mapped[str] = mapped_column(
        String(64), default="", server_default=""
    )
    # Who owns this credential (provider_catalog.CREDENTIAL_SOURCE_*): tenant
    # BYOK by default; the platform-funded rows are provisioning-owned.
    credential_source: Mapped[str] = mapped_column(
        String(16), default=CREDENTIAL_SOURCE_BYOK, server_default="byok"
    )
    # Recoverable auth-failure pause (separate from ``active`` operator
    # enablement). ``paused_at`` NULL = not paused; ``pause_reason`` is a safe
    # classification token (never raw provider detail); ``pause_until`` is the
    # recovery deadline after which resolution may try the credential again.
    paused_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    pause_reason: Mapped[str] = mapped_column(String(64), default="", server_default="")
    pause_until: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # Result of the most recent connectivity test (denormalized for listing).
    last_tested_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    last_test_status: Mapped[str] = mapped_column(String(16), default="")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )

    routes: Mapped[list[ProviderRoute]] = relationship(
        "ProviderRoute",
        back_populates="connection",
        cascade=CASCADE_ALL_DELETE_ORPHAN,
        passive_deletes=True,
        order_by="ProviderRoute.created_at",
    )
    tests: Mapped[list[ProviderConnectionTest]] = relationship(
        "ProviderConnectionTest",
        back_populates="connection",
        cascade=CASCADE_ALL_DELETE_ORPHAN,
        passive_deletes=True,
        order_by="ProviderConnectionTest.created_at",
    )


class ProviderRoute(Base):
    """Resolves a logical engine to a transport + model on a connection.

    Records the logical vs transport identity (invariant 10): ``logical_engine``
    is what the user asked for (chatgpt|gemini|claude), ``transport_provider``
    is how it is reached (active routes use openai|anthropic|google; historical
    rows may retain an older value), and ``transport_model`` is the concrete
    model. ``is_default`` marks the preferred route for an engine within the
    workspace.
    """

    __tablename__ = "provider_routes"

    id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        index=True,
    )
    connection_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("provider_connections.id", ondelete="CASCADE"),
        index=True,
    )
    logical_engine: Mapped[str] = mapped_column(String(32))
    transport_provider: Mapped[str] = mapped_column(String(32))
    transport_model: Mapped[str] = mapped_column(String(255))
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)
    # False marks a retired route so read clients skip it without deleting
    # history.
    active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    # Non-empty marker naming why an inactive route was retired. "" otherwise.
    deactivation_reason: Mapped[str] = mapped_column(
        String(64), default="", server_default=""
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )

    connection: Mapped[ProviderConnection] = relationship(
        "ProviderConnection", back_populates="routes"
    )


class ProviderConnectionTest(Base):
    """Append-only history of connectivity checks for a connection.

    Immutable per invariant 3: one row is written per ``/test`` invocation and
    never mutated. The decrypted key is never stored here — only the outcome.
    """

    __tablename__ = "provider_connection_tests"

    id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        index=True,
    )
    connection_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("provider_connections.id", ondelete="CASCADE"),
        index=True,
    )
    # ok | failed (provider_catalog.TEST_STATUS_*).
    status: Mapped[str] = mapped_column(String(16))
    # Classification token on failure (provider_catalog.ERROR_*); "" on success.
    error_code: Mapped[str] = mapped_column(String(32), default="")
    # Short, credential-free human message (never echoes the key).
    detail: Mapped[str] = mapped_column(String(1024), default="")
    latency_ms: Mapped[int | None] = mapped_column(nullable=True)
    # Immutable provenance of what was probed (logical_engine / transport /
    # model); historical test rows may retain an older transport value.
    logical_engine: Mapped[str] = mapped_column(String(32), default="")
    transport_provider: Mapped[str] = mapped_column(String(32), default="")
    transport_model: Mapped[str] = mapped_column(String(255), default="")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )

    connection: Mapped[ProviderConnection] = relationship(
        "ProviderConnection", back_populates="tests"
    )


class DiscoveryModelConfig(Base):
    """Plumbing-only prompt-discovery model config (decision B-4).

    Stored so the schema + settings surface is complete, but NOT invoked yet
    (the ``/prompt-sets/{id}/generate`` endpoint is a stub). Records which
    logical engine / transport / model would drive AI prompt suggestion.
    """

    __tablename__ = "discovery_model_configs"

    id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        index=True,
    )
    connection_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("provider_connections.id", ondelete=ON_DELETE_SET_NULL),
        nullable=True,
        index=True,
    )
    # Active configurations use the approved catalog; historical rows may retain
    # values from an earlier catalog.
    logical_engine: Mapped[str] = mapped_column(String(32), default="")
    transport_provider: Mapped[str] = mapped_column(String(32), default="")
    transport_model: Mapped[str] = mapped_column(String(255), default="")
    # Free-form tunables (temperature, max prompts, etc.) — roadmap plumbing.
    parameters: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )
