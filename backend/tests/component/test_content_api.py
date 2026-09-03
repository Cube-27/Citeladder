"""Retained Content contract: grounded generation, durable queue, provenance."""

from __future__ import annotations

import json
import uuid

import httpx
import pytest
from pydantic import SecretStr
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config.content import (
    CONTENT_GENERATOR_VERSION,
    CONTENT_SKILL_REGISTRY,
    content_settings,
)
from app.core.config.task_queue import (
    TASK_STATUS_CANCELLED,
    TASK_STATUS_FAILED,
    TASK_STATUS_SUCCEEDED,
)
from app.models.content import ContentGeneration, ContentGenerationAttempt
from app.models.project import Project
from app.workers.content_worker import ContentWorker

_CANARY_SECRET = "never-a-real-provider-secret"
_FIXTURE_MODEL = "fixture-model"
_CONTEXT = {
    "version": "content-context-v1",
    "brand_block": "BRAND\nName: Acme",
    "target_page_block": "",
    "issue_block": "",
    "related_site_block": ("RELATED SITE CONTEXT\n\nSOURCE: https://acme.test/"),
    "summary": {
        "crawl_page_count": 1,
        "crawl_urls": ["https://acme.test/"],
        "crawl_completed_at": "2026-07-15T00:00:00Z",
        "brand_memory": True,
        "brand_fields": ["description"],
        "target_url": None,
        "issue_count": 0,
        "related_page_count": 1,
        "opportunity_id": None,
        "selection_policy_version": "crawl-fragment-selection-2",
        "omissions": [],
    },
}


@pytest.fixture(autouse=True)
def _configured_provider(monkeypatch: pytest.MonkeyPatch) -> None:
    # Tests disable dotenv globally. This additionally pins an unresolvable
    # endpoint and an in-memory MockTransport, so no provider can be contacted.
    monkeypatch.setattr(content_settings, "provider", "mistral")
    monkeypatch.setattr(content_settings, "api_key", SecretStr(_CANARY_SECRET))
    monkeypatch.setattr(
        content_settings, "endpoint", "https://provider.invalid/v1/chat/completions"
    )
    monkeypatch.setattr(content_settings, "model", _FIXTURE_MODEL)


async def _register(client: httpx.AsyncClient, email: str) -> None:
    assert (
        await client.post(
            "/api/v1/auth/register", json={"email": email, "password": "password123"}
        )
    ).status_code == 202
    assert (
        await client.post(
            "/api/v1/auth/login", json={"email": email, "password": "password123"}
        )
    ).status_code == 200


async def _create_project(
    client: httpx.AsyncClient, *, name: str = "Content Project"
) -> str:
    response = await client.post(
        "/api/v1/projects",
        json={
            "name": name,
            "brand_name": "Acme",
            "website_url": "https://acme.example",
            "country_code": "AU",
            "language_code": "en-AU",
            "benchmark_mode": "consumer_like",
            "default_repetitions": 1,
        },
    )
    assert response.status_code == 201
    return response.json()["id"]


async def _seed_generation(
    session_factory: async_sessionmaker[AsyncSession], project_id: str
) -> str:
    async with session_factory() as session:
        project = await session.get(Project, uuid.UUID(project_id))
        assert project is not None
        row = ContentGeneration(
            workspace_id=project.workspace_id,
            project_id=project.id,
            user_instruction="Write an Acme page.",
            skill_id="article",
            skill_version=1,
            context_status="included",
            context_snapshot=_CONTEXT,
            request_fingerprint="a" * 64,
            idempotency_key=str(uuid.uuid4()),
            provider="mistral",
            requested_model=content_settings.resolved_model,
            generator_version="content-v3",
        )
        session.add(row)
        await session.commit()
        return str(row.id)


def _worker(
    session_factory: async_sessionmaker[AsyncSession], transport: httpx.MockTransport
) -> ContentWorker:
    return ContentWorker(
        session_factory=session_factory, owner="content-test", transport=transport
    )


def _transport(
    *,
    status: int = 200,
    content: str = "# Acme\n\nGrounded page.",
    seen: list[httpx.Request] | None = None,
) -> httpx.MockTransport:
    def handler(request: httpx.Request) -> httpx.Response:
        if seen is not None:
            seen.append(request)
        if status >= 400:
            return httpx.Response(status, json={"error": "boom"})
        return httpx.Response(
            200,
            json={
                "model": _FIXTURE_MODEL,
                "choices": [{"message": {"content": content}, "finish_reason": "stop"}],
                "usage": {"total_tokens": 30},
            },
        )

    return httpx.MockTransport(handler)


