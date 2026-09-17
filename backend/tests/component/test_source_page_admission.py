"""What the inspection budget actually bounds, and how a claim is paid for.

The failure these cover is not overspending by a little. It is a budget that
looks enforced and is not: two workers each reading the same remaining
allowance, or a worker that fetches and dies leaving no trace of the request it
already made.
"""

from __future__ import annotations

import asyncio
import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config.source_pages import (
    INSPECTION_BLOCKED,
    INSPECTION_INSPECTED,
    INSPECTION_NOT_INSPECTED,
    INSPECTION_QUEUED,
    INSPECTION_STALE,
    SOURCE_PAGE_BUDGET_PER_WINDOW,
)
from app.domain.source_pages.admission import (
    claim_pages,
    current_budget,
    spend_for_redirect,
)
from app.models.source_pages import SourcePage, SourcePageInspectionSpend
from tests.component.opportunity_helpers import _seed_scenario

pytestmark = pytest.mark.asyncio


async def _page(
    session: AsyncSession,
    scenario,
    *,
    slug: str,
    state: str = INSPECTION_NOT_INSPECTED,
    recurrence: int = 1,
    inspected_at: datetime | None = None,
) -> SourcePage:
    page = SourcePage(
        workspace_id=scenario.workspace_id,
        project_id=scenario.project_id,
        url_hash=slug.ljust(64, "0"),
        canonical_url=f"https://publisher.com/{slug}",
        registrable_domain="publisher.com",
        inspection_state=state,
        recurrence_count=recurrence,
        last_inspected_at=inspected_at,
    )
    session.add(page)
    await session.flush()
    return page


