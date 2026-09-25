"""Agent API request and response DTOs, built from persisted rows only."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.config.agent import (
    AGENT_INSTRUCTIONS_MAX_CHARS,
    AGENT_MESSAGE_MAX_CHARS,
    AGENT_OUTPUT_BODY_MAX_CHARS,
    AGENT_OUTPUT_TITLE_MAX_CHARS,
)
from app.domain.agent.context_refs import (
    SearchIntelligenceReference,
    SiteHealthReference,
)


class _Model(BaseModel):
    model_config = ConfigDict(extra="forbid")


def _nonblank(value: str) -> str:
    value = value.strip()
    if not value:
        raise ValueError("must not be blank")
    return value


class ChatContextRefs(_Model):
    """Typed evidence a chat can start from; resolved server-side every run."""

    target_url: str | None = Field(default=None, max_length=2048)
    target_site_url_id: uuid.UUID | None = None
    opportunity_id: uuid.UUID | None = None
    demand_signal_id: uuid.UUID | None = None
    site_health_reference: SiteHealthReference | None = None
    search_intelligence_reference: SearchIntelligenceReference | None = None


class ChatCreate(_Model):
    message: str = Field(max_length=AGENT_MESSAGE_MAX_CHARS)
    skill_id: str | None = Field(default=None, max_length=64)
    action_id: uuid.UUID | None = None
    context: ChatContextRefs = Field(default_factory=ChatContextRefs)

    _message = field_validator("message")(_nonblank)


class MessageCreate(_Model):
    message: str = Field(max_length=AGENT_MESSAGE_MAX_CHARS)
    skill_id: str | None = Field(default=None, max_length=64)

    _message = field_validator("message")(_nonblank)


class OutputEdit(_Model):
    base_revision_id: uuid.UUID
    title: str = Field(max_length=AGENT_OUTPUT_TITLE_MAX_CHARS)
    body: str = Field(max_length=AGENT_OUTPUT_BODY_MAX_CHARS)

    _title = field_validator("title")(_nonblank)
    _body = field_validator("body")(_nonblank)


class OutlineApproval(_Model):
    revision_id: uuid.UUID


class InstructionsUpdate(_Model):
    text: str = Field(max_length=AGENT_INSTRUCTIONS_MAX_CHARS)


class RunView(_Model):
    id: uuid.UUID
    status: str
    mode: str
    skill_id: str | None
    skill_source: str | None
    steps_used: int
    error_code: str
    error_detail: str
    created_at: datetime
    completed_at: datetime | None


class MessageView(_Model):
    id: uuid.UUID
    sequence: int
    role: str
    content: str
    skill_id: str | None
    skill_source: str | None
    evidence_refs: list[str]
    steps: list[dict[str, Any]]
    created_at: datetime


class RevisionView(_Model):
    id: uuid.UUID
    number: int
    parent_revision_id: uuid.UUID | None
    author: str
    phase: str
    title: str
    body: str
    source_refs: list[str]
    approved_at: datetime | None
    created_at: datetime


class OutputView(_Model):
    id: uuid.UUID
    action_id: uuid.UUID | None
    kind: str
    skill_id: str
    format_id: str | None
    target_kind: str | None
    target_label: str | None
    phase: str
    latest_revision: RevisionView | None


class ChatSummary(_Model):
    id: uuid.UUID
    project_id: uuid.UUID
    action_id: uuid.UUID | None
    # The attached Action's target, for a list row; None while unattached.
    target_label: str | None
    title: str
    turn_count: int
    output_kind: str | None
    output_phase: str | None
    last_activity_at: datetime
    created_at: datetime


class ChatsPage(_Model):
    items: list[ChatSummary]
    next_cursor: str | None = None


class ChatDetail(_Model):
    chat: ChatSummary
    pinned_skill_id: str | None
    context: dict[str, Any]
    messages: list[MessageView]
    latest_run: RunView | None
    output: OutputView | None


class TurnAccepted(_Model):
    chat_id: uuid.UUID
    run: RunView


class RevisionsPage(_Model):
    items: list[RevisionView]


class SkillView(_Model):
    id: str
    label: str
    group: str
    output_kind: str
    description: str


class SkillCatalog(_Model):
    skills: list[SkillView]


class InstructionsView(_Model):
    revision: int | None
    text: str
    created_at: datetime | None
