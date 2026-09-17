"""The read and inspect endpoints for a cited page.

The invariant these defend is that reads render persisted projections and never
crawl. The tempting shortcut is "inspect it when someone opens it", which turns
every page view into third-party traffic the budget never approved.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config.source_pages import (
    ENTITY_KIND_BRAND,
    ENTITY_KIND_COMPETITOR,
    INSPECTION_BLOCKED,
    INSPECTION_INSPECTED,
    INSPECTION_NOT_INSPECTED,
    INSPECTION_REASON_ROBOTS,
    INSPECTION_STALE,
    PRESENCE_MATCH_EXACT_ALIAS,
    PRESENCE_MATCH_NONE,
    PRESENCE_NOT_DETECTED,
    PRESENCE_PRESENT,
    SOURCE_PAGE_BUDGET_PER_WINDOW,
)
from app.models.source_pages import (
    SourcePage,
    SourcePageEntityPresence,
    SourcePageInspectionSpend,
    SourcePageSnapshot,
)
from tests.component.opportunity_helpers import Scenario, _seed_scenario

pytestmark = pytest.mark.asyncio

_EMAIL = "source-page-api@example.com"
_HASH = "a" * 64


async def _login(client: httpx.AsyncClient) -> None:
    from tests.component.auth_helpers import grant_test_capabilities, register_and_login

    await register_and_login(client, _EMAIL)
    await grant_test_capabilities(_EMAIL)


async def _seed_page(
    session: AsyncSession,
    scenario: Scenario,
    *,
    state: str = INSPECTION_INSPECTED,
    reason: str | None = None,
    inspected: bool = True,
) -> SourcePage:
    page = SourcePage(
        workspace_id=scenario.workspace_id,
        project_id=scenario.project_id,
        url_hash=_HASH,
        canonical_url="https://publisher.com/best-crm",
        registrable_domain="publisher.com",
        source_class="editorial_third_party",
        page_format="listicle",
        page_format_method="heading_evidence",
        inspection_state=state,
        inspection_reason=reason,
        recurrence_count=4,
        last_cited_at=datetime.now(UTC),
    )
    session.add(page)
    await session.flush()
    if not inspected:
        return page

    snapshot = SourcePageSnapshot(
        workspace_id=scenario.workspace_id,
        project_id=scenario.project_id,
        source_page_id=page.id,
        requested_url=page.canonical_url,
        final_url=page.canonical_url,
        outcome="inspected",
        extracted_chars=4200,
        page_facts={"title": "Best CRM tools"},
        evidence_passages=[{"text": "Globex leads the field.", "char_start": 0}],
    )
    session.add(snapshot)
    await session.flush()
    page.latest_snapshot_id = snapshot.id
    page.last_inspected_at = datetime.now(UTC) - timedelta(hours=1)
    session.add_all(
        [
            SourcePageEntityPresence(
                workspace_id=scenario.workspace_id,
                project_id=scenario.project_id,
                source_page_id=page.id,
                snapshot_id=snapshot.id,
                entity_kind=ENTITY_KIND_BRAND,
                entity_name="Acme Corp",
                presence=PRESENCE_NOT_DETECTED,
                match_method=PRESENCE_MATCH_NONE,
                roster_version="roster-1",
            ),
            SourcePageEntityPresence(
                workspace_id=scenario.workspace_id,
                project_id=scenario.project_id,
                source_page_id=page.id,
                snapshot_id=snapshot.id,
                entity_kind=ENTITY_KIND_COMPETITOR,
                entity_name="Globex",
                presence=PRESENCE_PRESENT,
                match_method=PRESENCE_MATCH_EXACT_ALIAS,
                match_count=2,
                passage_refs=[0],
                roster_version="roster-1",
            ),
        ]
    )
    return page


async def test_an_inspected_page_reports_its_findings_with_evidence(
    client: httpx.AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    await _login(client)
    async with session_factory() as session:
        scenario = await _seed_scenario(session, email=_EMAIL)
        await _seed_page(session, scenario)
        await session.commit()

    response = await client.get(
        f"/api/v1/projects/{scenario.project_id}/source-pages/{_HASH}",
        headers={"X-Workspace-Id": str(scenario.workspace_id)},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["page_format"] == "listicle"
    assert body["limitations"] == []
    entities = {item["entity_name"]: item for item in body["entities"]}
    # The brand is listed first: its own presence is the finding that matters.
    assert body["entities"][0]["entity_name"] == "Acme Corp"
    assert entities["Acme Corp"]["state"] == PRESENCE_NOT_DETECTED
    assert entities["Acme Corp"]["passages"] == []
    assert entities["Globex"]["state"] == PRESENCE_PRESENT
    assert entities["Globex"]["passages"] == ["Globex leads the field."]


async def test_an_uninspected_page_is_never_reported_as_an_absence(
    client: httpx.AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    await _login(client)
    async with session_factory() as session:
        scenario = await _seed_scenario(session, email=_EMAIL)
        await _seed_page(
            session, scenario, state=INSPECTION_NOT_INSPECTED, inspected=False
        )
        await session.commit()

    response = await client.get(
        f"/api/v1/projects/{scenario.project_id}/source-pages/{_HASH}",
        headers={"X-Workspace-Id": str(scenario.workspace_id)},
    )

    body = response.json()
    assert body["inspection_state"] == INSPECTION_NOT_INSPECTED
    assert body["entities"] == []
    assert body["extracted_chars"] == 0
    assert body["limitations"] == ["This page has not been inspected."]


async def test_a_blocked_page_says_so_rather_than_claiming_a_verdict(
    client: httpx.AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    await _login(client)
    async with session_factory() as session:
        scenario = await _seed_scenario(session, email=_EMAIL)
        await _seed_page(
            session,
            scenario,
            state=INSPECTION_BLOCKED,
            reason=INSPECTION_REASON_ROBOTS,
            inspected=False,
        )
        await session.commit()

    body = (
        await client.get(
            f"/api/v1/projects/{scenario.project_id}/source-pages/{_HASH}",
            headers={"X-Workspace-Id": str(scenario.workspace_id)},
        )
    ).json()

    assert body["inspection_reason"] == INSPECTION_REASON_ROBOTS
    assert "does not permit automated access" in body["limitations"][0]


async def test_a_stale_page_overrides_its_own_last_verdict(
    client: httpx.AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """An old reading must not be presented as what is true today."""
    await _login(client)
    async with session_factory() as session:
        scenario = await _seed_scenario(session, email=_EMAIL)
        page = await _seed_page(session, scenario)
        page.inspection_state = INSPECTION_STALE
        await session.commit()

    body = (
        await client.get(
            f"/api/v1/projects/{scenario.project_id}/source-pages/{_HASH}",
            headers={"X-Workspace-Id": str(scenario.workspace_id)},
        )
    ).json()

    assert {entity["state"] for entity in body["entities"]} == {INSPECTION_STALE}
    assert "may have changed" in body["limitations"][0]


async def test_reading_a_page_never_spends_budget(
    client: httpx.AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """Reads render persisted projections; they do not become traffic."""
    await _login(client)
    async with session_factory() as session:
        scenario = await _seed_scenario(session, email=_EMAIL)
        await _seed_page(
            session, scenario, state=INSPECTION_NOT_INSPECTED, inspected=False
        )
        await session.commit()

    for _ in range(3):
        await client.get(
            f"/api/v1/projects/{scenario.project_id}/source-pages/{_HASH}",
            headers={"X-Workspace-Id": str(scenario.workspace_id)},
        )

    async with session_factory() as session:
        spend = list((await session.scalars(select(SourcePageInspectionSpend))).all())
        page = await session.scalar(select(SourcePage))
        assert page is not None
        assert spend == []
        assert page.inspection_state == INSPECTION_NOT_INSPECTED


async def test_an_explicit_inspection_request_is_admitted_and_paid_for(
    client: httpx.AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    await _login(client)
    async with session_factory() as session:
        scenario = await _seed_scenario(session, email=_EMAIL)
        await _seed_page(
            session, scenario, state=INSPECTION_NOT_INSPECTED, inspected=False
        )
        await session.commit()

    response = await client.post(
        f"/api/v1/projects/{scenario.project_id}/source-pages/{_HASH}/inspect",
        headers={"X-Workspace-Id": str(scenario.workspace_id)},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["accepted"] is True
    assert body["budget_remaining"] == SOURCE_PAGE_BUDGET_PER_WINDOW - 1
    async with session_factory() as session:
        spend = list((await session.scalars(select(SourcePageInspectionSpend))).all())
        assert len(spend) == 1


async def test_an_explicit_request_cannot_bypass_an_exhausted_window(
    client: httpx.AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """A page someone asked for is not free."""
    await _login(client)
    async with session_factory() as session:
        scenario = await _seed_scenario(session, email=_EMAIL)
        await _seed_page(
            session, scenario, state=INSPECTION_NOT_INSPECTED, inspected=False
        )
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

    body = (
        await client.post(
            f"/api/v1/projects/{scenario.project_id}/source-pages/{_HASH}/inspect",
            headers={"X-Workspace-Id": str(scenario.workspace_id)},
        )
    ).json()

    assert body["accepted"] is False
    assert body["budget_remaining"] == 0


async def test_a_page_from_another_project_is_not_found(
    client: httpx.AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    await _login(client)
    async with session_factory() as session:
        scenario = await _seed_scenario(session, email=_EMAIL)
        other = await _seed_scenario(session)
        await _seed_page(session, other)
        await session.commit()

    response = await client.get(
        f"/api/v1/projects/{scenario.project_id}/source-pages/{_HASH}",
        headers={"X-Workspace-Id": str(scenario.workspace_id)},
    )

    assert response.status_code == 404
