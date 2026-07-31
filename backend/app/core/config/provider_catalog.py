# BYOK provider catalog + answer-engine guardrails (invariant 1: config lives
# in core/config, never inline in service/adapter code).
#
# Owns the approved logical-engine -> transport -> model catalog, the
# transport/engine enumerations, and the provider-agnostic guardrail knobs
# (token caps, timeouts, endpoint URLs, retry classification tokens). Adapters,
# services, and routers READ these values; they never hard-code them.
#
# ChatGPT is executable through the direct OpenAI Responses API (transport
# ``openai``). Active transports are exactly ``openai | anthropic | google`` and
# each logical engine has exactly one approved route.
from __future__ import annotations

from dataclasses import dataclass
from typing import Final

from pydantic_settings import BaseSettings, SettingsConfigDict

# --- Logical engines (what the user asked for) ----------------------------
ENGINE_CHATGPT: Final = "chatgpt"
ENGINE_GEMINI: Final = "gemini"
ENGINE_CLAUDE: Final = "claude"
LOGICAL_ENGINES: Final[frozenset[str]] = frozenset(
    {ENGINE_CHATGPT, ENGINE_GEMINI, ENGINE_CLAUDE}
)

# --- Transport providers (how we physically reach the engine) -------------
TRANSPORT_OPENAI: Final = "openai"
TRANSPORT_ANTHROPIC: Final = "anthropic"
TRANSPORT_GOOGLE: Final = "google"
# Transports a NEW BYOK ``ProviderConnection`` may declare (active surface).
ACTIVE_TRANSPORTS: Final[frozenset[str]] = frozenset(
    {TRANSPORT_OPENAI, TRANSPORT_ANTHROPIC, TRANSPORT_GOOGLE}
)

# --- Approved routes: logical engine -> {transport: default model} --------
# One catalog, the single source of truth for which (engine, transport, model)
# tuples are allowed. The ``/provider-catalog`` endpoint projects this;
# adapters validate their requested model against it. Exactly one approved
# transport per engine (v2 direct-only).
APPROVED_ROUTES: Final[dict[str, dict[str, str]]] = {
    ENGINE_CHATGPT: {
        TRANSPORT_OPENAI: "gpt-5.4",
    },
    ENGINE_CLAUDE: {
        TRANSPORT_ANTHROPIC: "claude-sonnet-4-6",
    },
    ENGINE_GEMINI: {
        TRANSPORT_GOOGLE: "gemini-flash-latest",
    },
}


# --- Execution-time route policy -----------------------------------------
# Keyed on the SAME approved (engine, transport) identity as ``APPROVED_ROUTES``
# above — this is the execution-time policy for those routes, not a second
# catalog: the model id is never repeated here (read it through
# ``default_model``). ``config/measurement.py`` owns the offline SWEEP
# vocabulary (``REASONING_EFFORT_UNSET|LOW|MEDIUM|HIGH``); the two tokens below
# are the execution-time PIN states, which the sweep has no equivalent for.
#
# ``off``: reasoning/thinking is explicitly disabled on the request.
# ``unverified``: no supported low reasoning value has been established for the
# route (no fixture and no live evidence), so the route stays UNPINNED and its
# cost-sensitive funded variant is ineligible. Fails closed — never treated as
# "off".
REASONING_EFFORT_OFF: Final = "off"
REASONING_EFFORT_UNVERIFIED: Final = "unverified"

# Whether the pinned transport model is known to match what a consumer of the
# logical engine actually gets. Consumer-representativeness is DEFERRED: every
# active route is ``unverified`` today.
REPRESENTATIVE_STATUS_UNVERIFIED: Final = "unverified"
REPRESENTATIVE_STATUS_VERIFIED: Final = "verified"


@dataclass(frozen=True, slots=True)
class RoutePolicy:
    """Execution-time policy for one approved (engine, transport) route.

    ``reasoning_effort`` is the value the adapter pins (or the ``unverified``
    sentinel when nothing may be pinned yet); ``reasoning_pinnable`` says
    whether the route accepts an explicit reasoning control at all;
    ``representative_status`` records consumer-representativeness evidence for
    the pinned model; ``batch_enabled`` gates any batch/async submission path.
    No prompt-caching knob exists — Searchify requests never enable provider
    prompt caching.
    """

    reasoning_effort: str
    reasoning_pinnable: bool
    representative_status: str
    batch_enabled: bool


# One entry per approved route in ``APPROVED_ROUTES`` (same keys).
ROUTE_POLICIES: Final[dict[tuple[str, str], RoutePolicy]] = {
    # Anthropic exposes an explicit thinking control, so reasoning is PINNED OFF.
    (ENGINE_CLAUDE, TRANSPORT_ANTHROPIC): RoutePolicy(
        reasoning_effort=REASONING_EFFORT_OFF,
        reasoning_pinnable=True,
        representative_status=REPRESENTATIVE_STATUS_UNVERIFIED,
        batch_enabled=False,
    ),
    # OpenAI + Google reasoning pins stay ``unverified``: until fixtures or live
    # evidence establish a supported low value, nothing is pinned and the
    # cost-sensitive funded route is ineligible.
    (ENGINE_CHATGPT, TRANSPORT_OPENAI): RoutePolicy(
        reasoning_effort=REASONING_EFFORT_UNVERIFIED,
        reasoning_pinnable=False,
        representative_status=REPRESENTATIVE_STATUS_UNVERIFIED,
        batch_enabled=False,
    ),
    (ENGINE_GEMINI, TRANSPORT_GOOGLE): RoutePolicy(
        reasoning_effort=REASONING_EFFORT_UNVERIFIED,
        reasoning_pinnable=False,
        representative_status=REPRESENTATIVE_STATUS_UNVERIFIED,
        batch_enabled=False,
    ),
}


