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
    # ``from_attributes`` so the wire model reads the domain view directly.
    # The two declare the same fields; a hand-written mapper between them buys
    # no isolation, because a rename on either side is a runtime error anyway.
    model_config = ConfigDict(extra="forbid", from_attributes=True)


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


class SourcePageCompetitorPage(_Model):
    """One page where rivals appear and the brand does not."""

    url_hash: str
    canonical_url: str
    registrable_domain: str
    source_class: str
    page_format: str
    page_format_method: str | None
    title: str
    inspection_state: str
    inspection_reason: str | None
    last_inspected_at: datetime | None
    extracted_chars: int
    # Distinct analyzed answers in this project that cited this page. Never
    # ``recurrence_count``, which schedules inspections and measures nothing.
    answers_citing: int
    brand_state: str
    brand_match_method: str | None
    # Found ON the page, each carrying the quoted line that proves it. A name
    # that only appeared in an answer is a different fact and is not here.
    competitors: list[SourcePageEntityView]
    opportunity_id: uuid.UUID | None
    opportunity_rule_id: str | None
    opportunity_status: str | None
    opportunity_title: str | None
    limitations: list[str]


class SourceClassGroupView(_Model):
    """One kind of source: editorial, review marketplace, community, social."""

    source_class: str
    pages_total: int
    pages_inspected: int
    # Counted, never folded into the gap list. A page nobody read is not a
    # page the brand is missing from.
    pages_not_inspected: int
    pages_blocked: int
    gap_pages: int
    pages: list[SourcePageCompetitorPage]
    truncated: bool


class CompetitorAnalysis(_Model):
    """Where competitors are cited and the brand is not, by kind of source."""

    pages_total: int
    pages_inspected: int
    pages_not_inspected: int
    gap_pages: int
    groups: list[SourceClassGroupView]
    limitations: list[str]
    truncated: bool
