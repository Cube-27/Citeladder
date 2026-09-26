"""Atomic, prompt-free project creation and onboarding queue contracts."""

from __future__ import annotations

import asyncio
import uuid
from types import SimpleNamespace

import httpx
import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config.brand_discovery import (
    BRAND_DISCOVERY_QUEUE_SPEC,
    ERROR_BRAND_DISCOVERY,
    LEGACY_DISCOVERY_STATUS_COMPLETING,
    LEGACY_TASK_KIND_BRAND_COMPLETION,
)
from app.core.config.entitlements import KEY_PROJECT_SLOTS, KEY_PROMPT_SLOTS
from app.core.config.task_queue import TASK_STATUS_SUCCEEDED
from app.domain.entitlements.types import GrantSpec
from app.domain.projects.discovery_schemas import BrandDiscoveryComplete
from app.domain.projects.onboarding import completion as onboarding_completion
from app.domain.projects.onboarding import service as onboarding_service
from app.domain.projects.onboarding.site_resolution import (
    ResolvedSite,
    SiteNotFoundError,
)
from app.models.brand import BrandProfile
from app.models.discovery import (
    BrandDiscovery,
    BrandDiscoveryTask,
    BrandResearchSnapshot,
)
from app.models.project import Project
from app.models.prompt import Prompt, PromptSet, Topic
from app.models.site_health.crawl import SiteCrawl
from app.models.workspace import Workspace
from app.orchestration.postgres_task_queue import PostgresTaskQueue
from app.workers import brand_discovery_worker
from tests.component.auth_helpers import register_and_login as _register
from tests.component.occupancy_helpers import seed_occupancy_grants


@pytest.fixture(autouse=True)
def mock_selected_competitor_resolution(monkeypatch: pytest.MonkeyPatch) -> None:
    async def resolve(entered_url: str, normalized_url: str) -> ResolvedSite:
        from app.connectors.web_evidence.url_policy import registrable_domain

        return ResolvedSite(
            entered_url=entered_url,
            canonical_url=normalized_url,
            registrable_domain=registrable_domain(normalized_url),
            status_code=200,
            page=None,
        )

    monkeypatch.setattr(onboarding_completion, "resolve_site", resolve)


def _completion_payload() -> dict:
    return {
        "name": "Acme Visibility",
        "profile": {
            "industry": "Software",
            "business_type": "b2b",
            "positioning": "A workflow analytics platform",
            "products_services": ["analytics software"],
            "target_audience": "enterprise marketing teams",
            "category": "workflow analytics platform",
            "category_terms": ["workflow analytics", "process mining"],
            "business_model": "b2b_saas",
            "market_scope": "global",
            "price_tier": "premium",
            "knowledge_strength": "strong",
        },
        "domains": ["acme.com"],
        "competitors": [{"name": "Globex", "domains": ["globex.com"]}],
    }


async def _seed_ready_discovery(
    session: AsyncSession,
    workspace_id: uuid.UUID,
    topics: list[dict] | None = None,
) -> BrandDiscovery:
    if topics is None:
        topics = [
            {
                "topic_id": str(uuid.uuid4()),
                "name": name,
                "description": "",
                "source_refs": ["nav-1"],
            }
            for name in ("Workflow Analytics", "Process Mining", "Journey Analysis")
        ]
    row = BrandDiscovery(
        workspace_id=workspace_id,
        status="ready",
        stage="review",
        progress={
            "phase": "preparing_review",
            "completed_steps": 3,
            "total_steps": 4,
            "pages_read": 1,
            "competitors_found": 1,
            "prompts_prepared": 0,
            "updated_at": "2026-08-04T00:00:00+00:00",
        },
        input_data={
            "brand_name": "Acme",
            "website_url": "https://acme.com/",
            "industry": "Software",
            "subindustry": "Analytics",
            "primary_market": "US",
            "language_code": "en",
        },
        domains=["acme.com"],
        profile={
            "positioning": "A workflow analytics platform",
            "products_services": ["analytics software"],
            "target_audience": "marketing teams",
        },
        topics=topics,
        idempotency_key=f"discover-{uuid.uuid4()}",
    )
    session.add(row)
    await session.flush()
    session.add(
        BrandResearchSnapshot(
            workspace_id=workspace_id,
            discovery_id=row.id,
            research_version="brand-discovery-v2",
            method="deterministic_fixture",
            extracted_fields={"profile": row.profile},
        )
    )
    return row


