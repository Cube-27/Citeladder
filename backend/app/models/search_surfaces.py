# Observed-search-surface persistence (Google AI Overview).
#
# These two rows are the ONLY surface-specific persistence the feature adds.
# Everything else a Google AI Overview produces — ``ResponseAnalysis``,
# ``BrandMention``, ``CompetitorMention``, ``Citation``, ``MetricSnapshot`` —
# is written through the existing pipeline by the existing scorer, because a
# fourth surface should add a reader, not a second scoring path.
from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.constants import CASCADE_ALL_DELETE_ORPHAN, ON_DELETE_SET_NULL


def _utcnow() -> datetime:
    return datetime.now(UTC)


class AioObservation(Base):
    """What one Google AI Overview execution ended up observing — or not.

    Keyed on ``task_id``, NOT on ``analysis_id``, and written once when the
    task reaches a terminal outcome. That choice is the whole design. A failed
    or abandoned task never reaches ``analyze_task`` and therefore never has a
    ``ResponseAnalysis``, so hanging the outcome off the analysis row would
    make it unrecordable exactly when it matters most — when CiteLadder needs
    to say "we did not manage to look" rather than "the brand was not there".

    In-flight states live on ``AuditTask`` and create no observation at all. A
    task that has not finished has not observed anything, and nothing may
    count it.

    There is deliberately NO cost column here. ``ExecutionCostProjection``
    remains the single authoritative cost record, so a second, independently
    computed cost cannot grow on this row and quietly disagree with it.
    """

    __tablename__ = "aio_observations"
    __table_args__ = (
        # One observation per execution. A late poll landing after
        # finalization is a no-op rather than a duplicate.
        UniqueConstraint("task_id", name="uq_aio_observation_task"),
        Index("ix_aio_observations_audit_outcome", "audit_id", "outcome"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        index=True,
    )
    audit_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("audits.id", ondelete="CASCADE"),
        index=True,
    )
    task_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("audit_tasks.id", ondelete="CASCADE"),
    )

    # One of the five terminal outcomes. Closed vocabulary, owned by
    # ``connectors.search_surfaces.contracts``.
    outcome: Mapped[str] = mapped_column(String(32), index=True)
    # Names CiteLadder's OWN failure, and is set only for
    # ``execution_failure``. It is what stops a local fault from being filed
    # as a measurement.
    error_code: Mapped[str] = mapped_column(String(64), default="", server_default="")
    # The provider's own code, preserved verbatim. Null when no provider
    # result supplied one — it is not manufactured to fill the column.
    provider_status_code: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # NULLABLE on purpose, and the most important column here.
    #
    # ``False`` means "the task completed and there was no AI Overview" — a
    # real observation of absence. ``NULL`` means "we never successfully
    # looked". Collapsing the two into a boolean would report CiteLadder's own
    # failures as measured absence of the brand, and every trigger rate in the
    # product would quietly inherit the error.
    aio_present: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    # Where the AI Overview block sat among the SERP's items. A BLOCK
    # position, never a brand rank; the name has to keep saying so.
    aio_serp_position: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # The search context FROZEN at admission. A queued execution never
    # re-reads mutable project settings, so this records what was actually
    # measured rather than what the project is configured for now.
    location_code: Mapped[int] = mapped_column(Integer)
    language_code: Mapped[str] = mapped_column(String(8))
    device: Mapped[str] = mapped_column(String(16))

    provider_task_id: Mapped[str] = mapped_column(
        String(64), default="", server_default=""
    )
    provider_submission_ref: Mapped[str] = mapped_column(
        String(255), default="", server_default=""
    )
    provider_connection_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("provider_connections.id", ondelete=ON_DELETE_SET_NULL),
        nullable=True,
    )

    element_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    reference_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")

    # When the SERP was CAPTURED, per the provider. Null when nothing was
    # observed. Kept apart from ``retrieved_at`` because the two differ by
    # however long the task sat in the provider's queue, and a trend plotted
    # on retrieval time is plotting queue latency.
    observed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    retrieved_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )

    entity_links: Mapped[list[AioEntityLink]] = relationship(
        "AioEntityLink",
        back_populates="observation",
        cascade=CASCADE_ALL_DELETE_ORPHAN,
        passive_deletes=True,
    )


class AioEntityLink(Base):
    """One inline link the AI Overview pointed at from inside its own text.

    Populated from the block's inline ``links[]`` and NEVER from its
    references. That restriction is the point of the row existing: mentioned,
    linked and cited are three independent signals, and deriving link rows
    from the citation list as well would make every citation-only entity look
    linked — destroying exactly the independence this preserves.

    A row exists whether or not the entity was named in the answer text, so
    the evidence view composes the three signals rather than treating link
    rows as the master entity list.
    """

    __tablename__ = "aio_entity_links"
    __table_args__ = (
        UniqueConstraint(
            "observation_id",
            "url",
            name="uq_aio_entity_link_observation_url",
        ),
        Index("ix_aio_entity_links_domain", "observation_id", "domain"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        index=True,
    )
    observation_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("aio_observations.id", ondelete="CASCADE"),
        index=True,
    )
    url: Mapped[str] = mapped_column(Text)
    # Registrable domain, so ``www.example.com`` and ``example.com`` are one
    # identity for grouping while URL identity stays separate.
    domain: Mapped[str] = mapped_column(String(255), default="", server_default="")
    title: Mapped[str] = mapped_column(Text, default="", server_default="")
    # Which element of the overview carried the link, for evidence display.
    element_index: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )

    observation: Mapped[AioObservation] = relationship(
        "AioObservation", back_populates="entity_links"
    )
