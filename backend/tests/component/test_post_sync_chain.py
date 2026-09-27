"""C5 post-sync hook: the referral chain's first link and who runs it.

The hook stays in Python; the chain it starts (ingest -> classify -> AI
Referrals snapshot refresh) runs in the TypeScript analytics worker since
TypeScript migration PR 4, whose component suite covers the executors
(``frontend/services/api/test/analytics-worker.test.ts``). This file pins what
Python still owns: a referral artifact enqueues exactly one ``ingest_referrals``
row, a re-sync enqueues a new one while a duplicate hook call dedupes, and the
Python worker never claims a TypeScript-owned kind. Requires a real Postgres.
"""

from __future__ import annotations

import uuid
from datetime import date

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config.analytics import (
    ANALYTICS_TASK_KIND_INGEST_REFERRALS,
    ANALYTICS_TASK_KIND_OPPORTUNITY_VERIFICATION,
    ANALYTICS_TS_OWNED_TASK_KINDS,
)
from app.core.config.task_queue import TASK_STATUS_QUEUED
from app.domain.analytics.enqueue import enqueue_post_sync_projections
from app.domain.opportunities.verification import enqueue_implementation_verification
from app.models.analytics import AnalyticsTask
from app.models.integrations import IntegrationConnection
from app.workers.analytics_worker import AnalyticsWorker
from tests.component.analytics_helpers import (
    seed_ga4_import,
    seed_metric_row,
    seed_workspace_project,
)

_GA4_DATE = "20260720"  # GA4 date dimension values arrive as YYYYMMDD.


@pytest.mark.asyncio
async def test_python_leaves_every_typescript_kind_queued(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    async with session_factory() as session:
        workspace_id, project_id = await seed_workspace_project(session)
        ids = []
        for kind in ANALYTICS_TS_OWNED_TASK_KINDS:
            if kind == ANALYTICS_TASK_KIND_OPPORTUNITY_VERIFICATION:
                trigger_id = uuid.uuid4()
                for _ in range(2):
                    await enqueue_implementation_verification(
                        session,
                        workspace_id=workspace_id,
                        project_id=project_id,
                        trigger_kind="audit",
                        trigger_id=trigger_id,
                    )
                verification = (
                    await session.scalars(
                        select(AnalyticsTask).where(
                            AnalyticsTask.workspace_id == workspace_id,
                            AnalyticsTask.task_kind == kind,
                        )
                    )
                ).one()
                ids.append(verification.id)
                continue
            row = AnalyticsTask(
                workspace_id=workspace_id,
                project_id=project_id,
                task_kind=kind,
                payload={},
                idempotency_key=str(uuid.uuid4()),
            )
            session.add(row)
            await session.flush()
            ids.append(row.id)
        await session.commit()
    assert (
        await AnalyticsWorker(
            session_factory=session_factory, owner="python-complement"
        ).run_until_idle()
        == 0
    )
    async with session_factory() as session:
        rows = (
            await session.scalars(
                select(AnalyticsTask).where(AnalyticsTask.id.in_(ids))
            )
        ).all()
        assert all(
            row.status == TASK_STATUS_QUEUED and row.lease_owner is None for row in rows
        )


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

    # The Python worker leaves the TypeScript-owned row untouched in the queue.
    worker = AnalyticsWorker(session_factory=session_factory, owner="python-only")
    assert await worker.run_until_idle() == 0
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
