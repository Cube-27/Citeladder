"""Action API response DTOs, built only from persisted Action projections."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict

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


class ActionDetail(ActionItem):
    diagnosis: dict[str, Any]
    members: list[OpportunityItem]
