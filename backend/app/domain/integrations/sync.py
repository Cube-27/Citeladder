"""Sync-run enqueue service + sync-run read projections (spec §3/§4/§5).

Owns everything about how an ``IntegrationSyncRun`` enters the queue and how
its history is read back:

- **Window computation** — the default trailing window comes from config
  (``sync_default_window_days`` complete UTC days ending yesterday); an
  explicit caller window is validated (no inverted/half-specified ranges)
  and clamped to ``sync_backfill_max_days``.
- **Deterministic idempotency-key builder** — the same
  ``(connection, kind, window, resync_seq)`` inputs always produce the same
  key, so the unique ``idempotency_key`` column backs the queue's
  no-double-enqueue guarantee (invariant 8).
- **Atomic ``resync_seq`` allocation** — the connection row is locked
  ``SELECT ... FOR UPDATE`` and the next value is ``MAX(resync_seq) + 1``
  over the ``(connection_id, sync_kind, window_start, window_end)`` group;
  a unique-conflict retries with the next value (bounded by
  ``sync_resync_alloc_max_attempts``). Two concurrent re-syncs of one
  completed window can therefore never pick the same value or break
  monotonicity (spec §3).
- **``ActiveWindowConflictError``** — raised when the partial active-window
  unique index rejects a duplicate in-flight run for the same window (the
  API maps it to 409); a COMPLETED window stays re-syncable because the
  index only covers active statuses.
- **Read projections** — status/window/row-count/error-field reads over the
  queue row, projection only (invariant 7); no credential is ever selected
  (the run row carries none by construction, invariant 6).

Callers (the sync API today; the dispatcher I10 and ``traffic/sync`` A11
next) use :func:`enqueue_sync_run` — it authorizes the connection by
workspace, allocates, inserts, and commits in one call.
"""

from __future__ import annotations

import logging
import re
import uuid
from collections.abc import Sequence
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config.integrations_contracts import (
    BACKFILL_STATE_COMPLETE,
    BACKFILL_STATE_IMPORTING,
    BACKFILL_STATE_NOT_STARTED,
    BACKFILL_STATE_PARTIAL,
    INTEGRATION_SYNC_KINDS,
    SYNC_KIND_BACKFILL,
    SYNC_KIND_ON_DEMAND,
)
from app.core.config.integrations_settings import (
    integration_settings,
)
from app.core.config.task_queue import (
    TASK_STATUS_CANCELLED,
    TASK_STATUS_FAILED,
    TASK_STATUS_SUCCEEDED,
)
from app.domain.integrations.errors import IntegrationConnectionNotFoundError
from app.domain.integrations.schemas import (
    IntegrationBackfillProgressResponse,
    IntegrationSyncRunResponse,
)
from app.domain.integrations.service import get_connection
from app.models.integrations import (
    IntegrationConnection,
    IntegrationImportArtifact,
    IntegrationSyncRun,
)

# Schema-object names pinned in ``models/integrations.py`` — the partial
# active-window unique index (409 path), the full re-sync identity unique
# constraint, and the unique idempotency key (both retry-with-next-value).
logger = logging.getLogger("app.integrations")

_ACTIVE_WINDOW_INDEX = "ix_integration_sync_runs_active_window"
_WINDOW_SEQ_CONSTRAINT = "uq_integration_sync_run_window_seq"
_IDEMPOTENCY_KEY_CONSTRAINT = "uq_integration_sync_run_idempotency_key"
_RETRYABLE_CONSTRAINTS = frozenset(
    {_WINDOW_SEQ_CONSTRAINT, _IDEMPOTENCY_KEY_CONSTRAINT}
)
# Postgres reports unique violations as
# ``duplicate key value violates unique constraint "<name>"`` (stable text).
_CONSTRAINT_NAME_RE = re.compile(r'unique constraint "([^"]+)"')


class ActiveWindowConflictError(RuntimeError):
    """An ACTIVE run already occupies the (connection, kind, window) slot."""


class SyncWindowInvalidError(ValueError):
    """The requested window is inverted or only half-specified."""


class SyncRunNotFoundError(LookupError):
    """Raised when a sync run is missing or not on the given connection."""


def _utcnow() -> datetime:
    return datetime.now(UTC)


