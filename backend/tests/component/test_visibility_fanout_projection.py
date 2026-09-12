"""Fanout totals and search cover the whole selection, not one loaded page.

The Query-fanouts tab derived "Distinct searches" and "Total occurrences" from
the evidence page it happened to have loaded, and filtered that page's rows in
the browser, while labelling both as figures for the selected run set. Totals
moved as the reader paged, and a query stored past the first page could not be
found at all. These cases pin the projection that owns the complete selection.
"""

from __future__ import annotations

from datetime import UTC, datetime

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.domain.analysis.fanout_projection import get_visibility_fanout
from tests.component.analysis_api_helpers import _event, _seed_evidence_execution
from tests.component.audit_helpers import seed_audit_fixtures

# More distinct queries than any one page asks for.
_QUERIES = [
    "best crm software",
    "crm pricing",
    "crm for small teams",
    "salesforce alternatives",
    "hubspot vs pipedrive",
    "cheapest crm 2026",
]


async def _seed(session_factory: async_sessionmaker[AsyncSession]):
    async with session_factory() as session:
        seed = await seed_audit_fixtures(session)
        await _seed_evidence_execution(
            session,
            workspace_id=seed.workspace_id,
            project_id=seed.project_id,
            completed_at=datetime(2026, 2, 1, tzinfo=UTC),
            artifact_events=[
                _event(index, text, call_id="c1", query_sequence=index)
                for index, text in enumerate(_QUERIES)
            ],
            search_query_count=len(_QUERIES),
        )
        await session.commit()
        return seed


@pytest.mark.asyncio
async def test_totals_do_not_move_between_pages(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """Paging changes which rows come back, never what the totals claim."""
    seed = await _seed(session_factory)
    async with session_factory() as session:
        first = await get_visibility_fanout(
            session,
            workspace_id=seed.workspace_id,
            project_id=seed.project_id,
            offset=0,
            limit=2,
        )
        second = await get_visibility_fanout(
            session,
            workspace_id=seed.workspace_id,
            project_id=seed.project_id,
            offset=2,
            limit=2,
        )

    assert len(first.items) == 2
    assert len(second.items) == 2
    assert {row.query for row in first.items}.isdisjoint(
        {row.query for row in second.items}
    )
    # The selection totals are identical from either page.
    assert first.distinct_queries == second.distinct_queries == len(_QUERIES)
    assert first.event_count == second.event_count == len(_QUERIES)


@pytest.mark.asyncio
async def test_search_finds_a_query_stored_beyond_the_first_page(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """The filter runs over the selection, not over the loaded rows."""
    seed = await _seed(session_factory)
    async with session_factory() as session:
        page_one = await get_visibility_fanout(
            session,
            workspace_id=seed.workspace_id,
            project_id=seed.project_id,
            offset=0,
            limit=2,
        )
        found = await get_visibility_fanout(
            session,
            workspace_id=seed.workspace_id,
            project_id=seed.project_id,
            search="pipedrive",
            limit=2,
        )

    # The query is genuinely not on the first page — the case the client-side
    # filter could never satisfy.
    assert "hubspot vs pipedrive" not in {row.query for row in page_one.items}
    assert [row.query for row in found.items] == ["hubspot vs pipedrive"]
    assert found.matched_queries == 1
    # A search narrows the ROWS; it never rewrites the selection totals.
    assert found.distinct_queries == len(_QUERIES)
    assert found.event_count == len(_QUERIES)


@pytest.mark.asyncio
async def test_search_is_case_insensitive_and_reports_no_matches(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    seed = await _seed(session_factory)
    async with session_factory() as session:
        matched = await get_visibility_fanout(
            session,
            workspace_id=seed.workspace_id,
            project_id=seed.project_id,
            search="CRM",
        )
        missing = await get_visibility_fanout(
            session,
            workspace_id=seed.workspace_id,
            project_id=seed.project_id,
            search="no such query",
        )

    assert matched.matched_queries == len(
        [text for text in _QUERIES if "crm" in text.lower()]
    )
    assert all("crm" in row.query.lower() for row in matched.items)
    # No matches is distinct from no data: the selection totals still stand.
    assert missing.matched_queries == 0
    assert missing.items == []
    assert missing.distinct_queries == len(_QUERIES)


@pytest.mark.asyncio
async def test_no_search_matches_every_query(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """Without a search, matched_queries IS the selection's distinct count."""
    seed = await _seed(session_factory)
    async with session_factory() as session:
        result = await get_visibility_fanout(
            session, workspace_id=seed.workspace_id, project_id=seed.project_id
        )
    assert result.matched_queries == result.distinct_queries == len(_QUERIES)
