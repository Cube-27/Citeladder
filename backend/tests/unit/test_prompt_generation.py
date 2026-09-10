"""Unit contracts for topic-ID-only prompt generation."""

from __future__ import annotations

import json
import time
import uuid

import pytest
from pydantic import ValidationError

from app.core.config.prompts import PromptGenerationSettings
from app.domain.prompts.generation import (
    GenerationOutputError,
    SuggestedPrompt,
    SuggestedTopic,
    _cap_suggestions_to_count,
    _drop_cross_batch_duplicates,
    build_generation_user_message,
    parse_generation_output,
)
from app.domain.prompts.normalization import normalize_prompt_text, prompt_text_hash
from app.domain.prompts.query_patterns import build_prompt_slots

TOPIC_ID = uuid.uuid4()
SECOND_TOPIC_ID = uuid.uuid4()
ALLOWED_TOPICS = [
    {"id": str(TOPIC_ID), "name": "Footwear", "description": "Shoes"},
    {"id": str(SECOND_TOPIC_ID), "name": "Activewear", "description": "Sportswear"},
]
BRAND_CONTEXT = {
    "brand_name": "Acme Corp",
    "brand_aliases": ["Acme"],
    "competitors": [{"name": "Globex"}],
    "country_code": "AU",
    "language_code": "en-AU",
    "knowledge_base": {"description": "Australian footwear retailer."},
}
SLOTS = build_prompt_slots(topics=ALLOWED_TOPICS, count=4, cohort="core")


def test_normalization_and_hash_are_stable() -> None:
    assert normalize_prompt_text("  Best   Running Shoes!? ") == "best running shoes"
    assert prompt_text_hash("Best Shoes?") == prompt_text_hash("best  shoes")


def test_normalization_remains_linear() -> None:
    payload = "\t" * 200_000 + "x"
    started = time.perf_counter()
    normalize_prompt_text(payload)
    assert time.perf_counter() - started < 1.0


def _row(
    slot_id: str, text: str, intent: str = "recommend", stage: str = "consideration"
) -> dict:
    return {
        "slot_id": slot_id,
        "text": text,
        "buyer_stage": stage,
        "prompt_intent": intent,
    }


def test_parse_resolves_slots_and_preserves_descriptive_labels() -> None:
    raw = json.dumps(
        {
            "prompts": [
                _row("q1", "Best footwear stores for wide feet"),
                _row(
                    "q2", "What can replace worn out activewear?", "solve", "awareness"
                ),
            ]
        }
    )
    topics, dropped = parse_generation_output(raw, slots=SLOTS)
    assert dropped == 0
    assert [(topic.topic_id, topic.name) for topic in topics] == [
        (TOPIC_ID, "Footwear"),
        (SECOND_TOPIC_ID, "Activewear"),
    ]
    assert topics[0].prompts[0].intent == "purchase"
    assert topics[0].prompts[0].buyer_stage == "consideration"
    assert topics[1].prompts[0].intent == "discovery"
    assert topics[1].prompts[0].prompt_intent == "solve"
    assert topics[1].prompts[0].buyer_stage == "awareness"


def test_slots_cover_topics_without_allocating_forms_or_stages() -> None:
    assert [slot.topic_id for slot in SLOTS] == [
        str(TOPIC_ID),
        str(SECOND_TOPIC_ID),
        str(TOPIC_ID),
        str(SECOND_TOPIC_ID),
    ]
    assert [slot.slot_id for slot in SLOTS] == ["q1", "q2", "q3", "q4"]
    for slot in SLOTS:
        assert (
            not {"archetype", "form", "job", "buyer_stage"}
            & slot.as_model_input().keys()
        )


def test_parse_drops_unknown_slots_duplicates_and_invalid_labels() -> None:
    raw = json.dumps(
        {
            "prompts": [
                _row("unknown", "Best footwear"),
                _row("q1", "Best footwear"),
                _row("q1", "Other footwear"),
                _row("q2", " best FOOTWEAR? "),
                _row("q3", "Best activewear", "invented"),
                _row("q4", "Best activewear", stage="invented"),
            ]
        }
    )
    topics, dropped = parse_generation_output(raw, slots=SLOTS)
    assert dropped == 5
    assert [p.text for t in topics for p in t.prompts] == ["Best footwear"]


@pytest.mark.parametrize(
    "raw",
    [
        "not json",
        '{"topics": []}',
        '{"prompts": []}',
        json.dumps(
            {
                "prompts": [
                    {
                        "slot_id": "q1",
                        "text": "best walking shoes",
                        "theme": "model invented topic",
                    }
                ]
            }
        ),
    ],
)
def test_parse_rejects_malformed_or_empty_output(raw: str) -> None:
    with pytest.raises(GenerationOutputError):
        parse_generation_output(raw, slots=SLOTS)


def test_user_message_contains_only_canonical_topic_ids() -> None:
    message = build_generation_user_message(
        brand_context=BRAND_CONTEXT,
        slots=SLOTS,
        existing_prompts=["existing prompt"],
    )

    assert "q1" in message
    assert "Buyer-query slots" in message
    assert "Return exactly 4 prompts" in message
    assert "create a topic" not in message.casefold()


