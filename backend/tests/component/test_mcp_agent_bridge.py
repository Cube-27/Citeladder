"""Retained Python Agent projection bridges, retired when PR 19 moves its tools."""

from __future__ import annotations

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config.opportunities import OPPORTUNITY_TYPE_SITE
from app.domain.mcp.common import read_as_member
from app.domain.mcp.data import (
    list_account_projects,
    project_business_context,
    read_growth_evidence,
    search_business_context,
)
from app.domain.mcp.retrieval import fetch_business_record
from app.models.opportunity import Opportunity
from app.models.project import Project
from app.models.prompt import Prompt, PromptSet
from app.models.user import User
from app.models.workspace import Workspace, WorkspaceMember


@pytest.mark.asyncio
async def test_system_workspace_membership_authorizes_no_read_path(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """A stray SYSTEM-workspace membership must authorize nothing (T11).

    System workspaces cannot have memberships, so this row should not exist —
    which is exactly why it is worth pinning. ``list_account_projects`` filtered
    ``is_system`` while the other six reads joined ``WorkspaceMember`` inline
    without it, so the same stray row hid a project from the list and served its
    opportunities, prompts and business context from every other tool. Every
    read path is asserted here, not just the listing, because the bug was the
    two halves disagreeing.
    """
    async with session_factory() as session:
        user = User(email="system-boundary@example.test", hashed_password="unused")
        system_workspace = Workspace(name="system", is_system=True)
        session.add_all([user, system_workspace])
        await session.flush()
        project = Project(
            workspace_id=system_workspace.id,
            name="System project",
            brand_name="System Brand",
            website_url="https://system.test",
        )
        session.add_all(
            [
                WorkspaceMember(workspace_id=system_workspace.id, user_id=user.id),
                project,
            ]
        )
        await session.flush()
        # Prompts reach the workspace through PromptSet -> Project, which is
        # why the MCP prompt reads join that way.
        prompt_set = PromptSet(project_id=project.id, name="Set")
        opportunity = Opportunity(
            workspace_id=system_workspace.id,
            project_id=project.id,
            rule_id="technical.indexable",
            opportunity_type=OPPORTUNITY_TYPE_SITE,
            target_key="https://system.test/",
            severity="critical",
            title="System opportunity",
            remediation="Should never be readable over MCP",
        )
        session.add_all([prompt_set, opportunity])
        await session.flush()
        prompt = Prompt(prompt_set_id=prompt_set.id, text="System prompt text")
        session.add(prompt)
        await session.commit()
        project_id, opportunity_id, prompt_id = project.id, opportunity.id, prompt.id

    with read_as_member(user.id):
        async with session_factory() as session:
            assert (await list_account_projects(session))["projects"] == []

            assert (await search_business_context(session, "System"))["results"] == []

            with pytest.raises(LookupError, match="not found"):
                await project_business_context(session, str(project_id))

            with pytest.raises(LookupError, match="not found"):
                await read_growth_evidence(
                    session, str(project_id), "site.read_snapshot"
                )

            for record_id in (
                f"citeladder://project/{project_id}",
                f"citeladder://opportunity/{opportunity_id}",
                f"citeladder://prompt/{prompt_id}",
            ):
                with pytest.raises(LookupError, match="not found"):
                    await fetch_business_record(session, record_id)
