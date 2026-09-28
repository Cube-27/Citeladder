# Generated-prompt candidate staging.
#
# Generate stages its validated suggestions here instead of inserting prompts.
# Review (list, accept, reject) is owned by the TypeScript API
# (``frontend/services/api/src/prompts/candidates.ts``): only its accept
# creates a ``Prompt``, so a proposal is never audited, charged or counted
# before a person accepts it. Gate-failed candidates become text-free outcome
# records for calibrating the judge (config/prompts.py).
# Every query is scoped by ``workspace_id`` (invariant 5).
from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import delete, select, text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config.prompts import (
    BINDING_CODE_ACCEPTED,
    CANDIDATE_DISPOSITION_GATE_REJECTED,
    CANDIDATE_DISPOSITION_PENDING,
    CANDIDATE_OUTCOME_DISPOSITIONS,
    GENERATOR_VERSION,
    prompt_generation_settings,
)
from app.domain.prompts.generation_contract import SuggestedPrompt, SuggestedTopic
from app.domain.prompts.generation_selection import select_diversified
from app.domain.prompts.normalization import prompt_text_hash
from app.domain.prompts.quality_policy import gated_out
from app.models.prompt import Prompt, PromptSet, Topic
from app.models.prompt_candidate import PromptCandidate, PromptGenerationRun


@dataclass(frozen=True)
class StagedCandidates:
    run_id: uuid.UUID
    candidates: list[PromptCandidate]
    dropped_duplicates: int
    # Candidates the quality gate failed; kept only as outcome records.
    gate_rejected: int = 0


def _pending_clause(now: datetime) -> tuple[Any, ...]:
    return (
        PromptCandidate.disposition == CANDIDATE_DISPOSITION_PENDING,
        PromptCandidate.expires_at > now,
    )


async def purge_expired_candidates(
    session: AsyncSession, *, workspace_id: uuid.UUID, prompt_set_id: uuid.UUID
) -> None:
    """Delete pending candidates and outcome records past retention.

    Write paths only. An outcome record's ``expires_at`` is its purge time.
    """
    await session.execute(
        delete(PromptCandidate).where(
            PromptCandidate.workspace_id == workspace_id,
            PromptCandidate.prompt_set_id == prompt_set_id,
            PromptCandidate.disposition.in_(
                {CANDIDATE_DISPOSITION_PENDING, *CANDIDATE_OUTCOME_DISPOSITIONS}
            ),
            PromptCandidate.expires_at <= datetime.now(UTC),
        )
    )


def _outcome_expiry(now: datetime) -> datetime:
    days = prompt_generation_settings.rejected_outcome_retention_days
    return now + timedelta(days=days)


def _text_free_decision(decision: dict[str, Any]) -> dict[str, Any]:
    """The decision without the duplicate option's prompt text."""
    duplicate = decision.get("duplicate_of")
    if not isinstance(duplicate, dict):
        return decision
    return {**decision, "duplicate_of": {**duplicate, "text": None}}


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


