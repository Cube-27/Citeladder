"""Site Health crawl mutations over HTTP: create, cancel and stale selection.

The read journeys moved with the read routes to the TypeScript service; these
drive the routes Python still serves through the router, DB-backed.
"""

from __future__ import annotations

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config.site_health_contracts import (
    CRAWL_STATUS_CANCELLED,
    CRAWL_STATUS_COMPLETED,
)
from app.models.project import Project
from app.models.site_health.urls import SiteUrl
from app.models.user import User
from app.models.workspace import Workspace, WorkspaceMember
from tests.component.site_health_api_helpers import (
    _register,
    _seed_scenario,
)

# Reuse the exact seed helpers the focused component suite uses so the E2E
# journey exercises the same fixtures/shapes (no duplicated seeding logic).
from tests.component.site_health_helpers import seed_monitored_urls_allowance

pytestmark = pytest.mark.asyncio


async def test_create_and_cancel_crawl_lifecycle(
    client: httpx.AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """Drive the crawl lifecycle mutations through the router.

    The seeded crawl is terminal (completed), so the project has no active
    crawl and a new one can be created. Creating returns 201 with an active
    (non-terminal) status; cancelling drives it to the ``cancelled`` terminal
    status. A second create while one is active is a 409.
    """
    await _register(client, "lifecycle@example.com")
    async with session_factory() as session:
        scn = await _seed_scenario(session, email="lifecycle@example.com")
        # The base seed roots the project on the reserved ``.test`` TLD, which
        # has no registrable domain, so ``create_crawl`` would reject it (422).
        # Point the project at a real registrable domain for the create path.
        project = await session.get(Project, scn.project_id)
        assert project is not None
        project.website_url = "https://example.com/"
        await session.commit()
    headers = {"X-Workspace-Id": str(scn.workspace_id)}

    created = await client.post(
        "/api/v1/site-crawls",
        headers=headers,
        json={"project_id": str(scn.project_id), "seed": "7"},
    )
    assert created.status_code == 201
    new_crawl = created.json()
    new_crawl_id = new_crawl["id"]
    assert new_crawl_id != str(scn.crawl_id)
    assert new_crawl["status"] not in {
        CRAWL_STATUS_COMPLETED,
        CRAWL_STATUS_CANCELLED,
    }

    # A second create while one is active is rejected with a coded 409.
    conflict = await client.post(
        "/api/v1/site-crawls",
        headers=headers,
        json={"project_id": str(scn.project_id)},
    )
    assert conflict.status_code == 409

    # Cancel drives the active crawl to the cancelled terminal status.
    cancelled = await client.post(
        f"/api/v1/site-crawls/{new_crawl_id}/cancel", headers=headers
    )
    assert cancelled.status_code == 200
    assert cancelled.json()["status"] == CRAWL_STATUS_CANCELLED

    # Cancelling from another workspace the caller does not own is a 404.
    async with session_factory() as session:
        other = Workspace(name="Foreign WS")
        session.add(other)
        await session.flush()
        user = await session.scalar(
            select(User).where(User.email == "lifecycle@example.com")
        )
        assert user is not None
        session.add(
            WorkspaceMember(workspace_id=other.id, user_id=user.id, role="owner")
        )
        await session.commit()
        other_id = other.id
    foreign = await client.post(
        f"/api/v1/site-crawls/{new_crawl_id}/cancel",
        headers={"X-Workspace-Id": str(other_id)},
    )
    assert foreign.status_code == 404


async def test_stale_monitored_selection_conflict_409(
    client: httpx.AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """A full-allowance workspace's stale second commit is a 409.

    A zero-allowance workspace may not select (that gate is proven elsewhere),
    so the workspace is granted an allowance first. The first PUT (expected
    version 0) succeeds and
    bumps the persisted ``selection_version``; a second PUT replaying the now
    stale expected version 0 must be rejected with a coded 409 carrying the
    current version, and must NOT overwrite the committed selection.
    """
    await _register(client, "stale@example.com")
    async with session_factory() as session:
        scn = await _seed_scenario(session, email="stale@example.com")
        await seed_monitored_urls_allowance(
            session, workspace_id=scn.workspace_id, monitored_urls=50
        )
        await session.commit()
        # Resolve two discoverable URL ids for the project.
        rows = (
            await session.scalars(
                select(SiteUrl).where(SiteUrl.project_id == scn.project_id)
            )
        ).all()
        url_ids = [str(u.id) for u in rows]
        assert len(url_ids) >= 2
    headers = {"X-Workspace-Id": str(scn.workspace_id)}

    # First replacement at version 0 succeeds and bumps to version 1.
    first = await client.put(
        f"/api/v1/projects/{scn.project_id}/monitored-urls",
        headers=headers,
        json={
            "site_url_ids": url_ids[:2],
            "expected_selection_version": 0,
        },
    )
    assert first.status_code == 200
    assert first.json()["selection_version"] == 1

    # Replaying expected version 0 is now stale -> 409 with current version.
    stale = await client.put(
        f"/api/v1/projects/{scn.project_id}/monitored-urls",
        headers=headers,
        json={
            "site_url_ids": url_ids[:1],
            "expected_selection_version": 0,
        },
    )
    assert stale.status_code == 409
    body = stale.json()["detail"]
    assert body["current_selection_version"] == 1

    # The committed selection is unchanged (the stale write did not apply).
    after = await client.get(
        f"/api/v1/projects/{scn.project_id}/monitored-urls", headers=headers
    )
    assert after.status_code == 200
    after_body = after.json()
    assert after_body["selection_version"] == 1
    assert {row["site_url_id"] for row in after_body["monitored_urls"]} == set(
        url_ids[:2]
    )
