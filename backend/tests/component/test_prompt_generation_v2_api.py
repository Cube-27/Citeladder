"""Business-map generation: multi-topic cells, map suggestions and provenance.

The default agent is faked at the API boundary; no test performs provider I/O.
"""

from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime, timedelta

import httpx
import pytest
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

import app.api.prompts as prompts_api
from app.connectors.answer_engines.errors import ProviderError
from app.connectors.jev import JevDecision
from app.core.config.jev import jev_settings
from app.domain.prompts.quality_calibration import load_reviewed_decisions
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
@pytest.mark.parametrize("empty_entry", [False, True])
async def test_multi_topic_generation_writes_one_question_per_map_cell(
    client: httpx.AsyncClient, fake_agent: FakeAgent, empty_entry: bool
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
                },
                *([{"offering": "sandals"}] if empty_entry else []),
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
    listed = (
        await client.get(f"/api/v1/prompt-sets/{prompt_set_id}/candidates")
    ).json()
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
    kept, rejected = (c["id"] for c in body["candidates"])

    review = await client.post(
        f"/api/v1/prompt-sets/{prompt_set_id}/candidates/review",
        json={"reject_ids": [rejected]},
    )
    assert review.json()["rejected_count"] == 1
    listed = (
        await client.get(f"/api/v1/prompt-sets/{prompt_set_id}/candidates")
    ).json()
    assert [c["id"] for c in listed] == [kept]

    # Both rejections survive for calibration with the judgment, not the text.
    outcomes = {
        c.disposition: c
        for c in await _set_candidates(session_factory, prompt_set_id)
        if c.disposition != "pending"
    }
    assert set(outcomes) == {"gate_rejected", "rejected"}
    for outcome in outcomes.values():
        assert outcome.text == ""
        assert outcome.jev_decision["verdict"] in {"fail", "pass"}
    assert outcomes["gate_rejected"].jev_decision["verdict"] == "fail"
    async with session_factory() as session:
        reviewed = await load_reviewed_decisions(session)
    mine = sorted(
        r.disposition
        for r in reviewed
        if r.decision in [o.jev_decision for o in outcomes.values()]
    )
    assert mine == ["gate_rejected", "rejected"]

    # Past retention, the next write to the set purges outcome records.
    async with session_factory() as session:
        await session.execute(
            update(PromptCandidate)
            .where(PromptCandidate.prompt_set_id == uuid.UUID(prompt_set_id))
            .where(PromptCandidate.disposition != "pending")
            .values(expires_at=datetime.now(UTC) - timedelta(minutes=1))
        )
        await session.commit()
    await client.post(
        f"/api/v1/prompt-sets/{prompt_set_id}/candidates/review",
        json={"accept_ids": [kept]},
    )
    remaining = await _set_candidates(session_factory, prompt_set_id)
    assert [c.disposition for c in remaining] == ["accepted"]
