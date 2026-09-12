"""Component tests for the integration dispatcher (I10).

Drives the real ``IntegrationDispatcher`` tick against a live Postgres
schema. Covers:

  - One ``scheduled`` run per ACTIVE connection per DISTINCT window per tick:
    the default trailing window plus the late-data revision window (these
    collapse to one run only when the two windows coincide). Connections on
    non-connected grants are skipped.
  - Dedup: a second tick while a run is active enqueues NOTHING
    (``ActiveWindowConflictError`` -> skip); once the window's run is
    terminal the next tick re-syncs it with a bumped ``resync_seq``.
  - Late-data revision: with a distinct ``sync_late_data_revision_days``
    window, the re-sync window is enqueued alongside the trailing window
    and re-syncs at a bumped seq once terminal.
  - ``pending_revocation`` retries: Google remote-revoke success resolves
    the grant (tokens dropped); failure keeps tokens + status and appends
    ``revoke_failed``; a Microsoft grant (no revoke URL in config)
    resolves locally with NO remote call.
"""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime, timedelta

import httpx
import pytest
from sqlalchemy import select

from app.core.config.integrations_contracts import (
    EVENT_INTEGRATION_REVOKE_FAILED,
    EVENT_INTEGRATION_REVOKED,
    GRANT_STATUS_CONNECTED,
    GRANT_STATUS_NEEDS_REAUTH,
    GRANT_STATUS_PENDING_REVOCATION,
    GRANT_STATUS_REVOKED,
    MAPPING_STATUS_ACTIVE,
    SYNC_KIND_SCHEDULED,
)
from app.core.config.integrations_settings import (
    integration_settings,
)
from app.core.config.integrations_transport import (
    INTEGRATION_PROVIDER_GSC,
    INTEGRATION_TRANSPORT_GOOGLE,
    INTEGRATION_TRANSPORT_MICROSOFT,
)
from app.core.config.task_queue import (
    TASK_STATUS_QUEUED,
    TASK_STATUS_SUCCEEDED,
)
from app.core.security import encrypt_secret
from app.domain.integrations.sync import default_sync_window
from app.models.integrations import (
    IntegrationConnection,
    IntegrationEvent,
    IntegrationOAuthGrant,
    IntegrationPropertyMapping,
    IntegrationSyncRun,
)
from app.models.project import Project
from app.models.workspace import Workspace
from app.workers.integration_dispatcher import IntegrationDispatcher


class _Seed:
    def __init__(
        self,
        *,
        workspace_id: uuid.UUID,
        connection_id: uuid.UUID,
        mapping_id: uuid.UUID | None = None,
    ) -> None:
        self.workspace_id = workspace_id
        self.connection_id = connection_id
        self.mapping_id = mapping_id


async def _seed_connection(
    db_session,
    *,
    grant_status: str = GRANT_STATUS_CONNECTED,
    transport: str = INTEGRATION_TRANSPORT_GOOGLE,
    workspace_name: str = "Acme",
    mapped: bool = True,
) -> tuple[_Seed, IntegrationOAuthGrant]:
    """Seed a workspace, grant, connection and (by default) a mapping.

    ``mapped=False`` leaves the connection authorized but with no property
    selected — the dispatcher must enqueue nothing for it, because a run
    imports a property and there is none.
    """
    workspace = Workspace(name=workspace_name)
    db_session.add(workspace)
    await db_session.flush()
    project = Project(
        workspace_id=workspace.id,
        name=f"{workspace_name} site",
        website_url="https://example.com",
    )
    db_session.add(project)
    grant = IntegrationOAuthGrant(
        workspace_id=workspace.id,
        transport=transport,
        access_token_encrypted=encrypt_secret("access-token-1"),
        refresh_token_encrypted=encrypt_secret("refresh-token-1"),
        token_expires_at=datetime.now(UTC) + timedelta(hours=1),
        status=grant_status,
    )
    db_session.add(grant)
    await db_session.flush()
    connection = IntegrationConnection(
        workspace_id=workspace.id,
        grant_id=grant.id,
        provider=INTEGRATION_PROVIDER_GSC,
        label="gsc connection",
        account_ref="https://example.com",
    )
    db_session.add(connection)
    await db_session.flush()
    mapping = None
    if mapped:
        mapping = IntegrationPropertyMapping(
            workspace_id=workspace.id,
            connection_id=connection.id,
            provider=INTEGRATION_PROVIDER_GSC,
            property_ref="https://example.com",
            project_id=project.id,
            status=MAPPING_STATUS_ACTIVE,
        )
        db_session.add(mapping)
    await db_session.commit()
    return (
        _Seed(
            workspace_id=workspace.id,
            connection_id=connection.id,
            mapping_id=mapping.id if mapping is not None else None,
        ),
        grant,
    )


