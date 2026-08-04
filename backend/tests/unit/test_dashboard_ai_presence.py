"""Pure AI Presence formula and momentum coverage."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal

from app.domain.dashboard.service import (
    _bounded_rate,
    _latest_opportunity_before,
    build_ai_presence_point,
    finalize_ai_presence_points,
)
from app.models.analysis import MetricSnapshot
from app.models.opportunity import OpportunitySnapshot
from app.models.product import ProductMetricSnapshot
from app.models.site_health import SiteHealthSnapshot


def test_bounded_rate_accepts_decimal_values() -> None:
    assert _bounded_rate(Decimal("0.25")) == 0.25


def test_bounded_rate_accepts_float_compatible_numeric_objects() -> None:
    class NumericLike:
        def __float__(self) -> float:
            return 0.75

    assert _bounded_rate(NumericLike()) == 0.75


def _metric(
    *, created_at: datetime, mention: float, owned: float = 0.25
) -> MetricSnapshot:
    workspace_id, project_id, audit_id = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    return MetricSnapshot(
        id=uuid.uuid4(),
        workspace_id=workspace_id,
        project_id=project_id,
        audit_id=audit_id,
        analyzer_version="analysis-v1",
        scoring_rule_version="score-v1",
        total_completed=10,
        metrics={
            "brand_mention_rate": mention,
            "owned_citation_rate": owned,
            "share_of_voice": {"share": {"Acme": 0.4}},
        },
        created_at=created_at,
    )


def _health(*, created_at: datetime, technical_score: float = 80) -> SiteHealthSnapshot:
    return SiteHealthSnapshot(
        id=uuid.uuid4(),
        workspace_id=uuid.uuid4(),
        project_id=uuid.uuid4(),
        crawl_id=uuid.uuid4(),
        technical_score=technical_score,
        overall_score=80,
        analyzer_version="health-v1",
        scoring_version="health-score-v1",
        created_at=created_at,
    )


def test_standard_formula_renormalizes_missing_components() -> None:
    point = build_ai_presence_point(
        metric=_metric(created_at=datetime.now(UTC), mention=0.5),
        brand_name="Acme",
        health=None,
        products=[],
        opportunity_snapshot=None,
    )

    # (30*50 + 20*40 + 20*25) / (30 + 20 + 20) = 40.
    assert point.formula_kind == "standard"
    assert point.score == 40.0
    assert point.provisional is True
    assert point.coverage["web_fundamentals"] is False


def test_web_fundamentals_uses_the_technical_score() -> None:
    point = build_ai_presence_point(
        metric=_metric(created_at=datetime.now(UTC), mention=0.5),
        brand_name="Acme",
        health=_health(created_at=datetime.now(UTC), technical_score=60),
        products=[],
        opportunity_snapshot=None,
    )

    assert point.components["web_fundamentals"].score == 60.0
    assert point.score == 46.0


def test_opportunity_snapshot_selection_excludes_future_recomputes() -> None:
    at = datetime.now(UTC)
    metric = _metric(created_at=at, mention=0.5)
    before = OpportunitySnapshot(
        id=uuid.uuid4(),
        workspace_id=metric.workspace_id,
        project_id=metric.project_id,
        audit_id=metric.audit_id,
        created_at=at - timedelta(seconds=1),
    )
    future = OpportunitySnapshot(
        id=uuid.uuid4(),
        workspace_id=metric.workspace_id,
        project_id=metric.project_id,
        audit_id=metric.audit_id,
        created_at=at + timedelta(seconds=1),
    )

    assert _latest_opportunity_before([before, future], at) is before


def test_commerce_formula_and_null_empty_opportunity_execution() -> None:
    created_at = datetime.now(UTC)
    metric = _metric(created_at=created_at, mention=0.5, owned=0.6)
    product = ProductMetricSnapshot(
        id=uuid.uuid4(),
        workspace_id=metric.workspace_id,
        project_id=metric.project_id,
        audit_id=metric.audit_id,
        product_id=uuid.uuid4(),
        product_analyzer_version="product-v1",
        product_scoring_rule_version="product-score-v1",
        source_analysis_ids=[str(uuid.uuid4())],
        sov_share=0.5,
        mention_count=5,
        avg_rank=2,
        price_accuracy_rate=0.9,
    )
    opportunity = OpportunitySnapshot(
        id=uuid.uuid4(),
        workspace_id=metric.workspace_id,
        project_id=metric.project_id,
        audit_id=metric.audit_id,
        counts_by_status={"open": 1, "in_progress": 0, "resolved": 1},
        analyzer_version="opp-v1",
        rule_version="rules-v1",
        formula_version="formula-v1",
    )
    point = build_ai_presence_point(
        metric=metric,
        brand_name="Acme",
        health=_health(created_at=created_at),
        products=[product],
        opportunity_snapshot=opportunity,
    )

    assert point.formula_kind == "commerce"
    assert point.components["product_presence"].score == 56.0
    assert point.components["opportunity_execution"].score == 50.0
    assert point.score == 58.3
    assert point.provisional is False

    opportunity.counts_by_status = {"dismissed": 3}
    no_opportunities = build_ai_presence_point(
        metric=metric,
        brand_name="Acme",
        health=_health(created_at=created_at),
        products=[product],
        opportunity_snapshot=opportunity,
    )
    assert no_opportunities.components["opportunity_execution"].score is None


def test_momentum_requires_matching_formula_coverage_and_versions() -> None:
    now = datetime.now(UTC)
    old = build_ai_presence_point(
        metric=_metric(created_at=now - timedelta(days=10), mention=0.4),
        brand_name="Acme",
        health=_health(created_at=now - timedelta(days=10)),
        products=[],
        opportunity_snapshot=None,
    )
    latest = build_ai_presence_point(
        metric=_metric(created_at=now, mention=0.6),
        brand_name="Acme",
        health=_health(created_at=now),
        products=[],
        opportunity_snapshot=None,
    )
    response = finalize_ai_presence_points([latest, old], now=now)

    assert response.momentum == 6.0
    assert all(point.comparable_to_latest for point in response.trend_points)

    old.versions["metric_analyzer"] = "analysis-v2"
    incompatible = finalize_ai_presence_points([old, latest], now=now)
    assert incompatible.momentum is None
    assert incompatible.trend_points[0].comparable_to_latest is False
