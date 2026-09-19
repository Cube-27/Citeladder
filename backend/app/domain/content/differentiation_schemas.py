from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict


class ContentDifferentiationReportView(BaseModel):
    model_config = ConfigDict(extra="forbid", from_attributes=True)

    id: uuid.UUID
    project_id: uuid.UUID
    audit_id: uuid.UUID
    audit_task_id: uuid.UUID
    owned_site_url_id: uuid.UUID | None
    formula_version: str
    report: dict[str, Any]
    created_at: datetime
