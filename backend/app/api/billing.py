"""Billing subscription actions and the Razorpay webhook API.

The v6 catalog/quote/checkout/workspace-entitlement routes are deleted; the
v8 commercial surface (catalog, subscriptions, entitlement, usage, add-ons,
top-ups) is rebuilt on the entitlement resolver in the commercial-surface
commit.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import (
    APIRouter,
    Depends,
    Header,
    HTTPException,
    Request,
    Response,
    status,
)
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db
from app.connectors.billing.base import BillingProviderError
from app.connectors.billing.factory import get_billing_provider
from app.core.config.billing import billing_settings
from app.domain.billing.schemas import CancelResponse
from app.domain.billing.service import (
    BillingConflictError,
    cancel_current_subscription,
)
from app.domain.billing.webhooks import (
    InvalidWebhookError,
    process_razorpay_webhook,
    verify_razorpay_signature,
)
from app.models.user import User

router = APIRouter(tags=["billing"])


@router.post("/billing/cancel", response_model=CancelResponse)
async def post_cancel(
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> CancelResponse:
    try:
        subscription_status, at_period_end = await cancel_current_subscription(
            session, user, get_billing_provider()
        )
    except BillingConflictError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except BillingProviderError as exc:
        raise HTTPException(status_code=502, detail=exc.code) from exc
    return CancelResponse(
        status=subscription_status, cancel_at_period_end=at_period_end
    )


@router.post("/billing/webhooks/razorpay", status_code=status.HTTP_204_NO_CONTENT)
async def razorpay_webhook(
    request: Request,
    session: Annotated[AsyncSession, Depends(get_db)],
    signature: Annotated[str, Header(alias="X-Razorpay-Signature")],
    event_id: Annotated[str, Header(alias="X-Razorpay-Event-Id")],
) -> Response:
    body = bytearray()
    async for chunk in request.stream():
        if len(body) + len(chunk) > billing_settings.max_webhook_body_bytes:
            raise HTTPException(status_code=413, detail="Webhook body too large")
        body.extend(chunk)
    raw_body = bytes(body)
    if not verify_razorpay_signature(raw_body, signature):
        raise HTTPException(status_code=400, detail="Invalid webhook signature")
    try:
        await process_razorpay_webhook(session, raw_body=raw_body, event_id=event_id)
    except InvalidWebhookError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return Response(status_code=status.HTTP_204_NO_CONTENT)
