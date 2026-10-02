"""Shared persisted queue vocabulary; TypeScript owns queue execution and recovery."""

from __future__ import annotations

from typing import Final

# --- Queue-neutral task (queue row) statuses -----------------------------
# The queue-row lifecycle is identical for every task type:
#   queued|leased|running|succeeded|retry_wait|failed|cancelled.
TASK_STATUS_QUEUED: Final = "queued"
TASK_STATUS_LEASED: Final = "leased"
TASK_STATUS_RUNNING: Final = "running"
TASK_STATUS_SUCCEEDED: Final = "succeeded"
TASK_STATUS_RETRY_WAIT: Final = "retry_wait"
TASK_STATUS_FAILED: Final = "failed"
TASK_STATUS_CANCELLED: Final = "cancelled"
# Parked on a provider-capacity decision (T4): no pool/token budget was
# available, so the task waits for ``available_at`` exactly like a retry wait —
# the queued-state column is REUSED, never duplicated. Unlike
# ``pending_reservation`` (audit-only, never claimable) this status IS
# claimable once its ``available_at`` passes.
TASK_STATUS_CAPACITY_WAIT: Final = "capacity_wait"
# Parked on an EXTERNAL provider task that has not finished yet. The only
# status in this vocabulary that waits on something outside the process.
#
# It is not a retry wait and not a capacity wait, and the difference is
# load-bearing on two counts. A retry wait means an attempt was spent; this
# means a paid submission is outstanding and polling it costs nothing, so
# parking here must never touch ``attempt_count``. And the sweeper must not
# treat the row as an expired lease: the task IS progressing, just not here.
TASK_STATUS_AWAITING_PROVIDER_RESULT: Final = "awaiting_provider_result"
# A submission whose fate is UNKNOWN: the POST may or may not have landed, so
# the task may or may not already have been paid for. It is never permission
# to submit again — it is a task waiting to be reconciled against the
# provider by its correlation tag.
TASK_STATUS_SUBMISSION_UNCERTAIN: Final = "submission_uncertain"

# In-flight states that wait on an external provider task. Held together
# because every sweeper, counter and claim predicate has to treat them alike:
# the work is outstanding somewhere else, not stalled here.
TASK_AWAITING_PROVIDER_STATUSES: Final[frozenset[str]] = frozenset(
    {TASK_STATUS_AWAITING_PROVIDER_RESULT, TASK_STATUS_SUBMISSION_UNCERTAIN}
)

TASK_TERMINAL_STATUSES: Final[frozenset[str]] = frozenset(
    {TASK_STATUS_SUCCEEDED, TASK_STATUS_FAILED, TASK_STATUS_CANCELLED}
)
TASK_ACTIVE_STATUSES: Final[frozenset[str]] = frozenset(
    {
        TASK_STATUS_QUEUED,
        TASK_STATUS_LEASED,
        TASK_STATUS_RUNNING,
        TASK_STATUS_RETRY_WAIT,
        TASK_STATUS_CAPACITY_WAIT,
        TASK_STATUS_AWAITING_PROVIDER_RESULT,
        TASK_STATUS_SUBMISSION_UNCERTAIN,
    }
)
# Statuses a ``claim()`` may pick up: queued, ready-to-retry, unparked from a
# capacity wait, or due for the next poll / reconciliation attempt on an
# outstanding provider task — each once its ``available_at`` has passed.
TASK_CLAIMABLE_STATUSES: Final[frozenset[str]] = frozenset(
    {
        TASK_STATUS_QUEUED,
        TASK_STATUS_RETRY_WAIT,
        TASK_STATUS_CAPACITY_WAIT,
        TASK_STATUS_AWAITING_PROVIDER_RESULT,
        TASK_STATUS_SUBMISSION_UNCERTAIN,
    }
)
# Statuses a sweeper reclaims when their lease expires.
TASK_LEASED_STATUSES: Final[frozenset[str]] = frozenset(
    {TASK_STATUS_LEASED, TASK_STATUS_RUNNING}
)

# Error token stamped on a task the sweeper fails after the retry budget is
# spent. Queue-neutral (shared by audit + Site Health task rows).
ERROR_MAX_ATTEMPTS: Final = "max_attempts_exceeded"

# Safety bound for one-shot/test queue drains.
DEFAULT_MAX_DRAIN_BATCHES: Final = 1000
