# Generated-prompt candidates: staging, review listing and accept/reject.
#
# Generate stages its validated suggestions here instead of inserting prompts.
# Only an explicit accept creates a ``Prompt``, and only then are prompt
# capacity, the per-set uniqueness guard and ``generation_evidence`` applied,
# so a proposal can never be audited, charged or counted in visibility.
# Every query is scoped by ``workspace_id`` (invariant 5).
from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import delete, select, text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config.projects import PROMPT_ORIGIN_GENERATED
from app.core.config.prompts import (
    BINDING_CODE_ACCEPTED,
    CANDIDATE_DISPOSITION_ACCEPTED,
    CANDIDATE_DISPOSITION_PENDING,
    GENERATOR_VERSION,
    PROMPT_STATUS_ACTIVE,
    prompt_generation_settings,
)
from app.domain.prompts.generation_contract import SuggestedPrompt, SuggestedTopic
from app.domain.prompts.locks import acquire_project_lock, acquire_prompt_set_lock
from app.domain.prompts.normalization import prompt_text_hash
from app.domain.prompts.service import PromptSetNotFoundError, prepare_prompt_inserts
from app.models.project import Project
from app.models.prompt import Prompt, PromptSet, Topic
from app.models.prompt_candidate import PromptCandidate, PromptGenerationRun

_BRANDED_COHORTS = frozenset({"comparison", "brand_diagnostic"})


class CandidateReviewError(ValueError):
    """Raised for a malformed review request (422 at the API layer)."""


@dataclass(frozen=True)
class StagedCandidates:
    candidates: list[PromptCandidate]
    dropped_duplicates: int


@dataclass(frozen=True)
class CandidateReview:
    accepted: list[Prompt]
    rejected_count: int
    dropped_duplicates: int
    unavailable_count: int


def _pending_clause(now: datetime) -> tuple[Any, ...]:
    return (
        PromptCandidate.disposition == CANDIDATE_DISPOSITION_PENDING,
        PromptCandidate.expires_at > now,
    )


async def purge_expired_candidates(
    session: AsyncSession, *, workspace_id: uuid.UUID, prompt_set_id: uuid.UUID
) -> None:
    """Delete pending candidates past retention. Write paths only."""
    await session.execute(
        delete(PromptCandidate).where(
            PromptCandidate.workspace_id == workspace_id,
            PromptCandidate.prompt_set_id == prompt_set_id,
            PromptCandidate.disposition == CANDIDATE_DISPOSITION_PENDING,
            PromptCandidate.expires_at <= datetime.now(UTC),
        )
    )


async def _existing_prompt_hashes(
    session: AsyncSession, prompt_set_id: uuid.UUID, hashes: list[str]
) -> set[str]:
    if not hashes:
        return set()
    result = await session.execute(
        select(Prompt.normalized_text_hash).where(
            Prompt.prompt_set_id == prompt_set_id,
            Prompt.normalized_text_hash.in_(hashes),
        )
    )
    return set(result.scalars().all())


def _candidate_row(
    *,
    workspace_id: uuid.UUID,
    run_id: uuid.UUID,
    prompt_set_id: uuid.UUID,
    topic_id: uuid.UUID,
    prompt: SuggestedPrompt,
    cohort: str,
    now: datetime,
) -> dict[str, Any]:
    return {
        "id": uuid.uuid4(),
        "workspace_id": workspace_id,
        "run_id": run_id,
        "prompt_set_id": prompt_set_id,
        "topic_id": topic_id,
        "text": prompt.text,
        "normalized_text_hash": prompt_text_hash(prompt.text),
        "intent": prompt.intent,
        "buyer_stage": prompt.buyer_stage,
        "prompt_intent": prompt.prompt_intent,
        "cohort": cohort,
        "slot_id": prompt.slot_id,
        "evidence_refs": [],
        # Only suggestions that passed every deterministic admission rule
        # (parse, cohort identity, brand/competitor rules, exact duplicates,
        # topical binding) reach staging.
        "validation": {"admission": "passed", "topical_binding": BINDING_CODE_ACCEPTED},
        "disposition": CANDIDATE_DISPOSITION_PENDING,
        "created_at": now,
        "expires_at": now
        + timedelta(hours=prompt_generation_settings.candidate_retention_hours),
    }


async def stage_candidates(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    prompt_set: PromptSet,
    topics_by_id: dict[uuid.UUID, Topic],
    suggestions: list[SuggestedTopic],
    request: dict[str, Any],
    provenance: dict[str, Any],
    cohort: str,
) -> StagedCandidates:
    """Record one generation run and its pending candidates.

    The caller holds the project and prompt-set locks. Suggestions whose text
    is already a prompt in the set, or already pending review, are dropped
    and counted; nothing is charged to prompt capacity.
    """
    await purge_expired_candidates(
        session, workspace_id=workspace_id, prompt_set_id=prompt_set.id
    )
    run_id = uuid.uuid4()
    run = PromptGenerationRun(
        id=run_id,
        workspace_id=workspace_id,
        project_id=prompt_set.project_id,
        prompt_set_id=prompt_set.id,
        generator_version=GENERATOR_VERSION,
        request=request,
        provenance={**provenance, "generation_run_id": str(run_id)},
    )
    session.add(run)
    await session.flush()

    hashes = [
        prompt_text_hash(prompt.text)
        for topic in suggestions
        for prompt in topic.prompts
    ]
    existing = await _existing_prompt_hashes(session, prompt_set.id, hashes)
    now = datetime.now(UTC)
    rows = [
        _candidate_row(
            workspace_id=workspace_id,
            run_id=run.id,
            prompt_set_id=prompt_set.id,
            topic_id=topic.topic_id,
            prompt=prompt,
            cohort=cohort,
            now=now,
        )
        for topic in suggestions
        if topic.topic_id in topics_by_id
        for prompt in topic.prompts
        if prompt_text_hash(prompt.text) not in existing
    ]
    dropped = len(hashes) - len(rows)
    inserted_ids: list[uuid.UUID] = []
    if rows:
        stmt = (
            pg_insert(PromptCandidate)
            .values(rows)
            .on_conflict_do_nothing(
                index_elements=["prompt_set_id", "normalized_text_hash"],
                index_where=text(f"disposition = '{CANDIDATE_DISPOSITION_PENDING}'"),
            )
            .returning(PromptCandidate.id)
        )
        returned = set((await session.execute(stmt)).scalars().all())
        inserted_ids = [row["id"] for row in rows if row["id"] in returned]
        dropped += len(rows) - len(inserted_ids)
    candidates = await _load_in_order(session, inserted_ids)
    return StagedCandidates(candidates=candidates, dropped_duplicates=dropped)


async def _load_in_order(
    session: AsyncSession, candidate_ids: list[uuid.UUID]
) -> list[PromptCandidate]:
    if not candidate_ids:
        return []
    result = await session.execute(
        select(PromptCandidate).where(PromptCandidate.id.in_(candidate_ids))
    )
    by_id = {candidate.id: candidate for candidate in result.scalars().all()}
    return [by_id[cid] for cid in candidate_ids if cid in by_id]


async def _scoped_prompt_set(
    session: AsyncSession, *, workspace_id: uuid.UUID, prompt_set_id: uuid.UUID
) -> PromptSet:
    result = await session.execute(
        select(PromptSet)
        .join(Project, Project.id == PromptSet.project_id)
        .where(PromptSet.id == prompt_set_id, Project.workspace_id == workspace_id)
    )
    prompt_set = result.scalar_one_or_none()
    if prompt_set is None:
        raise PromptSetNotFoundError("Prompt set not found")
    return prompt_set


async def list_pending_candidates(
    session: AsyncSession, *, workspace_id: uuid.UUID, prompt_set_id: uuid.UUID
) -> list[PromptCandidate]:
    """Pending, unexpired candidates for review, newest run first."""
    await _scoped_prompt_set(
        session, workspace_id=workspace_id, prompt_set_id=prompt_set_id
    )
    result = await session.execute(
        select(PromptCandidate)
        .where(
            PromptCandidate.workspace_id == workspace_id,
            PromptCandidate.prompt_set_id == prompt_set_id,
            *_pending_clause(datetime.now(UTC)),
        )
        .order_by(PromptCandidate.created_at.desc(), PromptCandidate.text)
    )
    return list(result.scalars().all())


def _validate_review_ids(
    accept_ids: list[uuid.UUID], reject_ids: list[uuid.UUID]
) -> None:
    if not accept_ids and not reject_ids:
        raise CandidateReviewError("Select at least one candidate to review")
    if set(accept_ids) & set(reject_ids):
        raise CandidateReviewError("A candidate cannot be accepted and rejected")
    limit = prompt_generation_settings.review_max_ids
    if len(set(accept_ids) | set(reject_ids)) > limit:
        raise CandidateReviewError(f"Review at most {limit} candidates at a time")


def _accepted_evidence(
    candidate: PromptCandidate, run: PromptGenerationRun
) -> dict[str, Any]:
    evidence = {
        **(run.provenance or {}),
        "buyer_query_slot_id": candidate.slot_id,
        "candidate_id": str(candidate.id),
        "candidate_validation": dict(candidate.validation or {}),
    }
    if candidate.jev_decision is not None:
        evidence["jev_decision"] = candidate.jev_decision
    return evidence


async def _insert_accepted(
    session: AsyncSession,
    *,
    prompt_set_id: uuid.UUID,
    candidates: list[PromptCandidate],
) -> dict[uuid.UUID, uuid.UUID]:
    """Conflict-safe prompt insert; returns candidate id -> new prompt id."""
    run_ids = {candidate.run_id for candidate in candidates}
    runs = {
        run.id: run
        for run in (
            await session.execute(
                select(PromptGenerationRun).where(PromptGenerationRun.id.in_(run_ids))
            )
        )
        .scalars()
        .all()
    }
    topic_ids = {c.topic_id for c in candidates if c.topic_id is not None}
    topic_rows = await session.execute(
        select(Topic.id, Topic.name).where(Topic.id.in_(topic_ids))
    )
    topic_names: dict[uuid.UUID | None, str] = {
        topic_id: name for topic_id, name in topic_rows.all()
    }
    planned = {candidate.id: uuid.uuid4() for candidate in candidates}
    rows = [
        {
            "id": planned[candidate.id],
            "prompt_set_id": prompt_set_id,
            "topic_id": candidate.topic_id,
            "text": candidate.text,
            "normalized_text_hash": candidate.normalized_text_hash,
            "theme": topic_names.get(candidate.topic_id, ""),
            "intent": candidate.intent,
            "buyer_stage": candidate.buyer_stage,
            "prompt_intent": candidate.prompt_intent,
            "cohort": candidate.cohort,
            "branded": candidate.cohort in _BRANDED_COHORTS,
            "enabled": True,
            "status": PROMPT_STATUS_ACTIVE,
            "origin": PROMPT_ORIGIN_GENERATED,
            "generation_evidence": _accepted_evidence(
                candidate, runs[candidate.run_id]
            ),
        }
        for candidate in candidates
    ]
    stmt = (
        pg_insert(Prompt)
        .values(rows)
        .on_conflict_do_nothing(constraint="uq_prompt_set_normalized_text")
        .returning(Prompt.id)
    )
    returned = set((await session.execute(stmt)).scalars().all())
    return {cid: pid for cid, pid in planned.items() if pid in returned}


async def _hydrate_prompts(
    session: AsyncSession, prompt_ids: list[uuid.UUID]
) -> list[Prompt]:
    if not prompt_ids:
        return []
    result = await session.execute(select(Prompt).where(Prompt.id.in_(prompt_ids)))
    by_id = {prompt.id: prompt for prompt in result.scalars().all()}
    return [by_id[pid] for pid in prompt_ids if pid in by_id]


async def _accept(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    prompt_set_id: uuid.UUID,
    candidates: list[PromptCandidate],
) -> tuple[list[uuid.UUID], int]:
    """Insert accepted candidates as prompts; returns (prompt ids, dropped)."""
    approved = await prepare_prompt_inserts(
        session,
        workspace_id=workspace_id,
        prompt_set_id=prompt_set_id,
        texts=[candidate.text for candidate in candidates],
    )
    insertable: list[PromptCandidate] = []
    redundant: list[PromptCandidate] = []
    seen: set[str] = set()
    for candidate in candidates:
        key = candidate.normalized_text_hash
        if key in approved and key not in seen:
            insertable.append(candidate)
            seen.add(key)
        else:
            redundant.append(candidate)
    inserted = (
        await _insert_accepted(
            session, prompt_set_id=prompt_set_id, candidates=insertable
        )
        if insertable
        else {}
    )
    now = datetime.now(UTC)
    prompt_ids: list[uuid.UUID] = []
    for candidate in insertable:
        prompt_id = inserted.get(candidate.id)
        if prompt_id is None:
            redundant.append(candidate)
            continue
        candidate.disposition = CANDIDATE_DISPOSITION_ACCEPTED
        candidate.prompt_id = prompt_id
        candidate.reviewed_at = now
        prompt_ids.append(prompt_id)
    # A candidate whose text already became a prompt adds nothing to track.
    for candidate in redundant:
        await session.delete(candidate)
    return prompt_ids, len(redundant)


async def review_candidates(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    prompt_set_id: uuid.UUID,
    accept_ids: list[uuid.UUID],
    reject_ids: list[uuid.UUID],
) -> CandidateReview:
    """Accept (insert as active prompts) or reject (delete) pending candidates.

    Runs under the same lock order as generation and import: project lock,
    prompt-set lock, then the account-capacity lock inside
    ``prepare_prompt_inserts``. Accept re-runs occupancy and the
    conflict-safe insert, so an over-allowance accept raises
    ``OccupancyError`` with nothing written. Ids that are unknown, foreign,
    expired or already reviewed are counted as unavailable, which keeps a
    repeated submit harmless.
    """
    _validate_review_ids(accept_ids, reject_ids)
    prompt_set = await _scoped_prompt_set(
        session, workspace_id=workspace_id, prompt_set_id=prompt_set_id
    )
    await acquire_project_lock(session, prompt_set.project_id)
    await acquire_prompt_set_lock(session, prompt_set_id)
    await purge_expired_candidates(
        session, workspace_id=workspace_id, prompt_set_id=prompt_set_id
    )
    requested = list(dict.fromkeys([*accept_ids, *reject_ids]))
    found = (
        (
            await session.execute(
                select(PromptCandidate)
                .where(
                    PromptCandidate.id.in_(requested),
                    PromptCandidate.workspace_id == workspace_id,
                    PromptCandidate.prompt_set_id == prompt_set_id,
                    *_pending_clause(datetime.now(UTC)),
                )
                .order_by(PromptCandidate.created_at, PromptCandidate.id)
                .with_for_update()
            )
        )
        .scalars()
        .all()
    )
    accept_set = set(accept_ids)
    to_accept = [c for c in found if c.id in accept_set]
    to_reject = [c for c in found if c.id not in accept_set]
    prompt_ids, dropped = (
        await _accept(
            session,
            workspace_id=workspace_id,
            prompt_set_id=prompt_set_id,
            candidates=to_accept,
        )
        if to_accept
        else ([], 0)
    )
    for candidate in to_reject:
        await session.delete(candidate)
    await session.flush()
    accepted = await _hydrate_prompts(session, prompt_ids)
    await session.commit()
    return CandidateReview(
        accepted=accepted,
        rejected_count=len(to_reject),
        dropped_duplicates=dropped,
        unavailable_count=len(requested) - len(found),
    )