def route_policy(logical_engine: str, transport_provider: str) -> RoutePolicy:
    """Execution-time policy for an approved route (fails closed).

    Raises ``ValueError`` for a route with no policy entry rather than assuming
    a permissive default: an unknown route must never silently execute with
    reasoning treated as off or batch treated as allowed.
    """
    policy = ROUTE_POLICIES.get((logical_engine, transport_provider))
    if policy is None:
        raise ValueError(
            f"no route policy for ({logical_engine!r}, {transport_provider!r}); "
            "approved routes must declare one"
        )
    return policy


def is_reasoning_pinned_off(logical_engine: str, transport_provider: str) -> bool:
    """True only when the route pins reasoning explicitly OFF."""
    policy = route_policy(logical_engine, transport_provider)
    return policy.reasoning_pinnable and policy.reasoning_effort == REASONING_EFFORT_OFF


def is_route_approved(logical_engine: str, transport_provider: str) -> bool:
    """True when (engine, transport) is an approved active route."""
    return transport_provider in APPROVED_ROUTES.get(logical_engine, {})


def is_active_transport(transport_provider: str) -> bool:
    """True when a transport may be used on an active (write/execute) path."""
    return transport_provider in ACTIVE_TRANSPORTS


def default_model(logical_engine: str, transport_provider: str) -> str:
    """The catalog default model for an approved (engine, transport) route."""
    return APPROVED_ROUTES.get(logical_engine, {}).get(transport_provider, "")


def engines_for_transport(transport_provider: str) -> tuple[str, ...]:
    """Logical engines reachable through a transport, in catalog order."""
    return tuple(
        engine
        for engine, routes in APPROVED_ROUTES.items()
        if transport_provider in routes
    )


def default_probe_engine(transport_provider: str) -> str:
    """A logical engine to use when probing a transport's connectivity.

    Picks the first engine the transport can serve so a connectivity test can
    build a concrete adapter/model without a caller-supplied route.
    """
    engines = engines_for_transport(transport_provider)
    return engines[0] if engines else ""


def configured_endpoint(transport_provider: str) -> str:
    """Return the sole operator-configured credential destination."""
    endpoint = {
        TRANSPORT_OPENAI: provider_catalog_settings.openai_responses_url,
        TRANSPORT_ANTHROPIC: provider_catalog_settings.anthropic_messages_url,
        TRANSPORT_GOOGLE: provider_catalog_settings.google_interactions_url,
    }.get(transport_provider, "")
    return endpoint.strip().rstrip("/")


def is_endpoint_approved(transport_provider: str, base_url: str) -> bool:
    """Allow provider defaults or the exact operator-configured endpoint only.

    A tenant-supplied URL must never choose where a stored BYOK credential is
    sent. Operators may still configure a gateway through deployment config.
    """
    approved = configured_endpoint(transport_provider)
    if not approved:
        return False
    supplied = base_url.strip().rstrip("/")
    return not supplied or supplied == approved


# --- Retry / error classification tokens (recorded on tests + attempts) ---
ERROR_TIMEOUT: Final = "timeout"
ERROR_CONNECTION: Final = "connection"
ERROR_RATE_LIMIT: Final = "rate_limit"
ERROR_SERVER: Final = "server_error"
ERROR_CLIENT: Final = "client_error"
ERROR_AUTH: Final = "auth_failure"
ERROR_PARSE: Final = "parse_error"
ERROR_UNKNOWN: Final = "unknown"
ERROR_INVALID_SURFACE: Final = "invalid_surface"

RETRYABLE_ERRORS: Final[frozenset[str]] = frozenset(
    {ERROR_TIMEOUT, ERROR_CONNECTION, ERROR_RATE_LIMIT, ERROR_SERVER}
)

# --- Connectivity-test statuses -------------------------------------------
TEST_STATUS_OK: Final = "ok"
TEST_STATUS_FAILED: Final = "failed"

# Neutral, brand-free probe used by the ``/test`` endpoint. The tracked
# brand/competitor list is NEVER sent to a provider (invariant 6).
PROBE_PROMPT: Final = "Reply with the single word: ok."


class ProviderCatalogSettings(BaseSettings):
    """Tunable answer-engine knobs (env-overridable, invariant 1).

    Provider-agnostic guardrails plus the transport endpoint URLs. A single set
    of knobs bounds every transport so a stray call cannot run away in tokens or
    time regardless of provider.
    """

    model_config = SettingsConfigDict(env_prefix="PROVIDER_", extra="ignore")

    # Endpoint URLs (overridable per environment / for a self-hosted gateway).
    openai_responses_url: str = "https://api.openai.com/v1/responses"
    google_interactions_url: str = (
        "https://generativelanguage.googleapis.com/v1beta/interactions"
    )
    anthropic_messages_url: str = "https://api.anthropic.com/v1/messages"
    anthropic_version: str = "2023-06-01"
    # Caps server-side web_search invocations per Anthropic request.
    anthropic_max_uses: int = 3
    # Per-call output-token cap sent to every transport payload.
    max_output_tokens: int = 4096
    # HTTP client timeout for a single provider call.
    request_timeout_seconds: float = 60.0
    # Shorter timeout for the lightweight connectivity probe.
    test_timeout_seconds: float = 20.0


provider_catalog_settings = ProviderCatalogSettings()
