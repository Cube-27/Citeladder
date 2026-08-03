"""Provider-free audit cost previews and persisted performance projections."""

from __future__ import annotations

import math
import uuid
from collections import defaultdict
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config.audits import (
    TASK_STATUS_FAILED,
    TASK_STATUS_SUCCEEDED,
    MeasurementModePolicy,
    audit_settings,
    measurement_policy_for_mode,
)
from app.core.config.costs import (
    ESTIMATE_SEARCH_CALLS,
    PRICING_CATALOG_VERSION,
    PROJECTION_STATUS_COMPLETE,
    PROJECTION_STATUS_PARTIAL,
    PROJECTION_STATUS_UNKNOWN,
    TOKENS_PER_MILLION,
    RouteIdentity,
    estimate_token_count,
    route_pricing_for,
)
from app.core.config.provider_catalog import measurement_route
from app.domain.audits.schemas import (
    AuditEngineEstimate,
    AuditEnginePerformance,
    AuditEstimateRequest,
    AuditEstimateResponse,
    AuditPerformanceResponse,
    AuditUsageSummary,
)
from app.models.audit import Audit, AuditTask, ExecutionCostProjection
from app.models.project import Project
from app.models.prompt import Prompt, PromptSet


class AuditEstimateError(ValueError):
    pass


def _line_cost(tokens: int, rate: int | None) -> int | None:
    if rate is None:
        return None
    return math.ceil(tokens * rate / TOKENS_PER_MILLION)


def _estimated_searches(engine: str, executions: int) -> int:
    calls_per_execution = ESTIMATE_SEARCH_CALLS.get(engine)
    if calls_per_execution is None:
        raise AuditEstimateError(
            f"Search-call estimate is unavailable for engine: {engine}"
        )
    return executions * calls_per_execution


def _cost_status(*, required: list[int | None]) -> str:
    known = sum(value is not None for value in required)
    if known == len(required):
        return PROJECTION_STATUS_COMPLETE
    if known:
        return PROJECTION_STATUS_PARTIAL
    return PROJECTION_STATUS_UNKNOWN


def _known_total(values: list[int | None]) -> int | None:
    known = [value for value in values if value is not None]
    return sum(known) if known else None


def _overall_cost_status(rows: list[AuditEngineEstimate]) -> str:
    statuses = {row.cost_status for row in rows}
    if statuses == {PROJECTION_STATUS_COMPLETE}:
        return PROJECTION_STATUS_COMPLETE
    if statuses == {PROJECTION_STATUS_UNKNOWN}:
        return PROJECTION_STATUS_UNKNOWN
    return PROJECTION_STATUS_PARTIAL


def _estimate_engine(
    engine: str,
    *,
    measurement_mode: str,
    policy: MeasurementModePolicy,
    prompt_count: int,
    repetitions: int,
    per_execution_input: int,
) -> AuditEngineEstimate:
    try:
        route = measurement_route(engine, measurement_mode)
    except ValueError as exc:
        raise AuditEstimateError(str(exc)) from exc
    executions = prompt_count * repetitions
    input_tokens = per_execution_input * repetitions
    output_tokens = executions * policy.max_output_tokens
    pricing = route_pricing_for(
        RouteIdentity(engine, route.transport_provider, route.transport_model),
        PRICING_CATALOG_VERSION,
    )
    input_cost = _line_cost(
        input_tokens,
        pricing.uncached_input_microusd_per_million if pricing else None,
    )
    output_cost = _line_cost(
        output_tokens, pricing.output_microusd_per_million if pricing else None
    )
    token_cost = _combined_token_cost(input_cost, output_cost)
    searches = _search_count(
        engine, executions=executions, retrieval_enabled=policy.retrieval_enabled
    )
    search_cost = _search_cost(
        searches, pricing.search_fee_microusd if pricing else None
    )
    required = [token_cost] + ([search_cost] if policy.retrieval_enabled else [])
    return AuditEngineEstimate(
        logical_engine=engine,
        transport_provider=route.transport_provider,
        transport_model=route.transport_model,
        retrieval_enabled=policy.retrieval_enabled,
        prompt_count=prompt_count,
        repetition_count=repetitions,
        execution_count=executions,
        maximum_attempt_count=executions * audit_settings.max_attempts,
        estimated_input_tokens=input_tokens,
        estimated_output_tokens=output_tokens,
        estimated_search_calls=searches,
        estimated_token_cost_microusd=token_cost,
        estimated_search_cost_microusd=search_cost,
        estimated_total_cost_microusd=_known_total(required),
        cost_status=_cost_status(required=required),
        pricing_version=PRICING_CATALOG_VERSION,
    )


