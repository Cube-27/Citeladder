"""Unit tests for the stateless prompt-suggestion adapter (setup-form AI).

Deterministic fixtures only — no live provider calls (mirrors
``test_brand_suggestions.py`` / ``test_prompt_generation.py``: unit-test the
parser/dedupe against fixture model output). Structure/dedupe rules live in
the generation module (its owner); these tests pin the stateless adapter's
flattening, existing-text dedupe, and prompt-specific count cap.
"""

from __future__ import annotations

import json
from types import SimpleNamespace

import pytest
from pydantic import ValidationError

from app.core.config.suggestions import PromptSuggestionSettings
from app.domain.projects.suggestions import (
    SuggestionOutputError,
    SuggestionValidationError,
    build_prompt_suggestion_user_message,
    parse_prompt_suggestion_output,
    validate_prompt_suggestion_payload,
)

BRAND_CONTEXT = {
    "brand_name": "Acme Corp",
    "brand_aliases": ["Acme", "ACME Inc"],
    "website_url": "https://acme.com",
    "country_code": "AU",
    "language_code": "en-AU",
    "description": "Australian family clothing and homewares retailer.",
    "positioning": "Value-priced everyday basics for families.",
    "products_services": ["Clothing", "Homewares"],
    "target_audience": "Budget-conscious Australian families.",
}

