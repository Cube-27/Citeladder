"""Persisted schema vocabulary; application policy is native."""

from __future__ import annotations

from typing import Final

TASK_STATUS_QUEUED: Final = "queued"

TASK_STATUS_LEASED: Final = "leased"

TASK_STATUS_RUNNING: Final = "running"

TASK_STATUS_SUCCEEDED: Final = "succeeded"

TASK_STATUS_RETRY_WAIT: Final = "retry_wait"

TASK_STATUS_CAPACITY_WAIT: Final = "capacity_wait"

TASK_STATUS_AWAITING_PROVIDER_RESULT: Final = "awaiting_provider_result"

TASK_STATUS_SUBMISSION_UNCERTAIN: Final = "submission_uncertain"

TASK_CLAIMABLE_STATUSES: Final[frozenset[str]] = frozenset(
    {
        TASK_STATUS_QUEUED,
        TASK_STATUS_RETRY_WAIT,
        TASK_STATUS_CAPACITY_WAIT,
        TASK_STATUS_AWAITING_PROVIDER_RESULT,
        TASK_STATUS_SUBMISSION_UNCERTAIN,
    }
)

TASK_LEASED_STATUSES: Final[frozenset[str]] = frozenset(
    {TASK_STATUS_LEASED, TASK_STATUS_RUNNING}
)
