"""Provider-neutral billing DTOs, errors, and protocol.

The protocol is explicit and provider-neutral: every method names the
commercial operation it performs and takes only server-resolved arguments
(a PRIVATE ``price_ref`` from config, an opaque intent id, and an opaque
account ref). A browser value never reaches a provider call.

Provider DTOs carry the authoritative status, the amount/currency needed to
verify a payment, the provider update version, period bounds, and the
cancellation state. They deliberately carry NO payment-instrument
fingerprint in PR1 — that dependency is deferred with trial checkout.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, field
from typing import Protocol


class BillingProviderError(RuntimeError):
    """A provider call failed.

    ``retryable`` marks an UNCERTAIN outcome (transport/5xx): the caller must
    leave the intent pending for reconciliation rather than failing it.
    """

    def __init__(self, code: str, *, retryable: bool = False) -> None:
        super().__init__(code)
        self.code = code
        self.retryable = retryable


@dataclass(frozen=True, slots=True)
class HostedSubscription:
    """A created hosted subscription: the only safe fields we persist."""

    external_subscription_id: str
    checkout_url: str
    status: str
    price_ref: str = ""


@dataclass(frozen=True, slots=True)
class ProviderSubscription:
    """The provider's authoritative view of one subscription."""

    external_subscription_id: str
    status: str
    current_start: int | None
    current_end: int | None
    updated_at: int
    cancel_at_period_end: bool
    price_ref: str = ""
    provider_mode: str = "disabled"
    catalog_revision: str = ""
    payment: ProviderPayment | None = None
    # Opaque intent/account refs echoed back from the metadata we sent, used to
    # verify provider identity before any activation.
    intent_id: str = ""
    account_ref: str = ""


@dataclass(frozen=True, slots=True)
class HostedPayment:
    """A created hosted one-time payment awaiting the buyer."""

    external_payment_id: str
    checkout_url: str
    status: str
    amount_minor: int
    currency: str


@dataclass(frozen=True, slots=True)
class ProviderPayment:
    """The provider's authoritative view of one one-time payment."""

    external_payment_id: str
    status: str
    amount_minor: int
    currency: str
    updated_at: int
    paid_at: int | None = None
    intent_id: str = ""
    account_ref: str = ""
    # A Payment Link is an intent/container, not the captured transaction.
    # Settlement identity always uses external_payment_id.
    external_payment_link_id: str = ""
    tax_minor: int | None = None
    external_invoice_id: str = ""
    external_subscription_id: str = ""
    period_start: int | None = None
    period_end: int | None = None
    provider_mode: str = "disabled"
    # Coarse provider method only (for example card, netbanking, upi). No
    # instrument number, token, or other sensitive payment data is retained.
    payment_method: str = ""


@dataclass(frozen=True, slots=True)
class ProviderRefund:
    external_refund_id: str
    external_payment_id: str
    status: str
    amount_minor: int
    currency: str
    updated_at: int


@dataclass(frozen=True, slots=True)
class ProviderMetadata:
    """Safe, opaque metadata attached to a provider object.

    Only opaque server ids are ever sent (invariant 6): no email, no prompt,
    no credential, no capability list.
    """

    intent_id: str
    account_ref: str
    catalog_revision: str
    extra: dict[str, str] = field(default_factory=dict)

    def as_notes(self) -> dict[str, str]:
        notes = {
            "citeladder_intent_id": self.intent_id,
            "citeladder_account_ref": self.account_ref,
            "citeladder_catalog_revision": self.catalog_revision,
        }
        notes.update(self.extra)
        return notes


@dataclass(frozen=True, slots=True)
class CheckoutInitialization:
    """The PUBLIC fields a browser needs to begin one hosted checkout.

    Two flows are described, both provider-agnostic:

    * ``hosted_redirect`` — send the buyer to ``redirect_url``, which the
      adapter has already validated against its own allowlisted hosts;
    * ``provider_sdk`` — load the adapter's named SDK with ``public_key`` and
      ``reference``.

    Only PUBLIC initialization data appears here: a publishable key and the
    provider's own reference for the intent. No secret, no amount, no private
    price reference, and no arbitrary script URL ever crosses this boundary,
    so the shared checkout controller never has to inspect a vendor field name
    to decide what to render.
    """

    flow: str
    provider: str
    provider_mode: str
    redirect_url: str = ""
    sdk_name: str = ""
    public_key: str = ""
    reference: str = ""


CHECKOUT_FLOW_REDIRECT = "hosted_redirect"
CHECKOUT_FLOW_SDK = "provider_sdk"