# A backfill window that will never import anything more. Cancelled counts
# with failed: either way that slice of history is absent, and calling the
# import "complete" would overstate the coverage.
_BACKFILL_FAILED_STATUSES: frozenset[str] = frozenset(
    {TASK_STATUS_FAILED, TASK_STATUS_CANCELLED}
)


def integrity_constraint_name(exc: IntegrityError) -> str:
    """Best-effort constraint/index name behind an ``IntegrityError``.

    asyncpg exposes ``constraint_name`` on the raw driver error — which the
    SQLAlchemy asyncpg dialect wraps in a translated DBAPI error, so the
    attribute lives on the ``orig``/``__cause__`` chain, not on ``exc``
    itself. psycopg-style drivers carry it on ``diag``. As a last resort the
    (stable) Postgres message text is parsed. Shared by the integrations
    services that translate constraint violations into domain errors.
    """
    current: BaseException | None = exc
    for _ in range(4):  # exc -> DBAPI error -> raw driver error; bounded walk
        if current is None:
            break
        name = getattr(current, "constraint_name", None)
        if name:
            return str(name)
        diag = getattr(current, "diag", None)
        if diag is not None and getattr(diag, "constraint_name", None):
            return str(diag.constraint_name)
        current = getattr(current, "orig", None) or current.__cause__
    match = _CONSTRAINT_NAME_RE.search(str(exc))
    return match.group(1) if match else ""


# --- Window computation (config-owned knobs, invariant 1) --------------------


def default_sync_window(*, today: date | None = None) -> tuple[date, date]:
    """The trailing ``sync_default_window_days`` complete UTC days.

    Provider data is date-grained and lags, so the default window ends
    YESTERDAY (the latest complete day) — late revisions of the recent days
    are picked up by the ``sync_late_data_revision_days`` re-sync (spec §4).
    ``today`` is injectable for deterministic tests.
    """
    end = (today or _utcnow().date()) - timedelta(days=1)
    start = end - timedelta(days=integration_settings.sync_default_window_days - 1)
    return start, end


