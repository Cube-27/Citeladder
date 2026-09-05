"""The connected-data MCP tools (Slice 5).

Performance, AI referrals and integration status, read the way an MCP client
reads them: through ``read_growth_evidence``, which authorizes the project
against the CALLER's memberships before any tool runs.

Two properties are pinned here because they are the ones that make these
tools trustworthy:

  - a range nobody projected reports ``unavailable`` with its reason, never a
    zero (invariant 7) — an agent told "0 clicks" for a window that was never
    derived would report a collapse that nobody measured;
  - a project in another account is not found, for every tool, however valid
    the project id (invariant 5).

Requires a real Postgres.
"""

from __future__ import annotations

import uuid
from datetime import date, timedelta

import pytest
from mcp.server.auth.middleware.auth_context import auth_context_var
from mcp.server.auth.middleware.bearer_auth import AuthenticatedUser
from mcp.server.auth.provider import AccessToken
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config.analytics import ANALYTICS_TASK_KIND_TRAFFIC_SNAPSHOT_REFRESH
from app.core.config.integrations_datasets import (
    DATASET_GSC_DAY_DAILY,
    DATASET_GSC_QUERY_DAILY,
)
from app.core.config.integrations_transport import INTEGRATION_PROVIDER_GSC
from app.core.config.mcp import MCP_READ_SCOPE
from app.domain.mcp.data import read_growth_evidence
from app.domain.mcp.oauth_provider import resource_url
from app.domain.traffic.service import refresh_traffic_snapshot
from app.models.analytics import AnalyticsTask
from app.models.integrations import IntegrationConnection
from app.models.project import Project
from app.models.user import User
from app.models.workspace import Workspace, WorkspaceMember
from tests.component.analytics_helpers import seed_ga4_import, seed_metric_row

GSC_PROPERTY = "https://example.com/"
ANCHOR = date(2026, 7, 28)
WINDOW = (ANCHOR - timedelta(days=27), ANCHOR)

CONNECTED_TOOLS = (
    "performance.read_snapshot",
    "performance.read_table",
    "referrals.read_snapshot",
    "integrations.read_status",
)


async def _seed_account(
    session: AsyncSession, email: str
) -> tuple[uuid.UUID, uuid.UUID, uuid.UUID]:
    """One account: user, workspace, membership, project."""
    user = User(email=email, hashed_password="unused-test-hash")
    workspace = Workspace(name=f"{email} workspace")
    session.add_all([user, workspace])
    await session.flush()
    project = Project(
        workspace_id=workspace.id,
        name=f"{email} project",
        brand_name="Example Brand",
        website_url="https://example.test",
    )
    session.add_all(
        [WorkspaceMember(workspace_id=workspace.id, user_id=user.id), project]
    )
    await session.flush()
    await session.commit()
    return user.id, workspace.id, project.id


async def _seed_gsc_projection(
    session: AsyncSession,
    session_factory: async_sessionmaker[AsyncSession],
    *,
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
) -> None:
    """A real import chain, refreshed into a real snapshot.

    Seeding a ``TrafficSnapshot`` row by hand would test the reader against a
    shape no projection ever wrote; running the refresh keeps the tool honest
    about what the pipeline actually produces.
    """
    days = await seed_ga4_import(
        session,
        workspace_id=workspace_id,
        project_id=project_id,
        dataset=DATASET_GSC_DAY_DAILY,
        provider=INTEGRATION_PROVIDER_GSC,
        property_ref=GSC_PROPERTY,
        window=WINDOW,
    )
    await seed_metric_row(
        session,
        seed=days,
        row_date=ANCHOR,
        dimension_values=[ANCHOR.isoformat()],
        metrics={"clicks": 30, "impressions": 300, "ctr": 0.1, "position": 4.5},
    )
    queries = await seed_ga4_import(
        session,
        workspace_id=workspace_id,
        project_id=project_id,
        dataset=DATASET_GSC_QUERY_DAILY,
        provider=INTEGRATION_PROVIDER_GSC,
        property_ref=GSC_PROPERTY,
        window=WINDOW,
        connection=await session.get(IntegrationConnection, days.connection_id),
        resync_seq=1,
    )
    await seed_metric_row(
        session,
        seed=queries,
        row_date=ANCHOR,
        dimension_values=["citeladder pricing", ANCHOR.isoformat()],
        metrics={"clicks": 12, "impressions": 90, "ctr": 0.13, "position": 3.2},
    )
    await session.commit()
    await refresh_traffic_snapshot(
        session_factory,
        AnalyticsTask(
            workspace_id=workspace_id,
            project_id=project_id,
            task_kind=ANALYTICS_TASK_KIND_TRAFFIC_SNAPSHOT_REFRESH,
            payload={
                "window_start": WINDOW[0].isoformat(),
                "window_end": WINDOW[1].isoformat(),
            },
            idempotency_key=f"mcp-refresh-{uuid.uuid4()}",
        ),
    )


