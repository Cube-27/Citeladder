"""The post-connect chain, driven from nothing (Slice 4.3).

A project's FIRST connect is the case with no prior state at all: no
snapshot to update, no demand history to compare against, no opportunities to
supersede. Every link in the chain has been exercised on a warm project; this
drives the whole of it cold —

    derivation -> traffic_snapshot_refresh -> demand refresh -> opportunities

— and asserts the readiness ladder actually reaches ``analysis_ready``, with
a demand snapshot behind it. A ladder that stalls at ``core_data_ready``
forever is the failure this test exists to catch: the user sees their own
numbers and then waits for analysis that is never coming.

Requires a real Postgres.
"""

from __future__ import annotations

import uuid
from datetime import date, timedelta

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config.integrations_contracts import (
    GRANT_STATUS_CONNECTED,
    MAPPING_STATUS_ACTIVE,
    READINESS_ANALYSIS_READY,
    SYNC_KIND_BACKFILL,
)
from app.core.config.integrations_datasets import (
    DATASET_GA4_CHANNEL_DAILY,
    DATASET_GSC_DAY_DAILY,
    DATASET_GSC_PAGE_DAILY,
    DATASET_GSC_QUERY_DAILY,
)
from app.core.config.integrations_transport import (
    INTEGRATION_PROVIDER_GA4,
    INTEGRATION_PROVIDER_GSC,
)
from app.core.config.task_queue import TASK_STATUS_SUCCEEDED
from app.domain.analytics.enqueue import enqueue_post_sync_projections
from app.domain.integrations.readiness import get_project_readiness
from app.models.integrations import (
    IntegrationConnection,
    IntegrationOAuthGrant,
    IntegrationPropertyMapping,
    IntegrationSyncRun,
)
from app.models.project import Project
from app.models.workspace import Workspace
from app.workers.analytics_worker import AnalyticsWorker
from tests.component.analytics_helpers import seed_ga4_import, seed_metric_row

SITE = "https://example.com"
GSC_PROPERTY = "https://example.com/"
GA4_PROPERTY = "properties/123456789"
ANCHOR = date(2026, 7, 28)
WINDOW = (ANCHOR - timedelta(days=27), ANCHOR)


async def _seed_project(session: AsyncSession) -> tuple[uuid.UUID, uuid.UUID]:
    workspace = Workspace(name="Cold connect WS")
    session.add(workspace)
    await session.flush()
    project = Project(
        workspace_id=workspace.id,
        name="Cold connect",
        brand_name="Example",
        website_url=SITE,
    )
    session.add(project)
    await session.flush()
    await session.commit()
    return workspace.id, project.id


async def _map_and_complete_backfill(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    connection_id: uuid.UUID,
    provider: str,
    property_ref: str,
) -> None:
    """What a finished first connect leaves behind: a mapping and a done import."""
    session.add(
        IntegrationPropertyMapping(
            workspace_id=workspace_id,
            connection_id=connection_id,
            provider=provider,
            property_ref=property_ref,
            project_id=project_id,
            status=MAPPING_STATUS_ACTIVE,
        )
    )
    session.add(
        IntegrationSyncRun(
            workspace_id=workspace_id,
            connection_id=connection_id,
            sync_kind=SYNC_KIND_BACKFILL,
            window_start=WINDOW[0],
            window_end=WINDOW[1],
            resync_seq=0,
            idempotency_key=uuid.uuid4().hex,
            status=TASK_STATUS_SUCCEEDED,
        )
    )
    await session.commit()


