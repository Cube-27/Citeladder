# Shared analytics executor plumbing: the cooperative-cancel boundary and the
# refresh-window payload parse every windowed executor uses.
#
# The referral chain's executors (ingest, classify, snapshot refresh and
# retention) moved to the TypeScript analytics worker in TypeScript migration
# PR 4; the traffic and demand executors that stay in Python share these.
from __future__ import annotations

import uuid
from datetime import date

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config.task_queue import TASK_TERMINAL_STATUSES
from app.models.analytics import AnalyticsTask


class TaskCancelledError(RuntimeError):
    """The claimed queue row turned terminal mid-run; stop cooperatively.

    The worker's ``_finalize`` re-checks owner + status under its lock and
    writes nothing for an already-terminal row (single-writer, invariant 3),
    so raising here never flips a cancelled row to failed.
    """


async def raise_if_task_terminal(
    session_factory: async_sessionmaker[AsyncSession],
    task_id: uuid.UUID | None,
    *,
    boundary: str = "batch",
) -> None:
    """Cooperative-cancel boundary check (invariant 9).

    Single owner of the batch-boundary idiom every analytics/traffic
    executor uses (the sibling executor modules keep a thin label adapter
    under their own module-private name so their patch point + message
    boundary stay local). Mirrors the worker's dispatch-boundary check
    (``_execute``): re-read the queue row in a FRESH session (never the
    work session's possibly-stale identity map) and stop if it reached a
    terminal status. A row that does not resolve (unpersisted
    direct-invocation fixture) has nothing to cancel against and the run
    continues.
    """
    if task_id is None:  # unpersisted fixture row: nothing to cancel against
        return
    async with session_factory() as session:
        row = await session.get(AnalyticsTask, task_id)
        status = row.status if row is not None else None
    if status is not None and status in TASK_TERMINAL_STATUSES:
        raise TaskCancelledError(
            f"analytics task {task_id} reached terminal status {status!r}; "
            f"stopping at the {boundary} boundary"
        )


def payload_window(task: AnalyticsTask, *, kind: str) -> tuple[date, date]:
    """Parse + validate a refresh task's ``window_start``/``window_end``.

    ``kind`` is the task-kind token used in the error messages (the owning
    executor's name); every windowed executor parses the same payload
    shape, so the parse lives here exactly once.
    """
    payload = task.payload or {}
    raw_start = payload.get("window_start")
    raw_end = payload.get("window_end")
    if not raw_start or not raw_end:
        raise ValueError(f"{kind} payload missing window_start/window_end")
    window_start = date.fromisoformat(str(raw_start))
    window_end = date.fromisoformat(str(raw_end))
    if window_end < window_start:
        raise ValueError(f"{kind} window_end before window_start")
    return window_start, window_end
