"""History backfill: how much of the past a target imports, and how far it got.

Split from ``sync.py``, which owns how ONE run enters the queue. This module
owns the other question — which WINDOWS a newly selected property should ask
for, and what the reader is told about their progress. The two are separate
concerns that happen to share an enqueue: the run service knows nothing about
years of history, and this one allocates no revisions.

The direction of the dependency is one-way (this imports ``sync``), so the
enqueue path stays unaware of backfill entirely.
"""

from __future__ import annotations

import logging
import uuid
from collections import defaultdict
from collections.abc import Sequence
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config.integrations_contracts import (
    BACKFILL_STATE_COMPLETE,
    BACKFILL_STATE_IMPORTING,
    BACKFILL_STATE_NOT_STARTED,
    BACKFILL_STATE_PARTIAL,
    SYNC_KIND_BACKFILL,
)
from app.core.config.integrations_settings import integration_settings
from app.core.config.task_queue import (
    TASK_STATUS_CANCELLED,
    TASK_STATUS_FAILED,
    TASK_STATUS_SUCCEEDED,
)
from app.domain.integrations.errors import IntegrationConnectionNotFoundError
from app.domain.integrations.schemas import IntegrationBackfillProgressResponse
from app.domain.integrations.service import get_connection
from app.domain.integrations.sync import (
    ActiveWindowConflictError,
    SyncTargetAmbiguousError,
    SyncTargetUnmappedError,
    contiguous_span,
    enqueue_sync_run,
    resolve_sync_target,
)
from app.models.integrations import IntegrationSyncRun

logger = logging.getLogger("app.integrations")

# A backfill window that will never import anything more. Cancelled counts
# with failed: either way that slice of history is absent, and calling the
# import "complete" would overstate the coverage.
_BACKFILL_FAILED_STATUSES: frozenset[str] = frozenset(
    {TASK_STATUS_FAILED, TASK_STATUS_CANCELLED}
)


def _utcnow() -> datetime:
    return datetime.now(UTC)


def backfill_sync_windows(
    *, window_days: int | None = None, today: date | None = None
) -> list[tuple[date, date]]:
    """The one-time history import, split into rolling-window-sized chunks.

    Covers ``window_days`` ending yesterday — the same right edge as every
    other window (the latest complete UTC day), so backfilled history lines
    up with the rolling sync instead of forming a second, offset timeline.
    ``window_days`` is the caller's resolved history allowance (how much
    history this workspace's plan entitles it to); omitting it falls back to
    the ``sync_backfill_window_days`` ceiling.

    CHUNKED rather than one long run, because a sync window is also a
    projection window: the post-sync hook enqueues one snapshot refresh per
    imported window, and that refresh materializes every metric row in the
    window in memory. A single 365-day run would therefore load a year of
    rows at once. Chunking keeps each import and each refresh the same size
    as a normal daily sync, and the queue's lease/retry machinery handles the
    chunks independently — a failure re-runs one chunk, not the year.

    Returned newest-first so the most useful history is imported first if the
    worker is interrupted partway through.
    """
    end = (today or _utcnow().date()) - timedelta(days=1)
    span = min(
        window_days or integration_settings.sync_backfill_window_days,
        integration_settings.sync_backfill_max_days,
    )
    return chunk_windows(end - timedelta(days=max(1, span) - 1), end)


def chunk_windows(earliest: date, end: date) -> list[tuple[date, date]]:
    """Split ``[earliest, end]`` into rolling-window-sized chunks, newest first."""
    chunk = integration_settings.sync_default_window_days
    windows: list[tuple[date, date]] = []
    chunk_end = end
    while chunk_end >= earliest:
        chunk_start = max(earliest, chunk_end - timedelta(days=chunk - 1))
        windows.append((chunk_start, chunk_end))
        chunk_end = chunk_start - timedelta(days=1)
    return windows


