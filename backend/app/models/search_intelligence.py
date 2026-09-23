"""Search Intelligence durable review, acquisition, and evidence records."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.config.search_intelligence import PARSER_VERSION, PRICE_VERSION
from app.core.database import Base
from app.models.constants import CASCADE_ALL_DELETE_ORPHAN

_RUN_FK = "search_intelligence_runs.id"
_DATASET_FK = "search_intelligence_datasets.id"


def _utcnow() -> datetime:
    return datetime.now(UTC)


class SearchIntelligenceRun(Base):
    __tablename__ = "search_intelligence_runs"
    __table_args__ = (
        UniqueConstraint(
            "workspace_id", "project_id", "id", name="uq_si_runs_scope_id"
        ),
        UniqueConstraint(
            "workspace_id",
            "project_id",
            "idempotency_key",
            name="uq_si_runs_idempotency",
        ),
        Index("ix_si_runs_project_created", "workspace_id", "project_id", "created_at"),
        Index(
            "uq_si_runs_project_active",
            "workspace_id",
            "project_id",
            unique=True,
            postgresql_where=text("status IN ('queued', 'running')"),
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
    project_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    analytics_task_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("analytics_tasks.id", ondelete="SET NULL"),
        nullable=True,
        unique=True,
    )
    actor_user_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT")
    )
    previous_run_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey(_RUN_FK, ondelete="SET NULL"),
        nullable=True,
    )
    connection_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("provider_connections.id", ondelete="RESTRICT"),
        index=True,
    )
    connection_revision: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True))
    account_identity: Mapped[str] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(String(24), default="reviewed")
    action: Mapped[str] = mapped_column(String(32), default="analysis")
    idempotency_key: Mapped[str] = mapped_column(String(160))
    frozen_scope: Mapped[dict] = mapped_column(JSONB)
    call_plan: Mapped[list] = mapped_column(JSONB)
    reused_datasets: Mapped[list] = mapped_column(JSONB, default=list)
    pricing_version: Mapped[str] = mapped_column(String(64), default=PRICE_VERSION)
    estimated_cost_usd: Mapped[Decimal] = mapped_column(Numeric(20, 8))
    provider_reported_cost_usd: Mapped[Decimal | None] = mapped_column(
        Numeric(20, 8), nullable=True
    )
    planned_calls: Mapped[int] = mapped_column(Integer)
    completed_calls: Mapped[int] = mapped_column(Integer, default=0)
    planned_rows: Mapped[int] = mapped_column(Integer)
    received_rows: Mapped[int] = mapped_column(Integer, default=0)
    uncertain_calls: Mapped[int] = mapped_column(Integer, default=0)
    error_code: Mapped[str] = mapped_column(String(64), default="")
    error_detail: Mapped[str] = mapped_column(Text, default="")
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    confirmed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    cancelled_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )

    datasets: Mapped[list[SearchIntelligenceDataset]] = relationship(
        "SearchIntelligenceDataset",
        back_populates="run",
        cascade=CASCADE_ALL_DELETE_ORPHAN,
        passive_deletes=True,
    )
    calls: Mapped[list[SearchIntelligenceCall]] = relationship(
        "SearchIntelligenceCall",
        back_populates="run",
        cascade=CASCADE_ALL_DELETE_ORPHAN,
        passive_deletes=True,
    )


class SearchIntelligenceDataset(Base):
    __tablename__ = "search_intelligence_datasets"
    __table_args__ = (
        UniqueConstraint(
            "workspace_id", "project_id", "id", name="uq_si_datasets_scope_id"
        ),
        ForeignKeyConstraint(
            ["workspace_id", "project_id", "run_id"],
            [
                "search_intelligence_runs.workspace_id",
                "search_intelligence_runs.project_id",
                _RUN_FK,
            ],
            ondelete="CASCADE",
            name="fk_si_dataset_run_scope",
        ),
        Index(
            "ix_si_datasets_latest",
            "workspace_id",
            "project_id",
            "dataset_kind",
            "published_at",
        ),
    )
    id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    workspace_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), index=True)
    project_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), index=True)
    run_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), index=True)
    parent_dataset_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey(_DATASET_FK, ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )
    dataset_kind: Mapped[str] = mapped_column(String(32))
    scope_hash: Mapped[str] = mapped_column(String(64), index=True)
    target_domain: Mapped[str] = mapped_column(String(255))
    target_hostname: Mapped[str] = mapped_column(String(255))
    target_origin: Mapped[str] = mapped_column(String(1024))
    comparison_origin: Mapped[str] = mapped_column(String(1024), default="")
    location_code: Mapped[int | None] = mapped_column(Integer, nullable=True)
    language_code: Mapped[str] = mapped_column(String(16), default="")
    status: Mapped[str] = mapped_column(String(16), default="collecting")
    coverage: Mapped[str] = mapped_column(String(16), default="unknown")
    requested_rows: Mapped[int] = mapped_column(Integer, default=1)
    raw_rows_received: Mapped[int] = mapped_column(Integer, default=0)
    unique_rows_saved: Mapped[int] = mapped_column(Integer, default=0)
    provider_total: Mapped[int | None] = mapped_column(Integer, nullable=True)
    truncated: Mapped[bool] = mapped_column(Boolean, default=False)
    summary: Mapped[dict] = mapped_column(JSONB, default=dict)
    provider_filters: Mapped[dict] = mapped_column(JSONB)
    parser_version: Mapped[str] = mapped_column(String(32), default=PARSER_VERSION)
    collection_started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    collection_ended_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    published_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )
    run: Mapped[SearchIntelligenceRun] = relationship(
        "SearchIntelligenceRun", back_populates="datasets"
    )
    calls: Mapped[list[SearchIntelligenceCall]] = relationship(
        "SearchIntelligenceCall", back_populates="dataset", overlaps="calls,run"
    )
    rows: Mapped[list[SearchIntelligenceRow]] = relationship(
        "SearchIntelligenceRow",
        back_populates="dataset",
        cascade=CASCADE_ALL_DELETE_ORPHAN,
        passive_deletes=True,
    )


class SearchIntelligenceCall(Base):
    __tablename__ = "search_intelligence_calls"
    __table_args__ = (
        UniqueConstraint("run_id", "request_key", name="uq_si_call_request"),
        UniqueConstraint(
            "workspace_id", "project_id", "id", name="uq_si_call_scope_id"
        ),
        ForeignKeyConstraint(
            ["workspace_id", "project_id", "run_id"],
            [
                "search_intelligence_runs.workspace_id",
                "search_intelligence_runs.project_id",
                _RUN_FK,
            ],
            ondelete="CASCADE",
            name="fk_si_call_run_scope",
        ),
        ForeignKeyConstraint(
            ["workspace_id", "project_id", "dataset_id"],
            [
                "search_intelligence_datasets.workspace_id",
                "search_intelligence_datasets.project_id",
                _DATASET_FK,
            ],
            ondelete="CASCADE",
            name="fk_si_call_dataset_scope",
        ),
    )
    id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    workspace_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), index=True)
    project_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), index=True)
    run_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), index=True)
    dataset_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), index=True)
    request_key: Mapped[str] = mapped_column(String(128))
    sequence: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(16), default="intent")
    endpoint: Mapped[str] = mapped_column(String(255))
    sanitized_request: Mapped[dict] = mapped_column(JSONB)
    sanitized_response: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    response_sha256: Mapped[str] = mapped_column(String(64), default="")
    provider_task_id: Mapped[str] = mapped_column(String(255), default="")
    estimated_cost_usd: Mapped[Decimal] = mapped_column(Numeric(20, 8))
    provider_reported_cost_usd: Mapped[Decimal | None] = mapped_column(
        Numeric(20, 8), nullable=True
    )
    error_code: Mapped[str] = mapped_column(String(64), default="")
    error_detail: Mapped[str] = mapped_column(Text, default="")
    dispatched_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )
    run: Mapped[SearchIntelligenceRun] = relationship(
        "SearchIntelligenceRun", back_populates="calls", overlaps="calls"
    )
    dataset: Mapped[SearchIntelligenceDataset] = relationship(
        "SearchIntelligenceDataset", back_populates="calls", overlaps="calls,run"
    )


class SearchIntelligenceDispatchAttempt(Base):
    """Append-only dispatch and outcome evidence for each Live send."""

    __tablename__ = "search_intelligence_dispatch_attempts"
    __table_args__ = (
        UniqueConstraint("call_id", "ordinal", "phase", name="uq_si_dispatch_phase"),
        ForeignKeyConstraint(
            ["workspace_id", "project_id", "call_id"],
            [
                "search_intelligence_calls.workspace_id",
                "search_intelligence_calls.project_id",
                "search_intelligence_calls.id",
            ],
            name="fk_si_dispatch_call_scope",
            ondelete="CASCADE",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    workspace_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), index=True)
    project_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), index=True)
    call_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), index=True)
    ordinal: Mapped[int] = mapped_column(Integer)
    phase: Mapped[str] = mapped_column(String(16))
    status: Mapped[str] = mapped_column(String(24), default="dispatched")
    error_code: Mapped[str] = mapped_column(String(64), default="")
    retry_after_seconds: Mapped[float | None] = mapped_column(nullable=True)
    dispatched_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )


class SearchIntelligenceRow(Base):
    __tablename__ = "search_intelligence_rows"
    __table_args__ = (
        UniqueConstraint(
            "dataset_id", "provider_row_key", name="uq_si_row_provider_key"
        ),
        ForeignKeyConstraint(
            ["workspace_id", "project_id", "dataset_id"],
            [
                "search_intelligence_datasets.workspace_id",
                "search_intelligence_datasets.project_id",
                _DATASET_FK,
            ],
            ondelete="CASCADE",
            name="fk_si_row_dataset_scope",
        ),
        Index("ix_si_rows_keyword", "dataset_id", "keyword"),
        Index("ix_si_rows_domain", "dataset_id", "domain"),
        Index("ix_si_rows_url", "dataset_id", "url"),
    )
    id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    workspace_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), index=True)
    project_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), index=True)
    dataset_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), index=True)
    call_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("search_intelligence_calls.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )
    provider_row_key: Mapped[str] = mapped_column(String(64))
    row_kind: Mapped[str] = mapped_column(String(32))
    keyword: Mapped[str] = mapped_column(String(2048), default="")
    domain: Mapped[str] = mapped_column(String(512), default="")
    url: Mapped[str] = mapped_column(String(4096), default="")
    search_volume: Mapped[int | None] = mapped_column(Integer, nullable=True)
    difficulty: Mapped[int | None] = mapped_column(Integer, nullable=True)
    intent: Mapped[str] = mapped_column(String(32), default="")
    rank_group: Mapped[int | None] = mapped_column(Integer, nullable=True)
    owned_rank_group: Mapped[int | None] = mapped_column(Integer, nullable=True)
    etv: Mapped[Decimal | None] = mapped_column(Numeric(20, 8), nullable=True)
    backlinks: Mapped[int | None] = mapped_column(Integer, nullable=True)
    referring_main_domains: Mapped[int | None] = mapped_column(Integer, nullable=True)
    dataforseo_rank: Mapped[int | None] = mapped_column(Integer, nullable=True)
    auxiliary: Mapped[dict] = mapped_column(JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )
    dataset: Mapped[SearchIntelligenceDataset] = relationship(
        "SearchIntelligenceDataset", back_populates="rows"
    )
