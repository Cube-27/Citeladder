"""Roll persisted per-page measurements up into one crawl-wide score.

:mod:`app.analysis.site_health.scoring` scores a single analysis from live rule
evaluations; this pass reads the rows those analyses persisted and aggregates
them across every page of a crawl. It imports the shared row shapes and family
machinery from that module, never the reverse.
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass

from app.analysis.site_health.normalized_scoring import normalized_measurement_result
from app.analysis.site_health.scoring import (
    _DETERMINATE,
    AnalysisMeasurementInput,
    RuleMeasurementInput,
    _dimension_measurement,
    _family_result,
    _family_results,
    _FamilyResult,
    _overall_aeo,
)
from app.analysis.site_health.web_fundamentals_scoring import (
    aggregate_web_fundamentals,
    checkpoint_credit,
)
from app.core.config.site_health_contracts import (
    AEO_READINESS_DIMENSIONS,
    SCORING_VERSION,
)
from app.core.config.site_health_measurement import PAGE_KIND_ROLLUP_WEIGHTS
from app.core.config.site_health_rule_types import (
    RULE_SCOPE_PAGE,
    RULE_SCOPE_SITE,
)
from app.core.config.site_health_taxonomy import PAGE_KIND_OTHER


@dataclass(frozen=True)
class _NormalizedRule:
    rule_id: str
    score: float | None
    coverage: float
    score_roles: tuple[str, ...]
    weight: float
    severity: str


@dataclass(frozen=True)
class AggregateMeasurements:
    web_fundamentals_score: float | None
    web_fundamentals_coverage: float | None
    web_fundamentals_state: str
    aeo_readiness_score: float | None
    aeo_measurement_coverage: float | None
    aeo_measurement_state: str
    readiness_dimensions: tuple[dict, ...]
    analyzed_url_count: int
    scoring_version: str = SCORING_VERSION


def _row_credit(row: RuleMeasurementInput) -> float:
    """One row's credit, preferring the rule's own normalized score.

    A rule that publishes ``normalized_score`` has already weighed its own
    atoms (``aeo.company_entity_completeness`` scores four weighted company
    signals), so that value is strictly better evidence than the three-step
    credit its coarse outcome maps to. Rules that publish nothing keep the
    outcome mapping.

    The value is persisted JSON, so it is validated here exactly as the
    whole-rule override validates it: a non-numeric or out-of-range score is
    corrupt evidence and must be rejected, never silently scored.
    """
    score = row.normalized_score
    if score is None:
        return checkpoint_credit(row.outcome)
    if (
        isinstance(score, bool)
        or not isinstance(score, (int, float))
        or not 0.0 <= score <= 1.0
    ):
        raise ValueError(f"Rule {row.rule_id} has an invalid normalized result")
    return float(score)


def _mean_credit(rows: list[RuleMeasurementInput]) -> float | None:
    determinate = [row for row in rows if row.outcome in _DETERMINATE]
    if not determinate:
        return None
    return sum(_row_credit(row) for row in determinate) / len(determinate)


def _page_rule_result(
    rows: list[RuleMeasurementInput],
) -> tuple[float | None, float]:
    by_kind: dict[str, list[RuleMeasurementInput]] = {}
    for row in rows:
        by_kind.setdefault(row.page_kind, []).append(row)
    expected_weight = sum(PAGE_KIND_ROLLUP_WEIGHTS.get(kind, 1.0) for kind in by_kind)
    measured: list[tuple[float, float]] = []
    covered_weight = 0.0
    for kind, kind_rows in by_kind.items():
        kind_weight = PAGE_KIND_ROLLUP_WEIGHTS.get(kind, 1.0)
        determinate = [row for row in kind_rows if row.outcome in _DETERMINATE]
        covered_weight += kind_weight * len(determinate) / len(kind_rows)
        score = _mean_credit(kind_rows)
        if score is not None:
            measured.append((kind_weight, score))
    measured_weight = sum(weight for weight, _ in measured)
    score = (
        None
        if measured_weight <= 0
        else sum(weight * value for weight, value in measured) / measured_weight
    )
    coverage = 0.0 if expected_weight <= 0 else covered_weight / expected_weight
    return score, coverage


def _site_rule_result(
    rows: list[RuleMeasurementInput],
) -> tuple[float | None, float]:
    # A site rule represents one entity. Repeated identical footer/root
    # observations are duplicates, never additional weight.
    determinate_outcomes = {row.outcome for row in rows if row.outcome in _DETERMINATE}
    if not determinate_outcomes:
        return None, 0.0
    if len(determinate_outcomes) > 1:
        return None, 0.0
    return checkpoint_credit(next(iter(determinate_outcomes))), 1.0


def _entity_set_rule_result(
    rows: list[RuleMeasurementInput],
) -> tuple[float | None, float]:
    determinate = [row for row in rows if row.outcome in _DETERMINATE]
    coverage = len(determinate) / len(rows)
    return _mean_credit(rows), coverage


def _rule_result(
    rule_id: str, observations: list[RuleMeasurementInput]
) -> tuple[float | None, float]:
    scopes = {row.scope for row in observations}
    if len(scopes) != 1:
        raise ValueError(f"Rule {rule_id} has inconsistent persisted scopes")
    scope = next(iter(scopes))
    if scope == RULE_SCOPE_PAGE:
        # A page rule measures each page independently, so its rows carry
        # DIFFERENT normalized scores by design and must roll up rather than
        # agree. The whole-rule override below is the site/entity-set contract
        # (one entity, one persisted result); applying it here raised
        # "conflicting normalized results" the moment two pages of the same
        # kind scored differently — two About pages on an apex+`www` site, say
        # — and that exception escaped through the crawl-finalize pass, leaving
        # the crawl permanently `running` with every task already terminal.
        return _page_rule_result(observations)
    override = normalized_measurement_result(rule_id, observations)
    if override is not None:
        return override
    if scope == RULE_SCOPE_SITE:
        return _site_rule_result(observations)
    return _entity_set_rule_result(observations)


def _normalized_rule(
    rule_id: str, observations: list[RuleMeasurementInput]
) -> _NormalizedRule:
    score, coverage = _rule_result(rule_id, observations)
    first = observations[0]
    return _NormalizedRule(
        rule_id=rule_id,
        score=score,
        coverage=coverage,
        score_roles=tuple(
            sorted({role for row in observations for role in row.score_roles})
        ),
        weight=max(0.0, *(row.weight for row in observations)),
        severity=first.severity,
    )


def _normalize_rules(rows: list[RuleMeasurementInput]) -> list[_NormalizedRule]:
    grouped: dict[str, list[RuleMeasurementInput]] = {}
    for row in rows:
        if row.expected and row.score_roles:
            grouped.setdefault(row.rule_id, []).append(row)
    return [
        _normalized_rule(rule_id, observations)
        for rule_id, observations in grouped.items()
    ]


def _aggregate_checkpoint_ids(results: Iterable[_FamilyResult]) -> tuple[str, ...]:
    return tuple(
        sorted(
            {
                checkpoint_id
                for result in results
                for checkpoint_id in result.determinate_checkpoint_ids
            }
        )
    )


def _kind_family_contribution(
    kind: str, results: list[_FamilyResult]
) -> tuple[float, float]:
    kind_weight = PAGE_KIND_ROLLUP_WEIGHTS.get(kind, 1.0)
    expected = sum(result.expected_points for result in results)
    determinate = sum(result.determinate_points for result in results)
    earned = sum(result.earned_points for result in results)
    coverage = 0.0 if expected <= 0 else determinate / expected
    score = 0.0 if determinate <= 0 else earned / determinate
    return kind_weight * coverage, kind_weight * coverage * score


def _page_family_aggregate(
    results: list[tuple[AnalysisMeasurementInput, _FamilyResult]],
) -> _FamilyResult:
    first = results[0][1]
    by_kind: dict[str, list[_FamilyResult]] = {}
    for analysis, result in results:
        by_kind.setdefault(analysis.page_kind, []).append(result)
    expected_kind_weight = sum(
        PAGE_KIND_ROLLUP_WEIGHTS.get(kind, 1.0) for kind in by_kind
    )
    contributions = [
        _kind_family_contribution(kind, kind_results)
        for kind, kind_results in by_kind.items()
    ]
    covered_kind_weight = sum(covered for covered, _earned in contributions)
    earned_kind_weight = sum(earned for _covered, earned in contributions)
    coverage = (
        0.0 if expected_kind_weight <= 0 else covered_kind_weight / expected_kind_weight
    )
    score = (
        None if covered_kind_weight <= 0 else earned_kind_weight / covered_kind_weight
    )
    determinate_points = first.budget * coverage
    return _FamilyResult(
        family_id=first.family_id,
        dimension_id=first.dimension_id,
        budget=first.budget,
        scope=first.scope,
        score=score,
        coverage=coverage,
        earned_points=(0.0 if score is None else score * determinate_points),
        determinate_points=determinate_points,
        expected_points=first.budget,
        determinate_checkpoint_ids=_aggregate_checkpoint_ids(
            result for _analysis, result in results
        ),
    )


def _aggregate_site_families(
    analyses: list[AnalysisMeasurementInput],
    rows: list[RuleMeasurementInput],
) -> tuple[_FamilyResult, ...]:
    results: list[_FamilyResult] = []
    seen: set[str] = set()
    for analysis in analyses:
        if analysis.page_kind == PAGE_KIND_OTHER:
            continue
        for artifact in analysis.expected_family_profile:
            family_id = str(artifact.get("family_id") or "")
            if artifact.get("scope") != RULE_SCOPE_SITE or family_id in seen:
                continue
            enabled = dict(artifact)
            enabled["evaluation_scope"] = True
            result = _family_result(enabled, rows)
            if result is not None:
                results.append(result)
                seen.add(family_id)
    return tuple(results)


def _aggregate_families(
    analyses: list[AnalysisMeasurementInput],
    rows: list[RuleMeasurementInput],
) -> tuple[_FamilyResult, ...]:
    if len({analysis.analysis_id for analysis in analyses}) != len(analyses):
        raise ValueError("Duplicate analysis measurement input")
    rows_by_analysis: dict[str, list[RuleMeasurementInput]] = {}
    for row in rows:
        rows_by_analysis.setdefault(row.analysis_id, []).append(row)
    grouped: dict[str, list[tuple[AnalysisMeasurementInput, _FamilyResult]]] = {}
    for analysis in analyses:
        if analysis.page_kind == PAGE_KIND_OTHER:
            continue
        results = _family_results(
            analysis.expected_family_profile,
            rows_by_analysis.get(analysis.analysis_id, []),
        )
        for result in results:
            if result.scope == RULE_SCOPE_PAGE:
                grouped.setdefault(result.family_id, []).append((analysis, result))
    aggregate = [
        _page_family_aggregate(family_results) for family_results in grouped.values()
    ]
    aggregate.extend(_aggregate_site_families(analyses, rows))
    return tuple(aggregate)


def aggregate_measurements(
    inputs: Iterable[AnalysisMeasurementInput],
    rule_inputs: Iterable[RuleMeasurementInput],
) -> AggregateMeasurements:
    rows = list(inputs)
    persisted_rules = list(rule_inputs)
    rules = _normalize_rules(persisted_rules)
    families = _aggregate_families(rows, persisted_rules)
    dimensions = tuple(
        _dimension_measurement(key, families=families)
        for key in AEO_READINESS_DIMENSIONS
    )
    web_fundamentals_score, web_fundamentals_coverage, web_fundamentals_state = (
        aggregate_web_fundamentals(rules)
    )
    aeo_score, aeo_coverage, aeo_state = _overall_aeo(dimensions)
    return AggregateMeasurements(
        web_fundamentals_score=web_fundamentals_score,
        web_fundamentals_coverage=web_fundamentals_coverage,
        web_fundamentals_state=web_fundamentals_state,
        aeo_readiness_score=aeo_score,
        aeo_measurement_coverage=aeo_coverage,
        aeo_measurement_state=aeo_state,
        readiness_dimensions=tuple(item.to_dict() for item in dimensions),
        analyzed_url_count=len(rows),
    )
