"""The v8 commercial billing surface.

Routes, in the frozen order of the work order:

1. ``GET  /billing/catalog``        public preview catalog (no auth);
2. ``GET  /billing/entitlement``    authenticated account read;
3. ``GET  /billing/usage``          authenticated account read;
4. ``GET  /billing/invoices``       persisted paid-receipt history;
5. ``GET  /billing/invoices/{id}/pdf`` authorized receipt download;
6. ``POST /billing/subscriptions``  the ONE base purchase route (202 pending);
7. ``DELETE /billing/subscription`` schedule base cancellation;
8. ``POST /billing/addons``         add-on activation;
9. ``POST /billing/topups``         top-up purchase;
10. ``DELETE /billing/addons/{key}`` schedule add-on cancellation;
11. ``POST /billing/webhooks/{provider}`` signed ingress, 204 with no body
    (``/billing/webhooks/razorpay`` is that path for Razorpay).

The v6 ``/billing/me``, ``/billing/profile``, ``/billing/checkout``,
``/billing/cancel``, and ``/billing/manage`` routes are DELETED without
aliases. ``GET /workspaces/{id}/entitlements`` is the member-safe effective
capability projection; private account billing remains on the owner routes.

Invariant 5: every mutation and every private account read authorizes through
the ACTIVE WORKSPACE and the ``manage_billing`` capability
(``require_active_workspace_billing``), then resolves the workspace's single
account via ``workspace_account``. ``BillingAccount.owner_user_id`` is audit
metadata and authorizes nothing. Member and Viewer are refused these routes
outright; the member-safe effective projection is
``GET /workspaces/{id}/entitlements``. The public catalog is the single
deliberate exception because it reads no account, workspace, connection, or
probe. Invariant 6: no route accepts or returns an
amount, a currency, a region, a provider reference, or an external provider id
— the browser submits catalog/customer billing facts but never a commercial
amount or provider reference, and the SERVER-resolved quote drives every
provider argument.
"""

from __future__ import annotations

import uuid
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import UTC, datetime
from typing import Annotated

from fastapi import (
    APIRouter,
    Depends,
    Header,
    Query,
    Request,
    Response,
    status,
)
from fastapi import Path as PathParam
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.billing_checkout import router as checkout_router
from app.api.billing_guards import (
    addon_provider_call,
    base_provider_call,
    purchase_country,
    purchase_identity,
    reject_existing_addon,
    reject_existing_base,
    require_live_base,
    topup_provider_call,
)
from app.api.billing_invoices import router as invoices_router
from app.api.deps import (
    WorkspaceContext,
    get_db,
    require_active_workspace_billing,
    require_workspace_member,
)
from app.connectors.billing.base import (
    BillingProviderError,
)
from app.connectors.billing.factory import get_billing_provider
from app.connectors.billing.registry import ProviderUnavailableError
from app.core.config.billing_contracts import (
    ACTIVATION_PENDING,
    CREDENTIAL_MODE_BYOK,
    OPERATION_ADDON_ACTIVATE,
    OPERATION_SUBSCRIPTION_CREATE,
    OPERATION_TOPUP_PURCHASE,
    REASON_CHECKOUT_UNAVAILABLE,
)
from app.core.config.billing_settings import (
    billing_settings,
)
from app.core.config.billing_tax import BillingIdentity, TaxPolicyError
from app.core.http_errors import raise_api_error
from app.domain.billing.accounts import billing_account_id_for
from app.domain.billing.catalog import public_catalog
from app.domain.billing.catalog_revisions import CatalogUnavailableError
from app.domain.billing.commercial_journeys import (
    IntroductoryAccessError,
    claim_introductory_access,
    end_introductory_access,
    offer_state,
)
from app.domain.billing.idempotency import (
    IdempotencyConflictError,
    ProviderCall,
    TrialUnavailableError,
    execute_intent,
    reject_deferred_trial,
    replay_intent,
    validate_idempotency_key,
)
from app.domain.billing.reads import (
    account_entitlement,
    account_usage,
    workspace_occupancy_hints,
)
from app.domain.billing.schemas import (
    ActivationResponse,
    AddonActivateRequest,
    BillingCatalogResponse,
    BillingEntitlementResponse,
    BillingUsageResponse,
    CardTrialUnavailableResponse,
    IntroductoryEndResponse,
    NoCardClaimRequest,
    NoCardClaimResponse,
    NoCardOfferResponse,
    SubscriptionChangeResponse,
    SubscriptionCreateRequest,
    TopupPurchaseRequest,
    WorkspaceCapabilityResponse,
    WorkspaceEntitlementResponse,
)
from app.domain.billing.service import (
    BillingConflictError,
    ResolvedIntent,
    persist_billing_profile,
    resolve_addon_intent,
    resolve_base_intent,
    resolve_topup_intent,
    schedule_addon_cancellation,
    schedule_base_cancellation,
    workspace_account,
)
from app.domain.billing.webhooks import (
    InvalidWebhookError,
    authenticate_webhook,
    process_webhook_envelope,
)
from app.domain.entitlements.service import resolve_workspace_entitlement
from app.domain.entitlements.types import STATUS_RESOLVED
from app.models.billing import BillingAccount

