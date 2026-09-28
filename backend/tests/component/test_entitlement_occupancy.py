"""Component tests for project-slot occupancy enforcement (real Postgres).

Pins the slice23 Task 4 contract for project creates: the occupancy check
runs in the SAME transaction as the insert it guards, under the
account-capacity advisory lock, so concurrent creates from INDEPENDENT
sessions can never push the committed count past the account grant; resolver
allowance changes affect the next mutation immediately; an unresolved
entitlement fails closed and an unprovisioned one is ungated. Prompt-slot
occupancy is enforced and tested by the TypeScript prompt writers.
"""

from __future__ import annotations

import asyncio
import uuid

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config.entitlements import KEY_PROJECT_SLOTS
from app.domain.entitlements.enforcement import (
    OccupancyLimitExceededError,
    OccupancyUnresolvedError,
)
from app.domain.entitlements.types import GrantSpec
from app.domain.projects.schemas import ProjectCreate
from app.domain.projects.service import create_project
from app.models.project import Project
from app.models.workspace import Workspace
from tests.component.occupancy_helpers import (
    seed_account_workspace,
    seed_occupancy_grants,
)


def _project_count_stmt(workspace_id: uuid.UUID):
    return (
        select(func.count())
        .select_from(Project)
        .where(Project.workspace_id == workspace_id)
    )


# =========================================================================
# Concurrent project creates never exceed the grant
# =========================================================================
@pytest.mark.asyncio
async def test_concurrent_project_creates_never_exceed_grant(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    async with session_factory() as session:
        _account, workspace, _user = await seed_account_workspace(session)
        await seed_occupancy_grants(
            session,
            workspace_id=workspace.id,
            grants=(GrantSpec(key=KEY_PROJECT_SLOTS, value=1),),
        )
        await session.commit()

    async def _create(name: str) -> str:
        async with session_factory() as session:
            try:
                await create_project(
                    session,
                    workspace_id=workspace.id,
                    payload=ProjectCreate(name=name),
                )
                return "ok"
            except OccupancyLimitExceededError:
                await session.rollback()
                return "denied"

    # The account advisory lock serializes the two mutations; the loser
    # recounts AFTER the winner commits and is denied.
    results = await asyncio.gather(_create("Alpha"), _create("Beta"))
    assert sorted(results) == ["denied", "ok"]

    async with session_factory() as session:
        count = int(
            (await session.execute(_project_count_stmt(workspace.id))).scalar_one()
        )
    assert count == 1


@pytest.mark.asyncio
async def test_project_slots_are_scoped_to_the_accounts_own_workspace(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """One workspace, one account, one budget.

    Workspace A's single slot is consumed by A's project, so a second project
    in A is denied. Workspace B bills through its OWN account and is
    unaffected — the previous account-wide aggregation across linked
    workspaces is superseded by the owner's one-to-one decision.
    """
    async with session_factory() as session:
        _account, workspace_a, _user = await seed_account_workspace(session)
        _, workspace_b, _ = await seed_account_workspace(session)
        for workspace_id in (workspace_a.id, workspace_b.id):
            await seed_occupancy_grants(
                session,
                workspace_id=workspace_id,
                grants=(GrantSpec(key=KEY_PROJECT_SLOTS, value=1),),
            )
        await session.commit()

    async with session_factory() as session:
        await create_project(
            session,
            workspace_id=workspace_a.id,
            payload=ProjectCreate(name="In A"),
        )
    async with session_factory() as session:
        with pytest.raises(OccupancyLimitExceededError):
            await create_project(
                session,
                workspace_id=workspace_a.id,
                payload=ProjectCreate(name="Second in A"),
            )
        await session.rollback()
    # The other workspace spends its own budget and is not blocked by A.
    async with session_factory() as session:
        await create_project(
            session,
            workspace_id=workspace_b.id,
            payload=ProjectCreate(name="In B"),
        )


# =========================================================================
# Allowance changes
# =========================================================================
@pytest.mark.asyncio
async def test_resolver_allowance_changes_immediately_affect_mutations(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    async with session_factory() as session:
        _account, workspace, _user = await seed_account_workspace(session)
        await seed_occupancy_grants(
            session,
            workspace_id=workspace.id,
            grants=(GrantSpec(key=KEY_PROJECT_SLOTS, value=1),),
        )
        await session.commit()

    async with session_factory() as session:
        await create_project(
            session, workspace_id=workspace.id, payload=ProjectCreate(name="First")
        )
    async with session_factory() as session:
        with pytest.raises(OccupancyLimitExceededError):
            await create_project(
                session,
                workspace_id=workspace.id,
                payload=ProjectCreate(name="Second"),
            )
        await session.rollback()

    # A further grant bumps the account lifecycle version, so the very next
    # mutation resolves the NEW allowance (no cache staleness).
    async with session_factory() as session:
        await seed_occupancy_grants(
            session,
            workspace_id=workspace.id,
            grants=(GrantSpec(key=KEY_PROJECT_SLOTS, value=1),),
        )
        await session.commit()
    async with session_factory() as session:
        await create_project(
            session, workspace_id=workspace.id, payload=ProjectCreate(name="Second")
        )
        count = int(
            (await session.execute(_project_count_stmt(workspace.id))).scalar_one()
        )
        assert count == 2


# =========================================================================
# Fail-closed / unprovisioned resolution semantics
# =========================================================================
@pytest.mark.asyncio
async def test_unresolved_entitlement_fails_closed(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    # A workspace with NO billing link can never resolve an entitlement.
    async with session_factory() as session:
        workspace = Workspace(name="Unlinked WS")
        session.add(workspace)
        await session.flush()
        workspace_id = workspace.id
        await session.commit()

    async with session_factory() as session:
        with pytest.raises(OccupancyUnresolvedError):
            await create_project(
                session,
                workspace_id=workspace_id,
                payload=ProjectCreate(name="Denied"),
            )
        await session.rollback()


@pytest.mark.asyncio
async def test_unprovisioned_account_is_not_occupancy_gated(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    # A linked account with NO grants resolves but has no occupancy
    # capability provisioned: mutations stay ungated (the pre-commercial
    # contract) until any grant exists.
    async with session_factory() as session:
        _account, workspace, _user = await seed_account_workspace(session)
        await session.commit()

    async with session_factory() as session:
        await create_project(
            session, workspace_id=workspace.id, payload=ProjectCreate(name="One")
        )
        await create_project(
            session, workspace_id=workspace.id, payload=ProjectCreate(name="Two")
        )
        count = int(
            (await session.execute(_project_count_stmt(workspace.id))).scalar_one()
        )
        assert count == 2