async def enqueue_history_backfill(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    connection_id: uuid.UUID,
    project_id: uuid.UUID | None = None,
    window_days: int | None = None,
    today: date | None = None,
) -> list[IntegrationSyncRun]:
    """Enqueue the one-time history import for a sync TARGET, or do nothing.

    Called when a property is selected: before that there is nothing to
    fetch. Scoped to the target's mapping, not to the connection — a second
    project mapped to the same authorized connection is a different property
    and has imported no history of its own, so it gets its own backfill.

    History is paid for once per (project, property). A property this project
    has never imported gets the full span its plan allows; one it already
    imported is RESUMED, not re-imported — the span comes from the runs
    already on record, so the set of chunks is stable no matter when this is
    called again, and only windows that are missing or ended FAILED/CANCELLED
    are enqueued. Switching a project to a DIFFERENT property does import
    that property's history: it is different data, and withholding it would
    leave a corrected selection looking empty.

    That resume is the fix for a real gap — the previous rule skipped when a
    backfill run of ANY status existed, so a single dead chunk left a hole in
    that target's history that nothing would ever go back for.

    Never raises for an enqueue conflict: selecting a property must succeed
    even when a chunk cannot start, and the rolling scheduled sync still
    covers the recent window either way.
    """
    try:
        target = await resolve_sync_target(
            session, connection_id=connection_id, project_id=project_id
        )
    except (SyncTargetUnmappedError, SyncTargetAmbiguousError):
        return []
    existing = (
        await session.execute(
            select(
                IntegrationSyncRun.window_start,
                IntegrationSyncRun.window_end,
                IntegrationSyncRun.status,
            ).where(
                # Keyed on the DATA identity (project + property), not on the
                # mapping row. Re-selecting a property the project already
                # imported must not buy its history twice, but selecting a
                # DIFFERENT property is different data and does need its own
                # history — otherwise a corrected selection shows nothing.
                IntegrationSyncRun.project_id == target.project_id,
                IntegrationSyncRun.property_ref == target.property_ref,
                IntegrationSyncRun.workspace_id == workspace_id,
                IntegrationSyncRun.sync_kind == SYNC_KIND_BACKFILL,
            )
        )
    ).all()
    if existing:
        # This target already asked for its history, so calling this again is a
        # RESUME, never a re-import — that is the once-per-target rule, and it
        # must hold no matter how much the calendar has moved.
        #
        # The candidates are the windows actually ON RECORD, not a fresh
        # chunking of their span: ``sync_default_window_days`` can differ from
        # whatever it was when the backfill first fanned out, and re-chunking
        # would then produce boundaries that match no recorded run — every one
        # of them "missing", every one re-enqueued, overlapping the history
        # already imported.
        alive = {
            (row.window_start, row.window_end)
            for row in existing
            if row.status not in _BACKFILL_FAILED_STATUSES
        }
        # A window with both a dead run and a live one is covered; only the
        # ones that ended failed with nothing else standing get another go.
        wanted = sorted(
            {
                (row.window_start, row.window_end)
                for row in existing
                if row.status in _BACKFILL_FAILED_STATUSES
            }
            - alive,
            reverse=True,
        )
    else:
        wanted = backfill_sync_windows(window_days=window_days, today=today)
    runs: list[IntegrationSyncRun] = []
    for window_start, window_end in wanted:
        try:
            runs.append(
                await enqueue_sync_run(
                    session,
                    workspace_id=workspace_id,
                    connection_id=connection_id,
                    # The MAPPING, not merely its project: the chunks are
                    # enqueued one at a time and each enqueue re-resolves,
                    # so a re-selection partway through would hand the
                    # remaining chunks to the replacement property.
                    mapping_id=target.id,
                    sync_kind=SYNC_KIND_BACKFILL,
                    window_start=window_start,
                    window_end=window_end,
                )
            )
        except ActiveWindowConflictError:
            # A concurrent caller raced past the guard above and queued this
            # window first. The unique indexes are the real arbiter; this
            # chunk is already covered.
            continue
        except (IntegrationConnectionNotFoundError, SQLAlchemyError):
            # The connection vanished mid-enqueue, or the database refused a
            # chunk. Callers reach here AFTER committing the work that
            # triggered the backfill, so failing now would report an error
            # for something that already succeeded. Chunks already queued
            # stay valid; the rest are simply not scheduled.
            #
            # ``enqueue_sync_run`` rolls back only the constraint violations
            # it classifies, so any OTHER database fault leaves this session's
            # transaction in a failed state — and the caller goes on using it.
            # Roll back before returning so what follows is not refused for a
            # fault it never saw.
            await session.rollback()
            logger.warning(
                "integrations.backfill_enqueue_incomplete",
                extra={
                    "connection_id": str(connection_id),
                    "queued_chunks": len(runs),
                },
            )
            break
    return runs


