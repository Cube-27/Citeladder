"""Durable state for the Agent: chats, turns, runs, attempts and outputs.

A chat is the saved unit of work. Each user message queues one run, a leased
PostgreSQL queue row that executes one bounded agent turn and appends the
agent's reply. A chat holds at most one output; every change to it, by the
agent or by the user, is an append-only revision. Tool and model attempts are
append-only provenance, and model attempts carry the credit settlement.

Every row is workspace- and project-scoped (invariant 3). Foreign keys point
one way only (run -> user message, reply -> user message, revision -> run and
reply) so the schema has no reference cycle.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.config.agent import AGENT_RUN_MAX_ATTEMPTS
from app.core.database import Base
from app.models.constants import (
    FK_PROJECTS_ID,
    FK_USERS_ID,
    FK_WORKSPACES_ID,
    ON_DELETE_SET_NULL,
)
from app.models.queue_mixins import QueueLeaseStateMixin

_CASCADE = "CASCADE"
_RESTRICT = "RESTRICT"
_FK_CHAT = "agent_chats.id"
_FK_MESSAGE = "agent_messages.id"
_FK_RUN = "agent_runs.id"
_FK_OUTPUT = "agent_outputs.id"
_FK_REVISION = "agent_output_revisions.id"


def _utcnow() -> datetime:
    return datetime.now(UTC)


class _ProjectScoped:
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey(FK_WORKSPACES_ID, ondelete=_CASCADE),
        index=True,
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey(FK_PROJECTS_ID, ondelete=_CASCADE),
        index=True,
    )


class AgentChat(_ProjectScoped, Base):
    """One conversation and the work it produced."""

    __tablename__ = "agent_chats"
    __table_args__ = (
        Index(
            "ix_agent_chats_project_activity", "project_id", "last_activity_at", "id"
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    action_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("actions.id", ondelete=ON_DELETE_SET_NULL),
        nullable=True,
        index=True,
    )
    created_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey(FK_USERS_ID, ondelete=ON_DELETE_SET_NULL),
        nullable=True,
    )
    title: Mapped[str] = mapped_column(String(120))
    # Typed evidence the chat was started from (target page, Opportunity,
    # Demand signal, Site Health or Search Intelligence reference). Resolved
    # and authorized again by the context builder on every run.
    context_refs: Mapped[dict] = mapped_column(JSONB, default=dict)
    # The skill the user picked for this chat, if any. It stays until the
    # user picks another; the model never overwrites it.
    pinned_skill_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    turn_count: Mapped[int] = mapped_column(Integer, default=0)
    last_activity_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )
    archived_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )


class AgentMessage(_ProjectScoped, Base):
    """One append-only chat message from the user or the agent."""

    __tablename__ = "agent_messages"
    __table_args__ = (
        UniqueConstraint("chat_id", "sequence", name="uq_agent_message_sequence"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    chat_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey(_FK_CHAT, ondelete=_CASCADE), index=True
    )
    sequence: Mapped[int] = mapped_column(Integer)
    role: Mapped[str] = mapped_column(String(16))
    content: Mapped[str] = mapped_column(Text)
    # An agent reply names the user message it answers.
    reply_to_message_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey(_FK_MESSAGE, ondelete=ON_DELETE_SET_NULL),
        nullable=True,
    )
    author_user_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey(FK_USERS_ID, ondelete=ON_DELETE_SET_NULL),
        nullable=True,
    )
    # The skill a user asked for (on a user message) or used (on a reply).
    skill_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    skill_source: Mapped[str | None] = mapped_column(String(16), nullable=True)
    # Evidence the reply cites, as the record references tools returned.
    evidence_refs: Mapped[list] = mapped_column(JSONB, default=list)
    # Compact, public step summary: tool name and outcome per step.
    steps: Mapped[list] = mapped_column(JSONB, default=list)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )


class AgentRun(_ProjectScoped, QueueLeaseStateMixin, Base):
    """One leased, idempotent agent turn with frozen context and budget."""

    __tablename__ = "agent_runs"
    __table_args__ = (
        UniqueConstraint(
            "workspace_id", "idempotency_key", name="uq_agent_run_ws_idempotency"
        ),
        Index("ix_agent_runs_chat_created", "chat_id", "created_at", "id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    chat_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey(_FK_CHAT, ondelete=_CASCADE), index=True
    )
    user_message_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey(_FK_MESSAGE, ondelete=_CASCADE)
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey(FK_USERS_ID, ondelete=ON_DELETE_SET_NULL),
        nullable=True,
    )
    idempotency_key: Mapped[str] = mapped_column(String(128))
    request_fingerprint: Mapped[str] = mapped_column(String(64))
    mode: Mapped[str] = mapped_column(String(24))
    # Frozen at admission (invariants 5 and 11).
    requested_skill_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    requested_skill_source: Mapped[str | None] = mapped_column(
        String(16), nullable=True
    )
    context_manifest: Mapped[dict] = mapped_column(JSONB, default=dict)
    budget: Mapped[dict] = mapped_column(JSONB, default=dict)
    runtime_version: Mapped[str] = mapped_column(String(32))
    protocol_version: Mapped[str] = mapped_column(String(32))
    registry_version: Mapped[str] = mapped_column(String(32))
    funding_source: Mapped[str] = mapped_column(String(24))
    route_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("provider_app_routes.id", ondelete=_RESTRICT),
        nullable=True,
    )
    connection_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("provider_connections.id", ondelete=_RESTRICT),
        nullable=True,
    )
    route_revision: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), nullable=True
    )
    credential_revision: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), nullable=True
    )
    requested_model: Mapped[str] = mapped_column(String(255))
    max_attempts: Mapped[int] = mapped_column(Integer, default=AGENT_RUN_MAX_ATTEMPTS)
    # Execution outcome.
    skill_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    skill_source: Mapped[str | None] = mapped_column(String(16), nullable=True)
    skill_version: Mapped[int | None] = mapped_column(Integer, nullable=True)
    steps_used: Mapped[int] = mapped_column(Integer, default=0)
    cancelled_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )


class AgentToolAttempt(_ProjectScoped, Base):
    """Append-only provenance for one registry read made by a run."""

    __tablename__ = "agent_tool_attempts"
    __table_args__ = (
        UniqueConstraint(
            "run_id", "run_attempt", "ordinal", name="uq_agent_tool_attempt_slot"
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    run_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey(_FK_RUN, ondelete=_CASCADE), index=True
    )
    run_attempt: Mapped[int] = mapped_column(Integer)
    ordinal: Mapped[int] = mapped_column(Integer)
    tool_name: Mapped[str] = mapped_column(String(128))
    registry_version: Mapped[str] = mapped_column(String(32))
    status: Mapped[str] = mapped_column(String(16))
    input: Mapped[dict] = mapped_column(JSONB, default=dict)
    artifact_refs: Mapped[list] = mapped_column(JSONB, default=list)
    output_hash: Mapped[str] = mapped_column(String(64), default="")
    omissions: Mapped[list] = mapped_column(JSONB, default=list)
    error_code: Mapped[str] = mapped_column(String(64), default="")
    latency_ms: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )


class AgentModelAttempt(Base):
    """Durable dispatch, receipt and settlement evidence for one model call."""

    __tablename__ = "agent_model_attempts"
    __table_args__ = (
        UniqueConstraint("dispatch_id", name="uq_agent_model_attempt_dispatch"),
        UniqueConstraint(
            "run_id", "run_attempt", "ordinal", name="uq_agent_model_attempt_slot"
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    # Financial provenance outlives the chat: RESTRICT, never CASCADE.
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey(FK_WORKSPACES_ID, ondelete=_RESTRICT),
        index=True,
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey(FK_PROJECTS_ID, ondelete=_RESTRICT),
        index=True,
    )
    run_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey(_FK_RUN, ondelete=_RESTRICT), index=True
    )
    dispatch_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True))
    run_attempt: Mapped[int] = mapped_column(Integer)
    ordinal: Mapped[int] = mapped_column(Integer)
    funding_source: Mapped[str] = mapped_column(String(24))
    provider_connection_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("provider_connections.id", ondelete=_RESTRICT),
        nullable=True,
    )
    provider_route_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("provider_app_routes.id", ondelete=_RESTRICT),
        nullable=True,
    )
    credential_revision: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), nullable=True
    )
    route_revision: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), nullable=True
    )
    provider_adapter: Mapped[str] = mapped_column(String(64))
    endpoint_host: Mapped[str] = mapped_column(String(255))
    requested_model: Mapped[str] = mapped_column(String(255))
    returned_model: Mapped[str] = mapped_column(String(255), default="")
    pricing_revision: Mapped[str] = mapped_column(String(64), default="")
    reservation_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), nullable=True
    )
    reserved_credits: Mapped[int] = mapped_column(BigInteger, default=0)
    debited_credits: Mapped[int] = mapped_column(BigInteger, default=0)
    input_tokens: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    cached_input_tokens: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    output_tokens: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    reasoning_tokens: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    total_tokens: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    usage_complete: Mapped[bool] = mapped_column(Boolean, default=False)
    settlement_status: Mapped[str] = mapped_column(String(24), default="not_applicable")
    request_hash: Mapped[str] = mapped_column(String(64))
    output_hash: Mapped[str] = mapped_column(String(64), default="")
    outcome: Mapped[str] = mapped_column(String(24), default="dispatched")
    finish_status: Mapped[str] = mapped_column(String(64), default="")
    error_code: Mapped[str] = mapped_column(String(64), default="")
    latency_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    dispatched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    deadline_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    settled_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    late_receipt: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )


class AgentOutput(_ProjectScoped, Base):
    """The one deliverable a chat produces, revised in place."""

    __tablename__ = "agent_outputs"
    __table_args__ = (UniqueConstraint("chat_id", name="uq_agent_output_chat"),)

    id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    chat_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey(_FK_CHAT, ondelete=_CASCADE)
    )
    action_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("actions.id", ondelete=ON_DELETE_SET_NULL),
        nullable=True,
        index=True,
    )
    kind: Mapped[str] = mapped_column(String(32))
    skill_id: Mapped[str] = mapped_column(String(64))
    format_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    target_kind: Mapped[str | None] = mapped_column(String(24), nullable=True)
    target_label: Mapped[str | None] = mapped_column(String(255), nullable=True)
    phase: Mapped[str] = mapped_column(String(16))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )


class AgentOutputRevision(_ProjectScoped, Base):
    """One immutable version of a chat's output, by the agent or the user."""

    __tablename__ = "agent_output_revisions"
    __table_args__ = (
        UniqueConstraint("output_id", "number", name="uq_agent_output_revision_number"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    output_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey(_FK_OUTPUT, ondelete=_CASCADE), index=True
    )
    number: Mapped[int] = mapped_column(Integer)
    parent_revision_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey(_FK_REVISION, ondelete=ON_DELETE_SET_NULL),
        nullable=True,
    )
    author: Mapped[str] = mapped_column(String(16))
    author_user_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey(FK_USERS_ID, ondelete=ON_DELETE_SET_NULL),
        nullable=True,
    )
    run_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey(_FK_RUN, ondelete=ON_DELETE_SET_NULL),
        nullable=True,
    )
    message_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey(_FK_MESSAGE, ondelete=ON_DELETE_SET_NULL),
        nullable=True,
    )
    phase: Mapped[str] = mapped_column(String(16))
    title: Mapped[str] = mapped_column(String(255))
    body: Mapped[str] = mapped_column(Text)
    source_refs: Mapped[list] = mapped_column(JSONB, default=list)
    # Outline approval: the explicit user decision that unlocks the draft.
    approved_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    approved_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey(FK_USERS_ID, ondelete=ON_DELETE_SET_NULL),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )


class AgentInstructionRevision(_ProjectScoped, Base):
    """One version of a project's standing agent instructions."""

    __tablename__ = "agent_instruction_revisions"
    __table_args__ = (
        UniqueConstraint(
            "project_id", "revision", name="uq_agent_instruction_revision"
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    revision: Mapped[int] = mapped_column(Integer)
    text: Mapped[str] = mapped_column(Text)
    created_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey(FK_USERS_ID, ondelete=ON_DELETE_SET_NULL),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )
