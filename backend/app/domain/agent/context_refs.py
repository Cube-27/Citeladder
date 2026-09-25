"""Typed evidence references an agent chat can attach as context."""

from __future__ import annotations

import uuid
from typing import Annotated

from pydantic import BaseModel, Field, StringConstraints, field_validator


class SiteHealthReference(BaseModel):
    project_id: uuid.UUID
    crawl_id: uuid.UUID
    site_url_id: uuid.UUID
    source_analysis_id: uuid.UUID
    dimension: str = Field(min_length=1, max_length=32)
    checkpoint_ids: list[Annotated[str, StringConstraints(max_length=64)]] = Field(
        min_length=1, max_length=16
    )

    @field_validator("checkpoint_ids")
    @classmethod
    def normalize_checkpoint_ids(cls, value: list[str]) -> list[str]:
        return sorted(set(value))


class SearchIntelligenceReference(BaseModel):
    dataset_id: uuid.UUID
    row_ids: list[uuid.UUID] = Field(min_length=1, max_length=100)

    @field_validator("row_ids")
    @classmethod
    def unique_rows(cls, value: list[uuid.UUID]) -> list[uuid.UUID]:
        if len(value) != len(set(value)):
            raise ValueError("Search Intelligence row IDs must be unique")
        return value
