"""Typed contracts for persisted onboarding discovery."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.domain.projects.schemas import CompetitorInput


class BrandDiscoveryCreate(BaseModel):
    brand_name: str = Field(min_length=1, max_length=255)
    website_url: str = Field(min_length=1, max_length=1024)
    industry: str = Field(min_length=2, max_length=255)
    business_type: Literal["b2b", "b2c", "both"]
    products_services: list[str] = Field(default_factory=list, max_length=30)
    target_audience: str = Field(default="", max_length=2000)
    positioning: str = Field(default="", max_length=2000)
    price_tier: Literal["budget", "mid_market", "premium", "luxury", "unknown"] = (
        "unknown"
    )
    additional_context: str = Field(default="", max_length=5000)
    country_code: str = Field(default="", max_length=8)
    language_code: str = Field(default="en", max_length=16)


class DiscoveryEvidence(BaseModel):
    source_url: str
    capture_method: str
    confidence: float = Field(ge=0, le=1)
    captured_at: datetime
    supports: list[str] = Field(default_factory=list)


class DiscoveryProfile(BaseModel):
    description: str = ""
    positioning: str = ""
    products_services: list[str] = Field(default_factory=list)
    target_audience: str = ""
    industry: str = ""
    business_type: Literal["b2b", "b2c", "both"]
    price_tier: str = "unknown"


class BrandDiscoveryConfirm(BaseModel):
    profile: DiscoveryProfile
    domains: list[str] = Field(min_length=1)
    competitors: list[CompetitorInput] = Field(default_factory=list)
    topics: list[str] = Field(default_factory=list)


class BrandDiscoveryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    workspace_id: uuid.UUID
    project_id: uuid.UUID | None
    status: str
    stage: str
    input_data: dict
    profile: dict
    domains: list
    competitors: list
    topics: list
    evidence: list
    gaps: list
    error_detail: str
    attempt_count: int
    created_at: datetime
    updated_at: datetime


class BrandDiscoveryCatalogResponse(BaseModel):
    business_types: list[str]
    price_tiers: list[str]
    required_fields: list[str]
    optional_fields: list[str]
    capture_methods: list[str]


class BrandDiscoveryCreateProject(BaseModel):
    name: str | None = Field(default=None, max_length=255)


class BrandDiscoveryProjectResponse(BaseModel):
    discovery: BrandDiscoveryResponse
    project_id: uuid.UUID
