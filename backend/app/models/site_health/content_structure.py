"""Content analysis manifests and append-only provider events."""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKeyConstraint, Integer, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.site_health.common import _utcnow


class SiteContentStructureRun(Base):
    __tablename__ = "site_content_structure_runs"
    __table_args__ = (
        ForeignKeyConstraint(
            ["workspace_id", "project_id", "crawl_id"],
            ["site_crawls.workspace_id", "site_crawls.project_id", "site_crawls.id"],
            ondelete="CASCADE",
        ),
        UniqueConstraint("workspace_id", "project_id", "idempotency_key"),
        UniqueConstraint("workspace_id", "project_id", "id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID, primary_key=True)
    workspace_id: Mapped[uuid.UUID] = mapped_column(UUID, index=True)
    project_id: Mapped[uuid.UUID] = mapped_column(UUID, index=True)
    crawl_id: Mapped[uuid.UUID] = mapped_column(UUID)
    actor_id: Mapped[uuid.UUID] = mapped_column(UUID)
    idempotency_key: Mapped[str] = mapped_column(String(36))
    state: Mapped[str] = mapped_column(String(24))
    policy_version: Mapped[int] = mapped_column(Integer)
    manifest: Mapped[dict] = mapped_column(JSONB)
    result: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )


class SiteContentStructureEvent(Base):
    __tablename__ = "site_content_structure_events"
    __table_args__ = (
        ForeignKeyConstraint(
            ["workspace_id", "project_id", "run_id"],
            [
                "site_content_structure_runs.workspace_id",
                "site_content_structure_runs.project_id",
                "site_content_structure_runs.id",
            ],
            ondelete="CASCADE",
        ),
        UniqueConstraint("run_id", "candidate_id", "kind"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID, primary_key=True, default=uuid.uuid4)
    workspace_id: Mapped[uuid.UUID] = mapped_column(UUID, index=True)
    project_id: Mapped[uuid.UUID] = mapped_column(UUID, index=True)
    run_id: Mapped[uuid.UUID] = mapped_column(UUID)
    candidate_id: Mapped[uuid.UUID] = mapped_column(UUID)
    kind: Mapped[str] = mapped_column(String(24))
    evidence: Mapped[dict] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )
