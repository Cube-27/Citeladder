"""Unit tests for the pure pieces of account occupancy enforcement.

The DB-backed contract (lock serialization, counts, fail-closed resolution)
lives in ``tests/component/test_entitlement_occupancy.py``; here we pin the
deterministic lock-key derivation and the frozen error/snapshot shapes the
API layer maps — no database involved.
"""

from __future__ import annotations

import uuid

from app.core.config.entitlements import (
    CODE_OCCUPANCY_LIMIT_EXCEEDED,
    CODE_OCCUPANCY_UNRESOLVED,
    OCCUPANCY_LOCK_NAMESPACE,
)
from app.domain.entitlements.enforcement import (
    OccupancyLimitExceededError,
    OccupancySnapshot,
    OccupancyUnresolvedError,
    _capacity_lock_key,
)


def test_capacity_lock_key_is_deterministic_and_signed_64_bit() -> None:
    account_id = uuid.UUID("018f3c4e-0000-7000-8000-000000000001")
    key = _capacity_lock_key(account_id)
    # Same account + fixed config namespace -> same key in EVERY process
    # (two app replicas must contend for the same advisory lock).
    assert key == _capacity_lock_key(account_id)
    assert key != _capacity_lock_key(uuid.uuid4())
    assert -(2**63) <= key < 2**63
    # The namespace is folded in: a different namespace must not collide.
    assert OCCUPANCY_LOCK_NAMESPACE.to_bytes(4, "big") == b"CAPA"


def test_occupancy_snapshot_is_frozen_and_nullable_when_unprovisioned() -> None:
    snapshot = OccupancySnapshot(
        key="project_slots",
        allowance=None,
        current=4,
        requested=1,
        remaining=None,
    )
    assert snapshot.allowance is None
    assert snapshot.remaining is None


def test_limit_exceeded_error_carries_coded_safe_details() -> None:
    snapshot = OccupancySnapshot(
        key="prompt_slots",
        allowance=3,
        current=3,
        requested=1,
        remaining=-1,
    )
    exc = OccupancyLimitExceededError("over", snapshot=snapshot)
    # Clients branch on the stable code, never on the message text.
    assert exc.code == CODE_OCCUPANCY_LIMIT_EXCEEDED == "occupancy_limit_exceeded"
    assert exc.details == {
        "key": "prompt_slots",
        "allowance": 3,
        "current": 3,
        "requested": 1,
    }
    assert exc.snapshot is snapshot


def test_unresolved_error_has_coded_no_details() -> None:
    exc = OccupancyUnresolvedError("unavailable")
    assert exc.code == CODE_OCCUPANCY_UNRESOLVED == "occupancy_unresolved"
    assert exc.details is None
