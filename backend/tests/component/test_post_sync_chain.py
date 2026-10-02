"""C5 post-sync hook: the referral chain's first link and who runs it.

The hook stays in Python; the chain it starts (ingest -> classify -> AI
Referrals snapshot refresh) runs in the TypeScript analytics worker since
TypeScript migration PR 4, whose component suite covers the executors
(``frontend/services/api/test/analytics-worker.test.ts``). This file pins what
Python still owns: a referral artifact enqueues exactly one ``ingest_referrals``
row, a re-sync enqueues a new one while a duplicate hook call dedupes.
Requires a real Postgres.
"""

from __future__ import annotations

from datetime import date

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config.analytics import (
    ANALYTICS_TASK_KIND_INGEST_REFERRALS,
)
from app.core.config.task_queue import TASK_STATUS_QUEUED
from app.domain.analytics.enqueue import enqueue_post_sync_projections
from app.models.analytics import AnalyticsTask
from app.models.integrations import IntegrationConnection
from tests.component.analytics_helpers import (
    seed_ga4_import,
    seed_metric_row,
    seed_workspace_project,
)

_GA4_DATE = "20260720"  # GA4 date dimension values arrive as YYYYMMDD.


async def _ingest_tasks(session: AsyncSession) -> list[AnalyticsTask]:
    return list(
        (
            await session.scalars(
                select(AnalyticsTask).where(
                    AnalyticsTask.task_kind == ANALYTICS_TASK_KIND_INGEST_REFERRALS
                )
            )
        ).all()
    )


@pytest.mark.asyncio
async def test_hook_enqueues_ingest_that_only_typescript_claims(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    async with session_factory() as session:
        workspace_id, project_id = await seed_workspace_project(session)
    async with session_factory() as session:
        seed0 = await seed_ga4_import(
            session, workspace_id=workspace_id, project_id=project_id
        )
        await seed_metric_row(
            session,
            seed=seed0,
            row_date=date(2026, 7, 20),
            dimension_values=["https://chatgpt.com/c/abc", _GA4_DATE],
            metrics={"sessions": 5},
        )
        await session.commit()

    async with session_factory() as session:
        enqueued = await enqueue_post_sync_projections(
            session, project_id=project_id, import_artifact_ids=[seed0.artifact_id]
        )
        await session.commit()
    # ingest_referrals only: the referrer dataset is not a window-refresh trigger.
    assert len(enqueued) == 1

    async with session_factory() as session:
        (ingest,) = await _ingest_tasks(session)
        assert ingest.status == TASK_STATUS_QUEUED
        assert ingest.lease_owner is None
        assert ingest.payload == {"import_artifact_id": str(seed0.artifact_id)}

    # A duplicate hook call dedupes; a re-sync of the same window enqueues anew.
    async with session_factory() as session:
        assert (
            await enqueue_post_sync_projections(
                session, project_id=project_id, import_artifact_ids=[seed0.artifact_id]
            )
            == []
        )
        connection = await session.get(IntegrationConnection, seed0.connection_id)
        assert connection is not None
        seed1 = await seed_ga4_import(
            session,
            workspace_id=workspace_id,
            project_id=project_id,
            resync_seq=1,
            connection=connection,
        )
        await session.commit()
    async with session_factory() as session:
        enqueued = await enqueue_post_sync_projections(
            session, project_id=project_id, import_artifact_ids=[seed1.artifact_id]
        )
        await session.commit()
        assert len(enqueued) == 1
        tasks = await _ingest_tasks(session)
        artifacts = {task.payload["import_artifact_id"] for task in tasks}
        assert artifacts == {str(seed0.artifact_id), str(seed1.artifact_id)}
