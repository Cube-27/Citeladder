"""JEV judgments: core state, duplicate options, flags and state hash."""

from __future__ import annotations

import json
import uuid
from types import SimpleNamespace

import pytest

from app.connectors.jev import JevDecision
from app.core.config.jev import JEV_NOUL_QUESTIONS
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


def _inputs(tracked: list[str], texts: list[str]):
    prompt_set = SimpleNamespace(
        id=uuid.uuid4(),
        prompts=[SimpleNamespace(topic_id=TOPIC_ID, text=text) for text in tracked],
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
    return prompt_set, suggestions


def _requests(tracked: list[str], texts: list[str]):
    prompt_set, suggestions = _inputs(tracked, texts)
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
            "decision_value": {"type": "noul", "noul": 0.9},
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
    assert record["rank_score"] == 0.7583


def test_a_duplicate_choice_that_was_not_offered_cannot_fail_the_gate() -> None:
    (request,) = _requests(["tracked question"], ["new one"])
    answers = {key: {"type": "noul", "noul": 0.9} for key in JEV_NOUL_QUESTIONS}
    answers["duplicate_of"] = {
        "type": "choice",
        "choice": "p9",
        "probabilities": {"p9": 0.99},
    }

    record = decision_record(request, JevDecision(model="jev", answers=answers))

    assert record["duplicate_of"]["choice"] is None
    assert record["verdict"] == "uncertain"
    assert record["flags"] == ["incomplete"]


def test_malformed_choice_answers_are_recorded_as_unavailable_values() -> None:
    (request,) = _requests(["tracked question"], ["new one"])
    decision = JevDecision(
        model="jev-1.13.0",
        answers={
            "natural": {"type": "noul", "noul": "high"},
            "sensible": {"type": "noul", "noul": float("nan")},
            "standalone": {"type": "noul", "noul": 1.7},
            "intent": {"type": "choice", "choice": 3, "probabilities": [0.5]},
            "duplicate_of": {
                "type": "choice",
                "choice": {"p1": 1},
                "probabilities": {"p1": "most", "p2": float("inf"), "none": 0.4},
                "confidence": "sure",
            },
        },
    )

    record = decision_record(request, decision)

    assert record["answers"]["natural"] is None
    assert record["answers"]["sensible"] is None
    assert record["answers"]["standalone"] is None
    # The stored decision must be valid JSON for PostgreSQL JSONB.
    json.dumps(record, allow_nan=False)
    assert record["intent"] == {"choice": None, "probabilities": {}, "confidence": None}
    assert record["duplicate_of"]["probabilities"] == {"none": 0.4}
    assert record["duplicate_of"]["text"] is None
    # Missing answers never pass and never fail: the row is shown flagged.
    assert record["flags"] == ["incomplete"]
    assert record["verdict"] == "uncertain"


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


@pytest.mark.asyncio
async def test_reused_judgments_do_not_consume_the_call_cap(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.core.config.jev import jev_settings
    from app.domain.prompts import quality_judge

    texts = ["judged before", "never judged"]
    earlier, fresh = _requests([], texts)
    recorded = decision_record(earlier, JevDecision(model="jev", answers={}))

    async def _recorded(*_args: object, **_kwargs: object) -> dict:
        return {earlier.state_hash: recorded}

    class _Session:
        async def commit(self) -> None:
            return None

    class _Judge:
        model = "jev-latest"

        def __init__(self) -> None:
            self.questions: list[str] = []

        async def decide(self, state: dict, questions: dict) -> JevDecision:
            self.questions.append(state["candidate"]["question"])
            return JevDecision(model="jev", answers={})

    monkeypatch.setattr(quality_judge, "_recorded_decisions", _recorded)
    monkeypatch.setattr(jev_settings, "max_calls_per_generation", 1)
    judge = _Judge()
    prompt_set, suggestions = _inputs([], texts)

    result = await quality_judge.judge_candidates(
        _Session(),  # type: ignore[arg-type]
        judge=judge,  # type: ignore[arg-type]
        workspace_id=uuid.uuid4(),
        prompt_set=prompt_set,  # type: ignore[arg-type]
        suggestions=suggestions,
        brand_context=BRAND_CONTEXT,
    )

    assert judge.questions == ["never judged"]
    assert set(result.decisions) == {earlier.key, fresh.key}
    assert result.quality_gate == jev_settings.mode
