# AI competitor / owned-domain / prompt suggestion service for the setup form.
#
# Stateless sibling of ``domain/prompts/generation.py``: uses the app-level
# default agent (``connectors/agent``) — never a measurement engine and never
# a BYOK measurement key — but persists NOTHING. The setup form may be for a
# brand-new, unsaved project, so brand context arrives in the request body and
# suggestions are returned for the user to review in the form; the existing
# project save flow persists whatever survives review. Brand context is sent
# to the agent only after the caller has explicitly confirmed
# (``confirm_send_evidence``, enforced HERE, not just in the UI).
#
# Prompt suggestions reuse the agent prompt-construction half of prompt
# generation in its owner (invariant 2): the system prompt
# (``config/prompts.py``), the user-message builder, the output contract, and
# the parser (``domain/prompts/generation.py``) are imported, never copied;
# this module only adapts the topic-grouped output to the stateless
# ``{text, theme, intent}`` row shape.
from __future__ import annotations

import json
import re
from typing import Any

from pydantic import BaseModel, Field, ValidationError

from app.connectors.agent.client import DefaultAgentClient
from app.connectors.web_evidence.brand_evidence import evidence_block_lines
from app.core.config.brand_evidence import BRAND_EVIDENCE_FAILURE_MESSAGES
from app.core.config.prompts import GENERATION_SYSTEM_PROMPT
from app.core.config.suggestions import (
    COMPETITOR_SUGGESTION_SYSTEM_PROMPT,
    OWNED_DOMAIN_SUGGESTION_SYSTEM_PROMPT,
    brand_suggestion_settings,
    prompt_suggestion_settings,
)
from app.domain.projects.brand_evidence import BrandEvidence, collect_brand_evidence
from app.domain.projects.knowledge_base import serialize_brand_knowledge_context
from app.domain.prompts.generation import (
    GenerationOutputError,
    build_generation_user_message,
    parse_generation_output,
)
from app.domain.prompts.normalization import prompt_text_hash


class SuggestionValidationError(ValueError):
    """Request-level validation failure (422 at the API layer)."""


class SuggestionOutputError(RuntimeError):
    """The agent returned output that could not be parsed into suggestions."""


class BrandEvidenceRequiredError(ValueError):
    """No grounding: the website is unreadable AND no description was given.

    Raised BEFORE the agent is called. Onboarding sends only brand name, URL,
    and locale, so when the site cannot be read the model would be inventing a
    business from the name — the root cause of fabricated competitors and
    prompts for brands with no training-data footprint.
    """

    def __init__(self, message: str, *, reason: str) -> None:
        super().__init__(message)
        self.reason = reason


# --------------------------------------------------------------------------
# Agent-output contracts (strict, unit-testable without a live provider)
# --------------------------------------------------------------------------
class SuggestedCompetitor(BaseModel):
    # ``max_length`` mirrors ``CompetitorInput.name``: an overlong agent name
    # must fail HERE (converted to ``SuggestionOutputError`` -> 502) rather
    # than at response serialization.
    name: str = Field(min_length=1, max_length=255)
    aliases: list[str] = Field(default_factory=list)
    domains: list[str] = Field(default_factory=list)


class CompetitorSuggestionOutput(BaseModel):
    competitors: list[SuggestedCompetitor] = Field(default_factory=list)


class OwnedDomainSuggestionOutput(BaseModel):
    domains: list[str] = Field(default_factory=list)


# Mirrors the frontend ``DOMAIN_PATTERN`` (``lib/setup/forms.ts``) so every
# domain this service returns passes the form's per-row validation on append.
_DOMAIN_PATTERN = re.compile(
    r"^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$", re.IGNORECASE
)


def _normalize_domain(value: str) -> str | None:
    """Coerce agent output to a bare lowercase domain, or ``None`` if hopeless.

    Strips scheme, ``www.`` prefix, path/query, port, and trailing dots, then
    validates the remainder; the model sometimes returns URLs despite the
    bare-domain instruction, and dropping those silently would waste usable
    suggestions.
    """
    candidate = value.strip().lower()
    if not candidate:
        return None
    candidate = re.sub(r"^[a-z][a-z0-9+.-]*://", "", candidate)
    candidate = candidate.split("/", 1)[0].split("?", 1)[0].split("#", 1)[0]
    candidate = candidate.split("@")[-1].split(":", 1)[0]
    candidate = candidate.removeprefix("www.").rstrip(".")
    if not candidate or not _DOMAIN_PATTERN.match(candidate):
        return None
    return candidate