def backfill_sync_windows(*, today: date | None = None) -> list[tuple[date, date]]:
    """The one-time history import, split into rolling-window-sized chunks.

    Covers ``sync_backfill_window_days`` ending yesterday — the same right
    edge as every other window (the latest complete UTC day), so backfilled
    history lines up with the rolling sync instead of forming a second,
    offset timeline.

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
    earliest = end - timedelta(days=integration_settings.sync_backfill_window_days - 1)
    chunk = integration_settings.sync_default_window_days
    windows: list[tuple[date, date]] = []
    chunk_end = end
    while chunk_end >= earliest:
        chunk_start = max(earliest, chunk_end - timedelta(days=chunk - 1))
        windows.append((chunk_start, chunk_end))
        chunk_end = chunk_start - timedelta(days=1)
    return windows


def incremental_sync_window(
    covered_through: date | None, *, today: date | None = None
) -> tuple[date, date]:
    """The next on-demand window for a connection, given what it already covers.

    "Sync now" EXTENDS coverage instead of re-fetching a fixed trailing
    window. The window runs from the day after ``covered_through`` to
    yesterday (the latest complete UTC day), pulled back by
    ``sync_late_data_revision_days`` so the most recent days — which Search
    Console keeps revising for a few days after first publication — are
    re-read at a bumped ``resync_seq`` rather than frozen at their
    first-seen, under-reported values.

    A connection that has imported nothing yet gets the default trailing
    window: there is no coverage to extend, and the caller wants a useful
    amount of recent data rather than a single day. A connection already
    current still re-reads the late-data tail, so the button is never a
    silent no-op. The span is bounded by the same ``sync_backfill_max_days``
    budget every other window obeys, so a long-neglected connection asks for
    a large window, not an unbounded one.
    """
    end = (today or _utcnow().date()) - timedelta(days=1)
    if covered_through is None:
        return default_sync_window(today=today)
    start = (
        covered_through
        + timedelta(days=1)
        - timedelta(days=integration_settings.sync_late_data_revision_days)
    )
    earliest = end - timedelta(days=integration_settings.sync_backfill_max_days - 1)
    # Clamp to the budget, then to the window end — coverage that somehow
    # runs past yesterday must still produce a valid one-day window.
    return min(max(start, earliest), end), end


async def connection_covered_through(
    session: AsyncSession, *, connection_id: uuid.UUID
) -> date | None:
    """The last date covered by an UNBROKEN run of succeeded imports.

    Only succeeded runs count: a queued, active, or failed run imported
    nothing, and treating its window as covered would skip those dates
    forever.

    Coverage stops at the FIRST gap rather than jumping to the newest
    success. A backfill fans out many chunks, and a middle chunk can fail
    while later ones succeed; taking ``MAX(window_end)`` would treat the
    hole as imported and no incremental sync would ever go back for it.
    Walking the windows in order instead makes the next sync resume from the
    gap, and the ``sync_backfill_max_days`` clamp keeps that bounded.
    """
    windows = (
        await session.execute(
            select(IntegrationSyncRun.window_start, IntegrationSyncRun.window_end)
            .where(
                IntegrationSyncRun.connection_id == connection_id,
                IntegrationSyncRun.status == TASK_STATUS_SUCCEEDED,
            )
            .order_by(
                IntegrationSyncRun.window_start.asc(),
                IntegrationSyncRun.window_end.asc(),
            )
        )
    ).all()
    covered: date | None = None
    for window_start, window_end in windows:
        if covered is None:
            covered = window_end
            continue
        # A window starting more than one day after the covered edge leaves
        # a hole; everything past it is unreachable coverage.
        if window_start > covered + timedelta(days=1):
            break
        covered = max(covered, window_end)
    return covered


def clamp_sync_window(window_start: date, window_end: date) -> tuple[date, date]:
    """Validate an explicit window and clamp it to the backfill budget.

    An inverted range is rejected; an over-long range keeps its
    ``window_end`` and its start is pulled forward so the span never exceeds
    ``sync_backfill_max_days`` (spec §7 knob).
    """
    if window_start > window_end:
        raise SyncWindowInvalidError("window_start is after window_end")
    max_span = integration_settings.sync_backfill_max_days
    if (window_end - window_start).days + 1 > max_span:
        window_start = window_end - timedelta(days=max_span - 1)
    return window_start, window_end


def resolve_sync_window(
    window_start: date | None, window_end: date | None
) -> tuple[date, date]:
    """Default window when both bounds are absent; explicit window otherwise.

    A half-specified window (exactly one bound) is invalid — the caller
    never has to guess which side was meant.
    """
    if (window_start is None) != (window_end is None):
        raise SyncWindowInvalidError(
            "window_start and window_end must be provided together"
        )
    if window_start is None or window_end is None:
        return default_sync_window()
    return clamp_sync_window(window_start, window_end)


def build_sync_idempotency_key(
    *,
    connection_id: uuid.UUID,
    sync_kind: str,
    window_start: date,
    window_end: date,
    resync_seq: int,
) -> str:
    """Deterministic idempotency key for one run identity (bounded < 160)."""
    return (
        f"sync:{connection_id}:{sync_kind}:"
        f"{window_start.isoformat()}:{window_end.isoformat()}:{resync_seq}"
    )


# --- Enqueue (atomic resync_seq allocation, spec §3) -------------------------


async def _lock_connection(
    session: AsyncSession, *, workspace_id: uuid.UUID, connection_id: uuid.UUID
) -> uuid.UUID:
    """Workspace-authorize the connection and row-lock it FOR UPDATE.

    The lock serializes same-connection enqueues so the ``MAX(resync_seq)``
    read below is race-free; the workspace filter makes a cross-workspace or
    missing connection a 404, never a lock on someone else's row
    (invariant 5). Returns the connection id.
    """
    locked = await session.execute(
        select(IntegrationConnection.id)
        .where(
            IntegrationConnection.id == connection_id,
            IntegrationConnection.workspace_id == workspace_id,
        )
        .with_for_update()
    )
    connection_id_locked = locked.scalar_one_or_none()
    if connection_id_locked is None:
        raise IntegrationConnectionNotFoundError(str(connection_id))
    return connection_id_locked


async def _next_resync_seq(
    session: AsyncSession,
    *,
    connection_id: uuid.UUID,
    sync_kind: str,
    window_start: date,
    window_end: date,
) -> int:
    """``MAX(resync_seq) + 1`` for the window group (0 for a first run)."""
    result = await session.execute(
        select(func.coalesce(func.max(IntegrationSyncRun.resync_seq), -1)).where(
            IntegrationSyncRun.connection_id == connection_id,
            IntegrationSyncRun.sync_kind == sync_kind,
            IntegrationSyncRun.window_start == window_start,
            IntegrationSyncRun.window_end == window_end,
        )
    )
    return result.scalar_one() + 1


async def enqueue_history_backfill(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    connection_id: uuid.UUID,
    today: date | None = None,
) -> list[IntegrationSyncRun]:
    """Enqueue the one-time history import for a connection, or do nothing.

    Called when a property is first selected: before that the connection has
    no ``account_ref`` and a run would fetch nothing. Returns an empty list
    when this connection already has a backfill run of ANY status — history
    is paid for once per connection, and a re-selected property must not
    re-import a year. A failed chunk is therefore not retried here; the
    queue's own retry owns that, and a deliberate re-import is an explicit
    on-demand sync with a window.

    Never raises for an enqueue conflict: selecting a property must succeed
    even when a chunk cannot start, and the rolling scheduled sync still
    covers the recent window either way.
    """
    existing = await session.scalar(
        select(IntegrationSyncRun.id)
        .where(
            IntegrationSyncRun.connection_id == connection_id,
            IntegrationSyncRun.workspace_id == workspace_id,
            IntegrationSyncRun.sync_kind == SYNC_KIND_BACKFILL,
        )
        .limit(1)
    )
    if existing is not None:
        return []
    runs: list[IntegrationSyncRun] = []
    for window_start, window_end in backfill_sync_windows(today=today):
        try:
            runs.append(
                await enqueue_sync_run(
                    session,
                    workspace_id=workspace_id,
                    connection_id=connection_id,
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
            logger.warning(
                "integrations.backfill_enqueue_incomplete",
                extra={
                    "connection_id": str(connection_id),
                    "queued_chunks": len(runs),
                },
            )
            break
    return runs


async def enqueue_sync_run(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    connection_id: uuid.UUID,
    sync_kind: str = SYNC_KIND_ON_DEMAND,
    window_start: date | None = None,
    window_end: date | None = None,
) -> IntegrationSyncRun:
    """Authorize, allocate, insert, and COMMIT one ``IntegrationSyncRun``.

    The one entry point every enqueue path uses (sync API, dispatcher,
    ``performance/sync`` pass-through). Explicit bounds are validated and
    clamped first. Absent bounds on an ON-DEMAND run resolve to the
    INCREMENTAL window — what this connection has not covered yet, plus the
    late-data tail — so "Sync now" adds to the imported history instead of
    re-fetching the same trailing window every time. Every other kind keeps
    the default trailing window.

    Raises:
        IntegrationConnectionNotFoundError: missing/cross-workspace
            connection (API: 404).
        SyncWindowInvalidError: inverted or half-specified window (API: 422).
        ActiveWindowConflictError: an ACTIVE run already occupies the
            ``(connection, sync_kind, window)`` slot (API: 409).
    """
    if sync_kind not in INTEGRATION_SYNC_KINDS:
        raise ValueError(f"unknown integration sync kind: {sync_kind!r}")
    if window_start is None and window_end is None and sync_kind == SYNC_KIND_ON_DEMAND:
        window_start, window_end = incremental_sync_window(
            await connection_covered_through(session, connection_id=connection_id)
        )
    else:
        window_start, window_end = resolve_sync_window(window_start, window_end)

    last_error: IntegrityError | None = None
    for _attempt in range(integration_settings.sync_resync_alloc_max_attempts):
        locked_connection_id = await _lock_connection(
            session, workspace_id=workspace_id, connection_id=connection_id
        )
        resync_seq = await _next_resync_seq(
            session,
            connection_id=locked_connection_id,
            sync_kind=sync_kind,
            window_start=window_start,
            window_end=window_end,
        )
        run = IntegrationSyncRun(
            connection_id=locked_connection_id,
            workspace_id=workspace_id,
            sync_kind=sync_kind,
            window_start=window_start,
            window_end=window_end,
            resync_seq=resync_seq,
            idempotency_key=build_sync_idempotency_key(
                connection_id=locked_connection_id,
                sync_kind=sync_kind,
                window_start=window_start,
                window_end=window_end,
                resync_seq=resync_seq,
            ),
        )
        session.add(run)
        try:
            await session.commit()
        except IntegrityError as exc:
            # The transaction is dead once a constraint fires — roll back
            # (releasing the row lock) before classifying.
            await session.rollback()
            constraint = integrity_constraint_name(exc)
            if constraint == _ACTIVE_WINDOW_INDEX:
                raise ActiveWindowConflictError(
                    f"an active run already covers "
                    f"{window_start.isoformat()}..{window_end.isoformat()}"
                ) from exc
            if constraint in _RETRYABLE_CONSTRAINTS:
                # A concurrent allocator won this resync_seq; retry with the
                # next value (the re-lock re-reads MAX after its commit).
                last_error = exc
                continue
            raise
        return run
    # Unreachable under the FOR UPDATE serialization — fail loud rather than
    # loop forever if the lock contract ever changes.
    if last_error is not None:
        raise last_error
    raise RuntimeError("resync_seq allocation made no attempt")


# --- Read projections (status, window, row counts — invariant 7) --------------


def _row_count_subquery():
    """Per-run imported-row totals over the immutable import artifacts."""
    return (
        select(
            IntegrationImportArtifact.sync_run_id.label("sync_run_id"),
            func.coalesce(func.sum(IntegrationImportArtifact.row_count), 0).label(
                "row_count"
            ),
        )
        .group_by(IntegrationImportArtifact.sync_run_id)
        .subquery()
    )


def _to_run_response(
    run: IntegrationSyncRun, row_count: int
) -> IntegrationSyncRunResponse:
    return IntegrationSyncRunResponse(
        id=run.id,
        connection_id=run.connection_id,
        sync_kind=run.sync_kind,
        status=run.status,
        window_start=run.window_start,
        window_end=run.window_end,
        row_count=row_count,
        resync_seq=run.resync_seq,
        error_code=run.error_code,
        error_detail=run.error_detail,
        created_at=run.created_at,
        updated_at=run.updated_at,
        completed_at=run.completed_at,
    )


async def list_sync_runs(
    session: AsyncSession, *, workspace_id: uuid.UUID, connection_id: uuid.UUID
) -> list[IntegrationSyncRunResponse]:
    """Sync-run history for one connection, newest first (projection only)."""
    connection = await get_connection(
        session, workspace_id=workspace_id, connection_id=connection_id
    )
    row_counts = _row_count_subquery()
    result = await session.execute(
        select(IntegrationSyncRun, func.coalesce(row_counts.c.row_count, 0))
        .outerjoin(row_counts, row_counts.c.sync_run_id == IntegrationSyncRun.id)
        .where(IntegrationSyncRun.connection_id == connection.id)
        .order_by(IntegrationSyncRun.created_at.desc(), IntegrationSyncRun.id.desc())
    )
    return [_to_run_response(run, int(row_count)) for run, row_count in result.all()]


async def get_sync_run(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    connection_id: uuid.UUID,
    sync_run_id: uuid.UUID,
) -> IntegrationSyncRunResponse:
    """One run's detail projection (404 when not on this connection)."""
    connection = await get_connection(
        session, workspace_id=workspace_id, connection_id=connection_id
    )
    row_counts = _row_count_subquery()
    result = await session.execute(
        select(IntegrationSyncRun, func.coalesce(row_counts.c.row_count, 0))
        .outerjoin(row_counts, row_counts.c.sync_run_id == IntegrationSyncRun.id)
        .where(
            IntegrationSyncRun.connection_id == connection.id,
            IntegrationSyncRun.id == sync_run_id,
        )
    )
    row = result.one_or_none()
    if row is None:
        raise SyncRunNotFoundError(str(sync_run_id))
    run, row_count = row
    return _to_run_response(run, int(row_count))


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
    return _backfill_progress(connection_id=connection.id, rows=rows)


def _backfill_progress(
    *, connection_id: uuid.UUID, rows: Sequence[IntegrationSyncRun]
) -> IntegrationBackfillProgressResponse:
    """The pure rollup, split out so it is testable without a session."""
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
    failed = [row for row in rows if row.status in _BACKFILL_FAILED_STATUSES]
    pending = len(rows) - len(succeeded) - len(failed)
    if pending > 0:
        state = BACKFILL_STATE_IMPORTING
    elif failed:
        state = BACKFILL_STATE_PARTIAL
    else:
        state = BACKFILL_STATE_COMPLETE
    return IntegrationBackfillProgressResponse(
        connection_id=connection_id,
        state=state,
        total_windows=len(rows),
        completed_windows=len(succeeded),
        failed_windows=len(failed),
        pending_windows=pending,
        covered_from=min((row.window_start for row in succeeded), default=None),
        covered_through=max((row.window_end for row in succeeded), default=None),
    )