class CheckoutCallbackError(ValueError):
    """A browser-returned checkout callback that did not authenticate."""

    def __init__(self, code: str = "invalid_callback") -> None:
        super().__init__(code)
        self.code = code


class BillingCheckoutAdapter(Protocol):
    """One vendor's browser-checkout initialization and callback handling."""

    def initialization(
        self, *, external_reference: str, provider_mode: str
    ) -> CheckoutInitialization:
        """Public initialization data for an already-committed intent."""
        ...

    def verify_callback(
        self, *, external_reference: str, fields: Mapping[str, str]
    ) -> None:
        """Authenticate a browser callback against the PERSISTED reference.

        Vendor-specific and typed: the adapter allowlists the exact fields it
        accepts and validates their shapes before checking any signature.
        Raises :class:`CheckoutCallbackError` on any failure. A callback that
        passes still grants nothing on its own — settled payment evidence
        does.
        """
        ...


class WebhookAuthenticationError(ValueError):
    """The raw webhook request did not authenticate. It grants NOTHING."""

    def __init__(self, code: str = "invalid_signature") -> None:
        super().__init__(code)
        self.code = code


@dataclass(frozen=True, slots=True)
class WebhookEnvelope:
    """One AUTHENTICATED webhook delivery, in the shared shape.

    ``event_id`` and ``event_type`` are the provider's own, kept for dedupe
    and dispatch. ``provider_mode`` comes from trusted SERVER configuration,
    never from an unsigned field in the body. ``record`` is the neutral
    subscription/payment evidence the shared settlement checks read; ``None``
    means the event is valid but carries nothing this application acts on.
    """

    provider: str
    provider_mode: str
    event_id: str
    event_type: str
    record: ProviderSubscription | ProviderPayment | None


class BillingWebhookVerifier(Protocol):
    """One vendor's webhook ingress: authenticate, then parse.

    Authentication runs against the EXACT raw bytes with this vendor's own
    configured credentials, before any parsing and before any activation side
    effect. The header names stay this vendor's real header names — they are
    not renamed into a fictitious shared protocol.
    """

    provider: str

    def required_headers(self) -> tuple[str, ...]:
        """This vendor's header names, in (signature, event id) order."""
        ...

    def authenticate(self, raw_body: bytes, headers: Mapping[str, str]) -> str:
        """Verify the raw request and return the provider's event id.

        Raises :class:`WebhookAuthenticationError` on any failure.
        """
        ...

    def parse(self, raw_body: bytes, *, event_id: str) -> WebhookEnvelope:
        """Translate an ALREADY-AUTHENTICATED body into the shared shape."""
        ...


class BillingProvider(Protocol):
    """The provider-neutral commercial surface the domain depends on."""

    async def create_base_subscription(
        self,
        *,
        price_ref: str,
        intent_id: str,
        account_ref: str,
        trial_days: int | None,
        metadata: ProviderMetadata,
    ) -> HostedSubscription: ...

    async def create_addon_subscription(
        self,
        *,
        price_ref: str,
        quantity: int,
        intent_id: str,
        account_ref: str,
        metadata: ProviderMetadata,
    ) -> HostedSubscription: ...

    async def cancel_subscription(
        self, external_subscription_id: str, *, at_cycle_end: bool = True
    ) -> ProviderSubscription: ...

    async def fetch_subscription(
        self, external_subscription_id: str
    ) -> ProviderSubscription: ...

    async def find_subscription(
        self, intent_id: str, account_ref: str
    ) -> ProviderSubscription | None: ...

    async def create_one_time_payment(
        self,
        *,
        amount_minor: int,
        currency: str,
        intent_id: str,
        account_ref: str,
        metadata: ProviderMetadata,
    ) -> HostedPayment: ...

    async def fetch_payment(self, external_payment_id: str) -> ProviderPayment: ...

    async def refund_payment(
        self,
        external_payment_id: str,
        *,
        amount_minor: int,
        idempotency_key: str,
    ) -> ProviderRefund: ...


__all__ = [
    "CHECKOUT_FLOW_REDIRECT",
    "CHECKOUT_FLOW_SDK",
    "BillingCheckoutAdapter",
    "BillingProvider",
    "BillingProviderError",
    "BillingWebhookVerifier",
    "CheckoutCallbackError",
    "CheckoutInitialization",
    "HostedPayment",
    "HostedSubscription",
    "ProviderMetadata",
    "ProviderPayment",
    "ProviderRefund",
    "ProviderSubscription",
    "WebhookAuthenticationError",
    "WebhookEnvelope",
]
