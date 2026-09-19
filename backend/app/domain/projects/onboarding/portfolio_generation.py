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
    onboarding_portfolio_system_prompt,
)
from app.domain.projects.discovery_schemas import DiscoveryTopic
from app.domain.projects.offering_harvest import OfferingHarvest
from app.domain.projects.onboarding.structured_generation import (
    complete_validated_envelope,
)
from app.domain.projects.onboarding.topic_admission import admit_topics
from app.domain.prompts.portfolio_validation import PortfolioValidator

CONFIRMED_CONTEXT_REF = "confirmed_profile:reviewed"
PROVISIONAL_CONTEXT_REF = "research_profile:unreviewed"


class BuyerIntent(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str = Field(min_length=1, max_length=64, pattern=r"\S")
    buyer_need: str = Field(min_length=1, max_length=300, pattern=r"\S")
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


def _provisional_facts(profile: dict, context: dict, sources: dict) -> dict:
    inferred = {
        key: value
        for key, value in context.items()
        if key != "field_sources" and sources.get(key) != "reviewed"
    }
    for field in ("description", "positioning", "products_services", "target_audience"):
        if profile.get(field):
            inferred[field] = profile[field]
    return inferred


def _context_sections(profile: dict) -> tuple[dict, dict]:
    context = profile.get("business_context") or {}
    if not context:
        return {}, {key: value for key, value in profile.items() if value}
    sources = context.get("field_sources") or {}
    reviewed = {
        key: value for key, value in context.items() if sources.get(key) == "reviewed"
    }
    return reviewed, _provisional_facts(profile, context, sources)


def _validate_topic_links(
    topic: IntentTopic, *, intents: dict[str, BuyerIntent], known_refs: set[str]
) -> None:
    if any(ref not in known_refs for ref in topic.evidence_refs):
        raise ValueError("Unknown topic evidence reference")
    if any(intent_id not in intents for intent_id in topic.intent_ids):
        raise ValueError("Unknown topic intent reference")
    if any(prompt.intent_id not in topic.intent_ids for prompt in topic.prompts):
        raise ValueError("Core prompt is not linked to its topic intent")


def _validate_links(
    envelope: PortfolioEnvelope, known_refs: set[str]
) -> dict[str, BuyerIntent]:
    intents = {intent.id: intent for intent in envelope.intents}
    if len(intents) != len(envelope.intents):
        raise ValueError("Duplicate buyer intent IDs")
    if any(
        intent.buyer_stage not in BUYER_STAGES
        or intent.decision_intent not in PROMPT_INTENT_LEGACY
        for intent in envelope.intents
    ):
        raise ValueError("Invalid buyer stage or decision intent")
    for topic in envelope.topics:
        _validate_topic_links(topic, intents=intents, known_refs=known_refs)
    named = [*envelope.diagnostic_prompts, *envelope.comparison_prompts]
    if any(prompt.intent_id not in intents for prompt in named):
        raise ValueError("Unknown named prompt intent reference")
    return intents


class _Admission:
    def __init__(
        self,
        *,
        intents: dict[str, BuyerIntent],
        topics: list[DiscoveryTopic],
        brand_terms: list[str],
        competitor_terms: list[str],
    ) -> None:
        self.intents = intents
        self.topics = topics
        self.validator = PortfolioValidator(
            topic_ids=frozenset(str(topic.topic_id) for topic in topics),
            brand_terms=brand_terms,
            competitor_terms=competitor_terms,
        )
        self.warnings: list[str] = []
        self.core_count: dict[str, int] = {}
        self.covered_intents: set[str] = set()
        self.by_name = {topic.name.casefold(): topic for topic in topics}

    def offer(self, prompt: IntentPrompt, *, cohort: str, topic_id: str = "") -> None:
        intent = self.intents[prompt.intent_id]
        error = self.validator.offer(
            {
                "text": prompt.text,
                "topic_id": topic_id,
                "intent": PROMPT_INTENT_LEGACY[intent.decision_intent],
                "buyer_stage": intent.buyer_stage,
                "prompt_intent": intent.decision_intent,
                "slot_id": prompt.intent_id,
            },
            cohort=cohort,
        )
        if error:
            self.warnings.append(f"prompt_rejected:{error}")
        elif cohort == PROMPT_COHORT_CORE:
            self.core_count[topic_id] = self.core_count.get(topic_id, 0) + 1
            self.covered_intents.add(prompt.intent_id)

    def admit_core(self, candidates: list[IntentTopic]) -> None:
        admitted = self._admitted_core_topics(candidates)
        if not admitted:
            return
        for depth in range(max(len(candidate.prompts) for candidate, _ in admitted)):
            if sum(self.core_count.values()) >= VISIBILITY_MAX_ORGANIC_PROMPTS:
                self.warnings.append("organic_capacity_reached")
                break
            for candidate, topic_id in admitted:
                if depth >= len(candidate.prompts):
                    continue
                if sum(self.core_count.values()) >= VISIBILITY_MAX_ORGANIC_PROMPTS:
                    break
                self.offer(
                    candidate.prompts[depth],
                    cohort=PROMPT_COHORT_CORE,
                    topic_id=topic_id,
                )
        for _, topic_id in admitted:
            if not self.core_count.get(topic_id):
                self.warnings.append("empty_topic_dropped")

    def _admitted_core_topics(
        self, candidates: list[IntentTopic]
    ) -> list[tuple[IntentTopic, str]]:
        admitted: list[tuple[IntentTopic, str]] = []
        for candidate in candidates:
            name = " ".join(candidate.name.split()).casefold()
            topic = self.by_name.pop(name, None)
            if topic is None:
                self.warnings.append("topic_rejected")
                continue
            admitted.append((candidate, str(topic.topic_id)))
        return admitted

    def admit_named(self, envelope: PortfolioEnvelope) -> None:
        for prompt in envelope.diagnostic_prompts:
            if prompt.intent_id in self.covered_intents:
                self.offer(prompt, cohort=PROMPT_COHORT_BRAND_DIAGNOSTIC)
        for prompt in envelope.comparison_prompts:
            if prompt.intent_id in self.covered_intents:
                self.offer(prompt, cohort=PROMPT_COHORT_COMPARISON)

    def result(self, envelope: PortfolioEnvelope) -> PortfolioResult:
        surviving_topics = tuple(
            topic for topic in self.topics if self.core_count.get(str(topic.topic_id))
        )
        if not surviving_topics or not self.covered_intents:
            raise ValueError("No valid intent-linked core portfolio remains")
        self.admit_named(envelope)
        return PortfolioResult(
            topics=surviving_topics,
            prompts=tuple(
                {
                    **{key: value for key, value in row.items() if key != "slot_id"},
                    "buyer_intent_id": row["slot_id"],
                }
                for row in self.validator.accepted
            ),
            intents=tuple(
                intent.model_dump()
                for intent in envelope.intents
                if intent.id in self.covered_intents
            ),
            warnings=tuple(dict.fromkeys(self.warnings)),
        )


def _admit(
    envelope: PortfolioEnvelope,
    *,
    brand_name: str,
    brand_terms: list[str],
    competitor_terms: list[str],
    category_terms: list[str],
    known_refs: set[str],
) -> PortfolioResult:
    intents = _validate_links(envelope, known_refs)
    topics = admit_topics(
        [
            {
                "name": topic.name,
                "description": topic.description,
                "source_refs": topic.evidence_refs,
            }
            for topic in envelope.topics
        ],
        known_refs=known_refs,
        forbidden_terms=[brand_name, *competitor_terms],
        business_terms=category_terms,
    )
    admission = _Admission(
        intents=intents,
        topics=topics,
        brand_terms=brand_terms,
        competitor_terms=competitor_terms,
    )
    admission.admit_core(envelope.topics)
    return admission.result(envelope)


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
    """Ask once for the complete hierarchy and validate it before persistence."""
    client = create_model_gateway()
    reviewed, inferred = _context_sections(profile)
    known_refs = {node.ref for node in harvest.nodes} | {
        str(item["evidence_ref"]) for item in page_evidence
    }
    if reviewed:
        known_refs.add(CONFIRMED_CONTEXT_REF)
    if inferred:
        known_refs.add(PROVISIONAL_CONTEXT_REF)
    user = json.dumps(
        {
            "brand_name": brand_name,
            "market": primary_market,
            "confirmed_context": {"ref": CONFIRMED_CONTEXT_REF, "facts": reviewed},
            "provisional_research_context": {
                "ref": PROVISIONAL_CONTEXT_REF,
                "facts": inferred,
                "review_state": "unreviewed",
            },
            "accepted_competitors": competitors,
            "offering_harvest": harvest.serialize(),
            "research_evidence": page_evidence,
        },
        ensure_ascii=False,
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
        system=onboarding_portfolio_system_prompt(),
        user=user,
        schema_name="visibility_intent_portfolio",
        envelope_type=PortfolioEnvelope,
        validate=validate,
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
