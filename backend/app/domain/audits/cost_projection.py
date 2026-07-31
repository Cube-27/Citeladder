"""Append-only execution-cost projections from immutable raw artifacts.

A projection row is a versioned, immutable observation: one row per
``(raw_response_artifact, formula_version, pricing_version)``. Repricing
appends a NEW row under a new pricing version; it never mutates an existing
row (invariant 3).

Usage-key vocabulary (pinned by tests — do not widen silently):

- Granular keys win when present: ``uncached_input_tokens``,
  ``cached_input_tokens``, ``output_tokens``, ``reasoning_tokens``,
  ``search_requests`` (the measurement-envelope shape; also the T3 parser
  shape). A present-but-null/malformed granular key suppresses its fallback.
- Legacy normalized-parser fallbacks: ``total_input_tokens`` maps to
  ``uncached_input_tokens`` and ``total_output_tokens`` maps to
  ``output_tokens``. Semantic claim: Searchify requests never enable provider
  prompt caching, and reasoning is pinned off (or unverified → ineligible) on
  every approved route, so a provider response without an explicit
  cache/reasoning split bills ALL input at the uncached rate and ALL output at
  the non-reasoning output rate. When a split IS reported the granular keys
  are present and take precedence.
- ``cached_input_tokens`` and ``reasoning_tokens`` have NO fallback: no
  provider response today reports them, so they project as null. Unknown never
  becomes zero.
- ``search_requests`` falls back to the legacy ``web_search_requests`` key and
  is never inferred from ``search_used``: a known zero count is meaningful, a
  missing count is unknown.
- Gemini artifacts carry provider-native pass-through keys
  (``promptTokenCount`` …) which this builder deliberately does NOT map; those
  fields project as null until the parser normalizes them (T3). Unknown never
  becomes zero.
- ``provider_cost_usd`` is a provider-REPORTED per-request dollar cost. The
  live parsers emit no such key (no provider returns one), so
  ``provider_reported_cost_microusd`` stays null unless a provider actually
  reported a cost — a fabricated placeholder zero would be indistinguishable
  from a real zero-cost report and would overstate completeness.

Formula v1 (``EXECUTION_COST_FORMULA_VERSION`` = ``line-sum-v1``): each token
line cost is ``tokens * rate_per_million // TOKENS_PER_MILLION`` (integer
floor) and the search line is ``searches * fee_microusd``, computed only when
BOTH usage and rate are known. ``projected_total_cost_microusd`` is non-null
only when EVERY applicable line is known — a line is applicable exactly when
its usage is known. No reader coalesces null to zero.

Status: ``complete`` when the projected total is known; ``partial`` when any
usage field, cost line, or provider-reported cost is known; ``unknown``
otherwise. ``attempt_count`` is provenance (actual persisted provider calls),
never an observation input.
"""

from __future__ import annotations

import math
import uuid
from collections.abc import Iterable, Mapping
from dataclasses import dataclass

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config.costs import (
    MICRO_USD_PER_USD,
    PROJECTION_STATUS_COMPLETE,
    PROJECTION_STATUS_PARTIAL,
    PROJECTION_STATUS_UNKNOWN,
    TOKENS_PER_MILLION,
    RouteIdentity,
    RoutePricing,
    route_pricing_for,
)
from app.models.audit import (
    ExecutionCostProjection,
    ProviderAttempt,
    RawResponseArtifact,
)


def normalize_optional_non_negative_int(value: object) -> int | None:
    """Normalize a JSON usage count: null for absent, non-finite, malformed,
    or negative values; a literal zero stays zero (unknown ≠ zero).
    """

    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value if value >= 0 else None
    if isinstance(value, float):
        if not math.isfinite(value) or value < 0 or not value.is_integer():
            return None
        return int(value)
    if isinstance(value, str):
        try:
            parsed = int(value.strip(), 10)
        except ValueError:
            return None
        return parsed if parsed >= 0 else None
    return None


