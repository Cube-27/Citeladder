# AI prompt/topic generation service.
#
# Core and brand cohorts use the app-level default agent (``connectors/agent``);
# Commerce buyer prompts have their own owner (``/commerce/buyer-prompts``).
# Validated suggestions are staged as ``PromptCandidate`` rows
# (``domain/prompts/candidates.py``) with full provenance (invariant 4); only a
# user's accept turns a candidate into an active prompt, and no provider
# measurement runs until the user explicitly runs or schedules an audit.
from __future__ import annotations

import hashlib
import json
import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.connectors.agent.gateway import ModelGateway
from app.core.config.prompts import (
    GENERATOR_VERSION,
    prompt_generation_settings,
)
from app.core.config.visibility_prompts import BUYER_QUERY_POLICY_VERSION
from app.domain.projects.business_context import BusinessContext
from app.domain.projects.knowledge_base import build_brand_knowledge_data
from app.domain.projects.shim import project_scoring_identity
from app.domain.prompts.candidates import stage_candidates
from app.domain.prompts.demand_grounding import (
    load_demand_grounding,
    serialize_demand_signal,
)
from app.domain.prompts.generation_contract import (
    GenerationOutput,
    GenerationOutputError,
    SuggestedPrompt,
    SuggestedTopic,
    build_generation_user_message,
    generation_model_call_budget,
    parse_generation_output,
)
from app.domain.prompts.generation_errors import (
    GenerationValidationError,
    reraise_scoped_integrity_error,
)
from app.domain.prompts.generation_filtering import (
    build_validator,
    filter_for_cohort,
    generation_system_prompt,
)
from app.domain.prompts.locks import acquire_project_lock, acquire_prompt_set_lock
from app.domain.prompts.normalization import prompt_text_hash
from app.domain.prompts.query_patterns import PromptSlot, build_prompt_slots
from app.domain.prompts.service import PromptSetNotFoundError
from app.domain.prompts.topic_recovery import (
    confirmed_offerings,
    recover_topics_from_confirmed_offerings,
)
from app.domain.prompts.topical_binding import (
    BindingVocabulary,
    build_project_vocabulary,
    validate_prompt_binding,
)
from app.models.brand import Brand
from app.models.demand import DemandSignal, DemandSnapshot
from app.models.project import Project
from app.models.prompt import PromptSet, Topic
from app.models.prompt_candidate import PromptCandidate

__all__ = [
    "GenerationOutputError",
    "GenerationValidationError",
    "SuggestedPrompt",
    "SuggestedTopic",
    "build_generation_user_message",
    "generate_prompts",
    "parse_generation_output",
    "validate_generation_request",
]


def _brand_context_hash(brand_context: dict[str, Any]) -> str:
    canonical = json.dumps(brand_context, sort_keys=True, default=str)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


# --------------------------------------------------------------------------
# Orchestration
# --------------------------------------------------------------------------
async def _load_prompt_set_with_project(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    prompt_set_id: uuid.UUID,
    for_update: bool = False,
) -> PromptSet:
    stmt = (
        select(PromptSet)
        .join(Project, Project.id == PromptSet.project_id)
        .options(
            selectinload(PromptSet.prompts),
            selectinload(PromptSet.project)
            .selectinload(Project.brand)
            .selectinload(Brand.aliases),
            selectinload(PromptSet.project)
            .selectinload(Project.brand)
            .selectinload(Brand.profile),
            selectinload(PromptSet.project).selectinload(Project.competitors),
            selectinload(PromptSet.project).selectinload(Project.owned_domains),
            selectinload(PromptSet.project).selectinload(Project.unintended_domains),
            selectinload(PromptSet.project).selectinload(Project.topics),
        )
        .where(PromptSet.id == prompt_set_id, Project.workspace_id == workspace_id)
    )
    if for_update:
        # Row-lock only the prompt-set row (never the joined project) so the
        # lock scope is minimal and the ordering — advisory lock first, then
        # this row lock — is identical to every other writer, so no deadlock.
        stmt = stmt.with_for_update(of=PromptSet)
    result = await session.execute(stmt)
    prompt_set = result.scalars().unique().one_or_none()
    if prompt_set is None:
        raise PromptSetNotFoundError("Prompt set not found")
    return prompt_set


