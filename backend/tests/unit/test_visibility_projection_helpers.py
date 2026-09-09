"""Pure-function regression tests for visibility projection helpers.

Covers two review-hardening fixes in the focused analysis projection owners:
  * ``_normalize_events`` skips malformed entries (no recognized event keys)
    so the evidence endpoint never surfaces phantom all-zero events.
  * ``_mention_sov_of`` aggregates brand share across every brand key present
    in a bucket, so a brand rename across snapshots does not undercount SOV.
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
from app.domain.analysis.measurement import measurement_counts, observed_rate
from app.domain.analysis.trend_folding import _mention_sov_of
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


def test_mention_sov_aggregates_across_renamed_brand_keys() -> None:
    # Two brand keys ("Acme", "Acme Corp") summed into one bucket.
    counts = {"Acme": 3, "Acme Corp": 2, "Rival": 5}
    sov = _mention_sov_of(counts, {"Acme", "Acme Corp"})
    # (3 + 2) / (3 + 2 + 5) = 0.5 — not 3/10 or 2/10 from a single name.
    assert sov == pytest.approx(0.5)


def test_mention_sov_single_name() -> None:
    assert _mention_sov_of({"Acme": 1, "Rival": 3}, {"Acme"}) == pytest.approx(0.25)


def test_mention_sov_zero_total_is_none() -> None:
    assert _mention_sov_of({"Acme": 0, "Rival": 0}, {"Acme"}) is None


def test_presence_counts_distinguish_empty_zero_and_historical_citations() -> None:
    assert (
        observed_rate(
            {"total_completed": 0, "brand_mention_rate": 0}, "brand_mention_rate"
        )
        is None
    )
    metrics = {
        "total_completed": 3,
        "brand_mention_count": 0,
        "coverage": {"requested": 5, "failed": 1, "not_run": 1},
    }
    assert observed_rate(metrics, "brand_mention_rate") == 0
    counts = measurement_counts(metrics)
    assert (counts.responses, counts.expected, counts.failed, counts.not_run) == (
        3,
        5,
        1,
        1,
    )
    assert counts.owned_citation_responses is None
    assert observed_rate(metrics, "owned_citation_rate") is None


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
