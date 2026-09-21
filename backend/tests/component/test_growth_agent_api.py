from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import httpx
import pytest
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.connectors.agent.gateway import FakeModelGateway
from app.core.config.entitlements import KEY_AI_CREDITS
from app.domain.agent import service as agent_service
from app.domain.agent import tool_attempts
from app.domain.agent.model_attempts import reconcile_stale_cancelled_model_attempts
from app.domain.agent.service import (
    _public_result,
    cancel_task,
    claim_task,
    execute_claimed_task,
    renew_lease,
)
from app.domain.entitlements.ledger import consumable_usage
from app.domain.entitlements.metered import MeteredSubject, reserve_metered_usage
from app.domain.entitlements.types import GrantSpec
from app.models.agent import AgentModelAttempt, AgentTaskRun, AgentToolAttempt
from tests.component.occupancy_helpers import seed_occupancy_grants


async def _register(client: httpx.AsyncClient, email: str) -> None:
    from tests.component.auth_helpers import grant_test_capabilities, register_and_login

    await register_and_login(client, email)
    await grant_test_capabilities(email)


async def _project(client: httpx.AsyncClient, name: str = "Agent Project") -> str:
    response = await client.post(
        "/api/v1/projects",
        json={
            "name": name,
            "brand_name": name,
            "website_url": f"https://{name.casefold().replace(' ', '-')}.example",
            "industry": "Education",
            "country_code": "IN",
            "language_code": "en-IN",
            "benchmark_mode": "consumer_like",
            "default_repetitions": 1,
        },
    )
    assert response.status_code == 201
    return response.json()["id"]


def test_partial_persisted_result_is_normalized_to_the_typed_contract() -> None:
    result = _public_result({"summary": "Earlier summary", "limitations": ["Partial"]})

    assert result is not None
    assert result["summary"] == "Earlier summary"
    assert result["observations"] == []
    assert result["roadmap_items"] == []
    assert result["limitations"] == ["Partial"]
    assert set(result) == {
        "summary",
        "observations",
        "roadmap_items",
        "sources",
        "limitations",
        "artifact_refs",
    }


@pytest.mark.asyncio
async def test_free_account_cannot_submit_agent_work(client: httpx.AsyncClient) -> None:
    email = "free-agent@example.com"
    response = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "password123"},
    )
    assert response.status_code == 202
    login = await client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": "password123"},
    )
    assert login.status_code == 200
    project_id = await _project(client)

    denied = await client.post(
        "/api/v1/agent/tasks",
        json={
            "project_id": project_id,
            "task_type": "explain",
            "objective": "Explain the current evidence.",
        },
        headers={"Idempotency-Key": "free-agent-denied"},
    )

    assert denied.status_code == 403
    assert denied.json()["error"]["code"] == "capability_not_granted"


@pytest.mark.asyncio
async def test_task_is_queued_and_replayed_idempotently(
    client: httpx.AsyncClient,
) -> None:
    await _register(client, "bounded-agent@example.com")
    project_id = await _project(client)
    body = {
        "project_id": project_id,
        "task_type": "build_roadmap",
        "objective": "Build a roadmap from current persisted evidence.",
    }
    first = await client.post(
        "/api/v1/agent/tasks", json=body, headers={"Idempotency-Key": "roadmap-1"}
    )
    assert first.status_code == 201, first.text
    assert first.json()["status"] == "queued"
    assert first.json()["result"] is None
    assert "attempts" not in first.json()
    replay = await client.post(
        "/api/v1/agent/tasks", json=body, headers={"Idempotency-Key": "roadmap-1"}
    )
    assert replay.status_code == 201
    assert replay.json()["id"] == first.json()["id"]


@pytest.mark.asyncio
async def test_only_fixed_tasks_and_minimal_contract_are_accepted(
    client: httpx.AsyncClient,
) -> None:
    await _register(client, "bounded-contract@example.com")
    project_id = await _project(client)
    removed_task = await client.post(
        "/api/v1/agent/tasks",
        json={
            "project_id": project_id,
            "task_type": "generate_draft",
            "objective": "Generate content",
        },
        headers={"Idempotency-Key": "removed"},
    )
    assert removed_task.status_code == 422
    extra_field = await client.post(
        "/api/v1/agent/tasks",
        json={
            "project_id": project_id,
            "task_type": "explain",
            "objective": "Explain evidence",
            "conversation_id": str(uuid.uuid4()),
        },
        headers={"Idempotency-Key": "extra"},
    )
    assert extra_field.status_code == 422
    assert (await client.get("/api/v1/agent/capabilities")).status_code == 404
    assert (await client.get("/api/v1/agent/conversations")).status_code == 404


@pytest.mark.asyncio
async def test_unsupported_persisted_task_is_hidden_from_public_reads(
    client: httpx.AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    await _register(client, "agent-legacy-task@example.com")
    project_id = await _project(client)
    created = await client.post(
        "/api/v1/agent/tasks",
        json={
            "project_id": project_id,
            "task_type": "explain",
            "objective": "Legacy task",
        },
        headers={"Idempotency-Key": "legacy-task"},
    )
    run_id = created.json()["id"]
    async with session_factory() as session:
        await session.execute(
            update(AgentTaskRun)
            .where(AgentTaskRun.id == uuid.UUID(run_id))
            .values(task_type="create_brief")
        )
        await session.commit()

    history = await client.get("/api/v1/agent/tasks", params={"project_id": project_id})
    detail = await client.get(
        f"/api/v1/agent/tasks/{run_id}", params={"project_id": project_id}
    )

    assert history.status_code == 200
    assert history.json() == []
    assert detail.status_code == 404


@pytest.mark.asyncio
async def test_cancel_and_workspace_isolation(client: httpx.AsyncClient) -> None:
    await _register(client, "agent-owner@example.com")
    project_id = await _project(client)
    created = await client.post(
        "/api/v1/agent/tasks",
        json={
            "project_id": project_id,
            "task_type": "explain",
            "objective": "Explain persisted evidence.",
        },
        headers={"Idempotency-Key": "cancel-1"},
    )
    run_id = created.json()["id"]
    cancelled = await client.post(
        f"/api/v1/agent/tasks/{run_id}/cancel", params={"project_id": project_id}
    )
    assert cancelled.status_code == 200
    assert cancelled.json()["status"] == "cancelled"

    owner_cookies = dict(client.cookies)
    client.cookies.clear()
    await _register(client, "agent-outsider@example.com")
    outsider_project = await _project(client, "Outsider")
    client.cookies.clear()
    client.cookies.update(owner_cookies)
    response = await client.get(
        "/api/v1/agent/tasks", params={"project_id": outsider_project}
    )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_worker_persists_canonical_attempts_and_minimal_result(
    client: httpx.AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    await _register(client, "agent-worker@example.com")
    project_id = await _project(client)
    created = await client.post(
        "/api/v1/agent/tasks",
        json={
            "project_id": project_id,
            "task_type": "explain",
            "objective": "Explain the latest persisted evidence.",
        },
        headers={"Idempotency-Key": "worker-1"},
    )
    run_id = created.json()["id"]
    gateway = FakeModelGateway(
        '{"summary":"No persisted evidence is available yet.",'
        '"observations":["Site Health has not produced a snapshot."],'
        '"limitations":[]}'
    )
    async with session_factory() as session:
        claimed = await claim_task(session, owner="test-worker", lease_seconds=60)
        assert claimed is not None
        assert str(claimed.id) == run_id
        await execute_claimed_task(
            session, run=claimed, owner="test-worker", gateway=gateway
        )

    detail = await client.get(
        f"/api/v1/agent/tasks/{run_id}", params={"project_id": project_id}
    )
    assert detail.status_code == 200
    payload = detail.json()
    assert payload["status"] == "completed"
    assert gateway.calls == []
    assert payload["result"]["summary"]
    async with session_factory() as session:
        attempt = await session.scalar(
            select(AgentModelAttempt).where(
                AgentModelAttempt.task_run_id == uuid.UUID(run_id)
            )
        )
    assert attempt is None


@pytest.mark.asyncio
async def test_live_heartbeat_blocks_reclaim_and_expired_dispatch_is_recovered(
    client: httpx.AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    await _register(client, "agent-lease-recovery@example.com")
    project_id = await _project(client)
    created = await client.post(
        "/api/v1/agent/tasks",
        json={
            "project_id": project_id,
            "task_type": "explain",
            "objective": "Explain persisted evidence.",
        },
        headers={"Idempotency-Key": "lease-recovery"},
    )
    assert created.status_code == 201
    run_id = uuid.UUID(created.json()["id"])

    async with session_factory() as session:
        claimed = await claim_task(session, owner="worker-a", lease_seconds=1)
        assert claimed is not None
        assert claimed.id == run_id
        assert await renew_lease(session, run_id=run_id, owner="worker-a")
    async with session_factory() as session:
        assert await claim_task(session, owner="worker-b", lease_seconds=60) is None

    now = datetime.now(UTC)
    async with session_factory() as session:
        run = await session.get(AgentTaskRun, run_id)
        assert run is not None
        session.add(
            AgentModelAttempt(
                workspace_id=run.workspace_id,
                project_id=run.project_id,
                task_run_id=run_id,
                dispatch_id=uuid.uuid4(),
                run_attempt=1,
                ordinal=1,
                funding_source="customer_byok",
                provider_adapter="fake",
                endpoint_host="example.test",
                requested_model="fake-model",
                request_hash="0" * 64,
                dispatched_at=now,
                deadline_at=now + timedelta(seconds=60),
            )
        )
        await session.execute(
            update(AgentTaskRun)
            .where(AgentTaskRun.id == run_id)
            .values(lease_expires_at=now - timedelta(seconds=1))
        )
        await session.commit()
    async with session_factory() as session:
        successor = await claim_task(session, owner="worker-b", lease_seconds=60)
        assert successor is not None
        assert successor.attempt_count == 2
        attempt = await session.scalar(
            select(AgentModelAttempt).where(AgentModelAttempt.task_run_id == run_id)
        )
        assert attempt is not None
        assert (attempt.outcome, attempt.settlement_status) == (
            "recovered_unknown",
            "zero_debit",
        )


@pytest.mark.asyncio
async def test_late_tool_result_cannot_write_after_lease_takeover(
    client: httpx.AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    await _register(client, "agent-late-tool@example.com")
    project_id = await _project(client)
    created = await client.post(
        "/api/v1/agent/tasks",
        json={
            "project_id": project_id,
            "task_type": "explain",
            "objective": "Explain persisted evidence.",
        },
        headers={"Idempotency-Key": "late-tool"},
    )
    assert created.status_code == 201
    run_id = uuid.UUID(created.json()["id"])

    async def tool_after_takeover(*_args, **_kwargs):
        async with session_factory() as successor_session:
            await successor_session.execute(
                update(AgentTaskRun)
                .where(AgentTaskRun.id == run_id)
                .values(lease_expires_at=datetime.now(UTC) - timedelta(seconds=1))
            )
            await successor_session.commit()
            successor = await claim_task(
                successor_session, owner="worker-b", lease_seconds=60
            )
            assert successor is not None
            assert successor.id == run_id
        return {"state": "unavailable"}

    monkeypatch.setattr(agent_service, "execute_tool", tool_after_takeover)
    async with session_factory() as session:
        claimed = await claim_task(session, owner="worker-a", lease_seconds=60)
        assert claimed is not None
        await execute_claimed_task(session, run=claimed, owner="worker-a", gateway=None)
    async with session_factory() as session:
        tool_attempts = list(
            (
                await session.scalars(
                    select(AgentToolAttempt).where(
                        AgentToolAttempt.task_run_id == run_id
                    )
                )
            ).all()
        )
    assert tool_attempts == []


@pytest.mark.asyncio
async def test_failed_tool_restarts_transaction_before_lease_fence(
    client: httpx.AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    await _register(client, "agent-failed-tool@example.com")
    project_id = await _project(client)
    created = await client.post(
        "/api/v1/agent/tasks",
        json={
            "project_id": project_id,
            "task_type": "explain",
            "objective": "Explain persisted evidence.",
        },
        headers={"Idempotency-Key": "failed-tool"},
    )
    assert created.status_code == 201
    run_id = uuid.UUID(created.json()["id"])
    original_lock = tool_attempts.lock_owned_lease

    async def lock_after_rollback(session, **kwargs):
        assert not session.in_transaction()
        return await original_lock(session, **kwargs)

    monkeypatch.setattr(tool_attempts, "lock_owned_lease", lock_after_rollback)
    async with session_factory() as session:
        claimed = await claim_task(
            session, owner="failed-tool-worker", lease_seconds=60
        )
        assert claimed is not None

        async def failing_tool(*_args, **_kwargs):
            await session.scalar(
                select(AgentTaskRun.id).where(AgentTaskRun.id == run_id)
            )
            raise RuntimeError("evidence read failed")

        monkeypatch.setattr(agent_service, "execute_tool", failing_tool)
        await execute_claimed_task(
            session, run=claimed, owner="failed-tool-worker", gateway=None
        )
    async with session_factory() as session:
        attempts = list(
            (
                await session.scalars(
                    select(AgentToolAttempt).where(
                        AgentToolAttempt.task_run_id == run_id
                    )
                )
            ).all()
        )
    assert len(attempts) == 1
    assert attempts[0].status == "failed"


@pytest.mark.asyncio
@pytest.mark.parametrize("cancelled", [False, True])
async def test_expired_agent_dispatch_settles_platform_hold_before_reclaim(
    client: httpx.AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    monkeypatch: pytest.MonkeyPatch,
    cancelled: bool,
) -> None:
    from types import SimpleNamespace

    await _register(client, "agent-funded-recovery@example.com")
    project_id = await _project(client)
    created = await client.post(
        "/api/v1/agent/tasks",
        json={
            "project_id": project_id,
            "task_type": "explain",
            "objective": "Explain persisted evidence.",
        },
        headers={"Idempotency-Key": "funded-recovery"},
    )
    run_id = uuid.UUID(created.json()["id"])
    now = datetime.now(UTC)
    async with session_factory() as session:
        claimed = await claim_task(session, owner="worker-a", lease_seconds=60)
        assert claimed is not None
        assert claimed.id == run_id
        account = await seed_occupancy_grants(
            session,
            workspace_id=claimed.workspace_id,
            grants=(GrantSpec(key=KEY_AI_CREDITS, value=100),),
        )
        reservation = await reserve_metered_usage(
            session,
            account_id=account.id,
            capability_key=KEY_AI_CREDITS,
            subject=MeteredSubject(
                kind="agent", subject_id=run_id, workspace_id=claimed.workspace_id
            ),
            hold_units=10,
            idempotency_key=f"agent:{run_id}:hold:test",
            at=now,
        )
        session.add(
            AgentModelAttempt(
                workspace_id=claimed.workspace_id,
                project_id=claimed.project_id,
                task_run_id=run_id,
                dispatch_id=uuid.uuid4(),
                run_attempt=1,
                ordinal=1,
                funding_source="platform",
                provider_adapter="fake",
                endpoint_host="example.test",
                requested_model="fake-model",
                pricing_revision="test-policy",
                reservation_id=reservation.reservation_id,
                reserved_credits=10,
                request_hash="0" * 64,
                dispatched_at=now,
                deadline_at=now + timedelta(seconds=60),
                settlement_status="pending",
            )
        )
        if cancelled:
            await session.commit()
            await cancel_task(
                session,
                workspace_id=claimed.workspace_id,
                project_id=claimed.project_id,
                run_id=run_id,
            )
            await session.execute(
                update(AgentModelAttempt)
                .where(AgentModelAttempt.task_run_id == run_id)
                .values(deadline_at=now - timedelta(minutes=5))
            )
        else:
            await session.execute(
                update(AgentTaskRun)
                .where(AgentTaskRun.id == run_id)
                .values(lease_expires_at=now - timedelta(seconds=1))
            )
        await session.commit()
        account_id = account.id

    async def policy_for_revision(*_args):
        return SimpleNamespace(
            rate=lambda **_kwargs: SimpleNamespace(
                charge=lambda _usage: None, unknown_usage_charge=3
            )
        )

    monkeypatch.setattr(
        "app.domain.agent.model_attempts.ai_credit_policy_for_revision",
        policy_for_revision,
    )
    async with session_factory() as session:
        if cancelled:
            await reconcile_stale_cancelled_model_attempts(session_factory)
        else:
            successor = await claim_task(session, owner="worker-b", lease_seconds=60)
            assert successor is not None
            assert successor.attempt_count == 2
        attempt = await session.scalar(
            select(AgentModelAttempt).where(AgentModelAttempt.task_run_id == run_id)
        )
        usage = await consumable_usage(
            session,
            account_id=account_id,
            capability_key=KEY_AI_CREDITS,
            at=datetime.now(UTC),
        )
    assert attempt is not None
    assert (attempt.outcome, attempt.settlement_status) == (
        "recovered_unknown",
        "settled",
    )
    assert (usage.reserved, usage.debited) == (0, 3)


@pytest.mark.asyncio
async def test_task_list_is_compact_while_detail_keeps_result_and_provenance(
    client: httpx.AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """History remains cheap and internal evidence is selected-detail only."""
    await _register(client, "agent-list-detail@example.com")
    project_id = await _project(client)
    created = await client.post(
        "/api/v1/agent/tasks",
        json={
            "project_id": project_id,
            "task_type": "explain",
            "objective": "Explain the latest persisted evidence.",
        },
        headers={"Idempotency-Key": "list-detail-1"},
    )
    run_id = created.json()["id"]
    async with session_factory() as session:
        claimed = await claim_task(
            session, owner="list-detail-worker", lease_seconds=60
        )
        assert claimed is not None
        await execute_claimed_task(
            session, run=claimed, owner="list-detail-worker", gateway=None
        )

    history = await client.get("/api/v1/agent/tasks", params={"project_id": project_id})
    assert history.status_code == 200
    listed = history.json()[0]
    assert listed["id"] == run_id
    assert "result" not in listed
    assert "attempts" not in listed

    detail = await client.get(
        f"/api/v1/agent/tasks/{run_id}", params={"project_id": project_id}
    )
    assert detail.status_code == 200
    assert detail.json()["result"]["summary"]
    assert "attempts" not in detail.json()
