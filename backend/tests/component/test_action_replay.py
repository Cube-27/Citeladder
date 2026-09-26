"""Replay identity and conflict recovery after the Action declaration cutover."""

from __future__ import annotations

import asyncio
import uuid
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock

import httpx
import pytest
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.domain.opportunities import implementation_events as declarations
from app.models.opportunity import (
    Action,
    ActionStatusEvent,
    OpportunityImplementationEvent,
)
from app.models.workspace import WorkspaceMember
from tests.component.opportunity_helpers import _seed_scenario
from tests.component.test_action_declarations import (
    _headers,
    _seed_and_recompute,
    _seed_earned_page_action,
)

pytestmark = pytest.mark.asyncio


async def test_replay_remains_bound_to_authorized_action_and_original_body(
    client: httpx.AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    scenario, action, _ = await _seed_and_recompute(client, session_factory)
    other_id = await _seed_earned_page_action(session_factory, scenario)
    async with session_factory() as session:
        foreign = await _seed_scenario(session)
    foreign_id = await _seed_earned_page_action(session_factory, foreign)
    now = datetime.now(UTC)
    payload = {"declared_implemented_at": now.isoformat()}
    headers = _headers(scenario, "replay-identity")
    url = f"/api/v1/actions/{action.id}/declaration"
    created = await client.post(url, headers=headers, json=payload)
    assert created.status_code == 201
    for action_id, expected in (
        (other_id, 409),
        (foreign_id, 404),
        (uuid.uuid4(), 404),
    ):
        response = await client.post(
            f"/api/v1/actions/{action_id}/declaration",
            headers=headers,
            json=payload,
        )
        assert response.status_code == expected
        assert str(action.id) not in response.text
    changed = await client.post(
        url,
        headers=headers,
        json={"declared_implemented_at": (now - timedelta(minutes=1)).isoformat()},
    )
    assert changed.status_code == 409
    # Current eligibility may disappear after a successful declaration. A retry
    # must return immutable evidence without resolving new targets or checks.
    for name in (
        "_current_snapshot",
        "_resolve_targets",
        "_checked_revision",
        "_live_members",
    ):
        monkeypatch.setattr(
            declarations, name, AsyncMock(side_effect=AssertionError(name))
        )
    replay = await client.post(url, headers=headers, json=payload)
    assert replay.status_code == 200 and replay.json() == created.json()
    async with session_factory() as session:
        await session.execute(
            delete(WorkspaceMember).where(
                WorkspaceMember.workspace_id == scenario.workspace_id,
                WorkspaceMember.user_id == scenario.user_id,
            )
        )
        await session.commit()
    revoked = await client.post(url, headers=headers, json=payload)
    assert revoked.status_code == 404


async def test_two_actions_racing_for_one_key_roll_back_the_losing_effects(
    client: httpx.AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    scenario, action, _ = await _seed_and_recompute(client, session_factory)
    other_id = await _seed_earned_page_action(session_factory, scenario)
    barrier = asyncio.Barrier(2)
    flush = declarations._flush_declaration

    async def race_flush(*args, **kwargs):
        # Both initial replay lookups miss; the unique index forces one request
        # through the actual insert-conflict recovery branch.
        await barrier.wait()
        return await flush(*args, **kwargs)

    monkeypatch.setattr(declarations, "_flush_declaration", race_flush)
    now = datetime.now(UTC)

    async def declare(action_id):
        async with session_factory() as session:
            try:
                row, created = await declarations.declare_action_implemented(
                    session,
                    workspace_id=scenario.workspace_id,
                    actor_user_id=scenario.user_id,
                    idempotency_key="race-key",
                    declaration=declarations.ImplementationDeclaration(
                        action_id=action_id,
                        output_revision_id=None,
                        declared_implemented_at=now,
                    ),
                )
                await session.commit()
                return row.action_id if created else None
            except declarations.ImplementationIdempotencyConflictError:
                await session.rollback()
                return None

    results = await asyncio.wait_for(
        asyncio.gather(declare(action.id), declare(other_id)), 15
    )
    assert sum(result is not None for result in results) == 1
    winner = next(result for result in results if result is not None)
    async with session_factory() as session:
        assert (
            await session.scalar(
                select(func.count()).select_from(OpportunityImplementationEvent)
            )
            == 1
        )
        assert (
            await session.scalar(select(func.count()).select_from(ActionStatusEvent))
            == 1
        )
        statuses = dict(
            (
                await session.execute(
                    select(Action.id, Action.status).where(
                        Action.id.in_([action.id, other_id]),
                    )
                )
            ).all()
        )
    assert statuses[winner] == "implemented"
    assert statuses[next(key for key in statuses if key != winner)] == "open"


async def test_concurrent_identical_declarations_replay_once(
    client: httpx.AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    scenario, action, _ = await _seed_and_recompute(client, session_factory)
    payload = {"declared_implemented_at": datetime.now(UTC).isoformat()}

    async def request():
        return await client.post(
            f"/api/v1/actions/{action.id}/declaration",
            headers=_headers(scenario, "identical-race"),
            json=payload,
        )

    responses = await asyncio.gather(request(), request())
    assert sorted(response.status_code for response in responses) == [200, 201]
    assert responses[0].json() == responses[1].json()
    async with session_factory() as session:
        assert (
            await session.scalar(select(func.count()).select_from(ActionStatusEvent))
            == 1
        )
