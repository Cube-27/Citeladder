"""Python island bridge: project lookup and Site Health projection enqueue."""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config.commerce_catalog import (
    COMMERCE_PROJECTOR_VERSION,
)
from app.core.config.task_queue import TASK_STATUS_QUEUED
from app.domain.commerce.eligibility import project_sells_catalog
from app.models.analytics import AnalyticsTask
from app.models.project import Project


class CommerceNotFoundError(LookupError):
    pass


async def require_project(
    session: AsyncSession, *, workspace_id: uuid.UUID, project_id: uuid.UUID
) -> Project:
    project = await session.scalar(
        select(Project).where(
            Project.id == project_id, Project.workspace_id == workspace_id
        )
    )
    if project is None:
        raise CommerceNotFoundError("Project not found")
    return project


async def enqueue_catalog_projection(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    source_analysis_id: uuid.UUID,
) -> None:
    if not await project_sells_catalog(
        session, workspace_id=workspace_id, project_id=project_id
    ):
        return
    key = f"commerce:project:{source_analysis_id}:{COMMERCE_PROJECTOR_VERSION}"
    await session.execute(
        insert(AnalyticsTask)
        .values(
            id=uuid.uuid4(),
            workspace_id=workspace_id,
            project_id=project_id,
            task_kind="commerce_catalog_projection",
            payload={"source_analysis_id": str(source_analysis_id)},
            idempotency_key=key,
            status=TASK_STATUS_QUEUED,
        )
        .on_conflict_do_nothing(index_elements=[AnalyticsTask.idempotency_key])
    )
