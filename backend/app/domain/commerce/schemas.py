"""Public `/commerce/*` request and persisted-projection schemas."""

from __future__ import annotations

import uuid
from typing import Literal

from pydantic import BaseModel, Field

TargetKind = Literal["category", "product"]


class CommerceTarget(BaseModel):
    kind: TargetKind
    id: uuid.UUID


class DiscoveryRequest(BaseModel):
    targets: list[CommerceTarget] = Field(min_length=1)


class DiscoveryResponse(BaseModel):
    task_ids: list[uuid.UUID] = Field(default_factory=list)
