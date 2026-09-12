"""Equal-page aggregation for finalized Site Health checklist results."""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass

from app.analysis.site_health.scoring import (
    AnalysisMeasurementInput,
    RuleMeasurementInput,
)
from app.core.config.site_health_contracts import (
    AEO_READINESS_DIMENSIONS,
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
    SCORE_ROLE_AEO,
    SCORE_ROLE_WEB_FUNDAMENTALS,
)

_DETERMINATE = frozenset({"satisfied", "missing"})


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


def _deduplicated(
    rows: list[RuleMeasurementInput],
) -> list[RuleMeasurementInput] | None:
    by_id: dict[str, RuleMeasurementInput] = {}
    for row in rows:
        previous = by_id.get(row.rule_id)
        if previous is not None and previous.outcome != row.outcome:
            return None
        by_id.setdefault(row.rule_id, row)
    return list(by_id.values())


def _page_score(rows: list[RuleMeasurementInput], role: str) -> float | None:
    candidates = [row for row in rows if row.expected and role in row.score_roles]
    unique = _deduplicated(candidates)
    if not unique or any(row.outcome not in _DETERMINATE for row in unique):
        return None
    return 100.0 * sum(row.outcome == "satisfied" for row in unique) / len(unique)


def _page_aeo(rows: list[RuleMeasurementInput], page_kind: str) -> float | None:
    if page_kind not in SUPPORTED_AEO_CHECKS_BY_PAGE_KIND:
        return None
    by_pillar: dict[str, list[RuleMeasurementInput]] = {}
    for row in rows:
        if (
            row.expected
            and SCORE_ROLE_AEO in row.score_roles
            and row.readiness_dimension
        ):
            by_pillar.setdefault(row.readiness_dimension, []).append(row)
    if not by_pillar:
        return None
    scores: dict[str, float] = {}
    for pillar, pillar_rows in by_pillar.items():
        score = _page_score(pillar_rows, SCORE_ROLE_AEO)
        if score is None:
            return None
        scores[pillar] = score
    denominator = sum(READINESS_DIMENSION_WEIGHTS[key] for key in scores)
    return (
        sum(scores[key] * READINESS_DIMENSION_WEIGHTS[key] for key in scores)
        / denominator
    )


def _mean(values: list[float]) -> float | None:
    return None if not values else sum(values) / len(values)


def _state(*, scored: int, expected: int) -> str:
    if expected == 0 or scored == 0:
        return MEASUREMENT_STATE_NOT_MEASURED
    return (
        MEASUREMENT_STATE_MEASURED if scored == expected else MEASUREMENT_STATE_LIMITED
    )


def _dimension_payload(
    key: str,
    *,
    analyses: list[AnalysisMeasurementInput],
    rows_by_analysis: dict[str, list[RuleMeasurementInput]],
) -> dict:
    scores: list[float] = []
    expected = 0
    for analysis in analyses:
        rows = [
            row
            for row in rows_by_analysis.get(analysis.analysis_id, [])
            if row.expected
            and row.readiness_dimension == key
            and SCORE_ROLE_AEO in row.score_roles
        ]
        if not rows:
            continue
        expected += 1
        score = _page_score(rows, SCORE_ROLE_AEO)
        if score is not None:
            scores.append(score)
    applicable = expected > 0
    coverage = None if not applicable else len(scores) / expected
    reason = "" if len(scores) == expected else "unresolved_checks"
    if not applicable:
        reason = "no_applicable_checks"
    return {
        "key": key,
        "dimension_applicability": (
            DIMENSION_APPLICABLE if applicable else DIMENSION_NOT_APPLICABLE
        ),
        "dimension_measurement_state": _state(scored=len(scores), expected=expected),
        "score": _mean(scores),
        "coverage": coverage,
        "earned_points": sum(scores) / 100.0,
        "determinate_points": float(len(scores)),
        "expected_points": float(expected),
        "determinate_checkpoint_ids": [],
        "reason": reason,
    }


def aggregate_measurements(
    analyses: Iterable[AnalysisMeasurementInput],
    evaluations: Iterable[RuleMeasurementInput],
) -> AggregateMeasurements:
    analysis_rows = list(analyses)
    rows_by_analysis: dict[str, list[RuleMeasurementInput]] = {}
    for row in evaluations:
        rows_by_analysis.setdefault(row.analysis_id, []).append(row)
    web_scores = [
        score
        for analysis in analysis_rows
        if (
            score := _page_score(
                rows_by_analysis.get(analysis.analysis_id, []),
                SCORE_ROLE_WEB_FUNDAMENTALS,
            )
        )
        is not None
    ]
    supported = [
        analysis
        for analysis in analysis_rows
        if analysis.page_kind in SUPPORTED_AEO_CHECKS_BY_PAGE_KIND
    ]
    aeo_scores = [
        score
        for analysis in supported
        if (
            score := _page_aeo(
                rows_by_analysis.get(analysis.analysis_id, []), analysis.page_kind
            )
        )
        is not None
    ]
    dimensions = tuple(
        _dimension_payload(key, analyses=supported, rows_by_analysis=rows_by_analysis)
        for key in AEO_READINESS_DIMENSIONS
    )
    total = len(analysis_rows)
    return AggregateMeasurements(
        web_fundamentals_score=_mean(web_scores),
        web_fundamentals_coverage=None if total == 0 else len(web_scores) / total,
        web_fundamentals_state=_state(scored=len(web_scores), expected=total),
        aeo_readiness_score=_mean(aeo_scores),
        aeo_measurement_coverage=(
            None if not supported else len(aeo_scores) / len(supported)
        ),
        aeo_measurement_state=_state(scored=len(aeo_scores), expected=len(supported)),
        readiness_dimensions=dimensions,
        analyzed_url_count=total,
    )