async def pending_text_hashes(
    session: AsyncSession, *, workspace_id: uuid.UUID, prompt_set_id: uuid.UUID
) -> set[str]:
    """Normalized texts already waiting for review in the set (a read)."""
    result = await session.execute(
        select(PromptCandidate.normalized_text_hash).where(
            PromptCandidate.workspace_id == workspace_id,
            PromptCandidate.prompt_set_id == prompt_set_id,
            *_pending_clause(datetime.now(UTC)),
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
    jev_decision: dict[str, Any] | None = None,
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
        "evidence_refs": list(prompt.evidence_refs),
        # Only suggestions that passed every deterministic admission rule
        # (parse, cohort identity, brand/competitor rules, exact duplicates,
        # topical binding) reach staging.
        "validation": {"admission": "passed", "topical_binding": BINDING_CODE_ACCEPTED},
        "jev_decision": jev_decision,
        "disposition": CANDIDATE_DISPOSITION_PENDING,
        "created_at": now,
        "expires_at": now
        + timedelta(hours=prompt_generation_settings.candidate_retention_hours),
    }


def _stageable(
    suggestions: list[SuggestedTopic],
    topics_by_id: dict[uuid.UUID, Topic],
    existing: set[str],
) -> tuple[list[tuple[uuid.UUID, SuggestedPrompt]], int]:
    """Suggestions to stage, plus how many were already-tracked duplicates.

    Suggestions under a topic that vanished during provider I/O are skipped,
    not counted as duplicates.
    """
    stageable: list[tuple[uuid.UUID, SuggestedPrompt]] = []
    duplicates = 0
    for topic in suggestions:
        if topic.topic_id not in topics_by_id:
            continue
        for prompt in topic.prompts:
            if prompt_text_hash(prompt.text) in existing:
                duplicates += 1
            else:
                stageable.append((topic.topic_id, prompt))
    return stageable, duplicates


async def _record_gate_rejections(
    session: AsyncSession, rows: list[dict[str, Any]], now: datetime
) -> tuple[list[dict[str, Any]], int]:
    """Store gate-failed rows as text-free outcomes; return the reviewable rest."""
    gated = [row for row in rows if gated_out(row["jev_decision"])]
    for row in gated:
        row.update(
            text="",
            normalized_text_hash="",
            jev_decision=_text_free_decision(row["jev_decision"]),
            disposition=CANDIDATE_DISPOSITION_GATE_REJECTED,
            reviewed_at=now,
            expires_at=_outcome_expiry(now),
        )
    if gated:
        await session.execute(pg_insert(PromptCandidate).values(gated))
    return [row for row in rows if not gated_out(row["jev_decision"])], len(gated)


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
    decisions: dict[str, dict[str, Any]] | None = None,
    selection_limit: int | None = None,
) -> StagedCandidates:
    """Record one generation run and its pending candidates.

    The caller holds the project and prompt-set locks. Suggestions whose text
    is already a prompt in the set, or already pending review, are dropped
    and counted; nothing is charged to prompt capacity. ``decisions`` holds
    shadow quality decisions keyed by normalized text hash.
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
    # Re-read pending texts under the caller's locks so a copy staged since the
    # context read cannot take a selection slot; the insert still ignores races.
    existing |= await pending_text_hashes(
        session, workspace_id=workspace_id, prompt_set_id=prompt_set.id
    )
    stageable, dropped = _stageable(suggestions, topics_by_id, existing)
    now = datetime.now(UTC)
    rows = [
        _candidate_row(
            workspace_id=workspace_id,
            run_id=run.id,
            prompt_set_id=prompt_set.id,
            topic_id=topic_id,
            prompt=prompt,
            cohort=cohort,
            now=now,
            jev_decision=(decisions or {}).get(prompt_text_hash(prompt.text)),
        )
        for topic_id, prompt in stageable
    ]
    rows, gated = await _record_gate_rejections(session, rows, now)
    if selection_limit is not None:
        rows = _selected_rows(rows, suggestions, selection_limit, decisions)
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
    candidates = review_order(await _load_in_order(session, inserted_ids))
    return StagedCandidates(
        run_id=run.id,
        candidates=candidates,
        dropped_duplicates=dropped,
        gate_rejected=gated,
    )


def _selected_rows(
    rows: list[dict[str, Any]],
    suggestions: list[SuggestedTopic],
    limit: int,
    decisions: dict[str, dict[str, Any]] | None,
) -> list[dict[str, Any]]:
    available = {row["normalized_text_hash"] for row in rows}
    eligible = [
        topic.model_copy(
            update={
                "prompts": [
                    prompt
                    for prompt in topic.prompts
                    if prompt_text_hash(prompt.text) in available
                ]
            }
        )
        for topic in suggestions
    ]
    selected = {
        prompt_text_hash(prompt.text)
        for topic in select_diversified(eligible, limit, decisions)
        for prompt in topic.prompts
    }
    return [row for row in rows if row["normalized_text_hash"] in selected]


def _review_rank(candidate: PromptCandidate) -> tuple[bool, float]:
    decision = candidate.jev_decision or {}
    score = decision.get("rank_score")
    return (
        bool(decision.get("flags")),
        -score if isinstance(score, float | int) else 0.0,
    )


def review_order(candidates: list[PromptCandidate]) -> list[PromptCandidate]:
    """Newest run first; within a run, shadow-flagged rows last, then by the
    judge's rank score. Stable, so unjudged runs keep their order."""
    by_rank = sorted(candidates, key=_review_rank)
    return sorted(by_rank, key=lambda c: c.created_at, reverse=True)


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
