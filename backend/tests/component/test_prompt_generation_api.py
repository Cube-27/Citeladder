"""Component tests for topic-bound AI prompt generation and review lifecycle.

The default agent is always faked at the API boundary
(``app.api.prompts.create_model_gateway``) so no test ever performs live
provider I/O, regardless of what keys exist in the developer's ``.env``.

Covers:
  - generate happy path: candidates reference existing canonical topics, stay
    untracked until accepted, and the run records provenance (invariant 4);
  - count cap (422);
  - unconfigured agent -> 503, but foreign set -> 404 first (invariant 5);
  - unparseable model output -> 502;
  - DB-level duplicate dropping across repeat runs (conflict-safe dedupe);
  - generation racing the TypeScript set/topic deletes under their locks;
  - the audit planner never consumes ``proposed``/``archived`` prompts.

Prompt-library routes (sets, prompts, topics, import, review) are TypeScript
owned; tests set that state up in the database directly.
"""

from __future__ import annotations

import json
import uuid
from typing import cast

import httpx
import pytest
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

import app.api.prompts as prompts_api
from app.connectors.agent.client import AgentNotConfiguredError, DefaultAgentClient
from app.connectors.answer_engines.errors import ProviderError
from app.core.config.audits import AUDIT_TRIGGER_MANUAL
from app.core.config.entitlements import KEY_PROMPT_SLOTS
from app.domain.audits.creation import create_audit
from app.domain.audits.errors import AuditValidationError
from app.domain.audits.reads import list_tasks
from app.domain.entitlements.types import GrantSpec
from app.domain.prompts.locks import acquire_project_lock, acquire_prompt_set_lock
from app.models.prompt import Prompt, PromptSet, Topic
from app.models.prompt_candidate import PromptCandidate, PromptGenerationRun
from tests.component.audit_helpers import seed_audit_fixtures
from tests.component.auth_helpers import register_and_login as _register
from tests.component.occupancy_helpers import (
    revoke_signup_baseline_grants,
    seed_occupancy_grants,
)
from tests.component.prompt_generation_helpers import (
    FakeAgent,
    accept_all,
    create_prompt,
    create_topic,
    make_project_and_set,
    pending_candidates,
    project_topics,
    prompt_set_view,
)
from tests.fixtures.prompt_generation import (
    slots_from_user_message,
)


@pytest.fixture
def fake_agent(monkeypatch: pytest.MonkeyPatch) -> FakeAgent:
    agent = FakeAgent()
    monkeypatch.setattr(prompts_api, "create_model_gateway", lambda: agent)
    return agent


# --------------------------------------------------------------------------
# Generation
# --------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_generate_stages_candidates_until_accepted(
    client: httpx.AsyncClient, fake_agent: FakeAgent
) -> None:
    project, prompt_set_id = await make_project_and_set(
        client,
        "gen1@example.com",
        positioning="Value-priced family footwear.",
        target_audience="Budget-conscious Australian families.",
    )

    resp = await client.post(
        f"/api/v1/prompt-sets/{prompt_set_id}/generate",
        json={"count": 3, "confirm_send_evidence": True},
    )
    assert resp.status_code == 201
    body = resp.json()

    assert body["dropped_duplicates"] == 0
    assert len(body["candidates"]) == 3
    assert {p["prompt_intent"] for p in body["candidates"]} == {"recommend"}
    assert all(candidate["topic_id"] is not None for candidate in body["candidates"])
    assert {t["name"] for t in body["topics"]} == {"Running Shoes"}
    # Candidates are not tracked prompts: nothing counts until accepted.
    assert body["topics"][0]["active_count"] == 0
    tracked = await prompt_set_view(prompt_set_id)
    assert tracked["prompts"] == []
    pending = await pending_candidates(prompt_set_id)
    assert {c["id"] for c in pending} == {c["id"] for c in body["candidates"]}

    accepted = await accept_all(client, prompt_set_id, body)
    assert len(accepted) == 3
    for prompt in accepted:
        assert prompt["status"] == "active"
        assert prompt["origin"] == "generated"
        assert prompt["topic_id"] is not None
        assert "buyer_query_archetype" not in prompt["generation_evidence"]
    topics = await project_topics(project["id"])
    assert topics[0]["active_count"] == 3
    assert await pending_candidates(prompt_set_id) == []

    # The brand evidence went to the agent (confirmed above), and the
    # request embedded identity + count instructions.
    assert len(fake_agent.calls) == 1
    assert fake_agent.schemas[0][0] == "prompt_generation"
    assert fake_agent.schemas[0][1]["additionalProperties"] is False
    sent = fake_agent.calls[0]["user"]
    assert "Acme Corp" in sent
    assert "Globex" in sent
    assert "Value-priced family footwear" in sent
    # Overgenerated: two cells per requested prompt, selection keeps three.
    assert "exactly 6 prompts" in sent
    assert '"buyer_need":{"offering":"Running Shoes"}' in sent
    assert "Buyer-query slots" in sent
    assert '["running shoes"]' in sent

    # Core generation excludes tracked and competitor names.
    listed = await prompt_set_view(prompt_set_id)
    assert all(prompt["branded"] is False for prompt in listed["prompts"])


