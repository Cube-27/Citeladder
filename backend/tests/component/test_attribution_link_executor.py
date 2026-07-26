"""Attribution-link executor idempotency and latest-order selection."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from decimal import Decimal

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config.analytics import (
    AI_REFERRAL_RULE_VERSION,
    ANALYTICS_TASK_KIND_ATTRIBUTION_LINK,
    ANALYTICS_TASK_KIND_ATTRIBUTION_SNAPSHOT,
)
from app.domain.analytics.enqueue import enqueue_attribution_snapshot_refresh
from app.domain.attribution.link import run_attribution_link
from app.models.analytics import AnalyticsTask
from app.models.attribution import AttributionLink
from app.models.commerce import OrderFact
from tests.component.analytics_helpers import (
    DEFAULT_WINDOW,
    seed_ga4_import,
    seed_workspace_project,
)


def _task(
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    sync_run_id: uuid.UUID,
    rule_version: str,
) -> AnalyticsTask:
    return AnalyticsTask(
        workspace_id=workspace_id,
        project_id=project_id,
        task_kind=ANALYTICS_TASK_KIND_ATTRIBUTION_LINK,
        payload={"sync_run_id": str(sync_run_id), "rule_version": rule_version},
        idempotency_key=uuid.uuid4().hex,
    )


@pytest.mark.asyncio
async def test_link_executor_latest_only_versioned_and_idempotent(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    async with session_factory() as session:
        workspace_id, project_id = await seed_workspace_project(session)
        seed = await seed_ga4_import(
            session, workspace_id=workspace_id, project_id=project_id
        )
        old = OrderFact(
            workspace_id=workspace_id,
            project_id=project_id,
            connection_id=seed.connection_id,
            provider="shopify",
            order_ref_hash="a" * 64,
            resync_seq=0,
            occurred_at=datetime(2026, 7, 20, tzinfo=UTC),
            currency="USD",
            total_amount=Decimal("50.00"),
            line_items=[],
            attribution_keys={"referrer_url": "https://chatgpt.com/old"},
            source_artifact_id=seed.artifact_id,
        )
        latest = OrderFact(
            workspace_id=workspace_id,
            project_id=project_id,
            connection_id=seed.connection_id,
            provider="shopify",
            order_ref_hash="a" * 64,
            resync_seq=1,
            occurred_at=datetime(2026, 7, 20, tzinfo=UTC),
            currency="USD",
            total_amount=Decimal("30.00"),
            line_items=[],
            attribution_keys={"utm_source": "claude"},
            source_artifact_id=seed.artifact_id,
        )
        session.add_all([old, latest])
        await enqueue_attribution_snapshot_refresh(
            session,
            workspace_id=workspace_id,
            project_id=project_id,
            window_start=DEFAULT_WINDOW[0],
            window_end=DEFAULT_WINDOW[1],
            resync_seq=0,
            source_revision=str(uuid.uuid4()),
        )
        await session.commit()

    task = _task(workspace_id, project_id, seed.sync_run_id, AI_REFERRAL_RULE_VERSION)
    await run_attribution_link(session_factory, task)
    await run_attribution_link(session_factory, task)
    async with session_factory() as session:
        links = list((await session.scalars(select(AttributionLink))).all())
        assert len(links) == 1
        assert links[0].order_fact_id == latest.id
        assert links[0].revenue_amount == Decimal("30.00")
        assert links[0].evidence_refs["ai_source"] == "claude"
        refreshes = list(
            (
                await session.scalars(
                    select(AnalyticsTask).where(
                        AnalyticsTask.task_kind
                        == ANALYTICS_TASK_KIND_ATTRIBUTION_SNAPSHOT
                    )
                )
            ).all()
        )
        # The pre-existing GA4 revision-zero refresh must not suppress the
        # Shopify post-link rebuild for its independent revision-zero run.
        assert len(refreshes) == 2

    await run_attribution_link(
        session_factory, _task(workspace_id, project_id, seed.sync_run_id, "rules-v2")
    )
    async with session_factory() as session:
        links = list((await session.scalars(select(AttributionLink))).all())
        assert {link.rule_version for link in links} == {
            AI_REFERRAL_RULE_VERSION,
            "rules-v2",
        }
