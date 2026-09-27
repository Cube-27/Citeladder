"""Build and apply the shared generation validator (cohort identity rules)."""

from __future__ import annotations

from typing import Any

from app.core.config.prompts import PROMPT_GROUNDING_BUSINESS_CONTEXT_FIELDS
from app.core.config.visibility_prompts import (
    cohort_system_prompt,
)
from app.domain.prompts.generation_contract import SuggestedTopic
from app.domain.prompts.portfolio_validation import (
    PortfolioValidator,
    brand_terms,
)


def _competitor_terms(brand_context: dict[str, Any]) -> list[str]:
    return [
        str(name)
        for competitor in brand_context.get("competitors", [])
        for name in [competitor.get("name", ""), *competitor.get("aliases", [])]
        if str(name)
    ]


def _category_vocabulary(brand_context: dict[str, Any]) -> list[str]:
    """The business's own category words, which are never brand tokens.

    Same escape hatch onboarding uses: a token the confirmed category uses is
    category language first, so "Red Dress" does not ban "dress" and empty its
    own organic cohort.
    """
    context = brand_context.get("business_context") or {}
    values: list[str] = []
    for field in PROMPT_GROUNDING_BUSINESS_CONTEXT_FIELDS:
        value = context.get(field)
        if isinstance(value, str):
            values.append(value)
        elif isinstance(value, list):
            values.extend(str(item) for item in value)
    return values


def build_validator(
    suggestions_topic_ids: frozenset[str], brand_context: dict[str, Any]
) -> PortfolioValidator:
    """The same validator onboarding builds, from an existing project's context."""
    return PortfolioValidator(
        topic_ids=suggestions_topic_ids,
        brand_terms=brand_terms(
            str(brand_context.get("brand_name") or ""),
            [str(alias) for alias in brand_context.get("brand_aliases") or []],
            _category_vocabulary(brand_context),
        ),
        competitor_terms=_competitor_terms(brand_context),
    )


def _drop_invalid_prompts(
    suggestions: list[SuggestedTopic],
    *,
    cohort: str,
    validator: PortfolioValidator,
) -> list[SuggestedTopic]:
    """Offer every suggestion to the run's validator, keeping what it admits."""
    topics: list[SuggestedTopic] = []
    for topic in suggestions:
        rows = [
            prompt
            for prompt in topic.prompts
            if not validator.offer(
                {
                    "slot_id": prompt.slot_id,
                    "topic_id": str(topic.topic_id),
                    "text": prompt.text,
                    "intent": prompt.intent,
                    "buyer_stage": prompt.buyer_stage,
                    "prompt_intent": prompt.prompt_intent,
                },
                cohort=cohort,
            )
        ]
        if rows:
            topics.append(
                SuggestedTopic(topic_id=topic.topic_id, name=topic.name, prompts=rows)
            )
    return topics


def filter_for_cohort(
    suggestions: list[SuggestedTopic],
    cohort: str,
    brand_context: dict[str, Any],
    *,
    validator: PortfolioValidator | None = None,
) -> list[SuggestedTopic]:
    """Admit one cohort with exact-duplicate state shared across batches.

    Commerce buyer prompts are not generated here; they have their own owner
    (``/commerce/buyer-prompts``) and Generate rejects the cohort.
    """
    if validator is None:
        validator = build_validator(
            frozenset(str(topic.topic_id) for topic in suggestions), brand_context
        )
    return _drop_invalid_prompts(suggestions, cohort=cohort, validator=validator)


def business_model(brand_context: dict[str, Any]) -> str:
    context = brand_context.get("business_context") or {}
    return str(context.get("business_model") or "")


def generation_system_prompt(cohort: str, brand_context: dict[str, Any]) -> str:
    return cohort_system_prompt(business_model(brand_context), cohort)
