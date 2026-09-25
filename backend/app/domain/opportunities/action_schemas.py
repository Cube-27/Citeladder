"""Action API response DTOs, built only from persisted Action projections."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, field_validator

from app.core.config.actions import ACTION_USER_STATUSES
from app.domain.opportunities.schemas import OpportunityItem


class _Model(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ActionItem(_Model):
    id: uuid.UUID
    project_id: uuid.UUID
    target_kind: str
    target_label: str
    target_url: str | None
    target_prompt_id: uuid.UUID | None
    origin: str
    status: str
    priority_score: float | None
    families: list[str]
    approach: str
    skill_id: str
    member_count: int
    evidence_cleared_at: datetime | None
    created_at: datetime
    updated_at: datetime


class ActionsPage(_Model):
    items: list[ActionItem]
    next_cursor: str | None = None
    # Listed Actions per effective status across the whole project, not the page.
    status_counts: dict[str, int]


class ActionStatusPatch(_Model):
    status: str

    @field_validator("status")
    @classmethod
    def _user_status(cls, value: str) -> str:
        if value not in ACTION_USER_STATUSES:
            raise ValueError(f"status must be one of {sorted(ACTION_USER_STATUSES)}")
        return value


class ActionDetail(ActionItem):
    diagnosis: dict[str, Any]
    members: list[OpportunityItem]
