# Prompt-set / prompt / topic ORM -> response DTO mappers.
#
# Kept separate from the service so both the prompts router and the projects
# router (which embeds prompt sets in the project response) share one mapping.
from __future__ import annotations

import uuid

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


def topic_to_response(
    topic: Topic, counts: dict[uuid.UUID, dict[str, int]] | None = None
) -> TopicResponse:
    bucket = (counts or {}).get(topic.id, {})
    return TopicResponse(
        id=topic.id,
        project_id=topic.project_id,
        parent_id=topic.parent_id,
        name=topic.name,
        description=topic.description,
        origin=topic.origin,
        active_count=bucket.get(PROMPT_STATUS_ACTIVE, 0),
        proposed_count=0,
        created_at=topic.created_at,
        updated_at=topic.updated_at,
    )


def candidate_to_response(candidate: PromptCandidate) -> PromptCandidateResponse:
    decision = candidate.jev_decision or {}
    return PromptCandidateResponse.model_validate(candidate).model_copy(
        update={
            "quality_judged": bool(decision),
            "quality_flags": [str(flag) for flag in decision.get("flags") or []],
        }
    )
