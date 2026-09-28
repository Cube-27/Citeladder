import uuid
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from pydantic import SecretStr
from sqlalchemy import select

from app.domain.site_health import content_judgments as owner
from app.models.analytics import AnalyticsTask
from app.models.site_health.content_structure import (
    SiteContentStructureEvent,
    SiteContentStructureRun,
)
from app.workers import content_structure as worker
from tests.component.opportunity_helpers import _seed_scenario


@pytest.mark.parametrize("interrupted", [False, True])
async def test_dispatch_is_committed_before_provider_and_replay_does_not_resend(
    session_factory, monkeypatch, interrupted
):
    async with session_factory() as session:
        seed = await _seed_scenario(session)
        candidate_id = uuid.uuid4()
        run = SiteContentStructureRun(
            id=uuid.uuid4(),
            workspace_id=seed.workspace_id,
            project_id=seed.project_id,
            crawl_id=seed.crawl_id,
            actor_id=seed.user_id,
            idempotency_key=str(uuid.uuid4()),
            state="queued",
            policy_version=1,
            manifest={
                "candidates": [
                    {"id": str(candidate_id), "request": {"state": {}, "questions": {}}}
                ]
            },
        )
        session.add(run)
        task = AnalyticsTask(
            workspace_id=seed.workspace_id,
            project_id=seed.project_id,
            task_kind="content_structure_judgment",
            payload={"run_id": str(run.id)},
            idempotency_key=str(uuid.uuid4()),
            status="running",
            lease_owner="test",
            available_at=datetime.now(UTC),
        )
        task.lease_expires_at = datetime.now(UTC) + timedelta(minutes=5)
        session.add(task)
        await session.commit()
    rate = SimpleNamespace(
        call_credit_cap=1,
        model_dump=lambda **_: {
            "feature": "content_structure",
            "model": "fixture",
            "input_credits_per_million": 1,
            "cached_input_credits_per_million": 0,
            "output_credits_per_million": 0,
            "reasoning_credits_per_million": 0,
            "call_credit_cap": 1,
            "unknown_usage_charge": 1,
        },
    )
    monkeypatch.setattr(
        owner, "jev_settings", SimpleNamespace(enabled=True, model="fixture")
    )
    monkeypatch.setattr(
        owner,
        "published_ai_credit_policy",
        AsyncMock(return_value=("fixture", SimpleNamespace(rate=lambda **_: rate))),
    )
    monkeypatch.setattr(
        owner, "billing_account_id_for", AsyncMock(return_value=uuid.uuid4())
    )
    monkeypatch.setattr(
        owner,
        "reserve_metered_usage",
        AsyncMock(return_value=SimpleNamespace(reservation_id=uuid.uuid4())),
    )
    settlement = AsyncMock()
    monkeypatch.setattr(owner, "settle_metered_usage", settlement)
    monkeypatch.setattr(
        worker,
        "jev_settings",
        worker.jev_settings.model_copy(update={"api_key": SecretStr("fixture-only")}),
    )

    class Client:
        calls = 0

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_):
            return None

        async def decide(self, *_):
            self.calls += 1
            async with session_factory() as session:
                dispatch = await session.scalar(
                    select(SiteContentStructureEvent).where(
                        SiteContentStructureEvent.run_id == run.id,
                        SiteContentStructureEvent.kind == "dispatch",
                    )
                )
                assert dispatch is not None
            if interrupted:
                raise RuntimeError("worker interrupted after dispatch")
            return SimpleNamespace(
                answers={},
                model="fixture",
                usage={"input_tokens": 10, "output_tokens": 1},
            )

    client = Client()
    monkeypatch.setattr(worker, "create_jev_client", lambda _: client)
    if interrupted:
        with pytest.raises(RuntimeError, match="worker interrupted"):
            await worker.judge_content_structure(session_factory, task)
    else:
        await worker.judge_content_structure(session_factory, task)
    await worker.judge_content_structure(session_factory, task)
    assert client.calls == 1
    assert settlement.await_count == 1
    async with session_factory() as session:
        events = list(
            await session.scalars(
                select(SiteContentStructureEvent).where(
                    SiteContentStructureEvent.run_id == run.id
                )
            )
        )
        assert [row.kind for row in events].count("outcome") == 1
        outcome = next(row for row in events if row.kind == "outcome")
        assert outcome.evidence["state"] == (
            "uncertain" if interrupted else "completed"
        )
        queued = list(
            await session.scalars(
                select(AnalyticsTask).where(
                    AnalyticsTask.task_kind == "content_structure_publish"
                )
            )
        )
        assert len(queued) == 1
