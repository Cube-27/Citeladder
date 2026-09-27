"""JEV shadow judgments: core state, duplicate options, flags and state hash."""

from __future__ import annotations

import uuid
from types import SimpleNamespace

import pytest

from app.connectors.jev import JevDecision
from app.domain.prompts.generation_contract import SuggestedPrompt, SuggestedTopic
from app.domain.prompts.quality_judge import build_requests, decision_record

TOPIC_ID = uuid.uuid4()
BRAND_CONTEXT = {
    "brand_name": "Acme Corp",
    "brand_aliases": ["Acme"],
    "competitors": [{"name": "Globex"}],
    "business_context": {
        "category": "footwear",
        "products_services": ["running shoes"],
        "description": "Acme Corp sells shoes.",
    },
}


def _requests(tracked: list[str], texts: list[str]):
    prompt_set = SimpleNamespace(
        prompts=[SimpleNamespace(topic_id=TOPIC_ID, text=text) for text in tracked]
    )
    suggestions = [
        SuggestedTopic(
            topic_id=TOPIC_ID,
            name="Running shoes",
            prompts=[
                SuggestedPrompt(
                    text=text,
                    evidence_refs=[
                        {
                            "kind": "business_map_cell",
                            "offering": "running shoes",
                            "attribute": "wide fit",
                            "review_state": "confirmed",
                        }
                    ],
                )
                for text in texts
            ],
        )
    ]
    return build_requests(
        suggestions=suggestions,
        prompt_set=prompt_set,  # type: ignore[arg-type]
        brand_context=BRAND_CONTEXT,
        model="jev-latest",
    )


def test_core_state_never_names_the_brand_or_competitors() -> None:
    (request,) = _requests([], ["best wide fit running shoes"])

    serialized = repr(request.state)
    assert "Acme" not in serialized and "Globex" not in serialized
    assert request.state["buyer_need"] == {
        "offering": "running shoes",
        "attribute": "wide fit",
    }
    assert "duplicate_of" not in request.questions


def test_duplicate_choice_offers_tracked_and_earlier_candidates_of_the_topic() -> None:
    first, second = _requests(["tracked question"], ["new one", "newer one"])

    assert list(first.options.values()) == ["tracked question"]
    assert list(second.options.values()) == ["tracked question", "new one"]
    assert set(second.questions["duplicate_of"]["criteria"]) == {"none", "p1", "p2"}
    assert first.state_hash != second.state_hash
    assert _requests(["tracked question"], ["new one"])[0].state_hash == (
        first.state_hash
    )


def test_weak_answers_and_a_confident_duplicate_flag_the_candidate() -> None:
    _, second = _requests(["tracked question"], ["new one", "newer one"])
    decision = JevDecision(
        model="jev-1.13.0",
        answers={
            "fits_business": {"type": "noul", "noul": 0.9},
            "buyer_relevant": {"type": "noul", "noul": 0.1},
            "natural": {"type": "noul", "noul": 0.8},
            "standalone": {"type": "noul", "noul": 0.95},
            "sensible": {"type": "noul", "noul": 0.9},
            "intent": {"type": "choice", "choice": "learn", "confidence": 0.7},
            "duplicate_of": {
                "type": "choice",
                "choice": "p2",
                "probabilities": {"none": 0.2, "p1": 0.1, "p2": 0.7},
                "confidence": 0.6,
            },
        },
    )

    record = decision_record(second, decision)

    assert record["flags"] == ["buyer_relevant", "duplicate_of"]
    assert record["duplicate_of"]["text"] == "new one"
    assert record["intent"]["choice"] == "learn"
    assert record["state_hash"] == second.state_hash
    assert record["rank_score"] == 0.73


def test_malformed_choice_answers_are_recorded_as_unavailable_values() -> None:
    (request,) = _requests(["tracked question"], ["new one"])
    decision = JevDecision(
        model="jev-1.13.0",
        answers={
            "natural": {"type": "noul", "noul": "high"},
            "intent": {"type": "choice", "choice": 3, "probabilities": [0.5]},
            "duplicate_of": {
                "type": "choice",
                "choice": {"p1": 1},
                "probabilities": {"p1": "most", "none": 0.4},
                "confidence": "sure",
            },
        },
    )

    record = decision_record(request, decision)

    assert record["answers"]["natural"] is None
    assert record["intent"] == {"choice": None, "probabilities": {}, "confidence": None}
    assert record["duplicate_of"]["probabilities"] == {"none": 0.4}
    assert record["duplicate_of"]["text"] is None
    assert record["flags"] == []


@pytest.mark.asyncio
async def test_slow_or_malformed_decisions_are_unavailable_not_failures(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import asyncio

    from app.core.config.jev import jev_settings
    from app.domain.prompts import quality_judge

    monkeypatch.setattr(jev_settings, "generation_deadline_seconds", 0.05)
    fast, slow, broken = _requests([], ["fast one", "slow one", "broken one"])

    class _Judge:
        async def decide(self, state: dict, questions: dict) -> JevDecision:
            question = state["candidate"]["question"]
            if question == "slow one":
                await asyncio.sleep(10)
            if question == "broken one":
                return SimpleNamespace(model="x", answers=None, usage={})  # type: ignore[return-value]
            return JevDecision(model="jev", answers={})

    decisions, failed = await quality_judge._decide_all(
        _Judge(),  # type: ignore[arg-type]
        [fast, slow, broken],
    )

    assert set(decisions) == {fast.key}
    assert failed is True