def _combined_token_cost(input_cost: int | None, output_cost: int | None) -> int | None:
    if input_cost is None or output_cost is None:
        return None
    return input_cost + output_cost


def _search_count(
    engine: str, *, executions: int, retrieval_enabled: bool
) -> int | None:
    return _estimated_searches(engine, executions) if retrieval_enabled else None


def _search_cost(searches: int | None, rate: int | None) -> int | None:
    if searches is None or rate is None:
        return None
    return searches * rate


async def _estimate_prompts(
    session: AsyncSession, *, workspace_id: uuid.UUID, payload: AuditEstimateRequest
) -> list[Prompt]:
    project = await session.scalar(
        select(Project).where(
            Project.id == payload.project_id,
            Project.workspace_id == workspace_id,
        )
    )
    if project is None:
        raise AuditEstimateError("Project not found")
    stmt = (
        select(Prompt)
        .join(PromptSet, PromptSet.id == Prompt.prompt_set_id)
        .where(PromptSet.project_id == payload.project_id, Prompt.enabled.is_(True))
        .order_by(Prompt.created_at)
    )
    if payload.prompt_ids:
        stmt = stmt.where(Prompt.id.in_(payload.prompt_ids))
    elif payload.prompt_set_id:
        stmt = stmt.where(PromptSet.id == payload.prompt_set_id)
    else:
        raise AuditEstimateError("Either prompt_set_id or prompt_ids is required")
    prompts = list((await session.scalars(stmt)).all())
    if not prompts or (
        payload.prompt_ids and len(prompts) != len(set(payload.prompt_ids))
    ):
        raise AuditEstimateError("One or more prompts are unavailable")
    return prompts


async def estimate_audit(
    session: AsyncSession, *, workspace_id: uuid.UUID, payload: AuditEstimateRequest
) -> AuditEstimateResponse:
    """Estimate from persisted prompts and versioned prices; performs no I/O."""
    prompts = await _estimate_prompts(
        session, workspace_id=workspace_id, payload=payload
    )
    try:
        policy = measurement_policy_for_mode(payload.measurement_mode)
    except ValueError as exc:
        raise AuditEstimateError(str(exc)) from exc
    repetitions = payload.repetitions or policy.repetitions
    prompt_count = len(prompts)
    per_execution_input = sum(estimate_token_count(prompt.text) for prompt in prompts)
    engine_rows = [
        _estimate_engine(
            engine,
            measurement_mode=payload.measurement_mode,
            policy=policy,
            prompt_count=prompt_count,
            repetitions=repetitions,
            per_execution_input=per_execution_input,
        )
        for engine in dict.fromkeys(payload.engines)
    ]
    executions = sum(row.execution_count for row in engine_rows)
    attempts = sum(row.maximum_attempt_count for row in engine_rows)
    totals = [row.estimated_total_cost_microusd for row in engine_rows]
    return AuditEstimateResponse(
        measurement_mode=payload.measurement_mode,
        retrieval_enabled=policy.retrieval_enabled,
        prompt_count=prompt_count,
        engine_count=len(engine_rows),
        repetition_count=repetitions,
        execution_count=executions,
        maximum_attempt_count=attempts,
        maximum_wall_clock_seconds=math.ceil(
            attempts
            * policy.timeout_seconds
            / max(1, audit_settings.worker_concurrency)
        ),
        cost_status=_overall_cost_status(engine_rows),
        estimated_total_cost_microusd=_known_total(totals),
        engines=engine_rows,
    )


