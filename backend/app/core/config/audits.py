# Audit lifecycle + queue + execution guardrail configuration (invariant 1).
#
# Owns every tunable knob for the B5 audit-execution subsystem: the audit
# lifecycle statuses + the queue/task statuses, the deterministic system
# instructions per benchmark mode, and the provider-agnostic execution
# guardrails (pacing, per-call ceiling, retry budget, run deadline, lease TTL,
# heartbeat interval). Orchestration, the planner, and the worker READ these;
# they never hard-code the literals inline. Adapted from the reference
# ``config/ai_visibility.py`` guardrail knobs.
from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING, Final

from pydantic_settings import BaseSettings, SettingsConfigDict

if TYPE_CHECKING:
    # Type-only: config never imports a model at runtime (circular import).
    from app.models.audit import AuditTask

from app.core.config.projects import (
    BENCHMARK_MODE_CONSUMER_LIKE,
    BENCHMARK_MODE_CONTROLLED_LOCALIZED,
)
from app.core.config.task_queue import (
    ERROR_MAX_ATTEMPTS,
    TASK_CLAIMABLE_STATUSES,
    TASK_LEASED_STATUSES,
    TASK_STATUS_CANCELLED,
    TASK_STATUS_FAILED,
    TASK_STATUS_LEASED,
    TASK_STATUS_QUEUED,
    TASK_STATUS_RETRY_WAIT,
    TASK_STATUS_RUNNING,
    TASK_STATUS_SUCCEEDED,
    TASK_TERMINAL_STATUSES,
    PostgresQueueSpec,
)

# Queue-row statuses + the max-attempts token are queue-neutral: they are
# owned by ``config/task_queue.py`` and re-exported here so existing audit
# imports (``from app.core.config.audits import TASK_STATUS_*``) keep working
# unchanged while the audit and Site Health queues share one vocabulary.
__all_queue_reexports = (
    ERROR_MAX_ATTEMPTS,
    TASK_CLAIMABLE_STATUSES,
    TASK_LEASED_STATUSES,
    TASK_STATUS_CANCELLED,
    TASK_STATUS_FAILED,
    TASK_STATUS_LEASED,
    TASK_STATUS_QUEUED,
    TASK_STATUS_RETRY_WAIT,
    TASK_STATUS_RUNNING,
    TASK_STATUS_SUCCEEDED,
    TASK_TERMINAL_STATUSES,
)

# --- Audit lifecycle statuses --------------------------------------------
# The state machine (``app/orchestration/audit_state.py``) enforces the legal
# transitions between these.
AUDIT_STATUS_DRAFT: Final = "draft"
AUDIT_STATUS_VALIDATING: Final = "validating"
AUDIT_STATUS_QUEUED: Final = "queued"
AUDIT_STATUS_RUNNING: Final = "running"
AUDIT_STATUS_ANALYZING: Final = "analyzing"
AUDIT_STATUS_REPORTING: Final = "reporting"
AUDIT_STATUS_COMPLETED: Final = "completed"
AUDIT_STATUS_PARTIALLY_COMPLETED: Final = "partially_completed"
AUDIT_STATUS_FAILED: Final = "failed"
AUDIT_STATUS_CANCELLED: Final = "cancelled"

AUDIT_TERMINAL_STATUSES: Final[frozenset[str]] = frozenset(
    {
        AUDIT_STATUS_COMPLETED,
        AUDIT_STATUS_PARTIALLY_COMPLETED,
        AUDIT_STATUS_FAILED,
        AUDIT_STATUS_CANCELLED,
    }
)
# Statuses at which a cooperative cancel is still meaningful (a live worker can
# stop at its boundary). ``reporting`` is intentionally excluded: by then
# execution + analysis are done and the state machine treats REPORTING ->
# CANCELLED as illegal (there is no live worker left to stop cooperatively).
AUDIT_ACTIVE_STATUSES: Final[frozenset[str]] = frozenset(
    {
        AUDIT_STATUS_DRAFT,
        AUDIT_STATUS_VALIDATING,
        AUDIT_STATUS_QUEUED,
        AUDIT_STATUS_RUNNING,
        AUDIT_STATUS_ANALYZING,
    }
)

