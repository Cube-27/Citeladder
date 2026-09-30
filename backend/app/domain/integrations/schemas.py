"""Read-only integration projections retained for the Python Agent bridge."""

from __future__ import annotations

import uuid
from datetime import date

from pydantic import BaseModel


class ProjectReadinessResponse(BaseModel):
    """Persisted facts describing a project's post-connect readiness."""

    project_id: uuid.UUID
    stage: str
    connection_count: int
    providers: list[str]
    backfill_state: str | None
    imported_through: date | None
    has_performance_snapshot: bool
    has_demand_snapshot: bool
    opportunity_count: int
