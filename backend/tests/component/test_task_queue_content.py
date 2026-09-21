"""Content queue rows through the generic PostgresTaskQueue.

Proves the ONE generic queue — parameterized by ``CONTENT_QUEUE_SPEC`` —
claims/heartbeats/retries/fails/cancels ``ContentGeneration`` rows with the
same ``FOR UPDATE SKIP LOCKED`` semantics, and that the composite
``(workspace_id, idempotency_key)`` constraint allows the same key across
workspaces while rejecting a duplicate within one. Requires a real Postgres.
"""

from __future__ import annotations

import asyncio
import uuid
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

import pytest
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.connectors.discovery_models.contracts import DiscoveryResponse
from app.core.config.content import CONTENT_QUEUE_SPEC
from app.core.config.entitlements import KEY_AI_CREDITS
from app.core.config.task_queue import (
    TASK_CLAIMABLE_STATUSES,
    TASK_STATUS_CANCELLED,
    TASK_STATUS_FAILED,
    TASK_STATUS_LEASED,
    TASK_STATUS_RETRY_WAIT,
    TASK_STATUS_RUNNING,
)
from app.domain.billing.catalog_revisions import CatalogUnavailableError
from app.domain.content.reconciliation import (
    content_reclaim_accounting,
    reconcile_stale_cancelled_dispatches,
)
from app.domain.content.service import cancel_generation
from app.domain.entitlements.ledger import consumable_usage
from app.domain.entitlements.metered import (
    MeteredSubject,
    reserve_metered_usage,
)
from app.domain.entitlements.types import GrantSpec
from app.models.billing import ConsumableLedger
from app.models.content import ContentGeneration, ContentGenerationAttempt
from app.models.project import Project
from app.models.workspace import Workspace
from app.orchestration.postgres_task_queue import PostgresTaskQueue
from app.workers.content_worker import AttemptOutcome, ContentWorker
from tests.component.occupancy_helpers import seed_occupancy_grants


async def _seed_workspace_project(
    session: AsyncSession,
) -> tuple[uuid.UUID, uuid.UUID]:
    workspace = Workspace(name="Content WS")
    session.add(workspace)
    await session.flush()
    project = Project(workspace_id=workspace.id, name="Content Project")
    session.add(project)
    await session.flush()
    await session.commit()
    return workspace.id, project.id


def _generation(
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    *,
    idempotency_key: str | None = None,
) -> ContentGeneration:
    return ContentGeneration(
        workspace_id=workspace_id,
        project_id=project_id,
        user_instruction="Write a landing page about testing.",
        skill_version=1,
        context_status="unavailable",
        context_snapshot={},
        request_fingerprint=uuid.uuid4().hex,
        idempotency_key=idempotency_key or str(uuid.uuid4()),
        provider="mistral",
        requested_model="mistral-small-latest",
    )


@pytest.mark.asyncio
async def test_content_queue_claims_without_double_claim(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    async with session_factory() as session:
        workspace_id, project_id = await _seed_workspace_project(session)
        ids = []
        for _ in range(8):
            row = _generation(workspace_id, project_id)
            session.add(row)
            await session.flush()
            ids.append(row.id)
        await session.commit()

    queue = PostgresTaskQueue(session_factory, CONTENT_QUEUE_SPEC)
    results = await asyncio.gather(
        queue.claim(owner="content-a", limit=8),
        queue.claim(owner="content-b", limit=8),
    )
    claimed_a = {t.id for t in results[0]}
    claimed_b = {t.id for t in results[1]}
    assert claimed_a.isdisjoint(claimed_b)
    assert claimed_a | claimed_b == set(ids)
    assert all(t.status == TASK_STATUS_LEASED for r in results for t in r)


@pytest.mark.asyncio
async def test_content_queue_lifecycle_heartbeat_retry_fail_cancel(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    async with session_factory() as session:
        workspace_id, project_id = await _seed_workspace_project(session)
        rows = [_generation(workspace_id, project_id) for _ in range(3)]
        session.add_all(rows)
        await session.commit()
        row_ids = [r.id for r in rows]

    queue = PostgresTaskQueue(session_factory, CONTENT_QUEUE_SPEC)
    claimed = await queue.claim(owner="content-w", limit=3)
    assert len(claimed) == 3

    first, second, third = claimed
    assert await queue.mark_running(task_id=first.id, owner="content-w")
    assert await queue.heartbeat(task_id=first.id, owner="content-w")
    # A stranger's heartbeat never extends an owned lease.
    assert not await queue.heartbeat(task_id=first.id, owner="intruder")

    assert await queue.retry(
        task_id=first.id,
        owner="content-w",
        delay_seconds=0.0,
        error_code="rate_limit",
    )
    assert await queue.fail(
        task_id=second.id, owner="content-w", error_code="server_error"
    )
    assert await queue.cancel(task_id=third.id)

    async with session_factory() as session:
        persisted = {
            row.id: row
            for row in (
                await session.scalars(
                    select(ContentGeneration).where(ContentGeneration.id.in_(row_ids))
                )
            ).all()
        }
    assert persisted[first.id].status == TASK_STATUS_RETRY_WAIT
    assert persisted[second.id].status == TASK_STATUS_FAILED
    assert persisted[third.id].status == TASK_STATUS_CANCELLED
    assert persisted[third.id].error_code == "cancelled"


@pytest.mark.asyncio
async def test_content_queue_sweeper_reclaims_expired_lease(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    async with session_factory() as session:
        workspace_id, project_id = await _seed_workspace_project(session)
        row = _generation(workspace_id, project_id)
        session.add(row)
        await session.commit()
        row_id = row.id

    queue = PostgresTaskQueue(session_factory, CONTENT_QUEUE_SPEC)
    claimed = await queue.claim(owner="content-w", limit=1)
    assert len(claimed) == 1

    async with session_factory() as session:
        await session.execute(
            update(ContentGeneration)
            .where(ContentGeneration.id == row_id)
            .values(lease_expires_at=datetime.now(UTC) - timedelta(minutes=5))
        )
        await session.commit()

    assert await queue.release_expired() == 1
    async with session_factory() as session:
        refreshed = await session.get(ContentGeneration, row_id)
    assert refreshed is not None
    assert refreshed.status in TASK_CLAIMABLE_STATUSES
    assert refreshed.lease_owner is None


@pytest.mark.asyncio
async def test_dispatch_receipt_is_counted_once_after_lost_worker(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    async with session_factory() as session:
        workspace_id, project_id = await _seed_workspace_project(session)
        row = _generation(workspace_id, project_id)
        session.add(row)
        await session.commit()
        generation_id = row.id

    queue = PostgresTaskQueue(
        session_factory,
        CONTENT_QUEUE_SPEC,
        reclaim_accounting=content_reclaim_accounting,
    )
    worker = ContentWorker(session_factory=session_factory, owner="content-w")
    await queue.claim(owner=worker.owner, limit=1)
    assert await queue.mark_running(task_id=generation_id, owner=worker.owner)
    assert await worker._start_dispatch(generation_id) is not None
    async with session_factory() as session:
        await session.execute(
            update(ContentGeneration)
            .where(ContentGeneration.id == generation_id)
            .values(lease_expires_at=datetime.now(UTC) - timedelta(minutes=5))
        )
        await session.commit()

    assert await queue.release_expired() == 1
    async with session_factory() as session:
        recovered = await session.get(ContentGeneration, generation_id)
        attempts = list(
            (
                await session.scalars(
                    select(ContentGenerationAttempt).where(
                        ContentGenerationAttempt.content_generation_id == generation_id
                    )
                )
            ).all()
        )
    assert recovered is not None
    assert recovered.attempt_count == 1
    assert [(item.attempt_number, item.status) for item in attempts] == [
        (1, "unknown_result")
    ]

    await queue.claim(owner=worker.owner, limit=1)
    assert await queue.mark_running(task_id=generation_id, owner=worker.owner)
    assert await worker._start_dispatch(generation_id) is not None
    async with session_factory() as session:
        numbers = list(
            (
                await session.scalars(
                    select(ContentGenerationAttempt.attempt_number)
                    .where(
                        ContentGenerationAttempt.content_generation_id == generation_id
                    )
                    .order_by(ContentGenerationAttempt.attempt_number)
                )
            ).all()
        )
    assert numbers == [1, 2]


async def _funded_generation(
    session: AsyncSession,
) -> tuple[uuid.UUID, uuid.UUID, uuid.UUID]:
    workspace_id, project_id = await _seed_workspace_project(session)
    account = await seed_occupancy_grants(
        session,
        workspace_id=workspace_id,
        grants=(GrantSpec(key=KEY_AI_CREDITS, value=100),),
    )
    row = _generation(workspace_id, project_id)
    row.funding_source = "platform"
    row.policy_revision = "test-policy"
    row.customer_charge_cap = 10
    session.add(row)
    await session.flush()
    reservation = await reserve_metered_usage(
        session,
        account_id=account.id,
        capability_key=KEY_AI_CREDITS,
        subject=MeteredSubject(
            kind="content", subject_id=row.id, workspace_id=workspace_id
        ),
        hold_units=10,
        idempotency_key=f"content:{row.id}:hold",
        at=datetime.now(UTC),
    )
    row.reservation_id = reservation.reservation_id
    await session.commit()
    return workspace_id, row.id, account.id


@pytest.mark.asyncio
async def test_cancel_before_dispatch_releases_platform_hold(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    async with session_factory() as session:
        workspace_id, generation_id, account_id = await _funded_generation(session)
        await cancel_generation(
            session, workspace_id=workspace_id, generation_id=generation_id
        )
        usage = await consumable_usage(
            session,
            account_id=account_id,
            capability_key=KEY_AI_CREDITS,
            at=datetime.now(UTC),
        )
    assert usage.reserved == 0
    assert usage.debited == 0


@pytest.mark.asyncio
async def test_terminal_reclaim_reconciles_undispatched_hold_once(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    async with session_factory() as session:
        _workspace_id, generation_id, account_id = await _funded_generation(session)
        row = await session.get(ContentGeneration, generation_id)
        assert row is not None
        row.max_attempts = 1
        await session.commit()

    callbacks = 0

    async def account_once(session, row, now):
        nonlocal callbacks
        callbacks += 1
        return await content_reclaim_accounting(session, row, now)

    queue = PostgresTaskQueue(
        session_factory, CONTENT_QUEUE_SPEC, reclaim_accounting=account_once
    )
    await queue.claim(owner="lost-worker", limit=1)
    assert await queue.mark_running(task_id=generation_id, owner="lost-worker")
    async with session_factory() as session:
        await session.execute(
            update(ContentGeneration)
            .where(ContentGeneration.id == generation_id)
            .values(lease_expires_at=datetime.now(UTC) - timedelta(seconds=1))
        )
        await session.commit()

    outcome = await queue.release_expired_detailed()
    async with session_factory() as session:
        row = await session.get(ContentGeneration, generation_id)
        usage = await consumable_usage(
            session,
            account_id=account_id,
            capability_key=KEY_AI_CREDITS,
            at=datetime.now(UTC),
        )
    assert callbacks == 1
    assert outcome.failed_task_ids == (generation_id,)
    assert row is not None
    assert row.status == TASK_STATUS_FAILED
    assert (usage.reserved, usage.debited) == (0, 0)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("policy_available", "expected_debit", "legacy_without_deadline"),
    [(True, 3, False), (False, 10, False), (True, 3, True)],
)
async def test_cancelled_lost_dispatch_settles_unknown_once(
    session_factory: async_sessionmaker[AsyncSession],
    monkeypatch: pytest.MonkeyPatch,
    policy_available: bool,
    expected_debit: int,
    legacy_without_deadline: bool,
) -> None:
    async with session_factory() as session:
        workspace_id, generation_id, account_id = await _funded_generation(session)

    async def policy_for_revision(*_args):
        if not policy_available:
            raise CatalogUnavailableError("historical rate unavailable")
        return SimpleNamespace(
            rate=lambda **_kwargs: SimpleNamespace(
                charge=lambda _usage: None, unknown_usage_charge=3
            )
        )

    monkeypatch.setattr(
        "app.domain.content.reconciliation.ai_credit_policy_for_revision",
        policy_for_revision,
    )
    queue = PostgresTaskQueue(session_factory, CONTENT_QUEUE_SPEC)
    worker = ContentWorker(session_factory=session_factory, owner="funded-w")
    await queue.claim(owner=worker.owner, limit=1)
    assert await queue.mark_running(task_id=generation_id, owner=worker.owner)
    dispatch_id = await worker._start_dispatch(generation_id)
    assert dispatch_id is not None
    async with session_factory() as session:
        await cancel_generation(
            session, workspace_id=workspace_id, generation_id=generation_id
        )
        await session.execute(
            update(ContentGenerationAttempt)
            .where(ContentGenerationAttempt.id == dispatch_id)
            .values(
                usage_hold_expires_at=(
                    None
                    if legacy_without_deadline
                    else datetime.now(UTC) - timedelta(seconds=1)
                ),
                dispatched_at=(
                    datetime.now(UTC) - timedelta(hours=1)
                    if legacy_without_deadline
                    else datetime.now(UTC)
                ),
            )
        )
        await session.commit()
    await reconcile_stale_cancelled_dispatches(session_factory)
    await reconcile_stale_cancelled_dispatches(session_factory)
    async with session_factory() as session:
        usage = await consumable_usage(
            session,
            account_id=account_id,
            capability_key=KEY_AI_CREDITS,
            at=datetime.now(UTC),
        )
        attempt = await session.get(ContentGenerationAttempt, dispatch_id)
        debits = list(
            (
                await session.scalars(
                    select(ConsumableLedger).where(
                        ConsumableLedger.content_generation_id == generation_id,
                        ConsumableLedger.entry_kind == "debit",
                    )
                )
            ).all()
        )
    assert attempt is not None
    assert attempt.status == "unknown_result"
    assert (usage.reserved, usage.debited, len(debits)) == (0, expected_debit, 1)


@pytest.mark.asyncio
async def test_cancelled_dispatch_accepts_one_late_receipt(
    session_factory: async_sessionmaker[AsyncSession],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async with session_factory() as session:
        workspace_id, generation_id, account_id = await _funded_generation(session)

    async def policy_for_revision(*_args):
        return SimpleNamespace(
            rate=lambda **_kwargs: SimpleNamespace(
                charge=lambda _usage: 2, unknown_usage_charge=3
            )
        )

    monkeypatch.setattr(
        "app.domain.content.reconciliation.ai_credit_policy_for_revision",
        policy_for_revision,
    )
    queue = PostgresTaskQueue(session_factory, CONTENT_QUEUE_SPEC)
    worker = ContentWorker(session_factory=session_factory, owner="receipt-w")
    await queue.claim(owner=worker.owner, limit=1)
    assert await queue.mark_running(task_id=generation_id, owner=worker.owner)
    dispatch_id = await worker._start_dispatch(generation_id)
    assert dispatch_id is not None
    async with session_factory() as session:
        await cancel_generation(
            session, workspace_id=workspace_id, generation_id=generation_id
        )
    outcome = AttemptOutcome(
        response=DiscoveryResponse(
            provider="fake",
            requested_model="mistral-small-latest",
            returned_model="mistral-small-latest",
            output_text="draft",
            finish_reason="stop",
            usage={"input_tokens": 10, "output_tokens": 20},
        ),
        error=None,
    )
    assert await worker.finalize_attempt(
        generation_id=generation_id,
        dispatch_id=dispatch_id,
        owner=worker.owner,
        outcome=outcome,
    )
    assert not await worker.finalize_attempt(
        generation_id=generation_id,
        dispatch_id=dispatch_id,
        owner=worker.owner,
        outcome=outcome,
    )
    async with session_factory() as session:
        usage = await consumable_usage(
            session,
            account_id=account_id,
            capability_key=KEY_AI_CREDITS,
            at=datetime.now(UTC),
        )
        row = await session.get(ContentGeneration, generation_id)
        attempt = await session.get(ContentGenerationAttempt, dispatch_id)
    assert row is not None
    assert row.status == TASK_STATUS_CANCELLED
    assert attempt is not None
    assert attempt.status == "succeeded"
    assert (usage.reserved, usage.debited) == (0, 2)


@pytest.mark.asyncio
async def test_idempotency_key_unique_per_workspace_not_globally(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    async with session_factory() as session:
        ws_a, proj_a = await _seed_workspace_project(session)
    async with session_factory() as session:
        ws_b, proj_b = await _seed_workspace_project(session)

    shared_key = "client-key-1"
    # Same key in two different workspaces: allowed.
    async with session_factory() as session:
        session.add(_generation(ws_a, proj_a, idempotency_key=shared_key))
        session.add(_generation(ws_b, proj_b, idempotency_key=shared_key))
        await session.commit()

    # Duplicate key within one workspace: rejected by the composite constraint.
    async with session_factory() as session:
        session.add(_generation(ws_a, proj_a, idempotency_key=shared_key))
        with pytest.raises(IntegrityError):
            await session.commit()


@pytest.mark.asyncio
async def test_running_status_transition(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    async with session_factory() as session:
        workspace_id, project_id = await _seed_workspace_project(session)
        row = _generation(workspace_id, project_id)
        session.add(row)
        await session.commit()
        row_id = row.id

    queue = PostgresTaskQueue(session_factory, CONTENT_QUEUE_SPEC)
    await queue.claim(owner="content-w", limit=1)
    assert await queue.mark_running(task_id=row_id, owner="content-w")
    async with session_factory() as session:
        refreshed = await session.get(ContentGeneration, row_id)
    assert refreshed is not None
    assert refreshed.status == TASK_STATUS_RUNNING