# --------------------------------------------------------------------------
# Parsing (strict on structure, lenient on content)
# --------------------------------------------------------------------------
def parse_competitor_output(
    raw: str, *, existing_names: list[str]
) -> tuple[list[SuggestedCompetitor], int]:
    """Parse + sanitize the agent's JSON into competitor suggestions.

    Strict on structure (malformed JSON / wrong shape raises), lenient on
    content: blank names dropped, invalid domains normalized or dropped,
    duplicates collapsed case-insensitively — both within the response and
    against ``existing_names`` already in the caller's form.

    Returns ``(competitors, dropped_duplicate_count)``.
    """
    try:
        output = CompetitorSuggestionOutput.model_validate(json.loads(raw))
    except (json.JSONDecodeError, ValidationError) as exc:
        raise SuggestionOutputError(f"Unparseable agent output: {exc}") from exc

    seen = {name.strip().casefold() for name in existing_names if name.strip()}
    dropped = 0
    competitors: list[SuggestedCompetitor] = []
    for competitor in output.competitors:
        name = competitor.name.strip()
        if not name:
            continue
        key = name.casefold()
        if key in seen:
            dropped += 1
            continue
        seen.add(key)
        aliases: list[str] = []
        for alias in competitor.aliases:
            alias = alias.strip()
            if alias and alias.casefold() not in {a.casefold() for a in aliases}:
                aliases.append(alias)
        domains: list[str] = []
        for domain in competitor.domains:
            normalized = _normalize_domain(domain)
            if normalized and normalized not in domains:
                domains.append(normalized)
        competitors.append(
            SuggestedCompetitor(name=name, aliases=aliases, domains=domains)
        )
    if not competitors:
        raise SuggestionOutputError("Agent output contained no usable competitors")
    return competitors, dropped


def parse_owned_domain_output(
    raw: str, *, existing_domains: list[str]
) -> tuple[list[str], int]:
    """Parse + sanitize the agent's JSON into owned-domain suggestions.

    Returns ``(domains, dropped_duplicate_count)``. Unnormalizable candidates
    are dropped silently (not counted as duplicates); duplicates are counted
    both within the response and against ``existing_domains``.
    """
    try:
        output = OwnedDomainSuggestionOutput.model_validate(json.loads(raw))
    except (json.JSONDecodeError, ValidationError) as exc:
        raise SuggestionOutputError(f"Unparseable agent output: {exc}") from exc

    seen = {
        normalized
        for domain in existing_domains
        if (normalized := _normalize_domain(domain)) is not None
    }
    dropped = 0
    domains: list[str] = []
    for candidate in output.domains:
        normalized = _normalize_domain(candidate)
        if normalized is None:
            continue
        if normalized in seen:
            dropped += 1
            continue
        seen.add(normalized)
        domains.append(normalized)
    if not domains:
        raise SuggestionOutputError("Agent output contained no usable domains")
    return domains, dropped


# --------------------------------------------------------------------------
# Request building (pure)
# --------------------------------------------------------------------------
def _brand_context_lines(brand_context: dict[str, Any]) -> list[str]:
    """Knowledge block, then the website-evidence block, then aliases.

    ``website_evidence`` is already a serialized, delimited block, so it is
    emitted alongside the knowledge block rather than nested inside its JSON —
    where it would be an unreadable escaped string and the agent would be far
    less likely to treat it as the primary source.
    """
    lines = [
        serialize_brand_knowledge_context(
            {
                key: value
                for key, value in brand_context.items()
                if key not in ("brand_aliases", "website_evidence") and value
            }
        )
    ]
    lines += evidence_block_lines(
        brand_context.get("website_evidence", ""),
        "Ground your answer in the <brand_website_evidence> page content "
        "above: it is what this brand actually does. Do NOT infer the "
        "brand's market from its name.",
    )
    lines.append(
        f"Brand aliases: {', '.join(brand_context.get('brand_aliases', [])) or 'none'}"
    )
    return lines


