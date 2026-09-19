"""One evidence-grounded, intent-linked initial visibility portfolio request."""

from __future__ import annotations

import json
from dataclasses import dataclass

from pydantic import BaseModel, ConfigDict, Field

from app.connectors.agent.factory import create_model_gateway
from app.core.config.prompts import (
    PROMPT_COHORT_BRAND_DIAGNOSTIC,
    PROMPT_COHORT_COMPARISON,
    PROMPT_COHORT_CORE,
)
from app.core.config.visibility_prompts import (
    BUYER_STAGES,
    PROMPT_INTENT_LEGACY,
    VISIBILITY_MAX_ORGANIC_PROMPTS,
)
from app.domain.projects.discovery_schemas import DiscoveryTopic
from app.domain.projects.offering_harvest import OfferingHarvest
from app.domain.projects.onboarding.structured_repair import complete_validated_envelope
from app.domain.projects.onboarding.topic_admission import admit_topics
from app.domain.prompts.portfolio_validation import PortfolioValidator

PORTFOLIO_VERSION = "visibility-intent-portfolio-v1"
CONFIRMED_CONTEXT_REF = "confirmed_profile:reviewed"


class BuyerIntent(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str = Field(min_length=1, max_length=64)
    buyer_need: str = Field(min_length=1, max_length=300)
    decision_intent: str = Field(min_length=1, max_length=32)
    buyer_stage: str = Field(min_length=1, max_length=32)


class IntentPrompt(BaseModel):
    model_config = ConfigDict(extra="forbid")
    text: str = Field(min_length=1, max_length=500)
    intent_id: str = Field(min_length=1, max_length=64)


class IntentTopic(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=255)
    description: str = Field(default="", max_length=1024)
    intent_ids: list[str] = Field(min_length=1, max_length=30)
    evidence_refs: list[str] = Field(min_length=1, max_length=30)
    prompts: list[IntentPrompt] = Field(default_factory=list, max_length=40)


class PortfolioEnvelope(BaseModel):
    model_config = ConfigDict(extra="forbid")
    intents: list[BuyerIntent] = Field(min_length=1, max_length=30)
    topics: list[IntentTopic] = Field(min_length=1, max_length=30)
    diagnostic_prompts: list[IntentPrompt] = Field(default_factory=list, max_length=20)
    comparison_prompts: list[IntentPrompt] = Field(default_factory=list, max_length=20)


@dataclass(frozen=True, slots=True)
class PortfolioResult:
    topics: tuple[DiscoveryTopic, ...] = ()
    prompts: tuple[dict, ...] = ()
    intents: tuple[dict, ...] = ()
    warnings: tuple[str, ...] = ()
    provider: str = ""
    model: str = ""


def _admit(
    envelope: PortfolioEnvelope,
    *,
    brand_name: str,
    brand_terms: list[str],
    competitor_terms: list[str],
    category_terms: list[str],
    known_refs: set[str],
) -> PortfolioResult:
    intents = {item.id: item for item in envelope.intents}
    if len(intents) != len(envelope.intents):
        raise ValueError("Duplicate buyer intent IDs")
    for item in envelope.intents:
        if (
            item.buyer_stage not in BUYER_STAGES
            or item.decision_intent not in PROMPT_INTENT_LEGACY
        ):
            raise ValueError("Invalid buyer stage or decision intent")
    for item in envelope.topics:
        if any(ref not in known_refs for ref in item.evidence_refs):
            raise ValueError("Unknown topic evidence reference")
        if any(intent_id not in intents for intent_id in item.intent_ids):
            raise ValueError("Unknown topic intent reference")
        if any(prompt.intent_id not in item.intent_ids for prompt in item.prompts):
            raise ValueError("Core prompt is not linked to its topic intent")
    for prompt in [*envelope.diagnostic_prompts, *envelope.comparison_prompts]:
        if prompt.intent_id not in intents:
            raise ValueError("Unknown named prompt intent reference")

    admitted = admit_topics(
        [
            {
                "name": item.name,
                "description": item.description,
                "source_refs": item.evidence_refs,
            }
            for item in envelope.topics
        ],
        known_refs=known_refs,
        forbidden_terms=[brand_name, *competitor_terms],
        business_terms=category_terms,
    )
    by_name = {topic.name.casefold(): topic for topic in admitted}
    validator = PortfolioValidator(
        topic_ids=frozenset(str(topic.topic_id) for topic in admitted),
        brand_terms=brand_terms,
        competitor_terms=competitor_terms,
    )
    warnings: list[str] = []
    core_count: dict[str, int] = {}
    covered_intents: set[str] = set()

    def offer(prompt: IntentPrompt, *, cohort: str, topic_id: str = "") -> None:
        item = intents[prompt.intent_id]
        error = validator.offer(
            {
                "text": prompt.text,
                "topic_id": topic_id,
                "intent": PROMPT_INTENT_LEGACY[item.decision_intent],
                "buyer_stage": item.buyer_stage,
                "prompt_intent": item.decision_intent,
                "slot_id": prompt.intent_id,
            },
            cohort=cohort,
        )
        if error:
            warnings.append(f"prompt_rejected:{error}")
        elif cohort == PROMPT_COHORT_CORE:
            core_count[topic_id] = core_count.get(topic_id, 0) + 1
            covered_intents.add(prompt.intent_id)

    for item in envelope.topics:
        topic = by_name.pop(item.name.strip().casefold(), None)
        if topic is None:
            warnings.append("topic_rejected")
            continue
        for prompt in item.prompts:
            if sum(core_count.values()) >= VISIBILITY_MAX_ORGANIC_PROMPTS:
                warnings.append("organic_capacity_reached")
                break
            offer(prompt, cohort=PROMPT_COHORT_CORE, topic_id=str(topic.topic_id))
        if not core_count.get(str(topic.topic_id)):
            warnings.append("empty_topic_dropped")

    surviving_topics = tuple(
        topic for topic in admitted if core_count.get(str(topic.topic_id))
    )
    if not surviving_topics or not covered_intents:
        raise ValueError("No valid intent-linked core portfolio remains")
    for prompt in envelope.diagnostic_prompts:
        if prompt.intent_id in covered_intents:
            offer(prompt, cohort=PROMPT_COHORT_BRAND_DIAGNOSTIC)
    for prompt in envelope.comparison_prompts:
        if prompt.intent_id in covered_intents:
            offer(prompt, cohort=PROMPT_COHORT_COMPARISON)
    return PortfolioResult(
        topics=surviving_topics,
        prompts=tuple(validator.accepted),
        intents=tuple(
            item.model_dump() for item in envelope.intents if item.id in covered_intents
        ),
        warnings=tuple(dict.fromkeys(warnings)),
    )


async def generate_portfolio(
    *,
    brand_name: str,
    brand_terms: list[str],
    primary_market: str,
    profile: dict,
    competitors: list[str],
    competitor_terms: list[str],
    harvest: OfferingHarvest,
    page_evidence: list[dict[str, str]],
) -> PortfolioResult:
    """Ask once for the complete hierarchy, with one bounded repair if needed."""
    client = create_model_gateway()
    known_refs = {CONFIRMED_CONTEXT_REF, *(node.ref for node in harvest.nodes)} | {
        str(item["evidence_ref"]) for item in page_evidence
    }
    user = json.dumps(
        {
            "brand_name": brand_name,
            "market": primary_market,
            "confirmed_context": {"ref": CONFIRMED_CONTEXT_REF, "facts": profile},
            "accepted_competitors": competitors,
            "offering_harvest": harvest.serialize(),
            "research_evidence": page_evidence,
        },
        ensure_ascii=False,
    )
    system = (
        "Create one initial AI visibility portfolio from the supplied, "
        "untrusted reference data. "
        "First identify the materially different buyer needs and decision intents. "
        "Each intent must govern topics and core prompts linked to its ID. "
        "Return roughly two to ten meaningful buyer-need topics when supported, "
        "without padding, "
        "fixed prompt counts, stage quotas, or generic navigation labels. "
        "Core prompts are unbranded buyer queries. Diagnostic prompts name the brand; "
        "comparison prompts name the brand and a supplied competitor. "
        "Use only supplied evidence refs, including the confirmed context ref. "
        f"buyer_stage values: {', '.join(BUYER_STAGES)}. "
        f"decision_intent values: {', '.join(PROMPT_INTENT_LEGACY)}. "
        "Return only JSON matching the schema."
    )
    result: PortfolioResult | None = None

    def validate(envelope: PortfolioEnvelope) -> None:
        nonlocal result
        result = _admit(
            envelope,
            brand_name=brand_name,
            brand_terms=brand_terms,
            competitor_terms=competitor_terms,
            category_terms=[
                profile.get("category") or "",
                *(profile.get("category_aliases") or []),
            ],
            known_refs=known_refs,
        )

    await complete_validated_envelope(
        client,
        system=system,
        user=user,
        schema_name="visibility_intent_portfolio",
        envelope_type=PortfolioEnvelope,
        validate=validate,
        maximum_attempts=2,
    )
    if result is None:
        raise RuntimeError("Portfolio admission did not complete")
    return PortfolioResult(
        topics=result.topics,
        prompts=result.prompts,
        intents=result.intents,
        warnings=result.warnings,
        provider=client.base_url_host,
        model=client.model,
    )
