"""Schema isolation retained after architecture writer coverage moved to TypeScript."""

from __future__ import annotations

import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models.site_health.architecture import SiteObservedArchitecture
from app.models.site_health.snapshot import SiteHealthSnapshot
from tests.component.site_health_crawl_seed import _seed_analyze_phase_crawl


@pytest.mark.asyncio
async def test_architecture_composite_fk_rejects_cross_workspace_crawl(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    async with session_factory() as session:
        first, _ = await _seed_analyze_phase_crawl(
            session,
            root="https://first.example/",
            urls=("https://first.example/",),
        )
        second, _ = await _seed_analyze_phase_crawl(
            session,
            root="https://second.example/",
            urls=("https://second.example/",),
        )
        first_snapshot = SiteHealthSnapshot(
            workspace_id=first.workspace_id,
            project_id=first.project_id,
            crawl_id=first.crawl_id,
        )
        session.add(first_snapshot)
        await session.flush()
        session.add(
            SiteObservedArchitecture(
                workspace_id=first.workspace_id,
                project_id=first.project_id,
                crawl_id=second.crawl_id,
                source_snapshot_id=first_snapshot.id,
                architecture_formula_version="fixture-1",
                archetype_policy_version="fixture-1",
            )
        )
        with pytest.raises(IntegrityError):
            await session.commit()
        await session.rollback()
