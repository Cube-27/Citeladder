"""Pure-function regression tests for visibility projection helpers.

Covers a review-hardening fix in the focused analysis projection owners:
  * ``_normalize_events`` skips malformed entries (no recognized event keys)
    so the evidence endpoint never surfaces phantom all-zero events.
"""

from __future__ import annotations

import base64
import json
import uuid
from copy import deepcopy
from datetime import UTC, datetime

import pytest
from sqlalchemy import select

from app.analysis.comparison import frozen_comparison_key
from app.domain.analysis.errors import TrendQueryError
from app.domain.analysis.evidence import _normalize_events
from app.domain.analysis.evidence_selection import apply_cursor, encode_cursor
from app.models.analysis import ResponseAnalysis


def test_normalize_events_skips_malformed_entries() -> None:
    raw = [
        {"sequence": 0, "query": "shoes"},  # valid
        {},  # phantom — no recognized keys
        {"foo": "bar"},  # phantom — unrecognized key only
        "not-a-dict",  # ignored
        {"call_id": "c1"},  # valid (recognized key present)
    ]
    events = _normalize_events(raw)
    assert len(events) == 2
    assert events[0].query == "shoes"
    assert events[1].call_id == "c1"


def test_normalize_events_preserves_empty_query() -> None:
    # A count-only event legitimately carries an empty query string.
    events = _normalize_events([{"sequence": 0, "query": ""}])
    assert len(events) == 1
    assert events[0].query == ""


def test_normalize_events_non_list_is_empty() -> None:
    assert _normalize_events(None) == []
    assert _normalize_events({"query": "x"}) == []


def test_frozen_identity_requires_known_inputs_and_preserves_boundaries() -> None:
    configuration = {
        "brand_name": "Acme",
        "brand_aliases": [],
        "owned_domains": ["acme.com"],
        "competitors": [{"name": "Rival"}],
        "country_code": "US",
        "language_code": "en",
        "benchmark_mode": "consumer_like",
        "panel_hash": "panel-a",
        "engine_routes": {
            "gemini": {"transport_provider": "google", "transport_model": "model-a"}
        },
        "measurement_policy": {
            "retrieval_enabled": True,
            "max_output_tokens": 1000,
            "answer_instruction": "Answer",
        },
    }
    key = frozen_comparison_key(configuration)
    assert key is not None
    assert frozen_comparison_key({}) is None
    for field, value in [
        ("panel_hash", "panel-b"),
        ("competitors", []),
        ("language_code", "fr"),
    ]:
        changed = {**configuration, field: value}
        assert frozen_comparison_key(changed) != key
    changed = deepcopy(configuration)
    changed["engine_routes"]["gemini"]["transport_model"] = "model-b"
    assert frozen_comparison_key(changed) != key
    operational = deepcopy(configuration)
    operational["measurement_policy"]["timeout_seconds"] = 90
    assert frozen_comparison_key(operational) == key


@pytest.mark.parametrize(
    "cursor",
    [
        "!",
        "a",
        "e30=",
        base64.urlsafe_b64encode(json.dumps([1, [], "scope"]).encode()).decode(),
    ],
)
def test_invalid_evidence_cursor_is_a_query_error(cursor) -> None:
    with pytest.raises(TrendQueryError):
        apply_cursor(select(ResponseAnalysis), cursor, "scope")


def test_cursor_is_bound_to_selection_and_accepts_round_trip() -> None:
    cursor = encode_cursor(datetime.now(UTC), uuid.uuid4(), "scope")
    assert apply_cursor(select(ResponseAnalysis), cursor, "scope") is not None
    with pytest.raises(TrendQueryError):
        apply_cursor(select(ResponseAnalysis), cursor, "another-scope")