def _drop_cross_batch_duplicates(
    existing: list[SuggestedTopic], incoming: list[SuggestedTopic]
) -> tuple[list[SuggestedTopic], int]:
    """Remove and count normalized exact duplicates across accepted batches."""
    previous = {
        prompt_text_hash(prompt.text) for topic in existing for prompt in topic.prompts
    }
    retained: list[SuggestedTopic] = []
    dropped = 0
    for topic in incoming:
        prompts: list[SuggestedPrompt] = []
        for prompt in topic.prompts:
            if prompt_text_hash(prompt.text) in previous:
                dropped += 1
            else:
                prompts.append(prompt)
        if prompts:
            retained.append(
                SuggestedTopic(
                    topic_id=topic.topic_id, name=topic.name, prompts=prompts
                )
            )
    return retained, dropped


def _resolve_target_topic(prompt_set: PromptSet, payload: Any) -> Topic | None:
    """Resolve ``payload.topic_id`` against the prompt set's project topics.

    Returns ``None`` for unscoped generation. Raises
    ``GenerationValidationError`` (422 at the API layer) when a ``topic_id`` is
    given but is not a topic of this set's project — including the case where a
    topic that existed at validation time was deleted before persistence, so a
    disappearance surfaces as a scoped 422 rather than an FK 500.
    """
    if payload.topic_id is None:
        return None
    target_topic = next(
        (t for t in prompt_set.project.topics if t.id == payload.topic_id), None
    )
    if target_topic is None:
        raise GenerationValidationError("topic_id is not a topic of this project")
    return target_topic


def _validate_generation_payload(prompt_set: PromptSet, payload: Any) -> Topic | None:
    """Bounds + topic-ownership checks (422 at the API layer).

    Returns the target topic when ``payload.topic_id`` is set.
    """
    max_count = prompt_generation_settings.max_count
    if payload.count > max_count:
        raise GenerationValidationError(
            f"count must be at most {max_count} (requested {payload.count})"
        )
    target_topic = _resolve_target_topic(prompt_set, payload)
    if payload.cohort == "commerce":
        raise GenerationValidationError(
            "Commerce buyer prompts are generated from /commerce/buyer-prompts"
        )
    if not prompt_set.project.topics and not confirmed_offerings(prompt_set.project):
        raise GenerationValidationError(
            "Add at least one confirmed offering before generating prompts"
        )
    return target_topic


async def validate_generation_request(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    prompt_set_id: uuid.UUID,
    payload: Any,
) -> PromptSet:
    """Scope + payload validation without touching the agent.

    Lets the API layer order guards as 404 -> 422 -> 503: an invalid payload
    must fail validation even when no agent is configured.
    """
    prompt_set = await _load_prompt_set_with_project(
        session, workspace_id=workspace_id, prompt_set_id=prompt_set_id
    )
    _validate_generation_payload(prompt_set, payload)
    return prompt_set


def _cap_suggestions_to_count(
    suggestions: list[SuggestedTopic], count: int
) -> list[SuggestedTopic]:
    """Trim parsed suggestions to at most ``count`` prompts total.

    A misbehaving model can return more prompts than requested; enforce the
    cap before persistence, preserving topic grouping and response order
    (topics are truncated once the budget is spent, and an emptied topic is
    dropped).
    """
    if count <= 0:
        return []
    remaining = count
    capped: list[SuggestedTopic] = []
    for topic in suggestions:
        if remaining <= 0:
            break
        kept = topic.prompts[:remaining]
        if kept:
            capped.append(
                SuggestedTopic(topic_id=topic.topic_id, name=topic.name, prompts=kept)
            )
            remaining -= len(kept)
    return capped


