"""Prompt-set DTO bridge for Python project responses."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.core.config.prompts import (
    PROMPT_COHORTS,
    PROMPT_STATUSES,
)
from app.core.literals import lock_literal

# ``Literal`` requires inline literals for static checkers, so the values are
# repeated here; this guard keeps the alias in lock-step with the config
# constants (PROMPT_STATUS_*) so they cannot drift silently.
PromptStatus = Literal["active", "archived"]
PromptCohort = Literal["core", "brand_diagnostic", "comparison", "commerce"]
lock_literal(PromptStatus, PROMPT_STATUSES, name="PromptStatus")
# Keep the API literal and persisted cohort catalog in lock-step.
lock_literal(PromptCohort, PROMPT_COHORTS, name="PromptCohort")


# --------------------------------------------------------------------------
# Responses the Python project routes still publish
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
