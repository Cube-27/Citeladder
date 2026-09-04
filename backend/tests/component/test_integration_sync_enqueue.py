"""Component tests for the sync-run enqueue service (I5).

Covers window computation (config default trailing window; explicit window
clamped to ``sync_backfill_max_days``; inverted/half windows rejected), the
deterministic idempotency key, and the atomic ``resync_seq`` allocation:
duplicate ACTIVE window rejected (partial-index IntegrityError →
``ActiveWindowConflictError``), completed window re-syncs with a bumped seq,
and concurrent allocators never pick the same value or break monotonicity.
"""

from __future__ import annotations

import asyncio
import uuid
from datetime import UTC, date, datetime, timedelta
from itertools import pairwise

import pytest
from sqlalchemy import select

from app.core.config.integrations_contracts import (
    SYNC_KIND_BACKFILL,
    SYNC_KIND_ON_DEMAND,
)
from app.core.config.integrations_settings import (
    integration_settings,
)
from app.core.config.task_queue import (
    TASK_STATUS_FAILED,
    TASK_STATUS_QUEUED,
    TASK_STATUS_SUCCEEDED,
)
from app.domain.integrations.errors import IntegrationConnectionNotFoundError
from app.domain.integrations.sync import (
    ActiveWindowConflictError,
    SyncWindowInvalidError,
    backfill_sync_windows,
    build_sync_idempotency_key,
    clamp_sync_window,
    connection_covered_through,
    default_sync_window,
    enqueue_history_backfill,
    enqueue_sync_run,
    incremental_sync_window,
    resolve_sync_window,
)
from app.models.integrations import (
    IntegrationConnection,
    IntegrationOAuthGrant,
    IntegrationSyncRun,
)
from app.models.workspace import Workspace

_WINDOW = (date(2026, 7, 1), date(2026, 7, 3))


async def _seed_connection(
    db_session, *, provider: str = "gsc"
) -> tuple[uuid.UUID, IntegrationConnection]:
    workspace = Workspace(name="Acme")
    db_session.add(workspace)
    await db_session.flush()
    grant = IntegrationOAuthGrant(
        workspace_id=workspace.id, transport="google_oauth", status="connected"
    )
    db_session.add(grant)
    await db_session.flush()
    connection = IntegrationConnection(
        workspace_id=workspace.id,
        grant_id=grant.id,
        provider=provider,
        label=f"{provider} label",
        account_ref=f"{provider}-account-ref",
    )
    db_session.add(connection)
    await db_session.commit()
    return workspace.id, connection


async def _complete(db_session, run_id: uuid.UUID) -> None:
    run = await db_session.get(IntegrationSyncRun, run_id)
    run.status = TASK_STATUS_SUCCEEDED
    run.completed_at = datetime.now(UTC)
    await db_session.commit()


async def _runs(db_session, connection_id: uuid.UUID) -> list[IntegrationSyncRun]:
    result = await db_session.execute(
        select(IntegrationSyncRun)
        .where(IntegrationSyncRun.connection_id == connection_id)
        .order_by(IntegrationSyncRun.resync_seq.asc())
    )
    return list(result.scalars())


@pytest.mark.asyncio
async def test_default_window_uses_config_trailing_days(db_session) -> None:
    workspace_id, connection = await _seed_connection(db_session)

    run = await enqueue_sync_run(
        db_session, workspace_id=workspace_id, connection_id=connection.id
    )

    expected_start, expected_end = default_sync_window()
    # A connection that has imported nothing has no coverage to extend, so
    # the incremental resolver falls back to the trailing default window:
    # ``sync_default_window_days`` complete days ending yesterday.
    assert expected_end == datetime.now(UTC).date() - timedelta(days=1)
    assert (expected_end - expected_start).days + 1 == (
        integration_settings.sync_default_window_days
    )
    assert (run.window_start, run.window_end) == (expected_start, expected_end)
    assert run.sync_kind == SYNC_KIND_ON_DEMAND
    assert run.status == TASK_STATUS_QUEUED
    assert run.resync_seq == 0
    assert run.max_attempts == integration_settings.sync_max_attempts
    assert run.idempotency_key == build_sync_idempotency_key(
        connection_id=connection.id,
        sync_kind=SYNC_KIND_ON_DEMAND,
        window_start=expected_start,
        window_end=expected_end,
        resync_seq=0,
    )
    assert len(run.idempotency_key) <= 160  # String(160) column


