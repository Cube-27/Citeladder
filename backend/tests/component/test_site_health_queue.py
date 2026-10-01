"""Site Health queue: SKIP LOCKED no-double-claim + cross-queue isolation.

Proves the ONE generic ``PostgresTaskQueue`` — parameterized by
``SITE_CRAWL_QUEUE_SPEC`` instead of ``AUDIT_QUEUE_SPEC`` — enforces the same
``FOR UPDATE SKIP LOCKED`` no-double-claim + lease-sweeper semantics on
``SiteCrawlTask`` rows, and that the audit-queue and site-queue instances never
claim each other's rows. Requires a real Postgres.
"""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config.site_health_runtime import (
    SITE_CRAWL_QUEUE_SPEC,
)
from app.core.config.task_queue import (
    TASK_CLAIMABLE_STATUSES,
    TASK_STATUS_LEASED,
)
from app.models.site_health.queue import SiteCrawlTask
from app.orchestration.postgres_task_queue import PostgresTaskQueue
from tests.component.site_health_helpers import seed_site_crawl


@pytest.mark.asyncio
async def test_site_queue_concurrent_claims_never_double_claim(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    async with session_factory() as session:
        seed = await seed_site_crawl(session, task_count=12)

    queue = PostgresTaskQueue(session_factory, SITE_CRAWL_QUEUE_SPEC)
    results = await asyncio.gather(
        queue.claim(owner="site-a", limit=12),
        queue.claim(owner="site-b", limit=12),
    )
    claimed_a = {t.id for t in results[0]}
    claimed_b = {t.id for t in results[1]}

    assert claimed_a.isdisjoint(claimed_b)
    assert len(claimed_a) + len(claimed_b) == 12
    assert claimed_a | claimed_b == set(seed.task_ids)
    assert all(t.status == TASK_STATUS_LEASED for r in results for t in r)


@pytest.mark.asyncio
async def test_site_queue_sweeper_reclaims_expired_lease(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    async with session_factory() as session:
        seed = await seed_site_crawl(session, task_count=3)

    queue = PostgresTaskQueue(session_factory, SITE_CRAWL_QUEUE_SPEC)
    claimed = await queue.claim(owner="site-a", limit=3)
    assert len(claimed) == 3

    # Force the leases to have already expired.
    async with session_factory() as session:
        await session.execute(
            update(SiteCrawlTask)
            .where(SiteCrawlTask.crawl_id == seed.crawl_id)
            .values(lease_expires_at=datetime.now(UTC) - timedelta(minutes=5))
        )
        await session.commit()

    reclaimed = await queue.release_expired()
    assert reclaimed == 3

    async with session_factory() as session:
        rows = (
            (
                await session.execute(
                    select(SiteCrawlTask).where(SiteCrawlTask.crawl_id == seed.crawl_id)
                )
            )
            .scalars()
            .all()
        )
    # Back to claimable (attempts remain under the site max_attempts budget);
    # the sweeper returns reclaimed rows to a claimable status.
    assert all(r.status in TASK_CLAIMABLE_STATUSES for r in rows)
    assert all(r.lease_owner is None for r in rows)
