"""Public `/commerce/*` request and persisted-projection schemas."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, model_validator

from app.core.config.commerce_catalog import (
    COMMERCE_GENERATION_TARGETS_MAX,
    COMMERCE_PROMPTS_DEFAULT,
    COMMERCE_PROMPTS_MAX,
    COMMERCE_PROMPTS_MIN,
)

TargetKind = Literal["category", "product"]


class CommerceTarget(BaseModel):
    kind: TargetKind
    id: uuid.UUID


class DiscoveryRequest(BaseModel):
    targets: list[CommerceTarget] = Field(min_length=1)


class DiscoveryResponse(BaseModel):
    task_ids: list[uuid.UUID] = Field(default_factory=list)


class BuyerPromptGenerateRequest(BaseModel):
    targets: list[CommerceTarget] = Field(
        min_length=1, max_length=COMMERCE_GENERATION_TARGETS_MAX
    )
    count: int = Field(
        default=COMMERCE_PROMPTS_DEFAULT,
        ge=COMMERCE_PROMPTS_MIN,
        le=COMMERCE_PROMPTS_MAX,
    )


class BuyerPromptManualRequest(BaseModel):
    target: CommerceTarget
    text: str = Field(min_length=1, max_length=2000)


class BuyerPromptResponse(BaseModel):
    id: uuid.UUID
    prompt_set_id: uuid.UUID
    target: CommerceTarget
    text: str
    enabled: bool
    approved_at: datetime | None


class RecommendationSpan(BaseModel):
    title: str = Field(min_length=1, max_length=512)
    brand: str = Field(default="", max_length=255)
    url: str = Field(default="", max_length=2048)
    price: float | None = Field(default=None, ge=0)
    currency: str = Field(default="", max_length=3)
    surface_kind: Literal["recommendation", "shopping_result"] = "recommendation"
    rank: int | None = Field(default=None, ge=1)
    order_observable: bool = False

    @model_validator(mode="after")
    def rank_requires_order(self) -> RecommendationSpan:
        if (self.rank is None) != (not self.order_observable):
            raise ValueError("rank is present exactly when order is observable")
        return self
