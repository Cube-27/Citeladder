"""The post-connect readiness ladder (Slice 4.1).

A pure projection over persisted rows, so every test seeds real state and
asserts the stage it implies. The point of the ladder is that its stages are
DISTINCT: "nobody connected" is not "connected with nothing imported", and
"analysis has not run" is not "analysis ran and found nothing".
"""

from __future__ import annotations

import uuid
from datetime import date

import httpx
import pytest

from app.core.config.integrations_contracts import (
    BACKFILL_STATE_COMPLETE,
    BACKFILL_STATE_PARTIAL,
    GRANT_STATUS_CONNECTED,
    MAPPING_STATUS_ACTIVE,
    READINESS_IMPORT_FAILED,
    READINESS_NOT_CONNECTED,
    SYNC_KIND_BACKFILL,
)
from app.core.config.task_queue import (
    TASK_STATUS_CANCELLED,
    TASK_STATUS_FAILED,
    TASK_STATUS_SUCCEEDED,
)
from app.domain.integrations.readiness import get_project_readiness
from app.models.integrations import (
    IntegrationConnection,
    IntegrationOAuthGrant,
    IntegrationPropertyMapping,
    IntegrationSyncRun,
)
from app.models.project import Project
from app.models.workspace import Workspace


async def _register(client: httpx.AsyncClient, email: str) -> None:
    await client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "correct-horse-battery-staple-1"},
    )
    await client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": "correct-horse-battery-staple-1"},
    )


async def _readiness(client: httpx.AsyncClient, project_id: str) -> dict:
    response = await client.get(f"/api/v1/projects/{project_id}/readiness")
    assert response.status_code == 200
    return response.json()


@pytest.mark.asyncio
async def test_project_without_a_connection_is_not_connected(
    client: httpx.AsyncClient,
) -> None:
    """No connection is its own state, never "importing nothing"."""
    await _register(client, f"readiness-none-{uuid.uuid4().hex[:8]}@example.com")
    created = await client.post("/api/v1/projects", json={"name": "Readiness"})
    project_id = created.json()["id"]

    body = await _readiness(client, project_id)
    assert body["stage"] == READINESS_NOT_CONNECTED
    assert body["connection_count"] == 0
    # Absent, not zero: no connection has a backfill to be "not started".
    assert body["backfill_state"] is None
    assert body["imported_through"] is None
    assert body["has_performance_snapshot"] is False
    assert body["opportunity_count"] == 0


# --- The rollup across a project's connections --------------------------------
#
# These read the projection directly rather than over HTTP: the states below
# are about how MANY connections roll up, and seeding several grant ->
# connection -> mapping -> backfill-run graphs is the whole test.


async def _seed_project(db_session) -> tuple[uuid.UUID, uuid.UUID, uuid.UUID]:
    """A workspace, a project, and the ONE Google grant they share.

    A workspace holds a single grant per transport, so GSC and GA4 are two
    connections on one consent — which is exactly the shape that makes a
    per-connection rollup matter.
    """
    workspace = Workspace(name="Readiness WS")
    db_session.add(workspace)
    await db_session.flush()
    project = Project(workspace_id=workspace.id, name="Readiness Project")
    db_session.add(project)
    await db_session.flush()
    grant = IntegrationOAuthGrant(
        workspace_id=workspace.id,
        transport="google_oauth",
        status=GRANT_STATUS_CONNECTED,
    )
    db_session.add(grant)
    await db_session.flush()
    await db_session.commit()
    return workspace.id, project.id, grant.id


async def _seed_mapped_connection(
    db_session,
    *,
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    grant_id: uuid.UUID,
    provider: str,
) -> uuid.UUID:
    """A connection on the workspace grant, ACTIVE-mapped to the project.

    Readiness resolves a project's connections through the mapping — the same
    join "Sync now" fans out over — so both rows are needed before a
    connection counts at all.
    """
    connection = IntegrationConnection(
        workspace_id=workspace_id,
        grant_id=grant_id,
        provider=provider,
        label=f"{provider} label",
        account_ref=f"{provider}-account-ref",
    )
    db_session.add(connection)
    await db_session.flush()
    db_session.add(
        IntegrationPropertyMapping(
            workspace_id=workspace_id,
            connection_id=connection.id,
            provider=provider,
            property_ref=f"{provider}-property",
            project_id=project_id,
            status=MAPPING_STATUS_ACTIVE,
        )
    )
    await db_session.commit()
    return connection.id