async def audit_performance(
    session: AsyncSession, *, workspace_id: uuid.UUID, audit_id: uuid.UUID
) -> AuditPerformanceResponse:
    audit = await session.scalar(
        select(Audit).where(Audit.id == audit_id, Audit.workspace_id == workspace_id)
    )
    if audit is None:
        raise LookupError("Audit not found")
    tasks = list(
        (
            await session.scalars(
                select(AuditTask).where(AuditTask.audit_id == audit_id)
            )
        ).all()
    )
    costs = list(
        (
            await session.scalars(
                select(ExecutionCostProjection).where(
                    ExecutionCostProjection.audit_id == audit_id
                )
            )
        ).all()
    )
    cost_by_task = {row.task_id: row for row in costs}
    by_engine: dict[str, list[AuditTask]] = defaultdict(list)
    for task in tasks:
        by_engine[task.logical_engine].append(task)
    first_result = min(
        (task.completed_at for task in tasks if task.completed_at is not None),
        default=None,
    )
    engine_rows = [
        _engine_performance(engine, rows=rows, cost_by_task=cost_by_task)
        for engine, rows in sorted(by_engine.items())
    ]
    completed = sum(row.status == TASK_STATUS_SUCCEEDED for row in tasks)
    projected_all = [
        row.projected_total_cost_microusd
        for row in costs
        if row.projected_total_cost_microusd is not None
    ]
    return AuditPerformanceResponse(
        audit_id=audit_id,
        queue_wait_ms=_elapsed_ms(audit.started_at, audit.created_at),
        total_run_duration_ms=_elapsed_ms(audit.completed_at, audit.created_at),
        time_to_first_result_ms=_elapsed_ms(first_result, audit.created_at),
        execution_count=len(tasks),
        completed_count=completed,
        failed_count=sum(row.status == TASK_STATUS_FAILED for row in tasks),
        coverage=completed / len(tasks) if tasks else 0.0,
        retry_count=sum(max(0, row.attempt_count - 1) for row in tasks),
        usage=_usage_summary(costs),
        search_calls=sum(len(row.search_events or []) for row in tasks),
        projected_cost_microusd=sum(projected_all) if projected_all else None,
        engines=engine_rows,
    )


def _elapsed_ms(end: datetime | None, start: datetime) -> int | None:
    if end is None:
        return None
    return int((end - start).total_seconds() * 1000)


def _engine_performance(
    engine: str,
    *,
    rows: list[AuditTask],
    cost_by_task: dict[uuid.UUID, ExecutionCostProjection],
) -> AuditEnginePerformance:
    latencies = [row.latency_ms for row in rows if row.latency_ms is not None]
    projected = [
        cost_by_task[row.id].projected_total_cost_microusd
        for row in rows
        if row.id in cost_by_task
        and cost_by_task[row.id].projected_total_cost_microusd is not None
    ]
    return AuditEnginePerformance(
        logical_engine=engine,
        execution_count=len(rows),
        completed_count=sum(row.status == TASK_STATUS_SUCCEEDED for row in rows),
        failed_count=sum(row.status == TASK_STATUS_FAILED for row in rows),
        retry_count=sum(max(0, row.attempt_count - 1) for row in rows),
        search_calls=sum(len(row.search_events or []) for row in rows),
        average_provider_latency_ms=(
            sum(latencies) / len(latencies) if latencies else None
        ),
        projected_cost_microusd=sum(projected) if projected else None,
    )


def _usage_summary(costs: list[ExecutionCostProjection]) -> AuditUsageSummary:
    if not costs:
        return AuditUsageSummary(
            input_tokens=None, output_tokens=None, total_tokens=None
        )
    return AuditUsageSummary(
        input_tokens=sum(
            (row.uncached_input_tokens or 0) + (row.cached_input_tokens or 0)
            for row in costs
        ),
        output_tokens=sum(row.output_tokens or 0 for row in costs),
        total_tokens=sum(row.total_tokens or 0 for row in costs),
    )
