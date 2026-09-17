"""Work a terminalized task still owes, wherever it was terminalized.

A task can reach a terminal status two ways, and only one of them runs any of
the task's own code. Exhausting the retry budget comes back through a worker's
``_finalize``. A worker killed mid-run does not come back at all: its lease
expires and a sweeper terminalizes the row, running no executor.

There are two sweepers, which is the reason this registry lives here rather
than inside ``AnalyticsWorker``. Each worker sweeps its own queue at the top of
its loop, and ``QueueSweeper`` sweeps every queue from a separate process
precisely so a queue whose worker died still gets reclaimed. That second one is
the likely winner in exactly the scenario compensation exists for, so a hook
registered only on the worker would rarely fire when it matters.

A compensator runs AFTER the terminal write has committed. It is best-effort
and idempotent: its failure is logged, never raised, because terminal
accounting must not depend on it.
"""

from __future__ import annotations

import logging
import uuid
from collections.abc import Awaitable, Callable

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config.analytics import (
    ANALYTICS_QUEUE_SPEC,
    ANALYTICS_TASK_KIND_SOURCE_PAGE_INSPECTION,
)
from app.models.analytics import AnalyticsTask

logger = logging.getLogger("app.workers.terminal_compensation")

# One queue's whole terminal set, by task id. Keyed by table name, which is the
# identity the sweeper already carries.
type TerminalTaskHook = Callable[
    [async_sessionmaker[AsyncSession], list[uuid.UUID]], Awaitable[None]
]
type AnalyticsCompensator = Callable[
    [async_sessionmaker[AsyncSession], AnalyticsTask], Awaitable[None]
]


def analytics_compensators() -> dict[str, AnalyticsCompensator]:
    """The per-kind table, built on demand.

    Imported lazily because the source-page inspector pulls in the fetch stack,
    and ``QueueSweeper`` -- which runs no executors and sweeps six queues --
    should not pay for it just to have this registry available.
    """
    from app.workers.source_pages.inspector import compensate_inspection_handoff

    return {
        # Audit terminalization enqueues inspection INSTEAD of the Opportunity
        # refresh, so an inspection that never finishes still owes that
        # refresh. Recomputing without page evidence is what the product did
        # before this feature; not recomputing at all leaves a committed audit
        # with permanently stale opportunities.
        ANALYTICS_TASK_KIND_SOURCE_PAGE_INSPECTION: compensate_inspection_handoff,
    }


async def compensate_analytics_task(
    session_factory: async_sessionmaker[AsyncSession],
    task: AnalyticsTask,
    *,
    compensators: dict[str, AnalyticsCompensator] | None = None,
) -> None:
    """Run one terminal task's compensation. Never raises."""
    table = compensators if compensators is not None else analytics_compensators()
    compensator = table.get(task.task_kind)
    if compensator is None:
        return
    try:
        await compensator(session_factory, task)
    except Exception:
        logger.exception(
            "terminal compensation failed",
            extra={"task_id": str(task.id), "task_kind": task.task_kind},
        )


async def compensate_analytics_tasks(
    session_factory: async_sessionmaker[AsyncSession],
    task_ids: list[uuid.UUID],
    *,
    compensators: dict[str, AnalyticsCompensator] | None = None,
) -> None:
    """Compensate a swept batch, loading only the rows that have a hook.

    One query rather than one per id: a sweep reclaims up to its batch size,
    and the common case is a batch of kinds that owe nothing at all.
    """
    table = compensators if compensators is not None else analytics_compensators()
    if not task_ids or not table:
        return
    async with session_factory() as session:
        rows = list(
            (
                await session.scalars(
                    select(AnalyticsTask).where(
                        AnalyticsTask.id.in_(task_ids),
                        AnalyticsTask.task_kind.in_(sorted(table)),
                    )
                )
            ).all()
        )
        for row in rows:
            session.expunge(row)
    for row in rows:
        await compensate_analytics_task(session_factory, row, compensators=table)


TERMINAL_TASK_HOOKS: dict[str, TerminalTaskHook] = {
    ANALYTICS_QUEUE_SPEC.model.__tablename__: compensate_analytics_tasks,
}
