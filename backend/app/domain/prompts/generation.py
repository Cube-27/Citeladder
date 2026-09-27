# AI prompt generation on the business map (prompt generation v2).
#
# Pipeline for one Generate request (count N, topic_ids, cohort):
#   topics  selected, or recovered from confirmed offerings
#   cells   compatible offering x facet x stage x market cells from the
#           business map; N x overgenerate_factor (generation_cells.py)
#   1 GENERATE  batched model calls, one natural buyer question per cell
#   2 ADMIT     parse, cohort identity, brand/competitor rules, length, exact
#               duplicates, topical binding, verbatim evidence copies
#   3 SELECT    top N diversified across topic, stage, audience and market;
#               a shortfall is reported, never filled
#   4 JEV       shadow quality decisions for the selected candidates: they
#               rank and flag the review list and never drop anything
#               (quality_judge.py)
#   5 STAGE     PromptCandidate rows with provenance (candidates.py)
#
# JEV judges only what selection kept, so in shadow mode it cannot change
# which candidates reach review; it becomes a gate only in PR 3c.
#
# Core and brand cohorts use the app-level default agent (``connectors/agent``);
# Commerce buyer prompts have their own owner (``/commerce/buyer-prompts``).
# Only a user's accept turns a candidate into an active prompt, and no
# provider measurement runs until the user explicitly runs or schedules one.
from __future__ import annotations

import hashlib
import json
import uuid
from dataclasses import dataclass
from typing import Any

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.connectors.agent.gateway import ModelGateway
from app.connectors.jev import JevClient
from app.core.config.jev import QUALITY_GATE_OFF
from app.core.config.prompts import (
    GENERATOR_VERSION,
    prompt_generation_settings,
)
from app.core.config.visibility_prompts import BUYER_QUERY_POLICY_VERSION
from app.domain.projects.business_context import BusinessContext
from app.domain.projects.business_map import (
    BusinessMap,
    OfferingMap,
    with_model_suggestions,
)
from app.domain.projects.knowledge_base import build_brand_knowledge_data
from app.domain.projects.shim import project_scoring_identity
from app.domain.prompts.candidates import pending_text_hashes, stage_candidates
from app.domain.prompts.demand_grounding import (
    load_demand_grounding,
    serialize_demand_signal,
)
from app.domain.prompts.generation_cells import (
    CellTopic,
    offering_for_topic,
    plan_generation_cells,
)
from app.domain.prompts.generation_contract import (
    GenerationOutput,
    GenerationOutputError,
    SuggestedPrompt,
    SuggestedTopic,
    build_generation_user_message,
    parse_generation_output,
    planned_slot_count,
    slot_call_budget,
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
from app.domain.prompts.generation_selection import (
    count_prompts,
    drop_texts,
    observed_query_hashes,
    select_diversified,
)
from app.domain.prompts.locks import acquire_project_lock, acquire_prompt_set_lock
from app.domain.prompts.map_suggestions import suggest_offering_maps
from app.domain.prompts.normalization import prompt_text_hash
from app.domain.prompts.quality_judge import JudgeResult, judge_candidates
from app.domain.prompts.query_patterns import PromptSlot, slots_for_cells
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
    "GenerationResult",
    "GenerationValidationError",
    "SuggestedPrompt",
    "SuggestedTopic",
    "build_generation_user_message",
    "generate_prompts",
    "parse_generation_output",
    "validate_generation_request",
]

_TOPIC_NOT_IN_PROJECT = "topic_id is not a topic of this project"


@dataclass(frozen=True)
class GenerationResult:
    candidates: list[PromptCandidate]
    topics: list[Topic]
    # Duplicates dropped: intra-response, already tracked or already pending.
    dropped_duplicates: int
    # Suggestions that passed deterministic admission before selection.
    candidates_generated: int
    quality_gate: str = QUALITY_GATE_OFF


@dataclass
class _Context:
    """Everything read before provider I/O (the read transaction commits)."""

    brand_context: dict[str, Any]
    demand_snapshot: DemandSnapshot | None
    demand_signals: list[DemandSignal]
    cell_topics: list[CellTopic]
    offerings_to_map: list[str]
    known_hashes: set[str]
    vocabulary: BindingVocabulary
    markets: list[str]


@dataclass
class _Drafts:
    suggestions: list[SuggestedTopic]
    dropped_duplicates: int
    generated: int
    map_suggestions: list[OfferingMap]


def _brand_context_hash(brand_context: dict[str, Any]) -> str:
    canonical = json.dumps(brand_context, sort_keys=True, default=str)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


# --------------------------------------------------------------------------
# Scope and request validation
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


def requested_topic_ids(payload: Any) -> list[uuid.UUID]:
    """``topic_ids`` plus the single-topic ``topic_id`` field, de-duplicated."""
    ids = [*payload.topic_ids, payload.topic_id]
    return list(dict.fromkeys(topic_id for topic_id in ids if topic_id is not None))


def _resolve_target_topics(prompt_set: PromptSet, payload: Any) -> list[Topic]:
    """The selected topics, or every project topic when none are selected.

    Raises ``GenerationValidationError`` (422) when a selected id is not a
    topic of this set's project — including a topic deleted before
    persistence, so a disappearance is a scoped 422, never an FK 500.
    """
    by_id = {topic.id: topic for topic in prompt_set.project.topics}
    wanted = requested_topic_ids(payload)
    if not wanted:
        return list(prompt_set.project.topics)
    if any(topic_id not in by_id for topic_id in wanted):
        raise GenerationValidationError(_TOPIC_NOT_IN_PROJECT)
    return [by_id[topic_id] for topic_id in wanted]


def _validate_generation_payload(prompt_set: PromptSet, payload: Any) -> None:
    """Bounds + topic-ownership checks (422 at the API layer)."""
    max_count = prompt_generation_settings.max_count
    if payload.count > max_count:
        raise GenerationValidationError(
            f"count must be at most {max_count} (requested {payload.count})"
        )
    max_topics = prompt_generation_settings.max_topic_ids
    if len(requested_topic_ids(payload)) > max_topics:
        raise GenerationValidationError(f"Select at most {max_topics} topics")
    _resolve_target_topics(prompt_set, payload)
    if payload.cohort == "commerce":
        raise GenerationValidationError(
            "Commerce buyer prompts are generated from /commerce/buyer-prompts"
        )
    if not prompt_set.project.topics and not confirmed_offerings(prompt_set.project):
        raise GenerationValidationError(
            "Add at least one confirmed offering before generating prompts"
        )


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


# --------------------------------------------------------------------------
# Context read before provider I/O
# --------------------------------------------------------------------------
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


def _cell_topics(
    project: Project, topics: list[Topic], business_map: BusinessMap
) -> list[CellTopic]:
    names = {topic.id: topic.name for topic in project.topics}
    return [
        CellTopic(
            topic_id=topic.id,
            name=topic.name,
            description=topic.description or "",
            offering_map=offering_for_topic(
                business_map,
                topic.name,
                names.get(topic.parent_id) if topic.parent_id else None,
            ),
        )
        for topic in topics
    ]


def _offerings_to_map(project: Project, cell_topics: list[CellTopic]) -> list[str]:
    """Confirmed offerings among the selected topics that have no map yet."""
    offerings = {name.casefold(): name for name in confirmed_offerings(project)}
    wanted: dict[str, str] = {}
    for topic in cell_topics:
        key = topic.name.casefold()
        if topic.offering_map is None and key in offerings:
            wanted.setdefault(key, offerings[key])
    return list(wanted.values())


