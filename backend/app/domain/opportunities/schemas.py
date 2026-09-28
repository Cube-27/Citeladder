# The Opportunity DTOs Python readers still share with the TypeScript owner.
#
# The Opportunity routes and their DTOs moved to the TypeScript service
# (TypeScript migration PR 7a). ``OpportunityItem`` remains for the command
# center's action list and the Agent's Action detail members until they move.
from __future__ import annotations

import uuid
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class _Model(BaseModel):
    # Reject unknown keys on the way IN (request bodies) as loudly as the
    # frontend rejects them on the way OUT.
    model_config = ConfigDict(extra="forbid")


# =========================================================================
# Requests
# =========================================================================


class OpportunityItem(_Model):
    """One live opportunity row as rendered by the priority-sorted catalog."""

    id: uuid.UUID
    project_id: uuid.UUID
    rule_id: str
    opportunity_type: str
    severity: str
    priority_score: float
    title: str
    target_key: str
    target_prompt_id: uuid.UUID | None
    target_url: str | None
    target_theme: str | None
    # Backend-owned target presentation (url / frozen prompt text / humanized
    # theme / frozen product name); null when nothing user-facing exists.
    target_label: str | None
    # The Action this row was grouped into; it owns the workflow status.
    action_id: uuid.UUID | None
    system_rank: int = 0
    display_rank: int = 0
    order_source: Literal["system", "manual"] = "system"
    priority_factors: dict[str, str | float] = Field(default_factory=dict)
    evidence_summary: dict[str, int | list[str]] = Field(default_factory=dict)
    created_at: str
    updated_at: str
