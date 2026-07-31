"""Execution-cost projection: normalizers, formula arithmetic, statuses, and
the expected-cost catalogues.

Pinned semantics (see ``app/domain/audits/cost_projection.py`` docstring):
unknown never becomes zero; granular usage keys beat legacy totals;
cached/reasoning have no fallback; the projected total is non-null only when
every applicable line is known.
"""

from __future__ import annotations

import uuid

import pytest

from app.core.config.audits import MEASUREMENT_MODE_BENCHMARK, MEASUREMENT_MODE_PULSE
from app.core.config.costs import (
    APPROVED_ROUTE_IDENTITIES,
    EXECUTION_COST_FORMULA_VERSION,
    MICRO_USD_PER_USD,
    PRICING_CATALOG_VERSION,
    PROJECTION_STATUS_COMPLETE,
    PROJECTION_STATUS_PARTIAL,
    PROJECTION_STATUS_UNKNOWN,
    ROUTE_CHATGPT,
    ROUTE_CLAUDE,
    ROUTE_GEMINI,
    RouteIdentity,
    RoutePricing,
    expected_execution_cost,
    pricing_version_known,
    route_pricing_for,
)
from app.domain.audits.cost_projection import (
    build_execution_cost_projection,
    normalize_optional_microusd,
    normalize_optional_non_negative_int,
)
from app.models.audit import RawResponseArtifact

_PRICED = RoutePricing(
    uncached_input_microusd_per_million=1_000_000,
    cached_input_microusd_per_million=100_000,
    output_microusd_per_million=4_000_000,
    reasoning_microusd_per_million=6_000_000,
    search_fee_microusd=35_000,
    currency="USD",
    effective_date="2026-01-01",
    pricing_version="test-priced-v1",
)
_UNPRICED = RoutePricing(
    uncached_input_microusd_per_million=None,
    cached_input_microusd_per_million=None,
    output_microusd_per_million=None,
    reasoning_microusd_per_million=None,
    search_fee_microusd=None,
    currency="USD",
    effective_date="",
    pricing_version="test-unpriced-v1",
)


def _artifact(usage: dict | None) -> RawResponseArtifact:
    return RawResponseArtifact(
        id=uuid.uuid4(),
        audit_id=uuid.uuid4(),
        task_id=uuid.uuid4(),
        logical_engine="claude",
        transport_provider="anthropic",
        transport_model="claude-sonnet-4-6",
        answer_text="answer",
        usage=usage,
    )


def _build(usage: dict | None, pricing: RoutePricing = _PRICED, attempts: int = 1):
    return build_execution_cost_projection(
        _artifact(usage),
        pricing=pricing,
        formula_version=EXECUTION_COST_FORMULA_VERSION,
        attempt_count=attempts,
    )


# --- Normalizers -----------------------------------------------------------


def test_int_normalizer_null_for_absent_malformed_negative_non_finite() -> None:
    assert normalize_optional_non_negative_int(None) is None
    assert normalize_optional_non_negative_int(True) is None
    assert normalize_optional_non_negative_int("abc") is None
    assert normalize_optional_non_negative_int("") is None
    assert normalize_optional_non_negative_int("1.5") is None
    assert normalize_optional_non_negative_int(1.5) is None
    assert normalize_optional_non_negative_int(-1) is None
    assert normalize_optional_non_negative_int("-3") is None
    assert normalize_optional_non_negative_int(float("inf")) is None
    assert normalize_optional_non_negative_int(float("nan")) is None
    assert normalize_optional_non_negative_int(object()) is None


def test_microusd_normalizer_null_for_absent_malformed_negative_non_finite() -> None:
    assert normalize_optional_microusd(None) is None
    assert normalize_optional_microusd(False) is None
    assert normalize_optional_microusd("abc") is None
    assert normalize_optional_microusd("") is None
    assert normalize_optional_microusd(-1) is None
    assert normalize_optional_microusd("-0.01") is None
    assert normalize_optional_microusd(float("inf")) is None
    assert normalize_optional_microusd(float("nan")) is None
    assert normalize_optional_microusd(object()) is None


def test_normalizers_preserve_literal_zero() -> None:
    assert normalize_optional_non_negative_int(0) == 0
    assert normalize_optional_non_negative_int("0") == 0
    assert normalize_optional_non_negative_int(0.0) == 0
    assert normalize_optional_microusd(0) == 0
    assert normalize_optional_microusd(0.0) == 0
    assert normalize_optional_microusd("0.00") == 0


