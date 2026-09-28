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
from app.core.config.jev import jev_settings
from app.domain.projects.business_map import BusinessMap, read_business_map
from app.domain.prompts.quality_calibration import load_reviewed_decisions
from app.models.brand import BrandProfile
from app.models.prompt_candidate import PromptCandidate
from tests.component.prompt_generation_helpers import (
    FakeAgent,
    create_topic,
    make_project_and_set,
    pending_candidates,
    project_topics,
    staged_candidate,
)
from tests.fixtures.prompt_generation import slots_from_user_message


@pytest.fixture
def fake_agent(monkeypatch: pytest.MonkeyPatch) -> FakeAgent:
    agent = FakeAgent()
    monkeypatch.setattr(prompts_api, "create_model_gateway", lambda: agent)
    return agent


async def _profile(session: AsyncSession, project_id: str) -> BrandProfile:
    profile = await session.scalar(
        select(BrandProfile).where(BrandProfile.project_id == uuid.UUID(project_id))
    )
    assert profile is not None
    return profile


async def _store_business_map(
    session_factory: async_sessionmaker[AsyncSession], project_id: str, raw: dict
) -> None:
    async with session_factory() as session:
        profile = await _profile(session, project_id)
        profile.business_context = {
            **(profile.business_context or {}),
            "business_map": BusinessMap.model_validate(raw).model_dump(mode="json"),
        }
        await session.commit()


async def _stored_business_map(
    session_factory: async_sessionmaker[AsyncSession], project_id: str
) -> dict:
    async with session_factory() as session:
        profile = await _profile(session, project_id)
        return read_business_map(profile.business_context).model_dump(mode="json")


async def _two_offering_project(client: httpx.AsyncClient, email: str):
    project, prompt_set_id = await make_project_and_set(
        client, email, products_services=["running shoes", "sandals"]
    )
    topics = await project_topics(project["id"])
    sandals = await create_topic(project["id"], "Sandals")
    return project, prompt_set_id, topics[0]["id"], sandals["id"]


@pytest.mark.asyncio
@pytest.mark.parametrize("empty_entry", [False, True])
async def test_multi_topic_generation_writes_one_question_per_map_cell(
    client: httpx.AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    fake_agent: FakeAgent,
    empty_entry: bool,
) -> None:
    project, prompt_set_id, shoes_id, sandals_id = await _two_offering_project(
        client, "v2-cells@example.com"
    )
    # A person's confirmed map, as the business-map editor stores it.
    await _store_business_map(
        session_factory,
        project["id"],
        {
            "offerings": [
                {
                    "offering": "running shoes",
                    "attributes": [{"value": "wide fit"}],
                    "situations": [{"value": "trail running"}],
                    "exclusions": [{"first": "wide fit", "second": "trail running"}],
                },
                *([{"offering": "sandals"}] if empty_entry else []),
            ]
        },
    )
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
    business_map = await _stored_business_map(session_factory, project["id"])
    by_offering = {item["offering"]: item for item in business_map["offerings"]}
    assert set(by_offering) == {"running shoes", "sandals"}
    sandals = by_offering["sandals"]
    assert [e["value"] for e in sandals["audiences"]] == ["hikers"]
    assert {e["review_state"] for e in sandals["attributes"]} == {"suggested"}
    assert sandals["attributes"][0]["origin"] == "model"
    assert [e["value"] for e in by_offering["running shoes"]["attributes"]] == [
        "wide fit"
    ]

    candidate, provenance = await staged_candidate(body["candidates"][0]["id"])
    assert provenance["requested_topic_ids"] == [shoes_id, sandals_id]
    assert candidate.evidence_refs[0]["kind"] == "business_map_cell"


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
    assert {c["quality_status"] for c in body["candidates"]} == {"off"}


