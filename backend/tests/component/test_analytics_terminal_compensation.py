"""Work a task still owes after it fails, on both paths that can fail it.

The paths are not symmetric, which is the whole reason this lives on the
queue. A task that exhausts its retries returns through the worker's
``_finalize``; a worker killed mid-run is terminalized by the lease sweeper,
which runs no executor code whatsoever. An executor that compensates itself
covers the first and silently misses the second -- and the second is the
ordinary outcome of a container stop.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config.analytics import ANALYTICS_TASK_KIND_SOURCE_PAGE_INSPECTION
from app.core.config.task_queue import (
    TASK_STATUS_FAILED,
    TASK_STATUS_LEASED,
    TASK_STATUS_RETRY_WAIT,
)
from app.models.analytics import AnalyticsTask
from app.workers.analytics_worker import AnalyticsWorker
from app.workers.terminal_compensation import compensate_analytics_tasks
from tests.component.opportunity_helpers import _seed_scenario

pytestmark = pytest.mark.asyncio

_KIND = ANALYTICS_TASK_KIND_SOURCE_PAGE_INSPECTION


async def _enqueue(
    session_factory: async_sessionmaker[AsyncSession],
    *,
    max_attempts: int = 1,
    attempt_count: int = 0,
    leased_until: datetime | None = None,
) -> uuid.UUID:
    async with session_factory() as session:
        scenario = await _seed_scenario(session)
        row = AnalyticsTask(
            workspace_id=scenario.workspace_id,
            project_id=scenario.project_id,
            task_kind=_KIND,
            payload={"audit_id": str(uuid.uuid4())},
            idempotency_key=f"compensation:{uuid.uuid4()}",
            attempt_count=attempt_count,
            max_attempts=max_attempts,
        )
        if leased_until is not None:
            row.status = TASK_STATUS_LEASED
            row.lease_owner = "dead-worker"
            row.lease_expires_at = leased_until
        session.add(row)
        await session.commit()
        return row.id


def _worker(
    session_factory: async_sessionmaker[AsyncSession],
    *,
    fired: list[uuid.UUID],
    fail: bool = True,
) -> AnalyticsWorker:
    async def executor(_factory, _task) -> None:
        if fail:
            raise RuntimeError("inspection died")

    async def compensator(_factory, task: AnalyticsTask) -> None:
        fired.append(task.id)

    return AnalyticsWorker(
        session_factory=session_factory,
        owner="compensation-test",
        executors={_KIND: executor},
        compensators={_KIND: compensator},
    )


async def _status(
    session_factory: async_sessionmaker[AsyncSession], task_id: uuid.UUID
) -> str:
    async with session_factory() as session:
        row = await session.get(AnalyticsTask, task_id)
        assert row is not None
        return row.status


async def test_a_task_that_exhausts_its_retries_runs_its_compensation(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    task_id = await _enqueue(session_factory, max_attempts=1)
    fired: list[uuid.UUID] = []

    assert await _worker(session_factory, fired=fired).run_once() == 1

    assert await _status(session_factory, task_id) == TASK_STATUS_FAILED
    assert fired == [task_id]


async def test_a_retryable_failure_compensates_nothing_yet(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """Compensating on attempt one spends the hand-off before its retries."""
    task_id = await _enqueue(session_factory, max_attempts=3)
    fired: list[uuid.UUID] = []

    assert await _worker(session_factory, fired=fired).run_once() == 1

    assert await _status(session_factory, task_id) == TASK_STATUS_RETRY_WAIT
    assert fired == []


async def test_a_successful_task_compensates_nothing(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    await _enqueue(session_factory, max_attempts=1)
    fired: list[uuid.UUID] = []

    assert await _worker(session_factory, fired=fired, fail=False).run_once() == 1

    assert fired == []


async def test_the_lease_sweeper_runs_the_compensation_no_executor_reached(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """A worker killed mid-run never returns, so nothing else observes it.

    The sweeper is the only thing that terminalizes this row, and until now
    the analytics queue discarded exactly the ids it reports.
    """
    task_id = await _enqueue(
        session_factory,
        max_attempts=1,
        leased_until=datetime.now(UTC) - timedelta(hours=1),
    )
    fired: list[uuid.UUID] = []

    await _worker(session_factory, fired=fired).run_once()

    assert await _status(session_factory, task_id) == TASK_STATUS_FAILED
    assert fired == [task_id]


async def test_a_failing_compensator_never_undoes_terminal_accounting(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    task_id = await _enqueue(session_factory, max_attempts=1)

    async def executor(_factory, _task) -> None:
        raise RuntimeError("inspection died")

    async def compensator(_factory, _task) -> None:
        raise RuntimeError("the hand-off also failed")

    worker = AnalyticsWorker(
        session_factory=session_factory,
        owner="compensation-test",
        executors={_KIND: executor},
        compensators={_KIND: compensator},
    )

    assert await worker.run_once() == 1
    assert await _status(session_factory, task_id) == TASK_STATUS_FAILED


async def test_a_kind_with_no_compensator_is_left_alone(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    task_id = await _enqueue(session_factory, max_attempts=1)

    async def executor(_factory, _task) -> None:
        raise RuntimeError("inspection died")

    worker = AnalyticsWorker(
        session_factory=session_factory,
        owner="compensation-test",
        executors={_KIND: executor},
        compensators={},
    )

    assert await worker.run_once() == 1
    assert await _status(session_factory, task_id) == TASK_STATUS_FAILED


async def test_the_default_table_compensates_source_page_inspection() -> None:
    """The production wiring, not just the test seam."""
    from app.workers.source_pages.inspector import compensate_inspection_handoff
    from app.workers.terminal_compensation import analytics_compensators

    assert analytics_compensators()[_KIND] is compensate_inspection_handoff


async def test_the_standalone_sweeper_runs_the_same_compensation(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """The process most likely to terminalize a task this way must fire it.

    ``QueueSweeper`` sweeps every queue from outside the workers precisely so
    a queue whose worker died still gets reclaimed -- which is the scenario
    compensation exists for. A hook registered only on the worker would rarely
    run when it mattered.
    """
    from app.core.config.analytics import ANALYTICS_QUEUE_SPEC
    from app.workers.queue_sweeper import TERMINAL_TASK_HOOKS, QueueSweeper

    task_id = await _enqueue(
        session_factory,
        max_attempts=1,
        leased_until=datetime.now(UTC) - timedelta(hours=1),
    )
    fired: list[uuid.UUID] = []

    async def compensator(_factory, task: AnalyticsTask) -> None:
        fired.append(task.id)

    async def hook(factory, task_ids: list[uuid.UUID]) -> None:
        await compensate_analytics_tasks(
            factory, task_ids, compensators={_KIND: compensator}
        )

    sweeper = QueueSweeper(
        session_factory=session_factory, specs=(ANALYTICS_QUEUE_SPEC,)
    )
    original = TERMINAL_TASK_HOOKS[ANALYTICS_QUEUE_SPEC.model.__tablename__]
    TERMINAL_TASK_HOOKS[ANALYTICS_QUEUE_SPEC.model.__tablename__] = hook
    try:
        await sweeper.run_once()
    finally:
        TERMINAL_TASK_HOOKS[ANALYTICS_QUEUE_SPEC.model.__tablename__] = original

    assert await _status(session_factory, task_id) == TASK_STATUS_FAILED
    assert fired == [task_id]
