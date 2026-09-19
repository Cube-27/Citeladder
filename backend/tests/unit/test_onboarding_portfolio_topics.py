"""Admission of the single onboarding intent portfolio."""

from __future__ import annotations

import asyncio
import json

import pytest

from app.connectors.answer_engines.errors import ProviderError
from app.core.config.brand_discovery import brand_discovery_settings
from app.domain.projects.discovery_schemas import (
    BrandDiscoveryComplete,
    ConfirmedDiscoveryProfile,
)
from app.domain.projects.offering_harvest import OfferingHarvest
from app.domain.projects.onboarding import portfolio_generation as pg
from app.domain.projects.onboarding import service as onboarding_service


def _response() -> dict:
    return {
        "intents": [
            {
                "id": "need-1",
                "buyer_need": "Choose workflow analytics software",
                "decision_intent": "recommend",
                "buyer_stage": "consideration",
            },
            {
                "id": "need-2",
                "buyer_need": "Compare process mining providers",
                "decision_intent": "compare",
                "buyer_stage": "decision",
            },
        ],
        "topics": [
            {
                "name": "Workflow Analytics",
                "description": "Understand workflow bottlenecks",
                "intent_ids": ["need-1"],
                "evidence_refs": [pg.CONFIRMED_CONTEXT_REF],
                "prompts": [
                    {
                        "text": "Which software helps find workflow bottlenecks",
                        "intent_id": "need-1",
                    }
                ],
            },
            {
                "name": "Process Mining",
                "description": "Compare process mining options",
                "intent_ids": ["need-2"],
                "evidence_refs": ["research-1"],
                "prompts": [
                    {
                        "text": "How do process mining providers compare",
                        "intent_id": "need-2",
                    }
                ],
            },
        ],
        "diagnostic_prompts": [
            {"text": "Can Acme help find workflow bottlenecks", "intent_id": "need-1"}
        ],
        "comparison_prompts": [
            {
                "text": "How does Acme compare with Beta for process mining",
                "intent_id": "need-2",
            }
        ],
    }


def _admit(response: dict) -> pg.PortfolioResult:
    return pg._admit(
        pg.PortfolioEnvelope.model_validate(response),
        brand_name="Acme",
        brand_terms=["Acme"],
        competitor_terms=["Beta"],
        category_terms=["analytics software"],
        known_refs={pg.CONFIRMED_CONTEXT_REF, "research-1"},
    )


def test_intent_topic_prompt_links_and_evidence_are_admitted() -> None:
    result = _admit(_response())
    assert len(result.topics) == 2
    assert len(result.prompts) == 4
    assert {item["buyer_intent_id"] for item in result.prompts} == {
        "need-1",
        "need-2",
    }
    assert {item["cohort"] for item in result.prompts} == {
        "core",
        "brand_diagnostic",
        "comparison",
    }
    assert all(item["topic_id"] for item in result.prompts if item["cohort"] == "core")


@pytest.mark.parametrize(
    "change",
    [
        lambda value: value["topics"][0]["evidence_refs"].append("invented"),
        lambda value: value["topics"][0]["prompts"][0].update(intent_id="need-2"),
        lambda value: value["topics"][0]["intent_ids"].append("missing"),
    ],
)
def test_unknown_refs_and_broken_intent_links_reject_response(change) -> None:
    response = _response()
    change(response)
    with pytest.raises(ValueError):
        _admit(response)


def test_empty_and_duplicate_topics_drop_without_filler() -> None:
    response = _response()
    response["topics"][0]["prompts"] = []
    response["topics"].append(response["topics"][1].copy())
    result = _admit(response)
    assert [item.name for item in result.topics] == ["Process Mining"]
    assert [item["id"] for item in result.intents] == ["need-2"]
    assert "empty_topic_dropped" in result.warnings


def test_topic_name_whitespace_cleanup_preserves_prompt_binding() -> None:
    response = _response()
    response["topics"][0]["name"] = "Workflow   Analytics"
    result = _admit(response)
    assert {topic.name for topic in result.topics} == {
        "Workflow Analytics",
        "Process Mining",
    }


def test_core_capacity_preserves_later_topic_coverage() -> None:
    response = _response()
    response["topics"][0]["prompts"] = [
        {
            "text": f"Which workflow analytics option handles bottleneck case {index}",
            "intent_id": "need-1",
        }
        for index in range(25)
    ]
    result = _admit(response)
    assert len(result.topics) == 2
    assert len([row for row in result.prompts if row["cohort"] == "core"]) == 20
    core_intents = {
        row["buyer_intent_id"] for row in result.prompts if row["cohort"] == "core"
    }
    assert core_intents == {
        "need-1",
        "need-2",
    }