async def _seed_backfill_run(
    db_session,
    *,
    workspace_id: uuid.UUID,
    connection_id: uuid.UUID,
    window: tuple[date, date],
    status: str,
) -> None:
    db_session.add(
        IntegrationSyncRun(
            workspace_id=workspace_id,
            connection_id=connection_id,
            sync_kind=SYNC_KIND_BACKFILL,
            window_start=window[0],
            window_end=window[1],
            resync_seq=0,
            idempotency_key=uuid.uuid4().hex,
            status=status,
        )
    )
    await db_session.commit()


@pytest.mark.asyncio
async def test_a_wholly_failed_import_is_not_reported_as_still_importing(
    db_session,
) -> None:
    """Every window terminal and none succeeded is a FAILURE, not patience.

    Nothing is left in flight, so "importing" would spin forever in front of
    a user whose import needs retrying.
    """
    workspace_id, project_id, grant_id = await _seed_project(db_session)
    connection_id = await _seed_mapped_connection(
        db_session,
        workspace_id=workspace_id,
        project_id=project_id,
        grant_id=grant_id,
        provider="gsc",
    )
    await _seed_backfill_run(
        db_session,
        workspace_id=workspace_id,
        connection_id=connection_id,
        window=(date(2026, 7, 1), date(2026, 7, 7)),
        status=TASK_STATUS_FAILED,
    )
    await _seed_backfill_run(
        db_session,
        workspace_id=workspace_id,
        connection_id=connection_id,
        window=(date(2026, 7, 8), date(2026, 7, 14)),
        status=TASK_STATUS_CANCELLED,
    )

    readiness = await get_project_readiness(
        db_session, workspace_id=workspace_id, project_id=project_id
    )

    assert readiness.stage == READINESS_IMPORT_FAILED
    assert readiness.backfill_state == BACKFILL_STATE_PARTIAL
    # No window landed, so there is no covered date to claim.
    assert readiness.imported_through is None
    assert readiness.has_performance_snapshot is False


@pytest.mark.asyncio
async def test_a_connection_that_never_started_is_not_hidden_by_one_that_finished(
    db_session,
) -> None:
    """Rolling the POOLED rows up would erase the connection with no rows.

    GSC finished its windows; GA4 has enqueued nothing. Pooling makes GA4
    invisible and reports a complete import through GSC's furthest date —
    coverage the project does not have on both connections.
    """
    workspace_id, project_id, grant_id = await _seed_project(db_session)
    gsc_id = await _seed_mapped_connection(
        db_session,
        workspace_id=workspace_id,
        project_id=project_id,
        grant_id=grant_id,
        provider="gsc",
    )
    await _seed_mapped_connection(
        db_session,
        workspace_id=workspace_id,
        project_id=project_id,
        grant_id=grant_id,
        provider="ga4",
    )
    await _seed_backfill_run(
        db_session,
        workspace_id=workspace_id,
        connection_id=gsc_id,
        window=(date(2026, 7, 1), date(2026, 7, 7)),
        status=TASK_STATUS_SUCCEEDED,
    )

    readiness = await get_project_readiness(
        db_session, workspace_id=workspace_id, project_id=project_id
    )

    assert readiness.connection_count == 2
    assert readiness.backfill_state == BACKFILL_STATE_PARTIAL
    assert readiness.imported_through is None


@pytest.mark.asyncio
async def test_coverage_is_the_earliest_date_every_connection_reaches(
    db_session,
) -> None:
    """The project has evidence through the LEAST covered connection.

    Taking the furthest connection's window would claim GA4 history that was
    never imported.
    """
    workspace_id, project_id, grant_id = await _seed_project(db_session)
    gsc_id = await _seed_mapped_connection(
        db_session,
        workspace_id=workspace_id,
        project_id=project_id,
        grant_id=grant_id,
        provider="gsc",
    )
    ga4_id = await _seed_mapped_connection(
        db_session,
        workspace_id=workspace_id,
        project_id=project_id,
        grant_id=grant_id,
        provider="ga4",
    )
    await _seed_backfill_run(
        db_session,
        workspace_id=workspace_id,
        connection_id=gsc_id,
        window=(date(2026, 7, 1), date(2026, 7, 31)),
        status=TASK_STATUS_SUCCEEDED,
    )
    await _seed_backfill_run(
        db_session,
        workspace_id=workspace_id,
        connection_id=ga4_id,
        window=(date(2026, 7, 1), date(2026, 7, 10)),
        status=TASK_STATUS_SUCCEEDED,
    )

    readiness = await get_project_readiness(
        db_session, workspace_id=workspace_id, project_id=project_id
    )

    assert readiness.backfill_state == BACKFILL_STATE_COMPLETE
    assert readiness.imported_through == date(2026, 7, 10)
