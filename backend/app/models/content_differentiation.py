from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import (
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


def _utcnow() -> datetime:
    return datetime.now(UTC)


class ContentDifferentiationCandidate(Base):
    """One organic result selected for a prompt without creating a Citation."""

    __tablename__ = "content_differentiation_candidates"
    __table_args__ = (
        ForeignKeyConstraint(
            ["workspace_id", "project_id", "audit_id"],
            ["audits.workspace_id", "audits.project_id", "audits.id"],
            ondelete="CASCADE",
        ),
        ForeignKeyConstraint(
            ["workspace_id", "project_id", "audit_id", "audit_task_id"],
            [
                "audit_tasks.workspace_id",
                "audit_tasks.project_id",
                "audit_tasks.audit_id",
                "audit_tasks.id",
            ],
            ondelete="CASCADE",
        ),
        ForeignKeyConstraint(
            ["workspace_id", "project_id", "source_page_id"],
            [
                "source_pages.workspace_id",
                "source_pages.project_id",
                "source_pages.id",
            ],
            ondelete="CASCADE",
        ),
        UniqueConstraint(
            "audit_task_id",
            "source_page_id",
            name="uq_content_diff_candidate_task_page",
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
    audit_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), index=True)
    audit_task_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), index=True)
    source_page_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), index=True)
    query_text: Mapped[str] = mapped_column(Text, default="")
    rank: Mapped[int] = mapped_column(Integer)
    result_title: Mapped[str] = mapped_column(Text, default="")
    search_context: Mapped[dict] = mapped_column(JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )


class ContentDifferentiationReport(Base):
    """Persisted comparison projection for one measured search prompt."""

    __tablename__ = "content_differentiation_reports"
    __table_args__ = (
        ForeignKeyConstraint(
            ["workspace_id", "project_id", "audit_id"],
            ["audits.workspace_id", "audits.project_id", "audits.id"],
            ondelete="CASCADE",
        ),
        ForeignKeyConstraint(
            ["workspace_id", "project_id", "audit_id", "audit_task_id"],
            [
                "audit_tasks.workspace_id",
                "audit_tasks.project_id",
                "audit_tasks.audit_id",
                "audit_tasks.id",
            ],
            ondelete="CASCADE",
        ),
        ForeignKeyConstraint(
            ["owned_site_url_id", "project_id", "workspace_id"],
            ["site_urls.id", "site_urls.project_id", "site_urls.workspace_id"],
            ondelete="SET NULL (owned_site_url_id)",
        ),
        UniqueConstraint("audit_task_id", name="uq_content_diff_report_task"),
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
    audit_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), index=True)
    audit_task_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), index=True)
    owned_site_url_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), nullable=True
    )
    formula_version: Mapped[str] = mapped_column(String(64))
    report: Mapped[dict] = mapped_column(JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )
