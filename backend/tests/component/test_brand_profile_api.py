"""Project creation seeds the brand profile the TypeScript API edits."""

from __future__ import annotations

import uuid

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models.brand import BrandProfile
from tests.component.auth_helpers import register_and_login as _register


@pytest.mark.asyncio
async def test_project_creation_provisions_the_brand_profile(
    client: httpx.AsyncClient, session_factory: async_sessionmaker[AsyncSession]
) -> None:
    await _register(client, "profile-create@example.com")
    response = await client.post(
        "/api/v1/projects",
        json={
            "name": "Acme visibility",
            "brand_name": "Acme",
            "website_url": "https://acme.example",
            "country_code": "AU",
            "language_code": "en-AU",
            "products_services": [" Clothing ", "clothing", "Homewares"],
        },
    )
    assert response.status_code == 201
    project = response.json()
    async with session_factory() as session:
        profile = await session.scalar(
            select(BrandProfile).where(
                BrandProfile.project_id == uuid.UUID(project["id"])
            )
        )
    assert profile is not None
    assert str(profile.workspace_id) == project["workspace_id"]
    assert profile.description == ""
    assert profile.products_services == ["Clothing", "Homewares"]
    # Only the fields a person supplied are marked, confirmed by the creator.
    assert set(profile.sources) == {"products_services"}
    assert profile.sources["products_services"]["review_state"] == "confirmed"
