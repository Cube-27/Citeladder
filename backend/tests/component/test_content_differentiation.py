from __future__ import annotations

import uuid

import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config.audits import AUDIT_TRIGGER_MANUAL
from app.domain.audits.creation import create_audit
from app.domain.audits.reads import list_tasks
from app.domain.content_differentiation import _load_candidates
from app.models.audit import Audit, AuditTask
from app.models.content_differentiation import ContentDifferentiationCandidate
from app.models.source_pages import SourcePage
from tests.component.audit_helpers import seed_audit_fixtures


@pytest.mark.asyncio
async def test_page_refresh_loads_every_candidate_of_affected_historical_tasks(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    async with session_factory() as session:
        seed = await seed_audit_fixtures(session, prompt_count=2)
        previous = await create_audit(
            session,
            workspace_id=seed.workspace_id,
            project_id=seed.project_id,
            engines=seed.engines,
            trigger=AUDIT_TRIGGER_MANUAL,
            prompt_set_id=seed.prompt_set_id,
            repetitions=1,
        )
        current = await create_audit(
            session,
            workspace_id=seed.workspace_id,
            project_id=seed.project_id,
            engines=seed.engines,
            trigger=AUDIT_TRIGGER_MANUAL,
            prompt_set_id=seed.prompt_set_id,
            repetitions=1,
        )
        tasks = await list_tasks(
            session, workspace_id=seed.workspace_id, audit_id=previous.id
        )
        pages = [
            SourcePage(
                workspace_id=seed.workspace_id,
                project_id=seed.project_id,
                url_hash=uuid.uuid4().hex,
                canonical_url=f"https://example.org/{index}",
            )
            for index in range(3)
        ]
        session.add_all(pages)
        await session.flush()
        session.add_all(
            ContentDifferentiationCandidate(
                workspace_id=seed.workspace_id,
                project_id=seed.project_id,
                audit_id=previous.id,
                audit_task_id=task.id,
                source_page_id=page.id,
                query_text="example",
                rank=rank,
            )
            for task, page, rank in (
                (tasks[0], pages[0], 1),
                (tasks[0], pages[1], 2),
                (tasks[1], pages[2], 1),
            )
        )
        await session.commit()

    async with session_factory() as session:
        rows = await _load_candidates(
            session,
            workspace_id=seed.workspace_id,
            project_id=seed.project_id,
            audit_id=current.id,
            source_page_ids={pages[0].id},
        )

    assert [
        (candidate.audit_task_id, candidate.source_page_id) for candidate, _, _ in rows
    ] == [
        (tasks[0].id, pages[0].id),
        (tasks[0].id, pages[1].id),
    ]


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