@pytest.mark.asyncio
async def test_a_cold_connect_reaches_analysis_ready(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    async with session_factory() as session:
        workspace_id, project_id = await _seed_project(session)

    artifact_ids: list[uuid.UUID] = []
    async with session_factory() as session:
        days = await seed_ga4_import(
            session,
            workspace_id=workspace_id,
            project_id=project_id,
            dataset=DATASET_GSC_DAY_DAILY,
            provider=INTEGRATION_PROVIDER_GSC,
            property_ref=GSC_PROPERTY,
            window=WINDOW,
        )
        gsc_connection = await session.get(IntegrationConnection, days.connection_id)
        assert gsc_connection is not None
        for offset in range(3):
            await seed_metric_row(
                session,
                seed=days,
                row_date=ANCHOR - timedelta(days=offset),
                dimension_values=[(ANCHOR - timedelta(days=offset)).isoformat()],
                metrics={
                    "clicks": 10 + offset,
                    "impressions": 200 + offset,
                    "position": 8.0,
                },
            )
        pages = await seed_ga4_import(
            session,
            workspace_id=workspace_id,
            project_id=project_id,
            dataset=DATASET_GSC_PAGE_DAILY,
            provider=INTEGRATION_PROVIDER_GSC,
            property_ref=GSC_PROPERTY,
            window=WINDOW,
            connection=gsc_connection,
            resync_seq=1,
        )
        await seed_metric_row(
            session,
            seed=pages,
            row_date=ANCHOR,
            dimension_values=[f"{SITE}/pricing", ANCHOR.isoformat()],
            metrics={"clicks": 6, "impressions": 180, "position": 12.0},
        )
        queries = await seed_ga4_import(
            session,
            workspace_id=workspace_id,
            project_id=project_id,
            dataset=DATASET_GSC_QUERY_DAILY,
            provider=INTEGRATION_PROVIDER_GSC,
            property_ref=GSC_PROPERTY,
            window=WINDOW,
            connection=gsc_connection,
            resync_seq=2,
        )
        await seed_metric_row(
            session,
            seed=queries,
            row_date=ANCHOR,
            dimension_values=["citeladder pricing", ANCHOR.isoformat()],
            metrics={"clicks": 4, "impressions": 160, "position": 14.0},
        )

        ga4_connection = IntegrationConnection(
            workspace_id=workspace_id,
            grant_id=days.grant_id,
            provider=INTEGRATION_PROVIDER_GA4,
            label="ga4 connection",
            account_ref="ga4-account-1",
        )
        session.add(ga4_connection)
        await session.flush()
        channels = await seed_ga4_import(
            session,
            workspace_id=workspace_id,
            project_id=project_id,
            dataset=DATASET_GA4_CHANNEL_DAILY,
            provider=INTEGRATION_PROVIDER_GA4,
            property_ref=GA4_PROPERTY,
            window=WINDOW,
            connection=ga4_connection,
        )
        await seed_metric_row(
            session,
            seed=channels,
            row_date=ANCHOR,
            dimension_values=["Organic Search", ANCHOR.strftime("%Y%m%d")],
            metrics={"sessions": 40, "engagedSessions": 25, "keyEvents": 4},
        )
        await session.commit()
        artifact_ids = [
            days.artifact_id,
            pages.artifact_id,
            queries.artifact_id,
            channels.artifact_id,
        ]
        gsc_connection_id, ga4_connection_id = gsc_connection.id, ga4_connection.id

    async with session_factory() as session:
        for connection_id, provider, property_ref in (
            (gsc_connection_id, INTEGRATION_PROVIDER_GSC, GSC_PROPERTY),
            (ga4_connection_id, INTEGRATION_PROVIDER_GA4, GA4_PROPERTY),
        ):
            await _map_and_complete_backfill(
                session,
                workspace_id=workspace_id,
                project_id=project_id,
                connection_id=connection_id,
                provider=provider,
                property_ref=property_ref,
            )
        # The grant a first connect leaves CONNECTED.
        grant = await session.get(IntegrationOAuthGrant, days.grant_id)
        assert grant is not None
        grant.status = GRANT_STATUS_CONNECTED
        await session.commit()

    # The hook the integrations worker fires once derivation has landed.
    async with session_factory() as session:
        enqueued = await enqueue_post_sync_projections(
            session, project_id=project_id, import_artifact_ids=artifact_ids
        )
        await session.commit()
    assert enqueued, "derivation produced nothing to project"

    # Every link, to completion: the chain enqueues its own successors, so
    # draining to idle is what "the chain completed" means.
    worker = AnalyticsWorker(session_factory=session_factory, owner="cold-connect")
    assert await worker.run_until_idle() > 0

    async with session_factory() as session:
        readiness = await get_project_readiness(
            session, workspace_id=workspace_id, project_id=project_id
        )

    assert readiness.connection_count == 2
    assert readiness.providers == sorted(
        {INTEGRATION_PROVIDER_GA4, INTEGRATION_PROVIDER_GSC}
    )
    assert readiness.has_performance_snapshot is True
    assert readiness.has_demand_snapshot is True
    assert readiness.stage == READINESS_ANALYSIS_READY
    assert readiness.imported_through == ANCHOR
