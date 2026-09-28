"""Shared persisted-analysis projection lookups."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config.audits import (
    AUDIT_SCOPE_BRAND,
    AUDIT_STATUS_COMPLETED,
    AUDIT_STATUS_PARTIALLY_COMPLETED,
)
from app.domain.analysis.errors import AnalysisNotFoundError
from app.domain.audits.schemas import ModelProvenance, model_provenance_for
from app.models.analysis import MetricSnapshot
from app.models.audit import Audit

_DASHBOARD_STATUSES = (AUDIT_STATUS_COMPLETED, AUDIT_STATUS_PARTIALLY_COMPLETED)
_AUDIT_NOT_FOUND = "Audit not found"


def aggregate_provenance(audit: Audit) -> list[ModelProvenance]:
    """Stable frozen route-provenance list for an aggregate surface."""
    return model_provenance_for(audit.engine_snapshots, audit.configuration)


async def load_snapshot(
    session: AsyncSession, *, workspace_id: uuid.UUID, audit_id: uuid.UUID
) -> MetricSnapshot:
    snapshot = await session.scalar(
        select(MetricSnapshot).where(
            MetricSnapshot.audit_id == audit_id,
            MetricSnapshot.workspace_id == workspace_id,
        )
    )
    if snapshot is None:
        raise AnalysisNotFoundError("Metrics not available for audit")
    return snapshot


async def latest_dashboard_audit_id(
    session: AsyncSession, *, workspace_id: uuid.UUID, project_id: uuid.UUID
) -> uuid.UUID | None:
    return await session.scalar(
        select(Audit.id)
        .where(
            Audit.workspace_id == workspace_id,
            Audit.project_id == project_id,
            Audit.audit_scope == AUDIT_SCOPE_BRAND,
            Audit.status.in_(_DASHBOARD_STATUSES),
        )
        .order_by(Audit.completed_at.desc().nullslast(), Audit.created_at.desc())
        .limit(1)
    )


async def load_run_snapshots(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    to_at: datetime | None,
    newest: int | None = None,
) -> list[tuple[MetricSnapshot, Audit]]:
    """(snapshot, audit) pairs of the project's dashboard-ready brand runs.

    Completed no later than ``to_at``, oldest first. ``newest`` bounds the read
    to that many most-recent runs: a caller walking back to the nearest match
    needs the recent end of the history, not all of it.
    """
    stmt = (
        select(MetricSnapshot, Audit)
        .join(Audit, Audit.id == MetricSnapshot.audit_id)
        .options(selectinload(Audit.engine_snapshots))
        .where(
            MetricSnapshot.workspace_id == workspace_id,
            MetricSnapshot.project_id == project_id,
            Audit.workspace_id == workspace_id,
            Audit.project_id == project_id,
            Audit.audit_scope == AUDIT_SCOPE_BRAND,
            Audit.status.in_(_DASHBOARD_STATUSES),
            Audit.completed_at.is_not(None),
        )
    )
    if to_at is not None:
        stmt = stmt.where(Audit.completed_at <= to_at)
    if newest is not None:
        stmt = stmt.order_by(Audit.completed_at.desc(), Audit.created_at.desc()).limit(
            newest
        )
        rows = list((await session.execute(stmt)).tuples().all())
        rows.reverse()
        return rows
    stmt = stmt.order_by(Audit.completed_at.asc(), Audit.created_at.asc())
    return list((await session.execute(stmt)).tuples().all())
