# Content-generation request/response DTOs (workspace-scoped, invariant 5).
#
# Wire contract for `/content/generations`. The list item is bounded (no
# ``output_text``); the detail is the full record. Neither ever carries the
# provider API key or a raw request body containing it (invariant 6) — the
# only provider fields exposed are provenance (requested/returned model,
# finish reason, usage, latency).
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator

from app.core.config.content import (
    CONTENT_DEFAULT_SKILL,
    CONTENT_FEEDBACK_REASONS,
    CONTENT_HISTORY_TITLE_MAX_LEN,
    CONTENT_INSTRUCTION_MAX_LEN,
    CONTENT_SKILL_CATALOG_VERSION,
    CONTENT_SKILL_REGISTRY,
    CONTENT_SKILLS,
)


class ContentSkillView(BaseModel):
    """File-backed skill metadata, as offered to the picker."""

    id: str
    label: str
    channel: str
    description: str


class ContentSkillCatalog(BaseModel):
    """The full skill catalog and the version that produced its directives."""

    version: str
    default_skill_id: str
    skills: list[ContentSkillView]


def skill_catalog() -> ContentSkillCatalog:
    """Project the config registry onto the wire, in registry (UI) order."""
    return ContentSkillCatalog(
        version=CONTENT_SKILL_CATALOG_VERSION,
        default_skill_id=CONTENT_DEFAULT_SKILL,
        skills=[
            ContentSkillView(
                id=definition.id,
                label=definition.label,
                channel=definition.channel,
                description=definition.description,
            )
            for definition in CONTENT_SKILL_REGISTRY.values()
        ],
    )


class SiteHealthReference(BaseModel):
    project_id: uuid.UUID
    crawl_id: uuid.UUID
    site_url_id: uuid.UUID
    source_analysis_id: uuid.UUID
    dimension: str = Field(min_length=1, max_length=32)
    checkpoint_ids: list[Annotated[str, StringConstraints(max_length=64)]] = Field(
        min_length=1, max_length=16
    )

    @field_validator("checkpoint_ids")
    @classmethod
    def normalize_checkpoint_ids(cls, value: list[str]) -> list[str]:
        return sorted(set(value))


class ContentGenerationCreate(BaseModel):
    """`POST /content/generations` body (workspace resolved from session)."""

    project_id: uuid.UUID
    user_instruction: str
    skill_id: str = CONTENT_DEFAULT_SKILL
    target_site_url_id: uuid.UUID | None = None
    target_url: str | None = Field(default=None, max_length=2048)
    opportunity_id: uuid.UUID | None = None
    demand_signal_id: uuid.UUID | None = None
    site_health_reference: SiteHealthReference | None = None

    @field_validator("user_instruction")
    @classmethod
    def _instruction_trimmed_bounded(cls, value: str) -> str:
        trimmed = value.strip()
        if not trimmed:
            raise ValueError("user_instruction must not be empty")
        if len(trimmed) > CONTENT_INSTRUCTION_MAX_LEN:
            raise ValueError(
                f"user_instruction exceeds {CONTENT_INSTRUCTION_MAX_LEN} characters"
            )
        return trimmed

    @field_validator("skill_id")
    @classmethod
    def _skill_known(cls, value: str) -> str:
        if value not in CONTENT_SKILLS:
            raise ValueError(f"unknown skill_id: {value}")
        return value


def instruction_preview(user_instruction: str) -> str:
    """Deterministic history label: first line, trimmed to the config cap."""
    trimmed = user_instruction.strip()
    first_line = trimmed.splitlines()[0] if trimmed else ""
    return first_line[:CONTENT_HISTORY_TITLE_MAX_LEN]


class ContentGenerationListItem(BaseModel):
    """Bounded history-list projection (never ``output_text``)."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    project_id: uuid.UUID
    status: str
    skill_id: str = CONTENT_DEFAULT_SKILL
    opportunity_id: uuid.UUID | None = None
    context_status: str
    requested_model: str
    returned_model: str | None = None
    provider: str | None = None
    created_at: datetime
    updated_at: datetime
    completed_at: datetime | None = None
    error_code: str = ""
    instruction_preview: str = ""


class ContentContextSummary(BaseModel):
    """Bounded public provenance: counts and URLs, never the rendered blocks."""

    version: str = ""
    crawl_page_count: int = 0
    crawl_urls: list[str] = []
    crawl_completed_at: str | None = None
    brand_memory: bool = False
    brand_fields: list[str] = []
    target_url: str | None = None
    issue_count: int = 0
    related_page_count: int = 0
    omissions: list[dict] = []


class ContentContextPreview(BaseModel):
    """Compact pre-flight summary; rendered evidence blocks never leave the server."""

    brand_memory: bool = False
    target_page: str | None = None
    issue_count: int = 0
    related_page_count: int = 0


class ContentTargetPage(BaseModel):
    site_url_id: uuid.UUID
    title: str
    url: str
    display_url: str
    page_kind: str


class ContentGenerationDetail(BaseModel):
    """Full projection of one generation (never the API key)."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    project_id: uuid.UUID
    status: str
    skill_id: str = CONTENT_DEFAULT_SKILL
    opportunity_id: uuid.UUID | None = None
    skill_version: int
    feedback: str | None = None
    feedback_reason: str = ""
    feedback_at: datetime | None = None
    context_status: str
    requested_model: str
    returned_model: str | None = None
    provider: str | None = None
    created_at: datetime
    updated_at: datetime
    completed_at: datetime | None = None
    error_code: str = ""
    instruction_preview: str = ""
    user_instruction: str
    context_summary: ContentContextSummary
    finish_reason: str | None = None
    output_truncated: bool = False
    output_text: str | None = None
    usage: dict | None = None
    latency_ms: int | None = None
    error_detail: str = ""
    generator_version: str = ""


class ContentFeedbackRequest(BaseModel):
    feedback: str = Field(pattern="^(accepted|rejected)$")
    #: Optional rejection category; ignored on an acceptance.
    reason: str = ""

    @field_validator("reason")
    @classmethod
    def _reason_known(cls, value: str) -> str:
        if value and value not in CONTENT_FEEDBACK_REASONS:
            raise ValueError(f"unknown feedback reason: {value}")
        return value
