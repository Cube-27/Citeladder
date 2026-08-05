"""Hybrid industry-library and model-personalized prompt generation."""

from __future__ import annotations

import re

from app.core.config.brand_discovery import (
    MARKET_CONTEXT_TERMS,
    PRICE_TIER_QUERY_MODIFIERS,
    brand_discovery_settings,
)
from app.domain.projects.onboarding.industry_library import load_industry_library
from app.domain.projects.onboarding.prompt_validation import (
    BRAND_RELEVANT,
    MARKET_VISIBILITY,
    PromptQualityResult,
    validate_portfolio,
)

_INTENTS = ("discovery", "service", "comparison", "purchase", "local")


def _render_search(template: str, values: dict[str, str]) -> str:
    """Render one complete search without bolting extra clauses onto it."""
    rendered = " ".join(template.format(**values).split())
    return re.sub(r"\b(\w+)\s+\1\b", r"\1", rendered, flags=re.IGNORECASE)


def fallback_portfolio(
    *,
    primary_market: str,
    industry: str,
    industry_context: dict,
    products_services: list[str],
    target_audience: str,
    price_tier: str = "unknown",
) -> list[dict]:
    """Build a complete editable portfolio when application-model research fails."""
    categories, audiences, uses = _fallback_context(
        industry, industry_context, products_services, target_audience
    )

    market_templates = list(industry_context.get("archetypes") or [])
    brand_templates = list(
        load_industry_library().get("brand_relevant_archetypes") or []
    )
    market_count = brand_discovery_settings.market_prompt_count
    brand_relevant_count = brand_discovery_settings.brand_relevant_prompt_count
    market = [
        {
            "text": _render_search(
                template,
                _fallback_values(
                    index,
                    primary_market,
                    categories,
                    audiences,
                    uses,
                    price_tier,
                ),
            ),
            "theme": _topic_name(categories[index % len(categories)]),
            "intent": _INTENTS[index % len(_INTENTS)],
            "cohort": MARKET_VISIBILITY,
        }
        for index in range(market_count)
        for template in [market_templates[index % len(market_templates)]]
    ]
    brand_relevant = [
        {
            "text": _render_search(
                template,
                _fallback_values(
                    index,
                    primary_market,
                    categories,
                    audiences,
                    uses,
                    price_tier,
                ),
            ),
            "theme": _topic_name(categories[index % len(categories)]),
            "intent": _INTENTS[index % len(_INTENTS)],
            "cohort": BRAND_RELEVANT,
        }
        for index in range(brand_relevant_count)
        for template in [brand_templates[index % len(brand_templates)]]
    ]
    return [*market, *brand_relevant]


def _fallback_values(index, market, categories, audiences, uses, price_tier):
    return {
        "market": MARKET_CONTEXT_TERMS.get(market, (market,))[0],
        "category": categories[index % len(categories)],
        "audience": audiences[index % len(audiences)],
        "use_case": uses[index % len(uses)],
        "quality": PRICE_TIER_QUERY_MODIFIERS.get(
            price_tier, PRICE_TIER_QUERY_MODIFIERS["unknown"]
        ),
    }


def _fallback_context(industry, industry_context, products_services, target_audience):
    categories = [
        _natural_category(str(item).strip())
        for item in products_services
        if str(item).strip()
    ]
    if not categories:
        categories = [
            industry.casefold() if industry != "General" else "products and services"
        ]
    industry_audiences = list(industry_context.get("customer_types") or [])
    uses = _values_or_default(industry_context.get("use_cases"), "their needs")
    supplied_audience = target_audience.strip().rstrip(".?!")
    audiences = (
        [supplied_audience]
        if 0 < len(supplied_audience.split()) <= 6
        else industry_audiences or ["buyers"]
    )
    return categories, audiences, uses


def _natural_category(category: str) -> str:
    category = re.sub(r"\bwomens\b", "women's", category, flags=re.IGNORECASE)
    category = re.sub(r"\bmens\b", "men's", category, flags=re.IGNORECASE)
    category = re.sub(r"\bchildrens\b", "children's", category, flags=re.IGNORECASE)
    return category


def _topic_name(category: str) -> str:
    """Turn a verified offering into a concise topic label for the review rail."""
    return category.strip().rstrip(".?!").title().replace("'S", "'s")


def _values_or_default(values, fallback):
    normalized = list(values or [])
    return normalized or [fallback]


def validated_portfolio(
    model_prompts: list[dict],
    *,
    fallback_prompts: list[dict],
    brand_name: str,
    primary_market: str,
    competitor_terms: list[str],
    context_terms: list[str],
) -> tuple[list[dict], list[str]]:
    result: PromptQualityResult = validate_portfolio(
        model_prompts,
        brand_terms=[brand_name],
        competitor_terms=competitor_terms,
        primary_market=primary_market,
        context_terms=context_terms,
        expected_market_count=brand_discovery_settings.market_prompt_count,
        expected_brand_relevant_count=(
            brand_discovery_settings.brand_relevant_prompt_count
        ),
    )
    if not result.errors:
        return list(result.accepted), []
    fallback_result = validate_portfolio(
        fallback_prompts,
        brand_terms=[brand_name],
        competitor_terms=competitor_terms,
        primary_market=primary_market,
        context_terms=context_terms,
        expected_market_count=brand_discovery_settings.market_prompt_count,
        expected_brand_relevant_count=(
            brand_discovery_settings.brand_relevant_prompt_count
        ),
    )
    if fallback_result.errors:
        raise RuntimeError(
            "Config-owned onboarding fallback failed validation: "
            + ", ".join(fallback_result.errors)
        )
    return list(fallback_result.accepted), ["research_degraded"]
