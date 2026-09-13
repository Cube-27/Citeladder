"""Equal-page crawl aggregation using the page scorer's checklist arithmetic."""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass

from app.analysis.site_health.scoring import (
    AnalysisMeasurementInput,
    DimensionMeasurement,
    RuleMeasurementInput,
    applicable_checks,
    measurement_state,
    pillar_measurement,
    role_result,
    weighted_aeo_result,
)
from app.core.config.site_health_contracts import (
    AEO_READINESS_DIMENSIONS,
    SCORING_VERSION,
)
from app.core.config.site_health_measurement import (
    DIMENSION_APPLICABLE,
    MEASUREMENT_STATE_LIMITED,
    MEASUREMENT_STATE_MEASURED,
)
from app.core.config.site_health_rule_types import (
    SCORE_ROLE_AEO,
    SCORE_ROLE_WEB_FUNDAMENTALS,
)


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


def _page_pillars(
    rows: list[RuleMeasurementInput],
) -> tuple[DimensionMeasurement, ...]:
    """Measure each page's pillars once for both page and crawl scores."""
    aeo_rows = applicable_checks(rows, SCORE_ROLE_AEO)
    return tuple(pillar_measurement(key, aeo_rows) for key in AEO_READINESS_DIMENSIONS)


def _mean(values: list[float]) -> float | None:
    return None if not values else sum(values) / len(values)


def _dimension_payload(
    index: int, pages: list[tuple[DimensionMeasurement, ...]]
) -> dict:
    """Average scored pages using the shared pillar payload shape."""
    key = AEO_READINESS_DIMENSIONS[index]
    applicable = [
        page[index]
        for page in pages
        if page[index].applicability == DIMENSION_APPLICABLE
    ]
    if not applicable:
        return pillar_measurement(key, ()).to_dict()
    scores = [pillar.score for pillar in applicable if pillar.score is not None]
    determinate_ids = {
        rule_id
        for pillar in applicable
        for rule_id in pillar.determinate_checkpoint_ids
    }
    unresolved_count = sum(pillar.unresolved_count for pillar in applicable)
    state = measurement_state(determinate=len(scores), expected=len(applicable))
    if scores and unresolved_count:
        state = MEASUREMENT_STATE_LIMITED
    return DimensionMeasurement(
        key=key,
        applicability=DIMENSION_APPLICABLE,
        measurement_state=state,
        score=_mean(scores),
        coverage=len(scores) / len(applicable),
        # Crawl level counts PAGES, not checks: a page that produced a pillar
        # score is one determinate point out of one expected point.
        earned_points=sum(scores) / 100.0,
        determinate_points=float(len(scores)),
        expected_points=float(len(applicable)),
        determinate_checkpoint_ids=tuple(sorted(determinate_ids)),
        reason="" if state == MEASUREMENT_STATE_MEASURED else "unresolved_checks",
        unresolved_count=unresolved_count,
    ).to_dict()


def aggregate_measurements(
    analyses: Iterable[AnalysisMeasurementInput],
    evaluations: Iterable[RuleMeasurementInput],
) -> AggregateMeasurements:
    analysis_rows = list(analyses)
    rows_by_analysis: dict[str, list[RuleMeasurementInput]] = {}
    for row in evaluations:
        rows_by_analysis.setdefault(row.analysis_id, []).append(row)
    web_results = [
        role_result(
            applicable_checks(
                rows_by_analysis.get(analysis.analysis_id, []),
                SCORE_ROLE_WEB_FUNDAMENTALS,
            )
        )
        for analysis in analysis_rows
    ]
    web_scores = [result[0] for result in web_results if result[0] is not None]
    page_pillars = [
        _page_pillars(rows_by_analysis.get(analysis.analysis_id, []))
        for analysis in analysis_rows
    ]
    aeo_results = [weighted_aeo_result(pillars) for pillars in page_pillars]
    aeo_scores = [result[0] for result in aeo_results if result[0] is not None]
    dimensions = tuple(
        _dimension_payload(index, page_pillars)
        for index in range(len(AEO_READINESS_DIMENSIONS))
    )
    total = len(analysis_rows)
    return AggregateMeasurements(
        web_fundamentals_score=_mean(web_scores),
        web_fundamentals_coverage=None if total == 0 else len(web_scores) / total,
        web_fundamentals_state=_aggregate_state(web_results),
        aeo_readiness_score=_mean(aeo_scores),
        aeo_measurement_coverage=None if total == 0 else len(aeo_scores) / total,
        aeo_measurement_state=_aggregate_state(aeo_results),
        readiness_dimensions=dimensions,
        analyzed_url_count=total,
    )


def _aggregate_state(
    results: list[tuple[float | None, float | None, str]]
    | list[tuple[float | None, float | None, str, int, int, int]],
) -> str:
    """Scored-page coverage does not imply that every page's checks resolved."""
    scored = sum(result[0] is not None for result in results)
    if scored and any(result[2] != MEASUREMENT_STATE_MEASURED for result in results):
        return MEASUREMENT_STATE_LIMITED
    return measurement_state(determinate=scored, expected=len(results))
