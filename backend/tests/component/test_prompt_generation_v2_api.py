"""Business-map generation: multi-topic cells, map suggestions and provenance.

The default agent is faked at the API boundary; no test performs provider I/O.
"""

from __future__ import annotations

import json
import uuid

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

import app.api.prompts as prompts_api
from app.connectors.answer_engines.errors import ProviderError
from app.connectors.jev import JevDecision
from app.models.prompt_candidate import PromptCandidate
from tests.component.prompt_generation_helpers import (
    FakeAgent,
    accept_all,
    make_project_and_set,
)
from tests.fixtures.prompt_generation import slots_from_user_message


@pytest.fixture
def fake_agent(monkeypatch: pytest.MonkeyPatch) -> FakeAgent:
    agent = FakeAgent()
    monkeypatch.setattr(prompts_api, "create_model_gateway", lambda: agent)
    return agent


async def _two_offering_project(client: httpx.AsyncClient, email: str):
    project, prompt_set_id = await make_project_and_set(client, email)
    profile = await client.put(
        f"/api/v1/projects/{project['id']}/brand-profile",
        json={"products_services": ["running shoes", "sandals"]},
    )
    assert profile.status_code == 200
    topics = (await client.get(f"/api/v1/projects/{project['id']}/topics")).json()
    sandals = await client.post(
        f"/api/v1/projects/{project['id']}/topics", json={"name": "Sandals"}
    )
    assert sandals.status_code == 201
    return project, prompt_set_id, topics[0]["id"], sandals.json()["id"]


@pytest.mark.asyncio
async def test_multi_topic_generation_writes_one_question_per_map_cell(
    client: httpx.AsyncClient, fake_agent: FakeAgent
) -> None:
    project, prompt_set_id, shoes_id, sandals_id = await _two_offering_project(
        client, "v2-cells@example.com"
    )
    mapped = await client.put(
        f"/api/v1/projects/{project['id']}/business-map",
        json={
            "offerings": [
                {
                    "offering": "running shoes",
                    "attributes": [{"value": "wide fit"}],
                    "situations": [{"value": "trail running"}],
                    "exclusions": [{"first": "wide fit", "second": "trail running"}],
                }
            ]
        },
    )
    assert mapped.status_code == 200
    fake_agent.map_response = json.dumps(
        {
            "offerings": [
                {
                    "offering": "Sandals",
                    "attributes": ["arch support"],
                    "situations": [],
                    "audiences": ["Globex fans", "hikers"],
                },
                {"offering": "Boots", "attributes": ["steel toe"]},
            ]
        }
    )

    response = await client.post(
        f"/api/v1/prompt-sets/{prompt_set_id}/generate",
        json={"count": 4, "topic_ids": [shoes_id, sandals_id]},
    )

    assert response.status_code == 201, response.text
    body = response.json()
    assert {c["topic_id"] for c in body["candidates"]} == {shoes_id, sandals_id}
    assert body["candidates_generated"] == 8
    # Only the unmapped offering was sent for suggestions.
    assert json.loads(
        fake_agent.map_calls[0]["user"].split("use these names exactly): ")[1]
    ) == ["sandals"]
    needs = [
        slot.get("buyer_need", {})
        for call in fake_agent.calls
        for slot in slots_from_user_message(call["user"])
    ]
    assert any(need.get("attribute") == "wide fit" for need in needs)
    assert any(need.get("attribute") == "arch support" for need in needs)
    assert not any(
        need.get("attribute") == "wide fit"
        and need.get("situation_or_constraint") == "trail running"
        for need in needs
    )

    # Suggestions are stored unreviewed, without competitor names or
    # offerings nobody confirmed, and a person's map is untouched.
    business_map = (
        await client.get(f"/api/v1/projects/{project['id']}/business-map")
    ).json()
    by_offering = {item["offering"]: item for item in business_map["offerings"]}
    assert set(by_offering) == {"running shoes", "sandals"}
    sandals = by_offering["sandals"]
    assert [e["value"] for e in sandals["audiences"]] == ["hikers"]
    assert {e["review_state"] for e in sandals["attributes"]} == {"suggested"}
    assert sandals["attributes"][0]["origin"] == "model"
    assert [e["value"] for e in by_offering["running shoes"]["attributes"]] == [
        "wide fit"
    ]

    accepted = await accept_all(client, prompt_set_id, body)
    evidence = accepted[0]["generation_evidence"]
    assert evidence["requested_topic_ids"] == [shoes_id, sandals_id]
    assert evidence["evidence_refs"][0]["kind"] == "business_map_cell"


@pytest.mark.asyncio
async def test_an_unknown_topic_in_topic_ids_is_rejected_before_the_provider(
    client: httpx.AsyncClient, fake_agent: FakeAgent
) -> None:
    _, prompt_set_id = await make_project_and_set(client, "v2-foreign@example.com")

    response = await client.post(
        f"/api/v1/prompt-sets/{prompt_set_id}/generate",
        json={"count": 2, "topic_ids": [str(uuid.uuid4())]},
    )

    assert response.status_code == 422
    assert fake_agent.calls == [] and fake_agent.map_calls == []