def normalize_optional_microusd(value: object) -> int | None:
    """Normalize a USD-dollar cost to micro-USD: null for absent, non-finite,
    malformed, or negative values; a literal zero stays zero.
    """

    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        dollars = float(value)
    elif isinstance(value, str):
        try:
            dollars = float(value.strip())
        except ValueError:
            return None
    else:
        return None
    if not math.isfinite(dollars) or dollars < 0:
        return None
    return round(dollars * MICRO_USD_PER_USD)


@dataclass(frozen=True)
class _UsageObservation:
    """Usage fields extracted from an artifact's raw usage payload."""

    uncached_input_tokens: int | None
    cached_input_tokens: int | None
    output_tokens: int | None
    reasoning_tokens: int | None
    total_tokens: int | None
    search_requests: int | None
    provider_reported_cost_microusd: int | None


def _usage_int(usage: Mapping[str, object], *keys: str) -> int | None:
    """First-present-key wins; a present key (even malformed) suppresses the
    remaining fallbacks.
    """

    for key in keys:
        if key in usage:
            return normalize_optional_non_negative_int(usage.get(key))
    return None


def _extract_usage(usage: Mapping[str, object]) -> _UsageObservation:
    uncached = _usage_int(usage, "uncached_input_tokens", "total_input_tokens")
    cached = _usage_int(usage, "cached_input_tokens")
    output = _usage_int(usage, "output_tokens", "total_output_tokens")
    reasoning = _usage_int(usage, "reasoning_tokens")
    search_requests = _usage_int(usage, "search_requests", "web_search_requests")
    total = _usage_int(usage, "total_tokens")
    if total is None:
        # Derived total: exact sum of the known components (never a coerced
        # zero — no components known means the total is unknown too).
        components = [
            value
            for value in (uncached, cached, output, reasoning)
            if value is not None
        ]
        total = sum(components) if components else None
    return _UsageObservation(
        uncached_input_tokens=uncached,
        cached_input_tokens=cached,
        output_tokens=output,
        reasoning_tokens=reasoning,
        total_tokens=total,
        search_requests=search_requests,
        provider_reported_cost_microusd=normalize_optional_microusd(
            usage.get("provider_cost_usd")
        ),
    )


def _token_line_cost(tokens: int | None, rate_per_million: int | None) -> int | None:
    """One token cost line; null unless BOTH usage and rate are known."""

    if tokens is None or rate_per_million is None:
        return None
    return tokens * rate_per_million // TOKENS_PER_MILLION


def _search_line_cost(searches: int | None, fee_microusd: int | None) -> int | None:
    """The search cost line; null unless BOTH count and per-search fee are
    known (the fee is already micro-USD per search — no million divisor).
    """

    if searches is None or fee_microusd is None:
        return None
    return searches * fee_microusd


def _projected_total(
    usage_lines: Iterable[tuple[int | None, int | None]],
) -> int | None:
    """Sum of line costs, non-null only when every APPLICABLE line (usage
    known) also has a known cost. No applicable line at all is NOT a zero
    total — it is unknown.
    """

    applicable_costs: list[int] = []
    for usage_value, line_cost in usage_lines:
        if usage_value is None:
            continue
        if line_cost is None:
            return None
        applicable_costs.append(line_cost)
    if not applicable_costs:
        return None
    return sum(applicable_costs)


def _projection_status(
    projected_total: int | None,
    observation: _UsageObservation,
    line_costs: tuple[int | None, ...],
) -> str:
    if projected_total is not None:
        return PROJECTION_STATUS_COMPLETE
    observed = (
        observation.uncached_input_tokens,
        observation.cached_input_tokens,
        observation.output_tokens,
        observation.reasoning_tokens,
        observation.total_tokens,
        observation.search_requests,
        observation.provider_reported_cost_microusd,
        *line_costs,
    )
    if any(value is not None for value in observed):
        return PROJECTION_STATUS_PARTIAL
    return PROJECTION_STATUS_UNKNOWN


