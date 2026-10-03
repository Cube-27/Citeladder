"""Crawl Logs persistence; Alembic owns the baseline schema."""

import uuid
from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKeyConstraint,
    Index,
    Integer,
    String,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base

_PROJECT_ID_FK = "projects.id"
_PROJECT_WORKSPACE_FK = "projects.workspace_id"
_SOURCE_ID_FK = "crawl_log_sources.id"
_SOURCE_WORKSPACE_FK = "crawl_log_sources.workspace_id"
_SOURCE_PROJECT_FK = "crawl_log_sources.project_id"


class CrawlLogSource(Base):
    __tablename__ = "crawl_log_sources"
    __table_args__ = (
        UniqueConstraint(
            "workspace_id", "project_id", "id", name="uq_crawl_log_sources_scope"
        ),
        ForeignKeyConstraint(
            ["workspace_id", "project_id"],
            [_PROJECT_WORKSPACE_FK, _PROJECT_ID_FK],
            ondelete="CASCADE",
        ),
        Index(
            "uq_crawl_log_live_host",
            "workspace_id",
            "project_id",
            "host",
            unique=True,
            postgresql_where=text("status = 'active' AND kind = 'webhook'"),
        ),
    )
    id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True)
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), nullable=False
    )
    project_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    kind: Mapped[str] = mapped_column(String(24), nullable=False)
    setup: Mapped[str] = mapped_column(String(32), nullable=False)
    preset: Mapped[str] = mapped_column(String(64), nullable=False)
    format: Mapped[str] = mapped_column(String(24), nullable=False)
    collection_point: Mapped[str] = mapped_column(String(24), nullable=False)
    sampling: Mapped[dict | list] = mapped_column(JSONB, nullable=False)
    origin: Mapped[str] = mapped_column(String(512), nullable=False)
    host: Mapped[str] = mapped_column(String(255), nullable=False)
    accepted_hosts: Mapped[dict | list] = mapped_column(JSONB, nullable=False)
    token_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    token_prefix: Mapped[str | None] = mapped_column(String(24), nullable=True)
    status: Mapped[str] = mapped_column(String(24), nullable=False)
    created_by_member_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    revoked_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    last_processed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )


class CrawlLogUpload(Base):
    __tablename__ = "crawl_log_uploads"
    __table_args__ = (
        UniqueConstraint(
            "workspace_id", "project_id", "id", name="uq_crawl_log_uploads_scope"
        ),
        ForeignKeyConstraint(
            ["workspace_id", "project_id"],
            [_PROJECT_WORKSPACE_FK, _PROJECT_ID_FK],
            ondelete="CASCADE",
        ),
        ForeignKeyConstraint(
            ["workspace_id", "project_id", "source_id"],
            [
                _SOURCE_WORKSPACE_FK,
                _SOURCE_PROJECT_FK,
                _SOURCE_ID_FK,
            ],
            ondelete="CASCADE",
        ),
    )
    id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True)
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), nullable=False
    )
    project_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    source_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(24), nullable=False)
    missing_fields: Mapped[dict | list] = mapped_column(JSONB, nullable=False)
    last_ack_seq: Mapped[int] = mapped_column(Integer, nullable=False)
    scanned_lines: Mapped[int] = mapped_column(Integer, nullable=False)
    first_line_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    last_line_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    scanned_dates: Mapped[dict | list] = mapped_column(JSONB, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )


