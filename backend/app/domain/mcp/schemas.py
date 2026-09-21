"""Shared wire helpers for the bounded MCP evidence surface."""

from __future__ import annotations

import json
from datetime import date, datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class Pagination(BaseModel):
    """Completeness metadata that never guesses an exact total."""

    returned_count: int = 0
    has_more: bool = False
    next_cursor: str | None = None
    total_count: int | None = None


class EvidenceReference(BaseModel):
    kind: str
    id: str
    record_uri: str | None = None
    retrievable: bool = True
    reason: str | None = None


class RetrievalMetadata(BaseModel):
    model_config = ConfigDict(extra="allow")

    project_id: str
    record_type: str
    observed_at: datetime | date | None = None
    complete: bool = True
    record: dict[str, Any] = Field(default_factory=dict)


class RetrievalDocument(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: str
    title: str
    text: str
    url: str
    metadata: RetrievalMetadata


class SearchItem(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: str
    title: str
    url: str
    text: str = ""


class SearchEnvelope(BaseModel):
    model_config = ConfigDict(extra="allow")

    query: str
    results: list[SearchItem]
    count: int
    pagination: dict[str, Any]


class EvidenceResponse(BaseModel):
    """Typed common MCP object envelope with owner-specific fields preserved."""

    model_config = ConfigDict(extra="allow")

    state: str | None = None
    project_id: str | None = None
    items: list[dict[str, Any]] | None = None
    pagination: dict[str, Any] | None = None


def json_text(record: dict[str, Any]) -> str:
    """Serialize evidence deterministically without inventing narrative prose."""

    # ASCII escaping makes the configured character bound an exact UTF-8 byte
    # bound as well, so evidence parts never exceed the transport policy.
    return json.dumps(record, default=str, ensure_ascii=True, sort_keys=True)


def page(
    *,
    items: list[dict[str, Any]],
    next_cursor: str | None,
    total_count: int | None = None,
) -> dict[str, Any]:
    return Pagination(
        returned_count=len(items),
        has_more=next_cursor is not None,
        next_cursor=next_cursor,
        total_count=total_count,
    ).model_dump(mode="json")
