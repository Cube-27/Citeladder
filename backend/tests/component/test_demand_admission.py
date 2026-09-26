"""Manual Demand admission at the real PostgreSQL transaction boundary."""

from __future__ import annotations

import asyncio
import uuid
from datetime import date
from unittest.mock import AsyncMock

import httpx
import pytest
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.domain.abuse.service import UsageLimitExceededError
from app.domain.analytics.enqueue import enqueue_demand_snapshot_refresh
from app.domain.demand import admission
from app.models.analytics import AnalyticsTask
from app.models.demand import DemandSnapshot
from app.models.project import Project
from app.models.workspace import Workspace
from tests.component.test_demand_projection import _create_api_project

pytestmark = pytest.mark.asyncio
_START = date(2026, 7, 1)
_END = date(2026, 7, 7)


async def _seed(session: AsyncSession) -> dict:
    workspace = Workspace(name="Manual admission")
    session.add(workspace)
    await session.flush()
    project = Project(workspace_id=workspace.id, name="Saved window")
    session.add(project)
    await session.flush()
    scope = {"workspace_id": workspace.id, "project_id": project.id}
    for end in (_END, date(2026, 7, 8)):
        session.add(
            DemandSnapshot(
                **scope,
                window_start=_START,
                window_end=end,
                source_hash=uuid.uuid4().hex,
                analyzer_version="test",
                formula_version="test",
            )
        )
    await session.commit()
    return scope


