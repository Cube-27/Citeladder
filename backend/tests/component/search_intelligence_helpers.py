"""Stand-ins for the TypeScript-owned Search Intelligence run transitions.

Confirmation and cancellation are served by the TypeScript API service
(migration PR 8a) and covered by its PostgreSQL suite. The Python executor
tests only need their persisted outcome: a queued run with its task, or a
run cancelled mid-acquisition.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config.analytics import ANALYTICS_TASK_KIND_SEARCH_INTELLIGENCE
from app.models.analytics import AnalyticsTask
from app.models.search_intelligence import SearchIntelligenceRun


async def queue_confirmed_run(
    session_factory: async_sessionmaker[AsyncSession], run_id: uuid.UUID
) -> AnalyticsTask:
    """The state a confirmation commits: a queued run and its acquisition task."""
    async with session_factory() as session:
        run = await session.get(SearchIntelligenceRun, run_id, with_for_update=True)
        assert run is not None and run.status == "reviewed"
        task = AnalyticsTask(
            workspace_id=run.workspace_id,
            project_id=run.project_id,
            task_kind=ANALYTICS_TASK_KIND_SEARCH_INTELLIGENCE,
            payload={"run_id": str(run.id)},
            idempotency_key=f"analytics:{ANALYTICS_TASK_KIND_SEARCH_INTELLIGENCE}:{run.id}",
        )
        session.add(task)
        await session.flush()
        run.confirmed_at = datetime.now(UTC)
        run.status = "queued"
        run.analytics_task_id = task.id
        await session.commit()
        await session.refresh(task)
        return task


async def cancel_run(
    session_factory: async_sessionmaker[AsyncSession], run_id: uuid.UUID
) -> None:
    """The state a cancellation commits while the executor is mid-run."""
    async with session_factory() as session:
        run = await session.get(SearchIntelligenceRun, run_id, with_for_update=True)
        assert run is not None
        run.status = "cancelled"
        run.cancelled_at = datetime.now(UTC)
        await session.commit()
