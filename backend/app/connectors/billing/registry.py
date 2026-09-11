"""Explicit provider identity/environment routing (plan §3.3).

One small, explicit mapping from a provider identity to the adapter that
speaks it. No runtime discovery, no dynamic loader, no plugin path: adding a
provider is an edit here plus its own adapter and settings module, and
removing one is the reverse.

Two rules this module exists to enforce:

* **New checkout** resolves the configured default provider and its
  environment ONCE, and the caller freezes both into the intent before any
  network call.
* **Everything that follows an existing record** — activations, subscription
  actions, payments, refunds, callbacks, webhooks, reconciliation — binds to
  the provider and environment PERSISTED on that record. Changing the
  new-checkout default therefore cannot reinterpret, re-route, or retry an
  existing obligation, and an uncertain creation is never retried against a
  different provider.

Missing or unsupported configuration returns a safe unavailable result before
any provider I/O, and never falls back to Razorpay.
"""

from __future__ import annotations

from collections.abc import Callable, Mapping
from dataclasses import dataclass

from app.connectors.billing.base import (
    BillingCheckoutAdapter,
    BillingProvider,
    BillingWebhookVerifier,
)

#: Operational "no checkout admission". Never a valid environment to freeze
#: into a new payable intent.
PROVIDER_MODE_DISABLED = "disabled"

CODE_PROVIDER_UNKNOWN = "provider_unknown"
CODE_PROVIDER_NOT_CONFIGURED = "provider_not_configured"
CODE_PROVIDER_MODE_MISMATCH = "provider_mode_mismatch"


class ProviderUnavailableError(RuntimeError):
    """A provider cannot serve this request, decided BEFORE any provider I/O."""

    def __init__(self, code: str, *, provider: str = "") -> None:
        super().__init__(code)
        self.code = code
        self.provider = provider


@dataclass(frozen=True, slots=True)
class ProviderRegistration:
    """Everything the application needs to know about one real provider."""

    provider: str
    #: ``test``/``live`` when fully configured, else ``None``. Must not raise.
    configured_mode: Callable[[], str | None]
    #: Build a client-backed adapter instance.
    build: Callable[[], BillingProvider]
    #: ``(mode, region) -> bool``: has the operator declared this provider
    #: ready to sell in this region, in this environment?
    region_ready: Callable[[str, str], bool]
    #: Every gateway secret this vendor holds, for secret-separation checks.
    secret_values: Callable[[], tuple[str, ...]]
    #: Translate one of THIS vendor's subscription statuses into the neutral
    #: vocabulary, or ``None`` when the vendor sent something unsupported.
    #: Status vocabulary is vendor-specific and stays with its adapter
    #: (plan §3.5) — the shared settlement code never reads a vendor's names.
    normalize_subscription_status: Callable[[str], str | None]
    #: Whether one of THIS vendor's event type names denotes a PAYMENT rather
    #: than a subscription lifecycle change.
    is_payment_event: Callable[[str], bool]
    #: Raw-request authentication + parsing for this vendor's webhooks.
    webhook: BillingWebhookVerifier
    #: Public browser-checkout initialization + callback authentication.
    checkout: BillingCheckoutAdapter


@dataclass(frozen=True, slots=True)
class ProviderBinding:
    """A resolved (provider, environment) pair and its adapter factory."""

    provider: str
    provider_mode: str
    registration: ProviderRegistration

    def adapter(self) -> BillingProvider:
        return self.registration.build()


_REGISTRY: dict[str, ProviderRegistration] = {}
_bootstrapped = False


def _ensure_registered() -> None:
    """Import the module that registers the real adapters, once.

    Lazy rather than at import time so a reader of this registry never
    has to import the factory itself, and so importing the registry can
    never be ordered wrongly against it.
    """
    global _bootstrapped
    if _bootstrapped:
        return
    _bootstrapped = True
    import app.connectors.billing.factory  # noqa: F401 - registers adapters


def register_provider(registration: ProviderRegistration) -> None:
    """Register one REAL configured adapter.

    Test doubles are registered by the tests that own them (and removed with
    :func:`unregister_provider`), so no fake provider can ever be reachable
    from a production process.
    """
    _REGISTRY[registration.provider] = registration


