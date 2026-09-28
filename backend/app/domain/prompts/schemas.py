# Prompt schemas the Python owners still publish: the project response's
# embedded prompt sets and the generation request/response. The TypeScript API
# owns the prompt-library routes and their contracts.
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.core.config.prompts import (
    PROMPT_COHORTS,
    PROMPT_STATUSES,
    prompt_generation_settings,
)
from app.core.literals import lock_literal

PromptIntent = Literal["", "discovery", "comparison", "purchase", "service", "local"]
# ``Literal`` requires inline literals for static checkers, so the values are
# repeated here; this guard keeps the alias in lock-step with the config
# constants (PROMPT_STATUS_*) so they cannot drift silently.
PromptStatus = Literal["active", "archived"]
PromptCohort = Literal["core", "brand_diagnostic", "comparison", "commerce"]
lock_literal(PromptStatus, PROMPT_STATUSES, name="PromptStatus")
# Keep the API literal and persisted cohort catalog in lock-step.
lock_literal(PromptCohort, PROMPT_COHORTS, name="PromptCohort")


# --------------------------------------------------------------------------
# Responses the Python project and generation routes still publish
# --------------------------------------------------------------------------
class PromptResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    prompt_set_id: uuid.UUID
    topic_id: uuid.UUID | None = None
    text: str
    theme: str
    intent: str
    # Empty for manual and imported prompts, which never went through the
    # buyer-query slot planner.
    buyer_stage: str = ""
    prompt_intent: str = ""
    cohort: PromptCohort
    branded: bool
    enabled: bool
    status: str
    origin: str
    generation_evidence: dict | None = None
    created_at: datetime
    updated_at: datetime


# --------------------------------------------------------------------------
# Prompt sets
# --------------------------------------------------------------------------
class PromptSetResponse(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    name: str
    description: str = ""
    prompts: list[PromptResponse] = Field(default_factory=list)
    prompt_count: int = 0
    created_at: datetime
    updated_at: datetime


class TopicResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    project_id: uuid.UUID
    parent_id: uuid.UUID | None = None
    name: str
    description: str
    origin: str
    # Active prompts under the topic, for the topics rail (projection).
    active_count: int = 0
    created_at: datetime
    updated_at: datetime


# --------------------------------------------------------------------------
# AI generation + bulk review
# --------------------------------------------------------------------------
class PromptGenerateRequest(BaseModel):
    """Body for ``POST /prompt-sets/{id}/generate``.

    Prompt generation is an automatic bounded derivation. ``topic_ids`` scopes
    generation to existing topics (``topic_id`` is the single-topic form and
    is merged with it); none selected means every topic. Running or scheduling
    measurement remains the separate user decision.
    """

    count: int = Field(
        default_factory=lambda: prompt_generation_settings.default_count, ge=1
    )
    topic_ids: list[uuid.UUID] = Field(default_factory=list)
    topic_id: uuid.UUID | None = None
    agent_revision_id: uuid.UUID | None = None
    intents: list[PromptIntent] = Field(default_factory=list)
    cohort: PromptCohort = "core"


class PromptCandidateResponse(BaseModel):
    """A generated prompt awaiting accept/reject; never tracked until accepted."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    run_id: uuid.UUID
    prompt_set_id: uuid.UUID
    topic_id: uuid.UUID | None = None
    text: str
    intent: str = ""
    buyer_stage: str = ""
    prompt_intent: str = ""
    cohort: str
    created_at: datetime
    expires_at: datetime
    # Quality judge (JEV): ``judged``; ``off`` (no judge configured for its
    # run); ``unavailable`` (the judge failed or timed out for its run);
    # ``not_judged`` (past the call cap, or a run from before the judge).
    # Flags name the questions it looked weak on; a listed row was never
    # failed by the gate, so flags inform review and never drop it.
    quality_status: Literal["judged", "off", "unavailable", "not_judged"] = "not_judged"
    quality_flags: list[str] = Field(default_factory=list)


class PromptGenerateResponse(BaseModel):
    candidates: list[PromptCandidateResponse] = Field(default_factory=list)
    topics: list[TopicResponse] = Field(default_factory=list)
    # What the caller asked for. A request can exceed what the selected topics
    # can support, and returning fewer prompts with no
    # explanation is how a silent cap went unnoticed for a release.
    requested_count: int = 0
    # Suggestions dropped as duplicates: intra-response collapses plus texts
    # already tracked in the set or already pending review.
    dropped_duplicates: int = 0
    # Suggestions that passed deterministic admission before the diversified
    # selection kept at most ``requested_count``. Generation overgenerates;
    # this is never a market size.
    candidates_generated: int = 0
    # off (no JEV key) | shadow (decisions recorded) | gate (strong fails
    # removed before review) | unavailable (JEV failed for at least one
    # candidate, which stays reviewable; generation still succeeded).
    quality_gate: str = "off"
    # Candidates the hard quality gate removed before review.
    quality_rejected: int = 0