async def test_enqueue_without_a_crawl_still_grounds_on_brand_context(
    client: httpx.AsyncClient,
) -> None:
    """A project with no crawl is not an error state: the brand context it
    already has is enough to generate, and the summary says so plainly."""
    await _register(client, "content-context@example.com")
    project_id = await _create_project(client)
    response = await client.post(
        "/api/v1/content/generations",
        json={"project_id": project_id, "user_instruction": "Write a page."},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["context_status"] == "included"
    assert body["context_summary"]["crawl_page_count"] == 0
    assert body["context_summary"]["brand_memory"] is True
    assert body["context_summary"]["related_page_count"] == 0
    for path in ("strategy", "inventory", "briefs", "revisions", "verifications"):
        assert (
            await client.get(
                f"/api/v1/content/{path}", params={"project_id": project_id}
            )
        ).status_code == 404


async def test_context_preview_uses_canonical_compact_summary(
    client: httpx.AsyncClient,
) -> None:
    await _register(client, "content-preview@example.com")
    project_id = await _create_project(client)

    response = await client.get(
        "/api/v1/content/context-preview", params={"project_id": project_id}
    )

    assert response.status_code == 200
    assert response.json() == {
        "brand_memory": True,
        "target_page": None,
        "issue_count": 0,
        "related_page_count": 0,
    }


async def test_target_page_picker_read_is_bounded_and_workspace_scoped(
    client: httpx.AsyncClient,
) -> None:
    await _register(client, "content-target-pages@example.com")
    project_id = await _create_project(client)

    response = await client.get(
        "/api/v1/content/target-pages",
        params={"project_id": project_id, "query": "pricing"},
    )
    assert response.status_code == 200
    assert response.json() == []

    client.cookies.clear()
    await _register(client, "content-target-pages-outsider@example.com")
    hidden = await client.get(
        "/api/v1/content/target-pages", params={"project_id": project_id}
    )
    assert hidden.status_code == 404


async def test_worker_preserves_frozen_context_and_attempt_provenance(
    client: httpx.AsyncClient, session_factory: async_sessionmaker[AsyncSession]
) -> None:
    await _register(client, "content-worker@example.com")
    generation_id = await _seed_generation(
        session_factory, await _create_project(client)
    )
    seen: list[httpx.Request] = []
    assert await _worker(session_factory, _transport(seen=seen)).run_until_idle() == 1

    detail = (await client.get(f"/api/v1/content/generations/{generation_id}")).json()
    assert detail["status"] == TASK_STATUS_SUCCEEDED
    assert detail["context_summary"]["crawl_page_count"] == 1
    assert detail["context_summary"]["crawl_urls"] == ["https://acme.test/"]
    assert detail["output_text"].startswith("# Acme")
    assert _CANARY_SECRET not in json.dumps(detail)
    assert seen[0].url.host == "provider.invalid"
    assert seen[0].headers["authorization"] == f"Bearer {_CANARY_SECRET}"
    sent_messages = json.loads(seen[0].content)["messages"]
    assert len(sent_messages) == 3
    assert sent_messages[-1]["content"].startswith("REFERENCE MATERIAL")
    # Publishable copy carries no citation machinery.
    assert "[[source:" not in detail["output_text"]

    async with session_factory() as session:
        attempts = (
            await session.scalars(
                select(ContentGenerationAttempt).where(
                    ContentGenerationAttempt.content_generation_id
                    == uuid.UUID(generation_id)
                )
            )
        ).all()
    assert [(attempt.attempt_number, attempt.status) for attempt in attempts] == [
        (1, "succeeded")
    ]


async def test_worker_failure_and_cancel_keep_results_immutable(
    client: httpx.AsyncClient, session_factory: async_sessionmaker[AsyncSession]
) -> None:
    await _register(client, "content-terminal@example.com")
    project_id = await _create_project(client)
    failed_id = await _seed_generation(session_factory, project_id)
    await _worker(session_factory, _transport(status=401)).run_until_idle()
    failed = (await client.get(f"/api/v1/content/generations/{failed_id}")).json()
    assert (failed["status"], failed["error_code"], failed["output_text"]) == (
        TASK_STATUS_FAILED,
        "auth_failure",
        None,
    )

    cancelled_id = await _seed_generation(session_factory, project_id)
    cancelled = await client.post(f"/api/v1/content/generations/{cancelled_id}/cancel")
    assert cancelled.json()["status"] == TASK_STATUS_CANCELLED
    repeated = await client.post(f"/api/v1/content/generations/{cancelled_id}/cancel")
    assert repeated.status_code == 409
    assert repeated.json()["detail"] == "cancel_not_allowed"
    assert repeated.json()["error"]["code"] == "cancel_not_allowed"
    assert repeated.json()["error"]["message"] == (
        "This content generation can no longer be cancelled"
    )
    assert await _worker(session_factory, _transport()).run_until_idle() == 0
    assert (await client.get(f"/api/v1/content/generations/{cancelled_id}")).json()[
        "output_text"
    ] is None


async def test_read_actions_and_workspace_isolation(
    client: httpx.AsyncClient, session_factory: async_sessionmaker[AsyncSession]
) -> None:
    await _register(client, "content-owner@example.com")
    project_id = await _create_project(client)
    generation_id = await _seed_generation(session_factory, project_id)
    listed = await client.get(
        "/api/v1/content/generations", params={"project_id": project_id}
    )
    assert listed.status_code == 200
    assert listed.json()[0]["id"] == generation_id
    assert "output_text" not in listed.json()[0]

    client.cookies.clear()
    await _register(client, "content-outsider@example.com")
    for path in (
        f"/api/v1/content/generations/{generation_id}",
        f"/api/v1/content/generations/{generation_id}/cancel",
    ):
        response = (
            await client.get(path)
            if path.endswith(generation_id)
            else await client.post(path)
        )
        assert response.status_code == 404
    assert (
        await client.delete(f"/api/v1/content/generations/{generation_id}")
    ).status_code == 404
    assert (
        await client.delete(
            "/api/v1/content/generations", params={"project_id": project_id}
        )
    ).status_code == 404


async def test_skill_catalog_is_served_and_drives_enqueue_validation(
    client: httpx.AsyncClient,
) -> None:
    # The catalog is the frontend's only source of skill ids, so it must be
    # readable, ordered, and consistent with what enqueue will accept.
    assert (await client.get("/api/v1/content/skills")).status_code == 401

    await _register(client, "content-skills@example.com")
    response = await client.get("/api/v1/content/skills")
    assert response.status_code == 200
    body = response.json()
    assert body["default_skill_id"] == "content_page"

    skills = body["skills"]
    ids = [skill["id"] for skill in skills]
    assert ids[0] == "content_page"
    assert len(ids) == 18
    assert "product_page" in ids
    # The picker receives file metadata but never the authored prompt body.
    for skill in skills:
        assert skill["description"]
        assert "body" not in skill

    project_id = await _create_project(client)
    accepted = await client.post(
        "/api/v1/content/generations",
        json={
            "project_id": project_id,
            "user_instruction": "Write a post.",
            "skill_id": "linkedin",
        },
    )
    assert accepted.status_code == 201
    body = accepted.json()
    assert body["skill_id"] == "linkedin"
    assert body["skill_version"] == CONTENT_SKILL_REGISTRY["linkedin"].version
    assert body["generator_version"] == CONTENT_GENERATOR_VERSION

    rejected = await client.post(
        "/api/v1/content/generations",
        json={
            "project_id": project_id,
            "user_instruction": "Write a post.",
            "skill_id": "nope",
        },
    )
    assert rejected.status_code == 422


async def test_delete_terminal_generation_cascades_attempts_and_rejects_active_work(
    client: httpx.AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    await _register(client, "content-delete@example.com")
    project_id = await _create_project(client)
    terminal_id = uuid.UUID(await _seed_generation(session_factory, project_id))
    active_id = uuid.UUID(await _seed_generation(session_factory, project_id))
    async with session_factory() as session:
        terminal = await session.get(ContentGeneration, terminal_id)
        assert terminal is not None
        terminal.status = TASK_STATUS_SUCCEEDED
        session.add(
            ContentGenerationAttempt(
                content_generation_id=terminal_id,
                attempt_number=1,
                status="succeeded",
            )
        )
        await session.commit()

    active = await client.delete(f"/api/v1/content/generations/{active_id}")
    assert active.status_code == 409
    assert active.json()["error"]["code"] == "delete_not_allowed"

    deleted = await client.delete(f"/api/v1/content/generations/{terminal_id}")
    assert deleted.status_code == 204
    assert (
        await client.get(f"/api/v1/content/generations/{terminal_id}")
    ).status_code == 404
    async with session_factory() as session:
        assert await session.get(ContentGeneration, terminal_id) is None
        attempts = await session.scalars(
            select(ContentGenerationAttempt).where(
                ContentGenerationAttempt.content_generation_id == terminal_id
            )
        )
        assert attempts.all() == []


async def test_clear_history_removes_only_terminal_rows_for_the_authorized_project(
    client: httpx.AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    await _register(client, "content-clear@example.com")
    project_id = await _create_project(client)
    other_project_id = await _create_project(client, name="Other Content Project")
    terminal_ids = [
        uuid.UUID(await _seed_generation(session_factory, project_id)) for _ in range(3)
    ]
    active_id = uuid.UUID(await _seed_generation(session_factory, project_id))
    other_project_terminal_id = uuid.UUID(
        await _seed_generation(session_factory, other_project_id)
    )
    async with session_factory() as session:
        for generation_id, status in zip(
            terminal_ids,
            (TASK_STATUS_SUCCEEDED, TASK_STATUS_FAILED, TASK_STATUS_CANCELLED),
            strict=True,
        ):
            terminal = await session.get(ContentGeneration, generation_id)
            assert terminal is not None
            terminal.status = status
        other_terminal = await session.get(ContentGeneration, other_project_terminal_id)
        assert other_terminal is not None
        other_terminal.status = TASK_STATUS_SUCCEEDED
        await session.commit()

    response = await client.delete(
        "/api/v1/content/generations", params={"project_id": project_id}
    )
    assert response.status_code == 204
    listed = await client.get(
        "/api/v1/content/generations", params={"project_id": project_id}
    )
    assert listed.status_code == 200
    assert [item["id"] for item in listed.json()] == [str(active_id)]
    other_listed = await client.get(
        "/api/v1/content/generations", params={"project_id": other_project_id}
    )
    assert [item["id"] for item in other_listed.json()] == [
        str(other_project_terminal_id)
    ]
    async with session_factory() as session:
        for generation_id in terminal_ids:
            assert await session.get(ContentGeneration, generation_id) is None
        assert await session.get(ContentGeneration, active_id) is not None
        assert (
            await session.get(ContentGeneration, other_project_terminal_id)
        ) is not None


@pytest.mark.asyncio
async def test_try_again_stamps_the_version_that_rendered_it(
    client: httpx.AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A retry's provenance must describe the pack it actually used.

    ``try_again`` reuses the source's frozen context but rebuilds the messages
    from whatever skill pack is deployed now. It used to copy the SOURCE row's
    ``skill_version`` onto that new row, so a retry rendered from a changed
    pack claimed the old version — and because ``message_digest`` is computed
    over the messages actually built, the record was self-consistent and no
    check could catch it. The seeded row carries a deliberately stale version
    to stand in for that drift.
    """
    monkeypatch.setattr(
        content_settings, "api_key", SecretStr(_CANARY_SECRET), raising=False
    )
    await _register(client, "content-retry-provenance@example.com")
    project_id = await _create_project(client)
    generation_id = await _seed_generation(session_factory, project_id)

    async with session_factory() as session:
        source = await session.get(ContentGeneration, uuid.UUID(generation_id))
        assert source is not None
        # The stale value the retry must NOT inherit.
        assert source.skill_version == 1
        source.status = TASK_STATUS_SUCCEEDED
        await session.commit()

    retried = await client.post(
        f"/api/v1/content/generations/{generation_id}/try-again"
    )
    assert retried.status_code == 201
    body = retried.json()

    assert body["skill_id"] == "article"
    assert body["skill_version"] == CONTENT_SKILL_REGISTRY["article"].version

    # The source row is never mutated by a retry.
    async with session_factory() as session:
        source = await session.get(ContentGeneration, uuid.UUID(generation_id))
        assert source is not None
        assert source.skill_version == 1
