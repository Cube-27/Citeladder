"""Freeze actual requested task coverage alongside finalized aggregate facts."""

from __future__ import annotations

from collections import Counter

from sqlalchemy import select

from app.core.config.prompts import ORGANIC_PROMPT_COHORTS
from app.models.audit import AuditPromptSnapshot, AuditTask


async def freeze_task_coverage(session, audit, metrics: dict) -> None:
    tasks = (
        await session.execute(
            select(
                AuditTask.logical_engine,
                AuditTask.status,
                AuditPromptSnapshot.cohort,
            )
            .join(
                AuditPromptSnapshot,
                AuditPromptSnapshot.id == AuditTask.prompt_snapshot_id,
            )
            .where(
                AuditTask.audit_id == audit.id,
                AuditTask.workspace_id == audit.workspace_id,
            )
        )
    ).all()
    for name, cohorts in (
        (None, ORGANIC_PROMPT_COHORTS),
        ("comparison", {"comparison"}),
        ("brand_diagnostic", {"brand_diagnostic"}),
    ):
        aggregate = metrics if name is None else metrics.get(name, {})
        eligible = [row for row in tasks if row.cohort in cohorts]
        aggregate["coverage"] = _coverage(eligible, aggregate)
        for engine, values in (aggregate.get("per_engine") or {}).items():
            values["coverage"] = _coverage(
                [row for row in eligible if row.logical_engine == engine],
                values,
            )


def _coverage(tasks, aggregate):
    statuses = Counter(row.status for row in tasks)
    completed = int(aggregate.get("total_completed") or 0)
    failed = statuses["failed"]
    return {
        "requested": len(tasks),
        "completed": completed,
        "failed": failed,
        "not_run": sum(
            count
            for status, count in statuses.items()
            if status not in {"completed", "failed"}
        ),
        "unavailable": max(0, statuses["completed"] - completed),
        "rate": completed / len(tasks) if tasks else None,
    }
