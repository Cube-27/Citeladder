"""Generated-prompt candidates: review, isolation, expiry and non-measurement.

Candidates are staged by Generate and live outside ``prompts``; these tests
pin that review is the only way in, and that a pending candidate is never
audited, charged to prompt capacity or counted as a tracked prompt.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import httpx
import pytest
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

import app.api.prompts as prompts_api
from app.core.config.audits import AUDIT_TRIGGER_MANUAL
from app.core.config.entitlements import KEY_PROMPT_SLOTS
from app.domain.audits.creation import create_audit
from app.domain.audits.reads import list_tasks
from app.domain.command_center.service import get_command_center
from app.domain.entitlements.types import GrantSpec
from app.models.project import Project
from app.models.prompt_candidate import PromptCandidate, PromptGenerationRun
from tests.component.audit_helpers import seed_audit_fixtures
from tests.component.occupancy_helpers import (
    revoke_signup_baseline_grants,
    seed_occupancy_grants,
)
from tests.component.prompt_generation_helpers import FakeAgent, make_project_and_set


@pytest.fixture
def fake_agent(monkeypatch: pytest.MonkeyPatch) -> FakeAgent:
    agent = FakeAgent()
    monkeypatch.setattr(prompts_api, "create_model_gateway", lambda: agent)
    return agent


async def _generate(client: httpx.AsyncClient, prompt_set_id: str) -> list[str]:
    response = await client.post(
        f"/api/v1/prompt-sets/{prompt_set_id}/generate", json={"count": 3}
    )
    assert response.status_code == 201, response.text
    return [candidate["id"] for candidate in response.json()["candidates"]]


def _review(client: httpx.AsyncClient, prompt_set_id: str, **body: list[str]) -> object:
    return client.post(
        f"/api/v1/prompt-sets/{prompt_set_id}/candidates/review", json=body
    )


@pytest.mark.asyncio
async def test_review_accepts_and_rejects_in_one_request(
    client: httpx.AsyncClient, fake_agent: FakeAgent
) -> None:
    _, prompt_set_id = await make_project_and_set(client, "cand1@example.com")
    first, second, third = await _generate(client, prompt_set_id)

    assert (await _review(client, prompt_set_id)).status_code == 422
    overlap = await _review(
        client, prompt_set_id, accept_ids=[first], reject_ids=[first]
    )
    assert overlap.status_code == 422

    reviewed = await _review(
        client, prompt_set_id, accept_ids=[first], reject_ids=[second]
    )
    assert reviewed.status_code == 200
    body = reviewed.json()
    assert [prompt["status"] for prompt in body["accepted"]] == ["active"]
    assert body["rejected_count"] == 1
    assert body["unavailable_count"] == 0

    # A repeated submit is harmless: reviewed ids are simply unavailable.
    repeat = await _review(
        client, prompt_set_id, accept_ids=[first], reject_ids=[second]
    )
    assert repeat.json()["accepted"] == []
    assert repeat.json()["unavailable_count"] == 2

    pending = await client.get(f"/api/v1/prompt-sets/{prompt_set_id}/candidates")
    assert [candidate["id"] for candidate in pending.json()] == [third]
    tracked = (await client.get(f"/api/v1/prompt-sets/{prompt_set_id}")).json()
    assert len(tracked["prompts"]) == 1


@pytest.mark.asyncio
async def test_candidates_are_workspace_scoped(
    client: httpx.AsyncClient, fake_agent: FakeAgent
) -> None:
    _, prompt_set_id = await make_project_and_set(client, "cand-owner@example.com")
    candidate_ids = await _generate(client, prompt_set_id)

    # A second workspace can neither see nor review the first one's candidates.
    _, foreign_set_id = await make_project_and_set(client, "cand-other@example.com")
    listed = await client.get(f"/api/v1/prompt-sets/{prompt_set_id}/candidates")
    assert listed.status_code == 404
    foreign_review = await _review(client, prompt_set_id, accept_ids=candidate_ids)
    assert foreign_review.status_code == 404
    # Nor can it smuggle them through its own set.
    smuggled = await _review(client, foreign_set_id, accept_ids=candidate_ids)
    assert smuggled.status_code == 200
    assert smuggled.json()["accepted"] == []
    assert smuggled.json()["unavailable_count"] == len(candidate_ids)


@pytest.mark.asyncio
async def test_expired_candidates_are_hidden_unreviewable_and_purged(
    client: httpx.AsyncClient,
    fake_agent: FakeAgent,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    _, prompt_set_id = await make_project_and_set(client, "cand-expiry@example.com")
    stale_id, *_ = await _generate(client, prompt_set_id)
    async with session_factory() as session:
        await session.execute(
            update(PromptCandidate)
            .where(PromptCandidate.id == uuid.UUID(stale_id))
            .values(expires_at=datetime.now(UTC) - timedelta(minutes=1))
        )
        await session.commit()

    pending = await client.get(f"/api/v1/prompt-sets/{prompt_set_id}/candidates")
    assert stale_id not in {candidate["id"] for candidate in pending.json()}
    review = await _review(client, prompt_set_id, accept_ids=[stale_id])
    assert review.json()["accepted"] == []
    assert review.json()["unavailable_count"] == 1
    async with session_factory() as session:
        assert await session.get(PromptCandidate, uuid.UUID(stale_id)) is None


@pytest.mark.asyncio
async def test_pending_candidates_do_not_occupy_prompt_capacity(
    client: httpx.AsyncClient,
    fake_agent: FakeAgent,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    project, prompt_set_id = await make_project_and_set(client, "cand-cap@example.com")
    async with session_factory() as session:
        workspace_id = uuid.UUID(project["workspace_id"])
        await revoke_signup_baseline_grants(session, workspace_id=workspace_id)
        await seed_occupancy_grants(
            session,
            workspace_id=workspace_id,
            grants=(GrantSpec(key=KEY_PROMPT_SLOTS, value=1),),
        )
        await session.commit()
    assert len(await _generate(client, prompt_set_id)) == 3

    manual = await client.post(
        f"/api/v1/prompt-sets/{prompt_set_id}/prompts",
        json={"text": "best trail running shoes for beginners"},
    )
    assert manual.status_code == 201


@pytest.mark.asyncio
async def test_pending_candidates_never_reach_audits_or_tracked_counts(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    async with session_factory() as session:
        seed = await seed_audit_fixtures(session, prompt_count=2)
        run = PromptGenerationRun(
            workspace_id=seed.workspace_id,
            project_id=seed.project_id,
            prompt_set_id=seed.prompt_set_id,
            generator_version="test",
        )
        session.add(run)
        await session.flush()
        for index in range(3):
            session.add(
                PromptCandidate(
                    workspace_id=seed.workspace_id,
                    run_id=run.id,
                    prompt_set_id=seed.prompt_set_id,
                    text=f"best staged option {index} for acme",
                    expires_at=datetime.now(UTC) + timedelta(days=1),
                )
            )
        await session.commit()

    async with session_factory() as session:
        audit = await create_audit(
            session,
            trigger=AUDIT_TRIGGER_MANUAL,
            workspace_id=seed.workspace_id,
            project_id=seed.project_id,
            engines=seed.engines,
            prompt_set_id=seed.prompt_set_id,
            repetitions=1,
        )
        tasks = await list_tasks(
            session, workspace_id=seed.workspace_id, audit_id=audit.id
        )
        assert len(tasks) == len(seed.prompt_ids)
        assert not any("staged" in task.prompt_text for task in tasks)

        project = await session.scalar(
            select(Project).where(Project.id == seed.project_id)
        )
        assert project is not None
        overview = await get_command_center(
            session, workspace_id=seed.workspace_id, project=project
        )
        assert overview.active_prompt_count == len(seed.prompt_ids)
