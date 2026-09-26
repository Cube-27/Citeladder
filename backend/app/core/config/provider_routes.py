"""Route identity: WHICH surfaces exist and HOW each one is reached.

Split out of ``provider_catalog`` because identity and policy are different
concerns that were sharing one file. This module answers "what is the exact
executable route for this engine" — the engine and transport vocabularies,
the surface-kind axis, and the frozen ``MeasurementRoute`` per engine.
``provider_catalog`` keeps what surrounds that: execution-time policy, pacing,
endpoints, credential sourcing and the public display catalog.

Nothing here imports ``provider_catalog``, which is what keeps the split free
of a cycle. ``provider_catalog`` re-exports every name below, so existing
imports are unchanged and no caller needs to know where the line falls.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Final

from app.core.config.dataforseo import (
    DEFAULT_DEVICE,
    DEFAULT_LANGUAGE_CODE,
    DEFAULT_LOCATION_CODE,
)
from app.core.config.llm_scraper import PRODUCTS as LLM_SCRAPER_PRODUCTS

# --- Logical engines (what the user asked for) ----------------------------
ENGINE_CHATGPT: Final = "chatgpt"
ENGINE_GEMINI: Final = "gemini"
ENGINE_CLAUDE: Final = "claude"
# Google's AI Overview is a measured answer surface, not a conversational
# engine: it is OBSERVED inside a search result page rather than asked. It
# shares this vocabulary because it produces the same ``ResponseAnalysis``
# the LLM engines do; ``surface_kind`` below carries the difference.
ENGINE_GOOGLE_AI_OVERVIEW: Final = "google_ai_overview"
ENGINE_CHATGPT_SEARCH: Final = "chatgpt_search"
ENGINE_GEMINI_CONSUMER: Final = "gemini_consumer"
# Deliberately ``tuple[str, ...]``: the arity is not part of the contract.
# Nothing may assert "exactly three engines" off this annotation again.
LOGICAL_ENGINES: Final[tuple[str, ...]] = (
    ENGINE_CHATGPT,
    ENGINE_CLAUDE,
    ENGINE_GEMINI,
    ENGINE_GOOGLE_AI_OVERVIEW,
    ENGINE_CHATGPT_SEARCH,
    ENGINE_GEMINI_CONSUMER,
)

# --- Transport providers (how we physically reach the engine) -------------
TRANSPORT_OPENAI: Final = "openai"
TRANSPORT_ANTHROPIC: Final = "anthropic"
TRANSPORT_GOOGLE: Final = "google"
TRANSPORT_DATAFORSEO: Final = "dataforseo"
# Transports a NEW BYOK ``ProviderConnection`` may declare (active surface).
ACTIVE_TRANSPORTS: Final[frozenset[str]] = frozenset(
    {TRANSPORT_OPENAI, TRANSPORT_ANTHROPIC, TRANSPORT_GOOGLE, TRANSPORT_DATAFORSEO}
)

# --- Surface kind (HOW an engine is reached) ------------------------------
# The third axis. ``logical_engine`` says which answer surface is measured and
# ``transport_provider`` says whose API carries it; neither says whether the
# surface is ASKED a question or OBSERVED. That distinction decides which
# request contract is built, which adapter protocol is used, which execution
# shape the worker runs, and which pricing shape applies.
#
# It is NOT a user-facing concept. The UI says "Google AI Overview"; the words
# DataForSEO, Google Organic and SERP API never appear as a product label.
SURFACE_KIND_LLM: Final = "llm"
SURFACE_KIND_SEARCH_AI: Final = "search_ai"
SURFACE_KIND_LLM_SCRAPER: Final = "llm_scraper"
SURFACE_KINDS: Final[frozenset[str]] = frozenset(
    {SURFACE_KIND_LLM, SURFACE_KIND_SEARCH_AI, SURFACE_KIND_LLM_SCRAPER}
)

# --- Measurement routes ---------------------------------------------------

REASONING_EFFORT_OFF: Final = "off"
REASONING_EFFORT_MINIMAL: Final = "minimal"
REASONING_EFFORT_LOW: Final = "low"
REASONING_EFFORT_UNVERIFIED: Final = "unverified"

# Whether the pinned transport model is known to match the corresponding
# consumer product. Every active route remains unverified until evidence exists.
REPRESENTATIVE_STATUS_UNVERIFIED: Final = "unverified"
REPRESENTATIVE_STATUS_VERIFIED: Final = "verified"


@dataclass(frozen=True, slots=True, kw_only=True)
class SearchContext:
    """What a search surface is observed FROM.

    An AI Overview differs by where, in what language and on what device the
    search was run, so the context is part of the measurement identity rather
    than a request detail. It is frozen into the task at admission.
    """

    location_code: int
    language_code: str
    device: str


@dataclass(frozen=True, slots=True, kw_only=True)
class MeasurementRoute:
    """One exact executable route.

    ``surface_kind`` is the branch point. ``retrieval_enabled``,
    ``reasoning_effort`` and ``reasoning_pinnable`` describe how an LLM is
    ASKED and mean nothing for an observed search surface, so a ``search_ai``
    route carries them as ``None`` rather than as force-fitted defaults —
    a default here would be a measurement claim nobody made. ``search_context``
    is the mirror image: set for ``search_ai``, ``None`` for ``llm``.
    """

    logical_engine: str
    transport_provider: str
    transport_model: str
    retrieval_enabled: bool | None
    reasoning_effort: str | None
    reasoning_pinnable: bool | None
    representative_status: str
    surface_kind: str = SURFACE_KIND_LLM
    search_context: SearchContext | None = None

    def __post_init__(self) -> None:
        if self.surface_kind not in SURFACE_KINDS:
            raise ValueError(f"unsupported surface kind: {self.surface_kind!r}")
        llm_fields = (
            self.retrieval_enabled,
            self.reasoning_effort,
            self.reasoning_pinnable,
        )
        if self.surface_kind == SURFACE_KIND_LLM:
            if any(field is None for field in llm_fields):
                raise ValueError(
                    f"llm route {self.logical_engine!r} must pin every LLM field"
                )
            if self.search_context is not None:
                raise ValueError(
                    f"llm route {self.logical_engine!r} carries no search context"
                )
            return
        if any(field is not None for field in llm_fields):
            raise ValueError(
                f"search route {self.logical_engine!r} must leave LLM fields null"
            )
        if self.search_context is None:
            raise ValueError(
                f"search route {self.logical_engine!r} needs a search context"
            )


# Exact model identity is frozen here. There is intentionally no provider
# alias, default-model fallback, or single-route compatibility view.
MEASUREMENT_ROUTES: Final[dict[str, MeasurementRoute]] = {
    ENGINE_CHATGPT: MeasurementRoute(
        logical_engine=ENGINE_CHATGPT,
        transport_provider=TRANSPORT_OPENAI,
        transport_model="gpt-5.5",
        retrieval_enabled=True,
        reasoning_effort=REASONING_EFFORT_OFF,
        reasoning_pinnable=True,
        representative_status=REPRESENTATIVE_STATUS_UNVERIFIED,
    ),
    ENGINE_CLAUDE: MeasurementRoute(
        logical_engine=ENGINE_CLAUDE,
        transport_provider=TRANSPORT_ANTHROPIC,
        transport_model="claude-sonnet-5",
        retrieval_enabled=True,
        reasoning_effort=REASONING_EFFORT_LOW,
        reasoning_pinnable=True,
        representative_status=REPRESENTATIVE_STATUS_UNVERIFIED,
    ),
    ENGINE_GEMINI: MeasurementRoute(
        logical_engine=ENGINE_GEMINI,
        transport_provider=TRANSPORT_GOOGLE,
        transport_model="gemini-3.6-flash",
        retrieval_enabled=True,
        reasoning_effort=REASONING_EFFORT_LOW,
        reasoning_pinnable=True,
        representative_status=REPRESENTATIVE_STATUS_UNVERIFIED,
    ),
    # Observed, not asked. There is no model to pin: DataForSEO reports what
    # Google rendered, so ``transport_model`` names the SERP product rather
    # than a model identity, and it is never presented as one.
    #
    # ``representative_status`` is VERIFIED, and uniquely so: the LLM routes
    # are unverified because an API model may differ from the consumer
    # product, whereas the observed block IS the consumer product. Nothing
    # stands between the measurement and what a searcher sees.
    ENGINE_GOOGLE_AI_OVERVIEW: MeasurementRoute(
        logical_engine=ENGINE_GOOGLE_AI_OVERVIEW,
        transport_provider=TRANSPORT_DATAFORSEO,
        transport_model="google-organic-serp",
        retrieval_enabled=None,
        reasoning_effort=None,
        reasoning_pinnable=None,
        representative_status=REPRESENTATIVE_STATUS_VERIFIED,
        surface_kind=SURFACE_KIND_SEARCH_AI,
        search_context=SearchContext(
            location_code=DEFAULT_LOCATION_CODE,
            language_code=DEFAULT_LANGUAGE_CODE,
            device=DEFAULT_DEVICE,
        ),
    ),
}


for _engine, _product in LLM_SCRAPER_PRODUCTS.items():
    MEASUREMENT_ROUTES[_engine] = MeasurementRoute(
        logical_engine=_engine,
        transport_provider=TRANSPORT_DATAFORSEO,
        transport_model=f"{_product}-llm-scraper",
        retrieval_enabled=None,
        reasoning_effort=None,
        reasoning_pinnable=None,
        representative_status=REPRESENTATIVE_STATUS_UNVERIFIED,
        surface_kind=SURFACE_KIND_LLM_SCRAPER,
        search_context=SearchContext(
            location_code=DEFAULT_LOCATION_CODE,
            language_code=DEFAULT_LANGUAGE_CODE,
            device=DEFAULT_DEVICE,
        ),
    )


def uses_provider_tasks(logical_engine: str) -> bool:
    """Asynchronous execution is independent of AI Overview semantics."""
    route = MEASUREMENT_ROUTES.get(logical_engine)
    return route is not None and route.surface_kind != SURFACE_KIND_LLM


def measurement_route(logical_engine: str) -> MeasurementRoute:
    """Return one exact executable route; unknown identities fail closed."""
    route = MEASUREMENT_ROUTES.get(logical_engine)
    if route is None:
        raise ValueError(f"no measurement route for {logical_engine!r}")
    return route


def measurement_routes_for_engine(logical_engine: str) -> tuple[MeasurementRoute, ...]:
    route = MEASUREMENT_ROUTES.get(logical_engine)
    return (route,) if route is not None else ()


def surface_kind(logical_engine: str) -> str:
    """Which execution shape an engine runs (fails closed on unknown)."""
    return measurement_route(logical_engine).surface_kind


def is_search_surface(logical_engine: str) -> bool:
    """True when the engine is OBSERVED rather than asked."""
    route = MEASUREMENT_ROUTES.get(logical_engine)
    return route is not None and route.surface_kind == SURFACE_KIND_SEARCH_AI


def llm_route(logical_engine: str) -> MeasurementRoute:
    """A route guaranteed to carry the LLM request fields.

    Every accessor that reads ``retrieval_enabled``/``reasoning_effort`` goes
    through this, so reading an LLM knob off a search surface raises at the
    call site instead of yielding a ``None`` that flows onward as a default.
    """
    route = measurement_route(logical_engine)
    if route.surface_kind != SURFACE_KIND_LLM:
        raise ValueError(
            f"{logical_engine!r} is a {route.surface_kind} surface and has no "
            "LLM request policy"
        )
    return route


def llm_reasoning_effort(logical_engine: str) -> str:
    """The reasoning pin an LLM request carries.

    ``MeasurementRoute.reasoning_effort`` is optional because a search surface
    has none; on an ``llm`` route the constructor guarantees it is set. This
    accessor turns that guarantee into something the type system can see, so
    request builders take a ``str`` rather than a ``str | None`` they would
    have to defend against with an invented default.
    """
    effort = llm_route(logical_engine).reasoning_effort
    if effort is None:  # pragma: no cover - forbidden by MeasurementRoute
        raise ValueError(f"llm route {logical_engine!r} has no reasoning effort")
    return effort


def search_context(logical_engine: str) -> SearchContext:
    """The default search context for a search surface (fails closed)."""
    route = measurement_route(logical_engine)
    if route.surface_kind != SURFACE_KIND_SEARCH_AI or route.search_context is None:
        raise ValueError(f"{logical_engine!r} is not a search surface")
    return route.search_context
