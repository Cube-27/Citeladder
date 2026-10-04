"""Shared Python model/operator defaults; runtime policy is native."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Final

from app.core.config.entitlements import (
    CAPABILITY_REGISTRY,
    KEY_PROVIDER_COPILOT,
    KEY_PROVIDER_GROK,
    KEY_PROVIDER_PERPLEXITY,
)
from app.core.config.provider_routes import ACTIVE_TRANSPORTS as ACTIVE_TRANSPORTS
from app.core.config.provider_routes import ENGINE_CHATGPT as ENGINE_CHATGPT
from app.core.config.provider_routes import (
    ENGINE_CHATGPT_SEARCH,
    ENGINE_GEMINI_CONSUMER,
)
from app.core.config.provider_routes import ENGINE_CLAUDE as ENGINE_CLAUDE
from app.core.config.provider_routes import ENGINE_GEMINI as ENGINE_GEMINI
from app.core.config.provider_routes import (
    ENGINE_GOOGLE_AI_OVERVIEW as ENGINE_GOOGLE_AI_OVERVIEW,
)
from app.core.config.provider_routes import LOGICAL_ENGINES as LOGICAL_ENGINES
from app.core.config.provider_routes import MEASUREMENT_ROUTES as MEASUREMENT_ROUTES
from app.core.config.provider_routes import REASONING_EFFORT_LOW as REASONING_EFFORT_LOW
from app.core.config.provider_routes import TRANSPORT_ANTHROPIC as TRANSPORT_ANTHROPIC
from app.core.config.provider_routes import TRANSPORT_DATAFORSEO as TRANSPORT_DATAFORSEO
from app.core.config.provider_routes import TRANSPORT_GOOGLE as TRANSPORT_GOOGLE
from app.core.config.provider_routes import TRANSPORT_OPENAI as TRANSPORT_OPENAI
from app.core.config.provider_routes import MeasurementRoute as MeasurementRoute
from app.core.config.provider_routes import is_search_surface as is_search_surface
from app.core.config.provider_routes import measurement_route as measurement_route
from app.core.config.provider_routes import (
    measurement_routes_for_engine as measurement_routes_for_engine,
)

PROVIDER_GROK: Final = "grok"

PROVIDER_PERPLEXITY: Final = "perplexity"

PROVIDER_COPILOT: Final = "copilot"

AVAILABILITY_AVAILABLE: Final = "available"

AVAILABILITY_UNAVAILABLE: Final = "unavailable"

REASON_PROVIDER_UNAVAILABLE: Final = "provider_unavailable"


def validate_availability(availability: str, reason: str | None) -> None:
    """Shared availability/reason consistency rule for any catalog row.

    An unavailable row needs a safe, non-leaking reason; an available row
    carries none. The commercial catalog (``config/billing_catalog.py``) reuses this so
    the two-token vocabulary has exactly one owner (invariant 2).
    """
    if availability == AVAILABILITY_AVAILABLE:
        if reason is not None:
            raise ValueError("an available catalog row carries no reason")
        return
    if availability != AVAILABILITY_UNAVAILABLE:
        raise ValueError(f"unsupported availability: {availability!r}")
    if not reason:
        raise ValueError("an unavailable catalog row needs a safe reason")


@dataclass(frozen=True, slots=True)
class ProviderCatalogEntry:
    """One provider row in the PUBLIC provider catalog.

    ``adapter_shipped`` says whether an execution adapter exists at all;
    ``grant_key`` is the DESCRIPTIVE capability identity for the row (it is not
    proof that anything may be granted); ``issuable`` is authoritative and is
    true only for a real, issuable entitlement-registry capability. Shipped
    BYOK engines are not grant-gated, so they are non-issuable too.
    """

    key: str
    label: str
    availability: str
    unavailable_reason: str | None
    adapter_shipped: bool
    grant_key: str
    issuable: bool

    def __post_init__(self) -> None:
        validate_availability(self.availability, self.unavailable_reason)
        if self.adapter_shipped != (self.availability == AVAILABILITY_AVAILABLE):
            raise ValueError(
                f"provider {self.key!r} availability disagrees with adapter_shipped"
            )
        definition = CAPABILITY_REGISTRY.get(self.grant_key)
        expected = definition is not None and definition.issuable
        if self.issuable and not expected:
            raise ValueError(
                f"provider {self.key!r} claims an issuable grant key it cannot have"
            )


PUBLIC_PROVIDER_CATALOG: Final[tuple[ProviderCatalogEntry, ...]] = (
    ProviderCatalogEntry(
        key=ENGINE_CHATGPT_SEARCH,
        label="ChatGPT Search",
        availability=AVAILABILITY_AVAILABLE,
        unavailable_reason=None,
        adapter_shipped=True,
        grant_key="provider.chatgpt_search",
        issuable=False,
    ),
    ProviderCatalogEntry(
        key=ENGINE_GEMINI_CONSUMER,
        label="Gemini",
        availability=AVAILABILITY_AVAILABLE,
        unavailable_reason=None,
        adapter_shipped=True,
        grant_key="provider.gemini_consumer",
        issuable=False,
    ),
    ProviderCatalogEntry(
        key=ENGINE_CHATGPT,
        label="ChatGPT API",
        availability=AVAILABILITY_AVAILABLE,
        unavailable_reason=None,
        adapter_shipped=True,
        grant_key="provider.chatgpt",
        issuable=False,
    ),
    ProviderCatalogEntry(
        key=ENGINE_CLAUDE,
        label="Claude API",
        availability=AVAILABILITY_AVAILABLE,
        unavailable_reason=None,
        adapter_shipped=True,
        grant_key="provider.claude",
        issuable=False,
    ),
    ProviderCatalogEntry(
        key=ENGINE_GEMINI,
        label="Gemini API",
        availability=AVAILABILITY_AVAILABLE,
        unavailable_reason=None,
        adapter_shipped=True,
        grant_key="provider.gemini",
        issuable=False,
    ),
    # ACTIVATED. This flag is the single switch, and it was held closed
    # deliberately while the surface was built: a half-wired engine a customer
    # can select is worse than no engine.
    #
    # It flipped only once the complete path works end to end — connector,
    # parser, submit/park/poll/finalize lifecycle, reconciliation, analysis
    # through the unchanged scorer — AND the app can render the results
    # legibly, which means a run showing "Waiting for Google" while a task is
    # outstanding, and a measured absence reading as "no AI Overview was
    # shown" rather than as a missing answer. An executable surface whose
    # results cannot be understood in the app is worse than an unavailable
    # one.
    ProviderCatalogEntry(
        key=ENGINE_GOOGLE_AI_OVERVIEW,
        label="Google AI Overview",
        availability=AVAILABILITY_AVAILABLE,
        unavailable_reason=None,
        adapter_shipped=True,
        grant_key="provider.google_ai_overview",
        issuable=False,
    ),
    # Coming soon: no adapter ships, no route exists, and no plan bundle may
    # issue a runnable grant for them. Copilot is additionally NON-ISSUABLE in
    # the entitlement registry — nothing may ever write it.
    ProviderCatalogEntry(
        key=PROVIDER_GROK,
        label="Grok",
        availability=AVAILABILITY_UNAVAILABLE,
        unavailable_reason=REASON_PROVIDER_UNAVAILABLE,
        adapter_shipped=False,
        grant_key=KEY_PROVIDER_GROK,
        issuable=True,
    ),
    ProviderCatalogEntry(
        key=PROVIDER_PERPLEXITY,
        label="Perplexity",
        availability=AVAILABILITY_UNAVAILABLE,
        unavailable_reason=REASON_PROVIDER_UNAVAILABLE,
        adapter_shipped=False,
        grant_key=KEY_PROVIDER_PERPLEXITY,
        issuable=True,
    ),
    ProviderCatalogEntry(
        key=PROVIDER_COPILOT,
        label="Microsoft Copilot",
        availability=AVAILABILITY_UNAVAILABLE,
        unavailable_reason=REASON_PROVIDER_UNAVAILABLE,
        adapter_shipped=False,
        grant_key=KEY_PROVIDER_COPILOT,
        issuable=False,
    ),
)


CREDENTIAL_SOURCE_BYOK: Final = "byok"

CREDENTIAL_SOURCE_PLATFORM: Final = "platform"