VALID_OUTPUT = json.dumps(
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


# --------------------------------------------------------------------------
# Agent-output parsing (adapter over the generation contract)
# --------------------------------------------------------------------------
class TestParsePromptSuggestionOutput:
    def test_valid_output_flattens_topics_to_themed_rows(self) -> None:
        rows, _topics, dropped = parse_prompt_suggestion_output(
            VALID_OUTPUT, existing_texts=[]
        )
        assert [(r.text, r.theme, r.intent) for r in rows] == [
            (
                "What are the best affordable basics for kids?",
                "Everyday basics",
                "discovery",
            ),
            (
                "Acme vs Globex — which is better value?",
                "Everyday basics",
                "comparison",
            ),
            (
                "Where can I buy cheap homewares in Australia?",
                "Homewares",
                "purchase",
            ),
        ]
        assert dropped == 0

    def test_returns_the_agent_topic_grouping_alongside_the_flat_rows(self) -> None:
        # The grouped view is what a persisting caller (onboarding) uses to
        # recreate the same Topic rows /generate creates, so it must describe
        # exactly the same prompts as the flat list.
        rows, topics, _ = parse_prompt_suggestion_output(
            VALID_OUTPUT, existing_texts=[]
        )
        assert [(t.name, [p.text for p in t.prompts]) for t in topics] == [
            (
                "Everyday basics",
                [
                    "What are the best affordable basics for kids?",
                    "Acme vs Globex — which is better value?",
                ],
            ),
            ("Homewares", ["Where can I buy cheap homewares in Australia?"]),
        ]
        assert sum(len(t.prompts) for t in topics) == len(rows)

    def test_groups_case_variant_topic_names_together(self) -> None:
        # The DB's unique index is on lower(name), so "Basics" and "basics" are
        # one topic on persist — the grouping has to agree or onboarding would
        # try to create a topic that already exists.
        raw = json.dumps(
            {
                "topics": [
                    {"name": "Basics", "prompts": [{"text": "First?", "intent": ""}]},
                    {"name": "basics", "prompts": [{"text": "Second?", "intent": ""}]},
                ]
            }
        )
        _rows, topics, _ = parse_prompt_suggestion_output(raw, existing_texts=[])
        assert len(topics) == 1
        assert topics[0].name == "Basics"
        assert [p.text for p in topics[0].prompts] == ["First?", "Second?"]

    def test_topic_emptied_by_dedupe_is_omitted_not_returned_empty(self) -> None:
        _rows, topics, dropped = parse_prompt_suggestion_output(
            VALID_OUTPUT,
            existing_texts=["where can i buy cheap homewares in australia"],
        )
        assert [t.name for t in topics] == ["Everyday basics"]
        assert dropped == 1

    def test_unknown_intent_is_blanked(self) -> None:
        raw = json.dumps(
            {
                "topics": [
                    {
                        "name": "Basics",
                        "prompts": [{"text": "Best basics for kids?", "intent": "NAV"}],
                    }
                ]
            }
        )
        rows, _topics, _ = parse_prompt_suggestion_output(raw, existing_texts=[])
        assert rows[0].intent == ""

    def test_intra_response_duplicates_collapse_with_normalized_text(self) -> None:
        raw = json.dumps(
            {
                "topics": [
                    {
                        "name": "Basics",
                        "prompts": [
                            {"text": "Best basics for kids?", "intent": ""},
                            {"text": "best  basics for kids", "intent": ""},
                        ],
                    }
                ]
            }
        )
        rows, _topics, dropped = parse_prompt_suggestion_output(raw, existing_texts=[])
        assert [r.text for r in rows] == ["Best basics for kids?"]
        assert dropped == 1

    def test_empty_prompts_and_topics_are_dropped(self) -> None:
        raw = json.dumps(
            {
                "topics": [
                    {"name": "Empty", "prompts": [{"text": "  ", "intent": ""}]},
                    {
                        "name": "Basics",
                        "prompts": [{"text": "Best basics for kids?", "intent": ""}],
                    },
                ]
            }
        )
        rows, _topics, _ = parse_prompt_suggestion_output(raw, existing_texts=[])
        assert [(r.text, r.theme) for r in rows] == [
            ("Best basics for kids?", "Basics")
        ]

    def test_dedupes_against_existing_texts(self) -> None:
        rows, _topics, dropped = parse_prompt_suggestion_output(
            VALID_OUTPUT,
            existing_texts=["what are the best affordable basics for kids"],
        )
        assert len(rows) == 2
        assert dropped == 1

    def test_malformed_json_raises(self) -> None:
        with pytest.raises(SuggestionOutputError):
            parse_prompt_suggestion_output("this is not json", existing_texts=[])

    def test_wrong_shape_raises(self) -> None:
        with pytest.raises(SuggestionOutputError):
            parse_prompt_suggestion_output(
                json.dumps({"topics": "nope"}), existing_texts=[]
            )

    def test_no_usable_prompts_raises(self) -> None:
        with pytest.raises(SuggestionOutputError):
            parse_prompt_suggestion_output(
                json.dumps({"topics": []}), existing_texts=[]
            )

    def test_all_duplicates_of_existing_raises(self) -> None:
        raw = json.dumps(
            {
                "topics": [
                    {
                        "name": "Basics",
                        "prompts": [{"text": "Best basics for kids?", "intent": ""}],
                    }
                ]
            }
        )
        with pytest.raises(SuggestionOutputError, match="no usable prompts"):
            parse_prompt_suggestion_output(
                raw, existing_texts=["Best basics for kids?"]
            )


# --------------------------------------------------------------------------
# User-message builder (delegates to the generation builder)
# --------------------------------------------------------------------------
class TestBuildPromptSuggestionUserMessage:
    def test_includes_brand_evidence_and_count(self) -> None:
        message = build_prompt_suggestion_user_message(
            brand_context=BRAND_CONTEXT,
            competitor_names=["Globex"],
            existing_texts=[],
            count=8,
        )
        assert '"brand_name":"Acme Corp"' in message
        assert '"website_url":"https://acme.com"' in message
        assert '"positioning":"Value-priced everyday basics for families."' in message
        assert "Brand: Acme Corp" in message
        assert "Brand aliases: Acme, ACME Inc" in message
        assert "Competitors: Globex" in message
        assert "Market country: AU" in message
        assert "Language: en-AU" in message
        assert "Generate exactly 8 prompts in total across topics." in message
        assert "do NOT duplicate" not in message

    def test_existing_texts_form_do_not_duplicate_block(self) -> None:
        message = build_prompt_suggestion_user_message(
            brand_context=BRAND_CONTEXT,
            competitor_names=[],
            existing_texts=["Best basics for kids?"],
            count=5,
        )
        assert "do NOT duplicate" in message
        assert "- Best basics for kids?" in message

    def test_empty_context_uses_markers(self) -> None:
        message = build_prompt_suggestion_user_message(
            brand_context={"brand_name": "Acme"},
            competitor_names=[],
            existing_texts=[],
            count=5,
        )
        assert '"brand_name":"Acme"' in message
        assert "Brand aliases: none" in message
        assert "Competitors: none" in message
        assert "Market country: unspecified" in message


# --------------------------------------------------------------------------
# Payload validation (consent gate + prompt-specific bounds)
# --------------------------------------------------------------------------
def _payload(**overrides: object) -> SimpleNamespace:
    defaults: dict[str, object] = {"confirm_send_evidence": True, "count": 10}
    defaults.update(overrides)
    return SimpleNamespace(**defaults)


class TestValidatePromptSuggestionPayload:
    def test_accepts_confirmed_in_bounds_payload(self) -> None:
        validate_prompt_suggestion_payload(_payload())

    def test_rejects_missing_consent(self) -> None:
        with pytest.raises(SuggestionValidationError, match="confirm_send_evidence"):
            validate_prompt_suggestion_payload(_payload(confirm_send_evidence=False))

    def test_rejects_count_over_cap(self) -> None:
        with pytest.raises(SuggestionValidationError, match="at most"):
            validate_prompt_suggestion_payload(_payload(count=10_000))


# --------------------------------------------------------------------------
# Settings bounds
# --------------------------------------------------------------------------
class TestPromptSuggestionSettings:
    def test_rejects_zero_default_count(self) -> None:
        with pytest.raises(ValidationError):
            PromptSuggestionSettings(PROMPT_SUGGESTION_DEFAULT_COUNT=0)

    def test_rejects_negative_max_count(self) -> None:
        with pytest.raises(ValidationError):
            PromptSuggestionSettings(PROMPT_SUGGESTION_MAX_COUNT=-1)

    def test_rejects_default_above_max(self) -> None:
        with pytest.raises(ValidationError, match="must not exceed"):
            PromptSuggestionSettings(
                PROMPT_SUGGESTION_DEFAULT_COUNT=30, PROMPT_SUGGESTION_MAX_COUNT=20
            )