router = APIRouter(tags=["billing"])
router.include_router(checkout_router)
router.include_router(invoices_router)


def _idempotency_key(
    idempotency_key: Annotated[str | None, Header(alias="Idempotency-Key")] = None,
) -> str:
    """Require a well-formed ``Idempotency-Key`` on every commercial mutation.

    A missing or malformed key REJECTS with 400: without it a browser retry
    could double-charge.
    """
    try:
        return validate_idempotency_key(idempotency_key)
    except ValueError as exc:
        raise_api_error(400, str(exc), cause=exc)


IdempotencyKey = Annotated[str, Depends(_idempotency_key)]
Session = Annotated[AsyncSession, Depends(get_db)]
#: Every private billing route. Resolves the ACTIVE workspace and refuses any
#: role without ``manage_billing`` before the handler body runs.
BillingWorkspace = Annotated[
    WorkspaceContext, Depends(require_active_workspace_billing)
]


async def _account(session: AsyncSession, ctx: WorkspaceContext) -> BillingAccount:
    """The active workspace's single billing account."""
    return await workspace_account(
        session, workspace_id=ctx.workspace_id, user=ctx.user
    )


@contextmanager
def _safe_commercial_errors() -> Iterator[None]:
    """Map domain refusals onto safe HTTP statuses (never a provider message)."""
    try:
        yield
    except ProviderUnavailableError as exc:
        # No provider is configured, or not in this record's environment. That
        # is a commercial refusal the caller can act on, not a server fault —
        # and it is decided before any provider I/O.
        raise_api_error(409, REASON_CHECKOUT_UNAVAILABLE, cause=exc)
    except (
        TrialUnavailableError,
        IdempotencyConflictError,
        BillingConflictError,
        IntroductoryAccessError,
        TaxPolicyError,
    ) as exc:
        raise_api_error(409, str(exc), cause=exc)
    except BillingProviderError as exc:
        raise_api_error(502, exc.code, cause=exc)
    except CatalogUnavailableError as exc:
        raise_api_error(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Commercial catalog unavailable",
            code=str(exc),
            cause=exc,
        )


def _activation_status_code(activation: ActivationResponse) -> int:
    """202 while an external hosted checkout is still pending, else 200."""
    if activation.status == ACTIVATION_PENDING:
        return status.HTTP_202_ACCEPTED
    return status.HTTP_200_OK


async def _replayed_activation(
    session: AsyncSession,
    *,
    account: BillingAccount,
    operation: str,
    catalog_key: str,
    quantity: int,
    credential_mode: str,
    idempotency_key: str,
    response: Response,
    billing_context: dict[str, object],
) -> ActivationResponse | None:
    """Step 4 BEFORE step 5: the stored response for an already-seen key.

    Every commercial POST runs this first so a retry of an already-settled
    purchase replays byte-equivalently instead of tripping the route's own
    "already live" state guard; a reused key with a DIFFERENT canonical
    request raises the 409 inside ``replay_intent``. Returning None means the
    key is fresh and the route proceeds to its state check.
    """
    replayed = await replay_intent(
        session,
        account=account,
        operation=operation,
        catalog_key=catalog_key,
        quantity=quantity,
        credential_mode=credential_mode,
        idempotency_key=idempotency_key,
        billing_context=billing_context,
    )
    if replayed is None:
        return None
    response.status_code = _activation_status_code(replayed.response)
    return replayed.response


async def _run_intent(
    session: AsyncSession,
    *,
    account: BillingAccount,
    operation: str,
    intent: ResolvedIntent,
    idempotency_key: str,
    provider_call: ProviderCall,
    response: Response,
) -> ActivationResponse:
    """Commit the intent, call the provider, and project the safe response."""
    result = await execute_intent(
        session,
        account=account,
        operation=operation,
        intent=intent,
        idempotency_key=idempotency_key,
        provider_call=provider_call,
        status_code=status.HTTP_202_ACCEPTED,
    )
    response.status_code = _activation_status_code(result.response)
    return result.response


