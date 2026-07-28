from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel

DashboardSectionId = Literal[
    "visibility",
    "answers",
    "traffic",
    "prompts",
    "commerce",
    "runs",
    "content",
    "site_health",
    "issues",
    "opportunities",
    "brand_knowledge",
    "projects",
]
DashboardSectionState = Literal["ready", "running", "empty", "not_setup", "failed"]


class DashboardSource(BaseModel):
    id: uuid.UUID
    kind: str
    timestamp: datetime


class DashboardSection(BaseModel):
    id: DashboardSectionId
    title: str
    href: str
    state: DashboardSectionState
    metrics: dict[str, Any]
    source: DashboardSource | None = None


class DashboardProject(BaseModel):
    id: uuid.UUID
    workspace_id: uuid.UUID
    name: str
    brand_name: str
    website_url: str


class DashboardResponse(BaseModel):
    project: DashboardProject
    generated_at: datetime
    executive_metrics: dict[str, Any]
    analyze: list[DashboardSection]
    improve: list[DashboardSection]
    active_work: list[str]
