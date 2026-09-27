"""Component tests for the Python-served Action routes (flat /api/v1 surface).

The Opportunity catalog, recompute, summary, history, order and exports are
TypeScript routes (migration PR 7a, ``opportunity-refresh.test.ts``).
"""

from __future__ import annotations

import uuid

import httpx
import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from tests.component.auth_helpers import register_and_login
from tests.component.opportunity_helpers import (
    Scenario,
    _seed_scenario,
    seed_live_set,
)

pytestmark = pytest.mark.asyncio

_EMAIL = "opp@example.com"


async def _register(client: httpx.AsyncClient, email: str = _EMAIL) -> None:
    await register_and_login(client, email)


def _headers(scn: Scenario) -> dict[str, str]:
    return {"X-Workspace-Id": str(scn.workspace_id)}


async def _seed_and_refresh(
    client: httpx.AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> tuple[Scenario, str]:
    await _register(client)
    async with session_factory() as session:
        scn = await _seed_scenario(session, email=_EMAIL)
        rows = await seed_live_set(session, scn)
    return scn, str(rows["thin_content"].action_id)


async def test_unauthenticated_requests_401(client: httpx.AsyncClient) -> None:
    assert (
        await client.patch(
            f"/api/v1/actions/{uuid.uuid4()}", json={"status": "dismissed"}
        )
    ).status_code == 401
    assert (
        await client.get(f"/api/v1/projects/{uuid.uuid4()}/actions")
    ).status_code == 401


async def test_action_status_patch_200_422_404(
    client: httpx.AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    scn, action_id = await _seed_and_refresh(client, session_factory)
    url = f"/api/v1/actions/{action_id}"

    patched = await client.patch(
        url, headers=_headers(scn), json={"status": "dismissed"}
    )
    assert patched.status_code == 200
    assert patched.json()["status"] == "dismissed"
    actions_url = f"/api/v1/projects/{scn.project_id}/actions"
    queue = (await client.get(actions_url, headers=_headers(scn))).json()
    assert action_id not in {item["id"] for item in queue["items"]}
    assert queue["status_counts"]["dismissed"] == 1
    filtered = await client.get(
        f"{actions_url}?status=dismissed", headers=_headers(scn)
    )
    assert [item["id"] for item in filtered.json()["items"]] == [action_id]

    # Derived/declared states, unknown keys and unknown tokens are 422; a
    # missing Action is 404.
    for body in (
        {"status": "in_progress"},
        {"status": "bogus"},
        {"status": "open", "priority_score": 1},
    ):
        assert (
            await client.patch(url, headers=_headers(scn), json=body)
        ).status_code == 422
    assert (
        await client.get(f"{actions_url}?target_kind=bogus", headers=_headers(scn))
    ).status_code == 422
    assert (
        await client.patch(
            f"/api/v1/actions/{uuid.uuid4()}",
            headers=_headers(scn),
            json={"status": "open"},
        )
    ).status_code == 404
