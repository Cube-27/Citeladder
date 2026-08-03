"""Execution-cost configuration: pricing catalogues, formula versioning, and
the expected-cost estimates used by funded admission.

This module is the SOLE owner of expected execution costs (invariant 1): the
Part B funded-admission path imports ``expected_execution_cost`` from here
rather than defining a duplicate catalogue.

Two pricing surfaces coexist deliberately — do not "unify" them:

- ``app.core.config.analysis`` owns the Gemini paid-list rates used ONLY by
  the scoring visibility estimate (``_aggregate_cost``): a reporting
  projection answering "what would this traffic cost at public list prices".
- THIS module owns (a) the versioned unit-rate ``RoutePricing`` catalogue
  consumed by the append-only execution-cost projection, and (b) the
  route/mode-keyed ``ExpectedExecutionCost`` catalogue consumed by funded
  admission ("what do we expect ONE execution of this route+mode to cost").
  They version independently and answer different questions.

Catalogue rate fields stay null until externally verified (frozen v8 plan): no
provider unit rates are invented from the aggregate T1 observations. With
rates null, persisted projections carry usage but no computed line costs
(``projection_status`` is then partial/unknown — never a fabricated zero), and
funded admission reads ``ExpectedExecutionCost.complete`` and fails closed.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Final

from app.core.config.audits import (
    MEASUREMENT_MODE_BENCHMARK,
    MEASUREMENT_MODE_PULSE,
)
from app.core.config.provider_catalog import (
    ENGINE_CHATGPT,
    ENGINE_CLAUDE,
    ENGINE_GEMINI,
    TRANSPORT_ANTHROPIC,
    TRANSPORT_GOOGLE,
    TRANSPORT_OPENAI,
    default_model,
)

# Shared currency conversion: 1 USD = 1_000_000 micro-USD. Funded admission
# converts a minor-USD (cents) monthly budget to micro-USD through THIS
# constant (minor * MICRO_USD_PER_USD // 100) before comparing like units.
MICRO_USD_PER_USD: Final = 1_000_000

# Unit divisor for per-million-token rates. Kept separate from
# ``MICRO_USD_PER_USD`` (a currency conversion) and from analysis.py's
# scoring-only constant: the value coincidence carries no shared meaning.
TOKENS_PER_MILLION: Final = 1_000_000

# Version stamped on every persisted projection row. Bump when the line-cost
# arithmetic changes; old rows keep their frozen version (append-only).
EXECUTION_COST_FORMULA_VERSION: Final = "line-sum-v1"

# Version of the current unit-rate catalogue. ``unverified-rates-v1`` carries
# no verified rates — every rate field is null.
PRICING_CATALOG_VERSION: Final = "unverified-rates-v1"

# Projection completeness vocabulary (persisted; do not reuse for anything
# else). ``unknown`` never coerces to zero anywhere.
PROJECTION_STATUS_COMPLETE: Final = "complete"
PROJECTION_STATUS_PARTIAL: Final = "partial"
PROJECTION_STATUS_UNKNOWN: Final = "unknown"
PROJECTION_STATUSES: Final[frozenset[str]] = frozenset(
    {
        PROJECTION_STATUS_COMPLETE,
        PROJECTION_STATUS_PARTIAL,
        PROJECTION_STATUS_UNKNOWN,
    }
)


@dataclass(frozen=True)
class RouteIdentity:
    """Immutable route triple an execution was performed on.

    Keyed on everywhere: pricing catalogue, expected-cost catalogue, and the
    worker's pricing lookup read the artifact's persisted provenance columns
    to rebuild exactly this identity.
    """

    logical_engine: str
    transport_provider: str
    transport_model: str


@dataclass(frozen=True)
class RoutePricing:
    """Versioned unit-rate card for one immutable route identity.

    Token rates are micro-USD per ONE MILLION tokens; ``search_fee_microusd``
    is micro-USD per search. A null rate is UNVERIFIED — it blocks the
    matching projected cost line and is never coerced to zero.
    ``effective_date`` stays empty while the card is unverified: an unverified
    card has no honest effective date.
    """

    uncached_input_microusd_per_million: int | None
    cached_input_microusd_per_million: int | None
    output_microusd_per_million: int | None
    reasoning_microusd_per_million: int | None
    search_fee_microusd: int | None
    currency: str
    effective_date: str
    pricing_version: str


@dataclass(frozen=True)
class ExpectedExecutionCost:
    """Route/mode/retrieval-aware expected cost of ONE execution.

    ``complete`` is the funded-admission gate: admission fails closed on an
    incomplete estimate. With retrieval disabled the search fields are not
    applicable — they stay null (never zero) and completeness rides on the
    token estimate alone.
    """

    token_cost_microusd: int | None
    search_fee_microusd: int | None
    expected_searches: int | None
    complete: bool


@dataclass(frozen=True)
class _ExpectedCostEstimate:
    """Catalogue entry: frozen aggregate observations for one route + mode."""

    token_cost_microusd: int | None
    search_fee_microusd: int | None
    expected_searches: int | None


def _approved_route(logical_engine: str, transport_provider: str) -> RouteIdentity:
    """Rebuild the immutable identity of an approved catalogue route."""

    return RouteIdentity(
        logical_engine=logical_engine,
        transport_provider=transport_provider,
        transport_model=default_model(logical_engine, transport_provider),
    )


ROUTE_CHATGPT: Final = _approved_route(ENGINE_CHATGPT, TRANSPORT_OPENAI)
ROUTE_CLAUDE: Final = _approved_route(ENGINE_CLAUDE, TRANSPORT_ANTHROPIC)
ROUTE_GEMINI: Final = _approved_route(ENGINE_GEMINI, TRANSPORT_GOOGLE)
APPROVED_ROUTE_IDENTITIES: Final[frozenset[RouteIdentity]] = frozenset(
    {ROUTE_CHATGPT, ROUTE_CLAUDE, ROUTE_GEMINI}
)


def _unverified_pricing(pricing_version: str) -> RoutePricing:
    """The current rate card: every rate null until externally verified."""

    return RoutePricing(
        uncached_input_microusd_per_million=None,
        cached_input_microusd_per_million=None,
        output_microusd_per_million=None,
        reasoning_microusd_per_million=None,
        search_fee_microusd=None,
        currency="USD",
        effective_date="",
        pricing_version=pricing_version,
    )


# Unit-rate catalogues keyed by pricing version, then immutable route identity.
# PR1 ships exactly one version with all rates null.
_ROUTE_PRICING_CATALOGS: Final[dict[str, dict[RouteIdentity, RoutePricing]]] = {
    PRICING_CATALOG_VERSION: {
        route: _unverified_pricing(PRICING_CATALOG_VERSION)
        for route in APPROVED_ROUTE_IDENTITIES
    }
}

# Frozen T1 aggregate observations (Anthropic route only). These are TOTAL
# expected costs per execution — NOT unit rates — so no provider rate card is
# derived from them. OpenAI/Google token estimates and every per-search fee
# stay None: funded admission reads ``complete`` and fails closed there.
#
# STALE AND NOT-TO-BE-TRUSTED AS ADMISSION BOUNDS: these were measured on
# ``claude-sonnet-4-6``, and the Claude route now runs ``claude-haiku-4-5``. The
# model changed, so they are NOT observations of the current route and must NOT
# be treated as safe admission bounds or rescaled by the published price ratio
# (a number derived from a rate card is not an observation). They are retained
# for historical reference only. NOTE: the catalog entries below still resolve
# ``complete=True`` today; they must be REPLACED with a LIVE Claude Haiku 4.5
# measurement on the current route before ROUTE_CLAUDE may be relied on for
# funded admission.
_EXPECTED_COST_CATALOG: Final[
    dict[tuple[RouteIdentity, str], _ExpectedCostEstimate]
] = {
    (ROUTE_CLAUDE, MEASUREMENT_MODE_PULSE): _ExpectedCostEstimate(
        token_cost_microusd=2_890,
        search_fee_microusd=None,
        expected_searches=None,
    ),
    (ROUTE_CLAUDE, MEASUREMENT_MODE_BENCHMARK): _ExpectedCostEstimate(
        token_cost_microusd=146_600,
        search_fee_microusd=None,
        expected_searches=3,
    ),
}


def pricing_version_known(pricing_version: str) -> bool:
    """Return whether a pricing catalogue version exists (CLI validation)."""

    return pricing_version in _ROUTE_PRICING_CATALOGS


def route_pricing_for(
    route_identity: RouteIdentity, pricing_version: str
) -> RoutePricing | None:
    """Look up the rate card for one route under one pricing version.

    Returns None only when the pricing VERSION is unknown (nothing can be
    honestly stamped with it). A known version with no entry for the route —
    e.g. repricing an old artifact whose route has since retired — yields an
    all-null unverified card stamped with that version: rates unverified,
    never zero-cost.
    """

    catalog = _ROUTE_PRICING_CATALOGS.get(pricing_version)
    if catalog is None:
        return None
    pricing = catalog.get(route_identity)
    if pricing is None:
        return _unverified_pricing(pricing_version)
    return pricing


def expected_execution_cost(
    route_identity: RouteIdentity,
    measurement_mode: str,
    retrieval_enabled: bool,
) -> ExpectedExecutionCost:
    """Expected cost of one execution for admission control.

    - Missing token estimate is ALWAYS incomplete.
    - Retrieval enabled: missing per-search fee OR missing expected-search
      count is incomplete (both are required alongside the token estimate).
    - Retrieval disabled: search fields are not applicable — they stay null
      and neither become zero nor affect completeness.
    """

    estimate = _EXPECTED_COST_CATALOG.get((route_identity, measurement_mode))
    token_cost = estimate.token_cost_microusd if estimate is not None else None
    if not retrieval_enabled:
        return ExpectedExecutionCost(
            token_cost_microusd=token_cost,
            search_fee_microusd=None,
            expected_searches=None,
            complete=token_cost is not None,
        )
    search_fee = estimate.search_fee_microusd if estimate is not None else None
    expected_searches = estimate.expected_searches if estimate is not None else None
    complete = (
        token_cost is not None
        and search_fee is not None
        and expected_searches is not None
    )
    return ExpectedExecutionCost(
        token_cost_microusd=token_cost,
        search_fee_microusd=search_fee,
        expected_searches=expected_searches,
        complete=complete,
    )
