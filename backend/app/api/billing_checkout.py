"""Standard Checkout routes under the active workspace's billing account."""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import WorkspaceContext, get_db, require_active_workspace_billing
from app.core.http_errors import raise_api_error, raise_not_found
from app.domain.billing.checkout import (
    CheckoutResponse,
    CheckoutUnavailableError,
    CheckoutVerifyRequest,
    activation_response,
    checkout_response,
    verify_checkout,
    workspace_activation,
)
from app.domain.billing.schemas import ActivationResponse

router = APIRouter()
BillingWorkspace = Annotated[
    WorkspaceContext, Depends(require_active_workspace_billing)
]
Session = Annotated[AsyncSession, Depends(get_db)]


@router.get(
    "/billing/subscriptions/{activation_id}/checkout", response_model=CheckoutResponse
)
async def get_checkout(
    activation_id: uuid.UUID, ctx: BillingWorkspace, session: Session
) -> CheckoutResponse:
    pending = await workspace_activation(
        session, activation_id=activation_id, workspace_id=ctx.workspace_id
    )
    if pending is None:
        raise_not_found("Activation")
    try:
        return checkout_response(pending)
    except ValueError as exc:
        raise_api_error(409, "Checkout is unavailable for this activation.", cause=exc)


@router.get("/billing/activations/{activation_id}", response_model=ActivationResponse)
async def get_activation(
    activation_id: uuid.UUID, ctx: BillingWorkspace, session: Session
) -> ActivationResponse:
    pending = await workspace_activation(
        session, activation_id=activation_id, workspace_id=ctx.workspace_id
    )
    if pending is None:
        raise_not_found("Activation")
    try:
        return activation_response(pending)
    except CheckoutUnavailableError as exc:
        raise_api_error(409, "The activation quote is unavailable.", cause=exc)


@router.post(
    "/billing/subscriptions/{activation_id}/verify",
    response_model=ActivationResponse,
    status_code=202,
)
async def post_verify(
    activation_id: uuid.UUID,
    payload: CheckoutVerifyRequest,
    ctx: BillingWorkspace,
    session: Session,
) -> ActivationResponse:
    pending = await workspace_activation(
        session, activation_id=activation_id, workspace_id=ctx.workspace_id, lock=True
    )
    if pending is None:
        raise_not_found("Activation")
    try:
        return await verify_checkout(session, pending, payload)
    except ValueError as exc:
        raise_api_error(
            400, "Payment verification rejected; no access was granted.", cause=exc
        )
