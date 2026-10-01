"""Site Health crawl terminalization: the paths that bypass a task's finalize.

A crawl goes terminal ONLY inside the locked lifecycle reconcile, which
normally runs after a task settles. Intermediate successful analysis
may now pass a strict read-only gate, but every lifecycle boundary still takes
the authoritative reconciliation path. Anything that drains a crawl's last
non-terminal task WITHOUT running a worker's finalize therefore used to strand
the crawl in an active status forever — no snapshot, no ``crawl.completed``
event, and clients polling it indefinitely.

These tests pin the two guarantees that close that hole:
  - the worker replays terminal settlements from the TypeScript owner;
  - a stalled crawl with no outstanding tasks is force-reconciled regardless of
    HOW it got that way (``reconcile_stalled``).

Requires a real Postgres.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock

import pytest
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

import app.workers.site_health.lifecycle as lifecycle_module
from app.core.config.analytics import ANALYTICS_TASK_KIND_OPPORTUNITY_REFRESH
from app.core.config.site_health_acquisition import ERROR_CRAWL_OVERDUE
from app.core.config.site_health_contracts import (
    ANALYSIS_STATUS_PENDING,
    ANALYSIS_STATUS_RUNNING,
    CRAWL_ACTIVE_STATUSES,
    CRAWL_STATUS_COMPLETED,
    CRAWL_STATUS_PAUSED,
    CRAWL_STATUS_RUNNING,
    DISCOVERY_STATUS_RUNNING,
    EVENT_CRAWL_COMPLETED,
    TASK_KIND_DISCOVER,
)
from app.core.config.site_health_runtime import (
    site_health_settings,
)
from app.core.config.task_queue import (
    TASK_STATUS_FAILED,
    TASK_STATUS_QUEUED,
    TASK_STATUS_SUCCEEDED,
)
from app.models.analytics import AnalyticsTask
from app.models.site_health.acquisition import SiteFetchArtifact
from app.models.site_health.crawl import SiteCrawl
from app.models.site_health.events import SiteCrawlEvent
from app.models.site_health.queue import SiteCrawlTask
from app.models.site_health.snapshot import SiteHealthSnapshot
from app.workers.site_health.lifecycle import CrawlLifecycle
from app.workers.site_health_worker import SiteHealthWorker
from tests.component.site_health_helpers import SiteSeed, seed_site_crawl
from tests.component.site_health_worker_helpers import _seed_analyze_phase_crawl


def _worker(session_factory: async_sessionmaker[AsyncSession]) -> SiteHealthWorker:
    """A worker with no transport: these tests never let it reach a fetch."""
    return SiteHealthWorker(session_factory=session_factory, owner="lifecycle-test")


@pytest.mark.asyncio
async def test_replay_failure_does_not_suppress_crawl_backstops(
    session_factory: async_sessionmaker[AsyncSession], monkeypatch: pytest.MonkeyPatch
) -> None:
    worker = _worker(session_factory)
    stalled = AsyncMock()
    overdue = AsyncMock()
    monkeypatch.setattr(
        worker._ts_tasks, "reconcile", AsyncMock(side_effect=RuntimeError("bad row"))
    )
    monkeypatch.setattr(worker._lifecycle, "reconcile_stalled", stalled)
    monkeypatch.setattr(worker._lifecycle, "reconcile_overdue", overdue)
    assert await worker.run_once() == 0
    stalled.assert_awaited_once()
    overdue.assert_awaited_once()


async def _crawl(
    session_factory: async_sessionmaker[AsyncSession], crawl_id: uuid.UUID
) -> SiteCrawl:
    async with session_factory() as session:
        crawl = await session.get(SiteCrawl, crawl_id)
        assert crawl is not None
        return crawl


async def _seed_completed_analyze_task(
    session_factory: async_sessionmaker[AsyncSession],
    *,
    task_count: int,
) -> tuple[SiteSeed, uuid.UUID]:
    urls = tuple(f"https://example.com/page-{index}" for index in range(task_count))
    async with session_factory() as session:
        seed, task_ids = await _seed_analyze_phase_crawl(
            session,
            root=urls[0],
            urls=urls,
        )
        crawl = await session.get(SiteCrawl, seed.crawl_id)
        task = await session.get(SiteCrawlTask, task_ids[0][1])
        assert crawl is not None
        assert task is not None
        crawl.analysis_status = ANALYSIS_STATUS_RUNNING
        task.status = TASK_STATUS_SUCCEEDED
        task.completed_at = datetime.now(UTC)
        artifact = SiteFetchArtifact(
            task_id=task.id,
            crawl_id=seed.crawl_id,
            workspace_id=seed.workspace_id,
            fetch_purpose="analyze",
            requested_url=task.requested_url,
            final_url=task.requested_url,
            status_code=200,
            content_type="text/html",
        )
        session.add(artifact)
        await session.flush()
        task.result_artifact_id = artifact.id
        await session.commit()
        return seed, task.id


def _task_reference(
    seed: SiteSeed,
    task_id: uuid.UUID,
    *,
    workspace_id: uuid.UUID | None = None,
) -> SiteCrawlTask:
    return SiteCrawlTask(
        id=task_id,
        crawl_id=seed.crawl_id,
        workspace_id=workspace_id or seed.workspace_id,
    )


@pytest.mark.asyncio
async def test_intermediate_analyze_success_skips_full_reconciliation(
    session_factory: async_sessionmaker[AsyncSession],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    seed, task_id = await _seed_completed_analyze_task(session_factory, task_count=2)
    lifecycle = CrawlLifecycle(session_factory)
    refreshed: list[tuple[uuid.UUID, uuid.UUID]] = []

    async def reject_full_reconcile(_crawl_id: uuid.UUID) -> None:
        raise AssertionError("intermediate analyze success took the aggregate path")

    async def record_live_refresh(
        _session_factory: async_sessionmaker[AsyncSession],
        *,
        crawl_id: uuid.UUID,
        workspace_id: uuid.UUID,
    ) -> None:
        refreshed.append((crawl_id, workspace_id))

    monkeypatch.setattr(lifecycle, "reconcile", reject_full_reconcile)
    monkeypatch.setattr(
        lifecycle_module,
        "refresh_live_score_summary_for_crawl",
        record_live_refresh,
    )

    await lifecycle.reconcile_after_task(_task_reference(seed, task_id))
    assert refreshed == [(seed.crawl_id, seed.workspace_id)]


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "unsafe_state",
    ["missing_artifact", "failed", "pending", "discover"],
)
async def test_intermediate_analyze_uses_full_reconcile_for_unsafe_states(
    session_factory: async_sessionmaker[AsyncSession],
    monkeypatch: pytest.MonkeyPatch,
    unsafe_state: str,
) -> None:
    seed, task_id = await _seed_completed_analyze_task(session_factory, task_count=2)
    async with session_factory() as session:
        crawl = await session.get(SiteCrawl, seed.crawl_id)
        task = await session.get(SiteCrawlTask, task_id)
        assert crawl is not None
        assert task is not None
        if unsafe_state == "missing_artifact":
            task.result_artifact_id = None
        elif unsafe_state == "failed":
            task.status = TASK_STATUS_FAILED
        elif unsafe_state == "pending":
            crawl.analysis_status = ANALYSIS_STATUS_PENDING
        elif unsafe_state == "discover":
            task.task_kind = TASK_KIND_DISCOVER
        await session.commit()

    reconciled: list[uuid.UUID] = []
    lifecycle = CrawlLifecycle(session_factory)

    async def record_full_reconcile(crawl_id: uuid.UUID) -> None:
        reconciled.append(crawl_id)

    monkeypatch.setattr(lifecycle, "reconcile", record_full_reconcile)
    await lifecycle.reconcile_after_task(_task_reference(seed, task_id))

    assert reconciled == [seed.crawl_id]


@pytest.mark.asyncio
async def test_last_analyze_success_runs_authoritative_reconciliation(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    seed, task_id = await _seed_completed_analyze_task(session_factory, task_count=1)

    await CrawlLifecycle(session_factory).reconcile_after_task(
        _task_reference(seed, task_id)
    )

    crawl = await _crawl(session_factory, seed.crawl_id)
    assert crawl.status == CRAWL_STATUS_COMPLETED
    assert crawl.completed_at is not None


@pytest.mark.asyncio
async def test_task_reconcile_does_not_cross_workspace_boundary(
    session_factory: async_sessionmaker[AsyncSession],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    seed, task_id = await _seed_completed_analyze_task(session_factory, task_count=2)
    lifecycle = CrawlLifecycle(session_factory)

    async def reject_full_reconcile(_crawl_id: uuid.UUID) -> None:
        raise AssertionError("workspace mismatch reached unscoped reconciliation")

    monkeypatch.setattr(lifecycle, "reconcile", reject_full_reconcile)
    await lifecycle.reconcile_after_task(
        _task_reference(seed, task_id, workspace_id=uuid.uuid4())
    )

    assert (await _crawl(session_factory, seed.crawl_id)).status == CRAWL_STATUS_RUNNING


@pytest.mark.asyncio
async def test_run_once_terminalizes_crawl_after_typescript_recovery(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """THE stuck-crawl regression.

    TypeScript fails the crawl's last outstanding tasks at max attempts. No
    worker ever settles them, so before the fix nothing reconciled the crawl
    and it stayed 'running' forever.
    """
    async with session_factory() as session:
        seed = await seed_site_crawl(session, task_count=2)

    async with session_factory() as session:
        now = datetime.now(UTC)
        await session.execute(
            update(SiteCrawlTask)
            .where(SiteCrawlTask.crawl_id == seed.crawl_id)
            .values(
                status=TASK_STATUS_FAILED,
                attempt_count=SiteCrawlTask.max_attempts,
                lease_owner=None,
                lease_expires_at=None,
                heartbeat_at=None,
                completed_at=now,
                updated_at=now,
                error_code="max_attempts_exceeded",
            )
        )
        await session.commit()

    # Python only replays the settlement; TypeScript owns lease recovery.
    await _worker(session_factory).run_once()

    async with session_factory() as session:
        statuses = set(
            (
                await session.scalars(
                    select(SiteCrawlTask.status).where(
                        SiteCrawlTask.crawl_id == seed.crawl_id
                    )
                )
            ).all()
        )
    assert statuses == {TASK_STATUS_FAILED}

    crawl = await _crawl(session_factory, seed.crawl_id)
    assert crawl.status not in CRAWL_ACTIVE_STATUSES, (
        "crawl left active after the sweeper drained its last task"
    )
    assert crawl.completed_at is not None


@pytest.mark.asyncio
async def test_stalled_crawl_with_no_tasks_is_reconciled(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """The backstop: an active crawl with a fully-drained queue terminalizes.

    Models any route that terminalized the last task out of band (a killed
    process between the queue ack and the finalize, a manual status write).
    """
    async with session_factory() as session:
        seed = await seed_site_crawl(session, task_count=1)

    # Task terminal, crawl still active, quiet for longer than the threshold.
    stale = datetime.now(UTC) - timedelta(seconds=3600)
    async with session_factory() as session:
        await session.execute(
            update(SiteCrawlTask)
            .where(SiteCrawlTask.crawl_id == seed.crawl_id)
            .values(status=TASK_STATUS_SUCCEEDED, completed_at=stale)
        )
        await session.execute(
            update(SiteCrawl)
            .where(SiteCrawl.id == seed.crawl_id)
            .values(status=CRAWL_STATUS_RUNNING, updated_at=stale)
        )
        await session.commit()

    # Through the real loop, not the helper directly: the backstop is only
    # worth anything if ``run_once`` actually reaches it.
    await _worker(session_factory).run_once()

    crawl = await _crawl(session_factory, seed.crawl_id)
    assert crawl.status not in CRAWL_ACTIVE_STATUSES


@pytest.mark.asyncio
async def test_stalled_backstop_ignores_recently_touched_crawls(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """A crawl merely BETWEEN tasks must never be force-terminalized.

    Its queue is momentarily empty (the enqueue of the next wave has not landed
    yet), but it was touched just now — inside the stall threshold.
    """
    async with session_factory() as session:
        seed = await seed_site_crawl(session, task_count=1)
        await session.execute(
            update(SiteCrawlTask)
            .where(SiteCrawlTask.crawl_id == seed.crawl_id)
            .values(status=TASK_STATUS_SUCCEEDED)
        )
        await session.commit()

    reconciled = await CrawlLifecycle(session_factory).reconcile_stalled()

    assert reconciled == 0
    crawl = await _crawl(session_factory, seed.crawl_id)
    assert crawl.status == CRAWL_STATUS_RUNNING


@pytest.mark.asyncio
async def test_stalled_backstop_ignores_crawls_with_outstanding_work(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """An old crawl with a live queued task is progressing, not stalled."""
    stale = datetime.now(UTC) - timedelta(seconds=3600)
    async with session_factory() as session:
        seed = await seed_site_crawl(session, task_count=1)
        await session.execute(
            update(SiteCrawl)
            .where(SiteCrawl.id == seed.crawl_id)
            .values(status=CRAWL_STATUS_RUNNING, updated_at=stale)
        )
        await session.commit()  # task stays QUEUED

    reconciled = await CrawlLifecycle(session_factory).reconcile_stalled()

    assert reconciled == 0
    crawl = await _crawl(session_factory, seed.crawl_id)
    assert crawl.status == CRAWL_STATUS_RUNNING


@pytest.mark.asyncio
async def test_stalled_backstop_ignores_retired_task_kinds(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """A pre-upgrade link task must not strand an otherwise drained crawl."""
    stale = datetime.now(UTC) - timedelta(seconds=3600)
    async with session_factory() as session:
        seed = await seed_site_crawl(session, task_count=1)
        session.add(
            SiteCrawlTask(
                crawl_id=seed.crawl_id,
                workspace_id=seed.workspace_id,
                task_kind="link_check",
                requested_url="https://example.com/legacy-link",
                url_hash="legacy-link",
                generation=0,
                idempotency_key=f"{seed.crawl_id}:link_check:legacy-link:0",
                status=TASK_STATUS_QUEUED,
            )
        )
        await session.execute(
            update(SiteCrawlTask)
            .where(SiteCrawlTask.id == seed.task_ids[0])
            .values(status=TASK_STATUS_SUCCEEDED, completed_at=stale)
        )
        await session.execute(
            update(SiteCrawl)
            .where(SiteCrawl.id == seed.crawl_id)
            .values(status=CRAWL_STATUS_RUNNING, updated_at=stale)
        )
        await session.commit()

    assert await CrawlLifecycle(session_factory).reconcile_stalled() == 1
    crawl = await _crawl(session_factory, seed.crawl_id)
    assert crawl.status not in CRAWL_ACTIVE_STATUSES


@pytest.mark.asyncio
async def test_stalled_backstop_ignores_paused_phase_control_crawls(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    stale = datetime.now(UTC) - timedelta(seconds=3600)
    async with session_factory() as session:
        seed = await seed_site_crawl(session, task_count=1)
        await session.execute(
            update(SiteCrawlTask)
            .where(SiteCrawlTask.crawl_id == seed.crawl_id)
            .values(status=TASK_STATUS_SUCCEEDED, completed_at=stale)
        )
        await session.execute(
            update(SiteCrawl)
            .where(SiteCrawl.id == seed.crawl_id)
            .values(status=CRAWL_STATUS_PAUSED, updated_at=stale)
        )
        await session.commit()

    assert await CrawlLifecycle(session_factory).reconcile_stalled() == 0
    assert (await _crawl(session_factory, seed.crawl_id)).status == CRAWL_STATUS_PAUSED


@pytest.mark.asyncio
async def test_standard_crawl_completes_when_advanced_controls_are_available(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """The environment capability must never opt a standard crawl into pausing."""
    async with session_factory() as session:
        seed = await seed_site_crawl(session, task_count=1)
        crawl = await session.get(SiteCrawl, seed.crawl_id)
        task = await session.get(SiteCrawlTask, seed.task_ids[0])
        assert crawl is not None
        assert task is not None
        crawl.configuration = {"advanced_controls_enabled": True}
        crawl.discovery_status = DISCOVERY_STATUS_RUNNING
        crawl.discovered_url_count = 1
        task.status = TASK_STATUS_SUCCEEDED
        task.completed_at = datetime.now(UTC)
        await session.commit()

    await CrawlLifecycle(session_factory).reconcile(seed.crawl_id)

    async with session_factory() as session:
        crawl = await session.get(SiteCrawl, seed.crawl_id)
        assert crawl is not None
        assert crawl.status == CRAWL_STATUS_COMPLETED
        assert crawl.completed_at is not None
        assert (
            await session.scalar(
                select(SiteHealthSnapshot.id).where(
                    SiteHealthSnapshot.crawl_id == seed.crawl_id
                )
            )
            is not None
        )
        assert (
            await session.scalar(
                select(SiteCrawlEvent.id).where(
                    SiteCrawlEvent.crawl_id == seed.crawl_id,
                    SiteCrawlEvent.event_type == EVENT_CRAWL_COMPLETED,
                )
            )
            is not None
        )
        # With no usable analysis evidence, no graph is invented. The crawl
        # provenance still refreshes Opportunities so stale signals are cleared.
        refresh = await session.scalar(
            select(AnalyticsTask).where(
                AnalyticsTask.project_id == seed.project_id,
                AnalyticsTask.task_kind == ANALYTICS_TASK_KIND_OPPORTUNITY_REFRESH,
            )
        )
        assert refresh is not None
        assert refresh.payload == {
            "trigger_kind": "site_crawl",
            "trigger_id": str(seed.crawl_id),
        }


@pytest.mark.asyncio
async def test_finalize_of_a_still_queued_task_takes_no_crawl_lock(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """A row that ends its execution non-terminal moved no boundary.

    It IS the outstanding work keeping the crawl from draining, so reconciling
    can only recompute aggregates — while holding the crawl row ``FOR UPDATE``
    and the profile row with it. A task re-queuing on a short delay took those
    locks several times a second, which is what left the user's Stop button
    losing the same lock on every retry and returning a 500.
    """
    async with session_factory() as session:
        seed = await seed_site_crawl(session, task_count=1)
        task = await session.scalar(
            select(SiteCrawlTask).where(SiteCrawlTask.crawl_id == seed.crawl_id)
        )
        assert task is not None
        assert task.status == TASK_STATUS_QUEUED
        session.expunge(task)

    lifecycle = CrawlLifecycle(session_factory)
    reconciled: list[uuid.UUID] = []

    async def _record(crawl_id: uuid.UUID) -> None:
        reconciled.append(crawl_id)

    lifecycle.reconcile = _record  # type: ignore[method-assign]
    await lifecycle.reconcile_after_task(task)

    assert reconciled == []


@pytest.mark.asyncio
async def test_overdue_crawl_wedged_on_a_live_task_is_terminalized(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """The stall a user actually reports: running forever, N of M pages.

    ``reconcile_stalled`` cannot see this one — the queue is NOT drained, which
    is precisely the problem. The wall-clock watchdog answers it anyway.
    """
    old = datetime.now(UTC) - timedelta(seconds=7200)
    async with session_factory() as session:
        seed = await seed_site_crawl(session, task_count=1)
        await session.execute(
            update(SiteCrawl)
            .where(SiteCrawl.id == seed.crawl_id)
            .values(status=CRAWL_STATUS_RUNNING, started_at=old, created_at=old)
        )
        await session.commit()  # task stays QUEUED: the crawl never drains

    await _worker(session_factory).run_once()

    crawl = await _crawl(session_factory, seed.crawl_id)
    assert crawl.status not in CRAWL_ACTIVE_STATUSES
    assert crawl.completed_at is not None
    async with session_factory() as session:
        task = await session.scalar(
            select(SiteCrawlTask).where(SiteCrawlTask.crawl_id == seed.crawl_id)
        )
        assert task is not None
        assert task.status == TASK_STATUS_FAILED
        assert task.error_code == ERROR_CRAWL_OVERDUE


@pytest.mark.asyncio
async def test_overdue_watchdog_leaves_a_young_crawl_alone(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """A crawl inside its budget is working, however long its queue is."""
    async with session_factory() as session:
        seed = await seed_site_crawl(session, task_count=1)
        await session.execute(
            update(SiteCrawl)
            .where(SiteCrawl.id == seed.crawl_id)
            .values(status=CRAWL_STATUS_RUNNING, started_at=datetime.now(UTC))
        )
        await session.commit()

    assert await CrawlLifecycle(session_factory).reconcile_overdue() == 0

    crawl = await _crawl(session_factory, seed.crawl_id)
    assert crawl.status == CRAWL_STATUS_RUNNING
    async with session_factory() as session:
        task_status = await session.scalar(
            select(SiteCrawlTask.status).where(SiteCrawlTask.crawl_id == seed.crawl_id)
        )
        assert task_status == TASK_STATUS_QUEUED


@pytest.mark.asyncio
async def test_overdue_watchdog_spares_a_crawl_paused_after_the_scan(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """The scan is unlocked, so the row is re-checked before anything is failed.

    A pause landing between the two keeps the queue: a paused crawl is meant
    to resume with its pending work intact.
    """
    old = datetime.now(UTC) - timedelta(seconds=7200)
    async with session_factory() as session:
        seed = await seed_site_crawl(session, task_count=1)
        await session.execute(
            update(SiteCrawl)
            .where(SiteCrawl.id == seed.crawl_id)
            .values(status=CRAWL_STATUS_RUNNING, started_at=old, created_at=old)
        )
        await session.commit()

    lifecycle = CrawlLifecycle(session_factory)
    abandon = lifecycle._abandon_outstanding_tasks

    async def _pause_then_abandon(crawl_id: uuid.UUID, **kwargs: object) -> int | None:
        async with session_factory() as session:
            await session.execute(
                update(SiteCrawl)
                .where(SiteCrawl.id == crawl_id)
                .values(status=CRAWL_STATUS_PAUSED)
            )
            await session.commit()
        return await abandon(crawl_id, **kwargs)  # type: ignore[arg-type]

    lifecycle._abandon_outstanding_tasks = _pause_then_abandon  # type: ignore[method-assign]
    assert await lifecycle.reconcile_overdue() == 0

    crawl = await _crawl(session_factory, seed.crawl_id)
    assert crawl.status == CRAWL_STATUS_PAUSED
    async with session_factory() as session:
        task_status = await session.scalar(
            select(SiteCrawlTask.status).where(SiteCrawlTask.crawl_id == seed.crawl_id)
        )
        assert task_status == TASK_STATUS_QUEUED


@pytest.mark.asyncio
async def test_overdue_watchdog_can_be_disabled(
    session_factory: async_sessionmaker[AsyncSession],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A zero budget turns the watchdog off."""
    old = datetime.now(UTC) - timedelta(seconds=7200)
    async with session_factory() as session:
        seed = await seed_site_crawl(session, task_count=1)
        await session.execute(
            update(SiteCrawl)
            .where(SiteCrawl.id == seed.crawl_id)
            .values(status=CRAWL_STATUS_RUNNING, started_at=old, created_at=old)
        )
        await session.commit()

    monkeypatch.setattr(
        site_health_settings, "overdue_crawl_seconds", 0.0, raising=False
    )
    assert await CrawlLifecycle(session_factory).reconcile_overdue() == 0

    crawl = await _crawl(session_factory, seed.crawl_id)
    assert crawl.status == CRAWL_STATUS_RUNNING


@pytest.mark.asyncio
async def test_stalled_backstop_can_be_disabled(
    session_factory: async_sessionmaker[AsyncSession],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A zero threshold turns the backstop off without touching the sweep path."""
    stale = datetime.now(UTC) - timedelta(seconds=3600)
    async with session_factory() as session:
        seed = await seed_site_crawl(session, task_count=1)
        await session.execute(
            update(SiteCrawlTask)
            .where(SiteCrawlTask.crawl_id == seed.crawl_id)
            .values(status=TASK_STATUS_SUCCEEDED, completed_at=stale)
        )
        await session.execute(
            update(SiteCrawl)
            .where(SiteCrawl.id == seed.crawl_id)
            .values(status=CRAWL_STATUS_RUNNING, updated_at=stale)
        )
        await session.commit()

    monkeypatch.setattr(
        site_health_settings, "stalled_crawl_reconcile_seconds", 0.0, raising=False
    )
    assert await CrawlLifecycle(session_factory).reconcile_stalled() == 0

    crawl = await _crawl(session_factory, seed.crawl_id)
    assert crawl.status == CRAWL_STATUS_RUNNING
