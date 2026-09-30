"""Shared persisted-analysis projection lookups."""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config.audits import (
    AUDIT_STATUS_COMPLETED,
    AUDIT_STATUS_PARTIALLY_COMPLETED,
)
from app.domain.analysis.errors import AnalysisNotFoundError
from app.models.analysis import MetricSnapshot

_DASHBOARD_STATUSES = (AUDIT_STATUS_COMPLETED, AUDIT_STATUS_PARTIALLY_COMPLETED)
_AUDIT_NOT_FOUND = "Audit not found"


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