@router.get("/billing/catalog", response_model=BillingCatalogResponse)
async def get_catalog(
    session: Session,
    country: Annotated[str | None, Query(max_length=2)] = None,
) -> BillingCatalogResponse:
    """The PUBLIC commercial catalog (invariant 5 exception by design).

    It reads no workspace data, no provider connection, and no probe, so it
    needs no ``require_workspace_member`` boundary — everything workspace- or
    account-scoped stays authenticated. ``country`` is a PREVIEW hint only:
    when it is omitted the response reports a null country and the
    config-owned international preview region, and a purchase must still submit
    its own ISO country.
    """
    with _safe_commercial_errors():
        return await public_catalog(session, country)


@router.get(
    "/workspaces/{workspace_id}/entitlements",
    response_model=WorkspaceEntitlementResponse,
)
async def get_workspace_entitlements(
    workspace_id: Annotated[uuid.UUID, PathParam()],
    ctx: Annotated[WorkspaceContext, Depends(require_workspace_member)],
    session: Session,
) -> WorkspaceEntitlementResponse:
    """Member-safe effective capability boundary with safe provenance only."""
    if ctx.workspace_id != workspace_id:
        raise_api_error(403, "Workspace access denied")
    entitlement = await resolve_workspace_entitlement(
        session, workspace_id=ctx.workspace_id, at=datetime.now(UTC)
    )
    account_id = await billing_account_id_for(session, ctx.workspace_id)
    occupancy = (
        await workspace_occupancy_hints(
            session, account_id=account_id, entitlement=entitlement
        )
        if account_id is not None
        else []
    )
    return WorkspaceEntitlementResponse(
        workspace_id=ctx.workspace_id,
        status=entitlement.status,
        registry_revision=entitlement.registry_revision,
        entitlement_lifecycle_version=entitlement.entitlement_lifecycle_version,
        valid_until=entitlement.valid_until,
        occupancy=occupancy,
        capabilities=[
            WorkspaceCapabilityResponse(
                key=capability.key,
                type=capability.capability_type.value,
                value=capability.value,
                valid_until=capability.next_change_at,
                provenance="effective_grant",
            )
            for capability in entitlement.capabilities
        ]
        if entitlement.status == STATUS_RESOLVED
        else [],
    )


@router.get("/billing/entitlement", response_model=BillingEntitlementResponse)
async def get_entitlement(
    ctx: BillingWorkspace,
    session: Session,
) -> BillingEntitlementResponse:
    """The authenticated account entitlement read; commits nothing."""
    account = await _account(session, ctx)
    return await account_entitlement(session, account=account, at=datetime.now(UTC))


@router.get("/billing/usage", response_model=BillingUsageResponse)
async def get_usage(ctx: BillingWorkspace, session: Session) -> BillingUsageResponse:
    """The authenticated account usage read; commits nothing.

    Balances come from the immutable consumable ledger and every expiry is the
    MOVING effective expiry, not a grant's stored fixed date.
    """
    account = await _account(session, ctx)
    return await account_usage(session, account=account, at=datetime.now(UTC))


@router.get("/billing/early-access", response_model=NoCardOfferResponse)
async def get_early_access(
    ctx: BillingWorkspace, session: Session
) -> NoCardOfferResponse:
    account = await _account(session, ctx)
    state = await offer_state(
        session, account=account, user=ctx.user, now=datetime.now(UTC)
    )
    return NoCardOfferResponse(
        campaign_id=state.campaign_id,
        status=state.status,
        tier_key=state.tier_key,
        duration_days=state.duration_days,
        eligibility_policy=state.eligibility_policy,
        operator_code_allowed=state.operator_code_allowed,
        unavailable_reason=state.unavailable_reason,
    )


@router.post("/billing/early-access/claim", response_model=NoCardClaimResponse)
async def post_early_access_claim(
    payload: NoCardClaimRequest,
    ctx: BillingWorkspace,
    session: Session,
    idempotency_key: IdempotencyKey,
) -> NoCardClaimResponse:
    with _safe_commercial_errors():
        account = await _account(session, ctx)
        result = await claim_introductory_access(
            session,
            account=account,
            user=ctx.user,
            campaign_id=payload.campaign_id,
            idempotency_key=idempotency_key,
            terms_consent=payload.terms_consent,
            data_sharing_consent=payload.data_sharing_consent,
            operator_code=payload.operator_code,
        )
        return NoCardClaimResponse(
            campaign_id=result.campaign_id,
            grant_id=result.grant_id,
            starts_at=result.starts_at,
            expires_at=result.expires_at,
        )


