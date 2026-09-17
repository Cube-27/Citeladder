"""Baseline-anchored visibility expectations for implementation declarations.

A declaration freezes *what it will be measured against* at the moment it is
made: a specific ``MetricSnapshot`` and the value read from it. Verification
later compares a post-declaration snapshot against that frozen baseline and
asks whether the metric moved by at least the required delta.

The previous contract asked whether ``visibility_score >= 1`` on any later
project-wide snapshot. That is an absolute floor, not a movement, so every
project already above the floor passed without having changed anything. It was
also project-wide for prompt-keyed rules, so an unrelated gain elsewhere in the
portfolio verified a specific prompt's action.

Both metrics below are expressed on the same 0-100 scale so one delta applies
to either scope: ``visibility_score`` already is ``brand_mention_rate * 100``,
and the per-prompt mention stability is scaled to match. A baseline that cannot
be established is recorded as a limitation and observes nothing; it never
degrades into a check that passes for free.
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config.opportunities import (
    VISIBILITY_CHECK_MIN_DELTA,
    VISIBILITY_METRIC_PROJECT_SCORE,
    VISIBILITY_METRIC_PROMPT_MENTION_RATE,
)
from app.models.analysis import MetricSnapshot
from app.models.audit import AuditPromptSnapshot
from app.models.opportunity import Opportunity, OpportunitySnapshot

_PROMPT_RATE_SCALE = 100.0


async def resolve_prompt_index(
    session: AsyncSession, *, audit_id: uuid.UUID, prompt_id: uuid.UUID
) -> int | None:
    """Locate a prompt's position within one audit.

    ``prompt_index`` is audit-relative, so it is resolved per audit from the
    stable prompt id rather than frozen into the check.
    """
    return await session.scalar(
        select(AuditPromptSnapshot.prompt_index).where(
            AuditPromptSnapshot.audit_id == audit_id,
            AuditPromptSnapshot.prompt_id == prompt_id,
        )
    )


def prompt_mention_rate(metrics: dict | None, prompt_index: int | None) -> float | None:
    """Per-prompt brand mention stability, scaled onto the 0-100 metric scale."""
    if prompt_index is None:
        return None
    for row in (metrics or {}).get("per_prompt") or []:
        if not isinstance(row, dict) or row.get("prompt_index") != prompt_index:
            continue
        value = row.get("mention_stability")
        if isinstance(value, (int, float)):
            return float(value) * _PROMPT_RATE_SCALE
        return None
    return None


def metric_value(
    snapshot: MetricSnapshot, *, metric: str, prompt_index: int | None
) -> float | None:
    if metric == VISIBILITY_METRIC_PROMPT_MENTION_RATE:
        return prompt_mention_rate(snapshot.metrics, prompt_index)
    if metric == VISIBILITY_METRIC_PROJECT_SCORE:
        value = snapshot.visibility_score
        return float(value) if isinstance(value, (int, float)) else None
    raw = (snapshot.metrics or {}).get(metric)
    return float(raw) if isinstance(raw, (int, float)) else None


async def _baseline_snapshot(
    session: AsyncSession, *, snapshot: OpportunitySnapshot
) -> MetricSnapshot | None:
    if snapshot.audit_id is None:
        return None
    return await session.scalar(
        select(MetricSnapshot).where(MetricSnapshot.audit_id == snapshot.audit_id)
    )


async def build_visibility_check(
    session: AsyncSession,
    *,
    opportunity: Opportunity,
    snapshot: OpportunitySnapshot,
) -> dict[str, Any]:
    """Freeze the baseline this declaration will be measured against.

    A check whose baseline could not be established carries no
    ``baseline_value``; verification treats that as unobservable rather than
    as a satisfied expectation.
    """
    prompt_id = opportunity.target_prompt_id
    metric = (
        VISIBILITY_METRIC_PROMPT_MENTION_RATE
        if prompt_id is not None
        else VISIBILITY_METRIC_PROJECT_SCORE
    )
    check: dict[str, Any] = {
        "kind": "visibility_metric",
        "metric": metric,
        "direction": "increase",
        "min_delta": VISIBILITY_CHECK_MIN_DELTA,
        "tolerance": 0,
        "target_prompt_id": str(prompt_id) if prompt_id is not None else None,
    }
    baseline = await _baseline_snapshot(session, snapshot=snapshot)
    if baseline is None:
        return check
    prompt_index = (
        await resolve_prompt_index(
            session, audit_id=baseline.audit_id, prompt_id=prompt_id
        )
        if prompt_id is not None
        else None
    )
    value = metric_value(baseline, metric=metric, prompt_index=prompt_index)
    if value is None:
        return check
    check["baseline_metric_snapshot_id"] = str(baseline.id)
    check["baseline_value"] = value
    return check
