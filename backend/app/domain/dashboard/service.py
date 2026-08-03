from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config.audits import AUDIT_TERMINAL_STATUSES
from app.core.config.dashboard import (
    AI_PRESENCE_FORMULA_VERSION,
    BRAND_VISIBILITY_WEIGHTS,
    COMMERCE_MIN_PRODUCT_EVIDENCE_ROWS,
    COMMERCE_WEIGHTS,
    COMPONENT_BRAND_MENTION_RATE,
    COMPONENT_BRAND_VISIBILITY,
    COMPONENT_NORMALIZED_SOV,
    COMPONENT_OPPORTUNITY_EXECUTION,
    COMPONENT_OWNED_CITATION_RATE,
    COMPONENT_PRODUCT_PRESENCE,
    COMPONENT_WEB_FUNDAMENTALS,
    DASHBOARD_MAX_AI_PRESENCE_POINTS,
    FORMULA_KIND_COMMERCE,
    FORMULA_KIND_STANDARD,
    MOMENTUM_WINDOW_DAYS,
    PRODUCT_PRESENCE_WEIGHTS,
    SCORE_ROUNDING_DECIMALS,
    SCORE_SCALE,
    STANDARD_WEIGHTS,
)
from app.domain.dashboard.schemas import (
    AIPresenceComponent,
    AIPresencePoint,
    AIPresenceResponse,
    DashboardProject,
    DashboardResponse,
    DashboardSection,
    DashboardSource,
)
from app.models.analysis import MetricSnapshot
from app.models.analytics import AnalyticsSnapshot
from app.models.audit import Audit
from app.models.brand import BrandProfile
from app.models.content import ContentGeneration
from app.models.opportunity import Opportunity, OpportunitySnapshot
from app.models.product import ProductMetricSnapshot
from app.models.project import Project
from app.models.prompt import Prompt, PromptSet
from app.models.site_health import SiteCrawl, SiteHealthSnapshot
from app.models.traffic import TrafficSnapshot


def _bounded_rate(value: object) -> float | None:
    if not isinstance(value, (int, float, str, Decimal)):
        return None
    try:
        return min(1.0, max(0.0, float(value)))
    except (TypeError, ValueError):
        return None


def _score_rate(value: object) -> float | None:
    rate = _bounded_rate(value)
    if rate is None:
        return None
    return round(rate * SCORE_SCALE, SCORE_ROUNDING_DECIMALS)


def _weighted_components(
    values: dict[str, float | None], weights: dict[str, float]
) -> tuple[float | None, dict[str, AIPresenceComponent], dict[str, bool]]:
    coverage = {name: values.get(name) is not None for name in weights}
    available_weight = sum(weight for name, weight in weights.items() if coverage[name])
    components = {
        name: AIPresenceComponent(
            score=values.get(name), weight=weight, available=coverage[name]
        )
        for name, weight in weights.items()
    }
    if not available_weight:
        return None, components, coverage
    score = (
        sum(
            (values[name] or 0.0) * weight
            for name, weight in weights.items()
            if coverage[name]
        )
        / available_weight
    )
    return round(score, SCORE_ROUNDING_DECIMALS), components, coverage


def _normalized_brand_sov(metric: MetricSnapshot, brand_name: str) -> float | None:
    metrics = metric.metrics or {}
    shares = (metrics.get("share_of_voice") or {}).get("share") or {}
    raw = shares.get(brand_name)
    if raw is None:
        raw = shares.get("Brand")
    return _score_rate(raw)


def _product_presence(
    snapshots: list[ProductMetricSnapshot], *, total_completed: int
) -> tuple[float | None, dict[str, bool], dict[str, str]]:
    """Aggregate only own, provenance-backed product snapshot rows."""
    own = _own_product_snapshots(snapshots)
    if len(own) < COMMERCE_MIN_PRODUCT_EVIDENCE_ROWS:
        return None, {name: False for name in PRODUCT_PRESENCE_WEIGHTS}, {}
    sov = _score_rate(sum(max(0.0, float(row.sov_share or 0.0)) for row in own))
    mention_coverage = (
        _score_rate(
            sum(max(0, int(row.mention_count or 0)) for row in own) / total_completed
        )
        if total_completed > 0
        else None
    )
    rank = _normalized_rank_performance(own)
    price = _average_price_accuracy(own)
    score, _components, coverage = _weighted_components(
        {
            "product_share_of_voice": sov,
            "product_prompt_mention_coverage": mention_coverage,
            "normalized_rank_performance": rank,
            "verifiable_price_accuracy": price,
        },
        PRODUCT_PRESENCE_WEIGHTS,
    )
    versions = {
        "product_analyzer": ",".join(
            sorted({row.product_analyzer_version for row in own})
        ),
        "product_scoring_rule": ",".join(
            sorted({row.product_scoring_rule_version for row in own})
        ),
    }
    return score, coverage, versions


def _own_product_snapshots(
    snapshots: list[ProductMetricSnapshot],
) -> list[ProductMetricSnapshot]:
    return [
        row
        for row in snapshots
        if row.product_id is not None and bool(row.source_analysis_ids)
    ]


def _normalized_rank_performance(rows: list[ProductMetricSnapshot]) -> float | None:
    ranks = [
        float(row.avg_rank)
        for row in rows
        if row.avg_rank is not None and row.avg_rank > 0
    ]
    if not ranks:
        return None
    score = sum(min(1.0, 1.0 / value) for value in ranks) / len(ranks)
    return round(score * SCORE_SCALE, SCORE_ROUNDING_DECIMALS)


def _average_price_accuracy(rows: list[ProductMetricSnapshot]) -> float | None:
    prices = [
        float(row.price_accuracy_rate)
        for row in rows
        if row.price_accuracy_rate is not None
    ]
    return _score_rate(sum(prices) / len(prices)) if prices else None


def build_ai_presence_point(
    *,
    metric: MetricSnapshot,
    brand_name: str,
    health: SiteHealthSnapshot | None,
    products: list[ProductMetricSnapshot],
    opportunity_snapshot: OpportunitySnapshot | None,
) -> AIPresencePoint:
    """Pure projection for one persisted metric snapshot; no I/O or re-score."""
    metrics = metric.metrics or {}
    mention = _score_rate(metrics.get("brand_mention_rate"))
    sov = _normalized_brand_sov(metric, brand_name)
    owned = _score_rate(metrics.get("owned_citation_rate"))
    fundamentals = (
        _score_rate((health.technical_score or 0.0) / SCORE_SCALE)
        if health and health.technical_score is not None
        else None
    )
    product_score, product_coverage, product_versions = _product_presence(
        products, total_completed=int(metric.total_completed or 0)
    )
    commerce_active = product_score is not None
    source_ids, versions = _presence_provenance(
        metric=metric,
        health=health,
        products=products,
        product_versions=product_versions,
        opportunity_snapshot=opportunity_snapshot,
    )
    if not commerce_active:
        return _standard_presence_point(
            metric=metric,
            mention=mention,
            sov=sov,
            owned=owned,
            fundamentals=fundamentals,
            source_ids=source_ids,
            versions=versions,
        )
    return _commerce_presence_point(
        metric=metric,
        mention=mention,
        sov=sov,
        owned=owned,
        fundamentals=fundamentals,
        product_score=product_score,
        product_coverage=product_coverage,
        opportunity_snapshot=opportunity_snapshot,
        source_ids=source_ids,
        versions=versions,
    )


def _presence_provenance(
    *,
    metric: MetricSnapshot,
    health: SiteHealthSnapshot | None,
    products: list[ProductMetricSnapshot],
    product_versions: dict[str, str],
    opportunity_snapshot: OpportunitySnapshot | None,
) -> tuple[dict[str, list[uuid.UUID]], dict[str, str]]:
    source_ids = {"metric_snapshot": [metric.id]}
    versions = {
        "metric_analyzer": metric.analyzer_version,
        "metric_scoring_rule": metric.scoring_rule_version,
        "ai_presence_formula": AI_PRESENCE_FORMULA_VERSION,
    }
    if health is not None:
        source_ids["site_health_snapshot"] = [health.id]
        versions.update(
            site_health_analyzer=health.analyzer_version,
            site_health_scoring=health.scoring_version,
        )
    if products:
        source_ids["product_metric_snapshot"] = [row.id for row in products]
        versions.update(product_versions)
    if opportunity_snapshot is not None:
        source_ids["opportunity_snapshot"] = [opportunity_snapshot.id]
        versions.update(
            opportunity_analyzer=opportunity_snapshot.analyzer_version,
            opportunity_rule=opportunity_snapshot.rule_version,
            opportunity_formula=opportunity_snapshot.formula_version,
        )
    return source_ids, versions


def _standard_presence_point(
    *,
    metric: MetricSnapshot,
    mention: float | None,
    sov: float | None,
    owned: float | None,
    fundamentals: float | None,
    source_ids: dict[str, list[uuid.UUID]],
    versions: dict[str, str],
) -> AIPresencePoint:
    score, components, coverage = _weighted_components(
        {
            COMPONENT_BRAND_MENTION_RATE: mention,
            COMPONENT_NORMALIZED_SOV: sov,
            COMPONENT_OWNED_CITATION_RATE: owned,
            COMPONENT_WEB_FUNDAMENTALS: fundamentals,
        },
        STANDARD_WEIGHTS,
    )
    return AIPresencePoint(
        score=score,
        formula_kind=FORMULA_KIND_STANDARD,
        formula_version=AI_PRESENCE_FORMULA_VERSION,
        provisional=not all(coverage.values()),
        coverage=coverage,
        components=components,
        source_snapshot_ids=source_ids,
        versions=versions,
        timestamp=metric.created_at,
    )


def _opportunity_execution(snapshot: OpportunitySnapshot | None) -> float | None:
    if snapshot is None:
        return None
    counts = snapshot.counts_by_status or {}
    denominator = sum(
        int(counts.get(name, 0) or 0) for name in ("open", "in_progress", "resolved")
    )
    if not denominator:
        return None
    return _score_rate(int(counts.get("resolved", 0) or 0) / denominator)


def _commerce_presence_point(
    *,
    metric: MetricSnapshot,
    mention: float | None,
    sov: float | None,
    owned: float | None,
    fundamentals: float | None,
    product_score: float | None,
    product_coverage: dict[str, bool],
    opportunity_snapshot: OpportunitySnapshot | None,
    source_ids: dict[str, list[uuid.UUID]],
    versions: dict[str, str],
) -> AIPresencePoint:
    brand_visibility, _nested, _nested_coverage = _weighted_components(
        {COMPONENT_BRAND_MENTION_RATE: mention, COMPONENT_NORMALIZED_SOV: sov},
        BRAND_VISIBILITY_WEIGHTS,
    )
    score, components, coverage = _weighted_components(
        {
            COMPONENT_BRAND_VISIBILITY: brand_visibility,
            COMPONENT_PRODUCT_PRESENCE: product_score,
            COMPONENT_WEB_FUNDAMENTALS: fundamentals,
            COMPONENT_OWNED_CITATION_RATE: owned,
            COMPONENT_OPPORTUNITY_EXECUTION: _opportunity_execution(
                opportunity_snapshot
            ),
        },
        COMMERCE_WEIGHTS,
    )
    coverage[COMPONENT_PRODUCT_PRESENCE] = all(product_coverage.values())
    components[COMPONENT_PRODUCT_PRESENCE] = AIPresenceComponent(
        score=product_score,
        weight=COMMERCE_WEIGHTS[COMPONENT_PRODUCT_PRESENCE],
        available=product_score is not None,
    )
    return AIPresencePoint(
        score=score,
        formula_kind=FORMULA_KIND_COMMERCE,
        formula_version=AI_PRESENCE_FORMULA_VERSION,
        provisional=not all(coverage.values()),
        coverage=coverage,
        components=components,
        source_snapshot_ids=source_ids,
        versions=versions,
        timestamp=metric.created_at,
    )


