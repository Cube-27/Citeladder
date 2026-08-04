"""Guidance response DTO provenance must preserve the UUID-only ID contract."""

from __future__ import annotations

import uuid

import pytest
from pydantic import ValidationError

from app.domain.opportunities.schemas import OpportunityGuidanceItem


def _payload() -> dict:
    source_id = str(uuid.uuid4())
    return {
        "id": str(uuid.uuid4()),
        "opportunity_id": str(uuid.uuid4()),
        "input_hash": "a" * 64,
        "findings": ["Persisted evidence found a gap."],
        "recommendations": ["Address the gap."],
        "source_analysis_ids": [source_id],
        "source_issue_ids": [source_id],
        "source_metric_ids": [source_id],
        "analyzer_version": "analyzer-v1",
        "rule_version": "rules-v1",
        "formula_version": "formula-v1",
        "generator_version": "guidance-v1",
        "prompt_version": "prompt-v1",
        "provider": "deterministic",
        "model": "none",
        "created_at": "2026-08-03T00:00:00Z",
    }


def test_guidance_provenance_ids_are_uuid_validated() -> None:
    item = OpportunityGuidanceItem.model_validate(_payload())
    assert isinstance(item.source_analysis_ids[0], uuid.UUID)

    invalid = _payload()
    invalid["source_issue_ids"] = ["not-a-uuid"]
    with pytest.raises(ValidationError):
        OpportunityGuidanceItem.model_validate(invalid)