# --- Measurement modes ----------------------------------------------------
# Pulse vs benchmark measurement vocabulary. Keyed on by the expected-cost
# catalogue (``config/costs.py``) now; the route/output policy, planner
# freezing, and ``Audit.measurement_mode`` column arrive with T3 and must use
# these same constants (invariant 2 — never re-literal the mode strings).
# What initiated a run (closed vocabulary; ``Audit.trigger`` is String(16)).
# PR1 produces only ``manual`` (API) and ``system`` (dev seed) runs; a later
# schedule/trial caller passes its own token. The manual-run rolling rate
# (``manual_runs_per_day``) counts ONLY ``manual`` rows.
AUDIT_TRIGGER_MANUAL: Final = "manual"
AUDIT_TRIGGER_TRIAL: Final = "trial"
AUDIT_TRIGGER_SCHEDULED: Final = "scheduled"
AUDIT_TRIGGER_SYSTEM: Final = "system"
AUDIT_TRIGGERS: Final[frozenset[str]] = frozenset(
    {
        AUDIT_TRIGGER_MANUAL,
        AUDIT_TRIGGER_TRIAL,
        AUDIT_TRIGGER_SCHEDULED,
        AUDIT_TRIGGER_SYSTEM,
    }
)

# Pre-claim queue status for funded tasks (slice23 Task 4 Part B): the planner
# writes each funded task in this NON-claimable state, reserves its credits in
# the same transaction, and only then flips it to ``TASK_STATUS_QUEUED``, so a
# worker can never claim an unreserved funded task. Never a member of
# ``TASK_CLAIMABLE_STATUSES``.
TASK_STATUS_PENDING_RESERVATION: Final = "pending_reservation"

MEASUREMENT_MODE_PULSE: Final = "pulse"
MEASUREMENT_MODE_BENCHMARK: Final = "benchmark"
MEASUREMENT_MODES: Final[frozenset[str]] = frozenset(
    {MEASUREMENT_MODE_PULSE, MEASUREMENT_MODE_BENCHMARK}
)

# UNMEASURED CANDIDATE — this wording has never been executed against a live
# provider key. It is a hypothesis about output length, nothing more. The cost
# and latency reduction figures quoted in the frozen v8 plan (the −56% / −49%
# pair) were NOT produced with this string and DO NOT apply to it: no number
# anywhere in this repository may be attributed to this instruction until a
# live-key T1 measurement run measures it and clears the gate thresholds in
# ``config/measurement.py``. Until then it is an unvalidated candidate that
# happens to be the wording pulse mode sends.
PULSE_ANSWER_INSTRUCTION: Final = (
    "Answer directly and concisely. "
    "Include only the details needed to answer the question."
)
"""UNMEASURED CANDIDATE answer-shaping instruction used by pulse mode.

Pulse mode IS enabled and sends this wording, but the wording itself carries no
measurement: the frozen plan's −56% cost / −49% latency figures were obtained
with different wording and DO NOT apply here until a live-key T1 measurement
run validates this exact string. Treat any claim otherwise as a bug.
"""
# SHA-256 of ``PULSE_ANSWER_INSTRUCTION`` — pinned by a unit test so the
# candidate wording can never drift silently (a drifted wording is a different,
# equally unmeasured candidate).
PULSE_ANSWER_INSTRUCTION_SHA256: Final = (
    "a7d86db3b284d8d7397125046327ac013107240255cd6ba3ee6544feaebfb69a"
)


@dataclass(frozen=True, slots=True)
class MeasurementModePolicy:
    """Frozen route/output policy for one measurement mode.

    Resolved from live settings by ``measurement_policy_for_mode`` and then
    FROZEN by the caller onto the audit (invariant 9 — never re-read live
    config once a run is planned).
    """

    retrieval_enabled: bool
    max_output_tokens: int
    timeout_seconds: float
    repetitions: int
    answer_instruction: str


# --- Task (queue row) statuses -------------------------------------------
# Owned by ``config/task_queue.py`` and re-exported at the top of this module
# (``TASK_STATUS_*`` / ``TASK_TERMINAL_STATUSES`` / ``TASK_CLAIMABLE_STATUSES``
# / ``TASK_LEASED_STATUSES``) so audit callers import them from here unchanged.

