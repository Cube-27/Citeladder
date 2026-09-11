"""Provider selection for new checkout and for existing records (plan §3.3).

The registration below is the ONLY place a real adapter is wired in. It is an
explicit mapping, evaluated at import: there is no discovery, no plugin path,
and no fallback. A provider that is not configured produces a safe unavailable
result before any provider I/O — it never silently becomes Razorpay.

Razorpay itself is PAUSED, not removed: its working integration code stays
behind this adapter so returning to it, or adding a different provider beside
it, is a configuration and adapter change rather than a rewrite of the
commercial core.
"""

from __future__ import annotations

from app.connectors.billing.base import BillingProvider
from app.connectors.billing.http_client import shared_billing_client
from app.connectors.billing.razorpay import RazorpayBillingProvider
from app.connectors.billing.razorpay_checkout import RazorpayCheckoutAdapter
from app.connectors.billing.razorpay_webhook import RazorpayWebhookVerifier
from app.connectors.billing.registry import (
    ProviderBinding,
    ProviderRegistration,
    ProviderUnavailableError,
    binding_for_record,
    register_provider,
    resolve_binding,
)
from app.core.config.billing_contracts import (
    PROVIDER_RAZORPAY,
    RAZORPAY_PAYMENT_EVENT_TYPES,
    RAZORPAY_STATUS_MAP,
    REGION_INTERNATIONAL,
)
from app.core.config.billing_settings import billing_settings
from app.core.config.razorpay_settings import razorpay_settings


def _razorpay_region_ready(mode: str, region: str) -> bool:
    """The operator's declared per-environment, per-region readiness."""
    if mode == "test":
        return razorpay_settings.test_ready and (
            razorpay_settings.test_international_ready
            if region == REGION_INTERNATIONAL
            else razorpay_settings.test_india_ready
        )
    return razorpay_settings.live_ready and (
        region != REGION_INTERNATIONAL or razorpay_settings.international_ready
    )


register_provider(
    ProviderRegistration(
        provider=PROVIDER_RAZORPAY,
        configured_mode=razorpay_settings.configured_mode,
        build=lambda: RazorpayBillingProvider(client=shared_billing_client()),
        region_ready=_razorpay_region_ready,
        secret_values=razorpay_settings.secret_values,
        # This vendor's own status and event vocabulary, declared here so the
        # shared settlement code never has to know either of them.
        normalize_subscription_status=RAZORPAY_STATUS_MAP.get,
        is_payment_event=lambda event_type: event_type in RAZORPAY_PAYMENT_EVENT_TYPES,
        webhook=RazorpayWebhookVerifier(),
        checkout=RazorpayCheckoutAdapter(),
    )
)


def new_checkout_binding() -> ProviderBinding:
    """The provider/environment a NEW payable intent must freeze.

    Resolved once from server-controlled configuration and then persisted on
    the intent. Later operations on that intent read the persisted pair, so
    changing this default never re-routes an existing obligation.
    """
    return resolve_binding(billing_settings.checkout_provider)


def provider_for_record(provider: str, provider_mode: str) -> BillingProvider:
    """The adapter for an EXISTING record's originating provider/environment."""
    return binding_for_record(provider, provider_mode).adapter()


def get_billing_provider(provider: str | None = None) -> BillingProvider:
    """The adapter for ``provider``, or the new-checkout default.

    Kept as the historical import path so the commercial core's call sites did
    not have to change shape; what changed is that it now RESOLVES a provider
    instead of always constructing Razorpay.

    Raises :class:`ProviderUnavailableError` when nothing is configured. The
    API layer maps that to a safe commercial refusal; connectors deliberately
    do not import the domain's error vocabulary to say so.
    """
    binding = new_checkout_binding() if provider is None else resolve_binding(provider)
    return binding.adapter()


__all__ = [
    "ProviderUnavailableError",
    "get_billing_provider",
    "new_checkout_binding",
    "provider_for_record",
]
