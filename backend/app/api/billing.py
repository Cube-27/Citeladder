"""Billing catalog, account actions, entitlements, and Razorpay webhook API."""

from __future__ import annotations

from typing import Annotated

from fastapi import (
    APIRouter,
    Depends,
    Header,
    HTTPException,
    Query,
    Request,
    Response,
    status,
)
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import (
    WorkspaceContext,
    get_current_user,
    get_db,
    require_workspace_member,
)
from app.connectors.billing.base import BillingProviderError
from app.connectors.billing.factory import get_billing_provider
from app.core.config.billing import billing_settings
from app.domain.billing.schemas import (
    BillingCatalogResponse,
    BillingProfileUpdate,
    BillingSummaryResponse,
    CancelResponse,
    CheckoutRequest,
    CheckoutResponse,
    ManageResponse,
    WorkspaceEntitlementResponse,
)
from app.domain.billing.service import (
    BillingConflictError,
    BillingUnavailableError,
    billing_summary,
    cancel_current_subscription,
    catalog,
    create_checkout,
    update_country,
)
from app.domain.billing.webhooks import (
    InvalidWebhookError,
    process_razorpay_webhook,
    verify_razorpay_signature,
)
from app.domain.entitlements.service import resolve_workspace_entitlement
from app.models.user import User

router = APIRouter(tags=["billing"])


@router.get("/billing/catalog", response_model=BillingCatalogResponse)
async def get_catalog(
    country: Annotated[str | None, Query(min_length=2, max_length=2)] = None,
) -> BillingCatalogResponse:
    if country is not None and not country.isalpha():
        raise HTTPException(status_code=422, detail="Invalid country")
    return catalog(country)


@router.get("/billing/me", response_model=BillingSummaryResponse)
async def get_billing_summary(
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> BillingSummaryResponse:
    return await billing_summary(session, user)


@router.patch("/billing/profile", response_model=BillingSummaryResponse)
async def patch_billing_profile(
    payload: BillingProfileUpdate,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> BillingSummaryResponse:
    try:
        return await update_country(session, user, payload.country_code)
    except BillingConflictError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.post("/billing/checkout", response_model=CheckoutResponse)
async def post_checkout(
    _payload: CheckoutRequest,
    idempotency_key: Annotated[
        str, Header(alias="Idempotency-Key", min_length=16, max_length=255)
    ],
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> CheckoutResponse:
    try:
        return await create_checkout(
            session,
            user,
            idempotency_key=idempotency_key,
            provider=get_billing_provider(),
        )
    except BillingConflictError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except BillingUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except BillingProviderError as exc:
        raise HTTPException(status_code=502, detail=exc.code) from exc


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


@router.post("/billing/manage", response_model=ManageResponse)
async def post_manage(
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> ManageResponse:
    summary = await billing_summary(session, user)
    return ManageResponse(
        can_cancel=summary.subscription_status is not None,
        message=(
            "Razorpay does not provide a Stripe-style customer portal. "
            "Use Searchify's end-of-period cancellation action."
        ),
    )


@router.get(
    "/workspaces/{workspace_id}/entitlements",
    response_model=WorkspaceEntitlementResponse,
)
async def get_workspace_entitlements(
    ctx: Annotated[WorkspaceContext, Depends(require_workspace_member)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> WorkspaceEntitlementResponse:
    return await resolve_workspace_entitlement(session, ctx.workspace_id)


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
