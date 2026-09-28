from __future__ import annotations

import uuid

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.domain.commerce.service import enqueue_catalog_projection
from app.models.analytics import AnalyticsTask
from app.models.brand import Brand, BrandProfile
from tests.component.site_health_helpers import seed_site_crawl


@pytest.mark.asyncio
async def test_catalog_projection_enqueue_requires_commerce_business_model(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    async with session_factory() as session:
        commerce = await seed_site_crawl(session, email="commerce-model@example.com")
        saas = await seed_site_crawl(session, email="saas-model@example.com")
        for seed, business_model in ((commerce, "retail"), (saas, "b2b_saas")):
            brand = Brand(project_id=seed.project_id, name="Acme")
            session.add(brand)
            await session.flush()
            session.add(
                BrandProfile(
                    workspace_id=seed.workspace_id,
                    project_id=seed.project_id,
                    brand_id=brand.id,
                    business_context={"business_model": business_model},
                )
            )
        await session.flush()
        commerce_analysis_id = uuid.uuid4()
        saas_analysis_id = uuid.uuid4()

        await enqueue_catalog_projection(
            session,
            workspace_id=commerce.workspace_id,
            project_id=commerce.project_id,
            source_analysis_id=commerce_analysis_id,
        )
        await enqueue_catalog_projection(
            session,
            workspace_id=saas.workspace_id,
            project_id=saas.project_id,
            source_analysis_id=saas_analysis_id,
        )
        await session.commit()

        rows = list(await session.scalars(select(AnalyticsTask)))
        assert [row.project_id for row in rows] == [commerce.project_id]
