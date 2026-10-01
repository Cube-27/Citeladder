"""Exactly-once analytics handoff for a terminal crawl without usable analysis."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config.traffic import TRAFFIC_GRANULARITY_DAY
from app.domain.analytics.enqueue import enqueue_demand_snapshot_refresh
from app.domain.opportunities.queue import enqueue_opportunity_refresh
from app.domain.opportunities.verification import enqueue_implementation_verification
from app.models.site_health.crawl import SiteCrawl
from app.models.traffic import TrafficSnapshot


async def enqueue_terminal_analytics_refresh(
    session: AsyncSession, *, crawl: SiteCrawl
) -> None:
    """Enqueue analytics for a terminal crawl that produced no usable analysis.

    The crawl identity is the trigger so prior Site Opportunities can be
    superseded without inventing a change snapshot. A crawl with usable
    analysis queues ``change_intel``; the TypeScript executor performs the
    same handoff with its change snapshot. Traffic evidence selects Demand as
    the predecessor and carries the trigger to Demand's Opportunity enqueue.
    Every enqueue is transactionally idempotent on the crawl identity.
    """
    await enqueue_implementation_verification(
        session,
        workspace_id=crawl.workspace_id,
        project_id=crawl.project_id,
        trigger_kind="site_crawl",
        trigger_id=crawl.id,
    )
    traffic = await session.scalar(
        select(TrafficSnapshot)
        .where(
            TrafficSnapshot.workspace_id == crawl.workspace_id,
            TrafficSnapshot.project_id == crawl.project_id,
            TrafficSnapshot.granularity == TRAFFIC_GRANULARITY_DAY,
        )
        .order_by(
            TrafficSnapshot.window_end.desc(),
            TrafficSnapshot.created_at.desc(),
            TrafficSnapshot.id.desc(),
        )
        .limit(1)
    )
    if traffic is not None:
        await enqueue_demand_snapshot_refresh(
            session,
            workspace_id=crawl.workspace_id,
            project_id=crawl.project_id,
            window_start=traffic.window_start,
            window_end=traffic.window_end,
            source_revision=f"site_crawl:{crawl.id}",
            downstream_trigger_kind="site_crawl",
            downstream_trigger_id=crawl.id,
        )
        return
    await enqueue_opportunity_refresh(
        session,
        workspace_id=crawl.workspace_id,
        project_id=crawl.project_id,
        trigger_kind="site_crawl",
        trigger_id=crawl.id,
    )


__all__ = ["enqueue_terminal_analytics_refresh"]
