"""Finite, non-retrying Search Intelligence acquisition executor."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.connectors.answer_engines.errors import ProviderError
from app.connectors.search_intelligence_dataforseo import ResearchResponse, execute_live
from app.core.config.audits import (
    CAPACITY_OUTCOME_FAILED,
    CAPACITY_OUTCOME_RATE_LIMITED,
    CAPACITY_OUTCOME_SUCCEEDED,
    CREDENTIAL_KIND_BYOK,
)
from app.core.config.provider_catalog import (
    ERROR_CONNECTION,
    ERROR_RATE_LIMIT,
    ERROR_TIMEOUT,
    SEARCH_INTELLIGENCE_CAPACITY_ENGINE,
    TRANSPORT_DATAFORSEO,
)
from app.core.config.search_intelligence import BACKLINK_KINDS, PRICE_VERSION
from app.domain.demand.search_intelligence.normalization import normalize_response
from app.models.analytics import AnalyticsTask
from app.models.provider import ProviderConnection
from app.models.search_intelligence import (
    SearchIntelligenceCall,
    SearchIntelligenceDataset,
    SearchIntelligenceRow,
    SearchIntelligenceRun,
)
from app.models.workspace import WorkspaceMember
from app.orchestration.executor_errors import CapacityWaitError
from app.orchestration.provider_capacity import (
    CapacityOutcome,
    CapacityRequest,
    acquire_provider_capacity,
    release_provider_capacity,
)


def _utcnow() -> datetime:
    return datetime.now(UTC)


def _dataset_from_plan(
    run: SearchIntelligenceRun, plan: dict[str, Any]
) -> SearchIntelligenceDataset:
    target = plan["target"]
    comparison = plan.get("comparison") or {}
    request = plan["request"]
    backlink = plan["dataset_kind"] in BACKLINK_KINDS
    return SearchIntelligenceDataset(
        workspace_id=run.workspace_id,
        project_id=run.project_id,
        run_id=run.id,
        dataset_kind=plan["dataset_kind"],
        scope_hash=plan["scope_hash"],
        target_domain=target["registrable_domain"],
        target_hostname=target["hostname"],
        target_origin=target["origin"],
        comparison_origin=comparison.get("origin", ""),
        location_code=None if backlink else request.get("location_code"),
        language_code="" if backlink else str(request.get("language_code") or ""),
        requested_rows=plan["requested_rows"],
        provider_filters={
            **request,
            "research_scope": plan.get("research_scope", "exact_host"),
        },
        collection_started_at=_utcnow(),
    )


def _row_model(
    dataset: SearchIntelligenceDataset,
    call: SearchIntelligenceCall,
    values: dict[str, Any],
) -> SearchIntelligenceRow:
    return SearchIntelligenceRow(
        workspace_id=dataset.workspace_id,
        project_id=dataset.project_id,
        dataset_id=dataset.id,
        call_id=call.id,
        provider_row_key=values.pop("provider_row_key"),
        row_kind=dataset.dataset_kind,
        **values,
    )


async def _authorized_connection(
    session: AsyncSession, run: SearchIntelligenceRun
) -> ProviderConnection | None:
    member = await session.scalar(
        select(WorkspaceMember.id).where(
            WorkspaceMember.workspace_id == run.workspace_id,
            WorkspaceMember.user_id == run.actor_user_id,
            WorkspaceMember.role != "viewer",
        )
    )
    connection = await session.get(ProviderConnection, run.connection_id)
    if (
        member is None
        or connection is None
        or not connection.active
        or connection.credential_revision != run.connection_revision
    ):
        return None
    return connection


async def _get_or_create_dataset(
    session: AsyncSession, run: SearchIntelligenceRun, plan: dict[str, Any]
) -> SearchIntelligenceDataset:
    dataset = await session.scalar(
        select(SearchIntelligenceDataset).where(
            SearchIntelligenceDataset.run_id == run.id,
            SearchIntelligenceDataset.scope_hash == plan["scope_hash"],
        )
    )
    if dataset is None:
        dataset = _dataset_from_plan(run, plan)
        session.add(dataset)
        await session.flush()
    return dataset


async def _persist_intent(
    session: AsyncSession,
    run: SearchIntelligenceRun,
    dataset: SearchIntelligenceDataset,
    plan: dict[str, Any],
    sequence: int,
) -> SearchIntelligenceCall:
    request_key = f"{plan['dataset_key']}:{plan['page']}"
    call = await session.scalar(
        select(SearchIntelligenceCall).where(
            SearchIntelligenceCall.run_id == run.id,
            SearchIntelligenceCall.request_key == request_key,
        )
    )
    if call is None:
        call = SearchIntelligenceCall(
            workspace_id=run.workspace_id,
            project_id=run.project_id,
            run_id=run.id,
            dataset_id=dataset.id,
            request_key=request_key,
            sequence=sequence,
            endpoint=plan["endpoint"],
            sanitized_request=plan["request"],
            estimated_cost_usd=Decimal(plan["estimated_cost_usd"]),
            status="intent",
        )
        session.add(call)
        await session.flush()
    return call


@dataclass(frozen=True, slots=True)
class _PreparedCall:
    action: str
    encrypted_secret: str = ""
    base_url: str = ""


async def _start_run(
    session_factory: async_sessionmaker[AsyncSession],
    task: AnalyticsTask,
    run_id: uuid.UUID,
) -> SearchIntelligenceRun | None:
    async with session_factory() as session:
        run = await session.scalar(
            select(SearchIntelligenceRun)
            .where(
                SearchIntelligenceRun.id == run_id,
                SearchIntelligenceRun.workspace_id == task.workspace_id,
                SearchIntelligenceRun.project_id == task.project_id,
            )
            .with_for_update()
        )
        if run is None or run.status in {
            "succeeded",
            "failed",
            "partial",
            "cancelled",
            "uncertain",
        }:
            return None
        if run.pricing_version != PRICE_VERSION:
            run.status = "failed"
            run.error_code = "pricing_changed"
            run.error_detail = (
                "Pricing changed after confirmation; no provider call was made"
            )
            run.completed_at = _utcnow()
            await session.commit()
            return None
        if await _authorized_connection(session, run) is None:
            run.status = "failed"
            run.completed_at = _utcnow()
            await session.commit()
            return None
        run.status = "running"
        await session.commit()
        return run


async def _prepare_call(
    session_factory: async_sessionmaker[AsyncSession],
    run_id: uuid.UUID,
    plan: dict[str, Any],
    sequence: int,
) -> _PreparedCall:
    async with session_factory() as session:
        run = await session.get(SearchIntelligenceRun, run_id, with_for_update=True)
        if run is None or run.status != "running":
            return _PreparedCall("stop")
        connection = await _authorized_connection(session, run)
        if connection is None:
            run.status = "partial" if run.completed_calls else "failed"
            run.completed_at = _utcnow()
            await session.commit()
            return _PreparedCall("stop")
        dataset = await _get_or_create_dataset(session, run, plan)
        if dataset.status in {"published", "failed"}:
            await session.commit()
            return _PreparedCall("skip")
        call = await _persist_intent(session, run, dataset, plan, sequence)
        if call.status == "succeeded":
            await session.commit()
            return _PreparedCall("skip")
        if call.status == "dispatched" and call.sanitized_response is not None:
            await session.commit()
            return _PreparedCall("saved_response")
        if call.status == "dispatched":
            call.status = "uncertain"
            call.completed_at = _utcnow()
            run.uncertain_calls += 1
            run.status = "uncertain"
            run.completed_at = call.completed_at
            await session.commit()
            return _PreparedCall("stop")
        await session.commit()
        return _PreparedCall(
            "dispatch", connection.api_key_encrypted, connection.base_url
        )


def _capacity_request(
    task: AnalyticsTask, run: SearchIntelligenceRun, sequence: int
) -> CapacityRequest:
    return CapacityRequest(
        task_id=None,
        analytics_task_id=task.id,
        attempt_number=sequence + 1,
        logical_engine=SEARCH_INTELLIGENCE_CAPACITY_ENGINE,
        transport_provider=TRANSPORT_DATAFORSEO,
        credential_kind=CREDENTIAL_KIND_BYOK,
        connection_id=run.connection_id,
        account_pool_identity=run.account_identity,
    )


async def _mark_capacity_wait(
    session_factory: async_sessionmaker[AsyncSession],
    run_id: uuid.UUID,
    sequence: int,
) -> None:
    async with session_factory() as session:
        run = await session.get(SearchIntelligenceRun, run_id, with_for_update=True)
        if run is None or run.status != "running":
            return
        call = await session.scalar(
            select(SearchIntelligenceCall).where(
                SearchIntelligenceCall.run_id == run_id,
                SearchIntelligenceCall.sequence == sequence,
            )
        )
        if call is not None:
            call.status = "intent"
            call.dispatched_at = None
        run.status = "queued"
        await session.commit()


async def _mark_dispatched(
    session_factory: async_sessionmaker[AsyncSession],
    run_id: uuid.UUID,
    sequence: int,
) -> bool:
    async with session_factory() as session:
        run = await session.get(SearchIntelligenceRun, run_id, with_for_update=True)
        call = await session.scalar(
            select(SearchIntelligenceCall)
            .where(
                SearchIntelligenceCall.run_id == run_id,
                SearchIntelligenceCall.sequence == sequence,
            )
            .with_for_update()
        )
        if (
            run is None
            or run.status != "running"
            or call is None
            or call.status != "intent"
        ):
            await session.rollback()
            return False
        call.status = "dispatched"
        call.dispatched_at = _utcnow()
        await session.commit()
        return True


async def _send_once(
    session_factory: async_sessionmaker[AsyncSession],
    request: CapacityRequest,
    prepared: _PreparedCall,
    plan: dict[str, Any],
) -> tuple[ResearchResponse | None, ProviderError | None]:
    response: ResearchResponse | None = None
    error: ProviderError | None = None
    try:
        response = await execute_live(
            encrypted_secret=prepared.encrypted_secret,
            endpoint=plan["endpoint"],
            payload=plan["request"],
            base_url=prepared.base_url,
        )
    except ProviderError as exc:
        error = exc
    finally:
        outcome = CAPACITY_OUTCOME_SUCCEEDED if response else CAPACITY_OUTCOME_FAILED
        if error is not None and error.error_code == ERROR_RATE_LIMIT:
            outcome = CAPACITY_OUTCOME_RATE_LIMITED
        await release_provider_capacity(
            session_factory,
            request=request,
            outcome=CapacityOutcome(
                kind=outcome,
                retry_after_seconds=error.retry_after_seconds if error else None,
            ),
        )
    return response, error


def _record_provider_error(
    run: SearchIntelligenceRun,
    call: SearchIntelligenceCall,
    dataset: SearchIntelligenceDataset,
    error: ProviderError,
) -> bool:
    uncertain = error.error_code in {ERROR_CONNECTION, ERROR_TIMEOUT}
    call.status = "uncertain" if uncertain else "failed"
    call.error_code = error.error_code
    call.error_detail = str(error)[:2000]
    call.completed_at = _utcnow()
    dataset.status = "failed"
    dataset.coverage = "unknown"
    dataset.collection_ended_at = call.completed_at
    if uncertain:
        run.uncertain_calls += 1
        if run.status != "cancelled":
            run.status = "uncertain"
            run.completed_at = call.completed_at
    return uncertain


def _apply_reported_cost(
    run: SearchIntelligenceRun, response: ResearchResponse
) -> bool:
    if response.cost_usd is None:
        run.uncertain_calls += 1
        if run.status == "cancelled":
            return True
        run.status = "uncertain"
        run.error_code = "provider_cost_unavailable"
        run.completed_at = _utcnow()
        run.error_detail = (
            "Provider completed the call without an auditable task cost; "
            "remaining calls were stopped"
        )
        return True
    run.provider_reported_cost_usd = (
        run.provider_reported_cost_usd or Decimal("0")
    ) + response.cost_usd
    if run.status == "cancelled":
        return True
    if run.provider_reported_cost_usd <= run.estimated_cost_usd:
        return False
    run.status = "partial"
    run.error_code = "cost_ceiling_exceeded"
    run.completed_at = _utcnow()
    run.error_detail = (
        "Provider-reported cost exceeded the confirmed estimate; "
        "remaining calls were stopped"
    )
    return True


def _publish_complete_dataset(
    dataset: SearchIntelligenceDataset,
    call: SearchIntelligenceCall,
    plan: dict[str, Any],
    later_plans: list[dict[str, Any]],
    received: int,
) -> None:
    has_later_page = any(
        later["dataset_key"] == plan["dataset_key"] for later in later_plans
    )
    exhausted = received < int(plan["request"].get("limit", 1))
    if has_later_page and not exhausted:
        return
    dataset.status = "published"
    if dataset.summary.get("result_available") is False:
        dataset.coverage = "unknown"
    elif dataset.raw_rows_received == 0:
        dataset.coverage = "empty"
    elif dataset.dataset_kind in {"footprint", "backlink_summary", "backlink_history"}:
        dataset.coverage = "complete"
    elif exhausted or dataset.unique_rows_saved >= dataset.requested_rows:
        dataset.coverage = "complete"
    else:
        dataset.coverage = "partial"
    dataset.truncated = dataset.coverage == "partial" or (
        dataset.dataset_kind not in {"footprint", "backlink_summary"}
        and dataset.provider_total is not None
        and dataset.provider_total > dataset.unique_rows_saved
    )
    dataset.collection_ended_at = call.completed_at
    dataset.published_at = call.completed_at


async def _persist_success(
    session: AsyncSession,
    run: SearchIntelligenceRun,
    call: SearchIntelligenceCall,
    dataset: SearchIntelligenceDataset,
    response: ResearchResponse,
    plan: dict[str, Any],
    later_plans: list[dict[str, Any]],
) -> tuple[bool, bool]:
    call.status = "succeeded"
    call.sanitized_response = response.body
    call.response_sha256 = response.response_sha256
    call.provider_task_id = response.provider_task_id
    call.provider_reported_cost_usd = response.cost_usd
    call.completed_at = _utcnow()
    stopped = _apply_reported_cost(run, response)
    try:
        summary, normalized, total = normalize_response(
            dataset.dataset_kind, response.body, plan
        )
    except ValueError as exc:
        call.status = "failed"
        call.error_code = "provider_scope_violation"
        call.error_detail = str(exc)
        dataset.status = "failed"
        dataset.coverage = "unknown"
        dataset.collection_ended_at = call.completed_at
        if run.status not in {"cancelled", "uncertain"}:
            run.status = "partial"
            run.error_code = call.error_code
            run.error_detail = (
                "Provider results did not match the reviewed website; "
                "remaining calls were stopped"
            )
            run.completed_at = call.completed_at
        return True, True
    existing = set(
        (
            await session.scalars(
                select(SearchIntelligenceRow.provider_row_key).where(
                    SearchIntelligenceRow.dataset_id == dataset.id
                )
            )
        ).all()
    )
    for values in normalized:
        key = values["provider_row_key"]
        if key not in existing:
            session.add(_row_model(dataset, call, values))
            existing.add(key)
    received = summary["provider_items_received"]
    dataset.raw_rows_received += received
    dataset.unique_rows_saved = len(existing)
    dataset.provider_total = total if total is not None else dataset.provider_total
    dataset.summary = {
        **(dataset.summary or {}),
        **summary,
        "source_call_ids": [
            *(dataset.summary or {}).get("source_call_ids", []),
            str(call.id),
        ],
    }
    run.completed_calls += 1
    run.received_rows += len(normalized)
    _publish_complete_dataset(dataset, call, plan, later_plans, received)
    return summary["result_available"] is False, stopped


async def _persist_outcome(
    session_factory: async_sessionmaker[AsyncSession],
    run_id: uuid.UUID,
    sequence: int,
    plan: dict[str, Any],
    later_plans: list[dict[str, Any]],
    response: ResearchResponse | None,
    error: ProviderError | None,
) -> tuple[bool, bool]:
    async with session_factory() as session:
        run = await session.get(SearchIntelligenceRun, run_id, with_for_update=True)
        call_result = await session.scalar(
            select(SearchIntelligenceCall)
            .where(
                SearchIntelligenceCall.run_id == run_id,
                SearchIntelligenceCall.sequence == sequence,
            )
            .with_for_update()
        )
        if run is None or call_result is None:
            return False, True
        dataset_result = await session.get(
            SearchIntelligenceDataset, call_result.dataset_id, with_for_update=True
        )
        if dataset_result is None:
            run.status = "failed"
            run.error_code = "dataset_state_missing"
            run.error_detail = (
                "Acquisition dataset disappeared before response persistence"
            )
            run.completed_at = _utcnow()
            await session.commit()
            return False, True
        if error is not None:
            stopped = _record_provider_error(run, call_result, dataset_result, error)
            await session.commit()
            return True, stopped
        if response is None:
            call_result.status = "uncertain"
            call_result.error_code = "provider_result_missing"
            run.uncertain_calls += 1
            if run.status != "cancelled":
                run.status = "uncertain"
                run.error_code = call_result.error_code
                run.error_detail = (
                    "Provider execution ended without a response or classified error"
                )
                run.completed_at = _utcnow()
            await session.commit()
            return False, True
        failed, stopped = await _persist_success(
            session, run, call_result, dataset_result, response, plan, later_plans
        )
        await session.commit()
        return failed, stopped


async def _save_response(
    session_factory: async_sessionmaker[AsyncSession],
    run_id: uuid.UUID,
    sequence: int,
    response: ResearchResponse,
) -> None:
    """Commit provider evidence before normalization or another paid dispatch."""
    async with session_factory() as session:
        call = await session.scalar(
            select(SearchIntelligenceCall)
            .where(
                SearchIntelligenceCall.run_id == run_id,
                SearchIntelligenceCall.sequence == sequence,
            )
            .with_for_update()
        )
        if call is None or call.status != "dispatched":
            return
        call.sanitized_response = response.body
        call.response_sha256 = response.response_sha256
        call.provider_task_id = response.provider_task_id
        call.provider_reported_cost_usd = response.cost_usd
        await session.commit()


async def _saved_response(
    session_factory: async_sessionmaker[AsyncSession], run_id: uuid.UUID, sequence: int
) -> ResearchResponse | None:
    async with session_factory() as session:
        call = await session.scalar(
            select(SearchIntelligenceCall).where(
                SearchIntelligenceCall.run_id == run_id,
                SearchIntelligenceCall.sequence == sequence,
            )
        )
        if call is None or call.sanitized_response is None:
            return None
        return ResearchResponse(
            body=call.sanitized_response,
            response_sha256=call.response_sha256,
            provider_task_id=call.provider_task_id,
            cost_usd=call.provider_reported_cost_usd,
            cost_source=None,
        )


async def _finish_run(
    session_factory: async_sessionmaker[AsyncSession],
    run_id: uuid.UUID,
    failed_datasets: bool,
) -> None:
    async with session_factory() as session:
        run = await session.get(SearchIntelligenceRun, run_id, with_for_update=True)
        if run is None or run.status in {"cancelled", "uncertain", "failed", "partial"}:
            return
        run.status = "partial" if failed_datasets else "succeeded"
        run.completed_at = _utcnow()
        await session.commit()


async def execute_search_intelligence(
    session_factory: async_sessionmaker[AsyncSession], task: AnalyticsTask
) -> None:
    run_id = uuid.UUID(str((task.payload or {}).get("run_id")))
    run = await _start_run(session_factory, task, run_id)
    if run is None:
        return
    failed_datasets = False
    for sequence, plan in enumerate(run.call_plan):
        failed, stopped = await _execute_plan(
            session_factory, task, run, sequence, plan
        )
        failed_datasets = failed_datasets or failed
        if stopped:
            break
    await _finish_run(session_factory, run_id, failed_datasets)


async def _execute_plan(
    session_factory: async_sessionmaker[AsyncSession],
    task: AnalyticsTask,
    run: SearchIntelligenceRun,
    sequence: int,
    plan: dict[str, Any],
) -> tuple[bool, bool]:
    run_id = run.id
    prepared = await _prepare_call(session_factory, run_id, plan, sequence)
    if prepared.action == "stop":
        return False, True
    if prepared.action == "skip":
        return False, False
    later_plans = run.call_plan[sequence + 1 :]
    if prepared.action == "saved_response":
        response = await _saved_response(session_factory, run_id, sequence)
        if response is None:
            return False, True
        return await _persist_outcome(
            session_factory, run_id, sequence, plan, later_plans, response, None
        )
    request = _capacity_request(task, run, sequence)
    decision = await acquire_provider_capacity(session_factory, request=request)
    if not decision.acquired:
        await _mark_capacity_wait(session_factory, run_id, sequence)
        raise CapacityWaitError(decision.available_at or _utcnow())
    if not await _mark_dispatched(session_factory, run_id, sequence):
        await release_provider_capacity(
            session_factory,
            request=request,
            outcome=CapacityOutcome(kind=CAPACITY_OUTCOME_FAILED),
        )
        return False, True
    response, error = await _send_once(session_factory, request, prepared, plan)
    if response is not None:
        await _save_response(session_factory, run_id, sequence, response)
    return await _persist_outcome(
        session_factory, run_id, sequence, plan, later_plans, response, error
    )
