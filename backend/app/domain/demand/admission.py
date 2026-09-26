"""Manual refresh admission; automatic evidence projections keep their owner.

The workspace advisory lock precedes all admission/enqueue work and is held
until the API commits. No helper here commits. Numeric workspace rate/capacity
policy is still pending; this enforces the approved saved-window/project rule.
"""

from __future__ import annotations

import uuid
from datetime import date

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config.abuse import abuse_settings
from app.core.config.analytics import ANALYTICS_TASK_KIND_DEMAND_SNAPSHOT_REFRESH
from app.core.config.demand import DEMAND_MANUAL_ACTIVE_PER_PROJECT
from app.core.config.task_queue import TASK_ACTIVE_STATUSES
from app.domain.abuse.service import UsageLimitExceededError, lock_subject
from app.domain.analytics.enqueue import enqueue_demand_snapshot_refresh
from app.domain.demand.service import demand_source_revision
from app.models.analytics import AnalyticsTask
from app.models.demand import DemandSnapshot


class DemandWindowNotSavedError(ValueError):
    """The manual endpoint only refreshes previously persisted windows."""


async def enqueue_manual_refresh(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    window_start: date,
    window_end: date,
) -> uuid.UUID | None:
    await lock_subject(session, namespace="demand_manual", subject=workspace_id)
    saved = await session.scalar(
        select(DemandSnapshot.id)
        .where(
            DemandSnapshot.workspace_id == workspace_id,
            DemandSnapshot.project_id == project_id,
            DemandSnapshot.window_start == window_start,
            DemandSnapshot.window_end == window_end,
        )
        .limit(1)
    )
    if saved is None:
        raise DemandWindowNotSavedError("Refresh a saved Search Demand window")
    revision = await demand_source_revision(
        session,
        workspace_id=workspace_id,
        project_id=project_id,
        window_start=window_start,
        window_end=window_end,
    )
    task_id = await enqueue_demand_snapshot_refresh(
        session,
        workspace_id=workspace_id,
        project_id=project_id,
        window_start=window_start,
        window_end=window_end,
        source_revision=revision,
        manual=True,
    )
    if task_id is None:
        return None
    # Count the tentative insert in this transaction. A rejection rolls it
    # back with the request; exact retries never reserve another slot.
    active = await session.scalar(
        select(func.count())
        .select_from(AnalyticsTask)
        .where(
            AnalyticsTask.workspace_id == workspace_id,
            AnalyticsTask.project_id == project_id,
            AnalyticsTask.task_kind == ANALYTICS_TASK_KIND_DEMAND_SNAPSHOT_REFRESH,
            # Older queued payloads have no origin marker. Conservatively hold
            # manual capacity until they finish; never rewrite queued evidence.
            AnalyticsTask.payload["manual"].as_boolean().is_distinct_from(False),
            AnalyticsTask.status.in_(TASK_ACTIVE_STATUSES),
        )
    )
    if int(active or 0) > DEMAND_MANUAL_ACTIVE_PER_PROJECT:
        raise UsageLimitExceededError(
            operation="demand_manual_active",
            retry_after_seconds=abuse_settings.active_job_retry_after_seconds,
        )
    return task_id
