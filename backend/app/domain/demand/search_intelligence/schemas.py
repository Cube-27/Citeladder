"""Search Intelligence public request and response contracts."""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.core.config.search_intelligence import DEFAULT_DEPTHS, MAX_SAFE_DEPTH

DatasetKind = Literal[
    "footprint",
    "ranking_keywords",
    "missing_keywords",
    "shared_keywords",
    "keyword_suggestions",
    "backlink_summary",
    "referring_domains",
    "destination_pages",
]
RunAction = Literal[
    "analysis", "refresh", "seed", "backlink_details", "increase_depth", "recovery"
]


class SearchIntelligencePreferences(BaseModel):
    owned_target_id: str | None = None
    competitor_ids: list[uuid.UUID] = Field(default_factory=list)
    location_code: int | None = Field(default=None, gt=0)
    language_code: str = Field(default="", max_length=16)
    reuse_recent: bool = True
    depths: dict[str, int] = Field(default_factory=lambda: dict(DEFAULT_DEPTHS))

    @field_validator("depths")
    @classmethod
    def validate_depths(cls, value: dict[str, int]) -> dict[str, int]:
        for kind, depth in value.items():
            if kind not in DEFAULT_DEPTHS:
                raise ValueError(f"unsupported depth key: {kind}")
            if isinstance(depth, bool) or not 1 <= depth <= MAX_SAFE_DEPTH:
                raise ValueError(f"depth must be between 1 and {MAX_SAFE_DEPTH}")
        return value


class DatasetSelection(BaseModel):
    kind: DatasetKind
    competitor_id: uuid.UUID | None = None
    depth: int = Field(default=1, ge=1, le=MAX_SAFE_DEPTH)
    seed: str = Field(default="", max_length=700)

    @model_validator(mode="after")
    def validate_shape(self) -> DatasetSelection:
        comparison = self.kind in {"missing_keywords", "shared_keywords"}
        competitor_allowed = comparison or self.kind in {
            "footprint",
            "backlink_summary",
            "referring_domains",
            "destination_pages",
        }
        if comparison and self.competitor_id is None:
            raise ValueError("comparison datasets require one competitor")
        if self.competitor_id is not None and not competitor_allowed:
            raise ValueError("this dataset does not support a competitor target")
        if self.kind == "keyword_suggestions" and not self.seed.strip():
            raise ValueError("keyword suggestions require one seed")
        if self.kind != "keyword_suggestions" and self.seed:
            raise ValueError("seed is valid only for keyword suggestions")
        return self


class ReviewCreate(BaseModel):
    action: RunAction = "analysis"
    owned_target_id: str | None = None
    connection_id: uuid.UUID | None = None
    location_code: int | None = Field(default=None, gt=0)
    language_code: str = Field(default="", max_length=16)
    reuse_recent: bool = True
    save_as_defaults: bool = False
    datasets: list[DatasetSelection] = Field(min_length=1)
    previous_run_id: uuid.UUID | None = None


class TargetResponse(BaseModel):
    identity: str
    label: str
    registrable_domain: str
    hostname: str
    origin: str
    source_kind: str


class QuoteLineResponse(BaseModel):
    dataset_kind: str
    target: str
    requested_rows: int
    calls: int
    estimated_usd: str
    reused_dataset_id: uuid.UUID | None = None
    reused_collected_at: datetime | None = None


class RunResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    status: str
    action: str
    pricing_version: str
    estimated_cost_usd: Decimal
    provider_reported_cost_usd: Decimal | None
    planned_calls: int
    completed_calls: int
    planned_rows: int
    received_rows: int
    uncertain_calls: int
    error_code: str
    error_detail: str
    expires_at: datetime
    confirmed_at: datetime | None
    cancelled_at: datetime | None
    completed_at: datetime | None
    frozen_scope: dict
    call_plan: list
    reused_datasets: list
    created_at: datetime


class ReadinessResponse(BaseModel):
    connected: bool
    connection_id: uuid.UUID | None
    owned_targets: list[TargetResponse]
    competitors: list[TargetResponse]
    preferences: SearchIntelligencePreferences
    latest_run: RunResponse | None
    datasets: list[dict]


class DatasetPageResponse(BaseModel):
    dataset: dict
    rows: list[dict]
    next_cursor: str | None


class CitationMatchRequest(BaseModel):
    backlink_dataset_id: uuid.UUID
    audit_ids: list[uuid.UUID] = Field(min_length=1, max_length=50)


class ContentHandoffRequest(BaseModel):
    dataset_id: uuid.UUID
    row_ids: list[uuid.UUID] = Field(min_length=1, max_length=100)
    user_instructions: str = Field(min_length=1, max_length=4000)


class ContentHandoffResponse(BaseModel):
    project_id: uuid.UUID
    evidence: list[dict]
    user_instructions: str = ""