def build_execution_cost_projection(
    artifact: RawResponseArtifact,
    *,
    pricing: RoutePricing,
    formula_version: str,
    attempt_count: int | None,
) -> ExecutionCostProjection:
    """Build one immutable projection row from an artifact's persisted usage.

    Computes only line items for which both usage and rate are known; all
    rates null in PR1 yields a usage-only ``partial`` observation (or
    ``unknown`` when the artifact carries no mappable usage at all).
    """

    observation = _extract_usage(artifact.usage or {})
    line_costs = (
        _token_line_cost(
            observation.uncached_input_tokens,
            pricing.uncached_input_microusd_per_million,
        ),
        _token_line_cost(
            observation.cached_input_tokens,
            pricing.cached_input_microusd_per_million,
        ),
        _token_line_cost(
            observation.output_tokens, pricing.output_microusd_per_million
        ),
        _token_line_cost(
            observation.reasoning_tokens, pricing.reasoning_microusd_per_million
        ),
        _search_line_cost(observation.search_requests, pricing.search_fee_microusd),
    )
    projected_total = _projected_total(
        (
            (observation.uncached_input_tokens, line_costs[0]),
            (observation.cached_input_tokens, line_costs[1]),
            (observation.output_tokens, line_costs[2]),
            (observation.reasoning_tokens, line_costs[3]),
            (observation.search_requests, line_costs[4]),
        )
    )
    return ExecutionCostProjection(
        audit_id=artifact.audit_id,
        task_id=artifact.task_id,
        raw_response_artifact_id=artifact.id,
        formula_version=formula_version,
        pricing_version=pricing.pricing_version,
        projection_status=_projection_status(projected_total, observation, line_costs),
        uncached_input_tokens=observation.uncached_input_tokens,
        cached_input_tokens=observation.cached_input_tokens,
        output_tokens=observation.output_tokens,
        reasoning_tokens=observation.reasoning_tokens,
        total_tokens=observation.total_tokens,
        search_requests=observation.search_requests,
        attempt_count=attempt_count,
        uncached_input_cost_microusd=line_costs[0],
        cached_input_cost_microusd=line_costs[1],
        output_cost_microusd=line_costs[2],
        reasoning_cost_microusd=line_costs[3],
        search_cost_microusd=line_costs[4],
        provider_reported_cost_microusd=observation.provider_reported_cost_microusd,
        projected_total_cost_microusd=projected_total,
    )


async def append_repricing(
    session: AsyncSession,
    *,
    artifact_id: uuid.UUID,
    pricing_version: str,
    formula_version: str,
) -> ExecutionCostProjection | None:
    """Append one re-priced projection for an immutable artifact.

    Locks and loads the source artifact (SELECT … FOR UPDATE), then inserts
    exactly one row per ``(artifact, formula_version, pricing_version)`` —
    the composite identity is also DB-enforced, so a concurrent duplicate
    insert fails rather than updating. Returns the EXISTING row when that
    identity is already projected (append-only retry, never an update), and
    None when the artifact or the requested pricing version does not exist.
    """

    artifact = await session.scalar(
        select(RawResponseArtifact)
        .where(RawResponseArtifact.id == artifact_id)
        .with_for_update()
    )
    if artifact is None:
        return None
    existing = await session.scalar(
        select(ExecutionCostProjection).where(
            ExecutionCostProjection.raw_response_artifact_id == artifact_id,
            ExecutionCostProjection.formula_version == formula_version,
            ExecutionCostProjection.pricing_version == pricing_version,
        )
    )
    if existing is not None:
        return existing
    pricing = route_pricing_for(
        RouteIdentity(
            logical_engine=artifact.logical_engine,
            transport_provider=artifact.transport_provider,
            transport_model=artifact.transport_model,
        ),
        pricing_version,
    )
    if pricing is None:
        return None
    attempt_count = await session.scalar(
        select(func.count())
        .select_from(ProviderAttempt)
        .where(ProviderAttempt.task_id == artifact.task_id)
    )
    projection = build_execution_cost_projection(
        artifact,
        pricing=pricing,
        formula_version=formula_version,
        attempt_count=attempt_count,
    )
    session.add(projection)
    await session.flush()
    return projection
