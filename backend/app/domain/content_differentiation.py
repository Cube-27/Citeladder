"""Read-only report bridge for the Python Agent until PR 19."""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.content_differentiation import ContentDifferentiationReport


async def list_content_differentiation_reports(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    limit: int = 50,
) -> list[ContentDifferentiationReport]:
    return list(
        (
            await session.scalars(
                select(ContentDifferentiationReport)
                .where(
                    ContentDifferentiationReport.workspace_id == workspace_id,
                    ContentDifferentiationReport.project_id == project_id,
                )
                .order_by(
                    ContentDifferentiationReport.created_at.desc(),
                    ContentDifferentiationReport.id.desc(),
                )
                .limit(limit)
            )
        ).all()
    )