async def test_a_claim_is_paid_for_before_anything_is_fetched(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    async with session_factory() as session:
        scenario = await _seed_scenario(session)
        page = await _page(session, scenario, slug="a")
        await session.commit()

        claims = await claim_pages(
            session,
            workspace_id=scenario.workspace_id,
            project_id=scenario.project_id,
        )
        await session.commit()

        assert [claim.source_page_id for claim in claims] == [page.id]
        await session.refresh(page)
        assert page.inspection_state == INSPECTION_QUEUED
        assert page.claim_expires_at is not None
        budget = await current_budget(session, project_id=scenario.project_id)
        assert budget.spent == 1


async def test_concurrent_workers_cannot_exceed_the_window(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """Two workers reading the same allowance must not both proceed."""
    async with session_factory() as session:
        scenario = await _seed_scenario(session)
        for index in range(6):
            await _page(session, scenario, slug=f"p{index}")
        # Leave room for exactly three more units.
        for index in range(SOURCE_PAGE_BUDGET_PER_WINDOW - 3):
            session.add(
                SourcePageInspectionSpend(
                    workspace_id=scenario.workspace_id,
                    project_id=scenario.project_id,
                    spend_kind="page",
                    idempotency_key=f"prior:{index}",
                )
            )
        await session.commit()

    async def worker() -> int:
        async with session_factory() as session:
            claims = await claim_pages(
                session,
                workspace_id=scenario.workspace_id,
                project_id=scenario.project_id,
            )
            await session.commit()
            return len(claims)

    counts = await asyncio.gather(worker(), worker())

    async with session_factory() as session:
        spent = await session.scalar(
            select(func.count())
            .select_from(SourcePageInspectionSpend)
            .where(SourcePageInspectionSpend.project_id == scenario.project_id)
        )

    assert sum(counts) == 3
    assert spent == SOURCE_PAGE_BUDGET_PER_WINDOW


async def test_an_exhausted_window_admits_nothing(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    async with session_factory() as session:
        scenario = await _seed_scenario(session)
        await _page(session, scenario, slug="a")
        for index in range(SOURCE_PAGE_BUDGET_PER_WINDOW):
            session.add(
                SourcePageInspectionSpend(
                    workspace_id=scenario.workspace_id,
                    project_id=scenario.project_id,
                    spend_kind="page",
                    idempotency_key=f"used:{index}",
                )
            )
        await session.commit()

        claims = await claim_pages(
            session,
            workspace_id=scenario.workspace_id,
            project_id=scenario.project_id,
        )
        paid = await spend_for_redirect(
            session,
            workspace_id=scenario.workspace_id,
            project_id=scenario.project_id,
            redirect_url="https://redirect.example/token",
        )

        assert claims == []
        assert paid is False


async def test_spend_outside_the_window_no_longer_counts(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    async with session_factory() as session:
        scenario = await _seed_scenario(session)
        session.add(
            SourcePageInspectionSpend(
                workspace_id=scenario.workspace_id,
                project_id=scenario.project_id,
                spend_kind="page",
                idempotency_key="old",
                created_at=datetime.now(UTC) - timedelta(days=3),
            )
        )
        await session.commit()

        budget = await current_budget(session, project_id=scenario.project_id)

        assert budget.spent == 0


async def test_never_inspected_pages_are_admitted_before_stale_ones(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """A page nobody has read tells us more than one we are re-checking."""
    async with session_factory() as session:
        scenario = await _seed_scenario(session)
        stale = await _page(
            session,
            scenario,
            slug="stale",
            state=INSPECTION_STALE,
            recurrence=99,
            inspected_at=datetime.now(UTC) - timedelta(days=30),
        )
        fresh_gap = await _page(session, scenario, slug="new", recurrence=1)
        await session.commit()

        claims = await claim_pages(
            session,
            workspace_id=scenario.workspace_id,
            project_id=scenario.project_id,
            limit=2,
        )

        assert [claim.source_page_id for claim in claims] == [fresh_gap.id, stale.id]


async def test_an_already_inspected_page_is_reused_before_a_new_one(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    async with session_factory() as session:
        scenario = await _seed_scenario(session)
        await _page(
            session,
            scenario,
            slug="done",
            state=INSPECTION_INSPECTED,
            recurrence=99,
            inspected_at=datetime.now(UTC),
        )
        pending = await _page(session, scenario, slug="todo")
        await session.commit()

        claims = await claim_pages(
            session,
            workspace_id=scenario.workspace_id,
            project_id=scenario.project_id,
            limit=1,
        )

        assert [claim.source_page_id for claim in claims] == [pending.id]


async def test_a_robots_blocked_page_is_never_reclaimed(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """Retrying a wall spends budget to be told the same thing again."""
    async with session_factory() as session:
        scenario = await _seed_scenario(session)
        await _page(session, scenario, slug="blocked", state=INSPECTION_BLOCKED)
        await session.commit()

        claims = await claim_pages(
            session,
            workspace_id=scenario.workspace_id,
            project_id=scenario.project_id,
        )

        assert claims == []


async def test_an_abandoned_claim_becomes_available_again(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """A worker that died must not strand the page, but it still paid."""
    async with session_factory() as session:
        scenario = await _seed_scenario(session)
        page = await _page(session, scenario, slug="lost", state=INSPECTION_QUEUED)
        page.claim_expires_at = datetime.now(UTC) - timedelta(hours=1)
        await session.commit()

        claims = await claim_pages(
            session,
            workspace_id=scenario.workspace_id,
            project_id=scenario.project_id,
        )
        await session.commit()

        assert [claim.source_page_id for claim in claims] == [page.id]
        budget = await current_budget(session, project_id=scenario.project_id)
        assert budget.spent == 1


async def test_a_manually_requested_page_still_pays_the_same_budget(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    async with session_factory() as session:
        scenario = await _seed_scenario(session)
        wanted = await _page(session, scenario, slug="wanted", recurrence=1)
        await _page(session, scenario, slug="popular", recurrence=500)
        await session.commit()

        claims = await claim_pages(
            session,
            workspace_id=scenario.workspace_id,
            project_id=scenario.project_id,
            page_ids=[wanted.id],
        )
        await session.commit()

        assert [claim.source_page_id for claim in claims] == [wanted.id]
        budget = await current_budget(session, project_id=scenario.project_id)
        assert budget.spent == 1


async def test_following_a_redirect_costs_a_unit_like_any_other_fetch(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """Exempting tokens is how a redirecting engine doubles the bill unseen."""
    async with session_factory() as session:
        scenario = await _seed_scenario(session)
        await session.commit()

        first = await spend_for_redirect(
            session,
            workspace_id=scenario.workspace_id,
            project_id=scenario.project_id,
            redirect_url="https://redirect.example/token",
        )
        replay = await spend_for_redirect(
            session,
            workspace_id=scenario.workspace_id,
            project_id=scenario.project_id,
            redirect_url="https://redirect.example/token",
        )
        await session.commit()

        assert (first, replay) == (True, False)
        budget = await current_budget(session, project_id=scenario.project_id)
        assert budget.spent == 1


async def test_another_projects_spend_does_not_consume_this_ones_window(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    async with session_factory() as session:
        scenario = await _seed_scenario(session)
        other = await _seed_scenario(session)
        session.add(
            SourcePageInspectionSpend(
                workspace_id=other.workspace_id,
                project_id=other.project_id,
                spend_kind="page",
                idempotency_key=f"other:{uuid.uuid4()}",
            )
        )
        await session.commit()

        budget = await current_budget(session, project_id=scenario.project_id)

        assert budget.spent == 0
