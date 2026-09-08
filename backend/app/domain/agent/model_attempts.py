"""Durable dispatch and receipt evidence for Growth Agent narration calls."""

from __future__ import annotations

import asyncio
import hashlib
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.connectors.agent.gateway import ModelGateway, ModelResult
from app.connectors.app_model_config import AppModelRouteConfig
from app.core.config.agent import default_agent_settings
from app.core.config.app_models import APP_FEATURE_GROWTH_AGENT
from app.core.config.entitlements import KEY_AI_CREDITS, KEY_GROWTH_AGENT
from app.domain.billing.catalog_revisions import (
    CatalogUnavailableError,
    published_ai_credit_policy,
)
from app.domain.entitlements.enforcement import (
    CapabilityNotGrantedError,
    require_workspace_capability,
)
from app.domain.entitlements.metered import MeteredSubject, reserve_metered_usage
from app.models.agent import AgentModelAttempt, AgentTaskRun
from app.models.billing import WorkspaceBillingLink
from app.models.provider import ProviderAppRoute, ProviderConnection


@dataclass(frozen=True, slots=True)
class NarrationReceipt:
    content: str
    provider: dict[str, object]


def fallback_result(
    *,
    narrative: dict[str, object],
    roadmap_items: list[dict[str, object]],
    sources: list[dict[str, object]],
    limitations: list[str],
    artifact_refs: list[dict[str, object]],
    reason: str,
) -> dict[str, object]:
    return {
        **narrative,
        "roadmap_items": roadmap_items,
        "sources": sources,
        "limitations": [*limitations, reason],
        "artifact_refs": artifact_refs,
    }


class NarrationUnavailableError(RuntimeError):
    def __init__(self, *, reason: str, cause: Exception | None = None) -> None:
        super().__init__(reason)
        self.reason = reason
        self.cause = cause


def _utcnow() -> datetime:
    return datetime.now(UTC)


