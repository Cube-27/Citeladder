"""Admission of the single onboarding intent portfolio."""

from __future__ import annotations

import json

import pytest

from app.domain.projects.offering_harvest import OfferingHarvest
from app.domain.projects.onboarding import portfolio_generation as pg


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
    assert {item["slot_id"] for item in result.prompts} == {"need-1", "need-2"}
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
async def test_one_repair_then_stop(monkeypatch: pytest.MonkeyPatch) -> None:
    class Gateway:
        base_url_host = "fake"
        model = "fake-model"

        def __init__(self) -> None:
            self.calls = 0

        async def complete_structured_json(self, **_kwargs) -> str:
            self.calls += 1
            if self.calls == 1:
                return json.dumps({**_response(), "topics": []})
            return json.dumps(_response())

    gateway = Gateway()
    monkeypatch.setattr(pg, "create_model_gateway", lambda: gateway)
    result = await pg.generate_portfolio(
        brand_name="Acme",
        brand_terms=["Acme"],
        primary_market="US",
        profile={"category": "analytics software"},
        competitors=["Beta"],
        competitor_terms=["Beta"],
        harvest=OfferingHarvest(),
        page_evidence=[{"evidence_ref": "research-1", "text": "Process mining"}],
    )
    assert gateway.calls == 2
    assert len(result.topics) == 2
