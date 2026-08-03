from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config.audits import AUDIT_TERMINAL_STATUSES
from app.domain.dashboard.schemas import (
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
from app.models.opportunity import Opportunity
from app.models.product import ProductMetricSnapshot
from app.models.project import Project
from app.models.prompt import Prompt, PromptSet
from app.models.site_health import SiteCrawl, SiteHealthSnapshot
from app.models.traffic import TrafficSnapshot


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


def assemble_response(project: Project, inputs: DashboardInputs) -> DashboardResponse:
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
    )


async def get_dashboard(
    session: AsyncSession, *, workspace_id: uuid.UUID, project: Project
) -> DashboardResponse:
    inputs = await fetch_latest_sources(
        session, workspace_id=workspace_id, project_id=project.id
    )
    return assemble_response(project, inputs)
