"""Binary scoring for the persisted Site Health public checklist."""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from dataclasses import dataclass

from app.analysis.site_health.rules import RuleEvaluation
from app.core.config.site_health_contracts import (
    AEO_READINESS_DIMENSION_DESCRIPTIONS,
    AEO_READINESS_DIMENSION_LABELS,
    AEO_READINESS_DIMENSIONS,
    RULE_ID_TECHNICAL_INDEXABLE,
    RULE_OUTCOME_NOT_APPLICABLE,
    RULE_OUTCOME_SATISFIED,
    SCORING_VERSION,
)
from app.core.config.site_health_measurement import (
    DIMENSION_APPLICABLE,
    DIMENSION_NOT_APPLICABLE,
    MEASUREMENT_STATE_LIMITED,
    MEASUREMENT_STATE_MEASURED,
    MEASUREMENT_STATE_NOT_MEASURED,
    READINESS_DIMENSION_WEIGHTS,
    SUPPORTED_AEO_CHECKS_BY_PAGE_KIND,
)
from app.core.config.site_health_rule_types import (
    RULE_SCOPE_PAGE,
    SCORE_ROLE_AEO,
    SCORE_ROLE_WEB_FUNDAMENTALS,
)
from app.core.config.site_health_taxonomy import PAGE_KIND_OTHER, PAGE_KINDS

_DETERMINATE = frozenset({RULE_OUTCOME_SATISFIED, "missing"})


@dataclass(frozen=True)
class DimensionMeasurement:
    key: str
    applicability: str
    measurement_state: str
    score: float | None
    coverage: float | None
    earned_points: float
    determinate_points: float
    expected_points: float
    determinate_checkpoint_ids: tuple[str, ...]
    reason: str = ""

    def to_dict(self) -> dict:
        return {
            "key": self.key,
            "label": AEO_READINESS_DIMENSION_LABELS[self.key],
            "description": AEO_READINESS_DIMENSION_DESCRIPTIONS[self.key],
            "dimension_applicability": self.applicability,
            "dimension_measurement_state": self.measurement_state,
            "score": self.score,
            "coverage": self.coverage,
            "earned_points": self.earned_points,
            "determinate_points": self.determinate_points,
            "expected_points": self.expected_points,
            "determinate_checkpoint_ids": list(self.determinate_checkpoint_ids),
            "reason": self.reason,
        }


@dataclass(frozen=True)
class AnalysisScores:
    web_fundamentals_score: float | None
    web_fundamentals_coverage: float | None
    web_fundamentals_state: str
    technical_earned_weight: float
    technical_determinate_weight: float
    technical_expected_weight: float
    technical_critical_complete: bool
    aeo_readiness_score: float | None
    aeo_measurement_coverage: float | None
    aeo_measurement_state: str
    aeo_measurement_reason: str
    expected_checkpoint_profile: tuple[dict, ...]
    readiness_dimensions: tuple[DimensionMeasurement, ...]
    main_content_indexable: bool | None
    scoring_version: str = SCORING_VERSION


@dataclass(frozen=True)
class AnalysisMeasurementInput:
    analysis_id: str
    page_kind: str
    page_traits: tuple[str, ...] = ()
    checklist_manifest: tuple[dict, ...] = ()


@dataclass(frozen=True)
class RuleMeasurementInput:
    analysis_id: str
    page_kind: str
    rule_id: str
    scope: str
    outcome: str
    expected: bool
    score_roles: tuple[str, ...]
    weight: float
    severity: str
    readiness_dimension: str
    readiness_weight: float
    normalized_score: float | None = None
    normalized_coverage: float | None = None


def _applicable(rows: Iterable[RuleEvaluation], role: str) -> list[RuleEvaluation]:
    return [
        row
        for row in rows
        if row.scope == RULE_SCOPE_PAGE
        and role in row.score_roles
        and row.outcome != RULE_OUTCOME_NOT_APPLICABLE
    ]


def _binary_result(
    rows: list[RuleEvaluation],
) -> tuple[float | None, float | None, str, int, int, int]:
    expected = len(rows)
    determinate = sum(row.outcome in _DETERMINATE for row in rows)
    passed = sum(row.outcome == RULE_OUTCOME_SATISFIED for row in rows)
    if expected == 0:
        return None, None, MEASUREMENT_STATE_NOT_MEASURED, passed, determinate, expected
    coverage = determinate / expected
    if determinate != expected:
        return None, coverage, MEASUREMENT_STATE_LIMITED, passed, determinate, expected
    return (
        100.0 * passed / expected,
        1.0,
        MEASUREMENT_STATE_MEASURED,
        passed,
        determinate,
        expected,
    )


