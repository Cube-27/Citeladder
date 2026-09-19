"""Frozen source and model provenance for an admitted onboarding prompt."""

from __future__ import annotations

import uuid

from app.core.config.brand_discovery import (
    BRAND_DISCOVERY_PROMPT_GENERATOR_VERSION,
    BRAND_DISCOVERY_PROMPT_VALIDATION_VERSION,
)
from app.core.config.visibility_prompts import (
    BUYER_QUERY_POLICY_VERSION,
    ONBOARDING_PORTFOLIO_VERSION,
)


def prompt_evidence(
    *,
    item: dict,
    discovery_id: uuid.UUID,
    provider: str,
    model: str,
    intents_by_id: dict[str, dict],
    refs_by_topic_id: dict[str, list[str]],
    research_snapshot_id: uuid.UUID | None,
) -> dict:
    intent_id = str(item.get("buyer_intent_id") or "")
    return {
        "generator_version": BRAND_DISCOVERY_PROMPT_GENERATOR_VERSION,
        "buyer_query_policy_version": BUYER_QUERY_POLICY_VERSION,
        "buyer_intent_id": intent_id,
        "discovery_id": str(discovery_id),
        "provider": provider,
        "model": model,
        "portfolio_version": ONBOARDING_PORTFOLIO_VERSION,
        "buyer_intent": intents_by_id.get(intent_id),
        "topic_source_refs": refs_by_topic_id.get(str(item.get("topic_id")), []),
        "research_snapshot_id": (
            str(research_snapshot_id) if research_snapshot_id else None
        ),
        "validation_version": BRAND_DISCOVERY_PROMPT_VALIDATION_VERSION,
    }