async def _latest(session: AsyncSession, model, workspace_id, project_id, timestamp):
    return await session.scalar(
        select(model)
        .where(model.workspace_id == workspace_id, model.project_id == project_id)
        .order_by(timestamp.desc())
        .limit(1)
    )


def _source(row, kind: str, timestamp: str = "created_at") -> DashboardSource | None:
    if row is None:
        return None
    return DashboardSource(id=row.id, kind=kind, timestamp=getattr(row, timestamp))


def _section(section_id, title, href, state="empty", metrics=None, source=None):
    return DashboardSection(
        id=section_id,
        title=title,
        href=href,
        state=state,
        metrics=metrics or {},
        source=source,
    )


@dataclass(frozen=True)
class DashboardInputs:
    metric: MetricSnapshot | None
    analytics: AnalyticsSnapshot | None
    traffic: TrafficSnapshot | None
    audit: Audit | None
    commerce: ProductMetricSnapshot | None
    content: ContentGeneration | None
    crawl: SiteCrawl | None
    health: SiteHealthSnapshot | None
    profile: BrandProfile | None
    prompt_count: int | None
    opportunity_count: int | None


async def fetch_latest_sources(
    session: AsyncSession, *, workspace_id: uuid.UUID, project_id: uuid.UUID
) -> DashboardInputs:
    """Fetch the latest persisted source rows on the request transaction."""

    # Every query stays on the request session. Opening independent sessions
    # here would make the projection observe a different transaction (and can
    # miss freshly committed request-scoped rows in tests or integrations).
    metric = await _latest(
        session, MetricSnapshot, workspace_id, project_id, MetricSnapshot.created_at
    )
    analytics = await _latest(
        session,
        AnalyticsSnapshot,
        workspace_id,
        project_id,
        AnalyticsSnapshot.created_at,
    )
    traffic = await _latest(
        session, TrafficSnapshot, workspace_id, project_id, TrafficSnapshot.created_at
    )
    audit = await _latest(session, Audit, workspace_id, project_id, Audit.created_at)
    commerce = await _latest(
        session,
        ProductMetricSnapshot,
        workspace_id,
        project_id,
        ProductMetricSnapshot.created_at,
    )
    content = await _latest(
        session,
        ContentGeneration,
        workspace_id,
        project_id,
        ContentGeneration.created_at,
    )
    crawl = await _latest(
        session, SiteCrawl, workspace_id, project_id, SiteCrawl.created_at
    )
    health = await _latest(
        session,
        SiteHealthSnapshot,
        workspace_id,
        project_id,
        SiteHealthSnapshot.created_at,
    )
    profile = await session.scalar(
        select(BrandProfile).where(
            BrandProfile.workspace_id == workspace_id,
            BrandProfile.project_id == project_id,
        )
    )
    prompt_count = await session.scalar(
        select(func.count(Prompt.id))
        .join(PromptSet, Prompt.prompt_set_id == PromptSet.id)
        .join(Project, PromptSet.project_id == Project.id)
        .where(
            Project.workspace_id == workspace_id,
            PromptSet.project_id == project_id,
            Prompt.status == "active",
        )
    )
    opportunity_count = await session.scalar(
        select(func.count(Opportunity.id)).where(
            Opportunity.workspace_id == workspace_id,
            Opportunity.project_id == project_id,
            Opportunity.superseded_at.is_(None),
            Opportunity.status == "open",
        )
    )
    return DashboardInputs(
        metric=metric,
        analytics=analytics,
        traffic=traffic,
        audit=audit,
        commerce=commerce,
        content=content,
        crawl=crawl,
        health=health,
        profile=profile,
        prompt_count=prompt_count,
        opportunity_count=opportunity_count,
    )


def _visibility_section(inputs: DashboardInputs) -> DashboardSection:
    metric = inputs.metric
    visibility_metrics = dict(metric.metrics or {}) if metric else {}
    visibility_metrics["visibility_score"] = metric.visibility_score if metric else None
    visibility_metrics["completed_answers"] = metric.total_completed if metric else None
    return _section(
        "visibility",
        "Visibility",
        "/visibility",
        "ready" if metric else "empty",
        visibility_metrics,
        _source(metric, "metric_snapshot"),
    )


def _runs_section(inputs: DashboardInputs) -> DashboardSection:
    audit = inputs.audit
    audit_running = audit is not None and audit.status not in AUDIT_TERMINAL_STATUSES
    return _section(
        "runs",
        "Runs",
        "/runs",
        "running" if audit_running else ("ready" if audit else "empty"),
        {
            "status": audit.status if audit else None,
            "completed": audit.completed_count if audit else None,
            "requested": audit.requested_count if audit else None,
        },
        _source(audit, "audit"),
    )


def build_analyze_sections(inputs: DashboardInputs) -> list[DashboardSection]:
    return [
        _visibility_section(inputs),
        _section(
            "answers",
            "Answers",
            "/analytics",
            "ready" if inputs.analytics else "not_setup",
            inputs.analytics.metrics if inputs.analytics else {},
            _source(inputs.analytics, "analytics_snapshot"),
        ),
        _section(
            "traffic",
            "Traffic",
            "/traffic",
            "ready" if inputs.traffic else "not_setup",
            inputs.traffic.metrics if inputs.traffic else {},
            _source(inputs.traffic, "traffic_snapshot"),
        ),
        _section(
            "prompts",
            "Prompts",
            "/prompts",
            "ready" if inputs.prompt_count else "empty",
            {"active": inputs.prompt_count},
        ),
        _section(
            "commerce",
            "Commerce",
            "/products",
            "ready" if inputs.commerce else "empty",
            inputs.commerce.metrics if inputs.commerce else {},
            _source(inputs.commerce, "product_metric_snapshot"),
        ),
        _runs_section(inputs),
    ]


def _site_health_state(inputs: DashboardInputs) -> str:
    crawl, health = inputs.crawl, inputs.health
    crawl_running = (
        crawl is not None and crawl.completed_at is None and crawl.status != "failed"
    )
    if crawl_running:
        return "running"
    if crawl and crawl.status == "failed":
        return "failed"
    if health:
        return "ready"
    return "not_setup"


def _site_health_metrics(inputs: DashboardInputs) -> dict:
    crawl, health = inputs.crawl, inputs.health
    return {
        "overall_score": health.overall_score if health else None,
        "technical_score": health.technical_score if health else None,
        "aeo_score": health.aeo_score if health else None,
        "issues": health.issue_count if health else None,
        "analyzed_urls": crawl.analyzed_url_count if crawl else None,
    }


def build_improve_sections(
    inputs: DashboardInputs, *, active_work: list[str]
) -> list[DashboardSection]:
    crawl, health, content = inputs.crawl, inputs.health, inputs.content
    return [
        _section(
            "content",
            "Content",
            "/content",
            "running"
            if "content" in active_work
            else ("ready" if content else "empty"),
            {"status": content.status if content else None},
            _source(content, "content_generation"),
        ),
        _section(
            "site_health",
            "Site Health",
            "/site-health",
            _site_health_state(inputs),
            _site_health_metrics(inputs),
            _source(
                health or crawl, "site_health_snapshot" if health else "site_crawl"
            ),
        ),
        _section(
            "issues",
            "Issues",
            "/issues",
            "ready" if health else "not_setup",
            {"count": health.issue_count if health else None},
            _source(health, "site_health_snapshot"),
        ),
        _section(
            "opportunities",
            "Opportunities",
            "/opportunities",
            "ready" if inputs.opportunity_count else "empty",
            {"open": inputs.opportunity_count},
        ),
        _section(
            "brand_knowledge",
            "Brand knowledge",
            "/knowledge-base",
            "ready" if inputs.profile else "not_setup",
            {"configured": inputs.profile is not None},
            _source(inputs.profile, "brand_profile", "updated_at"),
        ),
    ]


def assemble_response(
    project: Project,
    inputs: DashboardInputs,
    *,
    ai_presence: AIPresenceResponse | None = None,
) -> DashboardResponse:
    audit_running = (
        inputs.audit is not None and inputs.audit.status not in AUDIT_TERMINAL_STATUSES
    )
    crawl_running = (
        inputs.crawl is not None
        and inputs.crawl.completed_at is None
        and inputs.crawl.status != "failed"
    )
    active_work = []
    if audit_running:
        active_work.append("runs")
    if crawl_running:
        active_work.append("site_health")
    if (
        inputs.content is not None
        and inputs.content.completed_at is None
        and inputs.content.status != "failed"
    ):
        active_work.append("content")
    improve = build_improve_sections(inputs, active_work=active_work)
    improve.append(
        _section(
            "projects",
            "Manage projects",
            "/projects",
            "ready",
            {"active_project": project.brand_name or project.name},
        )
    )
    return DashboardResponse(
        project=DashboardProject(
            id=project.id,
            workspace_id=project.workspace_id,
            name=project.name,
            brand_name=project.brand_name,
            website_url=project.website_url,
        ),
        generated_at=datetime.now(UTC),
        executive_metrics={
            "visibility_score": inputs.metric.visibility_score
            if inputs.metric
            else None,
            "site_health_score": inputs.health.overall_score if inputs.health else None,
            "open_opportunities": (
                inputs.opportunity_count
                if inputs.opportunity_count is not None
                else None
            ),
            "active_prompts": inputs.prompt_count
            if inputs.prompt_count is not None
            else None,
        },
        analyze=build_analyze_sections(inputs),
        improve=improve,
        active_work=active_work,
        ai_presence=ai_presence,
    )


def _latest_health_before(
    health_rows: list[SiteHealthSnapshot], timestamp: datetime
) -> SiteHealthSnapshot | None:
    eligible = [row for row in health_rows if row.created_at <= timestamp]
    return eligible[-1] if eligible else None


def _latest_opportunity_before(
    opportunity_rows: list[OpportunitySnapshot], timestamp: datetime
) -> OpportunitySnapshot | None:
    """Return the recompute projection available when a metric was written."""
    eligible = [row for row in opportunity_rows if row.created_at <= timestamp]
    return eligible[-1] if eligible else None


def _version_identity(point: AIPresencePoint) -> tuple:
    """Exact formula/coverage/version identity required for momentum."""
    return (
        point.formula_kind,
        point.formula_version,
        tuple(sorted(point.coverage.items())),
        tuple(sorted(point.versions.items())),
    )


def finalize_ai_presence_points(
    points: list[AIPresencePoint], *, now: datetime
) -> AIPresenceResponse:
    """Mark comparable points and calculate trailing-30-day momentum purely."""
    if not points:
        return AIPresenceResponse(current=None, momentum=None, trend_points=[])
    ordered = sorted(
        points, key=lambda point: (point.timestamp, str(point.source_snapshot_ids))
    )
    latest = ordered[-1]
    identity = _version_identity(latest)
    for point in ordered:
        point.comparable_to_latest = (
            point.score is not None
            and latest.score is not None
            and _version_identity(point) == identity
        )
    window_start = latest.timestamp - timedelta(days=MOMENTUM_WINDOW_DAYS)
    comparable = [
        point
        for point in ordered
        if point.comparable_to_latest and point.timestamp >= window_start
    ]
    momentum = None
    if (
        len(comparable) >= 2
        and latest.score is not None
        and comparable[0].score is not None
    ):
        momentum = round(latest.score - comparable[0].score, SCORE_ROUNDING_DECIMALS)
    # ``now`` is accepted to make the projection clock explicit for tests; the
    # selected run is the stable latest evidence point, never a clock-derived
    # synthetic value.
    del now
    return AIPresenceResponse(current=latest, momentum=momentum, trend_points=ordered)


async def get_ai_presence(
    session: AsyncSession, *, workspace_id: uuid.UUID, project: Project
) -> AIPresenceResponse:
    """Read the AI Presence series from persisted snapshot rows only."""
    metric_rows = list(
        (
            await session.scalars(
                select(MetricSnapshot)
                .where(
                    MetricSnapshot.workspace_id == workspace_id,
                    MetricSnapshot.project_id == project.id,
                )
                .order_by(MetricSnapshot.created_at.desc(), MetricSnapshot.id.desc())
                .limit(DASHBOARD_MAX_AI_PRESENCE_POINTS)
            )
        ).all()
    )
    if not metric_rows:
        return AIPresenceResponse(current=None, momentum=None, trend_points=[])
    metric_rows.reverse()
    audit_ids = [row.audit_id for row in metric_rows]
    health_rows = list(
        (
            await session.scalars(
                select(SiteHealthSnapshot)
                .where(
                    SiteHealthSnapshot.workspace_id == workspace_id,
                    SiteHealthSnapshot.project_id == project.id,
                )
                .order_by(
                    SiteHealthSnapshot.created_at.asc(), SiteHealthSnapshot.id.asc()
                )
            )
        ).all()
    )
    product_rows = list(
        (
            await session.scalars(
                select(ProductMetricSnapshot).where(
                    ProductMetricSnapshot.workspace_id == workspace_id,
                    ProductMetricSnapshot.project_id == project.id,
                    ProductMetricSnapshot.audit_id.in_(audit_ids),
                )
            )
        ).all()
    )
    products_by_audit: dict[uuid.UUID, list[ProductMetricSnapshot]] = {}
    for product_row in product_rows:
        products_by_audit.setdefault(product_row.audit_id, []).append(product_row)
    # A v1 + v2 product aggregate can coexist. The current projection chooses
    # a single version per frozen entry before formula evaluation.
    from app.domain.products.visibility import select_current_snapshots

    selected_products = {
        audit_id: list(select_current_snapshots(rows).values())
        for audit_id, rows in products_by_audit.items()
    }
    opportunity_rows = list(
        (
            await session.scalars(
                select(OpportunitySnapshot)
                .where(
                    OpportunitySnapshot.workspace_id == workspace_id,
                    OpportunitySnapshot.project_id == project.id,
                    OpportunitySnapshot.audit_id.in_(audit_ids),
                )
                .order_by(
                    OpportunitySnapshot.created_at.asc(), OpportunitySnapshot.id.asc()
                )
            )
        ).all()
    )
    opportunities_by_audit: dict[uuid.UUID, list[OpportunitySnapshot]] = {}
    for opportunity_row in opportunity_rows:
        if opportunity_row.audit_id is not None:
            opportunities_by_audit.setdefault(opportunity_row.audit_id, []).append(
                opportunity_row
            )
    points = [
        build_ai_presence_point(
            metric=metric,
            brand_name=project.brand_name or project.name,
            health=_latest_health_before(health_rows, metric.created_at),
            products=selected_products.get(metric.audit_id, []),
            opportunity_snapshot=_latest_opportunity_before(
                opportunities_by_audit.get(metric.audit_id, []), metric.created_at
            ),
        )
        for metric in metric_rows
    ]
    return finalize_ai_presence_points(points, now=datetime.now(UTC))


async def get_dashboard(
    session: AsyncSession, *, workspace_id: uuid.UUID, project: Project
) -> DashboardResponse:
    inputs = await fetch_latest_sources(
        session, workspace_id=workspace_id, project_id=project.id
    )
    ai_presence = await get_ai_presence(
        session, workspace_id=workspace_id, project=project
    )
    return assemble_response(project, inputs, ai_presence=ai_presence)
