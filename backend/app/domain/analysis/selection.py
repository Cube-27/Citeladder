"""Authorize the concrete run set returned by the selected measurement."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config.analysis import VISIBILITY_SELECTION_MAX_RUNS
from app.core.config.audits import AUDIT_SCOPE_BRAND
from app.domain.analysis.errors import AnalysisNotFoundError, TrendQueryError
from app.domain.analysis.projection_common import _AUDIT_NOT_FOUND, _DASHBOARD_STATUSES
from app.models.audit import Audit


@dataclass(frozen=True, slots=True)
class RunSelection:
    """The run scope shared by persisted visibility evidence readers."""

    workspace_id: uuid.UUID
    project_id: uuid.UUID
    audit_id: uuid.UUID | None = None
    audit_ids: list[uuid.UUID] | None = None
    logical_engine: str | None = None
    cohort: str = "core"
    from_at: datetime | None = None
    to_at: datetime | None = None

    async def authorize(self, session: AsyncSession) -> None:
        """Raise ``AnalysisNotFoundError`` for any run outside this project."""
        if self.audit_id is not None:
            owning = await session.scalar(
                select(Audit.id).where(
                    Audit.id == self.audit_id,
                    Audit.workspace_id == self.workspace_id,
                    Audit.project_id == self.project_id,
                )
            )
            if owning is None:
                raise AnalysisNotFoundError(_AUDIT_NOT_FOUND)
        await authorize_run_set(
            session,
            workspace_id=self.workspace_id,
            project_id=self.project_id,
            audit_ids=self.audit_ids,
        )


async def authorize_run_set(session, *, workspace_id, project_id, audit_ids):
    ids = set(audit_ids or [])
    if not ids:
        return
    if len(ids) > VISIBILITY_SELECTION_MAX_RUNS:
        raise TrendQueryError("Too many runs in this selection")
    owned = set(
        (
            await session.scalars(
                select(Audit.id).where(
                    Audit.workspace_id == workspace_id,
                    Audit.project_id == project_id,
                    Audit.id.in_(ids),
                    Audit.status.in_(_DASHBOARD_STATUSES),
                    Audit.audit_scope == AUDIT_SCOPE_BRAND,
                )
            )
        ).all()
    )
    if owned != ids:
        raise AnalysisNotFoundError("Selected run set not found")
