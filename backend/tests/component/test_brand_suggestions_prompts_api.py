"""Component tests for the stateless prompt-suggestion endpoint (setup-form AI).

The default agent is always faked at the API boundary
(``app.api.brand_suggestions.DefaultAgentClient``) so no test ever performs
live provider I/O, regardless of what keys exist in the developer's ``.env``.

Covers:
  - happy path (brand context reaches the agent; topics flatten to themed rows);
  - backend-enforced ``confirm_send_evidence`` + count cap (422, agent never
    called);
  - unconfigured agent -> 503, but an invalid payload -> 422 first;
  - unparseable model output -> 502;
  - dedupe against the ``existing_prompt_texts`` sent in the request body;
  - unauthenticated requests are rejected.

Mirrors ``test_brand_suggestions_api.py``.
"""

from __future__ import annotations

import json

import httpx
import pytest

import app.api.brand_suggestions as brand_suggestions_api
import app.domain.projects.suggestions as suggestions_domain
from app.connectors.agent.client import AgentNotConfiguredError
from app.connectors.web_evidence.brand_evidence import BrandEvidencePage
from app.domain.projects.brand_evidence import BrandEvidence

VALID_PROMPT_RESPONSE = json.dumps(
    {
        "topics": [
            {
                "name": "Everyday basics",
                "prompts": [
                    {
                        "text": "What are the best affordable basics for kids?",
                        "intent": "discovery",
                    },
                    {
                        "text": "Acme vs Globex — which is better value?",
                        "intent": "comparison",
                    },
                ],
            },
            {
                "name": "Homewares",
                "prompts": [
                    {
                        "text": "Where can I buy cheap homewares in Australia?",
                        "intent": "purchase",
                    }
                ],
            },
        ]
    }
)


class FakeAgent:
    """Stands in for DefaultAgentClient; records calls, returns a canned body."""

    model = "fake-model"
    base_url_host = "agent.test"

    def __init__(self, response: str = VALID_PROMPT_RESPONSE) -> None:
        self.response = response
        self.calls: list[dict[str, str]] = []

    async def complete_json(self, *, system: str, user: str) -> str:
        self.calls.append({"system": system, "user": user})
        return self.response


@pytest.fixture
def fake_agent(monkeypatch: pytest.MonkeyPatch) -> FakeAgent:
    agent = FakeAgent()
    monkeypatch.setattr(brand_suggestions_api, "DefaultAgentClient", lambda: agent)
    return agent


@pytest.fixture(autouse=True)
def stub_brand_evidence(monkeypatch: pytest.MonkeyPatch) -> None:
    """Stub the brand-website crawl so no test hits the live internet."""

    async def _collect(website_url: str) -> BrandEvidence:
        return BrandEvidence(
            pages=(
                BrandEvidencePage(
                    url="https://acme.com/",
                    title="Acme Corp",
                    meta_description="Australian family retailer.",
                    text=" ".join(["retailer"] * 200),
                ),
            )
        )

    monkeypatch.setattr(suggestions_domain, "collect_brand_evidence", _collect)


async def _register(client: httpx.AsyncClient, email: str) -> None:
    resp = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "password123"},
    )
    assert resp.status_code == 201


def _prompt_payload(**overrides: object) -> dict:
    payload = {
        "brand_name": "Acme Corp",
        "website_url": "https://acme.com",
        "brand_aliases": ["Acme", "ACME Inc"],
        "country_code": "AU",
        "language_code": "en-AU",
        "positioning": "Value-priced family basics",
        "target_audience": "Budget-conscious families",
        "confirm_send_evidence": True,
        "competitor_names": ["Globex"],
        "existing_prompt_texts": [],
    }
    payload.update(overrides)
    return payload


# --------------------------------------------------------------------------
# Happy path
# --------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_suggest_prompts_happy_path(
    client: httpx.AsyncClient, fake_agent: FakeAgent
) -> None:
    await _register(client, "suggest-prompts1@example.com")

    resp = await client.post(
        "/api/v1/brand-suggestions/prompts", json=_prompt_payload(count=8)
    )

    assert resp.status_code == 201
    body = resp.json()
    assert [(p["text"], p["theme"], p["intent"]) for p in body["prompts"]] == [
        (
            "What are the best affordable basics for kids?",
            "Everyday basics",
            "discovery",
        ),
        ("Acme vs Globex — which is better value?", "Everyday basics", "comparison"),
        (
            "Where can I buy cheap homewares in Australia?",
            "Homewares",
            "purchase",
        ),
    ]
    assert body["dropped_duplicates"] == 0
    # The agent's topic grouping is preserved, not flattened away: onboarding
    # persists from this to create the same Topic rows /generate creates.
    assert [(t["name"], [p["text"] for p in t["prompts"]]) for t in body["topics"]] == [
        (
            "Everyday basics",
            [
                "What are the best affordable basics for kids?",
                "Acme vs Globex — which is better value?",
            ],
        ),
        ("Homewares", ["Where can I buy cheap homewares in Australia?"]),
    ]
    # Brand evidence reached the agent's user message (after consent).
    assert len(fake_agent.calls) == 1
    assert "Acme Corp" in fake_agent.calls[0]["user"]
    assert "AU" in fake_agent.calls[0]["user"]
    assert "Value-priced family basics" in fake_agent.calls[0]["user"]
    assert "Globex" in fake_agent.calls[0]["user"]
    assert "Generate exactly 8 prompts" in fake_agent.calls[0]["user"]