class CrawlLogBatch(Base):
    __tablename__ = "crawl_log_batches"
    __table_args__ = (
        UniqueConstraint(
            "workspace_id", "project_id", "id", name="uq_crawl_log_batches_scope"
        ),
        ForeignKeyConstraint(
            ["workspace_id", "project_id"],
            [_PROJECT_WORKSPACE_FK, _PROJECT_ID_FK],
            ondelete="CASCADE",
        ),
        ForeignKeyConstraint(
            ["workspace_id", "project_id", "source_id"],
            [
                _SOURCE_WORKSPACE_FK,
                _SOURCE_PROJECT_FK,
                _SOURCE_ID_FK,
            ],
            ondelete="CASCADE",
        ),
        ForeignKeyConstraint(
            ["workspace_id", "project_id", "upload_id"],
            [
                "crawl_log_uploads.workspace_id",
                "crawl_log_uploads.project_id",
                "crawl_log_uploads.id",
            ],
            ondelete="CASCADE",
        ),
        UniqueConstraint(
            "workspace_id",
            "source_id",
            "idempotency_key",
            name="uq_crawl_log_batch_key",
        ),
    )
    id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True)
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), nullable=False
    )
    project_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    source_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    upload_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), nullable=True
    )
    seq: Mapped[int | None] = mapped_column(Integer, nullable=True)
    idempotency_key: Mapped[str] = mapped_column(String(255), nullable=False)
    received_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    format: Mapped[str] = mapped_column(String(24), nullable=False)
    status: Mapped[str] = mapped_column(String(24), nullable=False)
    missing_fields: Mapped[dict | list] = mapped_column(JSONB, nullable=False)
    parser_version: Mapped[str] = mapped_column(String(32), nullable=False)
    catalog_version: Mapped[str] = mapped_column(String(32), nullable=False)
    lines_received: Mapped[int] = mapped_column(Integer, nullable=False)
    lines_parsed: Mapped[int] = mapped_column(Integer, nullable=False)
    lines_matched: Mapped[int] = mapped_column(Integer, nullable=False)
    lines_unmatched: Mapped[int] = mapped_column(Integer, nullable=False)
    lines_out_of_scope: Mapped[int] = mapped_column(Integer, nullable=False)
    lines_rejected: Mapped[int] = mapped_column(Integer, nullable=False)
    lines_duplicate: Mapped[int] = mapped_column(Integer, nullable=False)
    lines_overlapping: Mapped[int] = mapped_column(Integer, nullable=False)
    first_line_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    last_line_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    heartbeat: Mapped[bool] = mapped_column(Boolean, nullable=False)


class BotIpRangeSnapshot(Base):
    __tablename__ = "bot_ip_range_snapshots"
    id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True)
    bot_id: Mapped[str] = mapped_column(String(64), nullable=False)
    source_url: Mapped[str] = mapped_column(String(1024), nullable=False)
    fetched_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    content_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    cidrs: Mapped[dict | list] = mapped_column(JSONB, nullable=False)
    status: Mapped[str] = mapped_column(String(24), nullable=False)


class BotRequest(Base):
    __tablename__ = "bot_requests"
    __table_args__ = (
        UniqueConstraint(
            "workspace_id", "project_id", "id", name="uq_bot_requests_scope"
        ),
        ForeignKeyConstraint(
            ["workspace_id", "project_id"],
            [_PROJECT_WORKSPACE_FK, _PROJECT_ID_FK],
            ondelete="CASCADE",
        ),
        ForeignKeyConstraint(
            ["workspace_id", "project_id", "source_id"],
            [
                _SOURCE_WORKSPACE_FK,
                _SOURCE_PROJECT_FK,
                _SOURCE_ID_FK,
            ],
            ondelete="CASCADE",
        ),
        ForeignKeyConstraint(
            ["workspace_id", "project_id", "batch_id"],
            [
                "crawl_log_batches.workspace_id",
                "crawl_log_batches.project_id",
                "crawl_log_batches.id",
            ],
            ondelete="CASCADE",
        ),
        ForeignKeyConstraint(["ip_range_snapshot_id"], ["bot_ip_range_snapshots.id"]),
        Index(
            "uq_bot_request_provider",
            "workspace_id",
            "project_id",
            "host",
            "provider_request_id",
            unique=True,
            postgresql_where=text("provider_request_id IS NOT NULL"),
        ),
        Index(
            "uq_bot_request_line",
            "workspace_id",
            "source_id",
            "line_hash",
            unique=True,
            postgresql_where=text("provider_request_id IS NULL"),
        ),
        Index(
            "ix_bot_requests_activity",
            "workspace_id",
            "project_id",
            "occurred_at",
            "id",
        ),
        Index("ix_bot_requests_retention", "workspace_id", "occurred_at", "id"),
    )
    id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True)
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), nullable=False
    )
    project_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    source_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    batch_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    host: Mapped[str] = mapped_column(String(255), nullable=False)
    display_path: Mapped[str] = mapped_column(String(2048), nullable=False)
    identity: Mapped[str] = mapped_column(String(24), nullable=False)
    identity_reason: Mapped[str | None] = mapped_column(String(32), nullable=True)
    url_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    folder: Mapped[str] = mapped_column(String(2048), nullable=False)
    resource_class: Mapped[str] = mapped_column(String(24), nullable=False)
    method: Mapped[str] = mapped_column(String(16), nullable=False)
    status_code: Mapped[int] = mapped_column(Integer, nullable=False)
    bot_id: Mapped[str] = mapped_column(String(64), nullable=False)
    catalog_version: Mapped[str] = mapped_column(String(32), nullable=False)
    verification: Mapped[str] = mapped_column(String(24), nullable=False)
    verification_reason: Mapped[str | None] = mapped_column(String(32), nullable=True)
    verification_basis: Mapped[str | None] = mapped_column(String(32), nullable=True)
    ip_range_snapshot_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), nullable=True
    )
    provider_request_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    line_hash: Mapped[str] = mapped_column(String(64), nullable=False)


