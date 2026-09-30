"""Schema isolation and the retained Python terminal-crawl enqueue bridge."""

from __future__ import annotations

import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config.site_health_contracts import TASK_KIND_LINK_METRICS
from app.core.config.site_health_link_metrics import LINK_METRIC_FORMULA_VERSION
from app.domain.site_health.link_queue import enqueue_link_metric_refresh
from app.models.site_health.crawl import SiteCrawl
from app.models.site_health.links import SitePageLinkMetric
from app.models.site_health.queue import SiteCrawlTask
from tests.component.site_health_worker_helpers import _seed_analyze_phase_crawl


@pytest.mark.asyncio
async def test_terminal_enqueue_is_idempotent_per_extractor_version(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    async with session_factory() as session:
        seed, _ids = await _seed_analyze_phase_crawl(
            session, root="https://example.com/", urls=("https://example.com/",)
        )
        crawl = await session.get(SiteCrawl, seed.crawl_id)
        assert crawl is not None
        await enqueue_link_metric_refresh(session, crawl=crawl)
        await enqueue_link_metric_refresh(session, crawl=crawl)
        crawl.extractor_version = "next-extractor"
        await enqueue_link_metric_refresh(session, crawl=crawl)
        await session.commit()
        rows = list(
            await session.scalars(
                select(SiteCrawlTask).where(
                    SiteCrawlTask.crawl_id == seed.crawl_id,
                    SiteCrawlTask.task_kind == TASK_KIND_LINK_METRICS,
                )
            )
        )
        assert len(rows) == 2
        assert all(row.workspace_id == seed.workspace_id for row in rows)
        assert len({row.idempotency_key for row in rows}) == 2


@pytest.mark.asyncio
async def test_metric_composite_foreign_keys_reject_cross_workspace_urls(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    async with session_factory() as session:
        first, ((first_url_id, _),) = await _seed_analyze_phase_crawl(
            session,
            root="https://example.com/one",
            urls=("https://example.com/one",),
        )
        _second, ((second_url_id, _),) = await _seed_analyze_phase_crawl(
            session,
            root="https://other.example/two",
            urls=("https://other.example/two",),
        )
        assert first_url_id != second_url_id
        session.add(
            SitePageLinkMetric(
                workspace_id=first.workspace_id,
                project_id=first.project_id,
                crawl_id=first.crawl_id,
                site_url_id=second_url_id,
                source_page_count=1,
                extractor_version="test",
                formula_version=LINK_METRIC_FORMULA_VERSION,
            )
        )
        with pytest.raises(IntegrityError):
            await session.commit()
        await session.rollback()