@pytest.mark.asyncio
async def test_suggest_prompts_blanks_unknown_intent(
    client: httpx.AsyncClient, fake_agent: FakeAgent
) -> None:
    await _register(client, "suggest-prompts2@example.com")
    fake_agent.response = json.dumps(
        {
            "topics": [
                {
                    "name": "Basics",
                    "prompts": [{"text": "Best basics for kids?", "intent": "NAV"}],
                }
            ]
        }
    )

    resp = await client.post(
        "/api/v1/brand-suggestions/prompts", json=_prompt_payload()
    )

    assert resp.status_code == 201
    assert resp.json()["prompts"][0]["intent"] == ""


# --------------------------------------------------------------------------
# Consent gate + bounds (422, agent never called)
# --------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_suggest_prompts_requires_evidence_confirmation(
    client: httpx.AsyncClient, fake_agent: FakeAgent
) -> None:
    await _register(client, "suggest-prompts3@example.com")

    resp = await client.post(
        "/api/v1/brand-suggestions/prompts",
        json=_prompt_payload(confirm_send_evidence=False),
    )

    assert resp.status_code == 422
    assert resp.json()["detail"]["code"] == "suggestion_invalid"
    assert fake_agent.calls == []


@pytest.mark.asyncio
async def test_suggest_prompts_rejects_count_over_cap(
    client: httpx.AsyncClient, fake_agent: FakeAgent
) -> None:
    await _register(client, "suggest-prompts4@example.com")

    resp = await client.post(
        "/api/v1/brand-suggestions/prompts",
        json=_prompt_payload(count=10_000),
    )

    assert resp.status_code == 422
    assert resp.json()["detail"]["code"] == "suggestion_invalid"
    assert fake_agent.calls == []


# --------------------------------------------------------------------------
# Agent configuration (503) + precedence
# --------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_suggest_prompts_unconfigured_agent_returns_503(
    client: httpx.AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    await _register(client, "suggest-prompts5@example.com")

    def _raise() -> None:
        raise AgentNotConfiguredError("no key")

    monkeypatch.setattr(brand_suggestions_api, "DefaultAgentClient", _raise)

    resp = await client.post(
        "/api/v1/brand-suggestions/prompts", json=_prompt_payload()
    )

    assert resp.status_code == 503
    detail = resp.json()["detail"]
    assert detail["code"] == "agent_not_configured"
    assert "DEFAULT_AGENT_API_KEY" in detail["message"]


@pytest.mark.asyncio
async def test_suggest_prompts_invalid_payload_is_422_even_when_unconfigured(
    client: httpx.AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    await _register(client, "suggest-prompts6@example.com")

    def _raise() -> None:
        raise AgentNotConfiguredError("no key")

    monkeypatch.setattr(brand_suggestions_api, "DefaultAgentClient", _raise)

    resp = await client.post(
        "/api/v1/brand-suggestions/prompts",
        json=_prompt_payload(confirm_send_evidence=False),
    )

    assert resp.status_code == 422
    assert resp.json()["detail"]["code"] == "suggestion_invalid"


# --------------------------------------------------------------------------
# Unparseable output (502)
# --------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_suggest_prompts_unparseable_output_returns_502(
    client: httpx.AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    await _register(client, "suggest-prompts7@example.com")
    agent = FakeAgent(response="this is not json")
    monkeypatch.setattr(brand_suggestions_api, "DefaultAgentClient", lambda: agent)

    resp = await client.post(
        "/api/v1/brand-suggestions/prompts", json=_prompt_payload()
    )

    assert resp.status_code == 502
    assert resp.json()["detail"]["code"] == "suggestion_unparseable"


# --------------------------------------------------------------------------
# Dedupe against existing form values
# --------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_suggest_prompts_dedupes_against_existing(
    client: httpx.AsyncClient, fake_agent: FakeAgent
) -> None:
    await _register(client, "suggest-prompts8@example.com")

    resp = await client.post(
        "/api/v1/brand-suggestions/prompts",
        json=_prompt_payload(
            existing_prompt_texts=["what are the best affordable basics for kids"]
        ),
    )

    assert resp.status_code == 201
    body = resp.json()
    assert [p["text"] for p in body["prompts"]] == [
        "Acme vs Globex — which is better value?",
        "Where can I buy cheap homewares in Australia?",
    ]
    assert body["dropped_duplicates"] == 1


@pytest.mark.asyncio
async def test_suggest_prompts_count_cap_applies_to_topics_too(
    client: httpx.AsyncClient, fake_agent: FakeAgent
) -> None:
    """The cap must trim both views identically.

    ``prompts`` is capped to ``count``; if ``topics`` were returned ungrouped
    from the full set, a caller persisting from the grouped view would create
    more prompts than the cap allows.
    """
    await _register(client, "suggest-prompts9@example.com")

    resp = await client.post(
        "/api/v1/brand-suggestions/prompts", json=_prompt_payload(count=1)
    )

    assert resp.status_code == 201
    body = resp.json()
    assert len(body["prompts"]) == 1
    assert sum(len(t["prompts"]) for t in body["topics"]) == 1
    # The topic left with no surviving prompts is omitted, not returned empty.
    assert [t["name"] for t in body["topics"]] == ["Everyday basics"]


# --------------------------------------------------------------------------
# Auth
# --------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_suggest_prompts_requires_authentication(
    client: httpx.AsyncClient, fake_agent: FakeAgent
) -> None:
    resp = await client.post(
        "/api/v1/brand-suggestions/prompts", json=_prompt_payload()
    )

    assert resp.status_code == 401
    assert fake_agent.calls == []
