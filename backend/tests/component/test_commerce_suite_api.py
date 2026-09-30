from __future__ import annotations

import httpx
import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from tests.component.auth_helpers import register_and_login as _register
from tests.component.commerce_helpers import seed_catalog
from tests.component.project_helpers import seed_project


async def _project(client: httpx.AsyncClient) -> dict:
    project = await seed_project(
        client, {"name": "Commerce", "brand_name": "Acme", "competitors": []}
    )
    return project


@pytest.mark.asyncio
async def test_competitor_discovery_deduplicates_only_within_one_request(
    client: httpx.AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    await _register(client, "commerce-discovery@example.com")
    project = await _project(client)
    product_ids = await seed_catalog(
        session_factory,
        project["id"],
        [
            {
                "canonical_url": "https://shop.example/products/one",
                "name": "Acme One",
                "brand": "Acme",
            }
        ],
    )
    product_id = product_ids[0]
    url = f"/api/v1/projects/{project['id']}/commerce/competitors/discover"
    target = {"kind": "product", "id": product_id}

    first = await client.post(url, json={"targets": [target, target]})
    second = await client.post(url, json={"targets": [target]})

    assert first.status_code == 202
    assert second.status_code == 202
    assert first.json()["task_ids"][0] == first.json()["task_ids"][1]
    assert second.json()["task_ids"][0] != first.json()["task_ids"][0]
