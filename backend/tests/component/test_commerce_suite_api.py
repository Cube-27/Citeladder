from __future__ import annotations

import uuid
from typing import Any

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.connectors.agent.gateway import FakeModelGateway
from app.connectors.answer_engines.errors import ProviderError
from app.core.config.provider_catalog import ERROR_SERVER
from app.domain.commerce.prompts import (
    BuyerPromptGenerationUnavailable,
    _project_with_brand,
    _target_context,
    _target_vocabulary,
    add_manual_buyer_prompt,
    generate_buyer_prompts,
)
from app.domain.commerce.schemas import CommerceTarget
from app.domain.commerce.service import CommerceNotFoundError
from app.domain.prompts.topical_binding import binding_tokens
from app.models.commerce import CommerceCategory
from app.models.project import Project
from app.models.prompt import Prompt, Topic
from tests.component.auth_helpers import register_and_login as _register
from tests.component.commerce_helpers import seed_catalog


async def _project(client: httpx.AsyncClient) -> dict:
    response = await client.post(
        "/api/v1/projects",
        json={"name": "Commerce", "brand_name": "Acme", "competitors": []},
    )
    assert response.status_code == 201
    return response.json()


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


@pytest.mark.asyncio
async def test_a_category_target_carries_the_shop_not_just_its_own_name(
    client: httpx.AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """A category used to be sent to the model as nothing but its name.

    Handed the bare word "ACCESORIES" -- no brand, no vertical, no products,
    not even the collection URL -- the model wrote what generic e-commerce
    training data says accessories are: phone cases, screen protectors, laptop
    sleeves. For a linen-fashion label. It was not leaking examples; it had no
    way to know what the shop sold, and the topicality gate now has nothing to
    judge against either unless this context is populated.
    """
    await _register(client, "commerce-context@example.com")
    project = await _project(client)
    project_id = uuid.UUID(project["id"])

    await seed_catalog(
        session_factory,
        project["id"],
        [
            {
                "canonical_url": "https://shop.example/products/midi",
                "name": "Bubble Linen Dress",
                "brand": "Acme",
                "price": "240.00",
                "currency": "USD",
                "sku": "L-1",
                "category": "ACCESORIES",
            },
            {
                "canonical_url": "https://shop.example/products/scarf",
                "name": "Silk Linen Scarf",
                "brand": "Acme",
                "price": "90.00",
                "currency": "USD",
                "sku": "L-2",
                "category": "ACCESORIES",
            },
        ],
    )

    async with session_factory() as session:
        category = await session.scalar(
            select(CommerceCategory).where(
                CommerceCategory.project_id == project_id,
                CommerceCategory.normalized_name == "accesories",
            )
        )
        assert category is not None
        loaded = await _project_with_brand(
            session, workspace_id=category.workspace_id, project_id=project_id
        )
        context = await _target_context(
            session,
            workspace_id=category.workspace_id,
            project_id=project_id,
            target=CommerceTarget(kind="category", id=category.id),
            project=loaded,
        )

    assert context["brand"] == "Acme"
    assert set(context["products_on_this_shelf"]) == {
        "Bubble Linen Dress",
        "Silk Linen Scarf",
    }
    # And that context is what the topicality gate judges against, so an
    # off-vertical prompt for this shelf is now rejectable.
    vocabulary = _target_vocabulary(context)
    assert "linen" in vocabulary
    assert not (vocabulary & binding_tokens("phone case with magsafe for iphone"))


@pytest.mark.asyncio
async def test_a_manual_buyer_prompt_can_be_added_to_a_category(
    client: httpx.AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """The manual path shares the target lookup with generation.

    It calls `_target_context` purely to 404 an unknown target before writing,
    so when that helper grew a required `project` argument this raised
    TypeError on every manual prompt -- a path with no test to catch it.
    """
    await _register(client, "commerce-manual@example.com")
    project = await _project(client)
    project_id = uuid.UUID(project["id"])

    await seed_catalog(
        session_factory,
        project["id"],
        [
            {
                "canonical_url": "https://shop.example/products/midi",
                "name": "Bubble Linen Dress",
                "brand": "Acme",
                "price": "240.00",
                "currency": "USD",
                "sku": "L-1",
                "category": "DRESSES",
            }
        ],
    )

    async with session_factory() as session:
        category = await session.scalar(
            select(CommerceCategory).where(
                CommerceCategory.project_id == project_id,
                CommerceCategory.normalized_name == "dresses",
            )
        )
        assert category is not None
        workspace_id, category_id = category.workspace_id, category.id

        created = await add_manual_buyer_prompt(
            session,
            workspace_id=workspace_id,
            project_id=project_id,
            target=CommerceTarget(kind="category", id=category_id),
            text="  linen midi dress for a beach wedding  ",
        )
        topic = await session.scalar(
            select(Topic)
            .join(Prompt, Prompt.topic_id == Topic.id)
            .where(Prompt.id == created.id)
        )

    assert created.text == "linen midi dress for a beach wedding"
    assert created.enabled is False
    assert created.target.id == category_id
    assert topic is not None
    assert topic.name == "DRESSES"


@pytest.mark.asyncio
async def test_a_manual_buyer_prompt_rejects_an_unknown_target(
    client: httpx.AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    await _register(client, "commerce-manual-404@example.com")
    project = await _project(client)
    project_id = uuid.UUID(project["id"])

    async with session_factory() as session:
        workspace_id = await session.scalar(
            select(Project.workspace_id).where(Project.id == project_id)
        )
        assert workspace_id is not None
        with pytest.raises(CommerceNotFoundError):
            await add_manual_buyer_prompt(
                session,
                workspace_id=workspace_id,
                project_id=project_id,
                target=CommerceTarget(kind="category", id=uuid.uuid4()),
                text="linen midi dress for a beach wedding",
            )


@pytest.mark.asyncio
async def test_buyer_prompt_provider_failure_is_service_unavailable(
    client: httpx.AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    class UnavailableGateway(FakeModelGateway):
        async def complete_structured_json(
            self,
            *,
            system: str,
            user: str,
            schema_name: str,
            schema: dict[str, Any],
        ) -> str:
            self.calls.append(
                {
                    "system": system,
                    "user": user,
                    "schema_name": schema_name,
                    "schema": schema,
                }
            )
            raise ProviderError(
                "provider unavailable", error_code=ERROR_SERVER, retryable=True
            )

    await _register(client, "commerce-provider-error@example.com")
    project = await _project(client)
    product_ids = await seed_catalog(
        session_factory,
        project["id"],
        [
            {
                "canonical_url": "https://shop.example/products/one",
                "name": "Acme One",
                "brand": "Acme",
                "category": "Shoes",
            }
        ],
    )
    product_id = product_ids[0]
    monkeypatch.setattr(
        "app.api.commerce.create_model_gateway", lambda: UnavailableGateway()
    )

    response = await client.post(
        f"/api/v1/projects/{project['id']}/commerce/buyer-prompts/generate",
        json={"targets": [{"kind": "product", "id": product_id}], "count": 2},
    )

    assert response.status_code == 503
    assert response.json()["error"]["code"] == "commerce_prompt_generation_unavailable"


@pytest.mark.asyncio
async def test_buyer_prompt_generation_charges_each_target_and_bounds_fanout(
    client: httpx.AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    await _register(client, "commerce-quota@example.com")
    project = await _project(client)
    calls: list[int] = []

    async def capture_limit(*_args, **kwargs):
        calls.append(kwargs["amount"])

    async def generate(*_args, **_kwargs):
        return []

    monkeypatch.setattr(
        "app.api.commerce.create_model_gateway", lambda: FakeModelGateway()
    )
    monkeypatch.setattr("app.api.commerce.enforce_workspace_request", capture_limit)
    monkeypatch.setattr("app.api.commerce.generate_buyer_prompts", generate)
    url = f"/api/v1/projects/{project['id']}/commerce/buyer-prompts/generate"
    missing_target = {"kind": "product", "id": str(uuid.uuid4())}
    missing = await client.post(url, json={"targets": [missing_target], "count": 2})
    assert missing.status_code == 404
    assert calls == []
    product_ids = await seed_catalog(
        session_factory,
        project["id"],
        [
            {
                "canonical_url": "https://shop.example/products/one",
                "name": "Acme One",
                "brand": "Acme",
                "category": "Shoes",
            }
        ],
    )
    target = {
        "kind": "product",
        "id": product_ids[0],
    }
    valid = await client.post(url, json={"targets": [target, target], "count": 2})
    assert valid.status_code == 201
    assert calls == [2]
    rejected = await client.post(url, json={"targets": [target] * 11, "count": 2})
    assert rejected.status_code == 422
    assert calls == [2]


@pytest.mark.asyncio
async def test_buyer_prompt_model_call_has_no_open_read_transaction(
    client: httpx.AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    await _register(client, "commerce-transaction@example.com")
    project = await _project(client)
    product_ids = await seed_catalog(
        session_factory,
        project["id"],
        [
            {
                "canonical_url": "https://shop.example/products/one",
                "name": "Acme One",
                "brand": "Acme",
                "category": "Shoes",
            }
        ],
    )
    target = CommerceTarget(kind="product", id=uuid.UUID(product_ids[0]))
    async with session_factory() as session:
        project_row = await session.get(Project, uuid.UUID(project["id"]))
        assert project_row is not None

        class FailingGateway(FakeModelGateway):
            async def complete_structured_json(self, **_kwargs):
                assert not session.in_transaction()
                raise ProviderError(
                    "probe failed", error_code=ERROR_SERVER, retryable=True
                )

        gateway = FailingGateway()
        with pytest.raises(BuyerPromptGenerationUnavailable):
            await generate_buyer_prompts(
                session,
                workspace_id=project_row.workspace_id,
                project_id=project_row.id,
                targets=[target],
                count=2,
                gateway=gateway,
            )