def test_normalizers_convert_valid_values() -> None:
    assert normalize_optional_non_negative_int(10) == 10
    assert normalize_optional_non_negative_int("10") == 10
    assert normalize_optional_non_negative_int(10.0) == 10
    assert normalize_optional_microusd(1) == 1_000_000
    assert normalize_optional_microusd(0.25) == 250_000
    assert normalize_optional_microusd("0.25") == 250_000


# --- Formula arithmetic + statuses -----------------------------------------


def test_full_formula_arithmetic_is_complete() -> None:
    projection = _build(
        {
            "uncached_input_tokens": 1_000,
            "cached_input_tokens": 2_000,
            "output_tokens": 500,
            "reasoning_tokens": 100,
            "search_requests": 3,
            "total_tokens": 3_600,
        }
    )
    # tokens * rate_per_million // 1_000_000; search = count * per-search fee.
    assert projection.uncached_input_cost_microusd == 1_000
    assert projection.cached_input_cost_microusd == 200
    assert projection.output_cost_microusd == 2_000
    assert projection.reasoning_cost_microusd == 600
    assert projection.search_cost_microusd == 105_000
    assert projection.projected_total_cost_microusd == 108_800
    assert projection.projection_status == PROJECTION_STATUS_COMPLETE
    assert projection.total_tokens == 3_600
    assert projection.attempt_count == 1


def test_line_cost_uses_integer_floor() -> None:
    projection = _build({"cached_input_tokens": 9})
    # 9 tokens * 100_000 micro-USD per million = 900_000 // 1_000_000 = 0: a
    # KNOWN zero from real arithmetic, not an unknown coerced to zero.
    assert projection.cached_input_cost_microusd == 0
    assert projection.projected_total_cost_microusd == 0
    assert projection.projection_status == PROJECTION_STATUS_COMPLETE


def test_null_rates_yield_usage_only_partial() -> None:
    projection = _build(
        {"uncached_input_tokens": 1_000, "output_tokens": 500}, _UNPRICED
    )
    assert projection.uncached_input_tokens == 1_000
    assert projection.output_tokens == 500
    assert projection.total_tokens == 1_500
    assert projection.uncached_input_cost_microusd is None
    assert projection.output_cost_microusd is None
    assert projection.projected_total_cost_microusd is None
    assert projection.provider_reported_cost_microusd is None
    assert projection.projection_status == PROJECTION_STATUS_PARTIAL
    assert projection.pricing_version == "test-unpriced-v1"


def test_total_covers_applicable_lines_only() -> None:
    # cached/reasoning usage unknown -> those lines are not applicable and do
    # not block the total.
    projection = _build({"uncached_input_tokens": 1_000, "output_tokens": 500})
    assert projection.projected_total_cost_microusd == 3_000
    assert projection.projection_status == PROJECTION_STATUS_COMPLETE


def test_known_usage_with_unknown_rate_blocks_total() -> None:
    pricing = RoutePricing(
        uncached_input_microusd_per_million=1_000_000,
        cached_input_microusd_per_million=None,
        output_microusd_per_million=None,
        reasoning_microusd_per_million=None,
        search_fee_microusd=None,
        currency="USD",
        effective_date="2026-01-01",
        pricing_version="test-priced-v2",
    )
    projection = _build({"uncached_input_tokens": 1_000, "output_tokens": 500}, pricing)
    assert projection.uncached_input_cost_microusd == 1_000
    assert projection.output_cost_microusd is None
    assert projection.projected_total_cost_microusd is None
    assert projection.projection_status == PROJECTION_STATUS_PARTIAL


def test_unknown_status_when_nothing_is_known() -> None:
    for pricing in (_PRICED, _UNPRICED):
        projection = _build({}, pricing)
        assert projection.projection_status == PROJECTION_STATUS_UNKNOWN
        assert projection.projected_total_cost_microusd is None
        assert projection.total_tokens is None
    assert _build(None, _PRICED).projection_status == PROJECTION_STATUS_UNKNOWN


# --- Usage-key mapping ------------------------------------------------------


