"""Prompt outcome counts from persisted response facts, without recomputing scores."""

from __future__ import annotations

from collections import Counter, defaultdict

from sqlalchemy import select

from app.analysis.comparison import frozen_comparison_key
from app.domain.analysis.matched_comparison import compare_cells, load_comparison_cells
from app.domain.analysis.schemas import MeasurementCounts, PromptOutcome
from app.models.analysis import ResponseAnalysis
from app.models.audit import Audit, AuditPromptSnapshot, AuditTask


async def enrich_prompt_outcomes(
    session, *, rows, workspace_id, audit_id, engine=None, baseline_id=None
):
    audit = await session.get(Audit, audit_id)
    snapshots = {
        row.prompt_index: row
        for row in (
            await session.scalars(
                select(AuditPromptSnapshot).where(
                    AuditPromptSnapshot.audit_id == audit_id,
                )
            )
        ).all()
    }
    current = await _responses(session, workspace_id, audit_id, engine)
    previous = await _baseline(session, workspace_id, audit, baseline_id)
    cells = (
        await load_comparison_cells(
            session,
            audit=audit,
            previous=previous,
            cohort=rows[0].cohort,
            engine=engine,
        )
        if previous and rows
        else {}
    )
    tasks = await _tasks(session, workspace_id, audit_id, engine)
    for item in rows:
        _enrich_row(item, snapshots[item.prompt_index], current, tasks)
        if previous:
            _prompt_comparison(
                item, snapshots[item.prompt_index], cells, audit, previous
            )
    return rows


def _counts(responses, tasks):
    return MeasurementCounts(
        state="measured" if responses else "no_observations",
        responses=len(responses),
        expected=len(tasks),
        failed=sum(task.status == "failed" for task in tasks),
        not_run=sum(task.status not in {"completed", "failed"} for task in tasks),
        brand_responses=sum(row.brand_mentioned for row in responses),
        owned_citation_responses=sum(row.owned_domain_cited for row in responses),
    )


def _rate(numerator, denominator):
    return numerator / denominator if denominator else None


def _outcome(key, responses, tasks):
    counts = _counts(responses, tasks)
    gaps = Counter(
        name
        for row in responses
        if not row.brand_mentioned
        for name in (row.score or {}).get("competitors_mentioned", [])
    )
    return PromptOutcome(
        logical_engine=key[0],
        transport_model=key[1],
        counts=counts,
        visibility_rate=_rate(counts.brand_responses, counts.responses),
        owned_citation_rate=_rate(counts.owned_citation_responses, counts.responses),
        gap_counts=dict(gaps),
    )


async def _responses(session, workspace_id, audit_id, engine):
    query = select(ResponseAnalysis).where(
        ResponseAnalysis.workspace_id == workspace_id,
        ResponseAnalysis.audit_id == audit_id,
    )
    if engine:
        query = query.where(ResponseAnalysis.logical_engine == engine)
    result = defaultdict(list)
    for row in (await session.scalars(query)).all():
        result[row.prompt_index].append(row)
    return result


async def _baseline(session, workspace_id, audit, baseline_id):
    if not baseline_id:
        return None
    previous = await session.scalar(
        select(Audit).where(
            Audit.id == baseline_id,
            Audit.workspace_id == workspace_id,
            Audit.project_id == audit.project_id,
            Audit.completed_at < audit.completed_at,
        )
    )
    key = frozen_comparison_key(
        audit.configuration, include_panel=False, include_engines=False
    )
    if (
        previous
        and key
        and key
        == frozen_comparison_key(
            previous.configuration, include_panel=False, include_engines=False
        )
    ):
        return previous
    return None


async def _tasks(session, workspace_id, audit_id, engine):
    query = (
        select(AuditTask, AuditPromptSnapshot.prompt_index)
        .join(
            AuditPromptSnapshot,
            AuditPromptSnapshot.id == AuditTask.prompt_snapshot_id,
        )
        .where(AuditTask.workspace_id == workspace_id, AuditTask.audit_id == audit_id)
    )
    if engine:
        query = query.where(AuditTask.logical_engine == engine)
    result = defaultdict(list)
    for task, index in (await session.execute(query)).all():
        result[index].append(task)
    return result


def _enrich_row(item, prompt, current, tasks):
    item.prompt_snapshot_id = prompt.id
    item.theme = prompt.theme
    item.intent = prompt.prompt_intent or prompt.intent
    responses = current.get(item.prompt_index, [])
    item.counts = _counts(responses, tasks.get(item.prompt_index, []))
    item.visibility_rate = _rate(item.counts.brand_responses, item.counts.responses)
    item.owned_citation_rate = _rate(
        item.counts.owned_citation_responses, item.counts.responses
    )
    groups = defaultdict(list)
    for response in responses:
        groups[(response.logical_engine, response.transport_model)].append(response)
    # A cell is one (engine, model) pair, so its expected/failed/not-run counts
    # must come from that pair's tasks alone. Matching the engine only handed
    # every model on that engine the same task list, inflating each cell by the
    # number of models the run was routed across.
    item.outcomes = [
        _outcome(key, values, _cell_tasks(tasks.get(item.prompt_index, []), key))
        for key, values in sorted(groups.items())
    ]


def _cell_tasks(tasks, key):
    engine, transport_model = key
    return [
        task
        for task in tasks
        if task.logical_engine == engine and task.transport_model == transport_model
    ]


def _prompt_comparison(item, prompt, cells, audit, previous):
    identity = (
        str(prompt.prompt_id) if prompt.prompt_id else prompt.text,
        prompt.text,
    )
    after = {
        key: value for key, value in cells[audit.id].items() if key[:2] == identity
    }
    before = {
        key: value for key, value in cells[previous.id].items() if key[:2] == identity
    }
    item.comparison = compare_cells(after, before, audit=audit, previous=previous)
    if item.comparison:
        item.comparison_status = item.comparison.status
        item.visibility_delta = item.comparison.deltas.get("visibility")
    else:
        item.comparison_status = "no_matching_observations"