async def _read_context(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    prompt_set: PromptSet,
    payload: Any,
) -> _Context:
    project = prompt_set.project
    demand_snapshot, demand_signals = await load_demand_grounding(
        session, workspace_id=workspace_id, project_id=project.id, limit=payload.count
    )
    business = BusinessContext.from_project(project)
    cell_topics = _cell_topics(
        project, _resolve_target_topics(prompt_set, payload), business.business_map
    )
    pending = await pending_text_hashes(
        session, workspace_id=workspace_id, prompt_set_id=prompt_set.id
    )
    return _Context(
        brand_context=_generation_brand_context(
            project, demand_signals, demand_snapshot
        ),
        demand_snapshot=demand_snapshot,
        demand_signals=demand_signals,
        cell_topics=cell_topics,
        offerings_to_map=_offerings_to_map(project, cell_topics),
        known_hashes={p.normalized_text_hash for p in prompt_set.prompts} | pending,
        vocabulary=build_project_vocabulary(project),
        markets=list(business.service_areas),
    )


# --------------------------------------------------------------------------
# Provider I/O: suggest map entries, write one question per cell, admit
# --------------------------------------------------------------------------
def _drop_cross_batch_duplicates(
    existing: list[SuggestedTopic], incoming: list[SuggestedTopic]
) -> tuple[list[SuggestedTopic], int]:
    """Remove and count normalized exact duplicates across accepted batches."""
    previous = {
        prompt_text_hash(prompt.text) for topic in existing for prompt in topic.prompts
    }
    return drop_texts(incoming, previous)


def _drop_unbound_suggestions(
    suggestions: list[SuggestedTopic], vocabulary: BindingVocabulary
) -> list[SuggestedTopic]:
    """Drop suggested prompts that fail topical binding (model output is
    not trusted merely because a model produced it). Topics emptied by the
    drop are removed."""
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
    last_error: GenerationOutputError | None = None
    for _call in range(slot_call_budget(len(planned_slots))):
        accepted = _accepted_slot_ids(suggestions)
        remaining = [slot for slot in planned_slots if slot.slot_id not in accepted]
        if not remaining:
            break
        batch_slots = remaining[:batch_size]
        raw = await agent.complete_structured_json(
            system=generation_system_prompt(payload.cohort, brand_context),
            user=build_generation_user_message(
                brand_context=brand_context,
                slots=batch_slots,
                existing_prompts=_existing_generation_context(
                    prompt_set,
                    suggestions,
                    limit=prompt_generation_settings.existing_prompt_context_limit,
                ),
            ),
            schema_name="prompt_generation",
            schema=GenerationOutput.model_json_schema(),
        )
        try:
            batch, batch_dropped = parse_generation_output(raw, slots=batch_slots)
        except GenerationOutputError as exc:
            last_error = exc
            continue
        batch, duplicate_count = _drop_cross_batch_duplicates(suggestions, batch)
        dropped += batch_dropped + duplicate_count
        suggestions.extend(
            filter_for_cohort(batch, payload.cohort, brand_context, validator=validator)
        )
    if not suggestions and last_error is not None:
        raise last_error
    return suggestions, dropped


def _effective_cell_topics(
    cell_topics: list[CellTopic], map_suggestions: list[OfferingMap]
) -> list[CellTopic]:
    """Ground topics without a map in this run's (unreviewed) suggestions."""
    by_key = {item.offering.casefold(): item for item in map_suggestions}
    return [
        CellTopic(
            topic_id=topic.topic_id,
            name=topic.name,
            description=topic.description,
            offering_map=topic.offering_map or by_key.get(topic.name.casefold()),
        )
        for topic in cell_topics
    ]


def _planned_slots(
    payload: Any, context: _Context, map_suggestions: list[OfferingMap]
) -> list[PromptSlot]:
    cells = plan_generation_cells(
        _effective_cell_topics(context.cell_topics, map_suggestions),
        total=planned_slot_count(payload.count),
        markets=context.markets,
    )
    brand_context = context.brand_context
    return slots_for_cells(
        cells,
        cohort=payload.cohort,
        intents=tuple(intent for intent in payload.intents if intent),
        brand_name=str(brand_context.get("brand_name") or ""),
        competitor_names=tuple(
            str(item.get("name") or "")
            for item in brand_context.get("competitors", [])
            if item.get("name")
        ),
    )


