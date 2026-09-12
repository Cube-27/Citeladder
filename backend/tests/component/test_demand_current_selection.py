"""The CURRENT Demand snapshot is the one describing the latest period.

Prompt generation and the Opportunity demand adapter each kept their own copy
of this query, and both ordered by ``created_at`` — when the row was written,
not the period it observed. A historical backfill finishing tonight therefore
became "current" guidance the moment it landed, displacing a snapshot that
actually describes this month.
"""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime, timedelta

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.demand.selection import current_demand_snapshot
from app.models.demand import DemandSnapshot
from app.models.project import Project
from app.models.workspace import Workspace


async def _seed(session: AsyncSession) -> tuple[uuid.UUID, uuid.UUID]:
    workspace = Workspace(name="Acme")
    session.add(workspace)
    await session.flush()
    project = Project(
        workspace_id=workspace.id, name="Acme site", website_url="https://acme.example"
    )
    session.add(project)
    await session.flush()
    return workspace.id, project.id


def _snapshot(
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    *,
    window_end: date,
    created_at: datetime,
    tag: str,
) -> DemandSnapshot:
    return DemandSnapshot(
        workspace_id=workspace_id,
        project_id=project_id,
        window_start=window_end - timedelta(days=27),
        window_end=window_end,
        source_hash=tag,
        created_at=created_at,
        analyzer_version="d1",
        formula_version="f1",
    )


@pytest.mark.asyncio
async def test_a_late_backfill_does_not_become_current_guidance(
    db_session: AsyncSession,
) -> None:
    """Written last is not the same as observed last."""
    workspace_id, project_id = await _seed(db_session)
    recent = _snapshot(
        workspace_id,
        project_id,
        window_end=date(2026, 9, 1),
        created_at=datetime(2026, 9, 2, tzinfo=UTC),
        tag="recent-window",
    )
    # Computed AFTER the recent one, but over a window from months earlier —
    # exactly what a history backfill produces when it finishes.
    backfill = _snapshot(
        workspace_id,
        project_id,
        window_end=date(2026, 3, 1),
        created_at=datetime(2026, 9, 9, tzinfo=UTC),
        tag="old-window",
    )
    db_session.add_all([recent, backfill])
    await db_session.commit()

    current = await current_demand_snapshot(
        db_session, workspace_id=workspace_id, project_id=project_id
    )
    assert current is not None
    assert current.id == recent.id
    assert current.created_at < backfill.created_at


@pytest.mark.asyncio
async def test_same_window_resolves_to_the_later_computation(
    db_session: AsyncSession,
) -> None:
    """Two readings of one period: the newer computation wins."""
    workspace_id, project_id = await _seed(db_session)
    first = _snapshot(
        workspace_id,
        project_id,
        window_end=date(2026, 9, 1),
        created_at=datetime(2026, 9, 2, tzinfo=UTC),
        tag="first-pass",
    )
    recomputed = _snapshot(
        workspace_id,
        project_id,
        window_end=date(2026, 9, 1),
        created_at=datetime(2026, 9, 5, tzinfo=UTC),
        tag="recomputed",
    )
    db_session.add_all([first, recomputed])
    await db_session.commit()

    current = await current_demand_snapshot(
        db_session, workspace_id=workspace_id, project_id=project_id
    )
    assert current is not None
    assert current.id == recomputed.id


@pytest.mark.asyncio
async def test_no_snapshot_is_distinct_from_an_empty_one(
    db_session: AsyncSession,
) -> None:
    """A project that has never computed Demand has no snapshot, not a blank."""
    workspace_id, project_id = await _seed(db_session)
    await db_session.commit()
    assert (
        await current_demand_snapshot(
            db_session, workspace_id=workspace_id, project_id=project_id
        )
        is None
    )


@pytest.mark.asyncio
async def test_another_project_snapshot_is_never_returned(
    db_session: AsyncSession,
) -> None:
    workspace_id, project_id = await _seed(db_session)
    other = Project(
        workspace_id=workspace_id, name="Other", website_url="https://other.example"
    )
    db_session.add(other)
    await db_session.flush()
    db_session.add(
        _snapshot(
            workspace_id,
            other.id,
            window_end=date(2026, 9, 1),
            created_at=datetime(2026, 9, 2, tzinfo=UTC),
            tag="other-project",
        )
    )
    await db_session.commit()

    assert (
        await current_demand_snapshot(
            db_session, workspace_id=workspace_id, project_id=project_id
        )
        is None
    )