# --- Attempt outcomes ----------------------------------------------------
ATTEMPT_STATUS_SUCCEEDED: Final = "succeeded"
ATTEMPT_STATUS_FAILED: Final = "failed"

# --- Audit lifecycle event types (SSE source) ----------------------------
EVENT_AUDIT_CREATED: Final = "audit.created"
EVENT_AUDIT_QUEUED: Final = "audit.queued"
EVENT_AUDIT_RUNNING: Final = "audit.running"
EVENT_AUDIT_STATUS: Final = "audit.status"
EVENT_TASK_SUCCEEDED: Final = "task.succeeded"
EVENT_TASK_FAILED: Final = "task.failed"
EVENT_TASK_RETRY: Final = "task.retry"
EVENT_AUDIT_CANCELLED: Final = "audit.cancelled"
EVENT_AUDIT_COMPLETED: Final = "audit.completed"

# --- Error tokens specific to the run lifecycle ---------------------------
# Provider-call error tokens live in ``provider_catalog`` (reused by the
# worker); these two are orchestration-level (no provider call involved).
ERROR_RUN_DEADLINE: Final = "run_deadline_exceeded"
ERROR_CANCELLED: Final = "cancelled"
# ``ERROR_MAX_ATTEMPTS`` is queue-neutral (re-exported from task_queue above).
ERROR_NO_CONNECTION: Final = "provider_connection_missing"

# --- Deterministic system instructions per benchmark mode -----------------
# Consumer-like sends no hidden instruction; the localized + forced-grounded
# modes prepend a neutral, brand-free instruction (invariant 6 — the brand list
# is never transmitted). Ported from the reference ``config/ai_visibility.py``.
LOCALIZED_INSTRUCTION: Final = (
    "Answer for a shopper in the market identified by ISO country code "
    "{country_code}, using language {language_code}. Prioritize retailers that "
    "serve that market and sources relevant to that market."
)
FORCED_GROUNDED_INSTRUCTION: Final = (
    "Answer the shopping question using current web information. "
    "Cite the sources supporting your recommendations."
)


def system_instruction_for_mode(
    *, mode: str, country_code: str, language_code: str
) -> str:
    """Resolve the neutral system instruction frozen onto an audit.

    Never contains any brand/competitor identity (invariant 6).
    """
    if mode == BENCHMARK_MODE_CONSUMER_LIKE:
        return ""
    localized = LOCALIZED_INSTRUCTION.format(
        country_code=(country_code or "unspecified"),
        language_code=(language_code or "unspecified"),
    )
    if mode == BENCHMARK_MODE_CONTROLLED_LOCALIZED:
        return localized
    # forced_grounded: localized + explicit grounding directive.
    return f"{localized} {FORCED_GROUNDED_INSTRUCTION}"


