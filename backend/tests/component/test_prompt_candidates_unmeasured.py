"""Generated-prompt candidates are never measured.

Candidates are staged by Generate and live outside ``prompts``; a pending one
is never audited or counted as a tracked prompt. Review (the only way in) is
owned and tested by the TypeScript API.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config.audits import AUDIT_TRIGGER_MANUAL
from app.domain.audits.creation import create_audit
from app.domain.audits.reads import list_tasks
from app.domain.command_center.service import get_command_center
from app.domain.prompts.normalization import prompt_text_hash
from app.models.project import Project
from app.models.prompt_candidate import PromptCandidate, PromptGenerationRun
from tests.component.audit_helpers import seed_audit_fixtures


@pytest.mark.asyncio
async def test_pending_candidates_never_reach_audits_or_tracked_counts(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    async with session_factory() as session:
        seed = await seed_audit_fixtures(session, prompt_count=2)
        run = PromptGenerationRun(
            workspace_id=seed.workspace_id,
            project_id=seed.project_id,
            prompt_set_id=seed.prompt_set_id,
            generator_version="test",
        )
        session.add(run)
        await session.flush()
        for index in range(3):
            session.add(
                PromptCandidate(
                    workspace_id=seed.workspace_id,
                    run_id=run.id,
                    prompt_set_id=seed.prompt_set_id,
                    text=f"best staged option {index} for acme",
                    normalized_text_hash=prompt_text_hash(
                        f"best staged option {index} for acme"
                    ),
                    expires_at=datetime.now(UTC) + timedelta(days=1),
                )
            )
        await session.commit()

    async with session_factory() as session:
        audit = await create_audit(
            session,
            trigger=AUDIT_TRIGGER_MANUAL,
            workspace_id=seed.workspace_id,
            project_id=seed.project_id,
            engines=seed.engines,
            prompt_set_id=seed.prompt_set_id,
            repetitions=1,
        )
        tasks = await list_tasks(
            session, workspace_id=seed.workspace_id, audit_id=audit.id
        )
        assert len(tasks) == len(seed.prompt_ids)
        assert not any("staged" in task.prompt_text for task in tasks)

        project = await session.scalar(
            select(Project).where(Project.id == seed.project_id)
        )
        assert project is not None
        overview = await get_command_center(
            session, workspace_id=seed.workspace_id, project=project
        )
        assert overview.active_prompt_count == len(seed.prompt_ids)