@router.delete("/billing/early-access", response_model=IntroductoryEndResponse)
async def delete_early_access(
    ctx: BillingWorkspace, session: Session, idempotency_key: IdempotencyKey
) -> IntroductoryEndResponse:
    with _safe_commercial_errors():
        account = await _account(session, ctx)
        ended_at = await end_introductory_access(
            session,
            account=account,
            user=ctx.user,
            idempotency_key=idempotency_key,
        )
        return IntroductoryEndResponse(ended_at=ended_at)


@router.get("/billing/card-trial/quote", response_model=CardTrialUnavailableResponse)
async def get_card_trial_quote(ctx: BillingWorkspace) -> CardTrialUnavailableResponse:
    del ctx
    return CardTrialUnavailableResponse()


@router.post(
    "/billing/subscriptions",
    response_model=ActivationResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def post_subscription(
    payload: SubscriptionCreateRequest,
    ctx: BillingWorkspace,
    session: Session,
    idempotency_key: IdempotencyKey,
    response: Response,
) -> ActivationResponse:
    """The ONE base-purchase route.

    ``trial_requested=true`` refuses with ``409 trial_unavailable`` BEFORE any
    quote, pending row, provider call, or grant write. The submitted ISO
    country is re-resolved and LOCKED on the account here: with
    ``/billing/profile`` deleted this is the single writer of the persisted
    billing country.
    """
    with _safe_commercial_errors():
        reject_deferred_trial(payload.trial_requested)
        account = await _account(session, ctx)
        identity = BillingIdentity(
            name=payload.billing_name,
            address_line1=payload.billing_address_line1,
            city=payload.billing_city,
            state_code=payload.billing_state_code,
            postal_code=payload.billing_postal_code,
            customer_gstin=payload.customer_gstin,
            export_eligibility_attested=payload.export_eligibility_attested,
        )
        replayed = await _replayed_activation(
            session,
            account=account,
            operation=OPERATION_SUBSCRIPTION_CREATE,
            catalog_key=payload.catalog_key,
            quantity=1,
            credential_mode=payload.credential_mode,
            idempotency_key=idempotency_key,
            response=response,
            billing_context={
                "country_code": payload.country_code,
                "customer": identity.snapshot(),
            },
        )
        if replayed is not None:
            return replayed
        await reject_existing_base(session, account)
        intent = await resolve_base_intent(
            session,
            catalog_key=payload.catalog_key,
            credential_mode=payload.credential_mode,
            country_code=payload.country_code,
            billing_identity=identity,
            at=datetime.now(UTC),
        )
        persist_billing_profile(account, payload.country_code, identity)
        # Only now, past authorization, validation, the idempotent replay and
        # the one-base state guard, does a NEW checkout need a provider.
        provider = get_billing_provider()
        return await _run_intent(
            session,
            account=account,
            operation=OPERATION_SUBSCRIPTION_CREATE,
            intent=intent,
            idempotency_key=idempotency_key,
            provider_call=base_provider_call(provider, intent),
            response=response,
        )


@router.post(
    "/billing/addons",
    response_model=ActivationResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def post_addon(
    payload: AddonActivateRequest,
    ctx: BillingWorkspace,
    session: Session,
    idempotency_key: IdempotencyKey,
    response: Response,
) -> ActivationResponse:
    """Activate one add-on. A coming-soon add-on refuses with
    ``provider_unavailable`` before any provider I/O or grant issuance.
    """
    with _safe_commercial_errors():
        account = await _account(session, ctx)
        identity = purchase_identity(account)
        replayed = await _replayed_activation(
            session,
            account=account,
            operation=OPERATION_ADDON_ACTIVATE,
            catalog_key=payload.catalog_key,
            quantity=payload.quantity,
            credential_mode=CREDENTIAL_MODE_BYOK,
            idempotency_key=idempotency_key,
            response=response,
            billing_context={
                "country_code": purchase_country(account),
                "customer": identity.snapshot(),
            },
        )
        if replayed is not None:
            return replayed
        await reject_existing_addon(session, account, payload.catalog_key)
        provider = get_billing_provider()
        intent = await resolve_addon_intent(
            session,
            catalog_key=payload.catalog_key,
            quantity=payload.quantity,
            country_code=purchase_country(account),
            billing_identity=identity,
            at=datetime.now(UTC),
        )
        return await _run_intent(
            session,
            account=account,
            operation=OPERATION_ADDON_ACTIVATE,
            intent=intent,
            idempotency_key=idempotency_key,
            provider_call=addon_provider_call(provider, intent),
            response=response,
        )


@router.post(
    "/billing/topups",
    response_model=ActivationResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def post_topup(
    payload: TopupPurchaseRequest,
    ctx: BillingWorkspace,
    session: Session,
    idempotency_key: IdempotencyKey,
    response: Response,
) -> ActivationResponse:
    """Purchase one top-up pack.

    A top-up funds nothing without a readable live base subscription, so the
    purchase is refused here — before any provider I/O.
    """
    with _safe_commercial_errors():
        account = await _account(session, ctx)
        identity = purchase_identity(account)
        replayed = await _replayed_activation(
            session,
            account=account,
            operation=OPERATION_TOPUP_PURCHASE,
            catalog_key=payload.catalog_key,
            quantity=payload.quantity,
            credential_mode=CREDENTIAL_MODE_BYOK,
            idempotency_key=idempotency_key,
            response=response,
            billing_context={
                "country_code": purchase_country(account),
                "customer": identity.snapshot(),
            },
        )
        if replayed is not None:
            return replayed
        await require_live_base(session, account)
        provider = get_billing_provider()
        intent = await resolve_topup_intent(
            session,
            catalog_key=payload.catalog_key,
            quantity=payload.quantity,
            country_code=purchase_country(account),
            billing_identity=identity,
            at=datetime.now(UTC),
        )
        return await _run_intent(
            session,
            account=account,
            operation=OPERATION_TOPUP_PURCHASE,
            intent=intent,
            idempotency_key=idempotency_key,
            provider_call=topup_provider_call(provider, intent),
            response=response,
        )


@router.delete("/billing/subscription", response_model=SubscriptionChangeResponse)
async def delete_subscription(
    ctx: BillingWorkspace,
    session: Session,
    idempotency_key: IdempotencyKey,
) -> SubscriptionChangeResponse:
    """Schedule the current base subscription's PERIOD-END cancellation.

    Deliberately NOT an ``ActivationResponse``: it carries no
    pending/activated/failed/abandoned vocabulary. Current grant rows are never
    touched — the issued period ends naturally and no next bundle is issued.
    The operation is naturally idempotent (a second call reports
    ``already_scheduled``), and the mandatory key keeps the contract uniform
    across every commercial mutation.
    """
    del idempotency_key
    with _safe_commercial_errors():
        # No provider is resolved here: cancellation binds to the adapter that
        # CREATED the subscription, which the domain reads off the row.
        account = await _account(session, ctx)
        catalog_key, change_status, effective_at = await schedule_base_cancellation(
            session, account_id=account.id
        )
        return SubscriptionChangeResponse(
            catalog_key=catalog_key, status=change_status, effective_at=effective_at
        )


@router.delete("/billing/addons/{key}", response_model=SubscriptionChangeResponse)
async def delete_addon(
    ctx: BillingWorkspace,
    session: Session,
    idempotency_key: IdempotencyKey,
    key: Annotated[str, PathParam(max_length=64)],
) -> SubscriptionChangeResponse:
    """Schedule one add-on's PERIOD-END cancellation (grants untouched)."""
    del idempotency_key
    with _safe_commercial_errors():
        account = await _account(session, ctx)
        change_status, effective_at = await schedule_addon_cancellation(
            session, account_id=account.id, catalog_key=key
        )
        return SubscriptionChangeResponse(
            catalog_key=key, status=change_status, effective_at=effective_at
        )


@router.post("/billing/webhooks/{provider}", status_code=status.HTTP_204_NO_CONTENT)
async def provider_webhook(
    provider: Annotated[str, PathParam(max_length=24)],
    request: Request,
    session: Session,
) -> Response:
    """Signed webhook ingress for ONE provider: 204 with NO response body.

    ``/billing/webhooks/razorpay`` is the concrete existing path and keeps
    working unchanged; the path parameter is common dispatch, not a rename. The
    signature headers stay each vendor's real header names — the adapter
    declares them and reads them itself, so nothing here invents a shared
    signature protocol.

    Order is unchanged and security-critical: the body-size guard runs first,
    then the adapter authenticates the EXACT raw bytes with its own configured
    credentials, and only then is anything parsed or recorded. An unknown
    provider, an unconfigured one, an unsigned body, and an oversized body all
    refuse before the activation transaction and grant nothing.
    """
    body = bytearray()
    async for chunk in request.stream():
        if len(body) + len(chunk) > billing_settings.max_webhook_body_bytes:
            raise_api_error(413, "Webhook body too large")
        body.extend(chunk)
    raw_body = bytes(body)
    try:
        envelope = authenticate_webhook(
            provider, raw_body=raw_body, headers=request.headers
        )
        await process_webhook_envelope(session, envelope, raw_body=raw_body)
    except InvalidWebhookError as exc:
        raise_api_error(400, str(exc), cause=exc)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