class AuditSettings(BaseSettings):
    """Provider-agnostic audit execution guardrails (env-overridable).

    One set of knobs bounds every audit so a stray or throttled run cannot run
    away in tokens, time, or duration regardless of provider.
    """

    model_config = SettingsConfigDict(env_prefix="AUDIT_", extra="ignore")

    # Hard cap on slots (prompts x engines x repetitions) an audit may create.
    max_tasks_per_audit: int = 500
    # Up to N tasks a single worker keeps IN FLIGHT at once (the pipelined pump
    # refills a slot the moment its task lands — see AuditWorker.run_pipelined).
    #
    # Sized for the free-tier run shape: 10 prompts x 3 providers = 30 calls at
    # ~29s average, so 10 in flight puts a run at roughly 90s instead of the
    # ~4 minutes a concurrency of 4 gave. Paired with DB_POOL_SIZE/
    # DB_MAX_OVERFLOW (peak demand is ~2 sessions per in-flight task; the
    # startup guard warns if the pool cannot cover it).
    #
    # CEILING IS THE PROVIDER, NOT THIS NUMBER. Grounded answers carry the web
    # search results back in as input: measured Claude calls averaged ~16k INPUT
    # tokens each, so 10 concurrent Claude calls burst ~160k input-tokens/min and
    # will 429 on a low Anthropic tier. Raise this only as far as the account's
    # input-tokens-per-minute allowance permits, and use
    # ``min_request_interval_seconds`` to spread starts per transport.
    #
    # The worker logs this exposure at startup
    # (``_warn_if_provider_pacing_unbounded``) whenever concurrency is > 1 with
    # pacing off, so the risk is visible in the logs rather than only here.
    worker_concurrency: int = 10
    # How long the loop sleeps when the queue is empty before polling again. Also
    # gates the expired-lease sweep (``AuditWorker._sweep_expired_leases``) so
    # the pool's slots share one sweep per interval instead of one each.
    poll_interval_seconds: float = 1.0
    # Minimum spacing between provider request starts, per transport, to respect
    # rate limits (mainly Gemini's low per-minute quota).
    #
    # Left at 0 ON PURPOSE. Spacing every start would serialize the pipelined
    # pump's ramp-up and undo the throughput it exists for, and the right
    # interval depends entirely on the operator's provider tier — there is no
    # default that is correct for both a tier-1 and a tier-4 account. Deployments
    # that need pacing set AUDIT_MIN_REQUEST_INTERVAL_SECONDS; the startup
    # warning above makes the unpaced default explicit rather than silent.
    min_request_interval_seconds: float = 0.0
    # Hard per-call ceiling enforced with ``asyncio.wait_for`` around the
    # provider call, independent of the HTTP client timeout.
    max_call_seconds: float = 90.0
    # Per-run wall-clock deadline. Once exceeded, remaining tasks stop at their
    # boundary and terminalize, so a run can never sit live forever.
    max_run_seconds: float = 1800.0
    # Retry budget for a single task (attempt_count is bounded by max_attempts).
    max_attempts: int = 5
    retry_base_delay_seconds: float = 2.0
    retry_max_delay_seconds: float = 45.0
    retry_jitter_seconds: float = 1.5
    # Lease TTL: a claimed task's lease expires after this many seconds unless
    # the worker heartbeats to extend it.
    lease_ttl_seconds: float = 120.0
    # Worker heartbeats at this cadence while a task runs.
    heartbeat_interval_seconds: float = 30.0
    # HTTP client timeout for a single provider call (passed to the adapter).
    request_timeout_seconds: float = 60.0

    # --- Measurement-mode route/output policy (invariant 1) --------------
    # Pulse trades answer breadth for cost/latency: a short output cap, a short
    # per-call timeout, one repetition, and the UNMEASURED CANDIDATE answer
    # instruction. Benchmark is the full comparable run.
    pulse_max_output_tokens: int = 600
    benchmark_max_output_tokens: int = 4096
    pulse_timeout_seconds: float = 30.0
    benchmark_timeout_seconds: float = 150.0
    pulse_repetitions: int = 1
    benchmark_repetitions: int = 3
    # Days of history folded into a trend series by the reporting projection.
    trend_smoothing_days: int = 7
    # Hard ceiling on a single frozen prompt's length (validated by the planner).
    max_prompt_chars: int = 300

    def retry_delay(
        self, attempt: int, retry_after_seconds: float | None = None
    ) -> float:
        """Seconds to wait before the next attempt.

        Prefers a provider-advised ``Retry-After`` (clamped to the cap); else
        exponential backoff ``base * 2**attempt`` capped at the max, plus a
        small deterministic jitter (derived from ``attempt``, not RNG, so it
        stays reproducible).
        """
        cap = self.retry_max_delay_seconds
        if retry_after_seconds is not None:
            return min(retry_after_seconds, cap)
        base = self.retry_base_delay_seconds * (2**attempt)
        jitter = (attempt * 0.37) % 1.0 * self.retry_jitter_seconds
        return min(base, cap) + jitter


audit_settings = AuditSettings()


