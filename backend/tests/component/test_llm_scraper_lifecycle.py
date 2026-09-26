"""Paid consumer tasks use the durable audit lifecycle and ordinary analysis."""

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import func, select

import app.workers.audit.search_surface as lifecycle
from app.core.config.dataforseo import dataforseo_settings
from app.models.analysis import ResponseAnalysis
from app.models.audit import AuditTask, ExecutionCostProjection, RawResponseArtifact
from app.models.provider import ProviderConnection
from app.models.search_surfaces import AioObservation
from tests.component.test_search_surface_lifecycle import (
    _RecordingAdapter,
    _seed_search_task,
    _task,
    _worker,
)


async def seed(session_factory, engine="chatgpt_search"):
    audit_id, task_id, connection_id = await _seed_search_task(session_factory)
    async with session_factory() as session:
        task = await session.get(AuditTask, task_id)
        task.logical_engine = engine
        task.transport_model = (
            "chat_gpt-llm-scraper"
            if engine == "chatgpt_search"
            else "gemini-llm-scraper"
        )
        task.request_snapshot = {
            "location_code": 2840,
            "language_code": "en",
            "device": "desktop",
        }
        await session.commit()
    return audit_id, task_id, connection_id


async def step(session_factory, audit_id, task_id):
    async with session_factory() as session:
        task = await session.get(AuditTask, task_id)
        task.available_at = datetime.now(UTC) - timedelta(seconds=1)
        await session.commit()
    worker = _worker(session_factory)
    claimed = await worker._queue.claim(owner=worker.owner)
    assert [task.id for task in claimed] == [task_id]
    await worker._run_search_surface(task_id, audit_id)


def response(page=None, status=20000):
    return {
        "status_code": 20000,
        "tasks": [
            {
                "id": "provider-task-1",
                "status_code": status,
                "cost": 0,
                "result": [
                    page or {"markdown": "Acme makes uniforms.", "fan_out_queries": []}
                ],
            }
        ],
    }


@pytest.mark.asyncio
@pytest.mark.parametrize("engine", ["chatgpt_search", "gemini_consumer"])
async def test_restart_pending_and_idempotent_finalization(
    session_factory, monkeypatch, engine
):
    stub = _RecordingAdapter(
        fetch_payloads=[response(status=40602), response(), response()]
    )
    monkeypatch.setattr(lifecycle, "DataForSeoSearchSurfaceAdapter", lambda **_: stub)
    audit_id, task_id, _ = await seed(session_factory, engine)
    for _ in range(3):
        await step(session_factory, audit_id, task_id)
    task = await _task(session_factory, task_id)
    assert task.status == "succeeded"
    assert task.provider_metadata["fanout_availability"] == "no_exposed_queries"
    # Simulate a crash after artifact commit and before queue success.
    async with session_factory() as session:
        task = await session.get(AuditTask, task_id)
        task.status = "awaiting_provider_result"
        task.completed_at = None
        await session.commit()
    await step(session_factory, audit_id, task_id)
    async with session_factory() as session:
        assert (
            await session.scalar(select(func.count()).select_from(AioObservation)) == 0
        )
        assert (
            await session.scalar(select(func.count()).select_from(ResponseAnalysis))
            == 1
        )
        assert (
            await session.scalar(select(func.count()).select_from(RawResponseArtifact))
            == 1
        )
        costs = (await session.scalars(select(ExecutionCostProjection))).all()
        assert len(costs) == 1
        assert costs[0].provider_reported_cost_microusd == 1200
    assert stub.submits == 1


@pytest.mark.asyncio
@pytest.mark.parametrize("phase", ["poll", "reconcile"])
async def test_absolute_deadline_releases_lease_and_retains_charge(
    session_factory, monkeypatch, phase
):
    stub = _RecordingAdapter()
    monkeypatch.setattr(lifecycle, "DataForSeoSearchSurfaceAdapter", lambda **_: stub)
    audit_id, task_id, _ = await seed(session_factory)
    await step(session_factory, audit_id, task_id)
    async with session_factory() as session:
        task = await session.get(AuditTask, task_id)
        task.provider_task_submitted_at = datetime.now(UTC) - timedelta(
            hours=dataforseo_settings.recovery_deadline_hours + 1
        )
        if phase == "reconcile":
            task.provider_task_id = ""
        await session.commit()
    await step(session_factory, audit_id, task_id)
    task = await _task(session_factory, task_id)
    assert task.status == "failed"
    assert task.error_code == "submission_unreconciled"
    assert task.lease_owner is None
    assert task.provider_metadata["provider_submission_cost_microusd"] == 1200
    assert stub.submits == 1 and stub.fetches == 0 and stub.lists == 0
    async with session_factory() as session:
        assert (
            await session.scalar(select(func.count()).select_from(ResponseAnalysis))
            == 0
        )
        cost = await session.scalar(select(ExecutionCostProjection))
        assert cost.provider_reported_cost_microusd == 1200


@pytest.mark.asyncio
async def test_rotated_credential_does_not_poll_another_account(
    session_factory, monkeypatch
):
    stub = _RecordingAdapter()
    monkeypatch.setattr(lifecycle, "DataForSeoSearchSurfaceAdapter", lambda **_: stub)
    audit_id, task_id, connection_id = await seed(session_factory)
    await step(session_factory, audit_id, task_id)
    async with session_factory() as session:
        connection = await session.get(ProviderConnection, connection_id)
        connection.credential_revision = uuid.uuid4()
        await session.commit()
    await step(session_factory, audit_id, task_id)
    task = await _task(session_factory, task_id)
    assert task.status == "failed"
    assert stub.fetches == 0


@pytest.mark.asyncio
async def test_accepted_without_id_keeps_reported_charge_through_deadline(
    session_factory, monkeypatch
):
    from app.connectors.search_surfaces.contracts import SearchSurfaceSubmission
    from app.connectors.search_surfaces.dataforseo import UncertainSubmission

    submission = SearchSurfaceSubmission(
        provider_task_id="",
        submitted_at=datetime.now(UTC),
        provider_cost_microusd=4000,
        raw_payload={"cost": 0.004},
    )
    stub = _RecordingAdapter(submit_error=UncertainSubmission(submission))
    monkeypatch.setattr(lifecycle, "DataForSeoSearchSurfaceAdapter", lambda **_: stub)
    audit_id, task_id, _ = await seed(session_factory)
    await step(session_factory, audit_id, task_id)
    async with session_factory() as session:
        task = await session.get(AuditTask, task_id)
        assert task.status == "submission_uncertain"
        task.provider_task_submitted_at = datetime.now(UTC) - timedelta(hours=73)
        await session.commit()
    await step(session_factory, audit_id, task_id)
    async with session_factory() as session:
        cost = await session.scalar(select(ExecutionCostProjection))
        artifact = await session.scalar(select(RawResponseArtifact))
        assert cost.provider_reported_cost_microusd == 4000
        assert artifact.provider_metadata["provider_submission_payload"] == {
            "cost": 0.004
        }
    assert stub.submits == 1 and stub.fetches == 0


@pytest.mark.asyncio
async def test_recovery_pacing_shared_across_connections_and_isolated_from_other_calls(
    session_factory,
):
    from types import SimpleNamespace

    from app.orchestration.provider_capacity import (
        CapacityOutcome,
        acquire_provider_capacity,
        release_provider_capacity,
    )
    from app.workers.audit_worker_support import capacity_request

    requests = []
    for engine in ("chatgpt_search", "gemini_consumer"):
        _, task_id, connection_id = await seed(session_factory, engine)
        async with session_factory() as session:
            connection = await session.get(ProviderConnection, connection_id)
            context = SimpleNamespace(
                task_id=task_id,
                connection_id=connection_id,
                funding=None,
                attempt_number=1,
                logical_engine=engine,
                transport_provider="dataforseo",
                api_key_encrypted=connection.api_key_encrypted,
            )
        requests.append(capacity_request(context, scraper_reconciliation=True))
    now = datetime.now(UTC)
    first = await acquire_provider_capacity(
        session_factory, request=requests[0], at=now
    )
    assert first.acquired
    await release_provider_capacity(
        session_factory,
        request=requests[0],
        outcome=CapacityOutcome(kind="succeeded"),
        at=now,
    )
    ordinary = capacity_request(context)
    assert (
        await acquire_provider_capacity(session_factory, request=ordinary, at=now)
    ).acquired
    await release_provider_capacity(
        session_factory,
        request=ordinary,
        outcome=CapacityOutcome(kind="succeeded"),
        at=now,
    )
    second = await acquire_provider_capacity(
        session_factory, request=requests[1], at=now + timedelta(seconds=1)
    )
    assert not second.acquired
    assert second.available_at > now + timedelta(seconds=6)