async def _draft(
    *,
    agent: ModelGateway,
    prompt_set: PromptSet,
    payload: Any,
    context: _Context,
) -> _Drafts:
    map_suggestions = await suggest_offering_maps(
        agent, offerings=context.offerings_to_map, brand_context=context.brand_context
    )
    planned_slots = _planned_slots(payload, context, map_suggestions)
    if not planned_slots:
        raise GenerationOutputError("No prompt labels support this request")
    suggestions, dropped = await _collect_model_suggestions(
        agent=agent,
        prompt_set=prompt_set,
        payload=payload,
        brand_context=context.brand_context,
        planned_slots=planned_slots,
    )
    suggestions = _drop_unbound_suggestions(suggestions, context.vocabulary)
    suggestions, known = drop_texts(suggestions, context.known_hashes)
    suggestions, _verbatim = drop_texts(
        suggestions,
        observed_query_hashes(context.brand_context.get("demand_signals") or []),
    )
    return _Drafts(
        suggestions=select_diversified(suggestions, payload.count),
        dropped_duplicates=dropped + known,
        generated=count_prompts(suggestions),
        map_suggestions=map_suggestions,
    )


# --------------------------------------------------------------------------
# Staging (write transaction, under locks)
# --------------------------------------------------------------------------
def _generation_evidence(
    *,
    agent: ModelGateway,
    payload: Any,
    context: _Context,
    drafts: _Drafts,
    quality_gate: str,
) -> dict[str, Any]:
    snapshot = context.demand_snapshot
    return {
        "generation_mode": "model",
        "model_identity": {
            "transport_host": agent.base_url_host,
            "transport_model": agent.model,
        },
        "generator_version": GENERATOR_VERSION,
        "buyer_query_policy_version": BUYER_QUERY_POLICY_VERSION,
        "brand_context_hash": _brand_context_hash(context.brand_context),
        "requested_count": payload.count,
        "requested_topic_ids": [str(t) for t in requested_topic_ids(payload)],
        "requested_intents": [intent for intent in payload.intents if intent],
        "cohort": payload.cohort,
        "candidates_generated": drafts.generated,
        "quality_gate": quality_gate,
        "business_map_suggested_offerings": [
            item.offering for item in drafts.map_suggestions
        ],
        "demand_snapshot_id": str(snapshot.id) if snapshot else None,
        "demand_signal_ids": [str(signal.id) for signal in context.demand_signals],
        "demand_signal_coverage": dict(snapshot.coverage or {}) if snapshot else {},
    }


def _record_map_suggestions(
    project: Project, suggestions: list[OfferingMap], run_id: str
) -> None:
    profile = project.brand.profile if project.brand is not None else None
    if profile is None or not suggestions:
        return
    updated = with_model_suggestions(
        profile.business_context,
        suggestions,
        offerings=list(profile.products_services or []),
        run_id=run_id,
    )
    if updated is not None:
        profile.business_context = updated


async def _stage(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    prompt_set_id: uuid.UUID,
    payload: Any,
    evidence: dict[str, Any],
    drafts: _Drafts,
    judged: JudgeResult,
) -> tuple[list[PromptCandidate], list[Topic]]:
    # The objects loaded before provider I/O are stale (the set/project/topic
    # could have been renamed or deleted mid-request). Take the PROJECT lock
    # (serializes topic deletes) then the PROMPT-SET lock — the fixed order
    # every writer uses — and re-resolve everything fresh, row-locking the
    # set. ``expire_all`` stops the identity map serving a deleted topic.
    await acquire_project_lock(session, project_id)
    await acquire_prompt_set_lock(session, prompt_set_id)
    session.expire_all()
    prompt_set = await _load_prompt_set_with_project(
        session, workspace_id=workspace_id, prompt_set_id=prompt_set_id, for_update=True
    )
    _resolve_target_topics(prompt_set, payload)
    project = prompt_set.project
    staged = await stage_candidates(
        session,
        workspace_id=workspace_id,
        prompt_set=prompt_set,
        topics_by_id={topic.id: topic for topic in project.topics},
        suggestions=drafts.suggestions,
        request=payload.model_dump(mode="json"),
        provenance=evidence,
        cohort=payload.cohort,
        decisions=judged.decisions,
    )
    _record_map_suggestions(project, drafts.map_suggestions, str(staged.run_id))
    touched_ids = {candidate.topic_id for candidate in staged.candidates}
    touched = [topic for topic in project.topics if topic.id in touched_ids]
    for topic in touched:
        await session.refresh(topic)
    await session.commit()
    drafts.dropped_duplicates += staged.dropped_duplicates
    return staged.candidates, touched


