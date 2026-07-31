"""Audit execution guardrails: retry backoff + the hard per-call ceiling.

Adapted from the reference ``tests/unit/test_ai_visibility_{retry,guardrails}``.
Covers the provider-agnostic knobs that bound a run in time and attempts:
  - ``retry_delay`` prefers a provider ``Retry-After`` (clamped to the cap),
    else exponential backoff capped + deterministic jitter;
  - ``_call_with_retries`` cuts off a stalled provider at ``max_call_seconds``
    and gives up after ``max_attempts``, surfacing a retryable timeout.
"""

from __future__ import annotations

import asyncio

import pytest

from app.connectors.answer_engines.contracts import (
    AnswerEngineRequest,
    AnswerEngineResponse,
)
from app.connectors.answer_engines.errors import ProviderError
from app.core.config import settings
from app.core.config.audits import (
    MEASUREMENT_MODE_PULSE,
    audit_settings,
    measurement_policy_for_mode,
)
from app.core.config.provider_catalog import (
    ENGINE_GEMINI,
    ERROR_RATE_LIMIT,
    ERROR_TIMEOUT,
    TRANSPORT_GOOGLE,
    route_policy,
)
from app.workers import audit_worker


def _request() -> AnswerEngineRequest:
    return AnswerEngineRequest(
        prompt="cheap baby clothes",
        system_instruction="Answer for Australia.",
        model="claude-sonnet-4-6",
        timeout_seconds=30,
    )


def test_retry_delay_prefers_retry_after_clamped_to_cap() -> None:
    cap = audit_settings.retry_max_delay_seconds
    # Provider-advised wait honored under the cap...
    assert audit_settings.retry_delay(0, 12.0) == 12.0
    # ...and clamped when it exceeds the cap.
    assert audit_settings.retry_delay(0, cap + 100) == cap


def test_retry_delay_exponential_backoff_grows_and_caps() -> None:
    base = audit_settings.retry_base_delay_seconds
    cap = audit_settings.retry_max_delay_seconds
    # attempt 0 -> base (jitter is zero, since (0 * 0.37) % 1 == 0).
    assert audit_settings.retry_delay(0) == base
    for attempt in range(1, 8):
        delay = audit_settings.retry_delay(attempt)
        assert delay >= min(base * (2**attempt), cap)
        assert delay <= cap + audit_settings.retry_jitter_seconds


class _StallingAdapter:
    """Adapter whose call never returns; the wait_for ceiling must cut it off."""

    transport_provider = TRANSPORT_GOOGLE

    async def execute(self, request: AnswerEngineRequest):  # pragma: no cover
        await asyncio.sleep(3600)


class _CountingStallAdapter(_StallingAdapter):
    def __init__(self) -> None:
        self.calls = 0

    async def execute(self, request: AnswerEngineRequest):  # pragma: no cover
        self.calls += 1
        await asyncio.sleep(3600)


