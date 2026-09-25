"""Action identity across recompute, agent attach, and workspace isolation."""

from __future__ import annotations

import asyncio
import uuid

import pytest
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.domain.opportunities import actions, recompute
from app.domain.opportunities.errors import (
    OpportunityNotFoundError,
    OpportunityValidationError,
)
from app.models.opportunity import Action
from app.models.site_health.analysis import SiteIssue
from tests.component.opportunity_helpers import URL_A, URL_B, _seed_scenario


async def _actions(session: AsyncSession, project_id: uuid.UUID) -> dict[str, Action]:
    rows = (
        await session.scalars(select(Action).where(Action.project_id == project_id))
    ).all()
    return {row.target_label: row for row in rows}


async def test_recompute_groups_members_and_keeps_action_identity(
    db_session: AsyncSession,
) -> None:
    scn = await _seed_scenario(db_session)
    await recompute.recompute(
        db_session, workspace_id=scn.workspace_id, project_id=scn.project_id
    )
    first = await _actions(db_session, scn.project_id)

    page_a = first[URL_A]
    assert page_a.approach == "fix_technical"
    assert page_a.families == ["site_health"]
    assert page_a.diagnosis["families"]["search_console"] == "unavailable"
    prompt_actions = [row for row in first.values() if row.target_kind == "prompt"]
    assert sum(len(row.member_opportunity_ids) for row in prompt_actions) == 2
    first_ids = {label: row.id for label, row in first.items()}
    first_members = list(page_a.member_opportunity_ids)

    await recompute.recompute(
        db_session, workspace_id=scn.workspace_id, project_id=scn.project_id
    )
    db_session.expire_all()
    second = await _actions(db_session, scn.project_id)

    assert {label: row.id for label, row in second.items()} == first_ids
    # The members are the NEW live rows, not the superseded ones.
    assert second[URL_A].member_opportunity_ids != first_members


async def test_an_action_whose_evidence_stops_firing_keeps_its_identity(
    db_session: AsyncSession,
) -> None:
    scn = await _seed_scenario(db_session)
    await recompute.recompute(
        db_session, workspace_id=scn.workspace_id, project_id=scn.project_id
    )
    page_b_id = (await _actions(db_session, scn.project_id))[URL_B].id

    await db_session.execute(delete(SiteIssue).where(SiteIssue.id == scn.issue_thin_id))
    await db_session.commit()
    await recompute.recompute(
        db_session, workspace_id=scn.workspace_id, project_id=scn.project_id
    )
    db_session.expire_all()

    cleared = await db_session.get(Action, page_b_id)
    assert cleared is not None
    assert cleared.member_opportunity_ids == []
    assert cleared.priority_score is None
    assert cleared.evidence_cleared_at is not None
    listed, _ = await actions.list_actions(
        db_session, workspace_id=scn.workspace_id, project_id=scn.project_id
    )
    assert page_b_id not in {row.id for row in listed}


async def test_agent_work_on_a_page_with_evidence_attaches_to_its_action(
    db_session: AsyncSession,
) -> None:
    scn = await _seed_scenario(db_session)
    await recompute.recompute(
        db_session, workspace_id=scn.workspace_id, project_id=scn.project_id
    )
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
    await recompute.recompute(
        db_session, workspace_id=owner.workspace_id, project_id=owner.project_id
    )
    action = next(iter((await _actions(db_session, owner.project_id)).values()))

    with pytest.raises(OpportunityNotFoundError):
        await actions.get_action(
            db_session, workspace_id=other.workspace_id, action_id=action.id
        )
    with pytest.raises(OpportunityNotFoundError):
        await actions.list_actions(
            db_session, workspace_id=other.workspace_id, project_id=owner.project_id
        )
