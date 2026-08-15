from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

from app.workers.site_health.acquisition import plan_from_observations


def _row(
    *,
    rung: int,
    status: int,
    at: datetime,
    task_id: uuid.UUID | None = None,
    outcome: str = "success",
):
    return SimpleNamespace(
        acquisition_rung=rung,
        status_code=status,
        created_at=at,
        task_id=task_id or uuid.uuid4(),
        outcome=outcome,
    )


def test_two_blocks_prefer_rung_two_then_probe_after_twenty_acquisitions():
    now = datetime.now(UTC)
    blocks = [
        _row(rung=1, status=403, at=now),
        _row(rung=1, status=429, at=now - timedelta(seconds=1)),
    ]
    preferred = plan_from_observations(blocks)
    assert (preferred.preferred_rung, preferred.trigger) == (
        2,
        "host_block_preference",
    )

    interval = [
        _row(rung=2, status=200, at=now + timedelta(seconds=index + 1))
        for index in range(20)
    ]
    probe = plan_from_observations([*reversed(interval), *blocks])
    assert (probe.preferred_rung, probe.trigger) == (1, "host_recovery_probe")


def test_successful_probe_immediately_restores_rung_one():
    now = datetime.now(UTC)
    rows = [
        _row(rung=1, status=200, at=now),
        _row(rung=1, status=403, at=now - timedelta(seconds=1)),
        _row(rung=1, status=403, at=now - timedelta(seconds=2)),
    ]
    plan = plan_from_observations(rows)
    assert (plan.preferred_rung, plan.trigger) == (1, "initial")


def test_failed_rung_two_attempts_do_not_advance_the_probe_window():
    now = datetime.now(UTC)
    blocks = [
        _row(rung=1, status=403, at=now),
        _row(rung=1, status=429, at=now - timedelta(seconds=1)),
    ]
    failures = [
        _row(
            rung=2,
            status=500,
            outcome="error",
            at=now + timedelta(seconds=index + 1),
        )
        for index in range(20)
    ]

    plan = plan_from_observations([*reversed(failures), *blocks])

    assert (plan.preferred_rung, plan.trigger) == (
        2,
        "host_block_preference",
    )