def test_legacy_total_keys_map_to_uncached_input_and_output() -> None:
    projection = _build(
        {"total_input_tokens": 1_000, "total_output_tokens": 500, "total_tokens": 1_500}
    )
    assert projection.uncached_input_tokens == 1_000
    assert projection.output_tokens == 500
    assert projection.total_tokens == 1_500
    # No cache/reasoning split reported -> unknown, never zero.
    assert projection.cached_input_tokens is None
    assert projection.reasoning_tokens is None


def test_granular_keys_take_precedence_over_legacy_totals() -> None:
    projection = _build(
        {
            "uncached_input_tokens": 700,
            "cached_input_tokens": 300,
            "total_input_tokens": 1_000,
            "output_tokens": 400,
            "total_output_tokens": 500,
        }
    )
    assert projection.uncached_input_tokens == 700
    assert projection.cached_input_tokens == 300
    assert projection.output_tokens == 400


def test_present_but_malformed_granular_key_suppresses_fallback() -> None:
    projection = _build({"uncached_input_tokens": None, "total_input_tokens": 1_000})
    assert projection.uncached_input_tokens is None


def test_derived_total_sums_known_components() -> None:
    projection = _build({"uncached_input_tokens": 1_000, "output_tokens": 500})
    assert projection.total_tokens == 1_500
    assert _build({}).total_tokens is None


def test_search_requests_falls_back_to_web_search_requests() -> None:
    assert _build({"web_search_requests": 2}).search_requests == 2
    both = _build({"search_requests": 1, "web_search_requests": 2})
    assert both.search_requests == 1
    # Never inferred from anything else: absent means unknown.
    assert _build({}).search_requests is None


def test_gemini_native_keys_are_not_mapped() -> None:
    # Gemini artifacts carry provider-native pass-through keys until the T3
    # parser normalization; they project as unknown, never zero.
    projection = _build({"promptTokenCount": 1_000, "candidatesTokenCount": 500})
    assert projection.uncached_input_tokens is None
    assert projection.output_tokens is None
    assert projection.projection_status == PROJECTION_STATUS_UNKNOWN


def test_provider_reported_cost_absent_stays_null() -> None:
    assert _build({}, _PRICED).provider_reported_cost_microusd is None
    reported = _build({"provider_cost_usd": 0.25})
    assert reported.provider_reported_cost_microusd == 250_000
    # A literal zero is a real provider report and stays zero.
    assert _build({"provider_cost_usd": 0.0}).provider_reported_cost_microusd == 0


def test_provider_reported_does_not_count_toward_projected_total() -> None:
    projection = _build({"provider_cost_usd": 0.25}, _UNPRICED)
    assert projection.provider_reported_cost_microusd == 250_000
    assert projection.projected_total_cost_microusd is None
    assert projection.projection_status == PROJECTION_STATUS_PARTIAL


def test_attempt_count_is_provenance_not_an_observation() -> None:
    projection = _build({}, _UNPRICED, attempts=3)
    assert projection.attempt_count == 3
    assert projection.projection_status == PROJECTION_STATUS_UNKNOWN


def test_provenance_columns_echo_the_artifact() -> None:
    artifact = _artifact({"total_input_tokens": 10})
    projection = build_execution_cost_projection(
        artifact,
        pricing=_UNPRICED,
        formula_version=EXECUTION_COST_FORMULA_VERSION,
        attempt_count=1,
    )
    assert projection.audit_id == artifact.audit_id
    assert projection.task_id == artifact.task_id
    assert projection.raw_response_artifact_id == artifact.id
    assert projection.formula_version == EXECUTION_COST_FORMULA_VERSION


# --- Pricing catalogue ------------------------------------------------------


def test_approved_route_identities_match_the_provider_catalog_contract() -> None:
    assert ROUTE_CHATGPT == RouteIdentity("chatgpt", "openai", "gpt-5.4")
    assert ROUTE_CLAUDE == RouteIdentity("claude", "anthropic", "claude-sonnet-4-6")
    assert ROUTE_GEMINI == RouteIdentity("gemini", "google", "gemini-flash-latest")
    assert len(APPROVED_ROUTE_IDENTITIES) == 3