@pytest.mark.asyncio
async def test_explicit_window_clamped_to_backfill_max(db_session) -> None:
    workspace_id, connection = await _seed_connection(db_session)
    window_end = date(2026, 1, 1)
    window_start = window_end - timedelta(
        days=integration_settings.sync_backfill_max_days + 100
    )

    run = await enqueue_sync_run(
        db_session,
        workspace_id=workspace_id,
        connection_id=connection.id,
        window_start=window_start,
        window_end=window_end,
    )

    assert run.window_end == window_end  # end preserved; start pulled forward
    assert (run.window_end - run.window_start).days + 1 == (
        integration_settings.sync_backfill_max_days
    )


@pytest.mark.asyncio
async def test_on_demand_window_extends_existing_coverage(db_session) -> None:
    """Sync now ADDS to the imported history instead of re-fetching it."""
    workspace_id, connection = await _seed_connection(db_session)
    today = datetime.now(UTC).date()
    covered_through = today - timedelta(days=5)
    db_session.add(
        IntegrationSyncRun(
            connection_id=connection.id,
            workspace_id=workspace_id,
            sync_kind=SYNC_KIND_ON_DEMAND,
            window_start=covered_through - timedelta(days=6),
            window_end=covered_through,
            resync_seq=0,
            status=TASK_STATUS_SUCCEEDED,
            idempotency_key=f"covered-{uuid.uuid4()}",
        )
    )
    await db_session.commit()

    run = await enqueue_sync_run(
        db_session, workspace_id=workspace_id, connection_id=connection.id
    )

    assert run.window_end == today - timedelta(days=1)
    # Starts the day after what is covered, pulled back by the late-data
    # revision window so Search Console's edits to recent days are re-read
    # rather than frozen at their first-seen values.
    assert run.window_start == covered_through + timedelta(days=1) - timedelta(
        days=integration_settings.sync_late_data_revision_days
    )
    # Strictly shorter than the default trailing window: the already-imported
    # dates are not re-fetched.
    default_start, _ = default_sync_window()
    assert run.window_start > default_start


@pytest.mark.asyncio
async def test_only_succeeded_runs_count_as_coverage(db_session) -> None:
    """A queued or failed run imported nothing, so its window is not covered."""
    workspace_id, connection = await _seed_connection(db_session)
    today = datetime.now(UTC).date()
    db_session.add(
        IntegrationSyncRun(
            connection_id=connection.id,
            workspace_id=workspace_id,
            sync_kind=SYNC_KIND_ON_DEMAND,
            window_start=today - timedelta(days=9),
            window_end=today - timedelta(days=3),
            resync_seq=0,
            status=TASK_STATUS_FAILED,
            idempotency_key=f"failed-{uuid.uuid4()}",
        )
    )
    await db_session.commit()

    run = await enqueue_sync_run(
        db_session, workspace_id=workspace_id, connection_id=connection.id
    )

    # Treating the failed window as covered would skip those dates forever.
    assert (run.window_start, run.window_end) == default_sync_window()


@pytest.mark.asyncio
async def test_coverage_stops_at_the_first_gap(db_session) -> None:
    """A failed middle chunk must not be hidden by later successes.

    A backfill fans out many chunks. If one fails while newer ones succeed,
    taking MAX(window_end) would treat the hole as imported and no later
    sync would ever go back for it.
    """
    workspace_id, connection = await _seed_connection(db_session)
    today = datetime.now(UTC).date()
    # Succeeded: [-40, -34]. FAILED: [-33, -27] (the hole). Succeeded: [-26, -20].
    for offset_start, offset_end, status in (
        (40, 34, TASK_STATUS_SUCCEEDED),
        (33, 27, TASK_STATUS_FAILED),
        (26, 20, TASK_STATUS_SUCCEEDED),
    ):
        db_session.add(
            IntegrationSyncRun(
                connection_id=connection.id,
                workspace_id=workspace_id,
                sync_kind=SYNC_KIND_ON_DEMAND,
                window_start=today - timedelta(days=offset_start),
                window_end=today - timedelta(days=offset_end),
                resync_seq=0,
                status=status,
                idempotency_key=f"chunk-{offset_start}-{uuid.uuid4()}",
            )
        )
    await db_session.commit()

    covered = await connection_covered_through(db_session, connection_id=connection.id)

    # Coverage stops at the edge of the first contiguous block, so the next
    # sync reaches back over the hole instead of skipping it forever.
    assert covered == today - timedelta(days=34)