def _drop_unbound_suggestions(
    suggestions: list[SuggestedTopic], vocabulary: BindingVocabulary
) -> list[SuggestedTopic]:
    """Drop suggested prompts that fail topical binding (model output is
    not trusted merely because a model produced it).

    Runs before any occupancy charge or insert: an off-domain suggestion is
    never persisted and never consumes a ``prompt_slots`` slot. Topics
    emptied by the drop are removed; when every suggestion is off-domain the
    generation persists nothing (an empty 201), matching the duplicate-drop
    sanitize semantics.
    """
    kept: list[SuggestedTopic] = []
    for topic in suggestions:
        prompts = [
            p
            for p in topic.prompts
            if validate_prompt_binding(p.text, vocabulary).accepted
        ]
        if prompts:
            kept.append(
                SuggestedTopic(
                    topic_id=topic.topic_id, name=topic.name, prompts=prompts
                )
            )
    return kept


def _generation_brand_context(
    project: Project,
    demand_signals: list[DemandSignal],
    demand_snapshot: DemandSnapshot | None = None,
) -> dict[str, Any]:
    context = project_scoring_identity(project)
    context["knowledge_base"] = build_brand_knowledge_data(project)
    context["business_context"] = BusinessContext.from_project(project).for_generation()
    context["demand_signals"] = [
        serialize_demand_signal(signal, snapshot=demand_snapshot)
        for signal in demand_signals
    ]
    return context


def _generation_evidence(
    *,
    agent: ModelGateway | None,
    payload: Any,
    brand_context: dict[str, Any],
    demand_snapshot: DemandSnapshot | None,
    demand_signals: list[DemandSignal],
) -> dict[str, Any]:
    return {
        "generation_mode": "deterministic" if agent is None else "model",
        "model_identity": (
            {
                "transport_host": agent.base_url_host,
                "transport_model": agent.model,
            }
            if agent is not None
            else None
        ),
        "generator_version": GENERATOR_VERSION,
        "buyer_query_policy_version": BUYER_QUERY_POLICY_VERSION,
        "brand_context_hash": _brand_context_hash(brand_context),
        "requested_count": payload.count,
        "requested_intents": [intent for intent in payload.intents if intent],
        "cohort": payload.cohort,
        "demand_snapshot_id": str(demand_snapshot.id) if demand_snapshot else None,
        "demand_signal_ids": [str(signal.id) for signal in demand_signals],
        "demand_signal_coverage": (
            dict(demand_snapshot.coverage or {}) if demand_snapshot else {}
        ),
    }


def _allowed_generation_topics(
    project: Project, target_topic: Topic | None
) -> list[dict[str, str]]:
    topics = [target_topic] if target_topic is not None else project.topics
    return [
        {
            "id": str(topic.id),
            "name": topic.name,
            "description": topic.description or "",
        }
        for topic in topics
    ]


def _existing_generation_context(
    prompt_set: PromptSet,
    suggestions: list[SuggestedTopic],
    *,
    limit: int,
) -> list[str]:
    if not limit:
        return []
    existing = [prompt.text for prompt in prompt_set.prompts]
    accumulated = [prompt.text for topic in suggestions for prompt in topic.prompts]
    return [*existing, *accumulated][-limit:]


def _accepted_slot_ids(suggestions: list[SuggestedTopic]) -> set[str]:
    return {prompt.slot_id for topic in suggestions for prompt in topic.prompts}


