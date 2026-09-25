"""Funded, fenced model dispatch for agent runs.

Every model step commits an immutable dispatch record, and for platform funding
a per-call credit hold, before any network I/O (invariants 15 and 16). The
receipt settles the hold against the published rate; a lost or late receipt
settles as unknown usage within the finite cap frozen at dispatch. Customer
BYOK consumes zero platform credits and never falls back to platform funding.
"""

from __future__ import annotations

import asyncio
import hashlib
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.connectors.agent.gateway import ModelGateway, ModelResult
from app.connectors.app_model_config import AppModelRouteConfig
from app.core.config.agent import default_agent_settings
from app.core.config.app_models import APP_FEATURE_AGENT
from app.core.config.entitlements import KEY_AGENT, KEY_AI_CREDITS
from app.core.config.task_queue import (
    TASK_STATUS_CANCELLED,
    TASK_STATUS_RUNNING,
    ReclaimAccounting,
)
from app.domain.billing.accounts import billing_account_id_for
from app.domain.billing.catalog_revisions import (
    CatalogUnavailableError,
    ai_credit_policy_for_revision,
    published_ai_credit_policy,
)
from app.domain.entitlements.enforcement import (
    CapabilityNotGrantedError,
    require_workspace_capability,
)
from app.domain.entitlements.ledger import FundedCreditsExhaustedError
from app.domain.entitlements.metered import (
    MeteredSubject,
    reserve_metered_usage,
    settle_metered_usage,
)
from app.models.agent import AgentModelAttempt, AgentRun
from app.models.provider import ProviderAppRoute, ProviderConnection

FUNDING_PLATFORM = "platform"
FUNDING_CUSTOMER_BYOK = "customer_byok"


class ModelUnavailableError(RuntimeError):
    """A step could not be dispatched or did not return a usable receipt.

    ``reason`` is ``lease`` (the run is no longer ours or was cancelled),
    ``funding`` (capability, route or credits), or ``provider`` (the call
    failed; ``cause`` carries the provider error).
    """

    def __init__(self, *, reason: str, cause: Exception | None = None) -> None:
        super().__init__(reason)
        self.reason = reason
        self.cause = cause


@dataclass(frozen=True, slots=True)
class ModelReceipt:
    content: str
    attempt_id: uuid.UUID


def _utcnow() -> datetime:
    return datetime.now(UTC)


async def lock_owned_run(
    session: AsyncSession, *, run_id: uuid.UUID, owner: str
) -> AgentRun | None:
    """The run, locked, when this worker still owns a live lease on it."""
    run = await session.scalar(
        select(AgentRun)
        .where(AgentRun.id == run_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if (
        run is None
        or run.status != TASK_STATUS_RUNNING
        or run.lease_owner != owner
        or run.cancelled_at is not None
        or (run.lease_expires_at is not None and run.lease_expires_at <= _utcnow())
    ):
        return None
    return run


async def _route_is_current(
    session: AsyncSession, *, workspace_id: uuid.UUID, route: AppModelRouteConfig
) -> bool:
    current = (
        await session.execute(
            select(ProviderAppRoute.id)
            .join(
                ProviderConnection,
                ProviderConnection.id == ProviderAppRoute.connection_id,
            )
            .where(
                ProviderAppRoute.id == route.route_id,
                ProviderAppRoute.workspace_id == workspace_id,
                ProviderAppRoute.active.is_(True),
                ProviderAppRoute.revision == route.route_revision,
                ProviderConnection.id == route.connection_id,
                ProviderConnection.workspace_id == workspace_id,
                ProviderConnection.active.is_(True),
                ProviderConnection.credential_revision == route.credential_revision,
            )
        )
    ).one_or_none()
    return current is not None


async def _platform_hold(
    session: AsyncSession, *, run: AgentRun, model: str, dispatch_id: uuid.UUID
) -> tuple[uuid.UUID | None, int, str] | None:
    try:
        revision, policy = await published_ai_credit_policy(session)
    except CatalogUnavailableError:
        return None
    rate = policy.rate(feature=APP_FEATURE_AGENT, model=model)
    account_id = await billing_account_id_for(session, run.workspace_id)
    if rate is None or account_id is None:
        return None
    try:
        reservation = await reserve_metered_usage(
            session,
            account_id=account_id,
            capability_key=KEY_AI_CREDITS,
            subject=MeteredSubject(
                kind="agent", subject_id=run.id, workspace_id=run.workspace_id
            ),
            hold_units=rate.call_credit_cap,
            idempotency_key=f"agent:{dispatch_id}:hold",
            at=_utcnow(),
        )
    except FundedCreditsExhaustedError:
        return None
    return reservation.reservation_id, rate.call_credit_cap, revision


async def _fenced_run(
    session: AsyncSession,
    *,
    run_id: uuid.UUID,
    owner: str,
    app_route: AppModelRouteConfig | None,
) -> AgentRun:
    """The locked run, once lease, capability and any customer route recheck."""
    run = await lock_owned_run(session, run_id=run_id, owner=owner)
    if run is None:
        await session.rollback()
        raise ModelUnavailableError(reason="lease")
    try:
        await require_workspace_capability(
            session, workspace_id=run.workspace_id, key=KEY_AGENT
        )
    except CapabilityNotGrantedError as exc:
        await session.rollback()
        raise ModelUnavailableError(reason="funding", cause=exc) from exc
    if app_route is not None and not await _route_is_current(
        session, workspace_id=run.workspace_id, route=app_route
    ):
        await session.rollback()
        raise ModelUnavailableError(reason="funding")
    return run


async def start_model_attempt(
    session: AsyncSession,
    *,
    run_id: uuid.UUID,
    owner: str,
    ordinal: int,
    gateway: ModelGateway,
    app_route: AppModelRouteConfig | None,
    request_text: str,
) -> AgentModelAttempt:
    """Fence the lease and commit the dispatch (and any hold) before I/O."""
    await session.rollback()
    run = await _fenced_run(session, run_id=run_id, owner=owner, app_route=app_route)
    dispatch_id = uuid.uuid5(run.id, f"step:{run.attempt_count}:{ordinal}")
    if await session.scalar(
        select(AgentModelAttempt.id).where(AgentModelAttempt.dispatch_id == dispatch_id)
    ):
        await session.rollback()
        raise ModelUnavailableError(reason="lease")
    hold: tuple[uuid.UUID | None, int, str] | None = (None, 0, "")
    if app_route is None:
        hold = await _platform_hold(
            session, run=run, model=gateway.model, dispatch_id=dispatch_id
        )
    if hold is None:
        await session.rollback()
        raise ModelUnavailableError(reason="funding")
    now = _utcnow()
    attempt = AgentModelAttempt(
        workspace_id=run.workspace_id,
        project_id=run.project_id,
        run_id=run.id,
        dispatch_id=dispatch_id,
        run_attempt=run.attempt_count,
        ordinal=ordinal,
        funding_source=FUNDING_CUSTOMER_BYOK if app_route else FUNDING_PLATFORM,
        provider_connection_id=app_route.connection_id if app_route else None,
        provider_route_id=app_route.route_id if app_route else None,
        credential_revision=app_route.credential_revision if app_route else None,
        route_revision=app_route.route_revision if app_route else None,
        provider_adapter=gateway.adapter_name,
        endpoint_host=gateway.base_url_host,
        requested_model=gateway.model,
        pricing_revision=hold[2],
        reservation_id=hold[0],
        reserved_credits=hold[1],
        request_hash=hashlib.sha256(request_text.encode("utf-8")).hexdigest(),
        dispatched_at=now,
        deadline_at=now
        + timedelta(seconds=default_agent_settings.execution_timeout_seconds),
        settlement_status="not_applicable" if app_route else "pending",
    )
    run.steps_used = max(run.steps_used, ordinal)
    session.add(attempt)
    await session.commit()
    return attempt


async def call_model(
    session: AsyncSession,
    *,
    run_id: uuid.UUID,
    owner: str,
    ordinal: int,
    gateway: ModelGateway,
    app_route: AppModelRouteConfig | None,
    system: str,
    user: str,
    schema_name: str,
    schema: dict[str, object],
) -> ModelReceipt:
    attempt = await start_model_attempt(
        session,
        run_id=run_id,
        owner=owner,
        ordinal=ordinal,
        gateway=gateway,
        app_route=app_route,
        request_text=f"{system}\n\n{user}",
    )
    attempt_id = attempt.id
    try:
        response = await asyncio.wait_for(
            gateway.complete_structured(
                system=system, user=user, schema_name=schema_name, schema=schema
            ),
            timeout=default_agent_settings.execution_timeout_seconds,
        )
    except Exception as exc:
        await record_model_failure(
            session, attempt_id=attempt_id, gateway=gateway, exc=exc
        )
        raise ModelUnavailableError(reason="provider", cause=exc) from exc
    await record_model_receipt(session, attempt_id=attempt_id, response=response)
    return ModelReceipt(content=response.content, attempt_id=attempt_id)


def _normalized_usage(usage: dict[str, int]) -> dict[str, int | None]:
    def _value(*names: str) -> int | None:
        for name in names:
            value = usage.get(name)
            if isinstance(value, int) and value >= 0:
                return value
        return None

    return {
        "input_tokens": _value("input_tokens", "prompt_tokens"),
        "cached_input_tokens": _value("cached_input_tokens"),
        "output_tokens": _value("output_tokens", "completion_tokens"),
        "reasoning_tokens": _value("reasoning_tokens"),
        "total_tokens": _value("total_tokens"),
    }


async def _settle(
    session: AsyncSession,
    *,
    attempt: AgentModelAttempt,
    usage: dict[str, int | None] | None,
    at: datetime,
) -> None:
    if attempt.funding_source != FUNDING_PLATFORM or attempt.reservation_id is None:
        attempt.settlement_status = "zero_debit"
        return
    rate = None
    try:
        policy = await ai_credit_policy_for_revision(session, attempt.pricing_revision)
    except CatalogUnavailableError:
        policy = None
    if policy is not None:
        rate = policy.rate(feature=APP_FEATURE_AGENT, model=attempt.requested_model)
    complete = {
        key: value for key, value in (usage or {}).items() if isinstance(value, int)
    }
    charged = (
        rate.charge(complete) if rate is not None and attempt.usage_complete else None
    )
    settlement = await settle_metered_usage(
        session,
        reservation_id=attempt.reservation_id,
        dispatch_key=str(attempt.dispatch_id),
        attempt=attempt.run_attempt,
        charged_units=charged,
        # Without the historical rate, close the hold against its admitted
        # finite cap rather than treating an unknown outcome as free.
        unknown_usage_charge=(
            rate.unknown_usage_charge if rate is not None else attempt.reserved_credits
        ),
        idempotency_key=f"agent:{attempt.id}:settle",
        at=at,
    )
    attempt.debited_credits = settlement.charged_units
    attempt.settlement_status = "settled" if rate is not None else "unknown_policy"


async def record_model_receipt(
    session: AsyncSession, *, attempt_id: uuid.UUID, response: ModelResult
) -> None:
    await session.rollback()
    attempt = await session.get(AgentModelAttempt, attempt_id, with_for_update=True)
    if attempt is None or attempt.outcome != "dispatched":
        await session.rollback()
        return
    usage = _normalized_usage(response.usage)
    attempt.returned_model = response.returned_model[:255]
    attempt.finish_status = response.finish_status[:64]
    attempt.input_tokens = usage["input_tokens"]
    attempt.cached_input_tokens = usage["cached_input_tokens"]
    attempt.output_tokens = usage["output_tokens"]
    attempt.reasoning_tokens = usage["reasoning_tokens"]
    attempt.total_tokens = usage["total_tokens"]
    attempt.usage_complete = (
        usage["input_tokens"] is not None and usage["output_tokens"] is not None
    )
    attempt.output_hash = hashlib.sha256(response.content.encode("utf-8")).hexdigest()
    attempt.latency_ms = max(response.latency_ms, 0)
    attempt.outcome = "completed"
    attempt.settled_at = _utcnow()
    attempt.late_receipt = attempt.settled_at > attempt.deadline_at
    await _settle(session, attempt=attempt, usage=usage, at=attempt.settled_at)
    await session.commit()


async def record_model_failure(
    session: AsyncSession,
    *,
    attempt_id: uuid.UUID,
    gateway: ModelGateway,
    exc: Exception,
) -> None:
    await session.rollback()
    attempt = await session.get(AgentModelAttempt, attempt_id, with_for_update=True)
    if attempt is None or attempt.outcome != "dispatched":
        await session.rollback()
        return
    attempt.error_code = str(
        gateway.classify_error(exc).get("code") or "provider_error"
    )[:64]
    attempt.outcome = "failed"
    attempt.settled_at = _utcnow()
    attempt.late_receipt = attempt.settled_at > attempt.deadline_at
    await _settle(session, attempt=attempt, usage=None, at=attempt.settled_at)
    await session.commit()


async def reconcile_stale_model_attempts(
    session: AsyncSession, *, run_id: uuid.UUID, now: datetime
) -> None:
    """Close dispatches a lost worker left open, while the run is locked."""
    attempts = (
        await session.scalars(
            select(AgentModelAttempt)
            .where(
                AgentModelAttempt.run_id == run_id,
                AgentModelAttempt.outcome == "dispatched",
            )
            .with_for_update()
        )
    ).all()
    for attempt in attempts:
        attempt.outcome = "recovered_unknown"
        attempt.error_code = "worker_lost_after_dispatch"
        attempt.settled_at = now
        attempt.usage_complete = False
        await _settle(session, attempt=attempt, usage=None, at=now)


async def reconcile_stale_cancelled_model_attempts(
    session_factory: async_sessionmaker[AsyncSession], *, batch_size: int = 100
) -> None:
    """Close cancelled runs' dispatches whose final receipt never arrived."""
    now = _utcnow()
    cutoff = now - timedelta(seconds=default_agent_settings.lease_margin_seconds)
    async with session_factory() as session:
        run_ids = list(
            (
                await session.scalars(
                    select(AgentModelAttempt.run_id)
                    .join(AgentRun, AgentRun.id == AgentModelAttempt.run_id)
                    .where(
                        AgentRun.status == TASK_STATUS_CANCELLED,
                        AgentModelAttempt.outcome == "dispatched",
                        AgentModelAttempt.deadline_at <= cutoff,
                    )
                    .limit(batch_size)
                )
            ).all()
        )
        await session.rollback()
    for run_id in dict.fromkeys(run_ids):
        async with session_factory() as session:
            run = await session.get(AgentRun, run_id, with_for_update=True)
            if run is not None and run.status == TASK_STATUS_CANCELLED:
                await reconcile_stale_model_attempts(session, run_id=run_id, now=now)
            await session.commit()


async def agent_reclaim_accounting(
    session: AsyncSession, run: AgentRun, now: datetime
) -> ReclaimAccounting:
    """Sweeper hook: settle a lost turn's open dispatches as unknown usage.

    The worker counts the attempt when it starts the turn, so the reclaim
    must not count it again.
    """
    await reconcile_stale_model_attempts(session, run_id=run.id, now=now)
    return ReclaimAccounting(already_counted=True)