@pytest.mark.asyncio
async def test_paid_scraper_recovers_past_run_deadline_using_frozen_recovery_window(
    session_factory, monkeypatch
):
    from app.models.audit import Audit

    stub = _RecordingAdapter(fetch_payloads=[response()])
    monkeypatch.setattr(lifecycle, "DataForSeoSearchSurfaceAdapter", lambda **_: stub)
    audit_id, task_id, _ = await seed(session_factory)
    await step(session_factory, audit_id, task_id)
    async with session_factory() as session:
        task = await session.get(AuditTask, task_id)
        task.request_snapshot = {**task.request_snapshot, "recovery_deadline_hours": 24}
        task.provider_task_submitted_at = datetime.now(UTC) - timedelta(hours=1)
        task.available_at = datetime.now(UTC) - timedelta(seconds=1)
        audit = await session.get(Audit, audit_id)
        audit.started_at = datetime.now(UTC) - timedelta(hours=2)
        audit.configuration = {**audit.configuration, "max_run_seconds": 30}
        await session.commit()
    monkeypatch.setattr(dataforseo_settings, "recovery_deadline_hours", 0.1)
    worker = _worker(session_factory)
    claimed = await worker._queue.claim(owner=worker.owner)
    await worker._execute_task(claimed[0])
    task = await _task(session_factory, task_id)
    assert task.status == "succeeded"
    assert stub.submits == 1 and stub.fetches == 1


@pytest.mark.asyncio
@pytest.mark.parametrize("ambiguous", [False, True])
async def test_timeout_reconciles_exact_tag_and_product_without_resubmission(
    session_factory, monkeypatch, ambiguous
):
    from app.connectors.answer_engines.errors import ProviderError

    stub = _RecordingAdapter(
        submit_error=ProviderError("timeout", error_code="timeout", retryable=True)
    )
    monkeypatch.setattr(lifecycle, "DataForSeoSearchSurfaceAdapter", lambda **_: stub)
    audit_id, task_id, _ = await seed(session_factory)
    await step(session_factory, audit_id, task_id)
    task = await _task(session_factory, task_id)
    metadata = {
        "tag": task.provider_submission_ref,
        "api": "ai_optimization",
        "se": "chat_gpt",
        "function": "llm_scraper",
    }
    rows = [
        {"id": "paid", "cost": 0.004, "metadata": metadata},
        {"id": "wrong-product", "metadata": {**metadata, "se": "gemini"}},
    ]
    if ambiguous:
        rows.append({"id": "duplicate", "metadata": metadata})
    stub._listing = {
        "status_code": 20000,
        "tasks": [{"status_code": 20000, "result": rows}],
    }
    await step(session_factory, audit_id, task_id)
    task = await _task(session_factory, task_id)
    assert stub.submits == 1
    if ambiguous:
        assert task.status == "failed"
        assert not task.provider_task_id
    else:
        assert task.status == "awaiting_provider_result"
        assert task.provider_task_id == "paid"
        assert task.provider_metadata["provider_submission_cost_microusd"] == 4000


@pytest.mark.asyncio
@pytest.mark.parametrize("lost", ["lease", "cancel"])
async def test_lost_ownership_does_not_publish_an_answer(
    session_factory, monkeypatch, lost
):
    from app.models.audit import Audit

    audit_id, task_id, _ = await seed(session_factory)

    class Interrupted(_RecordingAdapter):
        async def fetch(self, provider_task_id):
            async with session_factory() as session:
                if lost == "lease":
                    task = await session.get(AuditTask, task_id)
                    task.lease_owner = "another-worker"
                else:
                    audit = await session.get(Audit, audit_id)
                    audit.status = "cancelled"
                await session.commit()
            return response()

    stub = Interrupted()
    monkeypatch.setattr(lifecycle, "DataForSeoSearchSurfaceAdapter", lambda **_: stub)
    await step(session_factory, audit_id, task_id)
    await step(session_factory, audit_id, task_id)
    async with session_factory() as session:
        assert (
            await session.scalar(select(func.count()).select_from(ResponseAnalysis))
            == 0
        )
        assert (
            await session.scalar(select(func.count()).select_from(RawResponseArtifact))
            == 0
        )
