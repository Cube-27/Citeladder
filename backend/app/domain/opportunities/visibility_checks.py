"""Baseline-anchored visibility expectations for implementation declarations.

A declaration freezes *what it will be measured against* at the moment it is
made: a specific ``MetricSnapshot`` and the value read from it. Verification
later compares a post-declaration snapshot against that frozen baseline and
asks whether the metric moved by at least the required delta.

The previous contract asked whether ``visibility_score >= 1``. That is an
absolute floor, not a movement, so every project already above the floor passed
without having changed anything. It was also project-wide for prompt-keyed
rules, so an unrelated gain elsewhere in the portfolio verified a specific
prompt's action.

Scope is carried by ``target_prompt_id``, not by a second metric name. A
prompt-keyed check reads that prompt's ``composite_score``; a project-keyed one
reads ``visibility_score``, which is the mean of exactly those per-prompt
scores. They are the same quantity at two aggregation levels and already on the
same 0-100 scale, which is what makes one shared delta defensible rather than
coincidental.

A baseline that cannot be established is recorded as a limitation and observes
nothing; it never degrades into a check that passes for free.
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config.opportunities import (
    VISIBILITY_CHECK_MIN_DELTA,
    VISIBILITY_METRIC_PROJECT_SCORE,
)
from app.models.analysis import MetricSnapshot
from app.models.audit import AuditPromptSnapshot
from app.models.opportunity import Opportunity, OpportunitySnapshot


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


def prompt_composite_score(metrics: dict | None, prompt_index: int) -> float | None:
    """One prompt's composite score, on the same 0-100 scale as the project's.

    Deliberately not ``mention_stability``: that is repetition AGREEMENT,
    ``max(mentioned, not_mentioned) / repetitions``, so it reads 1.0 both when
    a brand appears in every answer and when it appears in none. Verifying a
    movement against it would score a genuine win as a contradiction.
    """
    for row in (metrics or {}).get("per_prompt") or []:
        if not isinstance(row, dict) or row.get("prompt_index") != prompt_index:
            continue
        value = row.get("composite_score")
        return float(value) if isinstance(value, (int, float)) else None
    return None


def metric_value(snapshot: MetricSnapshot, *, prompt_index: int | None) -> float | None:
    """The observation this check is about, at its own scope."""
    if prompt_index is not None:
        return prompt_composite_score(snapshot.metrics, prompt_index)
    value = snapshot.visibility_score
    return float(value) if isinstance(value, (int, float)) else None


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
    check: dict[str, Any] = {
        "kind": "visibility_metric",
        "metric": VISIBILITY_METRIC_PROJECT_SCORE,
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
    # A prompt-keyed opportunity whose prompt is not in the baseline audit has
    # no comparable starting point, so it is left unobservable rather than
    # quietly measured against the whole project.
    if prompt_id is not None and prompt_index is None:
        return check
    value = metric_value(baseline, prompt_index=prompt_index)
    if value is None:
        return check
    check["baseline_metric_snapshot_id"] = str(baseline.id)
    check["baseline_value"] = value
    return check