@pytest.mark.asyncio
async def test_call_ceiling_cuts_off_a_stalled_provider(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(audit_settings, "max_call_seconds", 0.01)
    monkeypatch.setattr(audit_settings, "max_attempts", 1)
    monkeypatch.setattr(
        audit_worker, "pace_provider_request", lambda provider: asyncio.sleep(0)
    )

    attempts = await audit_worker._call_with_retries(_StallingAdapter(), _request())

    assert len(attempts) == 1
    final = attempts[-1]
    assert final.response is None
    error = final.error
    assert isinstance(error, ProviderError)
    # A stall surfaces as a retryable timeout, not a hang.
    assert error.error_code == ERROR_TIMEOUT
    assert error.retryable is True


@pytest.mark.asyncio
async def test_call_ceiling_retries_then_gives_up(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(audit_settings, "max_call_seconds", 0.01)
    monkeypatch.setattr(audit_settings, "max_attempts", 3)
    # Zero every delay knob so the retry loop is fast + deterministic (the
    # ``retry_delay`` method reads these; it cannot be monkeypatched on a
    # pydantic-settings instance).
    monkeypatch.setattr(audit_settings, "retry_base_delay_seconds", 0.0)
    monkeypatch.setattr(audit_settings, "retry_jitter_seconds", 0.0)
    monkeypatch.setattr(
        audit_worker, "pace_provider_request", lambda provider: asyncio.sleep(0)
    )
    adapter = _CountingStallAdapter()

    attempts = await audit_worker._call_with_retries(adapter, _request())

    # max_attempts=3 -> 3 attempts total, each cut off by the ceiling, and one
    # CallAttempt record per actual call.
    assert adapter.calls == 3
    assert len(attempts) == 3
    assert all(a.response is None for a in attempts)
    final_error = attempts[-1].error
    assert final_error is not None and final_error.error_code == ERROR_TIMEOUT


class _FlakyAdapter:
    """Fails with a retryable error N times, then returns a success."""

    transport_provider = TRANSPORT_GOOGLE

    def __init__(self, *, fail_times: int) -> None:
        self._fail_times = fail_times
        self.calls = 0

    async def execute(self, request: AnswerEngineRequest) -> AnswerEngineResponse:
        self.calls += 1
        if self.calls <= self._fail_times:
            raise ProviderError(
                "temporary rate limit",
                error_code=ERROR_RATE_LIMIT,
                retryable=True,
            )
        return AnswerEngineResponse(
            logical_engine=ENGINE_GEMINI,
            transport_provider=TRANSPORT_GOOGLE,
            transport_model=request.model,
            answer_text="ok",
            search_used=False,
            search_events=(),
            citations=(),
        )


@pytest.mark.asyncio
async def test_call_records_one_attempt_per_call_then_succeeds(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(audit_settings, "max_attempts", 5)
    monkeypatch.setattr(audit_settings, "retry_base_delay_seconds", 0.0)
    monkeypatch.setattr(audit_settings, "retry_jitter_seconds", 0.0)
    monkeypatch.setattr(
        audit_worker, "pace_provider_request", lambda provider: asyncio.sleep(0)
    )
    adapter = _FlakyAdapter(fail_times=2)

    attempts = await audit_worker._call_with_retries(adapter, _request())

    # Two retryable failures then a success -> three CallAttempt records, with
    # the terminal one carrying the success (invariant 3: one row per call).
    assert adapter.calls == 3
    assert len(attempts) == 3
    assert [a.succeeded for a in attempts] == [False, False, True]
    assert attempts[0].error is not None
    assert attempts[0].error.error_code == ERROR_RATE_LIMIT
    assert attempts[-1].response is not None


def test_build_request_passes_every_frozen_policy_field_explicitly() -> None:
    """The adapter request is driven by the frozen policy, not by defaults.

    The contract defaults exist so pre-T3 construction sites keep compiling;
    relying on them here would silently un-freeze the planned policy (invariant
    9), so each field is asserted against the policy value.
    """
    policy = measurement_policy_for_mode(MEASUREMENT_MODE_PULSE)
    request = audit_worker._build_request(
        prompt_text="cheap baby clothes",
        system_instruction="Answer for Australia.",
        transport_model="gemini-3-pro",
        logical_engine=ENGINE_GEMINI,
        transport_provider=TRANSPORT_GOOGLE,
        policy=policy,
    )

    assert request.timeout_seconds == policy.timeout_seconds
    assert request.retrieval_enabled == policy.retrieval_enabled
    assert request.max_output_tokens == policy.max_output_tokens
    assert request.reasoning_effort == (
        route_policy(ENGINE_GEMINI, TRANSPORT_GOOGLE).reasoning_effort
    )
    # A pulse run freezes retrieval OFF, so the request never buys a search.
    assert request.retrieval_enabled is False


def test_build_request_snapshot_records_policy_and_omits_the_brand_list() -> None:
    """The snapshot reproduces the call; it never carries a secret or the brand.

    Invariant 6: the API key and the brand/competitor list are excluded from
    every snapshot.
    """
    policy = measurement_policy_for_mode(MEASUREMENT_MODE_PULSE)
    request = audit_worker._build_request(
        prompt_text="cheap baby clothes",
        system_instruction="Answer for Australia. " + policy.answer_instruction,
        transport_model="gemini-3-pro",
        logical_engine=ENGINE_GEMINI,
        transport_provider=TRANSPORT_GOOGLE,
        policy=policy,
    )
    snapshot = audit_worker._build_request_snapshot(
        logical_engine=ENGINE_GEMINI,
        transport_provider=TRANSPORT_GOOGLE,
        transport_model="gemini-3-pro",
        request=request,
        configuration={
            "measurement_mode": MEASUREMENT_MODE_PULSE,
            "benchmark_mode": "solo_brand",
            "country_code": "AU",
            "language_code": "en",
            # A planner-frozen configuration also carries the brand identity;
            # it must NOT be copied into the request snapshot.
            "brand_names": ["Acme"],
        },
        answer_instruction=policy.answer_instruction,
    )

    assert snapshot["measurement_mode"] == MEASUREMENT_MODE_PULSE
    assert snapshot["retrieval_enabled"] == policy.retrieval_enabled
    assert snapshot["max_output_tokens"] == policy.max_output_tokens
    assert snapshot["timeout_seconds"] == policy.timeout_seconds
    assert snapshot["answer_instruction"] == policy.answer_instruction
    assert snapshot["reasoning_effort"] == (
        route_policy(ENGINE_GEMINI, TRANSPORT_GOOGLE).reasoning_effort
    )
    assert snapshot["stateless"] is True
    assert "brand_names" not in snapshot
    assert "api_key" not in snapshot
    assert "Acme" not in str(snapshot)


def _pool_demand() -> int:
    return (
        audit_settings.worker_max_inflight * audit_settings.worker_db_sessions_per_task
        + audit_settings.operational_headroom
    )


def test_assert_worker_pool_capacity_raises_when_undersized(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The pre-T4 pool shape (4+2) cannot cover peak demand: startup RAISES."""
    monkeypatch.setattr(settings, "db_pool_size", 4)
    monkeypatch.setattr(settings, "db_max_overflow", 2)
    assert 4 + 2 < _pool_demand()  # the configuration under test IS undersized
    with pytest.raises(RuntimeError, match="db pool undersized"):
        audit_worker.assert_worker_pool_capacity()


def test_assert_worker_pool_capacity_passes_at_exact_boundary(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """pool_size + max_overflow == exact demand is ENOUGH (>=, not >)."""
    monkeypatch.setattr(settings, "db_pool_size", _pool_demand())
    monkeypatch.setattr(settings, "db_max_overflow", 0)
    audit_worker.assert_worker_pool_capacity()  # must not raise


def test_assert_worker_pool_capacity_passes_with_shipped_defaults() -> None:
    """The shipped pool defaults exactly cover the frozen T4 worker demand."""
    assert settings.db_pool_size + settings.db_max_overflow == _pool_demand()
    audit_worker.assert_worker_pool_capacity()  # must not raise