def build_competitor_user_message(
    *, brand_context: dict[str, Any], existing_names: list[str], count: int
) -> str:
    """Assemble the user message with brand evidence + suggestion constraints."""
    lines = _brand_context_lines(brand_context)
    lines.append(f"Suggest exactly {count} competitors.")
    if existing_names:
        lines.append(
            "Existing competitors (do NOT duplicate any of these):\n- "
            + "\n- ".join(existing_names)
        )
    return "\n".join(lines)


def build_owned_domain_user_message(
    *, brand_context: dict[str, Any], existing_domains: list[str], count: int
) -> str:
    """Assemble the user message with brand evidence + suggestion constraints."""
    lines = _brand_context_lines(brand_context)
    lines.append(
        f"Suggest up to {count} domains owned and operated by this brand. "
        "Only first-party domains: NOT competitor domains, NOT typosquat or "
        "unintended domains."
    )
    if existing_domains:
        lines.append(
            "Existing owned domains (do NOT duplicate any of these):\n- "
            + "\n- ".join(existing_domains)
        )
    return "\n".join(lines)


# --------------------------------------------------------------------------
# Orchestration
# --------------------------------------------------------------------------
def validate_suggestion_payload(payload: Any, *, max_count: int | None = None) -> None:
    """Confirmation + bounds checks (422 at the API layer).

    Pure and agent-free so the API layer can order guards as 422 -> 503: an
    invalid payload must fail validation even when no agent is configured.
    Runs BEFORE any brand context is assembled for the agent — the backend
    enforces consent, never just the UI.

    ``max_count`` overrides the competitor/domain cap (prompt suggestions
    carry their own ``PROMPT_SUGGESTION_MAX_COUNT``).
    """
    if not payload.confirm_send_evidence:
        raise SuggestionValidationError(
            "confirm_send_evidence must be true to send brand evidence to the "
            "default agent"
        )
    cap = max_count if max_count is not None else brand_suggestion_settings.max_count
    if payload.count > cap:
        raise SuggestionValidationError(
            f"count must be at most {cap} (requested {payload.count})"
        )


def _payload_brand_context(payload: Any) -> dict[str, Any]:
    return {
        "brand_name": payload.brand_name,
        "brand_aliases": [a for a in payload.brand_aliases if a.strip()],
        "website_url": payload.website_url,
        "country_code": payload.country_code,
        "language_code": payload.language_code,
        "description": payload.description,
        "positioning": payload.positioning,
        "products_services": [
            item.strip() for item in payload.products_services if item.strip()
        ],
        "target_audience": payload.target_audience,
    }


def _has_curated_context(payload: Any) -> bool:
    """Whether the caller supplied any human-authored brand description.

    Onboarding sends brand name + URL + locale ONLY — every descriptive field
    is empty — so without web evidence the agent has nothing to reason from but
    the NAME. A setup form where a human has typed a description is different:
    that is real grounding, and the crawl is then an enhancement rather than a
    precondition.
    """
    return bool(
        (payload.description or "").strip()
        or (payload.positioning or "").strip()
        or (payload.target_audience or "").strip()
        or [item for item in payload.products_services if item.strip()]
    )


async def _ground_brand_context(payload: Any) -> tuple[dict[str, Any], BrandEvidence]:
    """Brand context enriched with what the brand's own website actually says.

    Returns ``(context, evidence)``. The fetched page text is added under
    ``website_evidence`` so the serialized knowledge block carries real,
    readable facts instead of a bare URL the model cannot open.

    Raises ``BrandEvidenceRequiredError`` when there is NO grounding at all —
    neither curated fields nor readable page content. Suggesting competitors
    and prompts from a brand name alone is precisely how an unknown brand ends
    up with a fabricated market, so refusing is the correct outcome.
    """
    context = _payload_brand_context(payload)
    evidence = await collect_brand_evidence(payload.website_url)
    if evidence.is_sufficient:
        context["website_evidence"] = evidence.serialize()
        return context, evidence
    if not _has_curated_context(payload):
        raise BrandEvidenceRequiredError(
            BRAND_EVIDENCE_FAILURE_MESSAGES.get(
                evidence.failure_reason,
                "Could not read this brand's website, and no brand "
                "description was provided. Add a short description of what "
                "the brand does, then try again.",
            ),
            reason=evidence.failure_reason,
        )
    return context, evidence