@pytest.mark.asyncio
async def test_generate_reserves_the_maximum_provider_call_budget(
    client: httpx.AsyncClient,
    fake_agent: FakeAgent,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _, prompt_set_id = await make_project_and_set(client, "gen-budget@example.com")
    reservation: dict[str, object] = {}

    async def _capture_reservation(*_args: object, **kwargs: object) -> None:
        reservation.update(kwargs)

    monkeypatch.setattr(prompts_api, "enforce_workspace_request", _capture_reservation)

    response = await client.post(
        f"/api/v1/prompt-sets/{prompt_set_id}/generate",
        json={"count": 3},
    )

    assert response.status_code == 201
    assert reservation["operation"] == "agent.provider_call"
    # One batch of six cells, one re-ask, one business-map suggestion call.
    assert reservation["amount"] == 3


@pytest.mark.asyncio
async def test_generate_persists_provenance_evidence(
    client: httpx.AsyncClient,
    fake_agent: FakeAgent,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    _, prompt_set_id = await make_project_and_set(client, "gen2@example.com")
    resp = await client.post(
        f"/api/v1/prompt-sets/{prompt_set_id}/generate",
        json={"count": 3, "confirm_send_evidence": True},
    )
    assert resp.status_code == 201
    candidate_ids = {
        uuid.UUID(candidate["id"]) for candidate in resp.json()["candidates"]
    }

    async with session_factory() as session:
        candidates = (
            await session.scalars(
                select(PromptCandidate).where(PromptCandidate.id.in_(candidate_ids))
            )
        ).all()
        run_ids = {candidate.run_id for candidate in candidates}
        assert len(run_ids) == 1  # one run for the whole batch
        run = await session.get(PromptGenerationRun, run_ids.pop())
    assert len(candidates) == 3
    assert all(c.validation["admission"] == "passed" for c in candidates)
    assert run is not None
    assert run.prompt_set_id == uuid.UUID(prompt_set_id)
    evidence = run.provenance
    assert evidence["generator_version"] == "prompt-gen-v2"
    assert evidence["buyer_query_policy_version"] == "buyer-query-policy-1"
    assert "buyer_query_archetype" not in evidence
    assert evidence["generation_mode"] == "model"
    assert evidence["model_identity"] == {
        "transport_host": "agent.test",
        "transport_model": "fake-model",
    }
    assert evidence["requested_count"] == 3
    assert evidence["generation_run_id"] == str(run.id)


@pytest.mark.asyncio
async def test_generate_rejects_count_over_cap(
    client: httpx.AsyncClient, fake_agent: FakeAgent
) -> None:
    _, prompt_set_id = await make_project_and_set(client, "gen4@example.com")
    resp = await client.post(
        f"/api/v1/prompt-sets/{prompt_set_id}/generate",
        json={"count": 9999, "confirm_send_evidence": True},
    )
    assert resp.status_code == 422
    assert resp.json()["detail"]["code"] == "generation_invalid"
    assert fake_agent.calls == []


@pytest.mark.asyncio
async def test_generate_creates_topics_from_confirmed_offerings_when_none_exist(
    client: httpx.AsyncClient, fake_agent: FakeAgent
) -> None:
    project, prompt_set_id = await make_project_and_set(
        client, "gen-products@example.com", create_default_topic=False
    )

    resp = await client.post(
        f"/api/v1/prompt-sets/{prompt_set_id}/generate",
        json={"count": 3, "confirm_send_evidence": True},
    )

    assert resp.status_code == 201
    body = resp.json()
    assert len(body["candidates"]) == 3
    assert {topic["name"] for topic in body["topics"]} == {"running shoes"}
    assert {topic["origin"] for topic in body["topics"]} == {"generated"}
    assert all(
        prompt["topic_id"] == body["topics"][0]["id"] for prompt in body["candidates"]
    )

    topics = await project_topics(project["id"])
    assert [(topic["name"], topic["origin"]) for topic in topics] == [
        ("running shoes", "generated")
    ]
    assert len(fake_agent.calls) == 1


@pytest.mark.asyncio
async def test_generate_without_topics_or_offerings_rejects_before_provider(
    client: httpx.AsyncClient, fake_agent: FakeAgent
) -> None:
    _, prompt_set_id = await make_project_and_set(
        client,
        "gen-no-offerings@example.com",
        create_default_topic=False,
        products_services=[],
    )

    resp = await client.post(
        f"/api/v1/prompt-sets/{prompt_set_id}/generate",
        json={"count": 3, "confirm_send_evidence": True},
    )

    assert resp.status_code == 422
    assert resp.json()["detail"]["code"] == "generation_invalid"
    assert "confirmed offering" in resp.json()["detail"]["message"]
    assert fake_agent.calls == []


@pytest.mark.asyncio
async def test_generate_rejects_foreign_topic_id(
    client: httpx.AsyncClient, fake_agent: FakeAgent
) -> None:
    _, prompt_set_id = await make_project_and_set(client, "gen5@example.com")
    resp = await client.post(
        f"/api/v1/prompt-sets/{prompt_set_id}/generate",
        json={
            "count": 3,
            "confirm_send_evidence": True,
            "topic_id": str(uuid.uuid4()),
        },
    )
    assert resp.status_code == 422
    assert fake_agent.calls == []


@pytest.mark.asyncio
async def test_generate_unconfigured_agent_returns_503(
    client: httpx.AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    _, prompt_set_id = await make_project_and_set(client, "gen6@example.com")

    def _unconfigured() -> None:
        raise AgentNotConfiguredError("no key")

    monkeypatch.setattr(prompts_api, "create_model_gateway", _unconfigured)
    resp = await client.post(
        f"/api/v1/prompt-sets/{prompt_set_id}/generate",
        json={"count": 3, "confirm_send_evidence": True},
    )
    assert resp.status_code == 503
    detail = resp.json()["detail"]
    assert detail["code"] == "agent_not_configured"
    assert "configured provider's API key" in detail["message"]


@pytest.mark.asyncio
async def test_generate_reports_upstream_rate_limits_as_retryable(
    client: httpx.AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    _, prompt_set_id = await make_project_and_set(client, "gen-rate-limit@example.com")

    class RateLimitedAgent:
        model = "fake-model"
        base_url_host = "agent.test"

        async def complete_structured_json(
            self,
            *,
            system: str,
            user: str,
            schema_name: str,
            schema: dict[str, object],
        ) -> str:
            raise ProviderError(
                "Default agent returned HTTP 429",
                error_code="rate_limit",
                retryable=True,
                retry_after_seconds=4,
            )

    monkeypatch.setattr(prompts_api, "create_model_gateway", RateLimitedAgent)
    resp = await client.post(
        f"/api/v1/prompt-sets/{prompt_set_id}/generate",
        json={"count": 3, "confirm_send_evidence": True},
    )

    assert resp.status_code == 429
    assert resp.headers["retry-after"] == "4"
    assert resp.json()["detail"] == {
        "code": "rate_limited",
        "message": "The AI provider is rate limited. Please try again shortly.",
    }


@pytest.mark.asyncio
async def test_generate_foreign_set_is_404_even_when_unconfigured(
    client: httpx.AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Scope check wins over configuration state (no existence oracle)."""
    _, prompt_set_id = await make_project_and_set(client, "gen7a@example.com")
    client.cookies.clear()
    await _register(client, "gen7b@example.com")

    def _unconfigured() -> None:
        raise AgentNotConfiguredError("no key")

    monkeypatch.setattr(prompts_api, "create_model_gateway", _unconfigured)
    resp = await client.post(
        f"/api/v1/prompt-sets/{prompt_set_id}/generate",
        json={"count": 3, "confirm_send_evidence": True},
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_generate_unparseable_output_returns_502(
    client: httpx.AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    _, prompt_set_id = await make_project_and_set(client, "gen8@example.com")
    agent = FakeAgent(response="this is not json")
    monkeypatch.setattr(prompts_api, "create_model_gateway", lambda: agent)
    resp = await client.post(
        f"/api/v1/prompt-sets/{prompt_set_id}/generate",
        json={"count": 3, "confirm_send_evidence": True},
    )
    assert resp.status_code == 502
    assert resp.json()["detail"]["code"] == "generation_unparseable"


@pytest.mark.asyncio
async def test_generate_twice_drops_duplicates(
    client: httpx.AsyncClient, fake_agent: FakeAgent
) -> None:
    """Known texts (pending or tracked) are never staged again.

    The fake agent writes the same six cells every run; overgeneration lets
    the second run fill from the three it has not staged yet.
    """
    _, prompt_set_id = await make_project_and_set(client, "gen9@example.com")

    def _generate():
        return client.post(
            f"/api/v1/prompt-sets/{prompt_set_id}/generate",
            json={"count": 3, "confirm_send_evidence": True},
        )

    first = (await _generate()).json()
    assert len(first["candidates"]) == 3
    assert first["candidates_generated"] == 6

    second = (await _generate()).json()
    assert len(second["candidates"]) == 3
    assert second["dropped_duplicates"] == 3
    assert not {c["text"] for c in first["candidates"]} & {
        c["text"] for c in second["candidates"]
    }

    await accept_all(client, prompt_set_id, first)
    third = (await _generate()).json()
    assert third["candidates"] == []
    assert third["dropped_duplicates"] == 6

    listed = await prompt_set_view(prompt_set_id)
    assert len(listed["prompts"]) == 3  # no dupes, and no reused topics broke


@pytest.mark.asyncio
async def test_generate_into_target_topic(
    client: httpx.AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    project, prompt_set_id = await make_project_and_set(client, "gen10@example.com")
    topic = await create_topic(project["id"], "Running Shoe Pricing")

    # The fake converts its fixture to the only canonical topic ID supplied to
    # a scoped generation call.
    agent = FakeAgent(
        response=json.dumps(
            {
                "topics": [
                    {
                        "name": "Whatever The Model Said",
                        "prompts": [
                            {
                                "text": "how much do running shoe plans cost",
                                "intent": "purchase",
                            }
                        ],
                    }
                ]
            }
        )
    )
    monkeypatch.setattr(prompts_api, "create_model_gateway", lambda: agent)
    resp = await client.post(
        f"/api/v1/prompt-sets/{prompt_set_id}/generate",
        json={
            "count": 1,
            "confirm_send_evidence": True,
            "topic_id": topic["id"],
        },
    )
    assert resp.status_code == 201
    body = resp.json()
    assert [t["id"] for t in body["topics"]] == [topic["id"]]
    assert body["candidates"][0]["topic_id"] == topic["id"]
    assert '"topic":"Running Shoe Pricing"' in agent.calls[0]["user"]

    # No new topic was created from the model's invented name.
    topics = await project_topics(project["id"])
    assert {t["name"] for t in topics} == {"Running Shoe Pricing", "Running Shoes"}


@pytest.mark.asyncio
async def test_topic_scoped_generation_plans_only_that_topic(
    client: httpx.AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Generation respects the selected canonical topic without label quotas."""
    project, prompt_set_id = await make_project_and_set(
        client, "gen-scoped@example.com"
    )
    target = await create_topic(
        project["id"], "School Uniforms", description="Shirts, dresses, shoes."
    )

    agent = FakeAgent(response=json.dumps({"topics": []}))
    monkeypatch.setattr(prompts_api, "create_model_gateway", lambda: agent)
    resp = await client.post(
        f"/api/v1/prompt-sets/{prompt_set_id}/generate",
        json={"count": 7, "confirm_send_evidence": True, "topic_id": target["id"]},
    )

    assert resp.status_code == 201
    generated = resp.json()["candidates"]
    assert len(generated) == 7
    # Every prompt belongs to the requested topic — the other project topic is
    # never planned for.
    assert {prompt["topic_id"] for prompt in generated} == {target["id"]}
    # The fake returns one label throughout; no funnel allocation overrides it.
    assert {prompt["buyer_stage"] for prompt in generated} == {"consideration"}
    assert {prompt["prompt_intent"] for prompt in generated} == {"recommend"}
    # The slots the model was given name only the scoped topic.
    planned = slots_from_user_message(agent.calls[0]["user"])
    assert {slot["topic"] for slot in planned} == {"School Uniforms"}


@pytest.mark.asyncio
async def test_generation_reuses_existing_topic_with_description(
    client: httpx.AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    project, prompt_set_id = await make_project_and_set(
        client, "gen-topic-description@example.com"
    )
    topic = await create_topic(
        project["id"],
        "Footwear",
        description="Running and everyday shoes for families.",
    )
    agent = FakeAgent(
        response=json.dumps(
            {
                "topics": [
                    {
                        "name": "Footwear",
                        "prompts": [
                            {"text": "best family running shoes", "intent": "discovery"}
                        ],
                    }
                ]
            }
        )
    )
    monkeypatch.setattr(prompts_api, "create_model_gateway", lambda: agent)

    response = await client.post(
        f"/api/v1/prompt-sets/{prompt_set_id}/generate",
        json={
            "count": 1,
            "topic_id": topic["id"],
            "confirm_send_evidence": True,
        },
    )

    assert response.status_code == 201
    body = response.json()
    assert [item["id"] for item in body["topics"]] == [topic["id"]]
    assert body["candidates"][0]["topic_id"] == topic["id"]
    assert '"topic":"Footwear"' in agent.calls[0]["user"]
    assert (
        '"topic_description":"Running and everyday shoes for families."'
        in agent.calls[0]["user"]
    )
    topics = await project_topics(project["id"])
    assert {item["name"] for item in topics} == {"Footwear", "Running Shoes"}


def _agent_response_with_n_prompts(
    n: int, *, topic: str = "Running Shoes", discriminator: str = ""
) -> str:
    """A single-topic response with distinct texts for occupancy tests."""
    text_prefix = discriminator or topic
    return json.dumps(
        {
            "topics": [
                {
                    "name": topic,
                    "prompts": [
                        {
                            "text": (
                                f"{chr(97 + i) * 20} {text_prefix} running "
                                "shoes for buyers"
                            ),
                            "intent": "discovery",
                        }
                        for i in range(n)
                    ],
                }
            ]
        }
    )


@pytest.mark.asyncio
async def test_generate_stages_validated_requested_count_for_acceptance(
    client: httpx.AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The requested, validated set is staged for review."""
    _, prompt_set_id = await make_project_and_set(client, "pool1@example.com")
    agent = FakeAgent(response=_agent_response_with_n_prompts(25))
    monkeypatch.setattr(prompts_api, "create_model_gateway", lambda: agent)

    resp = await client.post(
        f"/api/v1/prompt-sets/{prompt_set_id}/generate",
        json={"count": 20, "confirm_send_evidence": True},
    )
    assert resp.status_code == 201
    body = resp.json()
    # A single topic can fill the requested count without recipe limits.
    assert len(body["candidates"]) == 20


@pytest.mark.asyncio
async def test_generation_stages_comparison_candidates_without_charging_capacity(
    client: httpx.AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """Generation charges nothing: a full prompt allowance still stages."""
    project, prompt_set_id = await make_project_and_set(client, "brandcap@example.com")
    async with session_factory() as session:
        await revoke_signup_baseline_grants(
            session, workspace_id=uuid.UUID(project["workspace_id"])
        )
        await seed_occupancy_grants(
            session,
            workspace_id=uuid.UUID(project["workspace_id"]),
            grants=(GrantSpec(key=KEY_PROMPT_SLOTS, value=2),),
        )
        await session.commit()
    for i in range(2):
        await create_prompt(prompt_set_id, f"best Acme running shoes for terrain {i}")
    comparison_prompts = [
        {"text": text, "intent": "comparison"}
        for text in (
            "Acme Corp or Globex for wet trail running",
            "Should I choose Globex over Acme Corp for marathon shoes",
            "Compare Acme Corp and Globex shoes for flat feet",
            "Is Globex better than Acme Corp for school trainers",
            "Acme Corp versus Globex when buying wide running shoes",
            "Would Globex or Acme Corp suit daily walking",
            "How do Acme Corp and Globex compare on hiking footwear",
            "Which lasts longer, Acme Corp or Globex running shoes",
            "For gym training, is Acme Corp better than Globex",
            "Between Globex and Acme Corp, who makes lighter shoes",
        )
    ]
    agent = FakeAgent(
        response=json.dumps(
            {"topics": [{"name": "Running Shoes", "prompts": comparison_prompts}]}
        )
    )
    monkeypatch.setattr(prompts_api, "create_model_gateway", lambda: agent)

    resp = await client.post(
        f"/api/v1/prompt-sets/{prompt_set_id}/generate",
        json={"count": 10, "cohort": "comparison", "confirm_send_evidence": True},
    )
    assert resp.status_code == 201
    candidates = resp.json()["candidates"]
    assert len(candidates) == 10
    assert {candidate["cohort"] for candidate in candidates} == {"comparison"}


@pytest.mark.asyncio
async def test_generate_brand_diagnostic_uses_named_cohort_rules(
    client: httpx.AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    _, prompt_set_id = await make_project_and_set(client, "diagnostic@example.com")
    agent = FakeAgent(
        response=json.dumps(
            {
                "topics": [
                    {
                        "name": "Running Shoes",
                        "prompts": [
                            {
                                "text": (
                                    "Is Acme Corp reliable for long distance "
                                    "running shoes"
                                ),
                                "intent": "discovery",
                            }
                        ],
                    }
                ]
            }
        )
    )
    monkeypatch.setattr(prompts_api, "create_model_gateway", lambda: agent)

    response = await client.post(
        f"/api/v1/prompt-sets/{prompt_set_id}/generate",
        json={
            "count": 1,
            "cohort": "brand_diagnostic",
            "confirm_send_evidence": True,
        },
    )

    assert response.status_code == 201
    assert [item["cohort"] for item in response.json()["candidates"]] == [
        "brand_diagnostic"
    ]
    assert "Every query must name the tracked brand" in agent.calls[0]["system"]


@pytest.mark.asyncio
async def test_generate_counts_intra_response_duplicates(
    client: httpx.AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Duplicate texts within one model response are counted as dropped."""
    _, prompt_set_id = await make_project_and_set(client, "dup1@example.com")
    agent = FakeAgent(
        response=json.dumps(
            {
                "prompts": [
                    {
                        "slot_id": "q1",
                        "text": "Best running shoes for flat feet",
                        "buyer_stage": "consideration",
                        "prompt_intent": "recommend",
                    },
                    {
                        "slot_id": "q1",
                        "text": "Best running shoes for flat feet",
                        "buyer_stage": "consideration",
                        "prompt_intent": "recommend",
                    },
                    {
                        "slot_id": "q2",
                        "buyer_stage": "consideration",
                        "prompt_intent": "recommend",
                        "text": "Where to buy running shoes for marathon training",
                    },
                    {
                        "slot_id": "q3",
                        "buyer_stage": "consideration",
                        "prompt_intent": "recommend",
                        "text": "Are cheap running shoes worth buying for beginners",
                    },
                    {
                        "slot_id": "q4",
                        "buyer_stage": "consideration",
                        "prompt_intent": "recommend",
                        "text": "Best road running shoes compared with trail options",
                    },
                ]
            }
        )
    )
    monkeypatch.setattr(prompts_api, "create_model_gateway", lambda: agent)
    resp = await client.post(
        f"/api/v1/prompt-sets/{prompt_set_id}/generate",
        json={"count": 5, "confirm_send_evidence": True},
    )
    assert resp.status_code == 201
    body = resp.json()
    assert len(body["candidates"]) == 4
    assert body["dropped_duplicates"] == 1


@pytest.mark.asyncio
async def test_generate_bounds_existing_prompt_context(
    client: httpx.AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The existing-prompt list sent to the model is capped by config."""
    from app.core.config.prompts import prompt_generation_settings

    _, prompt_set_id = await make_project_and_set(client, "ctx1@example.com")
    monkeypatch.setattr(prompt_generation_settings, "existing_prompt_context_limit", 3)
    for i in range(6):
        await create_prompt(prompt_set_id, f"existing acme context prompt {i}")

    agent = FakeAgent(response=_agent_response_with_n_prompts(2, topic="New"))
    monkeypatch.setattr(prompts_api, "create_model_gateway", lambda: agent)
    resp = await client.post(
        f"/api/v1/prompt-sets/{prompt_set_id}/generate",
        json={"count": 2, "confirm_send_evidence": True},
    )
    assert resp.status_code == 201
    sent = agent.calls[0]["user"]
    # Only the most recent 3 existing prompts appear in the "do NOT duplicate"
    # block: the context is the tail of the set, so 3, 4 and 5 are sent and the
    # older 0, 1 and 2 are left out.
    included = [i for i in range(6) if f"existing acme context prompt {i}" in sent]
    assert included == [3, 4, 5]


@pytest.mark.asyncio
async def test_concurrent_generation_stages_both_runs_without_duplicates(
    client: httpx.AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """Concurrent generation keeps both runs' candidates without duplicates."""
    import asyncio

    from app.domain.prompts.generation import generate_prompts
    from app.domain.prompts.schemas import PromptGenerateRequest

    project, prompt_set_id = await make_project_and_set(client, "conc1@example.com")

    # Resolve the workspace id from the project's owning workspace.
    from app.models.project import Project

    async with session_factory() as session:
        proj = await session.get(Project, uuid.UUID(project["id"]))
        assert proj is not None
        workspace_id = proj.workspace_id

    class _CountingAgent:
        model = "fake-model"
        base_url_host = "agent.test"

        def __init__(self, discriminator: str, n: int) -> None:
            self._response = _agent_response_with_n_prompts(
                n, discriminator=discriminator
            )
            self._discriminator = discriminator

        async def complete_structured_json(
            self,
            *,
            system: str,
            user: str,
            schema_name: str,
            schema: dict[str, object],
        ) -> str:
            # Yield so both coroutines interleave before either persists.
            await asyncio.sleep(0)
            return await FakeAgent(
                response=self._response,
                fallback_discriminator=self._discriminator,
            ).complete_structured_json(
                system=system, user=user, schema_name=schema_name, schema=schema
            )

    async def _run(topic: str, n: int) -> int:
        async with session_factory() as session:
            result = await generate_prompts(
                session,
                workspace_id=workspace_id,
                prompt_set_id=uuid.UUID(prompt_set_id),
                payload=PromptGenerateRequest(count=n, confirm_send_evidence=True),
                agent=cast(DefaultAgentClient, _CountingAgent(topic, n)),
            )
            return len(result.candidates)

    alpha_count, beta_count = await asyncio.gather(_run("Alpha", 15), _run("Beta", 15))

    async with session_factory() as session:
        staged = (
            (
                await session.execute(
                    select(PromptCandidate).where(
                        PromptCandidate.prompt_set_id == uuid.UUID(prompt_set_id),
                    )
                )
            )
            .scalars()
            .all()
        )
    texts = [candidate.text for candidate in staged]
    # Both runs' candidates survive, and neither collides with the other's.
    assert len(staged) == alpha_count + beta_count
    assert len(texts) == len(set(texts))
    assert any("Alpha" in text for text in texts)
    assert any("Beta" in text for text in texts)


@pytest.mark.asyncio
async def test_generation_racing_prompt_set_delete_is_scoped_not_found(
    client: httpx.AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """Delete the set mid-generation (provider paused) -> scoped 404, not 500."""
    import asyncio

    from app.domain.prompts.generation import generate_prompts
    from app.domain.prompts.generation_errors import PromptSetNotFoundError
    from app.domain.prompts.schemas import PromptGenerateRequest
    from app.models.project import Project

    project, prompt_set_id = await make_project_and_set(client, "race1@example.com")
    async with session_factory() as session:
        proj = await session.get(Project, uuid.UUID(project["id"]))
        assert proj is not None
        workspace_id = proj.workspace_id

    provider_entered = asyncio.Event()
    delete_done = asyncio.Event()

    class _PausingAgent:
        model = "fake-model"
        base_url_host = "agent.test"

        async def complete_structured_json(
            self,
            *,
            system: str,
            user: str,
            schema_name: str,
            schema: dict[str, object],
        ) -> str:
            # Signal that the read txn is committed, then wait until the set
            # has been deleted before returning (so generation re-resolves a
            # set that no longer exists).
            provider_entered.set()
            await delete_done.wait()
            return await FakeAgent(
                response=_agent_response_with_n_prompts(3, topic="Race")
            ).complete_structured_json(
                system=system, user=user, schema_name=schema_name, schema=schema
            )

    async def _generate() -> BaseException | None:
        async with session_factory() as session:
            try:
                await generate_prompts(
                    session,
                    workspace_id=workspace_id,
                    prompt_set_id=uuid.UUID(prompt_set_id),
                    payload=PromptGenerateRequest(count=3, confirm_send_evidence=True),
                    agent=cast(DefaultAgentClient, _PausingAgent()),
                )
                return None
            except BaseException as exc:  # noqa: BLE001
                return exc

    async def _delete() -> None:
        await provider_entered.wait()
        # The TypeScript delete's locks: project, then the set.
        async with session_factory() as session:
            await acquire_project_lock(session, uuid.UUID(project["id"]))
            await acquire_prompt_set_lock(session, uuid.UUID(prompt_set_id))
            await session.execute(
                delete(PromptSet).where(PromptSet.id == uuid.UUID(prompt_set_id))
            )
            await session.commit()
        delete_done.set()

    gen_result, _ = await asyncio.gather(_generate(), _delete())
    # Disappearance surfaces as the scoped domain error the endpoint maps to
    # 404 — never an unhandled FK 500.
    assert isinstance(gen_result, PromptSetNotFoundError)


@pytest.mark.asyncio
async def test_generation_racing_topic_delete_is_scoped_validation_error(
    client: httpx.AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """Delete the target topic mid-generation (paused) -> scoped 422, not 500."""
    import asyncio

    from app.domain.prompts.generation import (
        GenerationValidationError,
        generate_prompts,
    )
    from app.domain.prompts.schemas import PromptGenerateRequest
    from app.models.project import Project

    project, prompt_set_id = await make_project_and_set(client, "race2@example.com")
    topic = await create_topic(project["id"], "Doomed")
    async with session_factory() as session:
        proj = await session.get(Project, uuid.UUID(project["id"]))
        assert proj is not None
        workspace_id = proj.workspace_id

    provider_entered = asyncio.Event()
    delete_done = asyncio.Event()

    class _PausingAgent:
        model = "fake-model"
        base_url_host = "agent.test"

        async def complete_structured_json(
            self,
            *,
            system: str,
            user: str,
            schema_name: str,
            schema: dict[str, object],
        ) -> str:
            provider_entered.set()
            await delete_done.wait()
            return await FakeAgent(
                response=_agent_response_with_n_prompts(2, topic="Whatever")
            ).complete_structured_json(
                system=system, user=user, schema_name=schema_name, schema=schema
            )

    async def _generate() -> BaseException | None:
        async with session_factory() as session:
            try:
                await generate_prompts(
                    session,
                    workspace_id=workspace_id,
                    prompt_set_id=uuid.UUID(prompt_set_id),
                    payload=PromptGenerateRequest(
                        count=2,
                        confirm_send_evidence=True,
                        topic_id=uuid.UUID(topic["id"]),
                    ),
                    agent=cast(DefaultAgentClient, _PausingAgent()),
                )
                return None
            except BaseException as exc:  # noqa: BLE001
                return exc

    async def _delete() -> None:
        await provider_entered.wait()
        # The TypeScript topic delete takes the project lock first.
        async with session_factory() as session:
            await acquire_project_lock(session, uuid.UUID(project["id"]))
            await session.execute(
                delete(Topic).where(Topic.id == uuid.UUID(topic["id"]))
            )
            await session.commit()
        delete_done.set()

    gen_result, _ = await asyncio.gather(_generate(), _delete())
    # Target topic gone -> scoped validation error the endpoint maps to 422.
    assert isinstance(gen_result, GenerationValidationError)
    # No candidates were staged into the vanished topic.
    async with session_factory() as session:
        remaining = (
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
    assert remaining == []


@pytest.mark.asyncio
async def test_generation_unrelated_integrity_error_is_not_remapped(
    client: httpx.AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """An IntegrityError unrelated to a lost set/topic FK must NOT be masked.

    When the referenced set and (unscoped) topics are all still present, an
    insert-time integrity error is a genuine constraint bug, so it must
    re-raise as ``IntegrityError`` — never a phantom ``PromptSetNotFoundError``
    (404) or ``GenerationValidationError`` (422).
    """
    from sqlalchemy.exc import IntegrityError

    import app.domain.prompts.generation as generation
    from app.domain.prompts.generation import generate_prompts
    from app.domain.prompts.schemas import PromptGenerateRequest
    from app.models.project import Project

    project, prompt_set_id = await make_project_and_set(client, "unrel1@example.com")
    async with session_factory() as session:
        proj = await session.get(Project, uuid.UUID(project["id"]))
        assert proj is not None
        workspace_id = proj.workspace_id

    async def _boom(*args: object, **kwargs: object) -> object:
        raise IntegrityError("boom", params=None, orig=Exception("unrelated"))

    monkeypatch.setattr(generation, "stage_candidates", _boom)

    with pytest.raises(IntegrityError):
        async with session_factory() as session:
            await generate_prompts(
                session,
                workspace_id=workspace_id,
                prompt_set_id=uuid.UUID(prompt_set_id),
                payload=PromptGenerateRequest(count=2, confirm_send_evidence=True),
                agent=cast(
                    DefaultAgentClient,
                    FakeAgent(response=_agent_response_with_n_prompts(2)),
                ),
            )


# --------------------------------------------------------------------------
# Audits only consume active prompts (no auto-run of AI suggestions)
# --------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_planner_excludes_proposed_and_archived_prompts(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    async with session_factory() as session:
        seed = await seed_audit_fixtures(session, prompt_count=3)
        for prompt_id, status in zip(
            seed.prompt_ids[:2], ("proposed", "archived"), strict=True
        ):
            prompt = await session.get(Prompt, prompt_id)
            assert prompt is not None
            prompt.status = status
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
        # Only the one still-active prompt produced a slot.
        assert len(tasks) == 1

    # Explicitly requesting a proposed prompt is a validation error.
    async with session_factory() as session:
        with pytest.raises(AuditValidationError):
            await create_audit(
                session,
                trigger=AUDIT_TRIGGER_MANUAL,
                workspace_id=seed.workspace_id,
                project_id=seed.project_id,
                engines=seed.engines,
                prompt_set_id=seed.prompt_set_id,
                prompt_ids=[seed.prompt_ids[0]],
                repetitions=1,
            )
