"""Explicit like-for-like subsets of frozen prompt/model/repetition cells."""

from __future__ import annotations

from collections import Counter
from typing import Any
from uuid import UUID

from sqlalchemy import select

from app.analysis.comparison import frozen_comparison_key
from app.domain.analysis.measurement import measurement_counts
from app.domain.analysis.schemas import VisibilityComparison
from app.domain.audits.schemas import execution_frozen_provenance
from app.models.analysis import ResponseAnalysis
from app.models.audit import AuditPromptSnapshot, AuditTask


async def matched_comparison(session, *, audit, previous, cohort, engine):
    context = frozen_comparison_key(
        audit.configuration, include_panel=False, include_engines=False
    )
    if context is None or context != frozen_comparison_key(
        previous.configuration, include_panel=False, include_engines=False
    ):
        return None
    groups = await load_comparison_cells(
        session, audit=audit, previous=previous, cohort=cohort, engine=engine
    )
    return compare_cells(
        groups[audit.id], groups[previous.id], audit=audit, previous=previous
    )


async def load_comparison_cells(session, *, audit, previous, cohort, engine):
    query = (
        select(ResponseAnalysis, AuditPromptSnapshot, AuditTask)
        .join(
            AuditTask,
            AuditTask.id == ResponseAnalysis.task_id,
        )
        .join(
            AuditPromptSnapshot, AuditPromptSnapshot.id == AuditTask.prompt_snapshot_id
        )
        .where(
            ResponseAnalysis.workspace_id == audit.workspace_id,
            ResponseAnalysis.audit_id.in_([audit.id, previous.id]),
            ResponseAnalysis.cohort == cohort,
        )
    )
    if engine:
        query = query.where(ResponseAnalysis.logical_engine == engine)
    groups: dict[UUID, dict[tuple[Any, ...], ResponseAnalysis]] = {
        audit.id: {},
        previous.id: {},
    }
    for analysis, prompt, task in (await session.execute(query)).all():
        configuration = (
            audit.configuration
            if analysis.audit_id == audit.id
            else previous.configuration
        )
        retrieval = execution_frozen_provenance(
            request_snapshot=task.request_snapshot,
            route_snapshot=task.provider_route_snapshot,
            audit_configuration=configuration,
        )
        if retrieval is None or not analysis.transport_model or not analysis.score:
            continue
        cell = (
            str(prompt.prompt_id) if prompt.prompt_id else prompt.text,
            prompt.text,
            analysis.logical_engine,
            analysis.transport_provider,
            analysis.transport_model,
            retrieval,
            analysis.repetition,
            analysis.analyzer_version,
            analysis.scoring_rule_version,
        )
        groups[analysis.audit_id][cell] = analysis
    return groups


def compare_cells(after, before, *, audit, previous):
    matched = after.keys() & before.keys()
    if not matched:
        return None
    from app.domain.analysis.comparison_projection import metric_deltas, metric_values
    from app.domain.analysis.visibility import _rankings

    current_metrics = _metrics([after[key] for key in matched], audit.configuration)
    previous_metrics = _metrics(
        [before[key] for key in matched], previous.configuration
    )
    return VisibilityComparison(
        status="matched_subset",
        baseline_audit_id=previous.id,
        baseline_at=previous.completed_at,
        baseline_audit_ids=[previous.id],
        current_counts=measurement_counts(current_metrics),
        baseline_counts=measurement_counts(previous_metrics),
        deltas=metric_deltas(current_metrics, previous_metrics),
        current_values=metric_values(current_metrics),
        baseline_values=metric_values(previous_metrics),
        rankings=_rankings(previous_metrics),
        current_rankings=_rankings(current_metrics),
        matched_cells=len(matched),
        current_cells=len(after),
        baseline_cells=len(before),
    )


def _metrics(rows, configuration):
    brand = configuration.get("brand_name") or "Brand"
    names = [entry["name"] for entry in configuration.get("competitors", [])]
    counts = Counter({brand: sum(row.brand_mentioned for row in rows)})
    counts.update(
        {
            name: sum(
                name in row.score.get("competitors_mentioned", []) for row in rows
            )
            for name in names
        }
    )
    total = len(rows)
    owned = sum(row.owned_domain_cited for row in rows)
    presences = sum(counts.values())
    return {
        "total_completed": total,
        "brand_mention_count": counts[brand],
        "owned_citation_response_count": owned,
        "brand_mention_rate": counts[brand] / total,
        "owned_citation_rate": owned / total,
        "competitor_mention_rate": {name: counts[name] / total for name in names},
        "competitor_citation_rate": {
            name: sum(
                name in row.score.get("competitor_domains_cited", []) for row in rows
            )
            / total
            for name in names
        },
        "share_of_voice": {
            "mention_counts": dict(counts),
            "share": {
                name: count / presences if presences else None
                for name, count in counts.items()
            },
        },
    }
