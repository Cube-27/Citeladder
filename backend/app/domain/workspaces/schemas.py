# Workspace request/response schemas (all ids string UUID).
from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models.workspace import ProductTourStatus


class WorkspaceCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)


class WorkspaceResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    role: str
    created_at: datetime
    updated_at: datetime


class ProductTourResponse(BaseModel):
    workspace_id: uuid.UUID
    version: str
    status: ProductTourStatus
    step_id: str | None
    started_at: datetime | None
    completed_at: datetime | None


class ProductTourUpdate(BaseModel):
    version: str = Field(min_length=1, max_length=32)
    status: ProductTourStatus
    step_id: str | None = Field(default=None, max_length=64)

    @model_validator(mode="after")
    def validate_step(self) -> ProductTourUpdate:
        if self.status == ProductTourStatus.IN_PROGRESS and not self.step_id:
            raise ValueError("step_id is required while a tour is in progress")
        if self.status in {ProductTourStatus.COMPLETED, ProductTourStatus.SKIPPED}:
            self.step_id = None
        return self
