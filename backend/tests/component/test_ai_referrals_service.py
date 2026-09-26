"""The AI Referrals read service, for the Python copy the Agent's tools call.

The HTTP route moved to the TypeScript API service, whose suite
(``frontend/services/api/test/ai-referrals.test.ts``) carries the route's
tests. These keep the Python service honest while its last caller remains
(TypeScript migration rule 2): a preset resolves the snapshot its refresh
MARKED, never one of merely the right length, and a bad query is refused.
"""

from __future__ import annotations

import uuid
from datetime import date, timedelta

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config.analytics import (
    ANALYTICS_DEFAULT_GRANULARITY,
    ANALYTICS_MAX_WINDOW_DAYS,
)
from app.domain.analytics.service import AiReferralsQueryError, get_ai_referrals
from app.models.analytics import AiReferralsSnapshot
from tests.component.audit_helpers import seed_audit_fixtures

_END = date(2026, 7, 22)
_START = _END - timedelta(days=29)
_TOO_EARLY = _END - timedelta(days=ANALYTICS_MAX_WINDOW_DAYS)


async def _seed(
    session_factory: async_sessionmaker[AsyncSession],
    *,
    preset_window_days: int | None,
) -> tuple[uuid.UUID, uuid.UUID]:
    async with session_factory() as session:
        seed = await seed_audit_fixtures(session, prompt_count=1)
        session.add(
            AiReferralsSnapshot(
                workspace_id=seed.workspace_id,
                project_id=seed.project_id,
                window_start=_START,
                window_end=_END,
                granularity=ANALYTICS_DEFAULT_GRANULARITY,
                preset_window_days=preset_window_days,
                metrics={
                    "referral_volume": [{"date": _END.isoformat(), "value": 42}],
                    "referral_share": [],
                    "sources": [{"ai_source": "chatgpt", "sessions": 42}],
                },
                source_classification_ids=[],
            )
        )
        await session.commit()
    return seed.workspace_id, seed.project_id


async def test_a_preset_reads_only_its_marked_snapshot(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    marked = await _seed(session_factory, preset_window_days=30)
    unmarked = await _seed(session_factory, preset_window_days=None)
    async with session_factory() as session:
        preset = await get_ai_referrals(
            session, workspace_id=marked[0], project_id=marked[1], range_token="30d"
        )
        longer = await get_ai_referrals(
            session, workspace_id=marked[0], project_id=marked[1], range_token="90d"
        )
        same_length = await get_ai_referrals(
            session, workspace_id=unmarked[0], project_id=unmarked[1], range_token="30d"
        )
        exact = await get_ai_referrals(
            session,
            workspace_id=unmarked[0],
            project_id=unmarked[1],
            from_date=_START,
            to_date=_END,
        )
        foreign = await get_ai_referrals(
            session, workspace_id=unmarked[0], project_id=marked[1], range_token="30d"
        )

    assert (preset.window_start, preset.window_end) == (
        _START.isoformat(),
        _END.isoformat(),
    )
    assert [row.sessions for row in preset.sources] == [42]
    assert longer.sources == []
    assert same_length.sources == []
    assert [row.sessions for row in exact.sources] == [42]
    assert foreign.sources == []


@pytest.mark.parametrize(
    ("query", "message"),
    [
        ({"granularity": "hourly"}, "unknown granularity"),
        ({"range_token": "7d"}, "unknown ai-referrals range"),
        ({"from_date": _END, "to_date": _START}, "must not be before"),
        ({"from_date": _START}, "supplied together"),
        ({"from_date": _TOO_EARLY, "to_date": _END}, "ANALYTICS_MAX_WINDOW_DAYS"),
    ],
)
async def test_a_malformed_query_is_refused(
    session_factory: async_sessionmaker[AsyncSession],
    query: dict[str, object],
    message: str,
) -> None:
    async with session_factory() as session:
        with pytest.raises(AiReferralsQueryError, match=message):
            await get_ai_referrals(
                session,
                workspace_id=uuid.uuid4(),
                project_id=uuid.uuid4(),
                **query,  # type: ignore[arg-type]
            )
