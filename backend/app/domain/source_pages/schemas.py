"""Response DTOs for the cited-page inspection views.

Mirrors the checked-in frontend zod schema field-for-field. Built from
persisted rows only; nothing here fetches, scores or fabricates.

``state`` deliberately carries page-level outcomes (``not_inspected``,
``blocked``, ``stale``) alongside the presence verdicts. A caller that received
only the verdicts would have to re-derive whether they were current, and the
first caller to skip that step would report an unread page as an absence.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict


class _Model(BaseModel):
    model_config = ConfigDict(extra="forbid")


class SourcePageEntityView(_Model):
    entity_kind: Literal["brand", "competitor"]
    entity_name: str
    state: str
    match_method: str
    match_count: int
    # The quoted windows that justify a positive finding. Empty for an
    # absence, which no passage can demonstrate.
    passages: list[str]
    limitations: list[str]


class SourcePageDetail(_Model):
    id: uuid.UUID
    canonical_url: str
    registrable_domain: str
    source_class: str | None
    page_format: str
    page_format_method: str | None
    inspection_state: str
    inspection_reason: str | None
    last_inspected_at: datetime | None
    last_cited_at: datetime | None
    # Project-wide scheduling value, never a filtered citation count.
    recurrence_count: int
    title: str
    extracted_chars: int
    entities: list[SourcePageEntityView]
    limitations: list[str]


class SourcePageInspectionRequested(_Model):
    """Whether an explicit inspection was admitted, and why not when it was not."""

    accepted: bool
    reason: str | None
    budget_remaining: int
