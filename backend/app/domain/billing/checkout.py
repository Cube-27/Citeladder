"""The SHARED checkout controller: pending, initialization, callback, activation.

Provider-neutral by construction (plan section 3.4). Nothing here inspects a
vendor field name, an HMAC scheme, or an SDK URL: the adapter bound to the
activation's PERSISTED provider/environment produces the public
initialization data and authenticates the callback, and this module owns only
the states every provider shares - is the intent still pending, has it
expired, has it already activated, and when should reconciliation look again.

A passing callback still grants nothing. Captured/settled evidence, verified
by the shared activation transaction, is what grants paid access.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.connectors.billing.base import CheckoutCallbackError, CheckoutInitialization
from app.connectors.billing.registry import (
    ProviderUnavailableError,
    checkout_adapter,
)
from app.core.config.billing_settings import billing_settings
from app.domain.billing.schemas import ActivationResponse, ResolvedQuoteResponse
from app.models.billing import BillingAccount, PendingActivation


class CheckoutUnavailableError(ValueError):
    pass


class CheckoutResponse(BaseModel):
    """The small PUBLIC checkout-init contract.

    ``flow`` says whether the browser follows a validated ``redirect_url`` or
    loads the adapter-named SDK with ``public_key`` and ``reference``. Only
    public initialization fields appear: never a secret, an amount, or a
    private price reference.
    """

    activation_id: uuid.UUID
    provider: str
    provider_mode: str
    flow: str
    redirect_url: str = ""
    sdk_name: str = ""
    public_key: str = ""
    reference: str = ""
    expires_at: datetime
    quote: ResolvedQuoteResponse


class CheckoutVerifyRequest(BaseModel):
    """A neutral WRAPPER around one provider's typed callback fields.

    Bounded here (field count, key and value lengths) and then handed to the
    originating adapter, which allowlists the exact fields it accepts and
    validates their formats. Neutral does not mean unchecked.
    """

    model_config = ConfigDict(extra="forbid", hide_input_in_errors=True)
    fields: dict[str, str] = Field(default_factory=dict, max_length=8)

    @field_validator("fields")
    @classmethod
    def bounded_fields(cls, value: dict[str, str]) -> dict[str, str]:
        for key, item in value.items():
            if not key or len(key) > 64 or not key.replace("_", "").isalnum():
                raise ValueError("callback field name is not permitted")
            if len(item) > 512:
                raise ValueError("callback field value is too long")
        return value


async def workspace_activation(
    session: AsyncSession,
    *,
    activation_id: uuid.UUID,
    workspace_id: uuid.UUID,
    lock: bool = False,
) -> PendingActivation | None:
    """One base activation belonging to ``workspace_id``'s billing account.

    Authorization is the WORKSPACE the caller is administering, joined
    through ``BillingAccount.workspace_id`` — never the signed-in user's own
    account. A different workspace's activation is indistinguishable from a
    missing one.
    """
    query = (
        select(PendingActivation)
        .join(BillingAccount)
        .where(
            PendingActivation.id == activation_id,
            BillingAccount.workspace_id == workspace_id,
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


def _initialization(pending: PendingActivation) -> CheckoutInitialization:
    """Public init data from the activation's ORIGINATING adapter.

    Binding to the persisted provider/environment is what keeps a change of
    the new-checkout default from reinterpreting an existing intent.
    """
    try:
        adapter = checkout_adapter(pending.provider, pending.provider_mode)
    except ProviderUnavailableError as exc:
        raise CheckoutUnavailableError(
            "Checkout is unavailable for this activation."
        ) from exc
    return adapter.initialization(
        external_reference=pending.external_reference or "",
        provider_mode=pending.provider_mode,
    )


def checkout_response(pending: PendingActivation) -> CheckoutResponse:
    """Initialize the browser for one still-pending, still-admitted intent."""
    if (
        not billing_settings.checkout_enabled
        or pending.status != "pending"
        or pending.expires_at <= datetime.now(UTC)
        or not pending.external_reference
    ):
        raise CheckoutUnavailableError("Checkout is unavailable for this activation.")
    initialization = _initialization(pending)
    return CheckoutResponse(
        activation_id=pending.id,
        provider=initialization.provider,
        provider_mode=initialization.provider_mode,
        flow=initialization.flow,
        redirect_url=initialization.redirect_url,
        sdk_name=initialization.sdk_name,
        public_key=initialization.public_key,
        reference=initialization.reference,
        expires_at=pending.expires_at,
        quote=_activation_quote(pending),
    )


async def verify_checkout(
    session: AsyncSession, pending: PendingActivation, callback: CheckoutVerifyRequest
) -> ActivationResponse:
    """Authenticate a browser callback against this activation, then wait.

    Verification is delegated to the ORIGINATING adapter and bound to the
    persisted external reference, so a callback can neither be replayed
    against another provider's record nor accepted by whichever provider the
    new-checkout default happens to name today.
    """
    try:
        adapter = checkout_adapter(pending.provider, pending.provider_mode)
    except ProviderUnavailableError as exc:
        raise CheckoutUnavailableError(
            "Payment callback does not match this activation."
        ) from exc
    try:
        adapter.verify_callback(
            external_reference=pending.external_reference or "",
            fields=callback.fields,
        )
    except CheckoutCallbackError as exc:
        raise CheckoutUnavailableError(
            "Payment callback does not match this activation."
        ) from exc
    if pending.status == "activated":
        return activation_response(pending)
    if pending.status != "pending" or pending.expires_at <= datetime.now(UTC):
        raise CheckoutUnavailableError("This checkout has expired.")
    # The callback authenticates only; bounded reconciliation verifies captured funds.
    pending.reconciliation_next_at = datetime.now(UTC)
    await session.commit()
    return activation_response(pending)
