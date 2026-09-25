"""Action API response DTOs, built only from persisted Action projections."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import AwareDatetime, BaseModel, ConfigDict, field_validator

from app.core.config.actions import ACTION_USER_STATUSES
from app.domain.opportunities.schemas import OpportunityItem, VerificationEventView


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


class ActionDeclarationCreate(_Model):
    """A user's declaration. Targets and checks are server-owned (§9)."""

    output_revision_id: uuid.UUID | None = None
    declared_implemented_at: AwareDatetime


class MeasurementLegView(_Model):
    leg: Literal[
        "next_visibility_run",
        "next_search_console_window",
        "next_crawl",
        "placement_recheck",
    ]
    state: Literal["waiting", "not_scheduled", "sync_needed", "observed"]
    due_at: datetime | None
    last_evidence_at: datetime | None


class ActionDeclarationView(_Model):
    id: uuid.UUID
    action_id: uuid.UUID
    output_revision_id: uuid.UUID | None
    member_opportunity_ids: list[uuid.UUID]
    opportunity_snapshot_id: uuid.UUID
    target_site_url_ids: list[uuid.UUID]
    # Populated instead of ``target_site_url_ids`` for an earned Action: the
    # publisher page the placement was declared on. Never both.
    target_external_url: str | None
    declared_implemented_at: datetime
    expected_checks: list[dict[str, Any]]
    state: Literal["declared", "observed", "verified", "contradicted"]
    limitations: list[str]
    verification_events: list[VerificationEventView]
    legs: list[MeasurementLegView]
    created_at: datetime


class ActionDetail(ActionItem):
    diagnosis: dict[str, Any]
    members: list[OpportunityItem]
    declaration: ActionDeclarationView | None