@pytest.mark.asyncio
async def test_selected_domain_failure_keeps_review_editable_without_shell(
    client: httpx.AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    await _register(client, "selected-domain-failure@example.com")
    async with session_factory() as session:
        workspace_id = await session.scalar(select(Workspace.id).limit(1))
        assert workspace_id is not None
        await seed_occupancy_grants(
            session,
            workspace_id=workspace_id,
            grants=(
                GrantSpec(key=KEY_PROJECT_SLOTS, value=10),
                GrantSpec(key=KEY_PROMPT_SLOTS, value=100),
            ),
        )
        discovery = await _seed_ready_discovery(session, workspace_id)
        await session.commit()
        discovery_id = discovery.id

    async def fail(_domain: str, _url: str) -> ResolvedSite:
        raise SiteNotFoundError("dns_resolution_failed")

    monkeypatch.setattr(onboarding_completion, "resolve_site", fail)
    response = await client.post(
        f"/api/v1/brand-discoveries/{discovery_id}/complete",
        headers={"Idempotency-Key": "selected-domain-failure"},
        json=_completion_payload(),
    )
    assert response.status_code == 409
    assert response.json()["detail"] == (
        "Could not resolve website for Globex: globex.com"
    )
    async with session_factory() as session:
        persisted = await session.get(BrandDiscovery, discovery_id)
        assert persisted is not None
        assert persisted.status == "ready"
        assert persisted.project_id is None


@pytest.mark.asyncio
async def test_missing_site_persists_stable_blocking_error(
    client: httpx.AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    await _register(client, "discovery-missing@example.com")
    async with session_factory() as session:
        workspace_id = await session.scalar(select(Workspace.id).limit(1))
        assert workspace_id is not None
        discovery = await _seed_ready_discovery(session, workspace_id)
        await session.commit()
        discovery_id = discovery.id

    async def missing(*_args, **_kwargs):
        raise SiteNotFoundError("dns_resolution_failed")

    monkeypatch.setattr(onboarding_service, "resolve_site", missing)
    async with session_factory() as session:
        discovery = await session.get(BrandDiscovery, discovery_id)
        assert discovery is not None
        await onboarding_service.process_discovery(session, discovery)

    async with session_factory() as session:
        persisted = await session.get(BrandDiscovery, discovery_id)
        assert persisted is not None
        assert persisted.status == "failed"
        assert persisted.error_code == "site_not_found"
        assert persisted.warnings == []


@pytest.mark.asyncio
async def test_reaper_fails_active_parent_without_regressing_ready_parent(
    client: httpx.AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    await _register(client, "discovery-reaper@example.com")
    async with session_factory() as session:
        workspace_id = await session.scalar(select(Workspace.id).limit(1))
        assert workspace_id is not None
        discovery = await _seed_ready_discovery(session, workspace_id)
        discovery.status = "running"
        discovery.stage = "research"
        discovery.warnings = ["research_degraded"]
        ready_discovery = await _seed_ready_discovery(session, workspace_id)
        await session.commit()
        discovery_id = discovery.id
        ready_discovery_id = ready_discovery.id

    async def release_expired_detailed(*_args, **_kwargs):
        return SimpleNamespace(failed_parent_ids=(discovery_id, ready_discovery_id))

    async def claim(*_args, **_kwargs):
        return []

    monkeypatch.setattr(
        brand_discovery_worker._queue,
        "release_expired_detailed",
        release_expired_detailed,
    )
    monkeypatch.setattr(brand_discovery_worker._queue, "claim", claim)
    monkeypatch.setattr(brand_discovery_worker, "SessionLocal", session_factory)
    assert await brand_discovery_worker.run_once("reaper-test", reap=True) is False

    async with session_factory() as session:
        persisted = await session.get(BrandDiscovery, discovery_id)
        assert persisted is not None
        assert persisted.status == "failed"
        assert persisted.error_code == ERROR_BRAND_DISCOVERY
        assert persisted.warnings == ["research_degraded"]
        ready_persisted = await session.get(BrandDiscovery, ready_discovery_id)
        assert ready_persisted is not None
        assert ready_persisted.status == "ready"


async def _seed_workspace_with_ready_discovery(
    client: httpx.AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    email: str,
) -> uuid.UUID:
    await _register(client, email)
    async with session_factory() as session:
        workspace_id = await session.scalar(select(Workspace.id).limit(1))
        assert workspace_id is not None
        await seed_occupancy_grants(
            session,
            workspace_id=workspace_id,
            grants=(
                GrantSpec(key=KEY_PROJECT_SLOTS, value=10),
                GrantSpec(key=KEY_PROMPT_SLOTS, value=100),
            ),
        )
        discovery = await _seed_ready_discovery(session, workspace_id)
        await session.commit()
        return discovery.id


async def _assert_empty_project(session: AsyncSession, discovery_id: uuid.UUID) -> None:
    persisted = await session.get(BrandDiscovery, discovery_id)
    assert persisted is not None
    assert persisted.status == "project_created"
    assert persisted.topics == []
    assert persisted.progress["prompts_prepared"] == 0
    assert await session.scalar(select(func.count()).select_from(Project)) == 1
    assert await session.scalar(select(func.count()).select_from(PromptSet)) == 1
    assert await session.scalar(select(func.count()).select_from(Topic)) == 0
    assert await session.scalar(select(func.count()).select_from(Prompt)) == 0


@pytest.mark.asyncio
async def test_completion_creates_an_empty_project_atomically_and_idempotently(
    client: httpx.AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    discovery_id = await _seed_workspace_with_ready_discovery(
        client, session_factory, "complete-owner@example.com"
    )

    # Independent request sessions race on the discovery lock. Both must see
    # the same committed project.
    response, concurrent_replay = await asyncio.gather(
        client.post(
            f"/api/v1/brand-discoveries/{discovery_id}/complete",
            headers={"Idempotency-Key": "complete-1"},
            json=_completion_payload(),
        ),
        client.post(
            f"/api/v1/brand-discoveries/{discovery_id}/complete",
            headers={"Idempotency-Key": "complete-1"},
            json=_completion_payload(),
        ),
    )
    assert response.status_code == 200, response.text
    assert concurrent_replay.status_code == 200, concurrent_replay.text
    accepted = response.json()
    assert accepted["status"] == "project_created"
    assert accepted["project_id"] is not None
    assert accepted["crawl_id"] is None
    assert accepted["warnings"] == []
    assert concurrent_replay.json() == accepted

    replay = await client.post(
        f"/api/v1/brand-discoveries/{discovery_id}/complete",
        headers={"Idempotency-Key": "complete-1"},
        json=_completion_payload(),
    )
    assert replay.status_code == 200
    assert replay.json() == accepted

    conflict = await client.post(
        f"/api/v1/brand-discoveries/{discovery_id}/complete",
        headers={"Idempotency-Key": "different-key"},
        json=_completion_payload(),
    )
    assert conflict.status_code == 409

    async with session_factory() as session:
        await _assert_empty_project(session, discovery_id)
        # Completion queues no background work: nothing is left to do.
        assert (
            await session.scalar(
                select(func.count())
                .select_from(BrandDiscoveryTask)
                .where(BrandDiscoveryTask.discovery_id == discovery_id)
            )
            == 0
        )
        project = await session.scalar(select(Project))
        assert project is not None
        assert project.industry == "Software"
        assert project.subindustry == "Analytics"
        assert project.primary_market == "US"
        profile = await session.scalar(select(BrandProfile))
        assert profile is not None
        # The confirm screen asks what you sell, who buys it and where; the
        # prose fields are not on it. Whatever arrives in them is the model's
        # suggestion, or a default derived from the confirmed category, so it
        # is recorded unreviewed, with no reviewer attributed to a sentence no
        # user was shown.
        assert profile.sources["positioning"]["review_state"] == "unreviewed"
        assert profile.sources["target_audience"]["review_state"] == "unreviewed"
        assert profile.sources["target_audience"]["origin"] == "ai_suggested"
        assert profile.sources["target_audience"].get("reviewed_by") is None
        assert profile.sources["target_audience"].get("reviewed_at") is None
        assert set(profile.source_artifact_ids) == set(profile.sources)
        # The confirmed business context must survive project creation.
        assert profile.business_context["category"] == "workflow analytics platform"
        assert profile.business_context["business_model"] == "b2b_saas"
        assert profile.business_context["market_scope"] == "global"
        assert profile.business_context["buyer_type"] == "b2b"
        assert profile.business_context["field_sources"]["buyer_type"] == "reviewed"
        assert profile.business_context["field_sources"]["primary_market"] == "reviewed"
        assert profile.business_context["field_sources"]["language_code"] == "reviewed"
        assert profile.business_context["price_tier"] == "premium"
        assert profile.business_context["knowledge_strength"] == "strong"
        assert len(set(profile.source_artifact_ids.values())) == 1
        assert (
            await session.scalar(
                select(func.count())
                .select_from(SiteCrawl)
                .where(SiteCrawl.project_id == project.id)
            )
            == 0
        )

    await _register(client, "complete-foreign@example.com")
    foreign = await client.get(f"/api/v1/brand-discoveries/{discovery_id}")
    assert foreign.status_code == 404


@pytest.mark.asyncio
async def test_completion_rolls_back_the_shell_when_finalizing_fails(
    client: httpx.AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    discovery_id = await _seed_workspace_with_ready_discovery(
        client, session_factory, "completion-rollback@example.com"
    )

    def finalize_failure(_row: BrandDiscovery) -> None:
        raise RuntimeError("finalize failed")

    monkeypatch.setattr(
        onboarding_completion, "finalize_project_shell", finalize_failure
    )
    async with session_factory() as session:
        workspace_id = await session.scalar(select(Workspace.id).limit(1))
        assert workspace_id is not None
        with pytest.raises(RuntimeError, match="finalize failed"):
            await onboarding_completion.complete_discovery(
                session,
                workspace_id=workspace_id,
                discovery_id=discovery_id,
                payload=BrandDiscoveryComplete.model_validate(_completion_payload()),
                idempotency_key="completion-rollback",
                reviewer_id=uuid.uuid4(),
            )
        await session.rollback()

    async with session_factory() as session:
        persisted = await session.get(BrandDiscovery, discovery_id)
        assert persisted is not None
        assert persisted.status == "ready"
        assert persisted.project_id is None
        assert await session.scalar(select(func.count()).select_from(Project)) == 0
        assert await session.scalar(select(func.count()).select_from(PromptSet)) == 0


async def _legacy_completing_discovery(
    client: httpx.AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    email: str,
) -> uuid.UUID:
    """A discovery accepted before onboarding stopped generating prompts.

    Its project shell committed with the request; the row was left
    ``completing`` behind a queued ``brand_completion`` task.
    """
    discovery_id = await _seed_workspace_with_ready_discovery(
        client, session_factory, email
    )
    response = await client.post(
        f"/api/v1/brand-discoveries/{discovery_id}/complete",
        headers={"Idempotency-Key": "legacy-key"},
        json=_completion_payload(),
    )
    assert response.status_code == 200, response.text
    async with session_factory() as session:
        row = await session.get(BrandDiscovery, discovery_id)
        assert row is not None
        row.status = LEGACY_DISCOVERY_STATUS_COMPLETING
        row.stage = "generating_prompts"
        session.add(
            BrandDiscoveryTask(
                discovery_id=row.id,
                workspace_id=row.workspace_id,
                task_kind=LEGACY_TASK_KIND_BRAND_COMPLETION,
                idempotency_key=f"brand-completion:{row.id}",
            )
        )
        await session.commit()
    return discovery_id


@pytest.mark.asyncio
async def test_a_legacy_completion_task_finalizes_the_shell_without_prompts(
    client: httpx.AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    discovery_id = await _legacy_completing_discovery(
        client, session_factory, "legacy-task@example.com"
    )
    monkeypatch.setattr(brand_discovery_worker, "SessionLocal", session_factory)
    monkeypatch.setattr(
        brand_discovery_worker,
        "_queue",
        PostgresTaskQueue(session_factory, BRAND_DISCOVERY_QUEUE_SPEC),
    )

    assert await brand_discovery_worker.run_once("legacy-drain") is True

    async with session_factory() as session:
        await _assert_empty_project(session, discovery_id)
        task = await session.scalar(
            select(BrandDiscoveryTask).where(
                BrandDiscoveryTask.discovery_id == discovery_id
            )
        )
        assert task is not None
        assert task.status == TASK_STATUS_SUCCEEDED


@pytest.mark.asyncio
async def test_a_legacy_completing_replay_finalizes_the_shell_without_prompts(
    client: httpx.AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    discovery_id = await _legacy_completing_discovery(
        client, session_factory, "legacy-replay@example.com"
    )

    replay = await client.post(
        f"/api/v1/brand-discoveries/{discovery_id}/complete",
        headers={"Idempotency-Key": "legacy-key"},
        json=_completion_payload(),
    )
    assert replay.status_code == 200, replay.text
    assert replay.json()["status"] == "project_created"
    async with session_factory() as session:
        await _assert_empty_project(session, discovery_id)


@pytest.mark.asyncio
async def test_discovery_create_queues_once_and_requires_market(
    client: httpx.AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    await _register(client, "discovery-queue@example.com")
    missing_market = await client.post(
        "/api/v1/brand-discoveries",
        headers={"Idempotency-Key": "missing-market"},
        json={"brand_name": "Acme", "website_url": "https://acme.com"},
    )
    assert missing_market.status_code == 422

    payload = {
        "brand_name": "Acme",
        "website_url": "acme.com",
        "primary_market": "US",
    }
    created = await client.post(
        "/api/v1/brand-discoveries",
        headers={"Idempotency-Key": "queue-discovery-1"},
        json=payload,
    )
    assert created.status_code == 202, created.text
    replay = await client.post(
        "/api/v1/brand-discoveries",
        headers={"Idempotency-Key": "queue-discovery-1"},
        json=payload,
    )
    assert replay.status_code == created.status_code
    assert replay.json()["id"] == created.json()["id"]
    discovery_id = uuid.UUID(created.json()["id"])
    async with session_factory() as session:
        tasks = list(
            (
                await session.scalars(
                    select(BrandDiscoveryTask).where(
                        BrandDiscoveryTask.discovery_id == discovery_id
                    )
                )
            ).all()
        )
    assert len(tasks) == 1
