"""The shared Opportunity queue order, the one Opportunity-level write."""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.opportunities.common import _PROJECT_NOT_FOUND
from app.domain.opportunities.errors import (
    OpportunityNotFoundError,
    OpportunityOrderConflictError,
    OpportunityValidationError,
)
from app.domain.opportunities.projection import stable_key
from app.models.opportunity import Opportunity, OpportunityOrder
from app.models.project import Project


async def _lock_project(
    session: AsyncSession, *, workspace_id: uuid.UUID, project_id: uuid.UUID
) -> None:
    locked_id = await session.scalar(
        select(Project.id)
        .where(Project.id == project_id, Project.workspace_id == workspace_id)
        .with_for_update()
    )
    if locked_id is None:
        raise OpportunityNotFoundError(_PROJECT_NOT_FOUND)


async def update_order(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    ordered_opportunity_ids: list[uuid.UUID],
    expected_version: int,
    updated_by_user_id: uuid.UUID,
) -> dict:
    """Persist one shared project order without mutating derived evidence."""
    await _lock_project(session, workspace_id=workspace_id, project_id=project_id)
    if len(set(ordered_opportunity_ids)) != len(ordered_opportunity_ids):
        raise OpportunityValidationError("ordered opportunity ids must be unique")

    rows = list(
        (
            await session.scalars(
                select(Opportunity).where(
                    Opportunity.workspace_id == workspace_id,
                    Opportunity.project_id == project_id,
                    Opportunity.id.in_(ordered_opportunity_ids),
                    Opportunity.superseded_at.is_(None),
                )
            )
        ).all()
    )
    by_id = {row.id: row for row in rows}
    if set(by_id) != set(ordered_opportunity_ids):
        raise OpportunityValidationError(
            "ordered opportunity ids must identify live project opportunities"
        )

    order = await session.scalar(
        select(OpportunityOrder)
        .where(
            OpportunityOrder.workspace_id == workspace_id,
            OpportunityOrder.project_id == project_id,
        )
        .with_for_update()
    )
    current_version = order.version if order is not None else 0
    if expected_version != current_version:
        raise OpportunityOrderConflictError(
            f"queue version changed from {expected_version} to {current_version}"
        )

    ordered_keys = [stable_key(by_id[item_id]) for item_id in ordered_opportunity_ids]
    if order is None:
        order = OpportunityOrder(
            workspace_id=workspace_id,
            project_id=project_id,
            ordered_keys=ordered_keys,
            version=1,
            updated_by_user_id=updated_by_user_id,
        )
        session.add(order)
    else:
        order.ordered_keys = ordered_keys
        order.version += 1
        order.updated_by_user_id = updated_by_user_id
    await session.commit()
    return {
        "version": order.version,
        "ordered_opportunity_ids": ordered_opportunity_ids,
    }
