"""Schema isolation of persisted internal-link metrics."""

from __future__ import annotations

import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config.site_health_link_metrics import LINK_METRIC_FORMULA_VERSION
from app.models.site_health.links import SitePageLinkMetric
from tests.component.site_health_crawl_seed import _seed_analyze_phase_crawl


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
