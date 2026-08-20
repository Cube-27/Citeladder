"""Pass 2: generate prompts for canonical Pass 1 topic UUIDs."""

from __future__ import annotations

import asyncio
import json
import uuid
from dataclasses import dataclass
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from app.connectors.agent.client import AgentNotConfiguredError
from app.connectors.agent.factory import create_model_gateway
from app.connectors.answer_engines.errors import ProviderError
from app.core.config.brand_discovery import (
    DISCOVERY_PROMPT_CANDIDATE_COUNT,
    ONBOARDING_PORTFOLIO_SYSTEM_PROMPT,
    brand_discovery_settings,
)
from app.core.config.projects import PROMPT_INTENTS
from app.domain.projects.discovery_schemas import DiscoveryTopic
from app.domain.projects.onboarding.prompt_validation import select_portfolio

PromptIntent = Literal["discovery", "comparison", "purchase", "service", "local"]
PromptCohort = Literal["organic", "brand_context"]


class GeneratedPrompt(BaseModel):
    model_config = ConfigDict(extra="forbid")

    topic_id: uuid.UUID
    text: str = Field(min_length=1, max_length=300)
    intent: PromptIntent
    cohort: PromptCohort


class PortfolioEnvelope(BaseModel):
    model_config = ConfigDict(extra="forbid")

    prompts: list[GeneratedPrompt] = Field(
        default_factory=list, max_length=DISCOVERY_PROMPT_CANDIDATE_COUNT
    )


@dataclass(frozen=True, slots=True)
class PortfolioResult:
    prompts: tuple[dict, ...] = ()
    errors: tuple[str, ...] = ()
    provider: str = ""
    model: str = ""


def _request(
    *,
    brand_name: str,
    primary_market: str,
    profile: dict,
    competitors: list[str],
    topics: list[DiscoveryTopic],
    rejected_reasons: tuple[str, ...] = (),
) -> str:
    payload: dict[str, object] = {
        "brand_name": brand_name,
        "brand_aliases": [],
        "competitors": competitors,
        "market": primary_market,
        "business_summary": str(profile.get("description") or ""),
        "allowed_intents": list(PROMPT_INTENTS),
        "topics": [
            {"topic_id": str(topic.topic_id), "name": topic.name} for topic in topics
        ],
    }
    if rejected_reasons:
        payload["previous_validation_errors"] = list(rejected_reasons)
    return json.dumps(payload, ensure_ascii=False)


def _parsed_prompts(payload: dict) -> list[dict]:
    rows = payload.get("prompts")
    if not isinstance(rows, list):
        return []
    prompts: list[dict] = []
    for row in rows[:DISCOVERY_PROMPT_CANDIDATE_COUNT]:
        if not isinstance(row, dict):
            continue
        try:
            item = GeneratedPrompt.model_validate(row)
        except ValidationError:
            continue
        prompts.append(
            {
                "topic_id": str(item.topic_id),
                "text": item.text,
                "intent": item.intent,
                "cohort": item.cohort,
            }
        )
    return prompts


async def generate_portfolio(
    *,
    brand_name: str,
    primary_market: str,
    profile: dict,
    competitors: list[str],
    competitor_terms: list[str] | None = None,
    topics: list[DiscoveryTopic],
) -> PortfolioResult:
    """Generate and validate once, with one bounded corrective retry."""
    try:
        client = create_model_gateway()
    except AgentNotConfiguredError:
        return PortfolioResult(errors=("generation_unavailable",))
    rejected: tuple[str, ...] = ()
    try:
        async with asyncio.timeout(
            brand_discovery_settings.portfolio_generation_timeout_seconds
        ):
            for _attempt in range(2):
                request = _request(
                    brand_name=brand_name,
                    primary_market=primary_market,
                    profile=profile,
                    competitors=competitors,
                    topics=topics,
                    rejected_reasons=rejected,
                )
                try:
                    raw = await client.complete_structured_json(
                        system=ONBOARDING_PORTFOLIO_SYSTEM_PROMPT,
                        user=request,
                        schema_name="initial_visibility_prompts",
                        schema=PortfolioEnvelope.model_json_schema(),
                    )
                    payload = json.loads(raw)
                except (ProviderError, ValidationError, ValueError):
                    return PortfolioResult(
                        errors=("generation_unavailable",),
                        provider=client.base_url_host,
                        model=client.model,
                    )
                decoded = payload if isinstance(payload, dict) else {}
                candidates = _parsed_prompts(decoded)
                result = select_portfolio(
                    candidates,
                    topic_ids=[str(topic.topic_id) for topic in topics],
                    brand_terms=[brand_name],
                    competitor_terms=competitor_terms or competitors,
                )
                if result.accepted:
                    return PortfolioResult(
                        prompts=result.accepted,
                        errors=result.errors,
                        provider=client.base_url_host,
                        model=client.model,
                    )
                rejected = result.errors or ("generation_malformed",)
    except TimeoutError:
        rejected = ("generation_timeout",)
    return PortfolioResult(
        errors=rejected or ("generation_failed",),
        provider=client.base_url_host,
        model=client.model,
    )