@pytest.mark.asyncio
async def test_an_observed_query_is_never_copied_into_a_candidate(
    client: httpx.AsyncClient,
    fake_agent: FakeAgent,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import app.domain.prompts.generation as generation

    _, prompt_set_id = await make_project_and_set(client, "v2-verbatim@example.com")
    copied = "best running shoes in australia"
    real_context = generation._generation_brand_context

    def _with_observed_query(*args, **kwargs):
        context = real_context(*args, **kwargs)
        context["demand_signals"] = [{"id": "s1", "observed_query": copied}]
        return context

    monkeypatch.setattr(generation, "_generation_brand_context", _with_observed_query)

    response = await client.post(
        f"/api/v1/prompt-sets/{prompt_set_id}/generate", json={"count": 3}
    )

    assert response.status_code == 201
    texts = [c["text"].casefold() for c in response.json()["candidates"]]
    assert texts and copied not in texts


class _FakeJudge:
    """Stands in for JevClient: flags one question, or fails every call."""

    model = "jev-latest"

    def __init__(self, *, weak_text: str = "", fail: bool = False) -> None:
        self.weak_text = weak_text
        self.fail = fail
        self.states: list[dict] = []
        self.closed = False

    async def decide(self, state: dict, questions: dict) -> JevDecision:
        self.states.append(state)
        if self.fail:
            raise ProviderError("down", error_code="server_error", retryable=False)
        weak = state["candidate"]["question"] == self.weak_text
        answers = {
            key: {"type": "noul", "noul": 0.1 if weak and key == "natural" else 0.9}
            for key in questions
            if questions[key]["type"] == "noul"
        }
        return JevDecision(model="jev-1.13.0", answers=answers)

    async def aclose(self) -> None:
        self.closed = True


@pytest.mark.asyncio
async def test_without_a_jev_key_the_judge_is_off(
    client: httpx.AsyncClient, fake_agent: FakeAgent
) -> None:
    _, prompt_set_id = await make_project_and_set(client, "v2-jev-off@example.com")

    body = (
        await client.post(
            f"/api/v1/prompt-sets/{prompt_set_id}/generate", json={"count": 2}
        )
    ).json()

    assert body["quality_gate"] == "off"
    assert all(c["quality_judged"] is False for c in body["candidates"])


@pytest.mark.asyncio
async def test_shadow_decisions_rank_and_flag_without_dropping(
    client: httpx.AsyncClient,
    fake_agent: FakeAgent,
    monkeypatch: pytest.MonkeyPatch,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    weak = "best running shoes in australia"
    judge = _FakeJudge(weak_text=weak)
    monkeypatch.setattr(prompts_api, "create_jev_client", lambda: judge)
    _, prompt_set_id = await make_project_and_set(client, "v2-jev@example.com")

    body = (
        await client.post(
            f"/api/v1/prompt-sets/{prompt_set_id}/generate", json={"count": 3}
        )
    ).json()

    assert body["quality_gate"] == "shadow"
    assert judge.closed
    # Only the selected candidates are judged, and none are dropped.
    assert len(judge.states) == len(body["candidates"]) == 3
    assert body["candidates"][-1]["text"] == weak
    assert body["candidates"][-1]["quality_flags"] == ["natural"]
    listed = (
        await client.get(f"/api/v1/prompt-sets/{prompt_set_id}/candidates")
    ).json()
    assert [c["id"] for c in listed] == [c["id"] for c in body["candidates"]]

    async with session_factory() as session:
        stored = (
            (
                await session.execute(
                    select(PromptCandidate).where(
                        PromptCandidate.prompt_set_id == uuid.UUID(prompt_set_id)
                    )
                )
            )
            .scalars()
            .all()
        )
    decision = next(c.jev_decision for c in stored if c.text == weak)
    assert decision["mode"] == "shadow"
    assert decision["model"] == "jev-1.13.0"
    assert decision["question_schema_version"]
    assert decision["state_hash"]
    accepted = await accept_all(client, prompt_set_id, body)
    assert all(p["generation_evidence"]["jev_decision"] for p in accepted)
    assert accepted[0]["generation_evidence"]["quality_gate"] == "shadow"


@pytest.mark.asyncio
async def test_jev_failure_never_fails_generation(
    client: httpx.AsyncClient,
    fake_agent: FakeAgent,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(prompts_api, "create_jev_client", lambda: _FakeJudge(fail=True))
    _, prompt_set_id = await make_project_and_set(client, "v2-jev-down@example.com")

    response = await client.post(
        f"/api/v1/prompt-sets/{prompt_set_id}/generate", json={"count": 2}
    )

    assert response.status_code == 201
    assert response.json()["quality_gate"] == "unavailable"
    assert len(response.json()["candidates"]) == 2