async def suggest_competitors(
    *, payload: Any, agent: DefaultAgentClient
) -> tuple[list[SuggestedCompetitor], int]:
    """Validate consent/bounds, call the agent, and parse competitor suggestions."""
    validate_suggestion_payload(payload)
    existing = [n for n in payload.existing_competitor_names if n.strip()]
    brand_context, _ = await _ground_brand_context(payload)
    user_message = build_competitor_user_message(
        brand_context=brand_context,
        existing_names=existing,
        count=payload.count,
    )
    raw = await agent.complete_json(
        system=COMPETITOR_SUGGESTION_SYSTEM_PROMPT, user=user_message
    )
    # The brand itself and its aliases are excluded server-side, not just via
    # the system prompt — an agent echoing the brand must never survive.
    excluded = existing + [
        n for n in (payload.brand_name, *payload.brand_aliases) if n.strip()
    ]
    competitors, dropped = parse_competitor_output(raw, existing_names=excluded)
    return competitors[: payload.count], dropped


async def suggest_owned_domains(
    *, payload: Any, agent: DefaultAgentClient
) -> tuple[list[str], int]:
    """Validate consent/bounds, call the agent, and parse owned-domain suggestions."""
    validate_suggestion_payload(payload)
    existing = [d for d in payload.existing_owned_domains if d.strip()]
    brand_context, _ = await _ground_brand_context(payload)
    user_message = build_owned_domain_user_message(
        brand_context=brand_context,
        existing_domains=existing,
        count=payload.count,
    )
    raw = await agent.complete_json(
        system=OWNED_DOMAIN_SUGGESTION_SYSTEM_PROMPT, user=user_message
    )
    domains, dropped = parse_owned_domain_output(raw, existing_domains=existing)
    return domains[: payload.count], dropped


# --------------------------------------------------------------------------
# Prompt suggestions (stateless adapter over the generation contract)
# --------------------------------------------------------------------------
class SuggestedPromptRow(BaseModel):
    """One flattened suggestion; ``theme`` is the topic the agent grouped it under."""

    text: str = Field(min_length=1)
    theme: str = Field(default="", max_length=255)
    intent: str = ""


class SuggestedPromptTopic(BaseModel):
    """The agent's topic grouping, preserved rather than flattened away.

    ``parse_prompt_suggestion_output`` returns both this and the flat rows: the
    flat form is what a form-filling caller wants, the grouped form is what a
    caller that persists needs in order to create the same ``Topic`` rows the
    ``/generate`` flow creates.
    """

    name: str = Field(min_length=1, max_length=255)
    prompts: list[SuggestedPromptRow] = Field(default_factory=list)


def validate_prompt_suggestion_payload(payload: Any) -> None:
    """Prompt-suggestion consent + bounds (422 at the API layer).

    Same contract as ``validate_suggestion_payload`` under the prompt-specific
    count cap (``PROMPT_SUGGESTION_MAX_COUNT``) — kept as a named entry point
    so the API layer orders guards 422 -> 503 without reading config itself.
    """
    validate_suggestion_payload(payload, max_count=prompt_suggestion_settings.max_count)


def build_prompt_suggestion_user_message(
    *,
    brand_context: dict[str, Any],
    competitor_names: list[str],
    existing_texts: list[str],
    count: int,
) -> str:
    """Assemble the user message via the generation builder (its owner).

    Reshapes the flat setup-form brand context into the dict layout
    ``build_generation_user_message`` consumes — the same shape the persisted
    flow builds from ORM rows (knowledge-base block + brand/alias/competitor/
    market lines). Topic and intent scoping don't exist pre-save, so those
    constraints stay empty.
    """
    generation_context = {
        # Mirrors ``build_brand_knowledge_data``: aliases ride their own line
        # in the generation message; empty values are omitted.
        # ``website_evidence`` is excluded here and passed as its own block —
        # nested inside this JSON it would be an escaped, unreadable string.
        "knowledge_base": {
            key: value
            for key, value in brand_context.items()
            if key not in ("brand_aliases", "website_evidence") and value
        },
        "brand_name": brand_context.get("brand_name", ""),
        "brand_aliases": brand_context.get("brand_aliases", []),
        "competitors": [{"name": name, "aliases": []} for name in competitor_names],
        "country_code": brand_context.get("country_code", ""),
        "language_code": brand_context.get("language_code", ""),
        "website_evidence": brand_context.get("website_evidence", ""),
    }
    return build_generation_user_message(
        brand_context=generation_context,
        existing_topics=[],
        existing_prompts=existing_texts,
        count=count,
        intents=[],
    )


