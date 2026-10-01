"""The Python crawl cancel: a short locked stop.

The cancelled run's evidence is published by the TypeScript lifecycle
(``frontend/services/api/test/site-health-lifecycle.test.ts``). Retired with
crawl control (PR 18b5c).
"""

from __future__ import annotations

import asyncio

import pytest
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config.site_health_contracts import CRAWL_STATUS_CANCELLED
from app.core.config.task_queue import TASK_STATUS_CANCELLED
from app.models.site_health.crawl import SiteCrawl
from app.models.site_health.queue import SiteCrawlTask
from tests.component.site_health_helpers import seed_site_crawl


@pytest.mark.asyncio
async def test_cancel_crawl_retries_a_transient_crawl_lock_timeout(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """An active evidence commit cannot turn a user cancellation into a 500."""
    from app.domain.site_health.service import cancel_crawl

    async with session_factory() as session:
        seed = await seed_site_crawl(session, task_count=1)

    async with session_factory() as blocker:
        locked_crawl = await blocker.scalar(
            select(SiteCrawl).where(SiteCrawl.id == seed.crawl_id).with_for_update()
        )
        assert locked_crawl is not None

        async with session_factory() as cancel_session:
            await cancel_session.execute(text("SET LOCAL lock_timeout = '50ms'"))
            cancellation = asyncio.create_task(
                cancel_crawl(
                    cancel_session,
                    workspace_id=seed.workspace_id,
                    crawl_id=seed.crawl_id,
                )
            )
            await asyncio.sleep(0.15)
            await blocker.commit()
            result = await asyncio.wait_for(cancellation, timeout=5)

    assert result["status"] == CRAWL_STATUS_CANCELLED
    async with session_factory() as session:
        task_status = await session.scalar(
            select(SiteCrawlTask.status).where(SiteCrawlTask.crawl_id == seed.crawl_id)
        )
        assert task_status == TASK_STATUS_CANCELLED
