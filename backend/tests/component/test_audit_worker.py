"""AuditWorker: claim -> call (mocked) -> persist -> finalize (invariants 3, 8, 9).

Provider calls are MOCKED (no network, no spend). Exercises the real
claim/lease loop against a Postgres schema:
  - a full audit runs every task to ``succeeded``, writes one immutable
    RawResponseArtifact + ProviderAttempt each, scores each on persist, and
    finalizes RUNNING -> ANALYZING -> REPORTING -> COMPLETED with an aggregated
    MetricSnapshot (B6);
  - a cooperatively-cancelled audit stops at the task boundary (no artifact);
  - the per-run wall-clock deadline terminalizes remaining tasks.
"""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.connectors.answer_engines.contracts import (
    AnswerEngineRequest,
    AnswerEngineResponse,
    CitationResult,
    FinishReason,
    NormalizedUsage,
    SearchEventResult,
)
from app.connectors.answer_engines.errors import ProviderError
from app.core.config.audits import (
    ATTEMPT_STATUS_FAILED,
    ATTEMPT_STATUS_SUCCEEDED,
    AUDIT_STATUS_CANCELLED,
    AUDIT_STATUS_COMPLETED,
    MEASUREMENT_MODE_PULSE,
    MEASUREMENT_POLICY_KEY,
    PULSE_ANSWER_INSTRUCTION,
    audit_settings,
)
from app.core.config.costs import (
    EXECUTION_COST_FORMULA_VERSION,
    PRICING_CATALOG_VERSION,
    PROJECTION_STATUS_PARTIAL,
)
from app.core.config.provider_catalog import (
    ENGINE_CHATGPT,
    ENGINE_GEMINI,
    ERROR_INVALID_SURFACE,
    ERROR_RATE_LIMIT,
    TRANSPORT_GOOGLE,
    TRANSPORT_OPENAI,
    route_policy,
)
from app.domain.audits.planner import cancel_audit, create_audit, list_tasks
from app.models.analysis import MetricSnapshot, ResponseAnalysis
from app.models.audit import (
    Audit,
    AuditTask,
    ExecutionCostProjection,
    ProviderAttempt,
    RawResponseArtifact,
)
from app.workers import audit_worker
from app.workers.audit_worker import AuditWorker
from tests.component.audit_helpers import seed_audit_fixtures


class _StubAdapter:
    """In-memory stand-in for an answer-engine adapter (no network)."""

    logical_engine = ENGINE_GEMINI
    transport_provider = TRANSPORT_GOOGLE

    def __init__(self, **_: object) -> None:
        # No-op: stub holds no state; accepts and ignores adapter build kwargs.
        pass

    async def execute(self, request: AnswerEngineRequest) -> AnswerEngineResponse:
        return AnswerEngineResponse(
            logical_engine=self.logical_engine,
            transport_provider=self.transport_provider,
            transport_model=request.model,
            answer_text=f"Acme is a great option for {request.prompt}.",
            search_used=True,
            search_events=(SearchEventResult(sequence=0, query=request.prompt),),
            citations=(
                CitationResult(
                    ordinal=0,
                    url="https://acme.com/",
                    title="Acme",
                    domain="acme.com",
                    start_index=0,
                    end_index=4,
                    cited_text="Acme",
                ),
            ),
            provider_metadata={"query_text_available": True},
            # The typed usage contract (what all three live parsers emit).
            normalized_usage=NormalizedUsage(
                uncached_input_tokens=10,
                output_tokens=20,
                total_tokens=30,
                web_search_requests=1,
            ),
            finish_reason=FinishReason.STOP,
            raw_finish_reason="end_turn",
            latency_ms=5,
        )


@pytest.fixture
def _stub_adapter(monkeypatch: pytest.MonkeyPatch):
    def _build(**_: object) -> _StubAdapter:
        return _StubAdapter()

    monkeypatch.setattr(audit_worker, "build_adapter", _build)
    monkeypatch.setattr(audit_settings, "min_request_interval_seconds", 0.0)
    monkeypatch.setattr(audit_settings, "heartbeat_interval_seconds", 3600.0)


async def _make_audit(
    session_factory: async_sessionmaker[AsyncSession],
    *,
    prompts: int,
    reps: int,
    measurement_mode: str | None = None,
):
    async with session_factory() as session:
        seed = await seed_audit_fixtures(session, prompt_count=prompts)
    async with session_factory() as session:
        audit = await create_audit(
            session,
            workspace_id=seed.workspace_id,
            project_id=seed.project_id,
            engines=seed.engines,
            prompt_set_id=seed.prompt_set_id,
            repetitions=reps,
            random_seed="1",
            measurement_mode=measurement_mode,
        )
        return seed, audit