def _dimension(key: str, rows: list[RuleEvaluation]) -> DimensionMeasurement:
    applicable = [row for row in rows if row.readiness_dimension == key]
    score, coverage, state, passed, determinate, expected = _binary_result(applicable)
    if not applicable:
        return DimensionMeasurement(
            key,
            DIMENSION_NOT_APPLICABLE,
            MEASUREMENT_STATE_NOT_MEASURED,
            None,
            None,
            0.0,
            0.0,
            0.0,
            (),
            reason="no_applicable_checks",
        )
    return DimensionMeasurement(
        key=key,
        applicability=DIMENSION_APPLICABLE,
        measurement_state=state,
        score=score,
        coverage=coverage,
        earned_points=float(passed),
        determinate_points=float(determinate),
        expected_points=float(expected),
        determinate_checkpoint_ids=tuple(
            row.rule_id for row in applicable if row.outcome in _DETERMINATE
        ),
        reason="" if state == MEASUREMENT_STATE_MEASURED else "unresolved_checks",
    )


def _aeo_result(
    dimensions: tuple[DimensionMeasurement, ...],
) -> tuple[float | None, float | None, str]:
    applicable = [
        row for row in dimensions if row.applicability == DIMENSION_APPLICABLE
    ]
    if not applicable:
        return None, None, MEASUREMENT_STATE_NOT_MEASURED
    expected_weight = sum(READINESS_DIMENSION_WEIGHTS[row.key] for row in applicable)
    completed_weight = sum(
        READINESS_DIMENSION_WEIGHTS[row.key]
        for row in applicable
        if row.measurement_state == MEASUREMENT_STATE_MEASURED
    )
    coverage = completed_weight / expected_weight if expected_weight else None
    if any(row.measurement_state != MEASUREMENT_STATE_MEASURED for row in applicable):
        return None, coverage, MEASUREMENT_STATE_LIMITED
    weighted_score = 0.0
    for row in applicable:
        if row.score is None:
            return None, coverage, MEASUREMENT_STATE_LIMITED
        weighted_score += row.score * READINESS_DIMENSION_WEIGHTS[row.key]
    score = weighted_score / expected_weight
    return score, 1.0, MEASUREMENT_STATE_MEASURED


def _aeo_scores(
    rows: list[RuleEvaluation], effective_kind: str
) -> tuple[float | None, float | None, str, str, tuple[DimensionMeasurement, ...]]:
    supported = effective_kind in SUPPORTED_AEO_CHECKS_BY_PAGE_KIND
    aeo_rows = _applicable(rows, SCORE_ROLE_AEO) if supported else []
    dimensions = tuple(_dimension(key, aeo_rows) for key in AEO_READINESS_DIMENSIONS)
    if supported:
        aeo_score, aeo_coverage, aeo_state = _aeo_result(dimensions)
        aeo_reason = (
            "" if aeo_state == MEASUREMENT_STATE_MEASURED else "unresolved_checks"
        )
    else:
        aeo_score, aeo_coverage, aeo_state = None, None, MEASUREMENT_STATE_NOT_MEASURED
        aeo_reason = (
            "page_purpose_unresolved"
            if effective_kind == PAGE_KIND_OTHER
            else "unsupported_purpose_checklist"
        )
    return aeo_score, aeo_coverage, aeo_state, aeo_reason, dimensions


def _checklist(rows: list[RuleEvaluation]) -> tuple[dict[str, object], ...]:
    return tuple(
        {
            "check_id": row.rule_id,
            "scope": row.scope,
            "web_membership": SCORE_ROLE_WEB_FUNDAMENTALS in row.score_roles,
            "aeo_pillar": row.readiness_dimension or None,
            "applicable": row.outcome != RULE_OUTCOME_NOT_APPLICABLE,
            "outcome": row.outcome,
            "reason": row.reason_code,
            "weight": 1.0,
            "rule_version": row.rule_version,
        }
        for row in rows
        if row.score_roles
    )


def _main_content_indexable(rows: list[RuleEvaluation]) -> bool | None:
    return next(
        (
            row.outcome == RULE_OUTCOME_SATISFIED
            for row in rows
            if row.rule_id == RULE_ID_TECHNICAL_INDEXABLE
            and row.outcome in _DETERMINATE
        ),
        None,
    )


def score_analysis(
    evaluations: Iterable[RuleEvaluation],
    *,
    page_kind: str = "",
    page_traits: Iterable[str] = (),
    crawl_context: Mapping[str, object] | None = None,
) -> AnalysisScores:
    del page_traits, crawl_context
    rows = list(evaluations)
    effective_kind = page_kind if page_kind in PAGE_KINDS else PAGE_KIND_OTHER
    web_result = _binary_result(_applicable(rows, SCORE_ROLE_WEB_FUNDAMENTALS))
    web_score, web_coverage, web_state, web_passed, web_determinate, web_expected = (
        web_result
    )
    aeo_score, aeo_coverage, aeo_state, aeo_reason, dimensions = _aeo_scores(
        rows, effective_kind
    )
    return AnalysisScores(
        web_score,
        web_coverage,
        web_state,
        float(web_passed),
        float(web_determinate),
        float(web_expected),
        web_determinate == web_expected,
        aeo_score,
        aeo_coverage,
        aeo_state,
        aeo_reason,
        _checklist(rows),
        dimensions,
        _main_content_indexable(rows),
    )