def _dispatcher(session_factory, transport: httpx.AsyncBaseTransport | None = None):
    return IntegrationDispatcher(
        session_factory=session_factory,
        owner="dispatcher-test",
        transport=transport,
    )


async def _runs(db_session, connection_id: uuid.UUID) -> list[IntegrationSyncRun]:
    result = await db_session.scalars(
        select(IntegrationSyncRun)
        .where(IntegrationSyncRun.connection_id == connection_id)
        .order_by(
            IntegrationSyncRun.window_start.asc(),
            IntegrationSyncRun.resync_seq.asc(),
        )
    )
    return list(result)


async def _complete_all(db_session, connection_id: uuid.UUID) -> None:
    runs = await _runs(db_session, connection_id)
    for run in runs:
        run.status = TASK_STATUS_SUCCEEDED
        run.completed_at = datetime.now(UTC)
        run.lease_owner = None
    await db_session.commit()


@pytest.mark.asyncio
async def test_tick_enqueues_scheduled_run_per_active_connection(
    session_factory, db_session
) -> None:
    active, _grant = await _seed_connection(db_session)
    inactive, _grant2 = await _seed_connection(
        db_session, grant_status=GRANT_STATUS_NEEDS_REAUTH, workspace_name="Other"
    )

    ticked = await _dispatcher(session_factory).run_once()

    # A tick enqueues the trailing window plus the late-data revision window.
    # They collapse to ONE run only when the two windows coincide (i.e.
    # ``sync_default_window_days == sync_late_data_revision_days``); with a
    # longer import window they are distinct windows and both enqueue. Derive
    # the expectation from config rather than pinning one configuration.
    windows_coincide = (
        integration_settings.sync_default_window_days
        == integration_settings.sync_late_data_revision_days
    )
    expected = 1 if windows_coincide else 2
    assert ticked == expected
    active_runs = await _runs(db_session, active.connection_id)
    assert len(active_runs) == expected
    # The trailing-window run is always present and always scheduled/queued.
    trailing = next(
        run
        for run in active_runs
        if (run.window_start, run.window_end) == default_sync_window()
    )
    assert trailing.sync_kind == SYNC_KIND_SCHEDULED
    assert trailing.status == TASK_STATUS_QUEUED
    assert trailing.resync_seq == 0
    # A connection whose grant is not connected is never scheduled.
    assert await _runs(db_session, inactive.connection_id) == []


@pytest.mark.asyncio
async def test_tick_dedups_on_active_window_conflict(
    session_factory, db_session
) -> None:
    seed, _grant = await _seed_connection(db_session)
    dispatcher = _dispatcher(session_factory)

    # One run per DISTINCT window (trailing + late-data revision); they
    # collapse to one only when the two windows coincide. See the sibling test.
    per_tick = (
        1
        if integration_settings.sync_default_window_days
        == integration_settings.sync_late_data_revision_days
        else 2
    )
    assert await dispatcher.run_once() == per_tick
    # Second tick while the runs are active: conflict -> skip, no duplicate.
    assert await dispatcher.run_once() == 0
    assert len(await _runs(db_session, seed.connection_id)) == per_tick

    # Once terminal, each window re-syncs with a bumped resync_seq.
    await _complete_all(db_session, seed.connection_id)
    assert await dispatcher.run_once() == per_tick
    runs = await _runs(db_session, seed.connection_id)
    # Every distinct window is present exactly twice: the original run and its
    # bumped re-sync. Grouping by window (rather than asserting a single one)
    # keeps this true whether or not the trailing and late windows coincide.
    by_window: dict[tuple[date, date], list[int]] = {}
    for run in runs:
        by_window.setdefault((run.window_start, run.window_end), []).append(
            run.resync_seq
        )
    assert len(by_window) == per_tick
    # Each window ran twice, and the re-sync outranks the original — that is
    # what makes the second import's values supersede the first's.
    assert all(len(seqs) == 2 for seqs in by_window.values())
    assert all(max(seqs) > min(seqs) for seqs in by_window.values())
    # Revisions are allocated per CONNECTION, so every run on it is distinct.
    all_seqs = [seq for seqs in by_window.values() for seq in seqs]
    assert sorted(all_seqs) == list(range(len(all_seqs)))
    # The trailing window is always one of them.
    assert default_sync_window() in by_window