async def _collect_model_suggestions(
    *,
    agent: ModelGateway,
    prompt_set: PromptSet,
    payload: Any,
    brand_context: dict[str, Any],
    planned_slots: list[PromptSlot],
) -> tuple[list[SuggestedTopic], int]:
    suggestions: list[SuggestedTopic] = []
    dropped = 0
    # Exact-duplicate state accumulates across all batches.
    validator = build_validator(
        frozenset(
            str(slot.topic_id) for slot in planned_slots if slot.topic_id is not None
        ),
        brand_context,
    )
    batch_size = min(prompt_generation_settings.model_batch_size, len(planned_slots))
    maximum_calls = generation_model_call_budget(len(planned_slots))
    last_error: GenerationOutputError | None = None
    for _call in range(maximum_calls):
        accepted = _accepted_slot_ids(suggestions)
        remaining = [slot for slot in planned_slots if slot.slot_id not in accepted]
        if not remaining:
            break
        batch_slots = remaining[:batch_size]
        user_message = build_generation_user_message(
            brand_context=brand_context,
            slots=batch_slots,
            existing_prompts=_existing_generation_context(
                prompt_set,
                suggestions,
                limit=prompt_generation_settings.existing_prompt_context_limit,
            ),
        )
        raw = await agent.complete_structured_json(
            system=generation_system_prompt(payload.cohort, brand_context),
            user=user_message,
            schema_name="prompt_generation",
            schema=GenerationOutput.model_json_schema(),
        )
        try:
            batch, batch_dropped = parse_generation_output(raw, slots=batch_slots)
        except GenerationOutputError as exc:
            last_error = exc
            continue
        dropped += batch_dropped
        batch, duplicate_count = _drop_cross_batch_duplicates(suggestions, batch)
        dropped += duplicate_count
        batch = filter_for_cohort(
            batch, payload.cohort, brand_context, validator=validator
        )
        suggestions.extend(batch)
    if not suggestions and last_error is not None:
        raise last_error
    return suggestions, dropped


async def _generate_suggestions(
    session: AsyncSession,
    *,
    prompt_set: PromptSet,
    payload: Any,
    agent: ModelGateway | None,
    workspace_id: uuid.UUID,
) -> tuple[
    list[SuggestedTopic],
    int,
    dict[str, Any],
    DemandSnapshot | None,
    list[DemandSignal],
]:
    target_topic = _resolve_target_topic(prompt_set, payload)
    demand_snapshot, demand_signals = await load_demand_grounding(
        session,
        workspace_id=workspace_id,
        project_id=prompt_set.project.id,
        limit=payload.count,
    )
    brand_context = _generation_brand_context(
        prompt_set.project, demand_signals, demand_snapshot
    )
    allowed_topics = _allowed_generation_topics(prompt_set.project, target_topic)
    planned_slots = build_prompt_slots(
        topics=allowed_topics,
        count=payload.count,
        cohort=payload.cohort,
        intents=tuple(intent for intent in payload.intents if intent),
        brand_name=str(brand_context.get("brand_name") or ""),
        competitor_names=tuple(
            str(item.get("name") or "")
            for item in brand_context.get("competitors", [])
            if item.get("name")
        ),
    )
    if not planned_slots:
        raise GenerationOutputError("No prompt labels support this request")
    await session.commit()
    if agent is None:
        raise GenerationOutputError("Model gateway is required for this cohort")
    suggestions, intra_duplicates = await _collect_model_suggestions(
        agent=agent,
        prompt_set=prompt_set,
        payload=payload,
        brand_context=brand_context,
        planned_slots=planned_slots,
    )
    capped = _cap_suggestions_to_count(suggestions, payload.count)
    return (
        capped,
        intra_duplicates,
        brand_context,
        demand_snapshot,
        demand_signals,
    )