def _as_caller(user_id: uuid.UUID):
    return auth_context_var.set(
        AuthenticatedUser(
            AccessToken(
                token="unused-in-process-token",
                client_id="test-client",
                scopes=[MCP_READ_SCOPE],
                subject=str(user_id),
                resource=resource_url(),
            )
        )
    )


@pytest.mark.asyncio
async def test_an_unprojected_range_is_reported_not_zeroed(
    db_session: AsyncSession,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """Nothing derived is ``unavailable`` with a reason — never an empty total."""
    user_id, _workspace_id, project_id = await _seed_account(
        db_session, f"mcp-empty-{uuid.uuid4().hex[:8]}@example.com"
    )

    token = _as_caller(user_id)
    try:
        async with session_factory() as session:
            performance = await read_growth_evidence(
                session, str(project_id), "performance.read_snapshot"
            )
            referrals = await read_growth_evidence(
                session, str(project_id), "referrals.read_snapshot"
            )
            status = await read_growth_evidence(
                session, str(project_id), "integrations.read_status"
            )
    finally:
        auth_context_var.reset(token)

    assert performance["state"] == "unavailable"
    assert performance["reason"] == "performance_range_not_projected"
    assert referrals["state"] == "unavailable"
    assert referrals["reason"] == "no_ai_referrals_snapshot"
    # Integration status is ALWAYS available: "nothing is connected" is the
    # answer this tool exists to give, not an absence of one.
    assert status["state"] == "available"
    assert status["stage"] == "not_connected"
    assert status["connection_count"] == 0
    assert status["connections"] == []


@pytest.mark.asyncio
async def test_performance_reads_the_same_projection_the_dashboard_reads(
    db_session: AsyncSession,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """Totals, series and the dimension table come from ONE snapshot id."""
    user_id, workspace_id, project_id = await _seed_account(
        db_session, f"mcp-perf-{uuid.uuid4().hex[:8]}@example.com"
    )
    await _seed_gsc_projection(
        db_session,
        session_factory,
        workspace_id=workspace_id,
        project_id=project_id,
    )

    token = _as_caller(user_id)
    try:
        async with session_factory() as session:
            snapshot = await read_growth_evidence(
                session, str(project_id), "performance.read_snapshot"
            )
            table = await read_growth_evidence(
                session,
                str(project_id),
                "performance.read_table",
                {
                    "dimension": "query",
                    "snapshot_id": snapshot["selected"]["snapshot_id"],
                },
            )
    finally:
        auth_context_var.reset(token)

    assert snapshot["state"] == "available"
    assert snapshot["selected"]["evidence_state"] == "available"
    assert snapshot["selected"]["totals"]["clicks"] == 30
    assert snapshot["artifact_refs"][0]["kind"] == "traffic_snapshot"
    # The table carries the snapshot the headline came from, so a client can
    # never chart one projection and tabulate another.
    assert table["state"] == "available"
    assert table["dimension"] == "query"
    assert [row["dimension_key"] for row in table["items"]] == ["citeladder pricing"]
    assert table["artifact_refs"] == snapshot["artifact_refs"][:1]


@pytest.mark.asyncio
async def test_a_project_in_another_account_is_not_found_by_any_tool(
    db_session: AsyncSession,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """A project id alone grants nothing, for every connected-data tool."""
    caller_id, _caller_workspace, _caller_project = await _seed_account(
        db_session, f"mcp-caller-{uuid.uuid4().hex[:8]}@example.com"
    )
    _outsider_id, outsider_workspace, outsider_project = await _seed_account(
        db_session, f"mcp-outsider-{uuid.uuid4().hex[:8]}@example.com"
    )
    await _seed_gsc_projection(
        db_session,
        session_factory,
        workspace_id=outsider_workspace,
        project_id=outsider_project,
    )

    token = _as_caller(caller_id)
    try:
        async with session_factory() as session:
            for tool_name in CONNECTED_TOOLS:
                with pytest.raises(LookupError, match="not found"):
                    await read_growth_evidence(
                        session, str(outsider_project), tool_name
                    )
    finally:
        auth_context_var.reset(token)
