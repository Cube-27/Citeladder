"""Strict DTOs for queue-ready Commerce discovery and comparisons."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator

from app.core.config.commerce import commerce_intelligence_settings


class CommerceCandidateInput(BaseModel):
    candidate_kind: Literal["own", "competitor"] = "own"
    competitor_id: uuid.UUID | None = None
    name: str = Field(min_length=1, max_length=255)
    sku: str = Field(default="", max_length=128)
    aliases: list[str] = Field(default_factory=list, max_length=50)
    variants: list[dict[str, Any]] = Field(default_factory=list, max_length=50)
    price: float | None = Field(default=None, ge=0)
    currency: str = Field(default="", max_length=3)
    url: str = Field(default="", max_length=2048)
    attributes: dict[str, Any] = Field(default_factory=dict, max_length=100)
    availability: str = Field(default="", max_length=64)
    extraction_confidence: float = Field(default=1.0, ge=0, le=1)

    @field_validator("aliases", mode="before")
    @classmethod
    def _aliases(cls, value: Any) -> list[str]:
        if not isinstance(value, list):
            raise ValueError("must be a list of strings")
        return [str(item).strip() for item in value if str(item).strip()]

    @field_validator("currency", mode="before")
    @classmethod
    def _currency(cls, value: Any) -> str:
        return value.strip().upper() if isinstance(value, str) else value


class CommerceDiscoveryPreviewRequest(BaseModel):
    rows: list[CommerceCandidateInput] | None = Field(default=None)
    csv_text: str | None = None


class CommercePreviewRowError(BaseModel):
    row: int = Field(ge=1)
    field: str
    message: str


class CommerceDiscoveryPreviewResponse(BaseModel):
    accepted: list[CommerceCandidateInput] = Field(default_factory=list)
    duplicates: list[int] = Field(default_factory=list)
    errors: list[CommercePreviewRowError] = Field(default_factory=list)
    truncated: bool = False


class CommerceDiscoveryCreateRequest(BaseModel):
    input_kind: Literal["upload", "url"]
    rows: list[CommerceCandidateInput] = Field(default_factory=list)
    source_urls: list[str] = Field(default_factory=list)

    @field_validator("rows", "source_urls")
    @classmethod
    def _bounded(cls, value: list[Any]) -> list[Any]:
        if len(value) > commerce_intelligence_settings.discovery_max_candidates_per_run:
            raise ValueError("too many discovery entries")
        return value


class CommerceMatchDecision(BaseModel):
    target_id: uuid.UUID | None
    target_kind: Literal["product", "competitor_product"]
    confidence: float
    reasons: list[str] = Field(default_factory=list)
    review_required: bool


class CommerceCandidateResponse(BaseModel):
    id: uuid.UUID
    run_id: uuid.UUID
    task_id: uuid.UUID
    artifact_id: uuid.UUID
    candidate_kind: str
    competitor_id: uuid.UUID | None
    identity: dict[str, Any]
    extraction_confidence: float
    created_at: datetime
    matches: list[CommerceMatchDecision] = Field(default_factory=list)


class CommerceDiscoveryRunResponse(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    input_kind: str
    status: str
    configuration: dict[str, Any]
    discovery_version: str
    created_at: datetime
    completed_at: datetime | None
    candidates: list[CommerceCandidateResponse] = Field(default_factory=list)


class CommerceCandidateAcceptRequest(BaseModel):
    status: Literal["accepted", "rejected"]
    target_id: uuid.UUID | None = None
    competitor_id: uuid.UUID | None = None
    review_note: str = Field(default="", max_length=2000)


class CommerceCandidateAcceptResponse(BaseModel):
    review_id: uuid.UUID
    candidate_id: uuid.UUID
    status: str
    product_id: uuid.UUID | None
    competitor_product_id: uuid.UUID | None
    match_reason: str
    match_confidence: float


class CompetitorComparisonRequest(BaseModel):
    competitor_id: uuid.UUID | None = None


class CompetitorComparisonSnapshotResponse(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    competitor_id: uuid.UUID | None
    source_catalog_ids: dict[str, list[str]]
    source_artifact_ids: list[str]
    matcher_version: str
    comparison_version: str
    comparison: dict[str, Any]
    truncated: bool
    created_at: datetime