def test_cap_preserves_topic_ids_and_model_order() -> None:
    suggestions = [
        SuggestedTopic(
            topic_id=TOPIC_ID,
            name="Footwear",
            prompts=[SuggestedPrompt(text=f"prompt {index}") for index in range(3)],
        ),
        SuggestedTopic(
            topic_id=SECOND_TOPIC_ID,
            name="Activewear",
            prompts=[SuggestedPrompt(text="prompt 4")],
        ),
    ]

    capped = _cap_suggestions_to_count(suggestions, 2)

    assert len(capped) == 1
    assert capped[0].topic_id == TOPIC_ID
    assert [prompt.text for prompt in capped[0].prompts] == ["prompt 0", "prompt 1"]


def test_cross_batch_duplicates_are_removed_and_counted_for_every_cohort() -> None:
    existing = [
        SuggestedTopic(
            topic_id=TOPIC_ID,
            name="Footwear",
            prompts=[SuggestedPrompt(text="Acme Corp vs Globex for walking shoes")],
        )
    ]
    incoming = [
        SuggestedTopic(
            topic_id=SECOND_TOPIC_ID,
            name="Activewear",
            prompts=[
                SuggestedPrompt(text="Acme Corp vs Globex for walking shoes?"),
                SuggestedPrompt(text="Acme Corp vs Globex for running clothes"),
            ],
        )
    ]

    retained, dropped = _drop_cross_batch_duplicates(existing, incoming)

    assert dropped == 1
    assert [prompt.text for prompt in retained[0].prompts] == [
        "Acme Corp vs Globex for running clothes"
    ]


def test_generation_settings_keep_bounded_batches() -> None:
    settings = PromptGenerationSettings(
        generation_max_count=100,
        generation_model_batch_size=20,
        generation_existing_prompt_context_limit=0,
    )
    assert settings.max_count == 100
    assert settings.model_batch_size == 20
    assert settings.existing_prompt_context_limit == 0


def test_negative_existing_context_limit_is_rejected() -> None:
    with pytest.raises(ValidationError):
        PromptGenerationSettings(generation_existing_prompt_context_limit=-1)


def test_shared_validator_admits_natural_queries_without_style_quotas() -> None:
    from app.domain.prompts.generation_filtering import filter_for_cohort

    candidates = [
        "Selvedge jeans",
        "Cheap baby clothes in bulk",
        "Best affordable plus size clothing stores Australia online",
        "Looking for cheap kids school clothes before term starts",
        "Best running shoes for flat feet",
        "Best running shoes for wide toes",
        "Best running shoes for high arches",
        "CBSE boarding schools in Dehradun",
        "Day schools in Dehradun with sports facilities",
        "What feed management software should I shortlist for a Shopify store "
        "that sells across several marketplaces and needs managed support?",
    ]
    result = filter_for_cohort(
        [
            SuggestedTopic(
                topic_id=TOPIC_ID,
                name="Offerings",
                prompts=[
                    SuggestedPrompt(text=text, intent="purchase") for text in candidates
                ],
            )
        ],
        "core",
        BRAND_CONTEXT,
    )
    assert [p.text for t in result for p in t.prompts] == candidates


def test_shared_validator_preserves_named_cohort_identity_and_text_limit() -> None:
    from app.domain.prompts.generation_filtering import filter_for_cohort

    candidates = [
        SuggestedPrompt(text="Acme Corp or Globex?", intent="comparison"),
        SuggestedPrompt(text="Acme Corp or another provider?", intent="comparison"),
        SuggestedPrompt(text="Globex or another provider?", intent="comparison"),
        SuggestedPrompt(
            text="Acme Corp versus Globex " + "x" * 300, intent="comparison"
        ),
    ]
    result = filter_for_cohort(
        [SuggestedTopic(topic_id=TOPIC_ID, name="Shoes", prompts=candidates)],
        "comparison",
        BRAND_CONTEXT,
    )
    assert [p.text for t in result for p in t.prompts] == ["Acme Corp or Globex?"]


def test_slot_count_is_not_limited_by_recipes() -> None:
    assert (
        len(build_prompt_slots(topics=ALLOWED_TOPICS[:1], count=100, cohort="core"))
        == 100
    )


@pytest.mark.parametrize(
    ("legacy", "labels"),
    [
        ("discovery", ("learn", "solve")),
        ("purchase", ("recommend", "validate", "buy")),
        ("comparison", ("compare",)),
        ("service", ("implement",)),
        ("local", ("recommend", "buy")),
    ],
)
def test_explicit_filters_restrict_labels_without_relabelling(legacy, labels) -> None:
    slots = build_prompt_slots(
        topics=ALLOWED_TOPICS, count=2, cohort="core", intents=(legacy,)
    )
    assert slots[0].allowed_prompt_intents == labels
    raw = json.dumps(
        {
            "prompts": [
                _row("q1", "Relevant buying query", labels[0]),
                _row("q2", "Another query", "unknown"),
            ]
        }
    )
    topics, dropped = parse_generation_output(raw, slots=slots)
    assert dropped == 1
    assert topics[0].prompts[0].prompt_intent == labels[0]