@pytest.mark.asyncio
async def test_late_data_revision_window_resyncs_with_bumped_seq(
    session_factory, db_session, monkeypatch: pytest.MonkeyPatch
) -> None:
    # A late-data window distinct from the default trailing window.
    monkeypatch.setattr(integration_settings, "sync_late_data_revision_days", 2)
    assert integration_settings.sync_default_window_days != 2
    seed, _grant = await _seed_connection(db_session)
    dispatcher = _dispatcher(session_factory)

    assert await dispatcher.run_once() == 2  # trailing + late-data windows
    runs = await _runs(db_session, seed.connection_id)
    windows = {(run.window_start, run.window_end): run.resync_seq for run in runs}
    trailing = default_sync_window()
    late_end = datetime.now(UTC).date() - timedelta(days=1)
    late = (late_end - timedelta(days=1), late_end)
    assert set(windows) == {trailing, late}

    # The late window is a strict SUBSET of the trailing window, so both runs
    # import the same most-recent days. Their revisions must differ, or the
    # late-data read collides with the trailing read on the metric-row
    # identity and its corrected values are dropped by ON CONFLICT DO NOTHING.
    # This is the regression that made the late-data pass a no-op.
    assert late[0] >= trailing[0] and late[1] <= trailing[1]
    assert windows[late] != windows[trailing]
    assert windows[late] > windows[trailing]

    await _complete_all(db_session, seed.connection_id)
    assert await dispatcher.run_once() == 2
    runs = await _runs(db_session, seed.connection_id)
    by_window: dict[tuple[date, date], list[int]] = {}
    for run in runs:
        by_window.setdefault((run.window_start, run.window_end), []).append(
            run.resync_seq
        )
    # Every run on the connection holds a distinct revision, and each window's
    # re-sync outranks its original.
    assert sorted(seq for seqs in by_window.values() for seq in seqs) == [0, 1, 2, 3]
    assert max(by_window[trailing]) > min(by_window[trailing])
    assert max(by_window[late]) > min(by_window[late])


@pytest.mark.asyncio
async def test_tick_skips_a_connection_with_no_selected_property(
    session_factory, db_session
) -> None:
    """An authorized connection with no mapping has nothing to import."""
    seed, _grant = await _seed_connection(db_session, mapped=False)
    dispatcher = _dispatcher(session_factory)

    assert await dispatcher.run_once() == 0
    assert await _runs(db_session, seed.connection_id) == []


