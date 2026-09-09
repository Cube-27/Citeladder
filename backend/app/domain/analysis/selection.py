"""Authorize the concrete run set returned by the selected measurement."""

from __future__ import annotations

from sqlalchemy import select

from app.core.config.analysis import VISIBILITY_SELECTION_MAX_RUNS
from app.core.config.audits import AUDIT_SCOPE_BRAND
from app.domain.analysis.errors import AnalysisNotFoundError, TrendQueryError
from app.domain.analysis.projection_common import _DASHBOARD_STATUSES
from app.models.audit import Audit


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
