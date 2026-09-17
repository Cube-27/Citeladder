"""Tenancy and lifecycle guarantees for externally cited page records.

A source page is project-scoped on purpose: brand and competitor presence are
project-relative, so two projects in one workspace that cite the same URL must
reach their own verdicts without seeing each other's.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config.source_pages import (
    ENTITY_KIND_BRAND,
    INSPECTION_NOT_INSPECTED,
    PAGE_FORMAT_UNRESOLVED,
    PRESENCE_MATCH_EXACT_ALIAS,
    PRESENCE_PRESENT,
)
from app.models.project import Project
from app.models.source_pages import (
    SourcePage,
    SourcePageEntityPresence,
    SourcePageInspectionSpend,
    SourcePageSnapshot,
)
from tests.component.opportunity_helpers import _seed_scenario

pytestmark = pytest.mark.asyncio


def _page(
    *, workspace_id: uuid.UUID, project_id: uuid.UUID, url_hash: str
) -> SourcePage:
    return SourcePage(
        workspace_id=workspace_id,
        project_id=project_id,
        url_hash=url_hash,
        canonical_url=f"https://publisher.example/{url_hash}",
        registrable_domain="publisher.example",
    )


async def test_one_url_is_one_page_per_project(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    async with session_factory() as session:
        scenario = await _seed_scenario(session)
        session.add(
            _page(
                workspace_id=scenario.workspace_id,
                project_id=scenario.project_id,
                url_hash="a" * 64,
            )
        )
        await session.commit()

        session.add(
            _page(
                workspace_id=scenario.workspace_id,
                project_id=scenario.project_id,
                url_hash="a" * 64,
            )
        )
        with pytest.raises(IntegrityError):
            await session.commit()


async def test_two_projects_reach_independent_verdicts_on_one_url(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """The same cited URL is a separate record, and a separate verdict, per project."""
    async with session_factory() as session:
        scenario = await _seed_scenario(session)
        sibling = Project(
            workspace_id=scenario.workspace_id,
            name="Sibling",
            website_url="https://sibling.example",
        )
        session.add(sibling)
        await session.flush()

        shared_hash = "b" * 64
        for project_id in (scenario.project_id, sibling.id):
            session.add(
                _page(
                    workspace_id=scenario.workspace_id,
                    project_id=project_id,
                    url_hash=shared_hash,
                )
            )
        await session.commit()

        owned = list(
            (
                await session.scalars(
                    select(SourcePage).where(
                        SourcePage.project_id == scenario.project_id,
                        SourcePage.url_hash == shared_hash,
                    )
                )
            ).all()
        )

        assert len(owned) == 1
        assert owned[0].project_id == scenario.project_id
        assert owned[0].inspection_state == INSPECTION_NOT_INSPECTED
        assert owned[0].page_format == PAGE_FORMAT_UNRESOLVED


async def test_deleting_a_project_removes_its_pages_and_their_evidence(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    async with session_factory() as session:
        scenario = await _seed_scenario(session)
        page = _page(
            workspace_id=scenario.workspace_id,
            project_id=scenario.project_id,
            url_hash="c" * 64,
        )
        session.add(page)
        await session.flush()
        snapshot = SourcePageSnapshot(
            workspace_id=scenario.workspace_id,
            project_id=scenario.project_id,
            source_page_id=page.id,
            requested_url=page.canonical_url,
            final_url=page.canonical_url,
            outcome="inspected",
            extracted_chars=1200,
            fetched_at=datetime.now(UTC),
        )
        session.add(snapshot)
        await session.flush()
        page.latest_snapshot_id = snapshot.id
        session.add_all(
            [
                SourcePageEntityPresence(
                    workspace_id=scenario.workspace_id,
                    project_id=scenario.project_id,
                    source_page_id=page.id,
                    snapshot_id=snapshot.id,
                    entity_kind=ENTITY_KIND_BRAND,
                    entity_name="Acme",
                    presence=PRESENCE_PRESENT,
                    match_method=PRESENCE_MATCH_EXACT_ALIAS,
                    match_count=2,
                    roster_version="roster-1",
                ),
                SourcePageInspectionSpend(
                    workspace_id=scenario.workspace_id,
                    project_id=scenario.project_id,
                    source_page_id=page.id,
                    spend_kind="page",
                    idempotency_key=f"spend:{page.id}",
                ),
            ]
        )
        await session.commit()

        project = await session.get(Project, scenario.project_id)
        assert project is not None
        await session.delete(project)
        await session.commit()

        for model in (
            SourcePage,
            SourcePageSnapshot,
            SourcePageEntityPresence,
            SourcePageInspectionSpend,
        ):
            remaining = list((await session.scalars(select(model))).all())
            assert remaining == [], model.__name__


async def test_one_entity_has_one_verdict_per_snapshot(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """Two verdicts for one entity on one snapshot would be a contradiction."""
    async with session_factory() as session:
        scenario = await _seed_scenario(session)
        page = _page(
            workspace_id=scenario.workspace_id,
            project_id=scenario.project_id,
            url_hash="d" * 64,
        )
        session.add(page)
        await session.flush()
        snapshot = SourcePageSnapshot(
            workspace_id=scenario.workspace_id,
            project_id=scenario.project_id,
            source_page_id=page.id,
            requested_url=page.canonical_url,
            final_url=page.canonical_url,
            outcome="inspected",
            extracted_chars=900,
        )
        session.add(snapshot)
        await session.flush()

        def presence() -> SourcePageEntityPresence:
            return SourcePageEntityPresence(
                workspace_id=scenario.workspace_id,
                project_id=scenario.project_id,
                source_page_id=page.id,
                snapshot_id=snapshot.id,
                entity_kind=ENTITY_KIND_BRAND,
                entity_name="Acme",
                presence=PRESENCE_PRESENT,
                match_method=PRESENCE_MATCH_EXACT_ALIAS,
                roster_version="roster-1",
            )

        session.add(presence())
        await session.commit()
        session.add(presence())
        with pytest.raises(IntegrityError):
            await session.commit()


async def test_budget_spend_is_recorded_once_per_key(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """A replayed claim must not spend the window twice."""
    async with session_factory() as session:
        scenario = await _seed_scenario(session)

        def spend() -> SourcePageInspectionSpend:
            return SourcePageInspectionSpend(
                workspace_id=scenario.workspace_id,
                project_id=scenario.project_id,
                spend_kind="page",
                idempotency_key="claim:once",
            )

        session.add(spend())
        await session.commit()
        session.add(spend())
        with pytest.raises(IntegrityError):
            await session.commit()
