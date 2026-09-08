"""Owner-authorized persisted checkout and authenticated reconciliation requests."""

from __future__ import annotations

import hashlib
import hmac
import uuid
from datetime import UTC, datetime

from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config.billing_settings import billing_settings
from app.domain.billing.schemas import ActivationResponse, ResolvedQuoteResponse
from app.models.billing import BillingAccount, PendingActivation


class CheckoutUnavailableError(ValueError):
    pass


class CheckoutResponse(BaseModel):
    activation_id: uuid.UUID
    provider_mode: str
    key_id: str
    subscription_id: str
    expires_at: datetime
    quote: ResolvedQuoteResponse


class CheckoutVerifyRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", hide_input_in_errors=True)
    razorpay_payment_id: str = Field(pattern=r"^pay_[a-zA-Z0-9]+$", max_length=255)
    razorpay_subscription_id: str = Field(pattern=r"^sub_[a-zA-Z0-9]+$", max_length=255)
    razorpay_signature: str = Field(pattern=r"^[a-fA-F0-9]{64}$", repr=False)


async def owned_activation(
    session: AsyncSession,
    *,
    activation_id: uuid.UUID,
    user_id: uuid.UUID,
    lock: bool = False,
) -> PendingActivation | None:
    query = (
        select(PendingActivation)
        .join(BillingAccount)
        .where(
            PendingActivation.id == activation_id,
            BillingAccount.owner_user_id == user_id,
            PendingActivation.activation_kind == "base",
        )
    )
    if lock:
        query = query.with_for_update(of=PendingActivation)
    return await session.scalar(query)


def _activation_quote(pending: PendingActivation) -> ResolvedQuoteResponse:
    if not pending.quote:
        raise CheckoutUnavailableError("The activation quote is unavailable.")
    return ResolvedQuoteResponse.model_validate(pending.quote)


def activation_response(pending: PendingActivation) -> ActivationResponse:
    return ActivationResponse(
        activation_id=pending.id,
        kind=pending.activation_kind,
        catalog_key=pending.catalog_key,
        quantity=pending.quantity,
        status=pending.status,
        quote=_activation_quote(pending),
        checkout_url=None,
        expires_at=pending.expires_at,
        failure_code=pending.failure_code,
    )


def checkout_response(pending: PendingActivation) -> CheckoutResponse:
    mode = billing_settings.require_provider_mode()
    if (
        not billing_settings.checkout_enabled
        or pending.provider_mode != mode
        or pending.status != "pending"
        or pending.expires_at <= datetime.now(UTC)
        or not pending.external_reference
    ):
        raise CheckoutUnavailableError("Checkout is unavailable for this activation.")
    return CheckoutResponse(
        activation_id=pending.id,
        provider_mode=mode,
        key_id=billing_settings.razorpay_key_id,
        subscription_id=pending.external_reference,
        expires_at=pending.expires_at,
        quote=_activation_quote(pending),
    )


async def verify_checkout(
    session: AsyncSession, pending: PendingActivation, callback: CheckoutVerifyRequest
) -> ActivationResponse:
    mode = billing_settings.require_provider_mode()
    if (
        pending.provider_mode != mode
        or callback.razorpay_subscription_id != pending.external_reference
    ):
        raise CheckoutUnavailableError(
            "Payment callback does not match this activation."
        )
    message = f"{callback.razorpay_payment_id}|{pending.external_reference}".encode()
    expected = hmac.new(
        billing_settings.razorpay_key_secret.get_secret_value().encode(),
        message,
        hashlib.sha256,
    ).hexdigest()
    if not hmac.compare_digest(expected, callback.razorpay_signature.lower()):
        raise CheckoutUnavailableError("Invalid payment signature.")
    if pending.status == "activated":
        return activation_response(pending)
    if pending.status != "pending" or pending.expires_at <= datetime.now(UTC):
        raise CheckoutUnavailableError("This checkout has expired.")
    # The callback authenticates only; bounded reconciliation verifies captured funds.
    pending.reconciliation_next_at = datetime.now(UTC)
    await session.commit()
    return activation_response(pending)
