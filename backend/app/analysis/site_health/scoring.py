"""Binary scoring for the persisted Site Health public checklist."""

from __future__ import annotations

from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from typing import Protocol

from app.analysis.site_health.rules import RuleEvaluation
from app.core.config.site_health_contracts import (
    AEO_READINESS_DIMENSION_DESCRIPTIONS,
    AEO_READINESS_DIMENSION_LABELS,
    AEO_READINESS_DIMENSIONS,
    RULE_ID_TECHNICAL_INDEXABLE,
    RULE_OUTCOME_NOT_APPLICABLE,
    RULE_OUTCOME_SATISFIED,
    RULE_OUTCOME_UNKNOWN,
    SCORING_VERSION,
)
from app.core.config.site_health_measurement import (
    DIMENSION_APPLICABLE,
    DIMENSION_NOT_APPLICABLE,
    MEASUREMENT_STATE_LIMITED,
    MEASUREMENT_STATE_MEASURED,
    MEASUREMENT_STATE_NOT_MEASURED,
    READINESS_DIMENSION_WEIGHTS,
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
    #: Applicable checks that produced no determinate verdict. Reported so a
    #: coverage shortfall is stated as a number of checks rather than as a
    #: withheld score.
    unresolved_count: int = 0

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
            "unresolved_count": self.unresolved_count,
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


class _ScoredCheck(Protocol):
    """Fields shared by analyzer evaluations and persisted measurement inputs."""

    @property
    def rule_id(self) -> str: ...

    @property
    def scope(self) -> str: ...

    @property
    def outcome(self) -> str: ...

    @property
    def score_roles(self) -> tuple[str, ...]: ...

    @property
    def readiness_dimension(self) -> str: ...


def applicable_checks(rows: Iterable[_ScoredCheck], role: str) -> list[_ScoredCheck]:
    """Select one applicable page check per rule ID; conflicts remain unknown."""
    by_id: dict[str, _ScoredCheck] = {}
    conflicted: set[str] = set()
    for row in rows:
        if (
            row.scope != RULE_SCOPE_PAGE
            or role not in row.score_roles
            or row.outcome == RULE_OUTCOME_NOT_APPLICABLE
        ):
            continue
        seen = by_id.get(row.rule_id)
        if seen is None:
            by_id[row.rule_id] = row
        elif seen.outcome != row.outcome:
            conflicted.add(row.rule_id)
    return [
        _Conflicted(row) if rule_id in conflicted else row
        for rule_id, row in by_id.items()
    ]


@dataclass(frozen=True)
class _Conflicted:
    """A duplicate check with conflicting outcomes, treated as unknown."""

    row: _ScoredCheck

    @property
    def rule_id(self) -> str:
        return self.row.rule_id

    @property
    def scope(self) -> str:
        return self.row.scope

    @property
    def outcome(self) -> str:
        return RULE_OUTCOME_UNKNOWN

    @property
    def score_roles(self) -> tuple[str, ...]:
        return self.row.score_roles

    @property
    def readiness_dimension(self) -> str:
        return self.row.readiness_dimension


def measurement_state(*, determinate: int, expected: int) -> str:
    """Classify measurement completeness independently of its score."""
    if expected == 0 or determinate == 0:
        return MEASUREMENT_STATE_NOT_MEASURED
    return (
        MEASUREMENT_STATE_MEASURED
        if determinate == expected
        else MEASUREMENT_STATE_LIMITED
    )


def role_result(
    rows: Sequence[_ScoredCheck],
) -> tuple[float | None, float | None, str, int, int, int]:
    """Score resolved checks and retain all applicable checks in coverage."""
    expected = len(rows)
    determinate = sum(row.outcome in _DETERMINATE for row in rows)
    passed = sum(row.outcome == RULE_OUTCOME_SATISFIED for row in rows)
    state = measurement_state(determinate=determinate, expected=expected)
    if expected == 0 or determinate == 0:
        return (
            None,
            None if expected == 0 else 0.0,
            state,
            passed,
            determinate,
            expected,
        )
    return (
        100.0 * passed / determinate,
        determinate / expected,
        state,
        passed,
        determinate,
        expected,
    )


def pillar_measurement(key: str, rows: Sequence[_ScoredCheck]) -> DimensionMeasurement:
    applicable = [row for row in rows if row.readiness_dimension == key]
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
    score, coverage, state, passed, determinate, expected = role_result(applicable)
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
        unresolved_count=expected - determinate,
    )


def weighted_aeo_result(
    dimensions: tuple[DimensionMeasurement, ...],
) -> tuple[float | None, float | None, str]:
    """Weight scored pillars; report incomplete checks separately in coverage."""
    applicable_weight = scored_weight = weighted_score = weighted_coverage = 0.0
    state = MEASUREMENT_STATE_MEASURED
    for row in dimensions:
        if row.applicability != DIMENSION_APPLICABLE:
            continue
        weight = READINESS_DIMENSION_WEIGHTS[row.key]
        applicable_weight += weight
        weighted_coverage += (row.coverage or 0.0) * weight
        if row.measurement_state != MEASUREMENT_STATE_MEASURED:
            state = MEASUREMENT_STATE_LIMITED
        if row.score is not None:
            scored_weight += weight
            weighted_score += row.score * weight
    coverage = weighted_coverage / applicable_weight if applicable_weight else None
    if not scored_weight:
        return None, coverage, MEASUREMENT_STATE_NOT_MEASURED
    return weighted_score / scored_weight, coverage, state


def _aeo_scores(
    rows: Sequence[_ScoredCheck], effective_kind: str
) -> tuple[float | None, float | None, str, str, tuple[DimensionMeasurement, ...]]:
    """Score applicable readiness evidence independently of page kind."""
    aeo_rows = applicable_checks(rows, SCORE_ROLE_AEO)
    dimensions = tuple(
        pillar_measurement(key, aeo_rows) for key in AEO_READINESS_DIMENSIONS
    )
    aeo_score, aeo_coverage, aeo_state = weighted_aeo_result(dimensions)
    return (
        aeo_score,
        aeo_coverage,
        aeo_state,
        readiness_reason(
            score=aeo_score,
            state=aeo_state,
            has_applicable_pillar=any(
                row.applicability == DIMENSION_APPLICABLE for row in dimensions
            ),
            effective_kind=effective_kind,
        ),
        dimensions,
    )


def readiness_reason(
    *,
    score: float | None,
    state: str,
    has_applicable_pillar: bool,
    effective_kind: str,
) -> str:
    """Distinguish unresolved evidence, unresolved purpose and absent checks."""
    if score is not None:
        return "" if state == MEASUREMENT_STATE_MEASURED else "unresolved_checks"
    if has_applicable_pillar:
        return "unresolved_checks"
    if effective_kind == PAGE_KIND_OTHER:
        return "page_purpose_unresolved"
    return "no_applicable_checks"


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
    web_result = role_result(applicable_checks(rows, SCORE_ROLE_WEB_FUNDAMENTALS))
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
