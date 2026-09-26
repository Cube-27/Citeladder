"""Editable business map: provenance-preserving edits under the brand profile."""

from __future__ import annotations

import uuid

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models.brand import BrandProfile
from tests.component.prompt_generation_helpers import make_project_and_set

_SUGGESTION = {
    "value": "waterproof",
    "origin": "model",
    "review_state": "suggested",
    "source": {"transport_model": "fake-model"},
}


async def _seed_suggestion(
    session_factory: async_sessionmaker[AsyncSession], project_id: str
) -> None:
    async with session_factory() as session:
        profile = await session.scalar(
            select(BrandProfile).where(BrandProfile.project_id == uuid.UUID(project_id))
        )
        assert profile is not None
        profile.business_context = {
            **(profile.business_context or {}),
            "category": "footwear",
            "business_map": {
                "offerings": [
                    {"offering": "running shoes", "attributes": [_SUGGESTION]}
                ]
            },
        }
        await session.commit()


@pytest.mark.asyncio
async def test_business_map_edits_keep_suggestion_provenance(
    client: httpx.AsyncClient, session_factory: async_sessionmaker[AsyncSession]
) -> None:
    project, _ = await make_project_and_set(client, "map1@example.com")
    url = f"/api/v1/projects/{project['id']}/business-map"
    await _seed_suggestion(session_factory, project["id"])

    shown = (await client.get(url)).json()
    assert shown["available_offerings"] == ["running shoes"]
    assert shown["offerings"][0]["attributes"][0]["review_state"] == "suggested"

    # Keeping the suggestion unreviewed while adding a manual fact.
    kept = await client.put(
        url,
        json={
            "offerings": [
                {
                    "offering": "Running Shoes",
                    "attributes": [
                        {"value": "waterproof", "review_state": "suggested"},
                        {"value": "wide fit", "review_state": "suggested"},
                    ],
                    "situations": [{"value": "wet trails"}],
                    "exclusions": [{"first": "wide fit", "second": "wet trails"}],
                }
            ]
        },
    )
    assert kept.status_code == 200
    offering = kept.json()["offerings"][0]
    assert offering["offering"] == "running shoes"
    waterproof, wide_fit = offering["attributes"]
    assert (waterproof["origin"], waterproof["review_state"]) == ("model", "suggested")
    # A new entry is a confirmed manual fact, whatever the request asked.
    assert (wide_fit["origin"], wide_fit["review_state"]) == ("manual", "confirmed")
    assert wide_fit["reviewed_by"] is not None

    confirmed = await client.put(
        url,
        json={
            "offerings": [
                {
                    "offering": "running shoes",
                    "attributes": [{"value": "Waterproof"}],
                }
            ]
        },
    )
    (entry,) = confirmed.json()["offerings"][0]["attributes"]
    assert (entry["origin"], entry["review_state"]) == ("model", "confirmed")
    assert entry["source"] == {"transport_model": "fake-model"}
    assert entry["reviewed_at"] is not None

    # Only the map key changed; other persisted facts are untouched.
    async with session_factory() as session:
        profile = await session.scalar(
            select(BrandProfile).where(
                BrandProfile.project_id == uuid.UUID(project["id"])
            )
        )
        assert profile is not None
        assert profile.business_context["category"] == "footwear"


@pytest.mark.asyncio
async def test_business_map_rejects_unknown_offerings_and_dangling_exclusions(
    client: httpx.AsyncClient,
) -> None:
    project, _ = await make_project_and_set(client, "map2@example.com")
    url = f"/api/v1/projects/{project['id']}/business-map"

    unknown = await client.put(url, json={"offerings": [{"offering": "laptops"}]})
    assert unknown.status_code == 422
    dangling = await client.put(
        url,
        json={
            "offerings": [
                {
                    "offering": "running shoes",
                    "attributes": [{"value": "light"}],
                    "exclusions": [{"first": "light", "second": "heavy"}],
                }
            ]
        },
    )
    assert dangling.status_code == 422
    assert (await client.get(url)).json()["offerings"] == []


@pytest.mark.asyncio
async def test_business_map_is_workspace_scoped(client: httpx.AsyncClient) -> None:
    project, _ = await make_project_and_set(client, "map-owner@example.com")
    await make_project_and_set(client, "map-other@example.com")
    url = f"/api/v1/projects/{project['id']}/business-map"

    assert (await client.get(url)).status_code == 404
    assert (await client.put(url, json={"offerings": []})).status_code == 404