def test_incremental_window_helper_is_pure() -> None:
    today = date(2026, 9, 4)
    yesterday = date(2026, 9, 3)
    late = integration_settings.sync_late_data_revision_days

    # Nothing imported yet -> the default trailing window.
    assert incremental_sync_window(None, today=today) == default_sync_window(
        today=today
    )
    # Already current -> just the late-data tail, never an empty no-op.
    current_start, current_end = incremental_sync_window(yesterday, today=today)
    assert current_end == yesterday
    assert current_start == yesterday + timedelta(days=1) - timedelta(days=late)
    assert current_start <= current_end
    # Behind -> reaches back to cover the gap plus the tail.
    behind_start, _ = incremental_sync_window(date(2026, 8, 20), today=today)
    assert behind_start == date(2026, 8, 21) - timedelta(days=late)
    # Bounded by the same budget every other window obeys.
    long_start, long_end = incremental_sync_window(date(2020, 1, 1), today=today)
    assert (long_end - long_start).days + 1 <= (
        integration_settings.sync_backfill_max_days
    )
    # Coverage running past yesterday still yields a valid window.
    skewed_start, skewed_end = incremental_sync_window(date(2026, 9, 20), today=today)
    assert skewed_start <= skewed_end == yesterday


def test_window_helpers_pure() -> None:
    # Inverted range rejected; exact-max span untouched; over-max clamped.
    with pytest.raises(SyncWindowInvalidError):
        clamp_sync_window(date(2026, 7, 3), date(2026, 7, 1))
    max_span = integration_settings.sync_backfill_max_days
    end = date(2026, 7, 3)
    start = end - timedelta(days=max_span - 1)
    assert clamp_sync_window(start, end) == (start, end)
    # Half-specified windows rejected; both-absent resolves to the default.
    with pytest.raises(SyncWindowInvalidError):
        resolve_sync_window(date(2026, 7, 1), None)
    with pytest.raises(SyncWindowInvalidError):
        resolve_sync_window(None, date(2026, 7, 1))
    assert resolve_sync_window(None, None) == default_sync_window()
    # The key builder is deterministic.
    connection_id = uuid.uuid4()
    key_a = build_sync_idempotency_key(
        connection_id=connection_id,
        sync_kind=SYNC_KIND_ON_DEMAND,
        window_start=_WINDOW[0],
        window_end=_WINDOW[1],
        resync_seq=2,
    )
    key_b = build_sync_idempotency_key(
        connection_id=connection_id,
        sync_kind=SYNC_KIND_ON_DEMAND,
        window_start=_WINDOW[0],
        window_end=_WINDOW[1],
        resync_seq=2,
    )
    assert key_a == key_b


@pytest.mark.asyncio
async def test_duplicate_active_window_rejected(db_session) -> None:
    workspace_id, connection = await _seed_connection(db_session)
    connection_id = connection.id  # capture now: the conflict path rolls back
    first = await enqueue_sync_run(
        db_session,
        workspace_id=workspace_id,
        connection_id=connection_id,
        window_start=_WINDOW[0],
        window_end=_WINDOW[1],
    )
    first_id = first.id

    with pytest.raises(ActiveWindowConflictError):
        await enqueue_sync_run(
            db_session,
            workspace_id=workspace_id,
            connection_id=connection_id,
            window_start=_WINDOW[0],
            window_end=_WINDOW[1],
        )

    runs = await _runs(db_session, connection_id)
    assert [row.id for row in runs] == [first_id]
    assert runs[0].status == TASK_STATUS_QUEUED  # still occupies the slot


