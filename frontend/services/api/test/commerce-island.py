"""Live PostgreSQL boundary with the Python island; no generated fixtures."""

from __future__ import annotations

import asyncio
import json
import sys
import uuid

from sqlalchemy import select

from app.core.database import SessionLocal, engine
from app.domain.commerce.audit_context import freeze_commerce_context
from app.models.brand import Brand, BrandProfile
from app.models.commerce import CommerceCompetitorCandidate, CommercePromptTarget
from app.models.prompt import Prompt, PromptSet
from app.models.site_health.acquisition import SiteFetchArtifact
from app.models.site_health.analysis import SitePageAnalysis
from app.models.site_health.queue import SiteCrawlTask
from app.models.site_health.urls import SiteUrl
from app.models.workspace import WorkspaceMember
from tests.component.site_health_helpers import seed_site_crawl


async def seed():
    async with SessionLocal() as session:
        seed = await seed_site_crawl(session, task_count=2)
        brand = Brand(project_id=seed.project_id, name="Acme")
        session.add(brand)
        await session.flush()
        session.add(
            BrandProfile(
                workspace_id=seed.workspace_id,
                project_id=seed.project_id,
                brand_id=brand.id,
                business_context={"business_model": "retail"},
            )
        )
        await session.flush()
        analysis_ids = []
        for index, task_id in enumerate(seed.task_ids):
            is_product = index == 1
            url = (
                "https://example.com/products/widget"
                if is_product
                else "https://example.com/collections/tools"
            )
            task = await session.get(SiteCrawlTask, task_id)
            site_url = SiteUrl(
                workspace_id=seed.workspace_id,
                project_id=seed.project_id,
                normalized_url=url,
                display_url=url,
                url_hash=str(uuid.uuid4()),
            )
            session.add(site_url)
            await session.flush()
            task.site_url_id = site_url.id
            facts = {
                "canonical_url": url,
                "headings": {"h1_texts": ["Widget" if is_product else "Tools"]},
                "structured_data": {
                    "product": {
                        "sku": ["W1"],
                        "price": ["12.50"],
                        "price_currency": ["USD"],
                    }
                }
                if is_product
                else {},
                "links": {
                    "anchors": [
                        {"region": "main", "url": "/collections/tools/products/widget"}
                    ]
                },
            }
            artifact = SiteFetchArtifact(
                task_id=task_id,
                crawl_id=seed.crawl_id,
                workspace_id=seed.workspace_id,
                fetch_purpose="discover",
                requested_url=url,
                final_url=url,
                normalized_facts=facts,
            )
            session.add(artifact)
            await session.flush()
            analysis = SitePageAnalysis(
                workspace_id=seed.workspace_id,
                project_id=seed.project_id,
                crawl_id=seed.crawl_id,
                site_url_id=site_url.id,
                artifact_id=artifact.id,
                page_kind="product" if is_product else "category",
                status="completed",
            )
            session.add(analysis)
            await session.flush()
            analysis_ids.append(str(analysis.id))
        await session.commit()
        user_id = await session.scalar(
            select(WorkspaceMember.user_id).where(
                WorkspaceMember.workspace_id == seed.workspace_id
            )
        )
        return {
            "workspaceId": str(seed.workspace_id),
            "projectId": str(seed.project_id),
            "userId": str(user_id),
            "analyses": analysis_ids,
        }


async def prompt(workspace, project, product, kind="product"):
    async with SessionLocal() as session:
        workspace_id, project_id, product_id = map(
            uuid.UUID, (workspace, project, product)
        )
        prompt_set = PromptSet(project_id=project_id, name="Commerce")
        session.add(prompt_set)
        await session.flush()
        row = Prompt(
            prompt_set_id=prompt_set.id,
            text="best tools for a small workshop",
            enabled=False,
            cohort="commerce",
        )
        session.add(row)
        await session.flush()
        session.add(
            CommercePromptTarget(
                workspace_id=workspace_id,
                project_id=project_id,
                prompt_id=row.id,
                target_kind=kind,
                target_id=product_id,
            )
        )
        candidate = CommerceCompetitorCandidate(
            workspace_id=workspace_id,
            project_id=project_id,
            target_kind=kind,
            target_id=product_id,
            canonical_url="https://rival.example/products/rival",
            product_name="Rival",
            brand_name="Rival",
            evidence={},
            source_kind="tavily",
            state="pending",
        )
        session.add(candidate)
        await session.commit()
        return {"promptId": str(row.id), "candidateId": str(candidate.id)}


async def freeze(workspace, project, prompt_id):
    async with SessionLocal() as session:
        return await freeze_commerce_context(
            session,
            workspace_id=uuid.UUID(workspace),
            project_id=uuid.UUID(project),
            prompt_ids=[uuid.UUID(prompt_id)],
        )


async def main():
    functions = {"seed": seed, "prompt": prompt, "freeze": freeze}
    result = await functions[sys.argv[1]](*sys.argv[2:])
    print(json.dumps(result))
    await engine.dispose()


asyncio.run(main())