async def generate_prompts(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    prompt_set_id: uuid.UUID,
    payload: Any,
    agent: ModelGateway | None,
    prompt_set: PromptSet | None = None,
) -> tuple[list[PromptCandidate], list[Topic], int]:
    """Generate topic-organized prompt candidates for review.

    Returns ``(staged_candidates, touched_topics, dropped_duplicate_count)``.
    The caller (the API layer) resolves the agent client. ``prompt_set`` may
    be passed pre-loaded (from ``validate_generation_request``) to avoid a
    second scope query; the payload checks always re-run here so direct
    service calls stay guarded.

    Generated text is never tracked until a user accepts it, and generation
    never initiates provider measurement.
    """
    # Scope first (404 before anything runs), then confirmation + bounds.
    if prompt_set is None:
        prompt_set = await _load_prompt_set_with_project(
            session, workspace_id=workspace_id, prompt_set_id=prompt_set_id
        )
    _validate_generation_payload(prompt_set, payload)
    if not prompt_set.project.topics:
        project_id = prompt_set.project.id
        await recover_topics_from_confirmed_offerings(
            session, workspace_id=workspace_id, project_id=project_id
        )
        session.expire_all()
        prompt_set = await _load_prompt_set_with_project(
            session, workspace_id=workspace_id, prompt_set_id=prompt_set_id
        )
        _validate_generation_payload(prompt_set, payload)
    project_id = prompt_set.project.id
    (
        suggestions,
        intra_duplicates,
        brand_context,
        demand_snapshot,
        demand_signals,
    ) = await _generate_suggestions(
        session,
        prompt_set=prompt_set,
        payload=payload,
        agent=agent,
        workspace_id=workspace_id,
    )

    # 4. Re-open the write transaction. The objects loaded before the provider
    #    call are now stale (the set/project/topic could have been renamed or
    #    deleted mid-request), so acquire the SHARED prompt-set advisory lock
    #    (the same one the delete paths take) and then re-resolve everything
    #    fresh, row-locking the set. Deletes block on the advisory lock until we
    #    commit, so nothing can vanish between re-resolution and insertion. A
    #    disappearance that slipped in before we took the lock maps to the same
    #    scoped domain errors the endpoint already handles (404 / 422) — and an
    #    FK violation at insert (belt-and-suspenders) is mapped the same way,
    #    never an unhandled 500.
    #
    #    Lock order is fixed everywhere to preclude deadlock: PROJECT lock
    #    first (serializes topic deletes), then the PROMPT-SET lock.
    await acquire_project_lock(session, project_id)
    await acquire_prompt_set_lock(session, prompt_set_id)
    # Drop every identity-map instance loaded in the pre-provider transaction so
    # the re-resolution below reads committed state from the DB. Without this the
    # selectin-loaded ``project.topics`` collection can be served from the stale
    # identity map, letting a topic deleted mid-request appear to still exist.
    session.expire_all()
    prompt_set = await _load_prompt_set_with_project(
        session,
        workspace_id=workspace_id,
        prompt_set_id=prompt_set_id,
        for_update=True,
    )
    _resolve_target_topic(prompt_set, payload)
    project = prompt_set.project
    topics_by_id = {topic.id: topic for topic in project.topics}

    # 5. Stage candidates only under topics that still exist after provider
    #    I/O. Nothing is charged to prompt capacity until a user accepts.
    evidence_base = _generation_evidence(
        agent=agent,
        payload=payload,
        brand_context=brand_context,
        demand_snapshot=demand_snapshot,
        demand_signals=demand_signals,
    )

    try:
        # Model-generated text must pass topical binding before staging.
        suggestions = _drop_unbound_suggestions(
            suggestions, build_project_vocabulary(project)
        )
        staged = await stage_candidates(
            session,
            workspace_id=workspace_id,
            prompt_set=prompt_set,
            topics_by_id=topics_by_id,
            suggestions=suggestions,
            request=payload.model_dump(mode="json"),
            provenance=evidence_base,
            cohort=payload.cohort,
        )
        touched_ids = {candidate.topic_id for candidate in staged.candidates}
        touched_topics = [topic for topic in project.topics if topic.id in touched_ids]
        for topic in touched_topics:
            await session.refresh(topic)
        await session.commit()
    except IntegrityError as exc:
        # A referenced set/topic may have disappeared despite the advisory
        # lock (e.g. lock skipped on a non-PostgreSQL dialect). Rather than
        # blindly mapping EVERY integrity error to a 404 — which would mask
        # genuine constraint bugs (unique/check/unrelated FK violations) as a
        # phantom "prompt set not found" — roll back and re-check ONLY the
        # scoped entities this request depends on. A disappeared set maps to a
        # scoped 404; a disappeared target topic maps to a scoped 422; any
        # other integrity error is unrelated and re-raised unchanged (500).
        await session.rollback()
        await reraise_scoped_integrity_error(
            session,
            workspace_id=workspace_id,
            prompt_set_id=prompt_set_id,
            topic_id=payload.topic_id,
            exc=exc,
        )

    return (
        staged.candidates,
        touched_topics,
        intra_duplicates + staged.dropped_duplicates,
    )
