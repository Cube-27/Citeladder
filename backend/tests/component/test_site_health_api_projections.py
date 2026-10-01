"""The Python-served Site Health crawl list (the reads moved to TypeScript)."""

from __future__ import annotations

import httpx
import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from tests.component.site_health_api_helpers import _register, _seed_scenario

pytestmark = pytest.mark.asyncio


async def test_crawl_list_is_workspace_and_project_scoped(
    client: httpx.AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    # The client keeps the last registered session: the owner's.
    await _register(client, "crawl-foreign@example.com")
    await _register(client, "crawl@example.com")
    async with session_factory() as session:
        scn = await _seed_scenario(session, email="crawl@example.com")
        foreign = await _seed_scenario(session, email="crawl-foreign@example.com")

    listing = await client.get(
        f"/api/v1/site-crawls?project_id={scn.project_id}",
        headers={"X-Workspace-Id": str(scn.workspace_id)},
    )
    assert listing.status_code == 200
    assert [row["id"] for row in listing.json()["items"]] == [str(scn.crawl_id)]

    leaked = await client.get(
        f"/api/v1/site-crawls?project_id={scn.project_id}",
        headers={"X-Workspace-Id": str(foreign.workspace_id)},
    )
    assert leaked.status_code == 404
