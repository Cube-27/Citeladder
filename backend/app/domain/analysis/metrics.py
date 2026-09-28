"""Persisted metric-snapshot readers."""

from __future__ import annotations

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.analysis.projection_common import load_snapshot
from app.domain.analysis.schemas import MetricsResponse


async def get_metrics(
    session: AsyncSession, *, workspace_id: uuid.UUID, audit_id: uuid.UUID
) -> MetricsResponse:
    """Serve the single-run ``MetricSnapshot`` projection."""
    snapshot = await load_snapshot(
        session, workspace_id=workspace_id, audit_id=audit_id
    )
    return MetricsResponse.model_validate(snapshot)
