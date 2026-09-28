"""Agent revisions enter the existing review boundary, never active tracking."""

import json
import uuid

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config.prompts import prompt_generation_settings
from app.models.agent import AgentChat, AgentOutput, AgentOutputRevision
from app.models.project import Project
from app.models.prompt import Prompt, Topic
from tests.component.prompt_generation_helpers import (
    make_project_and_set,
    staged_candidate,
)


@pytest.mark.asyncio
async def test_saved_portfolio_is_scoped_staged_and_preserves_revision_provenance(
    client: httpx.AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(prompt_generation_settings, "max_count", 5)
    monkeypatch.setattr(prompt_generation_settings, "default_count", 5)
    project, set_id = await make_project_and_set(client, "agent-prompts@example.com")
    async with session_factory() as session:
        owned = await session.get(Project, uuid.UUID(project["id"]))
        topic = await session.scalar(select(Topic).where(Topic.project_id == owned.id))
        scope = {"workspace_id": owned.workspace_id, "project_id": owned.id}
        chat = AgentChat(**scope, title="Buyer questions")
        session.add(chat)
        await session.flush()
        output = AgentOutput(
            **scope,
            chat_id=chat.id,
            kind="prompt_portfolio",
            skill_id="prompt_discovery",
            phase="draft",
        )
        session.add(output)
        await session.flush()
        body = {
            "prompts": [
                {
                    "topic_id": str(topic.id),
                    "text": (
                        "Which running shoes suit a beginner training on paved roads?"
                    ),
                    "buyer_stage": "consideration",
                    "prompt_intent": "recommend",
                }
            ]
        }
        revision = AgentOutputRevision(
            **scope,
            output_id=output.id,
            number=1,
            author="user",
            phase="draft",
            title="Buyer questions",
            body="```json\n" + json.dumps(body) + "\n```",
        )
        session.add(revision)
        await session.commit()
        revision_id = str(revision.id)
    endpoint = f"/api/v1/prompt-sets/{set_id}/generate"
    response = await client.post(endpoint, json={"agent_revision_id": revision_id})
    assert response.status_code == 201, response.text
    body = response.json()
    assert len(body["candidates"]) == 1
    async with session_factory() as session:
        assert (
            await session.scalar(
                select(Prompt).where(Prompt.prompt_set_id == uuid.UUID(set_id))
            )
            is None
        )
    repeated = await client.post(endpoint, json={"agent_revision_id": revision_id})
    assert repeated.status_code == 201
    assert repeated.json()["candidates"] == []
    _, provenance = await staged_candidate(body["candidates"][0]["id"])
    assert provenance["agent_revision_id"] == revision_id

    # A different workspace's valid revision must not be copied into this set.
    _, other_set = await make_project_and_set(client, "agent-prompts-other@example.com")
    denied = await client.post(
        f"/api/v1/prompt-sets/{other_set}/generate",
        json={"agent_revision_id": revision_id},
    )
    assert denied.status_code == 422
