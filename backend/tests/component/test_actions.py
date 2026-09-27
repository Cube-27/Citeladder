"""Action status, agent attach and workspace isolation over a refreshed live set.

The refresh that groups Opportunities into Actions is TypeScript (migration
PR 7a, ``opportunity-refresh.test.ts``); ``seed_live_set`` writes its result.
"""

from __future__ import annotations

import asyncio
import uuid

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.domain.opportunities import actions
from app.domain.opportunities.errors import (
    OpportunityNotFoundError,
    OpportunityValidationError,
)
from app.models.opportunity import Action
from tests.component.opportunity_helpers import URL_B, _seed_scenario, seed_live_set


async def _actions(session: AsyncSession, project_id: uuid.UUID) -> dict[str, Action]:
    rows = (
        await session.scalars(select(Action).where(Action.project_id == project_id))
    ).all()
    return {row.target_label: row for row in rows}


async def test_agent_work_on_a_page_with_evidence_attaches_to_its_action(
    db_session: AsyncSession,
) -> None:
    scn = await _seed_scenario(db_session)
    await seed_live_set(db_session, scn)
    evidence_action = (await _actions(db_session, scn.project_id))[URL_B]

    attached = await actions.attach_or_create_action(
        db_session,
        workspace_id=scn.workspace_id,
        project_id=scn.project_id,
        target_kind="page",
        target="https://ACME.test/b",
        user_id=scn.user_id,
    )

    assert attached.id == evidence_action.id
    assert attached.origin == "evidence"


async def test_concurrent_agent_attach_creates_one_action(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    async with session_factory() as seed_session:
        scn = await _seed_scenario(seed_session)

    async def attach() -> uuid.UUID:
        async with session_factory() as session:
            action = await actions.attach_or_create_action(
                session,
                workspace_id=scn.workspace_id,
                project_id=scn.project_id,
                target_kind="planned_page",
                target="A practical school-uniform checklist",
                user_id=scn.user_id,
            )
            await session.commit()
            return action.id

    ids = await asyncio.gather(attach(), attach())

    assert ids[0] == ids[1]
    async with session_factory() as session:
        rows = (
            await session.scalars(
                select(Action).where(Action.project_id == scn.project_id)
            )
        ).all()
    assert [row.origin for row in rows] == ["agent"]


async def test_agent_work_cannot_target_a_domain_the_project_does_not_own(
    db_session: AsyncSession,
) -> None:
    scn = await _seed_scenario(db_session)

    with pytest.raises(OpportunityValidationError):
        await actions.attach_or_create_action(
            db_session,
            workspace_id=scn.workspace_id,
            project_id=scn.project_id,
            target_kind="page",
            target="https://blog.acme.test/b",
            user_id=scn.user_id,
        )


async def test_actions_are_workspace_isolated(db_session: AsyncSession) -> None:
    owner = await _seed_scenario(db_session)
    other = await _seed_scenario(db_session)
    await seed_live_set(db_session, owner)
    action = next(iter((await _actions(db_session, owner.project_id)).values()))

    with pytest.raises(OpportunityNotFoundError):
        await actions.get_action(
            db_session, workspace_id=other.workspace_id, action_id=action.id
        )
    with pytest.raises(OpportunityNotFoundError):
        await actions.list_actions(
            db_session, workspace_id=other.workspace_id, project_id=owner.project_id
        )