@pytest.mark.asyncio
async def test_a_capped_judge_reports_partial_coverage(
    client: httpx.AsyncClient,
    fake_agent: FakeAgent,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    judge = _FakeJudge()
    monkeypatch.setattr(prompts_api, "create_jev_client", lambda: judge)
    monkeypatch.setattr(jev_settings, "max_calls_per_generation", 1)
    _, prompt_set_id = await make_project_and_set(client, "v2-jev-cap@example.com")
    response = await client.post(
        f"/api/v1/prompt-sets/{prompt_set_id}/generate", json={"count": 2}
    )
    assert response.status_code == 201
    body = response.json()
    assert len(judge.states) == 1
    assert body["quality_gate"] == "unavailable"
    assert {row["quality_status"] for row in body["candidates"]} == {
        "judged",
        "unavailable",
    }


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
    monkeypatch.setattr(jev_settings, "mode", "shadow")
    _, prompt_set_id = await make_project_and_set(client, "v2-jev@example.com")

    body = (
        await client.post(
            f"/api/v1/prompt-sets/{prompt_set_id}/generate", json={"count": 3}
        )
    ).json()

    assert body["quality_gate"] == "shadow"
    assert judge.closed
    # Judge the pool first; shadow does not use judgments to select or drop.
    assert len(judge.states) == body["candidates_generated"] == 6
    assert len(body["candidates"]) == 3
    assert body["candidates"][-1]["text"] == weak
    assert body["candidates"][-1]["quality_flags"] == ["natural"]
    assert {c["quality_status"] for c in body["candidates"]} == {"judged"}
    listed = await pending_candidates(prompt_set_id)
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
    for staged in body["candidates"]:
        candidate, provenance = await staged_candidate(staged["id"])
        assert candidate.jev_decision
        assert provenance["quality_gate"] == "shadow"


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
    listed = await pending_candidates(prompt_set_id)
    assert {c["quality_status"] for c in listed} == {"unavailable"}


async def _set_candidates(
    session_factory: async_sessionmaker[AsyncSession], prompt_set_id: str
) -> list[PromptCandidate]:
    async with session_factory() as session:
        result = await session.execute(
            select(PromptCandidate).where(
                PromptCandidate.prompt_set_id == uuid.UUID(prompt_set_id)
            )
        )
        return list(result.scalars().all())


@pytest.mark.asyncio
async def test_the_gate_removes_strong_fails_and_keeps_text_free_outcomes(
    client: httpx.AsyncClient,
    fake_agent: FakeAgent,
    monkeypatch: pytest.MonkeyPatch,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    weak = "best running shoes in australia"
    monkeypatch.setattr(
        prompts_api, "create_jev_client", lambda: _FakeJudge(weak_text=weak)
    )
    _, prompt_set_id = await make_project_and_set(client, "v2-gate@example.com")

    body = (
        await client.post(
            f"/api/v1/prompt-sets/{prompt_set_id}/generate", json={"count": 2}
        )
    ).json()

    # The strong fail never reaches review; the spare pool fills the request.
    assert body["quality_gate"] == "gate"
    assert body["quality_rejected"] == 1
    assert weak not in {c["text"] for c in body["candidates"]}
    assert len(body["candidates"]) == 2
    listed = await pending_candidates(prompt_set_id)
    assert {c["id"] for c in listed} == {c["id"] for c in body["candidates"]}

    # The gate rejection survives for calibration with the judgment, not the
    # text. (Review rejections are written by the TypeScript review.)
    outcomes = [
        c
        for c in await _set_candidates(session_factory, prompt_set_id)
        if c.disposition != "pending"
    ]
    assert [outcome.disposition for outcome in outcomes] == ["gate_rejected"]
    assert outcomes[0].text == ""
    assert outcomes[0].jev_decision["verdict"] == "fail"
    async with session_factory() as session:
        reviewed = await load_reviewed_decisions(session)
    mine = [r.disposition for r in reviewed if r.decision == outcomes[0].jev_decision]
    assert mine == ["gate_rejected"]