@pytest.mark.asyncio
async def test_tick_enqueues_for_every_project_on_one_connection(
    session_factory, db_session
) -> None:
    """Two projects sharing one authorization each get their own runs.

    One Google consent can serve several projects, each mapped to its own
    property. Fanning out over connections would sync whichever property the
    connection last pointed at and silently leave the others behind.
    """
    seed, _grant = await _seed_connection(db_session)
    second_project = Project(
        workspace_id=seed.workspace_id,
        name="Second site",
        website_url="https://second.example",
    )
    db_session.add(second_project)
    await db_session.flush()
    db_session.add(
        IntegrationPropertyMapping(
            workspace_id=seed.workspace_id,
            connection_id=seed.connection_id,
            provider=INTEGRATION_PROVIDER_GSC,
            property_ref="https://second.example",
            project_id=second_project.id,
            status=MAPPING_STATUS_ACTIVE,
        )
    )
    await db_session.commit()

    per_target = (
        1
        if integration_settings.sync_default_window_days
        == integration_settings.sync_late_data_revision_days
        else 2
    )
    assert await dispatcher_run(session_factory) == per_target * 2

    runs = await _runs(db_session, seed.connection_id)
    by_property: dict[str, list[uuid.UUID]] = {}
    for run in runs:
        by_property.setdefault(run.property_ref, []).append(run.mapping_id)
    assert set(by_property) == {"https://example.com", "https://second.example"}
    # Each run froze the target it was enqueued for.
    assert all(len(set(ids)) == 1 for ids in by_property.values())
    # Revisions stay unique across the whole connection.
    assert len({run.resync_seq for run in runs}) == len(runs)


async def dispatcher_run(session_factory) -> int:
    return await _dispatcher(session_factory).run_once()


# --- pending_revocation retries ----------------------------------------------


@pytest.mark.asyncio
async def test_pending_revocation_remote_retry_success(
    session_factory, db_session
) -> None:
    seed, grant = await _seed_connection(
        db_session, grant_status=GRANT_STATUS_PENDING_REVOCATION
    )
    revoke_calls: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        revoke_calls.append(request)
        return httpx.Response(200)

    resolved = await _dispatcher(
        session_factory, transport=httpx.MockTransport(handler)
    ).run_once()

    assert resolved == 1
    assert len(revoke_calls) == 1
    await db_session.refresh(grant)
    assert grant.status == GRANT_STATUS_REVOKED
    assert grant.access_token_encrypted == ""
    assert grant.refresh_token_encrypted == ""
    assert grant.token_expires_at is None
    events = list(
        (
            await db_session.scalars(
                select(IntegrationEvent).where(
                    IntegrationEvent.workspace_id == seed.workspace_id
                )
            )
        ).all()
    )
    assert [event.event_type for event in events] == [EVENT_INTEGRATION_REVOKED]


@pytest.mark.asyncio
async def test_pending_revocation_remote_retry_failure_retains_tokens(
    session_factory, db_session
) -> None:
    seed, grant = await _seed_connection(
        db_session, grant_status=GRANT_STATUS_PENDING_REVOCATION
    )

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500, json={"error": "boom"})

    resolved = await _dispatcher(
        session_factory, transport=httpx.MockTransport(handler)
    ).run_once()

    assert resolved == 0
    await db_session.refresh(grant)
    assert grant.status == GRANT_STATUS_PENDING_REVOCATION
    assert grant.access_token_encrypted != ""  # retained for the next retry
    assert grant.refresh_token_encrypted != ""
    events = list(
        (
            await db_session.scalars(
                select(IntegrationEvent).where(
                    IntegrationEvent.workspace_id == seed.workspace_id
                )
            )
        ).all()
    )
    assert [event.event_type for event in events] == [EVENT_INTEGRATION_REVOKE_FAILED]


@pytest.mark.asyncio
async def test_pending_revocation_microsoft_resolves_locally(
    session_factory, db_session
) -> None:
    seed, grant = await _seed_connection(
        db_session,
        grant_status=GRANT_STATUS_PENDING_REVOCATION,
        transport=INTEGRATION_TRANSPORT_MICROSOFT,
    )

    def handler(request: httpx.Request) -> httpx.Response:
        raise AssertionError("Microsoft grants must never call a revoke URL")

    resolved = await _dispatcher(
        session_factory, transport=httpx.MockTransport(handler)
    ).run_once()

    assert resolved == 1
    await db_session.refresh(grant)
    assert grant.status == GRANT_STATUS_REVOKED
    assert grant.access_token_encrypted == ""
    assert grant.refresh_token_encrypted == ""
    events = list(
        (
            await db_session.scalars(
                select(IntegrationEvent).where(
                    IntegrationEvent.workspace_id == seed.workspace_id
                )
            )
        ).all()
    )
    assert [event.event_type for event in events] == [EVENT_INTEGRATION_REVOKED]
    assert events[0].payload["remote_revoke"] is False
