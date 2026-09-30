"""Persisted project setup for tests of remaining Python consumers.

Project mutations belong to TypeScript; this fixture does not exercise them.
"""

from __future__ import annotations

import uuid

import httpx

from app.core.database import get_session
from app.main import app
from app.models.brand import Brand, BrandAlias, Competitor, OwnedDomain
from app.models.project import Project
from tests.component.auth_helpers import workspace_ids_for_session


async def seed_project(client: httpx.AsyncClient, payload: dict) -> dict:
    workspace_id = uuid.UUID((await workspace_ids_for_session(client))[0])
    async for session in app.dependency_overrides[get_session]():
        fields = {
            key: value
            for key, value in payload.items()
            if key
            in {
                "name",
                "brand_name",
                "website_url",
                "country_code",
                "language_code",
                "industry",
                "subindustry",
                "primary_market",
                "benchmark_mode",
                "default_repetitions",
            }
        }
        project = Project(workspace_id=workspace_id, **fields)
        session.add(project)
        await session.flush()
        brand = Brand(project_id=project.id, name=payload.get("brand_name", ""))
        session.add(brand)
        await session.flush()
        for alias in payload.get("brand", {}).get("aliases", []):
            session.add(BrandAlias(brand_id=brand.id, alias=alias))
        for domain in payload.get("owned_domains", []):
            session.add(OwnedDomain(project_id=project.id, domain=domain))
        for competitor in payload.get("competitors", []):
            session.add(Competitor(project_id=project.id, **competitor))
        await session.commit()
        return {**payload, "id": str(project.id), "workspace_id": str(workspace_id)}
    raise AssertionError("Test session override did not yield a session")