async def generate_prompts(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    prompt_set_id: uuid.UUID,
    payload: Any,
    agent: ModelGateway | None,
    judge: JevClient | None = None,
    prompt_set: PromptSet | None = None,
) -> GenerationResult:
    """Generate topic-organized prompt candidates for review.

    The caller (the API layer) resolves the agent client. ``prompt_set`` may
    be passed pre-loaded (from ``validate_generation_request``) to avoid a
    second scope query; the payload checks always re-run here so direct
    service calls stay guarded. ``judge`` is the JEV client, or ``None`` when
    the quality judge is off. Generated text is never tracked until a user
    accepts it, and generation never initiates provider measurement.
    """
    # Scope first (404 before anything runs), then confirmation + bounds.
    if prompt_set is None:
        prompt_set = await _load_prompt_set_with_project(
            session, workspace_id=workspace_id, prompt_set_id=prompt_set_id
        )
    _validate_generation_payload(prompt_set, payload)
    if not prompt_set.project.topics:
        await recover_topics_from_confirmed_offerings(
            session, workspace_id=workspace_id, project_id=prompt_set.project.id
        )
        session.expire_all()
        prompt_set = await _load_prompt_set_with_project(
            session, workspace_id=workspace_id, prompt_set_id=prompt_set_id
        )
        _validate_generation_payload(prompt_set, payload)
    context = await _read_context(
        session, workspace_id=workspace_id, prompt_set=prompt_set, payload=payload
    )
    # Commit before any network I/O.
    await session.commit()
    if agent is None:
        raise GenerationOutputError("Model gateway is required for this cohort")
    drafts = await _draft(
        agent=agent, prompt_set=prompt_set, payload=payload, context=context
    )
    judged = await judge_candidates(
        session,
        judge=judge,
        workspace_id=workspace_id,
        prompt_set=prompt_set,
        suggestions=drafts.suggestions,
        brand_context=context.brand_context,
    )
    evidence = _generation_evidence(
        agent=agent,
        payload=payload,
        context=context,
        drafts=drafts,
        quality_gate=judged.quality_gate,
    )
    try:
        candidates, touched = await _stage(
            session,
            workspace_id=workspace_id,
            project_id=prompt_set.project.id,
            prompt_set_id=prompt_set_id,
            payload=payload,
            evidence=evidence,
            drafts=drafts,
            judged=judged,
        )
    except IntegrityError as exc:
        # A referenced set/topic may have disappeared despite the advisory
        # lock. Re-check ONLY the scoped entities this request depends on: a
        # vanished set is a 404, a vanished selected topic a 422, and any
        # other integrity error is re-raised unchanged (500).
        await session.rollback()
        await reraise_scoped_integrity_error(
            session,
            workspace_id=workspace_id,
            prompt_set_id=prompt_set_id,
            topic_ids=requested_topic_ids(payload),
            exc=exc,
        )
        raise
    return GenerationResult(
        candidates=candidates,
        topics=touched,
        dropped_duplicates=drafts.dropped_duplicates,
        candidates_generated=drafts.generated,
        quality_gate=judged.quality_gate,
    )
