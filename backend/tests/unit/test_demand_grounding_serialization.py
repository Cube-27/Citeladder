"""What prompt generation actually shows the model about observed demand.

The serializer carried type/topic/page/priority/limitations and nothing else,
so the generator had to invent wording from a topic-cluster label while the
observed QUERY sat unread in ``signal.evidence``. These cases pin what travels
and — just as importantly — what is not fabricated when it was never observed.
"""

from __future__ import annotations

import uuid
from datetime import date

from app.domain.prompts.demand_grounding import serialize_demand_signal
from app.models.demand import DemandSignal, DemandSnapshot


def _signal(**overrides) -> DemandSignal:
    defaults = {
        "id": uuid.uuid4(),
        "signal_type": "striking_distance",
        "topic_cluster": "crm software",
        "page_url": "https://acme.example/crm",
        "priority_score": 73.2,
        "limitations": ["sampled"],
        "evidence": {},
        "metrics": {},
    }
    return DemandSignal(**{**defaults, **overrides})


def _snapshot() -> DemandSnapshot:
    return DemandSnapshot(
        window_start=date(2026, 8, 1),
        window_end=date(2026, 8, 28),
    )


def test_an_observed_query_reaches_the_model() -> None:
    row = serialize_demand_signal(
        _signal(
            evidence={"target_kind": "query", "target": "best crm for small teams"},
            metrics={"impressions": 41200, "clicks": 180, "position": 11.4},
        ),
        snapshot=_snapshot(),
    )
    assert row["observed_query"] == "best crm for small teams"
    assert row["observed_metrics"]["impressions"] == 41200
    assert row["observed_period"] == {"start": "2026-08-01", "end": "2026-08-28"}
    # The original fields are unchanged.
    assert row["type"] == "striking_distance"
    assert row["topic"] == "crm software"
    assert row["priority"] == 73.2
    assert row["limitations"] == ["sampled"]


def test_a_page_target_is_never_presented_as_a_search() -> None:
    """``target`` is only a query when ``target_kind`` says so."""
    row = serialize_demand_signal(
        _signal(
            evidence={
                "target_kind": "page",
                "target": "https://acme.example/pricing",
            }
        ),
        snapshot=_snapshot(),
    )
    assert "observed_query" not in row


def test_absent_observations_are_omitted_not_zeroed() -> None:
    """No metrics and no window are silence, not measurements of nothing."""
    row = serialize_demand_signal(_signal(), snapshot=None)
    assert "observed_metrics" not in row
    assert "observed_period" not in row
    assert "observed_query" not in row
