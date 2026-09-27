"""Parity with the persisted Performance reader retained for the Agent."""

import uuid
from datetime import date
from typing import Any

from app.domain.traffic.performance import _window_payload
from app.models.traffic import TrafficSnapshot


def performance_windows() -> list[dict[str, Any]]:
    result = []
    for metrics in [
        None,
        {},
        {"totals": {"clicks": 0, "impressions": 0}},
        {
            "totals": {
                "clicks": 3.9,
                "impressions": 101,
                "ctr": 3 / 101,
                "position": None,
                "sessions": 0,
            },
            "series": {
                "clicks": [
                    {"date": "2026-01-01", "value": 3},
                    {"date": "2026-01-02", "value": None},
                ]
            },
        },
    ]:
        snapshot = (
            None
            if metrics is None
            else TrafficSnapshot(
                id=uuid.UUID(int=1),
                window_start=date(2026, 1, 1),
                window_end=date(2026, 1, 2),
                metrics=metrics,
            )
        )
        payload = (
            None
            if snapshot is None
            else {
                "id": str(snapshot.id),
                "start": "2026-01-01",
                "end": "2026-01-02",
                "metrics": metrics,
            }
        )
        result.append(
            {
                "input": {"snapshot": payload, "window": ["2026-01-01", "2026-01-02"]},
                "output": _window_payload(
                    snapshot, (date(2026, 1, 1), date(2026, 1, 2))
                ).model_dump(mode="json"),
            }
        )
    return result
