"""Subtopics: one level of nesting within a project (prompt generation v2)."""

from __future__ import annotations

import uuid

import httpx
import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config.entitlements import KEY_PROJECT_SLOTS
from app.domain.entitlements.types import GrantSpec
from tests.component.occupancy_helpers import seed_occupancy_grants
from tests.component.prompt_generation_helpers import (
    make_project_and_set,
    project_payload,
)


async def _topic(
    client: httpx.AsyncClient, project_id: str, name: str, parent_id: str | None = None
) -> httpx.Response:
    body: dict[str, str] = {"name": name}
    if parent_id is not None:
        body["parent_id"] = parent_id
    return await client.post(f"/api/v1/projects/{project_id}/topics", json=body)


@pytest.mark.asyncio
async def test_subtopic_nesting_is_one_level_and_parent_delete_promotes(
    client: httpx.AsyncClient,
) -> None:
    project, _ = await make_project_and_set(
        client, "subtopic1@example.com", create_default_topic=False
    )
    project_id = project["id"]
    parent = (await _topic(client, project_id, "Footwear")).json()
    child = await _topic(client, project_id, "Trail shoes", parent["id"])
    assert child.status_code == 201
    assert child.json()["parent_id"] == parent["id"]

    grandchild = await _topic(client, project_id, "Waterproof", child.json()["id"])
    assert grandchild.status_code == 422

    # A topic with subtopics cannot itself become a subtopic.
    other = (await _topic(client, project_id, "Apparel")).json()
    nested_parent = await client.patch(
        f"/api/v1/topics/{parent['id']}", json={"parent_id": other["id"]}
    )
    assert nested_parent.status_code == 422
    self_parent = await client.patch(
        f"/api/v1/topics/{other['id']}", json={"parent_id": other["id"]}
    )
    assert self_parent.status_code == 422

    promoted = await client.patch(
        f"/api/v1/topics/{child.json()['id']}", json={"parent_id": None}
    )
    assert promoted.status_code == 200
    assert promoted.json()["parent_id"] is None

    moved = await client.patch(
        f"/api/v1/topics/{child.json()['id']}", json={"parent_id": other["id"]}
    )
    assert moved.json()["parent_id"] == other["id"]
    assert (await client.delete(f"/api/v1/topics/{other['id']}")).status_code == 204
    remaining = (await client.get(f"/api/v1/projects/{project_id}/topics")).json()
    assert {t["name"]: t["parent_id"] for t in remaining} == {
        "Footwear": None,
        "Trail shoes": None,
    }


@pytest.mark.asyncio
async def test_subtopic_parent_must_belong_to_the_same_project(
    client: httpx.AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    project_a, _ = await make_project_and_set(
        client, "subtopic2@example.com", create_default_topic=False
    )
    async with session_factory() as session:
        await seed_occupancy_grants(
            session,
            workspace_id=uuid.UUID(project_a["workspace_id"]),
            grants=(GrantSpec(key=KEY_PROJECT_SLOTS, value=1),),
        )
        await session.commit()
    project_b = (
        await client.post(
            "/api/v1/projects",
            json=project_payload(
                name="B", brand_name="Beta", website_url="https://beta.example"
            ),
        )
    ).json()
    foreign_parent = (await _topic(client, project_b["id"], "Elsewhere")).json()

    created = await _topic(client, project_a["id"], "Local", foreign_parent["id"])
    assert created.status_code == 404
    local = (await _topic(client, project_a["id"], "Local")).json()
    patched = await client.patch(
        f"/api/v1/topics/{local['id']}", json={"parent_id": foreign_parent["id"]}
    )
    assert patched.status_code == 404