def measurement_policy_for_mode(mode: str) -> MeasurementModePolicy:
    """Resolve the route/output policy for a measurement mode.

    Reads the LIVE settings; the caller freezes the returned policy onto the
    audit and never re-reads it (invariant 9). Fails CLOSED: an unknown mode
    raises rather than silently defaulting to a cheaper or costlier shape.

    The pulse ``answer_instruction`` is an UNMEASURED CANDIDATE (see
    ``PULSE_ANSWER_INSTRUCTION``): no cost/latency figure from the frozen plan
    is attributable to it until a live-key T1 run validates the wording.
    """
    if mode == MEASUREMENT_MODE_PULSE:
        return MeasurementModePolicy(
            retrieval_enabled=False,
            max_output_tokens=audit_settings.pulse_max_output_tokens,
            timeout_seconds=audit_settings.pulse_timeout_seconds,
            repetitions=audit_settings.pulse_repetitions,
            answer_instruction=PULSE_ANSWER_INSTRUCTION,
        )
    if mode == MEASUREMENT_MODE_BENCHMARK:
        return MeasurementModePolicy(
            retrieval_enabled=True,
            max_output_tokens=audit_settings.benchmark_max_output_tokens,
            timeout_seconds=audit_settings.benchmark_timeout_seconds,
            repetitions=audit_settings.benchmark_repetitions,
            answer_instruction="",
        )
    raise ValueError(
        f"unknown measurement mode {mode!r}; expected one of "
        f"{sorted(MEASUREMENT_MODES)}"
    )


# Key of the frozen measurement-policy block inside ``Audit.configuration``.
# One owner for the spelling: the planner writes it through
# ``frozen_policy_configuration`` and the worker reads it back through
# ``measurement_policy_from_configuration`` (invariant 2).
MEASUREMENT_POLICY_KEY: Final = "measurement_policy"


def frozen_policy_configuration(policy: MeasurementModePolicy) -> dict:
    """Serialize a resolved policy for ``Audit.configuration`` (invariant 9).

    This is the FROZEN copy the worker executes from; nothing re-reads the live
    settings once it is written.
    """
    return {
        "retrieval_enabled": policy.retrieval_enabled,
        "max_output_tokens": policy.max_output_tokens,
        "timeout_seconds": policy.timeout_seconds,
        "repetitions": policy.repetitions,
        "answer_instruction": policy.answer_instruction,
    }


def measurement_policy_from_configuration(
    configuration: dict,
) -> MeasurementModePolicy:
    """Read the frozen policy back out of an audit's ``configuration``.

    Pre-T3 audits carry no frozen block at all; for those (and only those) the
    mode defaults are the closest available approximation, resolved from the
    frozen ``measurement_mode`` (``benchmark`` when even that is absent). Every
    audit planned from T3 onward returns exactly what the planner froze.
    """
    frozen = configuration.get(MEASUREMENT_POLICY_KEY)
    if not frozen:
        mode = str(configuration.get("measurement_mode") or MEASUREMENT_MODE_BENCHMARK)
        return measurement_policy_for_mode(mode)
    return MeasurementModePolicy(
        retrieval_enabled=bool(frozen["retrieval_enabled"]),
        max_output_tokens=int(frozen["max_output_tokens"]),
        timeout_seconds=float(frozen["timeout_seconds"]),
        repetitions=int(frozen["repetitions"]),
        answer_instruction=str(frozen["answer_instruction"]),
    )


def _audit_model() -> type[AuditTask]:
    # Imported lazily so this config module never imports a model at import
    # time (would create a config <-> models circular import).
    from app.models.audit import AuditTask

    return AuditTask


def _audit_claim_order(model: type[AuditTask]) -> tuple:
    # Deterministic claim order: priority, then FIFO by availability, then the
    # frozen randomized slot position. Preserves the exact original audit
    # ordering (see the pre-genericization ``PostgresTaskQueue.claim``).
    return (
        model.priority.desc(),
        model.available_at.asc(),
        model.randomized_position.asc(),
    )


# The audit queue spec: parameterizes the generic ``PostgresTaskQueue`` over
# ``AuditTask`` with the audit lease TTL + claim order, preserving current
# audit queue semantics exactly.
AUDIT_QUEUE_SPEC: Final[PostgresQueueSpec[AuditTask]] = PostgresQueueSpec(
    model_ref=_audit_model,
    lease_ttl=lambda: audit_settings.lease_ttl_seconds,
    claim_order=_audit_claim_order,
    max_attempts_error=ERROR_MAX_ATTEMPTS,
)
