"""Sync-run enqueue service + sync-run read projections (spec §3/§4/§5).

Owns everything about how an ``IntegrationSyncRun`` enters the queue and how
its history is read back:

- **Window computation** — the default trailing window comes from config
  (``sync_default_window_days`` complete UTC days ending yesterday); an
  explicit caller window is validated (no inverted/half-specified ranges)
  and clamped to ``sync_backfill_max_days``.
- **Target resolution** — a run imports one selected PROPERTY, so the enqueue
  resolves the connection's ACTIVE mapping and FREEZES mapping/property/
  project onto the run. One authorized connection can serve several projects;
  ``project_id`` names which when there is more than one.
- **Deterministic idempotency-key builder** — the same
  ``(connection, mapping, kind, window, resync_seq)`` inputs always produce
  the same key, so the unique ``idempotency_key`` column backs the queue's
  no-double-enqueue guarantee (invariant 8).
- **Atomic ``resync_seq`` allocation** — the connection row is locked
  ``SELECT ... FOR UPDATE`` and the next value is ``MAX(resync_seq) + 1``
  over the CONNECTION; a unique-conflict retries with the next value (bounded
  by ``sync_resync_alloc_max_attempts``). Allocating per connection rather
  than per window is what makes revisions comparable where two windows
  OVERLAP — see :func:`_next_resync_seq` (spec §3).
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
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config.integrations_contracts import (
    INTEGRATION_SYNC_KINDS,
    MAPPING_STATUS_ACTIVE,
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
    IntegrationSyncRunResponse,
)
from app.domain.integrations.service import get_connection
from app.models.integrations import (
    IntegrationConnection,
    IntegrationImportArtifact,
    IntegrationPropertyMapping,
    IntegrationSyncRun,
)

# Schema-object names pinned in ``models/integrations.py`` — the partial
# active-window unique index (409 path), the per-connection revision identity,
# and the unique idempotency key (the last two retry-with-next-value).
logger = logging.getLogger("app.integrations")

_ACTIVE_WINDOW_INDEX = "ix_integration_sync_runs_active_window"
_CONNECTION_SEQ_CONSTRAINT = "uq_integration_sync_run_connection_seq"
_IDEMPOTENCY_KEY_CONSTRAINT = "uq_integration_sync_run_idempotency_key"
_RETRYABLE_CONSTRAINTS = frozenset(
    {_CONNECTION_SEQ_CONSTRAINT, _IDEMPOTENCY_KEY_CONSTRAINT}
)
# Postgres reports unique violations as
# ``duplicate key value violates unique constraint "<name>"`` (stable text).
_CONSTRAINT_NAME_RE = re.compile(r'unique constraint "([^"]+)"')


class ActiveWindowConflictError(RuntimeError):
    """An ACTIVE run already occupies the (connection, kind, window) slot."""


class SyncWindowInvalidError(ValueError):
    """The requested window is inverted or only half-specified."""


class SyncTargetUnmappedError(RuntimeError):
    """The connection has no ACTIVE property mapping to import for.

    A connection is an authorization; a mapping is the thing to import. Until
    a property is selected there is nothing to fetch, so the enqueue refuses
    rather than queueing a run that can only fail at derivation.
    """


class SyncTargetAmbiguousError(RuntimeError):
    """The connection serves several projects and no target was named.

    One authorized connection can hold an active mapping per project, so
    "sync this connection" is under-specified. The caller names the project.
    """


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


def incremental_sync_window(
    covered_through: date | None, *, today: date | None = None
) -> tuple[date, date]:
    """The next on-demand window for a connection, given what it already covers.

    "Sync now" EXTENDS coverage instead of re-fetching a fixed trailing
    window. The window runs from the day after ``covered_through`` to
    yesterday (the latest complete UTC day), pulled back by
    ``sync_late_data_revision_days`` so the most recent days — which Search
    Console keeps revising for a few days after first publication — are
    re-read at a higher ``resync_seq`` rather than frozen at their
    first-seen, under-reported values. The bump is guaranteed because
    ``_next_resync_seq`` allocates per CONNECTION: a re-read of days already
    imported by some other window still outranks them.

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
    session: AsyncSession,
    *,
    connection_id: uuid.UUID,
    mapping_id: uuid.UUID | None = None,
) -> date | None:
    """The last date covered by an UNBROKEN run of succeeded imports.

    Scoped to ``mapping_id`` when given, because coverage belongs to the
    TARGET, not the authorization: a second project mapped to the same
    connection has imported nothing yet, and inheriting the first project's
    coverage would make its incremental sync skip all of that history.

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
    statement = select(
        IntegrationSyncRun.window_start, IntegrationSyncRun.window_end
    ).where(
        IntegrationSyncRun.connection_id == connection_id,
        IntegrationSyncRun.status == TASK_STATUS_SUCCEEDED,
    )
    if mapping_id is not None:
        statement = statement.where(IntegrationSyncRun.mapping_id == mapping_id)
    windows = (
        await session.execute(
            statement.order_by(
                IntegrationSyncRun.window_start.asc(),
                IntegrationSyncRun.window_end.asc(),
            )
        )
    ).all()
    return contiguous_span([(start, end) for start, end in windows])[1]


def contiguous_span(
    windows: Sequence[tuple[date, date]],
) -> tuple[date | None, date | None]:
    """The unbroken ``[start, end]`` the given windows actually cover.

    Walks them in order and stops at the FIRST gap: everything past a hole is
    unreachable coverage. Taking ``MIN(start)``/``MAX(end)`` instead jumps
    straight over a failed middle chunk and presents the result as continuous,
    which both lets the next sync skip the hole forever and tells the reader
    history reaches a date it does not.

    Pure, and the single owner of that rule — the enqueue path needs the end,
    the progress projection needs both ends, and they must not drift apart.
    """
    if not windows:
        return None, None
    ordered = sorted(windows)
    covered_from, covered_through = ordered[0]
    for window_start, window_end in ordered[1:]:
        if window_start > covered_through + timedelta(days=1):
            break
        covered_through = max(covered_through, window_end)
    return covered_from, covered_through


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
    mapping_id: uuid.UUID,
    sync_kind: str,
    window_start: date,
    window_end: date,
    resync_seq: int,
) -> str:
    """Deterministic idempotency key for one run identity (bounded < 160).

    Carries the mapping because one connection can import for several
    projects: without it, two projects' runs of the same window and kind
    would collide on the unique key.
    """
    return (
        f"sync:{connection_id}:{mapping_id}:{sync_kind}:"
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


async def resolve_sync_target(
    session: AsyncSession,
    *,
    connection_id: uuid.UUID,
    project_id: uuid.UUID | None = None,
    mapping_id: uuid.UUID | None = None,
) -> IntegrationPropertyMapping:
    """The ACTIVE mapping this enqueue should import for.

    ``mapping_id`` names the target exactly — the form a project-level
    fan-out uses, since one connection can hold several mapped properties.
    ``project_id`` narrows to one project. With neither, the connection must
    have exactly one active mapping. Resolving HERE rather than at derivation
    time is what lets the run freeze its target: the enqueue is the moment
    the caller's intent is unambiguous, and everything downstream reads the
    frozen columns.

    Raises:
        SyncTargetUnmappedError: no matching active mapping.
        SyncTargetAmbiguousError: several match and none was named.
    """
    statement = select(IntegrationPropertyMapping).where(
        IntegrationPropertyMapping.connection_id == connection_id,
        IntegrationPropertyMapping.status == MAPPING_STATUS_ACTIVE,
    )
    if mapping_id is not None:
        statement = statement.where(IntegrationPropertyMapping.id == mapping_id)
    if project_id is not None:
        statement = statement.where(IntegrationPropertyMapping.project_id == project_id)
    mappings = (await session.execute(statement)).scalars().all()
    if not mappings:
        raise SyncTargetUnmappedError(
            f"connection {connection_id} has no active property mapping"
        )
    if len(mappings) > 1:
        raise SyncTargetAmbiguousError(
            f"connection {connection_id} has {len(mappings)} active mappings; "
            f"name a project_id"
        )
    return mappings[0]


async def _next_resync_seq(
    session: AsyncSession,
    *,
    connection_id: uuid.UUID,
) -> int:
    """``MAX(resync_seq) + 1`` across the CONNECTION (0 for its first run).

    Scoped to the connection alone — deliberately NOT to the window group.
    ``resync_seq`` is the data revision stamped onto every metric row the run
    derives, and those rows collide on ``(project, property, provider,
    dataset, date, dimension_key, resync_seq)``. Two runs whose windows merely
    OVERLAP share the days in the overlap, so a window-scoped allocation hands
    both of them revision 0 and the second import's values are silently
    discarded by ``ON CONFLICT DO NOTHING``.

    That is not hypothetical: the dispatcher enqueues a 28-day trailing window
    and a 3-day late-data window on every tick. They are different
    ``(window_start, window_end)`` pairs, so under a window-scoped allocation
    both were revision 0 and the late-data revision — the entire point of the
    second run — never landed.

    A per-connection monotonic counter makes revisions comparable across
    overlapping windows: later enqueue means strictly higher revision, and
    every reader already resolves a metric identity by taking the row with the
    highest ``resync_seq`` (``traffic.projection``, ``analytics.ingest``'s
    ``metric_row_not_superseded``, ``demand.query_evidence``). Never a sum, so
    distinct revisions of the same day cannot double-count.

    Re-deriving the SAME run stays a no-op: the run owns its allocated
    ``resync_seq``, so a resume writes the identical row identity and the
    conflict clause absorbs it.
    """
    result = await session.execute(
        select(func.coalesce(func.max(IntegrationSyncRun.resync_seq), -1)).where(
            IntegrationSyncRun.connection_id == connection_id,
        )
    )
    return result.scalar_one() + 1


async def enqueue_sync_run(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    connection_id: uuid.UUID,
    project_id: uuid.UUID | None = None,
    mapping_id: uuid.UUID | None = None,
    sync_kind: str = SYNC_KIND_ON_DEMAND,
    window_start: date | None = None,
    window_end: date | None = None,
) -> IntegrationSyncRun:
    """Authorize, allocate, insert, and COMMIT one ``IntegrationSyncRun``.

    The one entry point every enqueue path uses (sync API, dispatcher,
    ``performance/sync`` pass-through). The run's TARGET — mapping, property,
    project — is resolved and frozen here; ``mapping_id`` names it exactly,
    ``project_id`` narrows it to one project, and with neither the connection
    must hold exactly one active mapping. Explicit bounds are validated
    and clamped next. Absent bounds on an ON-DEMAND run resolve to the
    INCREMENTAL window — what this target has not covered yet, plus the
    late-data tail — so "Sync now" adds to the imported history instead of
    re-fetching the same trailing window every time. Every other kind keeps
    the default trailing window.

    Raises:
        IntegrationConnectionNotFoundError: missing/cross-workspace
            connection (API: 404).
        SyncTargetUnmappedError: no property selected yet (API: 409).
        SyncTargetAmbiguousError: several projects, none named (API: 409).
        SyncWindowInvalidError: inverted or half-specified window (API: 422).
        ActiveWindowConflictError: an ACTIVE run already occupies the
            ``(mapping, sync_kind, window)`` slot (API: 409).
    """
    if sync_kind not in INTEGRATION_SYNC_KINDS:
        raise ValueError(f"unknown integration sync kind: {sync_kind!r}")
    target = await resolve_sync_target(
        session,
        connection_id=connection_id,
        project_id=project_id,
        mapping_id=mapping_id,
    )
    if window_start is None and window_end is None and sync_kind == SYNC_KIND_ON_DEMAND:
        window_start, window_end = incremental_sync_window(
            await connection_covered_through(
                session, connection_id=connection_id, mapping_id=target.id
            )
        )
    else:
        window_start, window_end = resolve_sync_window(window_start, window_end)

    last_error: IntegrityError | None = None
    for _attempt in range(integration_settings.sync_resync_alloc_max_attempts):
        locked_connection_id = await _lock_connection(
            session, workspace_id=workspace_id, connection_id=connection_id
        )
        resync_seq = await _next_resync_seq(session, connection_id=locked_connection_id)
        run = IntegrationSyncRun(
            connection_id=locked_connection_id,
            workspace_id=workspace_id,
            mapping_id=target.id,
            property_ref=target.property_ref,
            project_id=target.project_id,
            sync_kind=sync_kind,
            window_start=window_start,
            window_end=window_end,
            resync_seq=resync_seq,
            idempotency_key=build_sync_idempotency_key(
                connection_id=locked_connection_id,
                mapping_id=target.id,
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
