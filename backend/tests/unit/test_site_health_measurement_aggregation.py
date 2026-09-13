"""Crawl aggregation agrees with the page rows it aggregates.

There was no coverage here at all, which is how the crawl rollup came to hold a
second copy of the page formula and drift from it: a 200-page crawl where every
page scored 88.9 reported "Not measured", because one structurally
inapplicable check per page nulled every page at crawl level only.
"""

from __future__ import annotations

import pytest

from app.analysis.site_health.measurement_aggregation import aggregate_measurements
from app.analysis.site_health.rules import RuleEvaluation
from app.analysis.site_health.score_aggregation import aggregate_by_page_kind
from app.analysis.site_health.scoring import (
    AnalysisMeasurementInput,
    RuleMeasurementInput,
    score_analysis,
)
from app.core.config.site_health_rule_types import (
    RULE_SCOPE_PAGE,
    SCORE_ROLE_AEO,
    SCORE_ROLE_WEB_FUNDAMENTALS,
)

_WEB = (SCORE_ROLE_WEB_FUNDAMENTALS,)


def _row(
    analysis_id: str,
    rule_id: str,
    outcome: str,
    *,
    roles: tuple[str, ...] = _WEB,
    pillar: str = "",
    page_kind: str = "product",
) -> RuleMeasurementInput:
    return RuleMeasurementInput(
        analysis_id=analysis_id,
        page_kind=page_kind,
        rule_id=rule_id,
        scope=RULE_SCOPE_PAGE,
        outcome=outcome,
        expected=bool(roles),
        score_roles=roles,
        weight=1.0,
        severity="medium",
        readiness_dimension=pillar,
        readiness_weight=1.0,
    )


def _evaluation(
    rule_id: str, outcome: str, *, roles: tuple[str, ...] = _WEB, pillar: str = ""
) -> RuleEvaluation:
    return RuleEvaluation(
        rule_id=rule_id,
        rule_version="sh-rules-1",
        dimension="technical",
        category="content",
        severity="medium",
        finding_class="defect",
        weight=1.0,
        outcome=outcome,
        evidence={},
        display_applicability=True,
        score_applicability=True,
        reason_code="",
        score_roles=roles,
        readiness_dimension=pillar,
        readiness_weight=1.0,
        scope=RULE_SCOPE_PAGE,
    )


def test_not_applicable_leaves_the_denominator_instead_of_nulling_the_page() -> None:
    """The exact production failure: one N/A check per page, crawl reads null."""
    analyses = [AnalysisMeasurementInput("a", "product")]
    rows = [
        _row("a", "technical.title_present", "satisfied"),
        _row("a", "technical.canonical_integrity", "not_applicable"),
    ]

    result = aggregate_measurements(analyses, rows)

    assert result.web_fundamentals_score == pytest.approx(100.0)
    assert result.web_fundamentals_state == "measured"


def test_crawl_mean_equals_the_page_scores_it_aggregates() -> None:
    """A 100 page and a 0 page average to 50 whatever their checklist sizes."""
    analyses = [
        AnalysisMeasurementInput("a", "product"),
        AnalysisMeasurementInput("b", "product"),
    ]
    rows = [
        _row("a", "technical.title_present", "satisfied"),
        _row("a", "technical.https", "satisfied"),
        _row("a", "technical.indexable", "satisfied"),
        _row("b", "technical.title_present", "missing"),
    ]

    result = aggregate_measurements(analyses, rows)

    assert result.web_fundamentals_score == pytest.approx(50.0)


def test_page_and_crawl_formulas_agree_on_the_same_evidence() -> None:
    """One page's crawl rollup IS that page's score. No second formula."""
    outcomes = [
        ("technical.title_present", "satisfied"),
        ("technical.meta_description_present", "missing"),
        ("technical.canonical_present", "missing"),
        ("technical.canonical_integrity", "not_applicable"),
        ("technical.https", "satisfied"),
        ("web.accessibility_form_names", "unknown"),
    ]
    page = score_analysis(
        [_evaluation(rule_id, outcome) for rule_id, outcome in outcomes],
        page_kind="product",
    )
    crawl = aggregate_measurements(
        [AnalysisMeasurementInput("a", "product")],
        [_row("a", rule_id, outcome) for rule_id, outcome in outcomes],
    )

    assert crawl.web_fundamentals_score == pytest.approx(page.web_fundamentals_score)


def test_a_pillar_no_page_applies_is_not_applicable_not_unmeasured() -> None:
    """ "Nothing here applies" and "we failed to measure" are different answers."""
    analyses = [AnalysisMeasurementInput("a", "product")]
    rows = [
        _row(
            "a",
            "aeo.heading_hierarchy",
            "satisfied",
            roles=(SCORE_ROLE_AEO,),
            pillar="structure",
        )
    ]

    result = aggregate_measurements(analyses, rows)
    by_key = {row["key"]: row for row in result.readiness_dimensions}

    assert by_key["structure"]["dimension_applicability"] == "applicable"
    assert by_key["structure"]["score"] == pytest.approx(100.0)
    assert by_key["evidence"]["dimension_applicability"] == "not_applicable"
    assert by_key["evidence"]["reason"] == "no_applicable_checks"
    # Renormalized over the one pillar that applied, not diluted by six absent
    # ones — and scored, because something WAS measured.
    assert result.aeo_readiness_score == pytest.approx(100.0)


def test_pillar_points_are_page_counts_at_crawl_level() -> None:
    """The crawl pillar payload counts PAGES, not checks — state it explicitly.

    `DimensionMeasurement` counts checks on one page; this payload counts the
    pages that scored the pillar. Both write `earned_points` /
    `determinate_points` / `expected_points`, so the aggregation rule has to be
    pinned or a reader will add one meaning to the other.
    """
    analyses = [
        AnalysisMeasurementInput("a", "product"),
        AnalysisMeasurementInput("b", "product"),
    ]
    rows = [
        # One page passes both structure checks; the other fails one of them.
        _row(
            "a",
            "aeo.heading_hierarchy",
            "satisfied",
            roles=(SCORE_ROLE_AEO,),
            pillar="structure",
        ),
        _row(
            "a",
            "aeo.question_headings",
            "satisfied",
            roles=(SCORE_ROLE_AEO,),
            pillar="structure",
        ),
        _row(
            "b",
            "aeo.heading_hierarchy",
            "satisfied",
            roles=(SCORE_ROLE_AEO,),
            pillar="structure",
        ),
        _row(
            "b",
            "aeo.question_headings",
            "missing",
            roles=(SCORE_ROLE_AEO,),
            pillar="structure",
        ),
    ]

    structure = next(
        row
        for row in aggregate_measurements(analyses, rows).readiness_dimensions
        if row["key"] == "structure"
    )

    # Two pages applied and both scored; the mean of 100 and 50 is 75.
    assert structure["expected_points"] == 2.0
    assert structure["determinate_points"] == 2.0
    assert structure["score"] == pytest.approx(75.0)
    # `earned_points` is that mean expressed in page-equivalents: 1.5 of 2.
    assert structure["earned_points"] == pytest.approx(1.5)
    # Determinate ids are the UNION across pages, deduplicated and sorted.
    assert structure["determinate_checkpoint_ids"] == [
        "aeo.heading_hierarchy",
        "aeo.question_headings",
    ]


def test_every_persisted_pillar_carries_its_label_and_description() -> None:
    """The Overview response model requires both; omitting them returned 500."""
    result = aggregate_measurements([AnalysisMeasurementInput("a", "product")], [])

    for dimension in result.readiness_dimensions:
        assert dimension["label"]
        assert dimension["description"]
        assert "unresolved_count" in dimension


def test_scored_pages_do_not_hide_unresolved_checks_in_rollups() -> None:
    analyses = [AnalysisMeasurementInput("a", "product")]
    roles = (SCORE_ROLE_AEO, SCORE_ROLE_WEB_FUNDAMENTALS)
    rows = [
        _row("a", "one", "satisfied", roles=roles, pillar="structure"),
        _row("a", "two", "unknown", roles=roles, pillar="structure"),
    ]

    crawl = aggregate_measurements(analyses, rows)
    kind = aggregate_by_page_kind(analyses, rows)["product"]
    pillar = next(
        row for row in crawl.readiness_dimensions if row["key"] == "structure"
    )

    assert crawl.web_fundamentals_score == crawl.aeo_readiness_score == 100.0
    assert (
        crawl.web_fundamentals_state
        == crawl.aeo_measurement_state
        == "limited_evidence"
    )
    # Coverage here counts scored pages; completion also considers their checks.
    assert crawl.aeo_measurement_coverage == 1.0
    assert kind["aeo_measurement_reason"] == "unresolved_checks"
    assert pillar["dimension_measurement_state"] == "limited_evidence"
    assert pillar["unresolved_count"] == 1
