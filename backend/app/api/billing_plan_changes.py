"""Base-plan changes under the active workspace's billing account.

``POST /billing/subscription/change`` names only the target plan. The server
decides the direction from the published prices, prices an upgrade's
prorated difference for the rest of the paid period, and schedules a
downgrade for the next renewal. An upgrade returns a pending one-time charge
that is paid through the same checkout as any other purchase; nothing about
the plan changes until that payment settles.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.billing_guards import (
    IdempotencyKey,
    one_time_provider_call,
    purchase_country,
    purchase_identity,
    safe_commercial_errors,
)
from app.api.deps import WorkspaceContext, get_db, require_active_workspace_billing
from app.connectors.billing.base import BillingProviderError
from app.connectors.billing.factory import get_billing_provider
from app.connectors.billing.registry import adapter_for_record
from app.core.config.billing_contracts import (
    ACTIVATION_PENDING,
    CREDENTIAL_MODE_BYOK,
    OPERATION_PLAN_CHANGE,
    PLAN_CHANGE_DOWNGRADE,
    PLAN_CHANGE_REJECTED,
    PLAN_CHANGE_REQUESTED,
    PLAN_CHANGE_UPGRADE,
    REASON_CHECKOUT_UNAVAILABLE,
    REASON_PROVIDER_REJECTED,
)
from app.domain.billing.idempotency import execute_intent, replay_intent
from app.domain.billing.plan_changes import (
    PlanChange,
    clear_scheduled_change,
    push_scheduled_change,
    reject_pending_upgrade,
    request_downgrade,
    resolve_plan_change,
)
from app.domain.billing.schemas import (
    ActivationResponse,
    PlanChangeRequest,
    PlanChangeResponse,
)
from app.domain.billing.service import (
    BillingConflictError,
    current_base_subscription,
    live_base_subscription,
    resolve_base_intent,
    workspace_account,
)
from app.models.billing import BillingAccount, BillingSubscription

router = APIRouter()
BillingWorkspace = Annotated[
    WorkspaceContext, Depends(require_active_workspace_billing)
]
Session = Annotated[AsyncSession, Depends(get_db)]


def _upgrade_response(
    activation: ActivationResponse, change_catalog_key: str, effective_at: datetime
) -> PlanChangeResponse:
    return PlanChangeResponse(
        direction=PLAN_CHANGE_UPGRADE,
        catalog_key=change_catalog_key,
        status="payment_required",
        effective_at=effective_at,
        activation=activation,
    )


def _existing_downgrade(
    subscription: BillingSubscription, catalog_key: str
) -> PlanChangeResponse | None:
    """Repeating the SAME scheduled downgrade reports it instead of refusing."""
    change = subscription.scheduled_change
    if (
        not change
        or change.get("direction") != PLAN_CHANGE_DOWNGRADE
        or change.get("catalog_key") != catalog_key
        or change.get("state") == PLAN_CHANGE_REJECTED
    ):
        return None
    return PlanChangeResponse(
        direction=PLAN_CHANGE_DOWNGRADE,
        catalog_key=catalog_key,
        status=change["state"],
        effective_at=change["effective_at"],
        activation=None,
    )


async def _downgrade(
    session: AsyncSession, subscription: BillingSubscription, change: PlanChange
) -> PlanChangeResponse:
    """Commit the change, then ask the ORIGINATING provider to schedule it."""
    adapter = adapter_for_record(subscription.provider, subscription.provider_mode)
    if adapter is None:
        raise BillingConflictError(REASON_CHECKOUT_UNAVAILABLE)
    subscription_id = subscription.id
    await request_downgrade(session, subscription, change)
    state = await push_scheduled_change(session, subscription_id, adapter)
    if state == PLAN_CHANGE_REJECTED:
        # Nothing depends on a refused downgrade yet: drop it and say so.
        await clear_scheduled_change(session, subscription_id)
        raise BillingProviderError(REASON_PROVIDER_REJECTED)
    return PlanChangeResponse(
        direction=PLAN_CHANGE_DOWNGRADE,
        catalog_key=change.catalog_key,
        status="scheduled" if state != PLAN_CHANGE_REQUESTED else "requested",
        effective_at=change.effective_at,
        activation=None,
    )


async def _replayed_upgrade(
    session: AsyncSession,
    account: BillingAccount,
    payload: PlanChangeRequest,
    idempotency_key: str,
    response: Response,
) -> PlanChangeResponse | None:
    identity = purchase_identity(account)
    replayed = await replay_intent(
        session,
        account=account,
        operation=OPERATION_PLAN_CHANGE,
        catalog_key=payload.catalog_key,
        quantity=1,
        credential_mode=CREDENTIAL_MODE_BYOK,
        idempotency_key=idempotency_key,
        billing_context={
            "country_code": purchase_country(account),
            "customer": identity.snapshot(),
        },
    )
    if replayed is None:
        return None
    activation = replayed.response
    if activation.status != ACTIVATION_PENDING:
        response.status_code = status.HTTP_200_OK
    subscription = await current_base_subscription(session, account.id)
    period_end = subscription.current_period_end if subscription else None
    return _upgrade_response(
        activation, payload.catalog_key, period_end or activation.expires_at
    )


@router.post("/billing/subscription/change", status_code=status.HTTP_202_ACCEPTED)
async def post_plan_change(
    payload: PlanChangeRequest,
    ctx: BillingWorkspace,
    session: Session,
    idempotency_key: IdempotencyKey,
    response: Response,
) -> PlanChangeResponse:
    """Upgrade now (prorated charge) or downgrade at the next renewal."""
    with safe_commercial_errors():
        account = await workspace_account(
            session, workspace_id=ctx.workspace_id, user=ctx.user
        )
        replayed = await _replayed_upgrade(
            session, account, payload, idempotency_key, response
        )
        if replayed is not None:
            return replayed
        subscription = await live_base_subscription(session, account.id)
        existing = _existing_downgrade(subscription, payload.catalog_key)
        if existing is not None:
            response.status_code = status.HTTP_200_OK
            return existing
        await reject_pending_upgrade(session, account.id)
        identity = purchase_identity(account)
        at = datetime.now(UTC)
        target = await resolve_base_intent(
            session,
            catalog_key=payload.catalog_key,
            credential_mode=subscription.credential_mode,
            country_code=purchase_country(account),
            billing_identity=identity,
            at=at,
        )
        change = await resolve_plan_change(
            session,
            account=account,
            subscription=subscription,
            target=target,
            identity=identity,
            at=at,
        )
        if change.upgrade is None:
            response.status_code = status.HTTP_200_OK
            return await _downgrade(session, subscription, change)
        result = await execute_intent(
            session,
            account=account,
            operation=OPERATION_PLAN_CHANGE,
            intent=change.upgrade,
            idempotency_key=idempotency_key,
            provider_call=one_time_provider_call(
                get_billing_provider(), change.upgrade
            ),
            status_code=status.HTTP_202_ACCEPTED,
        )
        return _upgrade_response(
            result.response, change.catalog_key, change.effective_at
        )


__all__ = ["router"]