async def get_backfill_progress(
    session: AsyncSession, *, workspace_id: uuid.UUID, connection_id: uuid.UUID
) -> IntegrationBackfillProgressResponse:
    """Roll the connection's backfill runs up into one progress projection.

    A pure projection over ``IntegrationSyncRun`` (invariant 7) — no new
    table, no recomputation, no provider call. The history import is chunked
    into rolling-window-sized runs (``backfill_sync_windows``), so counting
    those rows by status is exactly "how far along is this import".

    Coverage is bounded by the SUCCEEDED windows alone: a queued or failed
    chunk has imported nothing, and letting it widen the covered range would
    claim evidence that is not there.
    """
    connection = await get_connection(
        session, workspace_id=workspace_id, connection_id=connection_id
    )
    rows = list(
        (
            await session.scalars(
                select(IntegrationSyncRun)
                .where(IntegrationSyncRun.connection_id == connection.id)
                .where(IntegrationSyncRun.sync_kind == SYNC_KIND_BACKFILL)
            )
        ).all()
    )
    return backfill_progress_rollup(connection_id=connection.id, rows=rows)


def backfill_progress_rollup(
    *, connection_id: uuid.UUID, rows: Sequence[IntegrationSyncRun]
) -> IntegrationBackfillProgressResponse:
    """The pure rollup, split out so it is testable without a session.

    Public because the readiness ladder rolls the SAME statuses up across a
    project's connections (invariant 2 — one owner of the rule, reused rather
    than restated).

    Counted per ``(target, window)``, not per row. A failed chunk is retried
    by a NEW run (the retained failure is history, invariant 3), so counting
    rows reported a resumed backfill as both failed and complete: the import
    stayed ``partial`` after every hole had been filled, and ``total_windows``
    grew with each attempt. A window is complete when one of its own attempts
    imported it, and failed only when every attempt for it ended failed or
    cancelled.

    The mapping is part of the key because these rows are a CONNECTION's, and
    one connection can import for several properties over the very same
    windows. Keyed on the window alone, one property's successful chunk
    covered another property's failure of the same dates, and the rollup
    reported history that target does not have.
    """
    if not rows:
        return IntegrationBackfillProgressResponse(
            connection_id=connection_id,
            state=BACKFILL_STATE_NOT_STARTED,
            total_windows=0,
            completed_windows=0,
            failed_windows=0,
            pending_windows=0,
            covered_from=None,
            covered_through=None,
        )
    succeeded = [row for row in rows if row.status == TASK_STATUS_SUCCEEDED]
    attempts: dict[tuple[uuid.UUID, date, date], set[str]] = defaultdict(set)
    for row in rows:
        attempts[(row.mapping_id, row.window_start, row.window_end)].add(row.status)
    completed = sum(
        1 for statuses in attempts.values() if TASK_STATUS_SUCCEEDED in statuses
    )
    failed = sum(
        1
        for statuses in attempts.values()
        if TASK_STATUS_SUCCEEDED not in statuses
        and statuses <= _BACKFILL_FAILED_STATUSES
    )
    pending = len(attempts) - completed - failed
    if pending > 0:
        state = BACKFILL_STATE_IMPORTING
    elif failed:
        state = BACKFILL_STATE_PARTIAL
    else:
        state = BACKFILL_STATE_COMPLETE
    return IntegrationBackfillProgressResponse(
        connection_id=connection_id,
        state=state,
        total_windows=len(attempts),
        completed_windows=completed,
        failed_windows=failed,
        pending_windows=pending,
        **_covered_span(succeeded),
    )


def _covered_span(succeeded: Sequence[IntegrationSyncRun]) -> dict[str, date | None]:
    """The CONTIGUOUS span of imported history, stopping at the first gap.

    Taking ``MAX(window_end)`` over succeeded chunks jumps straight over a
    failed middle one and presents the result as a continuous range, so the
    user was told history reached a date it does not cover — and ``readiness``
    takes the minimum of these values across connections, so the
    overstatement propagated. The walk itself lives in ``sync`` so the enqueue
    path and this projection cannot drift apart.

    ``state`` still reports ``partial`` when a chunk failed, so the hole is
    visible as well as excluded.
    """
    covered_from, covered_through = contiguous_span(
        [(row.window_start, row.window_end) for row in succeeded]
    )
    return {"covered_from": covered_from, "covered_through": covered_through}
