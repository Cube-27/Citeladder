"""Focused binary-checklist and equal-page scoring coverage."""

from __future__ import annotations

import pytest

from app.analysis.site_health.measurement_aggregation import aggregate_measurements
from app.analysis.site_health.rules import RuleEvaluation
from app.analysis.site_health.scoring import (
    AnalysisMeasurementInput,
    RuleMeasurementInput,
    score_analysis,
)
from app.domain.site_health.overview_snapshot import measurement_check_counts
from app.domain.site_health.web_fundamentals_projection import _area_state


def _evaluation(
    rule_id: str, outcome: str, *, role: str, pillar: str = ""
) -> RuleEvaluation:
    return RuleEvaluation(
        rule_id=rule_id,
        rule_version="1",
        dimension="aeo" if pillar else "technical",
        category="content",
        severity="medium",
        finding_class="defect",
        weight=99.0,
        outcome=outcome,
        score_applicability=True,
        score_roles=(role,),
        readiness_dimension=pillar,
    )


def test_unknown_and_partial_never_earn_credit_or_publish_a_page_score() -> None:
    rows = [
        _evaluation("technical.title_present", "satisfied", role="web_fundamentals"),
        _evaluation("technical.indexable", "partial", role="web_fundamentals"),
    ]

    scores = score_analysis(rows, page_kind="article")

    assert scores.web_fundamentals_score is None
    assert scores.web_fundamentals_coverage == pytest.approx(0.5)
    assert scores.technical_earned_weight == 1
    assert scores.technical_expected_weight == 2

    rows.append(_evaluation("technical.https", "unknown", role="web_fundamentals"))
    scores = score_analysis(rows, page_kind="article")

    assert scores.web_fundamentals_score is None
    assert scores.web_fundamentals_coverage == pytest.approx(1 / 3)
    assert scores.technical_earned_weight == 1
    assert scores.technical_determinate_weight == 1
    assert scores.technical_expected_weight == 3
    assert measurement_check_counts(rows) == (1, 3)
    rows.append(
        _evaluation(
            "technical.canonical_integrity", "not_applicable", role="web_fundamentals"
        )
    )
    assert measurement_check_counts(rows) == (1, 3)
    assert _area_state(rows) == ("limited_evidence", pytest.approx(1 / 3, abs=0.0001))


def test_binary_checks_use_equal_weight_and_complete_supported_aeo_pillars() -> None:
    rows = [
        _evaluation("technical.title_present", "satisfied", role="web_fundamentals"),
        _evaluation("technical.indexable", "missing", role="web_fundamentals"),
        _evaluation(
            "aeo.answer_first",
            "satisfied",
            role="aeo_readiness",
            pillar="answerability",
        ),
        _evaluation(
            "aeo.question_headings", "missing", role="aeo_readiness", pillar="structure"
        ),
    ]

    scores = score_analysis(rows, page_kind="faq")

    assert scores.web_fundamentals_score == 50
    assert scores.aeo_readiness_score == pytest.approx(100 * 0.20 / 0.35)
    assert all(entry["weight"] == 1 for entry in scores.expected_checkpoint_profile)


def test_unsupported_purpose_has_no_aeo_score() -> None:
    scores = score_analysis([], page_kind="homepage")

    assert scores.aeo_readiness_score is None
    assert scores.aeo_measurement_reason == "unsupported_purpose_checklist"


def _measurement(
    analysis_id: str, rule_id: str, outcome: str, *, expected: bool = True
) -> RuleMeasurementInput:
    return RuleMeasurementInput(
        analysis_id=analysis_id,
        page_kind="article",
        rule_id=rule_id,
        scope="page",
        outcome=outcome,
        expected=expected,
        score_roles=("web_fundamentals",),
        weight=1,
        severity="medium",
        readiness_dimension="",
        readiness_weight=0,
    )


def test_crawl_score_is_equal_mean_of_complete_page_scores() -> None:
    analyses = [
        AnalysisMeasurementInput("a", "article"),
        AnalysisMeasurementInput("b", "article"),
    ]
    rows = [
        _measurement("a", "one", "satisfied"),
        *[_measurement("b", f"rule-{index}", "missing") for index in range(9)],
    ]

    result = aggregate_measurements(analyses, rows)

    assert result.web_fundamentals_score == 50
    assert result.web_fundamentals_score != 10
    assert all(
        dimension["reason"] == "no_applicable_checks"
        for dimension in result.readiness_dimensions
    )


def test_conflicting_duplicate_results_do_not_select_maximum_credit() -> None:
    analyses = [AnalysisMeasurementInput("a", "article")]
    rows = [
        _measurement("a", "one", "satisfied"),
        _measurement("a", "one", "missing"),
    ]

    result = aggregate_measurements(analyses, rows)

    assert result.web_fundamentals_score is None
    assert result.web_fundamentals_coverage == 0
