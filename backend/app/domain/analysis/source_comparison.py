"""Compare source response coverage only for compatible complete run sets."""

from __future__ import annotations

from sqlalchemy import func, select

from app.analysis.comparison import frozen_comparison_key
from app.domain.analysis.evidence import _evidence_statement
from app.domain.analysis.measurement import measurement_counts
from app.domain.analysis.selection import authorize_run_set
from app.models.analysis import Citation, MetricSnapshot, ResponseAnalysis
from app.models.audit import Audit


async def apply_source_comparison(
    session,
    *,
    response,
    workspace_id,
    project_id,
    current_ids,
    baseline_ids,
    engine,
    cohort,
    domain,
    as_of,
):
    await authorize_run_set(
        session,
        workspace_id=workspace_id,
        project_id=project_id,
        audit_ids=baseline_ids,
    )
    rows = (
        await session.execute(
            select(Audit, MetricSnapshot)
            .join(
                MetricSnapshot,
                MetricSnapshot.audit_id == Audit.id,
            )
            .where(
                Audit.workspace_id == workspace_id,
                Audit.project_id == project_id,
                Audit.id.in_([*current_ids, *baseline_ids]),
            )
        )
    ).all()
    status = source_comparison_status(
        rows, current_ids, baseline_ids, response.responses, engine, cohort
    )
    if status != "comparable":
        response.comparison_status = status
        return
    selected = (
        _evidence_statement(
            workspace_id=workspace_id,
            project_id=project_id,
            audit_id=None,
            prompt_id=None,
            logical_engine=engine,
            from_at=None,
            to_at=None,
            limit=None,
            cohort=cohort,
        )
        .where(
            ResponseAnalysis.audit_id.in_(baseline_ids),
            ResponseAnalysis.created_at <= as_of,
        )
        .with_only_columns(ResponseAnalysis.id)
        .order_by(None)
    )
    denominator = await session.scalar(
        select(func.count()).select_from(selected.subquery())
    )
    if not denominator:
        response.comparison_status = "no_observations"
        return
    key = Citation.url if domain else Citation.domain
    statement = select(key, func.count(func.distinct(Citation.analysis_id))).where(
        Citation.workspace_id == workspace_id,
        Citation.analysis_id.in_(selected),
        key.in_([row.key for row in response.items]),
    )
    if domain:
        statement = statement.where(Citation.domain == domain)
    source_counts = {
        name: count
        for name, count in (await session.execute(statement.group_by(key))).all()
    }
    for row in response.items:
        if row.response_rate is not None:
            row.response_delta = (
                row.response_rate - source_counts.get(row.key, 0) / denominator
            ) * 100
    response.comparison_status = "comparable"


def source_comparison_status(
    rows, current_ids, baseline_ids, responses, engine, cohort
):
    all_ids = set(current_ids) | set(baseline_ids)
    if {audit.id for audit, _ in rows} != all_ids:
        return "identity_unavailable"
    if not _ordered_run_sets(rows, current_ids, baseline_ids):
        return "invalid_baseline"
    if not responses:
        return "no_observations"
    status, identities = _source_identities(rows, engine, cohort)
    if status != "comparable":
        return status
    if len(identities) != 1 or not current_ids:
        return "changed_context"
    return "comparable"


def _source_identities(rows, engine, cohort):
    identities: set[tuple] = set()
    for audit, snapshot in rows:
        identity_key = frozen_comparison_key(audit.configuration, engine=engine)
        if not identity_key:
            return "identity_unavailable", identities
        identities.add(
            (identity_key, snapshot.analyzer_version, snapshot.scoring_rule_version)
        )
        stored = snapshot.metrics or {}
        metrics = stored if cohort == "core" else stored.get(cohort, {})
        if engine:
            metrics = (metrics.get("per_engine") or {}).get(engine, {})
        counts = measurement_counts(metrics)
        if not counts.is_complete:
            return "partial_coverage", identities
    return "comparable", identities


def _ordered_run_sets(rows, current_ids, baseline_ids):
    current_dates = [audit.completed_at for audit, _ in rows if audit.id in current_ids]
    baseline_dates = [
        audit.completed_at for audit, _ in rows if audit.id in baseline_ids
    ]
    return bool(
        current_dates and baseline_dates and max(baseline_dates) < min(current_dates)
    )