@pytest.mark.asyncio
async def test_completed_window_resyncs_with_bumped_seq(db_session) -> None:
    workspace_id, connection = await _seed_connection(db_session)
    run0 = await enqueue_sync_run(
        db_session,
        workspace_id=workspace_id,
        connection_id=connection.id,
        window_start=_WINDOW[0],
        window_end=_WINDOW[1],
    )
    await _complete(db_session, run0.id)
    run1 = await enqueue_sync_run(
        db_session,
        workspace_id=workspace_id,
        connection_id=connection.id,
        window_start=_WINDOW[0],
        window_end=_WINDOW[1],
    )
    await _complete(db_session, run1.id)
    run2 = await enqueue_sync_run(
        db_session,
        workspace_id=workspace_id,
        connection_id=connection.id,
        window_start=_WINDOW[0],
        window_end=_WINDOW[1],
    )

    assert (run0.resync_seq, run1.resync_seq, run2.resync_seq) == (0, 1, 2)
    # Every re-sync is a NEW run identity; prior rows are retained (inv. 3).
    assert len({run0.id, run1.id, run2.id}) == 3
    assert len({run0.idempotency_key, run1.idempotency_key, run2.idempotency_key}) == 3
    runs = await _runs(db_session, connection.id)
    assert [run.resync_seq for run in runs] == [0, 1, 2]
    assert [run.status for run in runs] == [
        TASK_STATUS_SUCCEEDED,
        TASK_STATUS_SUCCEEDED,
        TASK_STATUS_QUEUED,
    ]


@pytest.mark.asyncio
async def test_concurrent_allocators_get_distinct_monotonic_seqs(
    session_factory, db_session
) -> None:
    workspace_id, connection = await _seed_connection(db_session)

    async def _enqueue() -> IntegrationSyncRun:
        async with session_factory() as session:
            return await enqueue_sync_run(
                session,
                workspace_id=workspace_id,
                connection_id=connection.id,
                window_start=_WINDOW[0],
                window_end=_WINDOW[1],
            )

    async def _complete_fresh(run_id: uuid.UUID) -> None:
        async with session_factory() as session:
            await _complete(session, run_id)

    # Round 1: two racing enqueues — exactly one wins the active slot at
    # seq 0; the loser is rejected by the partial active-window index, never
    # allocated the same seq.
    outcomes = await asyncio.gather(_enqueue(), _enqueue(), return_exceptions=True)
    winner1 = next(o for o in outcomes if isinstance(o, IntegrationSyncRun))
    assert any(isinstance(o, ActiveWindowConflictError) for o in outcomes)
    assert winner1.resync_seq == 0

    await _complete_fresh(winner1.id)

    # Round 2: the next generation allocates seq 1 — distinct + monotonic.
    outcomes = await asyncio.gather(_enqueue(), _enqueue(), return_exceptions=True)
    winner2 = next(o for o in outcomes if isinstance(o, IntegrationSyncRun))
    assert any(isinstance(o, ActiveWindowConflictError) for o in outcomes)
    assert winner2.resync_seq == 1
    assert winner2.id != winner1.id
    assert winner2.resync_seq > winner1.resync_seq

    async with session_factory() as session:
        runs = await _runs(session, connection.id)
    assert [run.resync_seq for run in runs] == [0, 1]


@pytest.mark.asyncio
async def test_window_kind_groups_allocate_independently(db_session) -> None:
    """The window-group identity includes sync_kind (spec §3)."""
    workspace_id, connection = await _seed_connection(db_session)
    on_demand = await enqueue_sync_run(
        db_session,
        workspace_id=workspace_id,
        connection_id=connection.id,
        window_start=_WINDOW[0],
        window_end=_WINDOW[1],
    )
    backfill = await enqueue_sync_run(
        db_session,
        workspace_id=workspace_id,
        connection_id=connection.id,
        sync_kind=SYNC_KIND_BACKFILL,
        window_start=_WINDOW[0],
        window_end=_WINDOW[1],
    )
    # Same window, different kind: a distinct active slot + its own seq 0.
    assert (on_demand.resync_seq, backfill.resync_seq) == (0, 0)
    assert on_demand.sync_kind != backfill.sync_kind


