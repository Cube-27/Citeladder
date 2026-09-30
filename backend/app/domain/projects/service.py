"""Authorized project reads for remaining Python consumers (retire last caller)."""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config.api import API_V1_PREFIX
from app.models.brand import Brand
from app.models.project import Project
from app.models.prompt import PromptSet


class ProjectNotFoundError(LookupError):
    """A project is missing or belongs to another workspace."""


def brand_logo_url(project_id: uuid.UUID) -> str:
    return f"{API_V1_PREFIX}/projects/{project_id}/logo"


def competitor_logo_url(project_id: uuid.UUID, competitor_id: uuid.UUID) -> str:
    return f"{API_V1_PREFIX}/projects/{project_id}/competitors/{competitor_id}/logo"


def get_project_logo_urls(project: Project) -> dict[uuid.UUID, str]:
    """Pure logo projection for Python executive-report visibility."""
    urls: dict[uuid.UUID, str] = {}
    if project.brand is not None and project.brand.logo_asset_id is not None:
        urls[project.brand.id] = brand_logo_url(project.id)
    for competitor in project.competitors:
        if competitor.logo_asset_id is not None:
            urls[competitor.id] = competitor_logo_url(project.id, competitor.id)
    return urls


async def get_project(
    session: AsyncSession, *, workspace_id: uuid.UUID, project_id: uuid.UUID
) -> Project:
    query = (
        select(Project)
        .options(
            selectinload(Project.brand).selectinload(Brand.aliases),
            selectinload(Project.brand).selectinload(Brand.profile),
            selectinload(Project.competitors),
            selectinload(Project.owned_domains),
            selectinload(Project.unintended_domains),
            selectinload(Project.prompt_sets).selectinload(PromptSet.prompts),
        )
        .where(Project.id == project_id, Project.workspace_id == workspace_id)
    )
    project = await session.scalar(query)
    if project is None:
        raise ProjectNotFoundError("Project not found")
    return project
