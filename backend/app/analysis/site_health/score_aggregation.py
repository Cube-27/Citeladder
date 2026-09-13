"""Crawl-level page-kind measurement projection."""

from __future__ import annotations

from collections.abc import Iterable

from app.analysis.site_health.measurement_aggregation import (
    AggregateMeasurements,
    aggregate_measurements,
)
from app.analysis.site_health.scoring import (
    AnalysisMeasurementInput,
    RuleMeasurementInput,
    readiness_reason,
)
from app.core.config.site_health_measurement import DIMENSION_APPLICABLE
from app.core.config.site_health_rule_types import RULE_SCOPE_PAGE
from app.core.config.site_health_taxonomy import PAGE_KINDS


def _ordered_page_kinds(
    grouped: dict[str, list[AnalysisMeasurementInput]],
) -> list[str]:
    known = [kind for kind in PAGE_KINDS if kind in grouped]
    return known + sorted(kind for kind in grouped if kind not in PAGE_KINDS)


def _page_kind_payload(
    page_kind: str, aggregate: AggregateMeasurements
) -> dict[str, object]:
    return {
        "analyzed_count": aggregate.analyzed_url_count,
        "web_fundamentals_score": aggregate.web_fundamentals_score,
        "web_fundamentals_coverage": aggregate.web_fundamentals_coverage,
        "web_fundamentals_state": aggregate.web_fundamentals_state,
        "aeo_readiness_score": aggregate.aeo_readiness_score,
        "aeo_measurement_coverage": aggregate.aeo_measurement_coverage,
        "aeo_measurement_state": aggregate.aeo_measurement_state,
        # `other` no longer means "unscoreable". An unresolved purpose limits
        # which checks APPLY; it does not stop the ones that did apply from
        # producing a readiness number, and stamping every such bucket
        # `page_purpose_unresolved` hid a real score behind a classifier
        # caveat. The reason now describes the measurement, not the kind.
        "aeo_measurement_reason": _reason(page_kind, aggregate),
    }


def _reason(page_kind: str, aggregate: AggregateMeasurements) -> str:
    """Apply the page scorer's reason policy to the cohort result."""
    return readiness_reason(
        score=aggregate.aeo_readiness_score,
        state=aggregate.aeo_measurement_state,
        has_applicable_pillar=any(
            row.get("dimension_applicability") == DIMENSION_APPLICABLE
            for row in aggregate.readiness_dimensions
        ),
        effective_kind=page_kind,
    )


def aggregate_by_page_kind(
    analyses: Iterable[AnalysisMeasurementInput],
    rule_inputs: Iterable[RuleMeasurementInput],
) -> dict[str, dict[str, object]]:
    rules = list(rule_inputs)
    grouped: dict[str, list[AnalysisMeasurementInput]] = {}
    for analysis in analyses:
        grouped.setdefault(analysis.page_kind, []).append(analysis)
    ordered = _ordered_page_kinds(grouped)
    result: dict[str, dict[str, object]] = {}
    for page_kind in ordered:
        kind_analyses = grouped[page_kind]
        analysis_ids = {row.analysis_id for row in kind_analyses}
        aggregate = aggregate_measurements(
            kind_analyses,
            (
                rule
                for rule in rules
                if rule.scope == RULE_SCOPE_PAGE and rule.analysis_id in analysis_ids
            ),
        )
        result[page_kind] = _page_kind_payload(page_kind, aggregate)
    return result