@pytest.mark.asyncio
async def test_worker_runs_all_tasks_and_finalizes(
    session_factory: async_sessionmaker[AsyncSession],
    _stub_adapter,
) -> None:
    seed, audit = await _make_audit(session_factory, prompts=3, reps=2)  # 6
    worker = AuditWorker(session_factory=session_factory, owner="w-test")

    await worker.run_until_idle()

    async with session_factory() as session:
        tasks = await list_tasks(
            session, workspace_id=seed.workspace_id, audit_id=audit.id
        )
        assert {t.status for t in tasks} == {"succeeded"}
        assert all(t.answer_text for t in tasks)
        assert all(t.result_artifact_id is not None for t in tasks)

        # One immutable artifact + one attempt per task (invariant 3).
        artifacts = await session.scalar(
            select(func.count())
            .select_from(RawResponseArtifact)
            .where(RawResponseArtifact.audit_id == audit.id)
        )
        attempts = await session.scalar(
            select(func.count())
            .select_from(ProviderAttempt)
            .where(ProviderAttempt.audit_id == audit.id)
        )
        cost_projections = await session.scalar(
            select(func.count())
            .select_from(ExecutionCostProjection)
            .where(ExecutionCostProjection.audit_id == audit.id)
        )
        assert artifacts == 6
        assert attempts == 6
        assert cost_projections == 6

        cost_projection = await session.scalar(
            select(ExecutionCostProjection).where(
                ExecutionCostProjection.audit_id == audit.id
            )
        )
        assert cost_projection is not None
        # Legacy total keys map to uncached-input/output; cache/reasoning
        # splits and provider cost are unknown — null, never zero. With all
        # catalogue rates unverified the observation is usage-only (partial).
        assert cost_projection.uncached_input_tokens == 10
        assert cost_projection.output_tokens == 20
        assert cost_projection.total_tokens == 30
        assert cost_projection.search_requests == 1
        assert cost_projection.cached_input_tokens is None
        assert cost_projection.reasoning_tokens is None
        assert cost_projection.uncached_input_cost_microusd is None
        assert cost_projection.projected_total_cost_microusd is None
        assert cost_projection.provider_reported_cost_microusd is None
        assert cost_projection.projection_status == PROJECTION_STATUS_PARTIAL
        assert cost_projection.formula_version == EXECUTION_COST_FORMULA_VERSION
        assert cost_projection.pricing_version == PRICING_CATALOG_VERSION
        # Provenance: one actual persisted ProviderAttempt for this task, and
        # the projection points at its immutable source artifact.
        assert cost_projection.attempt_count == 1
        artifact = await session.get(
            RawResponseArtifact, cost_projection.raw_response_artifact_id
        )
        assert artifact is not None
        assert artifact.task_id == cost_projection.task_id

        # Each succeeded task was scored on persist (B6, invariant 4).
        assert all(t.score is not None for t in tasks)

        refreshed = await session.get(Audit, audit.id)
        assert refreshed is not None
        # Execution complete -> analysis stage runs -> audit COMPLETED (B6).
        assert refreshed.status == AUDIT_STATUS_COMPLETED
        assert refreshed.completed_count == 6
        assert refreshed.failed_count == 0
        assert refreshed.started_at is not None
        assert refreshed.completed_at is not None

        # One aggregated MetricSnapshot with a populated Visibility Score.
        snapshot = await session.scalar(
            select(MetricSnapshot).where(MetricSnapshot.audit_id == audit.id)
        )
        assert snapshot is not None
        assert snapshot.total_completed == 6
        assert snapshot.total_failed == 0
        # The stub always mentions "Acme" (the brand) -> 100% Visibility.
        assert snapshot.visibility_score == 100.0
        assert snapshot.analyzer_version

        # One ResponseAnalysis per succeeded execution (invariant 4).
        analyses = await session.scalar(
            select(func.count())
            .select_from(ResponseAnalysis)
            .where(ResponseAnalysis.audit_id == audit.id)
        )
        assert analyses == 6


class _OpenAIStubAdapter(_StubAdapter):
    """OpenAI direct stub: records the chatgpt/openai provenance triple."""

    logical_engine = ENGINE_CHATGPT
    transport_provider = TRANSPORT_OPENAI


class _ConcurrencyProbeAdapter(_StubAdapter):
    """Stub that records how many executes overlap in flight."""

    in_flight = 0
    max_in_flight = 0

    async def execute(self, request: AnswerEngineRequest) -> AnswerEngineResponse:
        cls = _ConcurrencyProbeAdapter
        cls.in_flight += 1
        cls.max_in_flight = max(cls.max_in_flight, cls.in_flight)
        try:
            # Yield so concurrently-running tasks can enter before we return;
            # under serial execution max_in_flight would stay at 1.
            await asyncio.sleep(0.05)
            return await super().execute(request)
        finally:
            cls.in_flight -= 1