def parse_prompt_suggestion_output(
    raw: str, *, existing_texts: list[str]
) -> tuple[list[SuggestedPromptRow], list[SuggestedPromptTopic], int]:
    """Adapt the generation output contract into prompt rows AND their topics.

    Structure and intra-response dedupe stay with the owner parser
    (``parse_generation_output``); this adapter tags each prompt with its topic
    name and additionally drops texts equivalent to ``existing_texts`` already
    in the caller's form (counted as duplicates, same normalized-text hash as
    the persisted flow).

    Returns ``(rows, topics, dropped_duplicate_count)``. The two lists hold the
    same prompts: ``rows`` flat for form-filling callers, ``topics`` grouped for
    callers that persist and need to recreate the agent's topics. A topic whose
    prompts were all dropped as duplicates is omitted rather than emitted empty.

    Grouping is by the topic's ``lower()`` name — the same canonical form as the
    DB's unique index on ``lower(name)`` and the in-memory match in
    ``generation._get_or_create_topic`` — so an agent that emits "Shoes" and
    "shoes" as separate topics collapses here exactly as it would on persist.
    """
    try:
        topics, dropped = parse_generation_output(raw)
    except GenerationOutputError as exc:
        raise SuggestionOutputError(str(exc)) from exc

    seen = {prompt_text_hash(text) for text in existing_texts if text.strip()}
    rows: list[SuggestedPromptRow] = []
    grouped: dict[str, SuggestedPromptTopic] = {}
    for topic in topics:
        for prompt in topic.prompts:
            text_hash = prompt_text_hash(prompt.text)
            if text_hash in seen:
                dropped += 1
                continue
            seen.add(text_hash)
            row = SuggestedPromptRow(
                text=prompt.text, theme=topic.name, intent=prompt.intent
            )
            rows.append(row)
            key = topic.name.lower()
            group = grouped.get(key)
            if group is None:
                group = SuggestedPromptTopic(name=topic.name, prompts=[])
                grouped[key] = group
            group.prompts.append(row)
    if not rows:
        raise SuggestionOutputError("Agent output contained no usable prompts")
    return rows, list(grouped.values()), dropped


async def suggest_prompts(
    *, payload: Any, agent: DefaultAgentClient
) -> tuple[list[SuggestedPromptRow], list[SuggestedPromptTopic], int]:
    """Validate consent/bounds, call the agent, and parse prompt suggestions.

    Returns the capped flat rows, the same prompts grouped by topic, and the
    dropped-duplicate count.
    """
    validate_prompt_suggestion_payload(payload)
    existing = [t for t in payload.existing_prompt_texts if t.strip()]
    competitor_names = [n for n in payload.competitor_names if n.strip()]
    brand_context, _ = await _ground_brand_context(payload)
    user_message = build_prompt_suggestion_user_message(
        brand_context=brand_context,
        competitor_names=competitor_names,
        existing_texts=existing,
        count=payload.count,
    )
    raw = await agent.complete_json(system=GENERATION_SYSTEM_PROMPT, user=user_message)
    rows, topics, dropped = parse_prompt_suggestion_output(raw, existing_texts=existing)
    capped = rows[: payload.count]
    # Re-derive the groups from the capped rows rather than returning the full
    # grouping: the two views must describe the same prompts, or a caller that
    # persists from ``topics`` would create more prompts than ``count`` allows.
    kept = {id(row) for row in capped}
    capped_topics = [
        SuggestedPromptTopic(
            name=topic.name,
            prompts=[row for row in topic.prompts if id(row) in kept],
        )
        for topic in topics
    ]
    return capped, [t for t in capped_topics if t.prompts], dropped
