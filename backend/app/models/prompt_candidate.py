# Staged prompt-generation output (prompt generation v2, PR 3a).
#
# Generated prompts are candidates until a user accepts them. They live in
# their own tables, never as a status on ``Prompt``, so every audit,
# capacity/occupancy and visibility query that reads ``prompts`` stays correct
# without having to exclude proposals. A prompt exists only once accepted.
#
# Both tables carry ``workspace_id`` so every read and write is scoped without
# relying on a relationship traversal (invariant 5).
from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import (
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    String,
    Text,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.config.prompts import CANDIDATE_DISPOSITION_PENDING
from app.core.database import Base
from app.models.constants import FK_WORKSPACES_ID, ON_DELETE_SET_NULL

_CASCADE = "CASCADE"


class PromptGenerationRun(Base):
    """One Generate request: what was asked and the provenance it ran with."""

    __tablename__ = "prompt_generation_runs"
    __table_args__ = (
        ForeignKeyConstraint(
            ["workspace_id", "project_id"],
            ["projects.workspace_id", "projects.id"],
            ondelete=_CASCADE,
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey(FK_WORKSPACES_ID, ondelete=_CASCADE),
        index=True,
    )
    project_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), index=True)
    prompt_set_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("prompt_sets.id", ondelete=_CASCADE),
        index=True,
    )
    generator_version: Mapped[str] = mapped_column(String(64))
    # The validated request body (count, topic, cohort, intents).
    request: Mapped[dict] = mapped_column(JSONB, default=dict)
    # Model identity, policy versions, context hash and demand grounding ids;
    # copied into ``Prompt.generation_evidence`` when a candidate is accepted.
    provenance: Mapped[dict] = mapped_column(JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )


class PromptCandidate(Base):
    """A generated prompt awaiting review.

    ``pending`` candidates are shown for review until ``expires_at``; accept
    inserts a ``Prompt`` and keeps this row as ``accepted`` with the link, and
    reject deletes it. Candidates are never audited, never charged to prompt
    capacity and never counted in visibility.
    """

    __tablename__ = "prompt_candidates"
    __table_args__ = (
        # One pending candidate per normalized text per set, so repeated
        # generation never stacks the same question in the review list.
        Index(
            "uq_prompt_candidate_pending_text",
            "prompt_set_id",
            "normalized_text_hash",
            unique=True,
            postgresql_where=text(f"disposition = '{CANDIDATE_DISPOSITION_PENDING}'"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey(FK_WORKSPACES_ID, ondelete=_CASCADE),
        index=True,
    )
    run_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("prompt_generation_runs.id", ondelete=_CASCADE),
        index=True,
    )
    prompt_set_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("prompt_sets.id", ondelete=_CASCADE),
    )
    topic_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("topics.id", ondelete=ON_DELETE_SET_NULL),
        nullable=True,
        index=True,
    )
    text: Mapped[str] = mapped_column(Text)
    # Set by the staging owner (domain/prompts/candidates.py); models do not
    # import domain code.
    normalized_text_hash: Mapped[str] = mapped_column(String(64), default="")
    intent: Mapped[str] = mapped_column(String(32), default="")
    buyer_stage: Mapped[str] = mapped_column(String(16), default="")
    prompt_intent: Mapped[str] = mapped_column(String(16), default="")
    cohort: Mapped[str] = mapped_column(String(32), default="core")
    slot_id: Mapped[str] = mapped_column(String(128), default="")
    # References to the evidence that grounded this candidate (PR 3b fills it).
    evidence_refs: Mapped[list] = mapped_column(JSONB, default=list)
    # Deterministic admission outcome recorded at staging time.
    validation: Mapped[dict] = mapped_column(JSONB, default=dict)
    # Quality-judge decisions (PR 3b shadow mode); null until recorded.
    jev_decision: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    # pending | accepted (config/prompts.py CANDIDATE_DISPOSITION_*).
    disposition: Mapped[str] = mapped_column(
        String(16), default=CANDIDATE_DISPOSITION_PENDING
    )
    prompt_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("prompts.id", ondelete=ON_DELETE_SET_NULL),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    reviewed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
