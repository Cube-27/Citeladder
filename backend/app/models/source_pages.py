# Persistence for third-party pages that AI answers cited.
#
# Mirrors the Site Health acquisition shape deliberately: evidence is
# append-only, projections are explicitly mutable, and raw HTML is never
# stored. What is retained from a fetched page is bounded normalized facts, a
# content hash over the extracted text, and short self-contained quoted
# passages -- enough to show a reader why a claim was made, and not enough to
# reconstitute someone else's page.
#
# There is deliberately NO foreign key from ``citations``. That table has no
# ``project_id`` and is written during analysis, long before any inspection
# exists; the join runs through ``url_hash`` and every query carries
# ``project_id`` explicitly.
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    DateTime,
    Float,
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

from app.core.config.source_pages import (
    INSPECTION_NOT_INSPECTED,
    PAGE_FORMAT_UNRESOLVED,
)
from app.core.database import Base

_FK_WORKSPACE = "workspaces.id"
_FK_PROJECT = "projects.id"
_FK_AUDIT = "audits.id"
_FK_SOURCE_PAGE = "source_pages.id"
_FK_SOURCE_PAGE_SNAPSHOT = "source_page_snapshots.id"
_CASCADE = "CASCADE"
_SET_NULL = "SET NULL"


def _utcnow() -> datetime:
    from datetime import UTC

    return datetime.now(UTC)


class SourcePage(Base):
    """One externally cited page, as this project understands it.

    Explicitly MUTABLE: a projection of inspection lifecycle, not evidence.
    The evidence lives in ``SourcePageSnapshot``.

    ``source_class`` describes the PUBLISHER and continues to come from the
    domain taxonomy. ``page_format`` describes THIS PAGE and is derived from
    its own inspected content. They are separate columns with separate
    provenance because one inspected page is not grounds for reclassifying
    every other page on its domain.
    """

    __tablename__ = "source_pages"
    __table_args__ = (
        UniqueConstraint("project_id", "url_hash", name="uq_source_page_project_url"),
        Index("ix_source_pages_project_state", "project_id", "inspection_state"),
        Index("ix_source_pages_project_domain", "project_id", "registrable_domain"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey(_FK_WORKSPACE, ondelete=_CASCADE),
        index=True,
    )
    # Project-scoped, not workspace-scoped: brand and competitor presence are
    # project-relative, so two projects citing one URL need separate verdicts.
    project_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey(_FK_PROJECT, ondelete=_CASCADE),
        index=True,
    )
    url_hash: Mapped[str] = mapped_column(String(64))
    canonical_url: Mapped[str] = mapped_column(Text)
    registrable_domain: Mapped[str] = mapped_column(String(255), default="")

    # Publisher-level classification, from the domain taxonomy.
    source_class: Mapped[str | None] = mapped_column(String(48), nullable=True)
    source_taxonomy_version: Mapped[str | None] = mapped_column(
        String(32), nullable=True
    )
    # Page-level format, from THIS page's inspected content.
    page_format: Mapped[str] = mapped_column(String(32), default=PAGE_FORMAT_UNRESOLVED)
    page_format_method: Mapped[str | None] = mapped_column(String(24), nullable=True)
    page_format_version: Mapped[str | None] = mapped_column(String(32), nullable=True)

    inspection_state: Mapped[str] = mapped_column(
        String(24), default=INSPECTION_NOT_INSPECTED
    )
    inspection_reason: Mapped[str | None] = mapped_column(String(48), nullable=True)
    # Set when a page is claimed for inspection; an expired claim is
    # reclaimable, so a worker that dies does not strand the page in ``queued``.
    claim_expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # ``use_alter`` because a page points at its latest snapshot while every
    # snapshot points back at its page. The cycle is real -- both directions
    # are wanted -- so the constraint is added after both tables exist rather
    # than by dropping one side of it.
    latest_snapshot_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey(
            _FK_SOURCE_PAGE_SNAPSHOT,
            ondelete=_SET_NULL,
            use_alter=True,
            name="fk_source_pages_latest_snapshot",
        ),
        nullable=True,
    )
    # Hash of the latest snapshot's extracted TEXT, so "changed" means the
    # prose changed rather than that an advertisement rotated.
    content_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    last_inspected_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    last_cited_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # Project-wide SCHEDULING value used to rank inspection candidates. It is
    # never the citation count for a selected engine, cohort or period; that
    # comes from the full captured evidence through the source projection.
    recurrence_count: Mapped[int] = mapped_column(Integer, default=0)
    first_seen_audit_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey(_FK_AUDIT, ondelete=_SET_NULL),
        nullable=True,
    )
    last_seen_audit_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey(_FK_AUDIT, ondelete=_SET_NULL),
        nullable=True,
    )
    inspector_version: Mapped[str | None] = mapped_column(String(32), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )


class SourcePageSnapshot(Base):
    """Append-only record of one inspection of one external page.

    Never stores a raw body. ``page_facts`` holds bounded normalized facts and
    ``evidence_passages`` holds short quoted windows; ``content_hash`` is taken
    over the normalized extracted text, which is itself discarded.

    ``extracted_chars`` is what makes a NON-detection reportable. No passage
    can prove an absence, so an absence is qualified by how much text was
    actually read.
    """

    __tablename__ = "source_page_snapshots"
    __table_args__ = (
        Index("ix_source_page_snapshots_page_time", "source_page_id", "fetched_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey(_FK_WORKSPACE, ondelete=_CASCADE),
        index=True,
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey(_FK_PROJECT, ondelete=_CASCADE),
        index=True,
    )
    source_page_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey(_FK_SOURCE_PAGE, ondelete=_CASCADE),
        index=True,
    )
    # Which audit's evidence prompted this inspection, when one did.
    audit_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey(_FK_AUDIT, ondelete=_SET_NULL),
        nullable=True,
    )
    requested_url: Mapped[str] = mapped_column(Text)
    final_url: Mapped[str] = mapped_column(Text, default="")
    # URLs only; never headers or credentials.
    redirect_chain: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    status_code: Mapped[int | None] = mapped_column(Integer, nullable=True)
    content_type: Mapped[str | None] = mapped_column(String(128), nullable=True)
    charset: Mapped[str | None] = mapped_column(String(32), nullable=True)
    body_bytes: Mapped[int] = mapped_column(Integer, default=0)
    content_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    redacted_headers: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    page_facts: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    evidence_passages: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    # Length of the normalized text this snapshot was derived from. The text
    # itself is not retained, so passage offsets are provenance and ordering
    # only and cannot be used to re-slice anything.
    extracted_chars: Mapped[int] = mapped_column(Integer, default=0)
    robots_state: Mapped[str | None] = mapped_column(String(16), nullable=True)
    outcome: Mapped[str] = mapped_column(String(24))
    outcome_reason: Mapped[str | None] = mapped_column(String(48), nullable=True)
    extractor_version: Mapped[str | None] = mapped_column(String(32), nullable=True)
    inspector_version: Mapped[str | None] = mapped_column(String(32), nullable=True)
    fetched_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )


class SourcePageEntityPresence(Base):
    """Whether one tracked entity was found on one inspected page.

    Append-only and relational because the detector filters on it and the API
    sorts on it.

    Every ``presence`` value here requires a snapshot to exist. A page that was
    never fetched, was blocked, or is stale has no row at all -- those are
    page-level states on ``SourcePage``. Writing "not detected" for a page
    nobody looked at is how an unread page becomes a reported absence.

    The roster identity and alias version are frozen per row. A later roster or
    alias change invalidates the assessment rather than silently aging it, and
    because the normalized text is not retained, reassessing costs a fresh
    retrieval.
    """

    __tablename__ = "source_page_entity_presences"
    __table_args__ = (
        UniqueConstraint(
            "snapshot_id",
            "entity_kind",
            "entity_name",
            name="uq_source_page_presence_entity",
        ),
        Index(
            "ix_source_page_presences_page_entity",
            "source_page_id",
            "entity_kind",
            "presence",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey(_FK_WORKSPACE, ondelete=_CASCADE),
        index=True,
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey(_FK_PROJECT, ondelete=_CASCADE),
        index=True,
    )
    source_page_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey(_FK_SOURCE_PAGE, ondelete=_CASCADE),
        index=True,
    )
    snapshot_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey(_FK_SOURCE_PAGE_SNAPSHOT, ondelete=_CASCADE),
        index=True,
    )
    entity_kind: Mapped[str] = mapped_column(String(16))
    entity_name: Mapped[str] = mapped_column(String(255))
    presence: Mapped[str] = mapped_column(String(24))
    match_method: Mapped[str] = mapped_column(String(24))
    match_count: Mapped[int] = mapped_column(Integer, default=0)
    first_offset: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Indices into the snapshot's ``evidence_passages``.
    passage_refs: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    # Frozen roster identity this verdict was assessed against.
    roster_version: Mapped[str] = mapped_column(String(64), default="")
    detector_version: Mapped[str | None] = mapped_column(String(32), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )


class SourcePageInspectionSpend(Base):
    """One consumed unit of the project's inspection budget.

    Written when a page is CLAIMED, before any request leaves the process, and
    never rolled back on failure. Counting completed snapshots instead would
    under-count twice over: two workers reading the same remaining allowance
    would both proceed, and a worker that fetched and then crashed would leave
    no record of what it spent. A redirect resolution costs the same as a page.
    """

    __tablename__ = "source_page_inspection_spend"
    __table_args__ = (
        UniqueConstraint("idempotency_key", name="uq_source_page_spend_key"),
        Index("ix_source_page_spend_project_time", "project_id", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey(_FK_WORKSPACE, ondelete=_CASCADE),
        index=True,
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey(_FK_PROJECT, ondelete=_CASCADE),
        index=True,
    )
    source_page_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey(_FK_SOURCE_PAGE, ondelete=_SET_NULL),
        nullable=True,
    )
    # ``page`` | ``redirect`` | ``recheck`` - all cost one unit.
    spend_kind: Mapped[str] = mapped_column(String(16))
    units: Mapped[float] = mapped_column(Float, default=1.0)
    idempotency_key: Mapped[str] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )
