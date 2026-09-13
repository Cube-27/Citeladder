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


def test_unknown_and_partial_earn_no_credit_and_leave_the_denominator() -> None:
    """They must not score, and they must not silence the checks that did.

    Nulling the page on one indeterminate check reported OUR gap as the site's
    failure: a page with fifteen determinate verdicts read "Limited evidence"
    and showed no number at all. The shortfall belongs in `coverage`.
    """
    rows = [
        _evaluation("technical.title_present", "satisfied", role="web_fundamentals"),
        _evaluation("technical.indexable", "partial", role="web_fundamentals"),
    ]

    scores = score_analysis(rows, page_kind="article")

    assert scores.web_fundamentals_score == pytest.approx(100.0)
    assert scores.web_fundamentals_coverage == pytest.approx(0.5)
    assert scores.technical_earned_weight == 1
    assert scores.technical_expected_weight == 2

    rows.append(_evaluation("technical.https", "unknown", role="web_fundamentals"))
    scores = score_analysis(rows, page_kind="article")

    # Still one pass of one resolved check — the two unresolved ones neither
    # earn credit nor dilute it.
    assert scores.web_fundamentals_score == pytest.approx(100.0)
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


def test_an_empty_checklist_is_the_only_thing_that_withholds_a_score() -> None:
    """Page KIND never withholds readiness; an absent checklist does."""
    scores = score_analysis([], page_kind="homepage")

    assert scores.aeo_readiness_score is None
    assert scores.aeo_measurement_reason == "no_applicable_checks"


def test_applicable_but_unresolved_checks_are_our_gap_not_an_absent_checklist() -> None:
    """Three no-score causes; only one of them is "nothing applies here".

    A page whose every readiness check came back `unknown` reported
    `no_applicable_checks`, which tells the reader nothing applies to a page we
    simply failed to measure.
    """
    rows = [
        _evaluation(
            "aeo.heading_hierarchy",
            "unknown",
            role="aeo_readiness",
            pillar="structure",
        ),
    ]

    scores = score_analysis(rows, page_kind="article")

    assert scores.aeo_readiness_score is None
    assert scores.aeo_measurement_reason == "unresolved_checks"
    assert scores.aeo_measurement_coverage == 0.0

    # An `other` page with nothing applicable keeps the purpose reason.
    assert (
        score_analysis([], page_kind="other").aeo_measurement_reason
        == "page_purpose_unresolved"
    )


def test_any_page_kind_can_be_scored_from_the_checks_that_applied() -> None:
    rows = [
        _evaluation(
            "aeo.heading_hierarchy",
            "satisfied",
            role="aeo_readiness",
            pillar="structure",
        ),
    ]

    for page_kind in ("homepage", "guide", "service", "other"):
        scores = score_analysis(rows, page_kind=page_kind)
        assert scores.aeo_readiness_score == pytest.approx(100.0)
        assert scores.aeo_measurement_reason == ""


@pytest.mark.parametrize("unresolved", ["unknown", "error", "partial"])
def test_partial_pillar_keeps_the_page_score_but_limits_completion(
    unresolved: str,
) -> None:
    scores = score_analysis(
        [
            _evaluation("one", "satisfied", role="aeo_readiness", pillar="structure"),
            _evaluation("two", unresolved, role="aeo_readiness", pillar="structure"),
        ],
        page_kind="article",
    )

    assert scores.aeo_readiness_score == 100.0
    assert scores.aeo_measurement_coverage == 0.5
    assert scores.aeo_measurement_state == "limited_evidence"
    assert scores.aeo_measurement_reason == "unresolved_checks"


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

    # Contradictory duplicates resolve to neither outcome: the check leaves the
    # denominator rather than being credited at its most flattering reading.
    assert result.web_fundamentals_score is None
    assert result.web_fundamentals_coverage == 0