class BotActivityDaily(Base):
    __tablename__ = "bot_activity_daily"
    __table_args__ = (
        UniqueConstraint(
            "workspace_id", "project_id", "id", name="uq_bot_activity_daily_scope"
        ),
        ForeignKeyConstraint(
            ["workspace_id", "project_id"],
            [_PROJECT_WORKSPACE_FK, _PROJECT_ID_FK],
            ondelete="CASCADE",
        ),
        UniqueConstraint(
            "workspace_id",
            "project_id",
            "reporting_date",
            "reporting_timezone",
            "bot_id",
            "identity_key",
            "verification",
            "status_code",
            name="uq_bot_activity_grain",
        ),
    )
    id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True)
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), nullable=False
    )
    project_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    reporting_date: Mapped[date] = mapped_column(Date, nullable=False)
    reporting_timezone: Mapped[str] = mapped_column(String(64), nullable=False)
    bot_id: Mapped[str] = mapped_column(String(64), nullable=False)
    identity_key: Mapped[str] = mapped_column(String(64), nullable=False)
    identity: Mapped[str] = mapped_column(String(24), nullable=False)
    url_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    display_path: Mapped[str] = mapped_column(String(2048), nullable=False)
    folder: Mapped[str] = mapped_column(String(2048), nullable=False)
    resource_class: Mapped[str] = mapped_column(String(24), nullable=False)
    verification: Mapped[str] = mapped_column(String(24), nullable=False)
    status_code: Mapped[int] = mapped_column(Integer, nullable=False)
    requests: Mapped[int] = mapped_column(Integer, nullable=False)
    first_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    last_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    formula_version: Mapped[str] = mapped_column(String(32), nullable=False)
    source_batch_ids: Mapped[dict | list] = mapped_column(JSONB, nullable=False)
    verification_reasons: Mapped[dict] = mapped_column(JSONB, nullable=False)


class CrawlLogCoverageDaily(Base):
    __tablename__ = "crawl_log_coverage_daily"
    __table_args__ = (
        UniqueConstraint(
            "workspace_id", "project_id", "id", name="uq_crawl_log_coverage_daily_scope"
        ),
        ForeignKeyConstraint(
            ["workspace_id", "project_id"],
            [_PROJECT_WORKSPACE_FK, _PROJECT_ID_FK],
            ondelete="CASCADE",
        ),
        ForeignKeyConstraint(
            ["workspace_id", "project_id", "source_id"],
            [
                _SOURCE_WORKSPACE_FK,
                _SOURCE_PROJECT_FK,
                _SOURCE_ID_FK,
            ],
            ondelete="CASCADE",
        ),
        UniqueConstraint(
            "workspace_id",
            "source_id",
            "reporting_date",
            "reporting_timezone",
            name="uq_crawl_log_coverage_day",
        ),
    )
    id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True)
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), nullable=False
    )
    project_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    source_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    reporting_date: Mapped[date] = mapped_column(Date, nullable=False)
    reporting_timezone: Mapped[str] = mapped_column(String(64), nullable=False)
    coverage: Mapped[str] = mapped_column(String(24), nullable=False)
    reason: Mapped[str] = mapped_column(String(64), nullable=False)
    batch_count: Mapped[int] = mapped_column(Integer, nullable=False)
    heartbeat_count: Mapped[int] = mapped_column(Integer, nullable=False)
    max_gap_minutes: Mapped[float] = mapped_column(Float, nullable=False)


class CrawlLogState(Base):
    __tablename__ = "crawl_log_states"
    __table_args__ = (
        UniqueConstraint(
            "workspace_id", "project_id", "id", name="uq_crawl_log_states_scope"
        ),
        ForeignKeyConstraint(
            ["workspace_id", "project_id"],
            [_PROJECT_WORKSPACE_FK, _PROJECT_ID_FK],
            ondelete="CASCADE",
        ),
        UniqueConstraint(
            "workspace_id", "project_id", name="uq_crawl_log_state_project"
        ),
    )
    id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True)
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), nullable=False
    )
    project_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    reporting_timezone: Mapped[str] = mapped_column(String(64), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
