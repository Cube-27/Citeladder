"""Pool prompt outcome counts within a resolved frozen period configuration."""

from collections import defaultdict

from sqlalchemy import select

from app.domain.analysis.schemas import MeasurementCounts, PromptOutcome
from app.domain.analysis.selection import authorize_run_set
from app.domain.analysis.source_comparison import source_comparison_status
from app.models.analysis import MetricSnapshot
from app.models.audit import Audit


async def period_prompt_metrics(
    session, *, workspace_id, project_id, audit_ids, baseline_ids, cohort, engine
):
    current = await _load_rows(
        session, workspace_id, project_id, audit_ids, cohort, engine
    )
    result = _pool_rows(current)
    if not baseline_ids:
        return result
    before = await _load_rows(
        session, workspace_id, project_id, baseline_ids, cohort, engine
    )
    snapshots = (
        await session.execute(
            select(Audit, MetricSnapshot)
            .join(MetricSnapshot, MetricSnapshot.audit_id == Audit.id)
            .where(
                Audit.workspace_id == workspace_id,
                Audit.project_id == project_id,
                Audit.id.in_([*audit_ids, *baseline_ids]),
            )
        )
    ).all()
    status = source_comparison_status(
        snapshots,
        audit_ids,
        baseline_ids,
        sum(row.counts.responses for row in result),
        engine,
        cohort,
    )
    previous = {_identity(row): row for row in _pool_rows(before)}
    for row in result:
        _period_change(row, previous.get(_identity(row)), status)
    return result


async def _load_rows(session, workspace_id, project_id, ids, cohort, engine):
    from app.domain.analysis.metrics import get_prompt_metrics

    await authorize_run_set(
        session, workspace_id=workspace_id, project_id=project_id, audit_ids=ids
    )
    rows = []
    for audit_id in dict.fromkeys(ids):
        rows.extend(
            await get_prompt_metrics(
                session,
                workspace_id=workspace_id,
                project_id=project_id,
                audit_id=audit_id,
                cohort=cohort,
                logical_engine=engine,
            )
        )
    return rows


def _identity(row):
    return (
        str(row.prompt_id or row.prompt_text),
        row.prompt_text,
        row.cohort,
        row.theme,
        row.intent,
    )


def _pool_rows(rows):
    grouped = defaultdict(list)
    for row in rows:
        grouped[_identity(row)].append(row)
    return [_pool_prompt(items) for items in grouped.values()]


def _pool_prompt(rows):
    result = max(rows, key=lambda row: row.created_at).model_copy(deep=True)
    result.source_audit_ids = sorted({row.audit_id for row in rows})
    result.counts = _pool_counts([row.counts for row in rows])
    result.visibility_rate = _rate(
        result.counts.brand_responses, result.counts.responses
    )
    result.owned_citation_rate = _rate(
        result.counts.owned_citation_responses, result.counts.responses
    )
    result.composite_score = None
    result.previous_score = result.immediate_delta = result.visibility_delta = None
    result.components = {}
    result.per_engine_scores = {}
    result.rolling_four = []
    result.decline_confirmed = False
    result.comparison = None
    result.comparison_status = "no_baseline"
    grouped = defaultdict(list)
    for row in rows:
        for outcome in row.outcomes:
            grouped[(outcome.logical_engine, outcome.transport_model)].append(outcome)
    result.outcomes = [_pool_outcome(key, values) for key, values in grouped.items()]
    return result


def _pool_counts(rows):
    total = sum(row.responses for row in rows)
    values = {}
    for field in (
        "brand_responses",
        "owned_citation_responses",
        "entity_presences",
        "expected",
        "failed",
        "not_run",
    ):
        observed = [getattr(row, field) for row in rows]
        values[field] = (
            sum(observed) if all(value is not None for value in observed) else None
        )
    return MeasurementCounts(
        state="measured" if total else "no_observations", responses=total, **values
    )


def _pool_outcome(key, rows):
    counts = _pool_counts([row.counts for row in rows])
    gaps: defaultdict[str, int] = defaultdict(int)
    for row in rows:
        for name, count in row.gap_counts.items():
            gaps[name] += count
    return PromptOutcome(
        logical_engine=key[0],
        transport_model=key[1],
        counts=counts,
        visibility_rate=_rate(counts.brand_responses, counts.responses),
        owned_citation_rate=_rate(counts.owned_citation_responses, counts.responses),
        gap_counts=dict(gaps),
    )


def _rate(numerator, denominator):
    return numerator / denominator if numerator is not None and denominator else None


def _period_change(row, previous, status):
    row.comparison_status = status
    if not previous:
        row.comparison_status = "no_matching_prompt"
        return
    if status != "comparable":
        return
    if row.visibility_rate is None or previous.visibility_rate is None:
        row.comparison_status = "no_observations"
        return
    row.visibility_delta = (row.visibility_rate - previous.visibility_rate) * 100