def test_current_catalog_covers_approved_routes_with_null_rates() -> None:
    for route in APPROVED_ROUTE_IDENTITIES:
        pricing = route_pricing_for(route, PRICING_CATALOG_VERSION)
        assert pricing is not None
        assert pricing.pricing_version == PRICING_CATALOG_VERSION
        assert pricing.currency == "USD"
        assert pricing.effective_date == ""
        assert pricing.uncached_input_microusd_per_million is None
        assert pricing.cached_input_microusd_per_million is None
        assert pricing.output_microusd_per_million is None
        assert pricing.reasoning_microusd_per_million is None
        assert pricing.search_fee_microusd is None


def test_route_pricing_unknown_version_returns_none() -> None:
    assert route_pricing_for(ROUTE_CLAUDE, "no-such-version") is None
    assert not pricing_version_known("no-such-version")
    assert pricing_version_known(PRICING_CATALOG_VERSION)


def test_route_pricing_unknown_route_gets_unverified_card() -> None:
    pricing = route_pricing_for(RouteIdentity("x", "y", "z"), PRICING_CATALOG_VERSION)
    assert pricing is not None
    assert pricing.pricing_version == PRICING_CATALOG_VERSION
    assert pricing.uncached_input_microusd_per_million is None


# --- Expected execution cost (funded-admission estimate) --------------------


@pytest.mark.parametrize(
    ("route", "mode", "retrieval", "token", "fee", "searches", "complete"),
    [
        # Frozen Anthropic estimates only.
        (ROUTE_CLAUDE, MEASUREMENT_MODE_PULSE, False, 2_890, None, None, True),
        (ROUTE_CLAUDE, MEASUREMENT_MODE_PULSE, True, 2_890, None, None, False),
        (ROUTE_CLAUDE, MEASUREMENT_MODE_BENCHMARK, False, 146_600, None, None, True),
        (ROUTE_CLAUDE, MEASUREMENT_MODE_BENCHMARK, True, 146_600, None, 3, False),
        # OpenAI/Google token estimates stay unverified -> always incomplete.
        (ROUTE_CHATGPT, MEASUREMENT_MODE_PULSE, False, None, None, None, False),
        (ROUTE_CHATGPT, MEASUREMENT_MODE_PULSE, True, None, None, None, False),
        (ROUTE_CHATGPT, MEASUREMENT_MODE_BENCHMARK, False, None, None, None, False),
        (ROUTE_CHATGPT, MEASUREMENT_MODE_BENCHMARK, True, None, None, None, False),
        (ROUTE_GEMINI, MEASUREMENT_MODE_PULSE, False, None, None, None, False),
        (ROUTE_GEMINI, MEASUREMENT_MODE_PULSE, True, None, None, None, False),
        (ROUTE_GEMINI, MEASUREMENT_MODE_BENCHMARK, False, None, None, None, False),
        (ROUTE_GEMINI, MEASUREMENT_MODE_BENCHMARK, True, None, None, None, False),
        # Unknown mode -> no estimate -> incomplete.
        (ROUTE_CLAUDE, "nightly", False, None, None, None, False),
        (ROUTE_CLAUDE, "nightly", True, None, None, None, False),
    ],
)
def test_expected_execution_cost_matrix(
    route: RouteIdentity,
    mode: str,
    retrieval: bool,
    token: int | None,
    fee: int | None,
    searches: int | None,
    complete: bool,
) -> None:
    expected = expected_execution_cost(route, mode, retrieval)
    assert expected.token_cost_microusd == token
    assert expected.search_fee_microusd == fee
    assert expected.expected_searches == searches
    assert expected.complete is complete


def test_expected_cost_retrieval_off_never_invents_search_fields() -> None:
    # The catalogue freezes benchmark searches at 3, but with retrieval
    # disabled the search fields are not applicable: they stay null — neither
    # the catalogue value nor a fabricated zero leaks through.
    expected = expected_execution_cost(
        ROUTE_CLAUDE, MEASUREMENT_MODE_BENCHMARK, retrieval_enabled=False
    )
    assert expected.expected_searches is None
    assert expected.search_fee_microusd is None
    assert expected.complete is True


def test_monthly_budget_conversion_uses_the_shared_constant() -> None:
    # Funded admission (Part B) compares like units: minor-USD (cents) budgets
    # convert to micro-USD exclusively through MICRO_USD_PER_USD.
    funded_monthly_budget_minor = 50_000
    budget_microusd = funded_monthly_budget_minor * MICRO_USD_PER_USD // 100
    assert budget_microusd == 500_000_000
