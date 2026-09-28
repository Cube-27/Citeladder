# Prompt-set / prompt / topic ORM -> response DTO mappers for the Python
# readers that remain: the project response (embedded prompt sets) and the
# generation response (staged candidates and their topics). The TypeScript API
# owns the prompt-library routes and their views.
from __future__ import annotations

import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config.jev import QUALITY_GATE_OFF, QUALITY_GATE_UNAVAILABLE
from app.core.config.prompts import PROMPT_STATUS_ACTIVE
from app.domain.prompts.schemas import (
    PromptCandidateResponse,
    PromptResponse,
    PromptSetResponse,
    TopicResponse,
)
from app.models.prompt import Prompt, PromptSet, Topic
from app.models.prompt_candidate import PromptCandidate


def prompt_to_response(prompt: Prompt) -> PromptResponse:
    return PromptResponse.model_validate(prompt)


def prompt_set_to_response(prompt_set: PromptSet) -> PromptSetResponse:
    prompts = [prompt_to_response(p) for p in prompt_set.prompts]
    return PromptSetResponse(
        id=prompt_set.id,
        project_id=prompt_set.project_id,
        name=prompt_set.name,
        description=prompt_set.description,
        prompts=prompts,
        prompt_count=len(prompts),
        created_at=prompt_set.created_at,
        updated_at=prompt_set.updated_at,
    )


async def active_prompt_counts(
    session: AsyncSession, *, project_id: uuid.UUID
) -> dict[uuid.UUID, int]:
    """Active prompts per topic of the project, for the topics rail."""
    result = await session.execute(
        select(Prompt.topic_id, func.count(Prompt.id))
        .join(Topic, Topic.id == Prompt.topic_id)
        .where(Topic.project_id == project_id, Prompt.status == PROMPT_STATUS_ACTIVE)
        .group_by(Prompt.topic_id)
    )
    return {
        topic_id: count
        for topic_id, count in result.tuples().all()
        if topic_id is not None
    }


def topic_to_response(
    topic: Topic, active_counts: dict[uuid.UUID, int] | None = None
) -> TopicResponse:
    return TopicResponse(
        id=topic.id,
        project_id=topic.project_id,
        parent_id=topic.parent_id,
        name=topic.name,
        description=topic.description,
        origin=topic.origin,
        active_count=(active_counts or {}).get(topic.id, 0),
        created_at=topic.created_at,
        updated_at=topic.updated_at,
    )


def _quality_status(decision: dict, run_quality_gate: str | None) -> str:
    if decision:
        return "judged"
    if run_quality_gate in (QUALITY_GATE_OFF, QUALITY_GATE_UNAVAILABLE):
        return run_quality_gate
    return "not_judged"


def candidate_to_response(
    candidate: PromptCandidate, run_quality_gate: str | None
) -> PromptCandidateResponse:
    """``run_quality_gate`` is the candidate's run gate (None when unknown)."""
    decision = candidate.jev_decision or {}
    return PromptCandidateResponse.model_validate(candidate).model_copy(
        update={
            "quality_status": _quality_status(decision, run_quality_gate),
            "quality_flags": [str(flag) for flag in decision.get("flags") or []],
        }
    )
