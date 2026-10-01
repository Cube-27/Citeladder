"""Search Intelligence public request and response contracts."""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.config.search_intelligence import (
    DEFAULT_DEPTHS,
    DEFAULT_RESEARCH_SCOPE,
    MAX_SAFE_DEPTH,
    ResearchScope,
)

DatasetKind = Literal[
    "footprint",
    "ranking_keywords",
    "missing_keywords",
    "shared_keywords",
    "keyword_suggestions",
    "backlink_summary",
    "referring_domains",
    "destination_pages",
    "organic_pages",
    "backlinks",
    "backlink_history",
]
RunAction = Literal[
    "analysis", "refresh", "seed", "backlink_details", "increase_depth", "recovery"
]


class SearchIntelligencePreferences(BaseModel):
    research_scope: ResearchScope = DEFAULT_RESEARCH_SCOPE
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


class TargetResponse(BaseModel):
    identity: str
    label: str
    registrable_domain: str
    hostname: str
    origin: str
    source_kind: str


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


class SearchDatasetResponse(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: uuid.UUID
    run_id: uuid.UUID
    dataset_kind: str
    target_domain: str
    target_hostname: str
    target_origin: str
    research_scope: ResearchScope
    acquisition: dict[str, Any]
    comparison_origin: str
    location_code: int | None
    language_code: str
    status: str
    coverage: str
    requested_rows: int
    raw_rows_received: int
    unique_rows_saved: int
    provider_total: int | None
    truncated: bool
    summary: dict[str, Any]
    collection_started_at: datetime | None
    collection_ended_at: datetime | None
    published_at: datetime | None
    filtered_saved_count: int | None = None


class ReadinessResponse(BaseModel):
    connected: bool
    connection_id: uuid.UUID | None
    owned_targets: list[TargetResponse]
    competitors: list[TargetResponse]
    preferences: SearchIntelligencePreferences
    latest_run: RunResponse | None
    datasets: list[SearchDatasetResponse]