async def _route_is_current(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    route: AppModelRouteConfig,
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


async def _eligible_run(
    session: AsyncSession, *, run_id: uuid.UUID, owner: str
) -> AgentTaskRun | None:
    run = await session.scalar(
        select(AgentTaskRun).where(AgentTaskRun.id == run_id).with_for_update()
    )
    if run is None or run.status != "running" or run.lease_owner != owner:
        return None
    try:
        await require_workspace_capability(
            session, workspace_id=run.workspace_id, key=KEY_GROWTH_AGENT
        )
    except CapabilityNotGrantedError:
        return None
    now = _utcnow()
    lease_expired = run.lease_expires_at is not None and run.lease_expires_at <= now
    return None if run.cancelled_at is not None or lease_expired else run


async def _platform_hold(
    session: AsyncSession,
    *,
    run: AgentTaskRun,
    gateway: ModelGateway,
    dispatch_id: uuid.UUID,
) -> tuple[uuid.UUID, int, str] | None:
    try:
        revision, policy = await published_ai_credit_policy(session)
    except CatalogUnavailableError:
        return None
    rate = policy.rate(feature=APP_FEATURE_GROWTH_AGENT, model=gateway.model)
    account_id = await session.scalar(
        select(WorkspaceBillingLink.billing_account_id).where(
            WorkspaceBillingLink.workspace_id == run.workspace_id
        )
    )
    if rate is None or account_id is None:
        return None
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
    return reservation.reservation_id, rate.call_credit_cap, revision


async def _funding_hold(
    session: AsyncSession,
    *,
    run: AgentTaskRun,
    gateway: ModelGateway,
    app_route: AppModelRouteConfig | None,
    dispatch_id: uuid.UUID,
) -> tuple[uuid.UUID, int, str] | None:
    if app_route is not None:
        return uuid.UUID(int=0), 0, ""
    return await _platform_hold(
        session, run=run, gateway=gateway, dispatch_id=dispatch_id
    )


async def _reject_duplicate_dispatch(
    session: AsyncSession, dispatch_id: uuid.UUID
) -> None:
    duplicate = await session.scalar(
        select(AgentModelAttempt.id).where(AgentModelAttempt.dispatch_id == dispatch_id)
    )
    if duplicate is not None:
        raise RuntimeError("duplicate narration dispatch")


async def start_model_attempt(
    session: AsyncSession,
    *,
    run_id: uuid.UUID,
    owner: str,
    gateway: ModelGateway,
    app_route: AppModelRouteConfig | None,
    narration_input: str,
) -> AgentModelAttempt | None:
    """Fence the lease and commit immutable dispatch evidence before I/O."""
    await session.rollback()
    run = await _eligible_run(session, run_id=run_id, owner=owner)
    if run is None:
        await session.rollback()
        return None
    now = _utcnow()
    route_current = app_route is None or await _route_is_current(
        session, workspace_id=run.workspace_id, route=app_route
    )
    if not route_current:
        await session.rollback()
        return None
    dispatch_id = uuid.uuid5(run.id, f"narration:{run.attempt_count}:1")
    await _reject_duplicate_dispatch(session, dispatch_id)
    hold = await _funding_hold(
        session,
        run=run,
        gateway=gateway,
        app_route=app_route,
        dispatch_id=dispatch_id,
    )
    if hold is None:
        await session.rollback()
        return None
    attempt = AgentModelAttempt(
        workspace_id=run.workspace_id,
        project_id=run.project_id,
        task_run_id=run.id,
        dispatch_id=dispatch_id,
        run_attempt=run.attempt_count,
        ordinal=1,
        funding_source="customer_byok" if app_route else "platform",
        provider_connection_id=app_route.connection_id if app_route else None,
        provider_route_id=app_route.route_id if app_route else None,
        credential_revision=app_route.credential_revision if app_route else None,
        route_revision=app_route.route_revision if app_route else None,
        provider_adapter=gateway.adapter_name,
        endpoint_host=gateway.base_url_host,
        requested_model=gateway.model,
        pricing_revision=hold[2],
        reservation_id=hold[0] if hold[0].int else None,
        reserved_credits=hold[1],
        request_hash=hashlib.sha256(narration_input.encode()).hexdigest(),
        dispatched_at=now,
        deadline_at=now
        + timedelta(seconds=default_agent_settings.execution_timeout_seconds),
        settlement_status="not_applicable" if app_route else "pending",
    )
    session.add(attempt)
    await session.commit()
    await session.refresh(attempt)
    return attempt


async def narrate(
    session: AsyncSession,
    *,
    run_id: uuid.UUID,
    owner: str,
    gateway: ModelGateway,
    app_route: AppModelRouteConfig | None,
    narration_input: str,
    system: str,
    schema: dict[str, object],
) -> NarrationReceipt:
    attempt = await start_model_attempt(
        session,
        run_id=run_id,
        owner=owner,
        gateway=gateway,
        app_route=app_route,
        narration_input=narration_input,
    )
    if attempt is None:
        raise NarrationUnavailableError(reason="funding")
    try:
        response = await asyncio.wait_for(
            gateway.complete_structured(
                system=system,
                user=narration_input,
                schema_name="bounded_agent_result",
                schema=schema,
            ),
            timeout=default_agent_settings.execution_timeout_seconds,
        )
    except Exception as exc:
        await record_model_failure(
            session, attempt_id=attempt.id, gateway=gateway, exc=exc
        )
        raise NarrationUnavailableError(reason="provider", cause=exc) from exc
    await record_model_receipt(session, attempt_id=attempt.id, response=response)
    return NarrationReceipt(
        content=response.content,
        provider={
            "adapter": response.provider_adapter,
            "host": response.endpoint_host,
            "model": response.returned_model,
            "usage": response.usage,
            "latency_ms": response.latency_ms,
        },
    )


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
    attempt.output_hash = hashlib.sha256(response.content.encode()).hexdigest()
    attempt.latency_ms = max(response.latency_ms, 0)
    attempt.outcome = "completed"
    attempt.settled_at = _utcnow()
    attempt.late_receipt = attempt.settled_at > attempt.deadline_at
    if attempt.funding_source == "customer_byok":
        attempt.settlement_status = "zero_debit"
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
    classification = gateway.classify_error(exc)
    attempt.error_code = str(classification.get("code") or "provider_error")[:64]
    attempt.outcome = "failed"
    attempt.settled_at = _utcnow()
    attempt.late_receipt = attempt.settled_at > attempt.deadline_at
    if attempt.funding_source == "customer_byok":
        attempt.settlement_status = "zero_debit"
    await session.commit()
