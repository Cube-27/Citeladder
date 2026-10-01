from __future__ import annotations

import uuid

import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config.audits import AUDIT_TRIGGER_MANUAL
from app.domain.agent.tool_catalog import build_agent_tools, execute_tool
from app.domain.audits.creation import create_audit
from app.domain.audits.reads import list_tasks
from app.models.audit import Audit, AuditTask
from app.models.content_differentiation import (
    ContentDifferentiationReport,
)
from app.models.source_pages import SourcePage
from app.models.workspace import WorkspaceMember
from tests.component.audit_helpers import Seed, seed_audit_fixtures


@pytest.mark.asyncio
async def test_audit_and_source_page_project_ownership_is_enforced(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    async with session_factory() as session:
        first = await seed_audit_fixtures(session, prompt_count=1)
        second = await seed_audit_fixtures(session, prompt_count=1)
        audit = await create_audit(
            session,
            workspace_id=first.workspace_id,
            project_id=first.project_id,
            engines=first.engines,
            trigger=AUDIT_TRIGGER_MANUAL,
            prompt_set_id=first.prompt_set_id,
            repetitions=1,
        )
        task = (
            await list_tasks(
                session, workspace_id=first.workspace_id, audit_id=audit.id
            )
        )[0]
        await session.commit()

    async with session_factory() as session:
        session.add(
            Audit(workspace_id=first.workspace_id, project_id=second.project_id)
        )
        with pytest.raises(IntegrityError):
            await session.commit()

    async with session_factory() as session:
        session.add(
            SourcePage(
                workspace_id=first.workspace_id,
                project_id=second.project_id,
                url_hash=uuid.uuid4().hex,
                canonical_url="https://example.org/cross-workspace",
            )
        )
        with pytest.raises(IntegrityError):
            await session.commit()

    async with session_factory() as session:
        stored_task = await session.get(AuditTask, task.id)
        assert stored_task is not None
        stored_task.project_id = second.project_id
        with pytest.raises(IntegrityError):
            await session.commit()


async def _seed_report(session: AsyncSession, seed: Seed) -> uuid.UUID:
    audit = await create_audit(
        session,
        workspace_id=seed.workspace_id,
        project_id=seed.project_id,
        engines=seed.engines,
        trigger=AUDIT_TRIGGER_MANUAL,
        prompt_set_id=seed.prompt_set_id,
        repetitions=1,
    )
    task = (
        await list_tasks(session, workspace_id=seed.workspace_id, audit_id=audit.id)
    )[0]
    report = ContentDifferentiationReport(
        workspace_id=seed.workspace_id,
        project_id=seed.project_id,
        audit_id=audit.id,
        audit_task_id=task.id,
        formula_version="fixture",
        report={"state": "available"},
    )
    session.add(report)
    await session.flush()
    return report.id


async def _owner(session: AsyncSession, seed: Seed) -> uuid.UUID:
    user_id = await session.scalar(
        select(WorkspaceMember.user_id).where(
            WorkspaceMember.workspace_id == seed.workspace_id
        )
    )
    assert user_id is not None
    return user_id


@pytest.mark.asyncio
async def test_the_agent_reads_only_its_own_projects_differentiation_reports(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    async with session_factory() as session:
        mine = await seed_audit_fixtures(session, prompt_count=1)
        theirs = await seed_audit_fixtures(session, prompt_count=1)
        my_report = await _seed_report(session, mine)
        await _seed_report(session, theirs)
        me, them = await _owner(session, mine), await _owner(session, theirs)
        await session.commit()
    tool = build_agent_tools(session_factory)["list_content_differentiation"]

    outcome = await execute_tool(
        tool, project_id=mine.project_id, member_user_id=me, arguments={}
    )

    assert [item["id"] for item in outcome.payload["items"]] == [str(my_report)]
    # A member of another workspace cannot read this project's reports.
    with pytest.raises(LookupError):
        await execute_tool(
            tool, project_id=mine.project_id, member_user_id=them, arguments={}
        )