async def test_unsaved_windows_are_rejected_before_source_work(
    client: httpx.AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    project = await _create_api_project(client)
    foreign = await _seed(db_session)
    revision = AsyncMock(
        side_effect=AssertionError("unsaved window reached source work")
    )
    monkeypatch.setattr(admission, "demand_source_revision", revision)
    response = await client.post(
        f"/api/v1/projects/{project['id']}/demand/recompute",
        json={"window_start": str(_START), "window_end": str(_END)},
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "demand_window_not_saved"
    denied = await client.post(
        f"/api/v1/projects/{foreign['project_id']}/demand/recompute",
        json={"window_start": str(_START), "window_end": str(_END)},
    )
    assert denied.status_code == 404
    revision.assert_not_awaited()
    assert await db_session.scalar(select(func.count()).select_from(AnalyticsTask)) == 0


async def test_concurrent_windows_retry_and_terminal_capacity(
    db_session: AsyncSession,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    scope = await _seed(db_session)

    async def refresh(end: date) -> tuple[str, uuid.UUID | None]:
        async with session_factory() as session:
            try:
                task_id = await admission.enqueue_manual_refresh(
                    session,
                    **scope,
                    window_start=_START,
                    window_end=end,
                )
                await session.commit()
                return "accepted", task_id
            except UsageLimitExceededError:
                await session.rollback()
                return "limited", None

    ends = (_END, date(2026, 7, 8))
    results = await asyncio.gather(*(refresh(end) for end in ends))
    assert sorted(state for state, _ in results) == ["accepted", "limited"]
    winner = next(i for i, (state, _) in enumerate(results) if state == "accepted")
    assert await refresh(ends[winner]) == ("accepted", None)
    rows = list((await db_session.scalars(select(AnalyticsTask))).all())
    assert len(rows) == 1
    # Retry-wait/leased tasks still hold capacity, not only queued/running.
    for state in ("leased", "retry_wait", "running"):
        await db_session.execute(update(AnalyticsTask).values(status=state))
        await db_session.commit()
        assert await refresh(ends[1 - winner]) == ("limited", None)
    await db_session.execute(update(AnalyticsTask).values(status="succeeded"))
    await db_session.commit()
    recovered, task_id = await refresh(ends[1 - winner])
    assert recovered == "accepted" and task_id is not None
    assert await db_session.scalar(select(func.count()).select_from(AnalyticsTask)) == 2


async def test_manual_admission_does_not_limit_other_projects_or_automatic_work(
    db_session: AsyncSession,
) -> None:
    scope = await _seed(db_session)
    other_workspace = await _seed(db_session)
    other_project = Project(workspace_id=scope["workspace_id"], name="Second project")
    db_session.add(other_project)
    await db_session.flush()
    same_workspace = {**scope, "project_id": other_project.id}
    db_session.add(
        DemandSnapshot(
            **same_workspace,
            window_start=_START,
            window_end=_END,
            source_hash="second",
            analyzer_version="test",
            formula_version="test",
        )
    )
    await db_session.commit()
    for target in (scope, same_workspace, other_workspace):
        assert await admission.enqueue_manual_refresh(
            db_session,
            **target,
            window_start=_START,
            window_end=_END,
        )
    automatic = await enqueue_demand_snapshot_refresh(
        db_session,
        **scope,
        window_start=_START,
        window_end=_END,
        source_revision="fresh-automatic-revision",
        downstream_trigger_kind="site_crawl",
        downstream_trigger_id=uuid.uuid4(),
    )
    await db_session.commit()
    assert automatic is not None
    task = await db_session.get(AnalyticsTask, automatic)
    assert task is not None and task.payload["manual"] is False
    assert task.payload["downstream_trigger_kind"] == "site_crawl"


async def test_failed_enqueue_rolls_back_and_exact_concurrent_retries_insert_once(
    db_session: AsyncSession,
    session_factory: async_sessionmaker[AsyncSession],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    scope = await _seed(db_session)
    real_enqueue = admission.enqueue_demand_snapshot_refresh

    async def fail_after_insert(*args, **kwargs):
        await real_enqueue(*args, **kwargs)
        raise RuntimeError("failed after insert")

    with monkeypatch.context() as patch:
        patch.setattr(admission, "enqueue_demand_snapshot_refresh", fail_after_insert)
        with pytest.raises(RuntimeError, match="failed after insert"):
            await admission.enqueue_manual_refresh(
                db_session,
                **scope,
                window_start=_START,
                window_end=_END,
            )
        await db_session.rollback()
    assert await db_session.scalar(select(func.count()).select_from(AnalyticsTask)) == 0

    async def retry():
        async with session_factory() as session:
            result = await admission.enqueue_manual_refresh(
                session,
                **scope,
                window_start=_START,
                window_end=_END,
            )
            await session.commit()
            return result

    results = await asyncio.gather(retry(), retry())
    assert sum(result is not None for result in results) == 1
    assert await db_session.scalar(select(func.count()).select_from(AnalyticsTask)) == 1


async def test_legacy_pending_payload_holds_capacity_without_being_rewritten(
    db_session: AsyncSession,
) -> None:
    scope = await _seed(db_session)
    payload = {"window_start": str(_START), "window_end": str(_END)}
    legacy = AnalyticsTask(
        **scope,
        task_kind="demand_snapshot_refresh",
        payload=payload,
        idempotency_key="pre-hardening-task",
        status="queued",
    )
    db_session.add(legacy)
    await db_session.commit()
    with pytest.raises(UsageLimitExceededError):
        await admission.enqueue_manual_refresh(
            db_session,
            **scope,
            window_start=_START,
            window_end=_END,
        )
    await db_session.rollback()
    row = (await db_session.scalars(select(AnalyticsTask))).one()
    assert row.payload == payload


async def test_api_capacity_error_is_retryable_and_does_not_leave_a_task(
    client: httpx.AsyncClient,
    db_session: AsyncSession,
) -> None:
    project = await _create_api_project(client)
    scope = {
        "workspace_id": uuid.UUID(project["workspace_id"]),
        "project_id": uuid.UUID(project["id"]),
    }
    for end in (_END, date(2026, 7, 8)):
        db_session.add(
            DemandSnapshot(
                **scope,
                window_start=_START,
                window_end=end,
                source_hash=uuid.uuid4().hex,
                analyzer_version="test",
                formula_version="test",
            )
        )
    await db_session.commit()
    url = f"/api/v1/projects/{project['id']}/demand/recompute"
    payload = {"window_start": str(_START), "window_end": str(_END)}
    created = await client.post(url, json=payload)
    assert created.status_code == 202 and created.json()["status"] == "queued"
    replay = await client.post(url, json=payload)
    assert replay.status_code == 202 and replay.json()["status"] == "already_queued"
    refused = await client.post(url, json={**payload, "window_end": "2026-07-08"})
    assert refused.status_code == 429
    assert int(refused.headers["retry-after"]) > 0
    assert refused.json()["error"]["retryable"] is True
    assert await db_session.scalar(select(func.count()).select_from(AnalyticsTask)) == 1