def test_parser_does_not_attempt_semantic_quality_assessment() -> None:
    raw = json.dumps({"prompts": [_row("q1", "What is denim?", "learn", "awareness")]})
    topics, dropped = parse_generation_output(raw, slots=SLOTS)
    assert dropped == 0
    assert topics[0].prompts[0].text == "What is denim?"


def test_a_named_cohort_keeps_its_labels_under_an_unrelated_intent_filter() -> None:
    """A cohort's labels come from what it measures, not from the filter.

    Intersecting the two resolved `comparison` + `purchase` to no labels at
    all, so every slot was rejected and a well-formed request 502'd before a
    single provider call.
    """
    from app.domain.prompts.query_patterns import _allowed_intents, build_prompt_slots

    topics = [{"id": "t1", "name": "Linen Dresses", "description": ""}]
    for intents in [("purchase",), ("discovery",), ("service",), ("local",), ()]:
        assert _allowed_intents("comparison", intents) == ("compare",)
        slots = build_prompt_slots(
            topics=topics, count=3, cohort="comparison", intents=intents
        )
        assert len(slots) == 3
        assert all(slot.allowed_prompt_intents == ("compare",) for slot in slots)


def test_an_over_long_row_is_dropped_without_voiding_its_siblings() -> None:
    """The length bound is a per-row rule, not a schema rule.

    As a schema bound, pydantic rejected the whole response on the first
    over-long text, so one runaway row 502'd the entire batch.
    """
    import json

    from app.core.config.http import PROMPT_TEXT_MAX_CHARS
    from app.domain.prompts.generation_contract import parse_planned_output
    from app.domain.prompts.query_patterns import build_prompt_slots

    slots = build_prompt_slots(
        topics=[{"id": "t1", "name": "Linen Dresses", "description": ""}],
        count=2,
        cohort="core",
    )
    raw = json.dumps(
        {
            "prompts": [
                {
                    "slot_id": slots[0].slot_id,
                    "text": "x" * (PROMPT_TEXT_MAX_CHARS + 1),
                    "buyer_stage": "consideration",
                    "prompt_intent": "recommend",
                },
                {
                    "slot_id": slots[1].slot_id,
                    "text": "Best linen dresses for a summer wedding",
                    "buyer_stage": "decision",
                    "prompt_intent": "buy",
                },
            ]
        }
    )
    accepted, dropped = parse_planned_output(raw, slots=slots)
    assert [row.text for row in accepted] == ["Best linen dresses for a summer wedding"]
    assert dropped == 1


def test_a_degenerate_row_cannot_reach_a_paid_answer_engine() -> None:
    """There is a ceiling on prompt text; there has to be a floor too."""
    import json

    from app.domain.prompts.generation_contract import parse_planned_output
    from app.domain.prompts.query_patterns import build_prompt_slots

    slots = build_prompt_slots(
        topics=[{"id": "t1", "name": "Linen Dresses", "description": ""}],
        count=2,
        cohort="core",
    )
    raw = json.dumps(
        {
            "prompts": [
                {
                    "slot_id": slots[0].slot_id,
                    "text": "x",
                    "buyer_stage": "consideration",
                    "prompt_intent": "recommend",
                },
                {
                    "slot_id": slots[1].slot_id,
                    "text": "Best linen dresses for a summer wedding",
                    "buyer_stage": "decision",
                    "prompt_intent": "buy",
                },
            ]
        }
    )
    accepted, dropped = parse_planned_output(raw, slots=slots)
    assert [row.text for row in accepted] == ["Best linen dresses for a summer wedding"]
    assert dropped == 1


def test_an_unmapped_cohort_falls_back_instead_of_raising() -> None:
    """Adding a cohort must not break generation before its rules are written."""
    from app.core.config.visibility_prompts import cohort_system_prompt

    assert cohort_system_prompt("retail", "commerce")
    assert cohort_system_prompt("retail", "not_a_cohort")


def test_the_intent_vocabulary_has_exactly_one_source() -> None:
    """The schema enum and the resolver accept-list cannot drift apart."""
    from app.core.config.visibility_prompts import (
        PROMPT_INTENT_LEGACY,
        PROMPT_INTENT_VOCABULARY,
    )

    assert PROMPT_INTENT_VOCABULARY == tuple(PROMPT_INTENT_LEGACY)


def test_every_business_model_has_its_own_exemplar() -> None:
    """A new business model must not silently fall back to the general example."""
    from typing import get_args

    from app.core.config.visibility_prompts import PROMPT_EXEMPLARS
    from app.domain.projects.discovery_schemas import BusinessModel

    assert set(PROMPT_EXEMPLARS) == set(get_args(BusinessModel))
