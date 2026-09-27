"""Python admission bridge for the TypeScript implementation verifier."""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config.analytics import (
    ANALYTICS_TASK_KIND_OPPORTUNITY_VERIFICATION,
    analytics_settings,
)
from app.core.config.opportunities import IMPLEMENTATION_VERIFIER_VERSION
from app.core.config.task_queue import TASK_STATUS_QUEUED
from app.models.analytics import AnalyticsTask

TRIGGER_SOURCE_PAGE = "source_page_inspection"


async def enqueue_implementation_verification(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    trigger_kind: str,
    trigger_id: uuid.UUID,
    trigger_revision: str | None = None,
    payload_extra: dict[str, Any] | None = None,
) -> None:
    idempotency_key = (
        f"implementation-verification:{trigger_kind}:{trigger_id}:"
        f"{IMPLEMENTATION_VERIFIER_VERSION}:{trigger_revision or 'terminal'}"
    )
    await session.execute(
        pg_insert(AnalyticsTask)
        .values(
            workspace_id=workspace_id,
            project_id=project_id,
            task_kind=ANALYTICS_TASK_KIND_OPPORTUNITY_VERIFICATION,
            payload={
                "trigger_kind": trigger_kind,
                "trigger_id": str(trigger_id),
                **(payload_extra or {}),
            },
            idempotency_key=idempotency_key,
            status=TASK_STATUS_QUEUED,
            max_attempts=analytics_settings.task_max_attempts,
        )
        .on_conflict_do_nothing(index_elements=["idempotency_key"])
    )


async def enqueue_audit_opportunity_tasks(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    audit_id: uuid.UUID,
) -> None:
    """Queue both Opportunity consumers of one terminal audit."""
    from app.domain.opportunities.queue import enqueue_opportunity_refresh

    await enqueue_opportunity_refresh(
        session,
        workspace_id=workspace_id,
        project_id=project_id,
        trigger_kind="audit",
        trigger_id=audit_id,
    )
    await enqueue_implementation_verification(
        session,
        workspace_id=workspace_id,
        project_id=project_id,
        trigger_kind="audit",
        trigger_id=audit_id,
    )