def test_no_surviving_core_portfolio_rejects_response() -> None:
    response = _response()
    for topic in response["topics"]:
        topic["prompts"] = []
    with pytest.raises(ValueError, match="core portfolio"):
        _admit(response)


def test_placeholder_and_exact_duplicate_prompts_are_dropped() -> None:
    response = _response()
    response["topics"][0]["prompts"].extend(
        [
            {
                "text": "Which software helps find workflow bottlenecks",
                "intent_id": "need-1",
            },
            {"text": "Which software helps find [problem]", "intent_id": "need-1"},
        ]
    )
    result = _admit(response)
    assert len([row for row in result.prompts if row["cohort"] == "core"]) == 2
    assert "prompt_rejected:duplicate" in result.warnings
    assert "prompt_rejected:placeholder" in result.warnings


@pytest.mark.asyncio
async def test_portfolio_uses_one_model_call(monkeypatch: pytest.MonkeyPatch) -> None:
    class Gateway:
        base_url_host = "fake"
        model = "fake-model"

        def __init__(self) -> None:
            self.calls = 0
            self.users: list[str] = []

        async def complete_structured_json(self, **kwargs) -> str:
            self.calls += 1
            self.users.append(kwargs["user"])
            return json.dumps(_response())

    gateway = Gateway()
    monkeypatch.setattr(pg, "create_model_gateway", lambda: gateway)
    result = await pg.generate_portfolio(
        brand_name="Acme",
        brand_terms=["Acme"],
        primary_market="US",
        profile={
            "category": "analytics software",
            "business_context": {
                "category": "analytics software",
                "positioning": "Suggested market leader",
                "language_code": "en-US",
                "field_sources": {
                    "category": "reviewed",
                    "positioning": "inferred",
                    "language_code": "reviewed",
                },
            },
        },
        competitors=["Beta"],
        competitor_terms=["Beta"],
        harvest=OfferingHarvest(),
        page_evidence=[{"evidence_ref": "research-1", "text": "Process mining"}],
    )
    assert gateway.calls == 1
    assert len(result.topics) == 2
    request = json.loads(gateway.users[0])
    assert request["confirmed_context"]["facts"]["language_code"] == "en-US"
    assert "positioning" not in request["confirmed_context"]["facts"]
    assert request["provisional_research_context"]["facts"]["positioning"] == (
        "Suggested market leader"
    )


@pytest.mark.asyncio
async def test_invalid_portfolio_has_no_hidden_repair_call(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class Gateway:
        calls = 0

        async def complete_structured_json(self, **_kwargs) -> str:
            self.calls += 1
            return "not json"

    gateway = Gateway()
    monkeypatch.setattr(pg, "create_model_gateway", lambda: gateway)
    with pytest.raises(ValueError):
        await pg.generate_portfolio(
            brand_name="Acme",
            brand_terms=["Acme"],
            primary_market="US",
            profile={"category": "analytics software"},
            competitors=[],
            competitor_terms=[],
            harvest=OfferingHarvest(),
            page_evidence=[],
        )
    assert gateway.calls == 1


@pytest.mark.asyncio
async def test_provider_failure_does_not_start_another_model_call(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class Gateway:
        base_url_host = "fake"
        model = "fake-model"
        calls = 0

        async def complete_structured_json(self, **_kwargs) -> str:
            self.calls += 1
            raise ProviderError(
                "temporarily unavailable", error_code="rate_limit", retryable=True
            )

    gateway = Gateway()
    monkeypatch.setattr(pg, "create_model_gateway", lambda: gateway)
    harvest = OfferingHarvest()
    with pytest.raises(ProviderError):
        await pg.generate_portfolio(
            brand_name="Acme",
            brand_terms=["Acme"],
            primary_market="US",
            profile={"category": "analytics software"},
            competitors=[],
            competitor_terms=[],
            harvest=harvest,
            page_evidence=[],
        )
    assert gateway.calls == 1


@pytest.mark.asyncio
async def test_portfolio_timeout_ends_a_slow_completion_attempt(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def hang(**_kwargs):
        await asyncio.Event().wait()

    monkeypatch.setattr(onboarding_service, "generate_portfolio", hang)
    monkeypatch.setattr(
        brand_discovery_settings, "portfolio_generation_timeout_seconds", 0.001
    )
    payload = BrandDiscoveryComplete(
        profile=ConfirmedDiscoveryProfile(category="Retail"),
        domains=["acme.com"],
    )
    harvest = OfferingHarvest()
    with pytest.raises(onboarding_service.BrandDiscoveryError, match="Initial prompt"):
        await onboarding_service._generate_confirmed_portfolio(
            payload=payload,
            domains=["acme.com"],
            brand_name="Acme",
            primary_market="AU",
            language_code="en",
            competitors=[],
            harvest=harvest,
            page_evidence=[],
        )
