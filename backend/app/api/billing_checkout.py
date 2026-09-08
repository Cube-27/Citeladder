"""Standard Checkout routes under the existing billing owner."""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db
from app.core.http_errors import raise_api_error, raise_not_found
from app.domain.billing.checkout import (
    CheckoutResponse,
    CheckoutUnavailableError,
    CheckoutVerifyRequest,
    activation_response,
    checkout_response,
    owned_activation,
    verify_checkout,
)
from app.domain.billing.schemas import ActivationResponse
from app.models.user import User

router = APIRouter()
CurrentUser = Annotated[User, Depends(get_current_user)]
Session = Annotated[AsyncSession, Depends(get_db)]


@router.get(
    "/billing/subscriptions/{activation_id}/checkout", response_model=CheckoutResponse
)
async def get_checkout(
    activation_id: uuid.UUID, user: CurrentUser, session: Session
) -> CheckoutResponse:
    pending = await owned_activation(
        session, activation_id=activation_id, user_id=user.id
    )
    if pending is None:
        raise_not_found("Activation")
    try:
        return checkout_response(pending)
    except ValueError as exc:
        raise_api_error(409, "Checkout is unavailable for this activation.", cause=exc)


@router.get("/billing/activations/{activation_id}", response_model=ActivationResponse)
async def get_activation(
    activation_id: uuid.UUID, user: CurrentUser, session: Session
) -> ActivationResponse:
    pending = await owned_activation(
        session, activation_id=activation_id, user_id=user.id
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
    user: CurrentUser,
    session: Session,
) -> ActivationResponse:
    pending = await owned_activation(
        session, activation_id=activation_id, user_id=user.id, lock=True
    )
    if pending is None:
        raise_not_found("Activation")
    try:
        return await verify_checkout(session, pending, payload)
    except ValueError as exc:
        raise_api_error(
            400, "Payment verification rejected; no access was granted.", cause=exc
        )