@pytest.mark.asyncio
async def test_cross_workspace_connection_rejected(db_session) -> None:
    _workspace_id, connection = await _seed_connection(db_session)
    with pytest.raises(IntegrationConnectionNotFoundError):
        await enqueue_sync_run(
            db_session, workspace_id=uuid.uuid4(), connection_id=connection.id
        )


@pytest.mark.asyncio
async def test_unknown_sync_kind_rejected(db_session) -> None:
    workspace_id, connection = await _seed_connection(db_session)
    with pytest.raises(ValueError, match="unknown integration sync kind"):
        await enqueue_sync_run(
            db_session,
            workspace_id=workspace_id,
            connection_id=connection.id,
            sync_kind="bogus",
        )


# --- one-time history backfill --------------------------------------------


@pytest.mark.asyncio
async def test_history_backfill_covers_a_year_in_contiguous_chunks(db_session) -> None:
    """A year of history, imported as rolling-window-sized pieces.

    Chunked deliberately: a sync window is also a projection window, and the
    refresh it triggers materializes every row in that window in memory. One
    365-day run would load a year at once.
    """
    workspace_id, connection = await _seed_connection(db_session)
    today = date(2026, 3, 1)

    runs = await enqueue_history_backfill(
        db_session,
        workspace_id=workspace_id,
        connection_id=connection.id,
        today=today,
    )

    assert runs
    assert {run.sync_kind for run in runs} == {SYNC_KIND_BACKFILL}
    windows = sorted((run.window_start, run.window_end) for run in runs)
    # The right edge is yesterday — the same edge every other window uses, so
    # backfilled history lines up with the rolling sync.
    assert windows[-1][1] == date(2026, 2, 28)
    assert (windows[-1][1] - windows[0][0]).days + 1 == (
        integration_settings.sync_backfill_window_days
    )
    # Contiguous and non-overlapping: no day is imported twice or skipped.
    for earlier, later in pairwise(windows):
        assert (later[0] - earlier[1]).days == 1
    # No chunk is larger than one rolling window.
    for start, end in windows:
        assert (end - start).days + 1 <= integration_settings.sync_default_window_days


@pytest.mark.asyncio
async def test_history_backfill_runs_once_per_connection(db_session) -> None:
    """Re-selecting a property must not re-import a year of history."""
    workspace_id, connection = await _seed_connection(db_session)
    first = await enqueue_history_backfill(
        db_session, workspace_id=workspace_id, connection_id=connection.id
    )
    assert first
    for run in first:
        await _complete(db_session, run.id)

    # A later day would otherwise compute different (and so non-colliding)
    # windows, which is exactly the case a window-based guard would miss.
    again = await enqueue_history_backfill(
        db_session,
        workspace_id=workspace_id,
        connection_id=connection.id,
        today=date(2027, 1, 1),
    )

    assert again == []
    backfills = [
        run
        for run in await _runs(db_session, connection.id)
        if run.sync_kind == SYNC_KIND_BACKFILL
    ]
    assert len(backfills) == len(first)


@pytest.mark.asyncio
async def test_history_backfill_never_raises_for_an_unknown_connection(
    db_session,
) -> None:
    """Selecting a property must succeed even if the backfill cannot start."""
    workspace_id, _connection = await _seed_connection(db_session)
    assert (
        await enqueue_history_backfill(
            db_session, workspace_id=workspace_id, connection_id=uuid.uuid4()
        )
        == []
    )


def test_backfill_windows_are_bounded_by_the_rolling_window() -> None:
    """Pure window math, independent of any queue state."""
    windows = backfill_sync_windows(today=date(2026, 3, 1))
    assert windows[0][1] == date(2026, 2, 28)
    # Newest-first, so the most useful history lands first if the worker is
    # interrupted partway through.
    assert windows == sorted(windows, reverse=True)