def unregister_provider(provider: str) -> None:
    _REGISTRY.pop(provider, None)


def registrations() -> Mapping[str, ProviderRegistration]:
    _ensure_registered()
    return dict(_REGISTRY)


def known_providers() -> tuple[str, ...]:
    _ensure_registered()
    return tuple(sorted(_REGISTRY))


def provider_secret_values() -> tuple[str, ...]:
    """Every registered provider's gateway secrets.

    The independent quote-signing secret is checked against ALL of these, so
    the separation rule does not quietly become "different from whichever
    gateway happens to be selected today".
    """
    _ensure_registered()
    return tuple(
        secret
        for registration in _REGISTRY.values()
        for secret in registration.secret_values()
    )


def resolve_binding(provider: str) -> ProviderBinding:
    """Bind ``provider`` to its CONFIGURED environment, or refuse safely."""
    _ensure_registered()
    registration = _REGISTRY.get(provider)
    if registration is None:
        raise ProviderUnavailableError(CODE_PROVIDER_UNKNOWN, provider=provider)
    mode = registration.configured_mode()
    if mode is None or mode == PROVIDER_MODE_DISABLED:
        raise ProviderUnavailableError(CODE_PROVIDER_NOT_CONFIGURED, provider=provider)
    return ProviderBinding(
        provider=provider, provider_mode=mode, registration=registration
    )


def binding_for_record(provider: str, provider_mode: str) -> ProviderBinding:
    """Bind to the provider/environment PERSISTED on an existing record.

    A record created in one environment is never served by another: if the
    deployment has since switched a provider from test to live, the old
    record's operations refuse rather than silently talking to the wrong
    environment about an id that does not exist there.
    """
    binding = resolve_binding(provider)
    if provider_mode and binding.provider_mode != provider_mode:
        raise ProviderUnavailableError(CODE_PROVIDER_MODE_MISMATCH, provider=provider)
    return binding


def region_ready(provider: str, region: str) -> bool:
    """Whether ``provider`` is operator-declared ready to sell in ``region``.

    Never raises: a disabled or unconfigured provider is simply not ready.
    """
    _ensure_registered()
    registration = _REGISTRY.get(provider)
    if registration is None:
        return False
    mode = registration.configured_mode()
    if mode is None or mode == PROVIDER_MODE_DISABLED:
        return False
    return registration.region_ready(mode, region)


def webhook_verifier(provider: str) -> BillingWebhookVerifier:
    """The verifier for one provider's webhook ingress, or a safe refusal."""
    return resolve_binding(provider).registration.webhook


def checkout_adapter(provider: str, provider_mode: str) -> BillingCheckoutAdapter:
    """The checkout adapter bound to a record's ORIGINATING provider/mode."""
    return binding_for_record(provider, provider_mode).registration.checkout


def status_normalizer(provider: str) -> Callable[[str], str | None]:
    """This provider's subscription-status translation.

    A provider that is not registered or not configured translates NOTHING:
    every status reads as unsupported, which the callers turn into a refusal
    rather than into an accidental activation.
    """
    _ensure_registered()
    registration = _REGISTRY.get(provider)
    if registration is None:
        return lambda _status: None
    return registration.normalize_subscription_status


def payment_event_predicate(provider: str) -> Callable[[str], bool]:
    """Whether an event type of this provider denotes a payment."""
    _ensure_registered()
    registration = _REGISTRY.get(provider)
    if registration is None:
        return lambda _event_type: False
    return registration.is_payment_event


__all__ = [
    "CODE_PROVIDER_MODE_MISMATCH",
    "CODE_PROVIDER_NOT_CONFIGURED",
    "CODE_PROVIDER_UNKNOWN",
    "PROVIDER_MODE_DISABLED",
    "ProviderBinding",
    "ProviderRegistration",
    "ProviderUnavailableError",
    "binding_for_record",
    "checkout_adapter",
    "known_providers",
    "payment_event_predicate",
    "provider_secret_values",
    "region_ready",
    "register_provider",
    "registrations",
    "resolve_binding",
    "status_normalizer",
    "unregister_provider",
    "webhook_verifier",
]