@pytest.mark.asyncio
async def test_worker_executes_claimed_batch_concurrently(
    session_factory: async_sessionmaker[AsyncSession],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # A claimed batch runs concurrently (asyncio.gather), so per-prompt provider
    # latency doesn't stack linearly across the run's wall-clock time.
    seed, audit = await _make_audit(session_factory, prompts=4, reps=1)  # 4 tasks

    _ConcurrencyProbeAdapter.in_flight = 0
    _ConcurrencyProbeAdapter.max_in_flight = 0
    monkeypatch.setattr(
        audit_worker, "build_adapter", lambda **_: _ConcurrencyProbeAdapter()
    )
    monkeypatch.setattr(audit_settings, "min_request_interval_seconds", 0.0)
    monkeypatch.setattr(audit_settings, "heartbeat_interval_seconds", 3600.0)
    monkeypatch.setattr(audit_settings, "worker_concurrency", 4)

    worker = AuditWorker(session_factory=session_factory, owner="w-conc")
    await worker.run_until_idle()

    assert _ConcurrencyProbeAdapter.max_in_flight > 1

    async with session_factory() as session:
        tasks = await list_tasks(
            session, workspace_id=seed.workspace_id, audit_id=audit.id
        )
        assert {t.status for t in tasks} == {"succeeded"}
        refreshed = await session.get(Audit, audit.id)
        assert refreshed is not None
        assert refreshed.status == AUDIT_STATUS_COMPLETED
        assert refreshed.completed_count == 4


class _BlockingFirstCallAdapter(_StubAdapter):
    """First call blocks until released; every later call returns immediately."""

    release: asyncio.Event
    started = 0
    finished = 0

    async def execute(self, request: AnswerEngineRequest) -> AnswerEngineResponse:
        cls = _BlockingFirstCallAdapter
        cls.started += 1
        if cls.started == 1:
            await cls.release.wait()
        result = await super().execute(request)
        cls.finished += 1
        return result


@pytest.mark.asyncio
async def test_worker_refills_slots_while_a_slow_call_is_still_in_flight(
    session_factory: async_sessionmaker[AsyncSession],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # The convoy regression. The worker used to claim a batch of
    # ``worker_concurrency`` tasks, ``gather`` ALL of them, and only then claim
    # the next batch — so one slow call stalled every finished slot behind it.
    # Provider latency is very uneven in practice (a measured Claude run ranged
    # 3.4s to 46.3s, because latency tracks the answer's output-token count), so
    # a straggler in the batch is the normal case.
    #
    # Asserted behaviourally rather than by wall-clock, which would be both
    # flaky and a weak signal: uniform latency has no convoy effect at all, so a
    # timing threshold mostly measures fixture overhead. Here ONE call is pinned
    # open while the others run. Under lock-step batching the first batch can
    # never complete, so NO further task could even be claimed; pipelined, the
    # free slot keeps draining the queue past it.
    seed, audit = await _make_audit(session_factory, prompts=6, reps=1)

    _BlockingFirstCallAdapter.release = asyncio.Event()
    _BlockingFirstCallAdapter.started = 0
    _BlockingFirstCallAdapter.finished = 0
    monkeypatch.setattr(
        audit_worker, "build_adapter", lambda **_: _BlockingFirstCallAdapter()
    )
    monkeypatch.setattr(audit_settings, "min_request_interval_seconds", 0.0)
    monkeypatch.setattr(audit_settings, "heartbeat_interval_seconds", 3600.0)
    monkeypatch.setattr(audit_settings, "worker_concurrency", 2)

    worker = AuditWorker(session_factory=session_factory, owner="w-pipeline")
    run = asyncio.create_task(worker.run_until_idle())
    try:
        # The other slot must get through the remaining 5 tasks unaided. With a
        # concurrency of 2, batching could not finish even one.
        async with asyncio.timeout(30):
            while _BlockingFirstCallAdapter.finished < 5:
                await asyncio.sleep(0.01)
    finally:
        _BlockingFirstCallAdapter.release.set()
    await run

    assert _BlockingFirstCallAdapter.finished == 6
    async with session_factory() as session:
        tasks = await list_tasks(
            session, workspace_id=seed.workspace_id, audit_id=audit.id
        )
        assert {t.status for t in tasks} == {"succeeded"}
        refreshed = await session.get(Audit, audit.id)
        assert refreshed is not None
        assert refreshed.status == AUDIT_STATUS_COMPLETED
        assert refreshed.completed_count == 6


@pytest.mark.asyncio
async def test_worker_persists_openai_provenance(
    session_factory: async_sessionmaker[AsyncSession],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # A ChatGPT audit executes over the direct ``openai`` transport and freezes
    # the chatgpt/openai/gpt-5.4 provenance triple on the task + attempt.
    async with session_factory() as session:
        seed = await seed_audit_fixtures(
            session, prompt_count=1, engines=[ENGINE_CHATGPT]
        )
    async with session_factory() as session:
        audit = await create_audit(
            session,
            workspace_id=seed.workspace_id,
            project_id=seed.project_id,
            engines=seed.engines,
            prompt_set_id=seed.prompt_set_id,
            repetitions=1,
            random_seed="1",
        )

    monkeypatch.setattr(audit_worker, "build_adapter", lambda **_: _OpenAIStubAdapter())
    monkeypatch.setattr(audit_settings, "min_request_interval_seconds", 0.0)
    monkeypatch.setattr(audit_settings, "heartbeat_interval_seconds", 3600.0)

    worker = AuditWorker(session_factory=session_factory, owner="w-openai")
    await worker.run_until_idle()

    async with session_factory() as session:
        task = await session.scalar(
            select(AuditTask).where(AuditTask.audit_id == audit.id)
        )
        assert task is not None
        assert task.status == "succeeded"
        assert task.logical_engine == ENGINE_CHATGPT
        assert task.transport_provider == TRANSPORT_OPENAI
        assert task.transport_model == "gpt-5.4"
        assert task.result_artifact_id is not None


@pytest.mark.asyncio
async def test_worker_rejects_frozen_retired_task_without_network(
    session_factory: async_sessionmaker[AsyncSession],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # A task frozen before the transport retirement still points at a retired
    # transport. The worker must fail it terminally with ``invalid_surface``
    # BEFORE the connection-activity check, key decryption, or any network call
    # (invariant 6/10) — build_adapter must never be reached.
    seed, audit = await _make_audit(session_factory, prompts=1, reps=1)

    # Rewrite the frozen task + engine snapshot to the retired transport, as a
    # persisted pre-retirement task would look.
    async with session_factory() as session:
        from app.models.audit import AuditEngineSnapshot

        task = await session.scalar(
            select(AuditTask).where(AuditTask.audit_id == audit.id)
        )
        assert task is not None
        task.transport_provider = "retired"
        snapshot = await session.get(AuditEngineSnapshot, task.engine_snapshot_id)
        if snapshot is not None:
            snapshot.transport_provider = "retired"
        await session.commit()

    def _boom(**_: object):  # noqa: ANN202
        raise AssertionError("build_adapter must not be called for a retired transport")

    monkeypatch.setattr(audit_worker, "build_adapter", _boom)
    monkeypatch.setattr(audit_settings, "min_request_interval_seconds", 0.0)
    monkeypatch.setattr(audit_settings, "heartbeat_interval_seconds", 3600.0)

    worker = AuditWorker(session_factory=session_factory, owner="w-frozen")
    await worker.run_until_idle()

    async with session_factory() as session:
        tasks = await list_tasks(
            session, workspace_id=seed.workspace_id, audit_id=audit.id
        )
        assert {t.status for t in tasks} == {"failed"}
        assert {t.error_code for t in tasks} == {ERROR_INVALID_SURFACE}
        # No external provider call was made (build_adapter would have raised)
        # → no raw artifact is persisted (invariant 6/10). The single terminal
        # bookkeeping attempt documents the rejection, not a network round-trip.
        artifacts = await session.scalar(
            select(func.count())
            .select_from(RawResponseArtifact)
            .where(RawResponseArtifact.audit_id == audit.id)
        )
        assert artifacts == 0
        attempts = (
            await session.scalars(
                select(ProviderAttempt).where(ProviderAttempt.audit_id == audit.id)
            )
        ).all()
        assert all(a.status == "failed" for a in attempts)
        assert all(a.error_code == ERROR_INVALID_SURFACE for a in attempts)
        assert all(a.artifact_id is None for a in attempts)


@pytest.mark.asyncio
async def test_worker_stops_at_boundary_when_cancelled(
    session_factory: async_sessionmaker[AsyncSession],
    _stub_adapter,
) -> None:
    seed, audit = await _make_audit(session_factory, prompts=2, reps=1)  # 2

    # Kill the audit before the worker picks anything up.
    async with session_factory() as session:
        await cancel_audit(session, workspace_id=seed.workspace_id, audit_id=audit.id)

    worker = AuditWorker(session_factory=session_factory, owner="w-cancel")
    await worker.run_until_idle()

    async with session_factory() as session:
        refreshed = await session.get(Audit, audit.id)
        assert refreshed is not None
        assert refreshed.status == AUDIT_STATUS_CANCELLED
        # No provider was called -> no artifacts.
        artifacts = await session.scalar(
            select(func.count())
            .select_from(RawResponseArtifact)
            .where(RawResponseArtifact.audit_id == audit.id)
        )
        assert artifacts == 0
        tasks = await list_tasks(
            session, workspace_id=seed.workspace_id, audit_id=audit.id
        )
        assert {t.status for t in tasks} == {"cancelled"}


@pytest.mark.asyncio
async def test_worker_cuts_off_at_run_deadline(
    session_factory: async_sessionmaker[AsyncSession],
    _stub_adapter,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Deadline already elapsed the instant a task starts -> every task hits the
    # cutoff at its boundary before calling the (stub) provider.
    monkeypatch.setattr(audit_settings, "max_run_seconds", 0.0)
    seed, audit = await _make_audit(session_factory, prompts=2, reps=1)  # 2

    # Mark the audit started so the deadline math trips immediately.
    async with session_factory() as session:
        from datetime import UTC, datetime

        refreshed = await session.get(Audit, audit.id)
        assert refreshed is not None
        refreshed.started_at = datetime.now(UTC)
        await session.commit()

    worker = AuditWorker(session_factory=session_factory, owner="w-deadline")
    await worker.run_until_idle()

    async with session_factory() as session:
        tasks = await list_tasks(
            session, workspace_id=seed.workspace_id, audit_id=audit.id
        )
        assert {t.status for t in tasks} == {"failed"}
        assert {t.error_code for t in tasks} == {"run_deadline_exceeded"}
        artifacts = await session.scalar(
            select(func.count())
            .select_from(RawResponseArtifact)
            .where(RawResponseArtifact.audit_id == audit.id)
        )
        assert artifacts == 0


@pytest.mark.asyncio
async def test_worker_fails_task_with_missing_connection(
    session_factory: async_sessionmaker[AsyncSession],
    _stub_adapter,
) -> None:
    seed, audit = await _make_audit(session_factory, prompts=1, reps=1)  # 1

    # Deactivate the connection so key resolution fails terminally.
    async with session_factory() as session:
        from app.models.provider import ProviderConnection

        conns = (
            await session.scalars(
                select(ProviderConnection).where(
                    ProviderConnection.workspace_id == seed.workspace_id
                )
            )
        ).all()
        for conn in conns:
            conn.active = False
        await session.commit()

    worker = AuditWorker(session_factory=session_factory, owner="w-noconn")
    await worker.run_until_idle()

    async with session_factory() as session:
        tasks = await list_tasks(
            session, workspace_id=seed.workspace_id, audit_id=audit.id
        )
        assert {t.status for t in tasks} == {"failed"}
        assert {t.error_code for t in tasks} == {"provider_connection_missing"}


class _HookAdapter(_StubAdapter):
    """Runs an async callback mid-call, then returns a normal success.

    Simulates something happening on the row (cancel, lease loss) WHILE the
    provider call is in flight, so the persist-time owner/liveness guard can be
    exercised.
    """

    def __init__(self, hook) -> None:
        self._hook = hook

    async def execute(self, request: AnswerEngineRequest) -> AnswerEngineResponse:
        await self._hook()
        return await super().execute(request)


@pytest.mark.asyncio
async def test_worker_discards_success_when_cancelled_mid_call(
    session_factory: async_sessionmaker[AsyncSession],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # A user cancels the audit while the provider call is in flight. The
    # in-flight worker must NOT persist success evidence for a cancelled task.
    seed, audit = await _make_audit(session_factory, prompts=1, reps=1)

    async def _cancel_mid_call() -> None:
        async with session_factory() as session:
            await cancel_audit(
                session, workspace_id=seed.workspace_id, audit_id=audit.id
            )

    monkeypatch.setattr(
        audit_worker, "build_adapter", lambda **_: _HookAdapter(_cancel_mid_call)
    )
    monkeypatch.setattr(audit_settings, "min_request_interval_seconds", 0.0)
    monkeypatch.setattr(audit_settings, "heartbeat_interval_seconds", 3600.0)

    worker = AuditWorker(session_factory=session_factory, owner="w-midcancel")
    await worker.run_until_idle()

    async with session_factory() as session:
        refreshed = await session.get(Audit, audit.id)
        assert refreshed is not None
        assert refreshed.status == AUDIT_STATUS_CANCELLED
        # The stale success was discarded: no artifact/attempt/analysis rows.
        artifacts = await session.scalar(
            select(func.count())
            .select_from(RawResponseArtifact)
            .where(RawResponseArtifact.audit_id == audit.id)
        )
        attempts = await session.scalar(
            select(func.count())
            .select_from(ProviderAttempt)
            .where(ProviderAttempt.audit_id == audit.id)
        )
        analyses = await session.scalar(
            select(func.count())
            .select_from(ResponseAnalysis)
            .where(ResponseAnalysis.audit_id == audit.id)
        )
        assert artifacts == 0
        assert attempts == 0
        assert analyses == 0
        tasks = await list_tasks(
            session, workspace_id=seed.workspace_id, audit_id=audit.id
        )
        assert {t.status for t in tasks} == {"cancelled"}
        assert all(t.result_artifact_id is None for t in tasks)


@pytest.mark.asyncio
async def test_worker_discards_success_when_lease_lost_mid_call(
    session_factory: async_sessionmaker[AsyncSession],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Worker A's lease expires mid-call and Worker B claims the task. When A
    # returns it must NOT write rows for a task it no longer owns (invariant 3/8).
    _seed, audit = await _make_audit(session_factory, prompts=1, reps=1)

    async def _steal_lease() -> None:
        async with session_factory() as session:
            task = await session.scalar(
                select(AuditTask).where(AuditTask.audit_id == audit.id)
            )
            assert task is not None
            task.lease_owner = "worker-b"  # another worker holds it now
            await session.commit()

    monkeypatch.setattr(
        audit_worker, "build_adapter", lambda **_: _HookAdapter(_steal_lease)
    )
    monkeypatch.setattr(audit_settings, "min_request_interval_seconds", 0.0)
    monkeypatch.setattr(audit_settings, "heartbeat_interval_seconds", 3600.0)

    worker = AuditWorker(session_factory=session_factory, owner="worker-a")
    await worker.run_until_idle()

    async with session_factory() as session:
        # Stale Worker A wrote nothing.
        artifacts = await session.scalar(
            select(func.count())
            .select_from(RawResponseArtifact)
            .where(RawResponseArtifact.audit_id == audit.id)
        )
        attempts = await session.scalar(
            select(func.count())
            .select_from(ProviderAttempt)
            .where(ProviderAttempt.audit_id == audit.id)
        )
        assert artifacts == 0
        assert attempts == 0
        task = await session.scalar(
            select(AuditTask).where(AuditTask.audit_id == audit.id)
        )
        assert task is not None
        # The task still belongs to Worker B, not finalized by the stale worker.
        assert task.lease_owner == "worker-b"
        assert task.status == "running"
        assert task.result_artifact_id is None


class _FlakyAdapter(_StubAdapter):
    """Fails with a retryable error ``fail_times`` times, then succeeds."""

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
        return await super().execute(request)


@pytest.mark.asyncio
async def test_worker_records_one_attempt_per_provider_call(
    session_factory: async_sessionmaker[AsyncSession],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Two retryable failures then a success -> three append-only ProviderAttempt
    # rows (invariant 3: one row per attempt), not a single collapsed row.
    _seed, audit = await _make_audit(session_factory, prompts=1, reps=1)

    adapter = _FlakyAdapter(fail_times=2)
    monkeypatch.setattr(audit_worker, "build_adapter", lambda **_: adapter)
    monkeypatch.setattr(audit_settings, "min_request_interval_seconds", 0.0)
    monkeypatch.setattr(audit_settings, "heartbeat_interval_seconds", 3600.0)
    # Zero the delay knobs so the internal retry loop is fast + deterministic.
    monkeypatch.setattr(audit_settings, "retry_base_delay_seconds", 0.0)
    monkeypatch.setattr(audit_settings, "retry_jitter_seconds", 0.0)

    worker = AuditWorker(session_factory=session_factory, owner="w-flaky")
    await worker.run_until_idle()

    async with session_factory() as session:
        task = await session.scalar(
            select(AuditTask).where(AuditTask.audit_id == audit.id)
        )
        assert task is not None
        assert task.status == "succeeded"
        assert task.attempt_count == 3

        attempts = (
            await session.scalars(
                select(ProviderAttempt)
                .where(ProviderAttempt.audit_id == audit.id)
                .order_by(ProviderAttempt.attempt_number.asc())
            )
        ).all()
        assert len(attempts) == 3
        assert [a.status for a in attempts] == [
            ATTEMPT_STATUS_FAILED,
            ATTEMPT_STATUS_FAILED,
            ATTEMPT_STATUS_SUCCEEDED,
        ]
        assert [a.attempt_number for a in attempts] == [1, 2, 3]
        # The first two carry the retryable error; the last carries the artifact.
        assert attempts[0].error_code == ERROR_RATE_LIMIT
        assert attempts[1].error_code == ERROR_RATE_LIMIT
        assert attempts[-1].artifact_id is not None

        # Exactly one immutable artifact for the single successful call.
        artifacts = await session.scalar(
            select(func.count())
            .select_from(RawResponseArtifact)
            .where(RawResponseArtifact.audit_id == audit.id)
        )
        assert artifacts == 1


_FIXTURE_SURFACE = "google_shopping"


def _probe_row(measurement: AuditTask, *, surface: str) -> AuditTask:
    """A shopping-surface probe sharing the measurement slot (5th column)."""
    return AuditTask(
        audit_id=measurement.audit_id,
        workspace_id=measurement.workspace_id,
        prompt_snapshot_id=measurement.prompt_snapshot_id,
        engine_snapshot_id=measurement.engine_snapshot_id,
        prompt_index=measurement.prompt_index,
        repetition=measurement.repetition,
        randomized_position=measurement.randomized_position,
        logical_engine=measurement.logical_engine,
        transport_provider=measurement.transport_provider,
        transport_model=measurement.transport_model,
        shopping_surface=surface,
        prompt_text=measurement.prompt_text,
        provider_route_snapshot=measurement.provider_route_snapshot,
        idempotency_key=f"{measurement.idempotency_key}{surface}",
        max_attempts=measurement.max_attempts,
    )


@pytest.mark.asyncio
async def test_probe_rows_skip_brand_analysis_and_keep_denominators(
    session_factory: async_sessionmaker[AsyncSession],
    _stub_adapter,
) -> None:
    """§7.1 isolation: probe rows never move brand metrics/counts.

    Seeds one TERMINAL probe (already succeeded — the worker must ignore it)
    and one LIVE probe (queued — the worker drains it but skips brand
    analysis). Progress denominators, the MetricSnapshot, and the
    ResponseAnalysis rows must be identical to the measurement-only baseline.
    """
    seed, audit = await _make_audit(session_factory, prompts=2, reps=1)  # 2

    async with session_factory() as session:
        measurement = await session.scalar(
            select(AuditTask)
            .where(AuditTask.audit_id == audit.id)
            .order_by(AuditTask.prompt_index)
            .limit(1)
        )
        assert measurement is not None
        assert measurement.shopping_surface == ""
        terminal_probe = _probe_row(measurement, surface=_FIXTURE_SURFACE)
        terminal_probe.status = "succeeded"
        terminal_probe.answer_text = "probe answer persisted earlier"
        terminal_probe.attempt_count = 1
        terminal_probe.completed_at = datetime.now(UTC)
        live_probe = _probe_row(measurement, surface="bing_shopping")
        session.add_all([terminal_probe, live_probe])
        await session.commit()
        terminal_probe_id = terminal_probe.id
        live_probe_id = live_probe.id

    worker = AuditWorker(session_factory=session_factory, owner="w-probes")
    await worker.run_until_idle()

    async with session_factory() as session:
        # The live probe drained through the worker: artifact + answer, but
        # NO brand score (brand analysis is measurement-only, §7.1).
        live = await session.get(AuditTask, live_probe_id)
        assert live is not None
        assert live.status == "succeeded"
        assert live.result_artifact_id is not None
        assert live.answer_text
        assert live.score is None

        # The terminal probe was never touched by the worker.
        terminal = await session.get(AuditTask, terminal_probe_id)
        assert terminal is not None
        assert terminal.status == "succeeded"
        assert terminal.result_artifact_id is None
        assert terminal.score is None

        # Brand denominators are measurement-only: identical to the baseline
        # (2 measurement tasks, both succeeded) as if no probe rows existed.
        refreshed = await session.get(Audit, audit.id)
        assert refreshed is not None
        assert refreshed.status == AUDIT_STATUS_COMPLETED
        assert refreshed.completed_count == 2
        assert refreshed.failed_count == 0

        snapshot = await session.scalar(
            select(MetricSnapshot).where(MetricSnapshot.audit_id == audit.id)
        )
        assert snapshot is not None
        assert snapshot.total_completed == 2
        assert snapshot.total_failed == 0
        assert snapshot.visibility_score == 100.0

        # Brand analyses exist only for the two measurement tasks.
        analyses = (
            await session.scalars(
                select(ResponseAnalysis.task_id).where(
                    ResponseAnalysis.audit_id == audit.id
                )
            )
        ).all()
        assert len(analyses) == 2
        assert live_probe_id not in set(analyses)
        assert terminal_probe_id not in set(analyses)

        # Executions listing still defaults to the measurement surface.
        tasks = await list_tasks(
            session, workspace_id=seed.workspace_id, audit_id=audit.id
        )
        assert len(tasks) == 2
        assert all(t.shopping_surface == "" for t in tasks)


# =========================================================================
# C4(a): the audit-finalize Opportunities recompute hook
# =========================================================================
@pytest.mark.asyncio
async def test_completed_audit_fires_opportunities_recompute_hook(
    session_factory: async_sessionmaker[AsyncSession],
    _stub_adapter,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    seed, audit = await _make_audit(session_factory, prompts=2, reps=1)
    calls: list[dict[str, object]] = []

    async def _record(session, *, workspace_id, project_id):
        calls.append({"workspace_id": workspace_id, "project_id": project_id})

    monkeypatch.setattr(audit_worker, "recompute_opportunities", _record)
    worker = AuditWorker(session_factory=session_factory, owner="w-hook")
    await worker.run_until_idle()

    async with session_factory() as session:
        refreshed = await session.get(Audit, audit.id)
        assert refreshed is not None
        assert refreshed.status == AUDIT_STATUS_COMPLETED
    # The hook fired exactly once, after terminalization, with the audit's
    # workspace/project identity.
    assert calls == [{"workspace_id": seed.workspace_id, "project_id": seed.project_id}]


@pytest.mark.asyncio
async def test_failed_audit_never_fires_opportunities_hook(
    session_factory: async_sessionmaker[AsyncSession],
    _stub_adapter,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    seed, audit = await _make_audit(session_factory, prompts=1, reps=1)

    # Deactivate the connection so every task fails terminally (0 successes
    # -> RUNNING -> FAILED, never ANALYZING).
    async with session_factory() as session:
        from app.models.provider import ProviderConnection

        conns = (
            await session.scalars(
                select(ProviderConnection).where(
                    ProviderConnection.workspace_id == seed.workspace_id
                )
            )
        ).all()
        for conn in conns:
            conn.active = False
        await session.commit()

    calls: list[dict[str, object]] = []

    async def _record(session, *, workspace_id, project_id):
        calls.append({"workspace_id": workspace_id, "project_id": project_id})

    monkeypatch.setattr(audit_worker, "recompute_opportunities", _record)
    worker = AuditWorker(session_factory=session_factory, owner="w-hook-fail")
    await worker.run_until_idle()

    async with session_factory() as session:
        refreshed = await session.get(Audit, audit.id)
        assert refreshed is not None
        assert refreshed.status == "failed"
    assert calls == []


@pytest.mark.asyncio
async def test_opportunities_hook_failure_never_blocks_terminalization(
    session_factory: async_sessionmaker[AsyncSession],
    _stub_adapter,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _seed, audit = await _make_audit(session_factory, prompts=1, reps=1)

    async def _boom(session, *, workspace_id, project_id):
        raise RuntimeError("recompute exploded")

    monkeypatch.setattr(audit_worker, "recompute_opportunities", _boom)
    worker = AuditWorker(session_factory=session_factory, owner="w-hook-boom")
    # Best-effort: the raise is logged + swallowed; the audit still
    # terminalizes.
    await worker.run_until_idle()

    async with session_factory() as session:
        refreshed = await session.get(Audit, audit.id)
        assert refreshed is not None
        assert refreshed.status == AUDIT_STATUS_COMPLETED


@pytest.mark.asyncio
async def test_worker_persists_canonical_and_raw_finish_reasons(
    session_factory: async_sessionmaker[AsyncSession],
    _stub_adapter,
) -> None:
    """The canonical finish reason lands on BOTH the task and the artifact.

    Gates read only the canonical enum value; the provider's own spelling is
    kept alongside it for debugging and stays nullable so an absent value is
    never invented.
    """
    _seed, audit = await _make_audit(session_factory, prompts=1, reps=1)
    worker = AuditWorker(session_factory=session_factory, owner="w-finish")

    await worker.run_until_idle()

    async with session_factory() as session:
        task = await session.scalar(
            select(AuditTask).where(AuditTask.audit_id == audit.id)
        )
        assert task is not None
        assert task.status == ATTEMPT_STATUS_SUCCEEDED
        assert task.finish_reason == FinishReason.STOP
        assert task.raw_finish_reason == "end_turn"

        artifact = await session.get(RawResponseArtifact, task.result_artifact_id)
        assert artifact is not None
        assert artifact.finish_reason == FinishReason.STOP
        assert artifact.raw_finish_reason == "end_turn"
        # The artifact persists the TYPED usage contract (unknown counters stay
        # absent/null, never a fabricated zero).
        assert artifact.usage["uncached_input_tokens"] == 10
        assert artifact.usage["output_tokens"] == 20
        assert artifact.usage["total_tokens"] == 30
        assert artifact.usage["cached_input_tokens"] is None
        assert artifact.usage["reasoning_tokens"] is None
        assert artifact.usage["provider_cost_microusd"] is None


@pytest.mark.asyncio
async def test_request_snapshot_records_the_frozen_policy_and_no_secret(
    session_factory: async_sessionmaker[AsyncSession],
    _stub_adapter,
) -> None:
    """The snapshot reproduces the call from the FROZEN policy (invariants 6, 9).

    Every field the adapter was driven by is recorded, and the BYOK key (and the
    brand/competitor list) never reaches a snapshot.
    """
    _seed, audit = await _make_audit(
        session_factory, prompts=1, reps=1, measurement_mode=MEASUREMENT_MODE_PULSE
    )
    worker = AuditWorker(session_factory=session_factory, owner="w-snapshot")

    await worker.run_until_idle()

    async with session_factory() as session:
        refreshed = await session.get(Audit, audit.id)
        assert refreshed is not None
        frozen = refreshed.configuration[MEASUREMENT_POLICY_KEY]
        task = await session.scalar(
            select(AuditTask).where(AuditTask.audit_id == audit.id)
        )
        assert task is not None

    snapshot = task.request_snapshot
    assert snapshot["measurement_mode"] == MEASUREMENT_MODE_PULSE
    assert snapshot["stateless"] is True
    # Driven by the frozen block, NOT by whatever the live settings say now.
    assert snapshot["retrieval_enabled"] == frozen["retrieval_enabled"]
    assert snapshot["max_output_tokens"] == frozen["max_output_tokens"]
    assert snapshot["timeout_seconds"] == frozen["timeout_seconds"]
    assert snapshot["answer_instruction"] == frozen["answer_instruction"]
    assert snapshot["answer_instruction"] == PULSE_ANSWER_INSTRUCTION
    assert snapshot["reasoning_effort"] == (
        route_policy(task.logical_engine, task.transport_provider).reasoning_effort
    )
    # Invariant 6: no credential, in any field, at any depth.
    assert "api_key" not in snapshot
    assert "secret-test-key" not in str(snapshot)


@pytest.mark.asyncio
async def test_frozen_policy_survives_a_live_settings_change(
    session_factory: async_sessionmaker[AsyncSession],
    _stub_adapter,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A settings change after planning never leaks into a running audit.

    Invariant 9: the worker executes the policy frozen at plan time, so the
    snapshot keeps the planned cap/timeout even though the live values moved.
    """
    _seed, audit = await _make_audit(
        session_factory, prompts=1, reps=1, measurement_mode=MEASUREMENT_MODE_PULSE
    )
    planned_cap = audit_settings.pulse_max_output_tokens
    planned_timeout = audit_settings.pulse_timeout_seconds
    monkeypatch.setattr(audit_settings, "pulse_max_output_tokens", 1)
    monkeypatch.setattr(audit_settings, "pulse_timeout_seconds", 999.0)

    worker = AuditWorker(session_factory=session_factory, owner="w-frozen")
    await worker.run_until_idle()

    async with session_factory() as session:
        task = await session.scalar(
            select(AuditTask).where(AuditTask.audit_id == audit.id)
        )
        assert task is not None
    assert task.request_snapshot["max_output_tokens"] == planned_cap
    assert task.request_snapshot["timeout_seconds"] == planned_timeout
