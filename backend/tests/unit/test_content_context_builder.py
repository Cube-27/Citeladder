"""Canonical content-context projections."""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.domain.content.context_builder import (
    ContentContext,
    ContentContextNotFoundError,
    build_content_context,
)
from app.domain.content.website_context import CrawlFragmentSelection
from app.models.brand import Brand, BrandAlias, BrandProfile, Competitor
from app.models.project import Project
from app.models.workspace import Workspace


async def _project(session: AsyncSession) -> tuple[uuid.UUID, uuid.UUID]:
    workspace = Workspace(name="Content context")
    session.add(workspace)
    await session.flush()
    project = Project(
        workspace_id=workspace.id,
        name="Acme project",
        brand_name="Acme",
        website_url="https://acme.test",
        country_code="AU",
        language_code="en-AU",
        benchmark_mode="consumer_like",
        default_repetitions=1,
    )
    session.add(project)
    await session.flush()
    brand = Brand(project_id=project.id, name="Acme")
    session.add(brand)
    await session.flush()
    session.add_all(
        [
            BrandAlias(brand_id=brand.id, alias="Acme Co"),
            BrandProfile(
                workspace_id=workspace.id,
                project_id=project.id,
                brand_id=brand.id,
                description="Schoolwear supplier",
                business_context={"buyer_type": "b2c", "sector": "Retail"},
            ),
            Competitor(project_id=project.id, name="Rival"),
        ]
    )
    await session.commit()
    return workspace.id, project.id


async def test_context_has_only_the_canonical_blocks(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    async with session_factory() as session:
        workspace_id, project_id = await _project(session)
        context = await build_content_context(
            session,
            workspace_id=workspace_id,
            project_id=project_id,
            user_instruction="Write a schoolwear guide",
        )
    assert "Acme Co" in context.brand_block
    assert "Rival" in context.brand_block
    assert "Buyer type: b2c" in context.brand_block
    assert set(context.snapshot()) == {
        "version",
        "brand_block",
        "target_page_block",
        "issue_block",
        "related_site_block",
        "summary",
    }
    assert ContentContext.from_snapshot(context.snapshot()) == context


async def test_unresolved_target_url_is_url_only_not_an_unrelated_page(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    async with session_factory() as session:
        workspace_id, project_id = await _project(session)
        context = await build_content_context(
            session,
            workspace_id=workspace_id,
            project_id=project_id,
            user_instruction="Write a page",
            target_url="https://unresolved.example/page",
        )
    assert (
        context.target_page_block
        == "TARGET PAGE\n\nURL: https://unresolved.example/page"
    )
    assert context.related_site_block == ""


async def test_target_page_must_match_the_selected_url(
    session_factory: async_sessionmaker[AsyncSession], monkeypatch: pytest.MonkeyPatch
) -> None:
    async def _selection(*_: object, **__: object) -> CrawlFragmentSelection:
        return CrawlFragmentSelection(
            pages=[
                {"final_url": "https://acme.test/other", "title": "Other"},
                {"final_url": "https://acme.test/target", "title": "Target"},
            ]
        )

    monkeypatch.setattr(
        "app.domain.content.context_builder.select_crawl_fragments", _selection
    )
    async with session_factory() as session:
        workspace_id, project_id = await _project(session)
        context = await build_content_context(
            session,
            workspace_id=workspace_id,
            project_id=project_id,
            user_instruction="Write a page",
            target_url="https://acme.test/target",
        )
    assert "Target" in context.target_page_block
    assert "Other" in context.related_site_block
    assert context.summary["brand_memory"] is True
    assert context.summary["target_page"] == "Target"
    assert context.summary["target_url"] == "https://acme.test/target"
    assert context.summary["issue_count"] == 0
    assert context.summary["related_page_count"] == 1


async def test_origin_resolution_rejects_a_project_from_another_workspace(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    async with session_factory() as session:
        _workspace_id, project_id = await _project(session)
        with pytest.raises(ContentContextNotFoundError, match="Project not found"):
            await build_content_context(
                session,
                workspace_id=uuid.uuid4(),
                project_id=project_id,
                user_instruction="Write a page",
            )
