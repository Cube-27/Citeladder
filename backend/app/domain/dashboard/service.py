from __future__ import annotations

import uuid
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


async def get_dashboard(
    session: AsyncSession, *, workspace_id: uuid.UUID, project: Project
) -> DashboardResponse:
    project_id = project.id

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

    audit_running = audit is not None and audit.status not in AUDIT_TERMINAL_STATUSES
    crawl_running = (
        crawl is not None and crawl.completed_at is None and crawl.status != "failed"
    )
    active_work = []
    if audit_running:
        active_work.append("runs")
    if crawl_running:
        active_work.append("site_health")
    if (
        content is not None
        and content.completed_at is None
        and content.status != "failed"
    ):
        active_work.append("content")

    visibility_metrics = dict(metric.metrics or {}) if metric else {}
    visibility_metrics["visibility_score"] = metric.visibility_score if metric else None
    visibility_metrics["completed_answers"] = metric.total_completed if metric else None
    health_metrics = {
        "overall_score": health.overall_score if health else None,
        "technical_score": health.technical_score if health else None,
        "aeo_score": health.aeo_score if health else None,
        "issues": health.issue_count if health else None,
        "analyzed_urls": crawl.analyzed_url_count if crawl else None,
    }
    analyze = [
        _section(
            "visibility",
            "Visibility",
            "/visibility",
            "ready" if metric else "empty",
            visibility_metrics,
            _source(metric, "metric_snapshot"),
        ),
        _section(
            "answers",
            "Answers",
            "/analytics",
            "ready" if analytics else "not_setup",
            analytics.metrics if analytics else {},
            _source(analytics, "analytics_snapshot"),
        ),
        _section(
            "traffic",
            "Traffic",
            "/traffic",
            "ready" if traffic else "not_setup",
            traffic.metrics if traffic else {},
            _source(traffic, "traffic_snapshot"),
        ),
        _section(
            "prompts",
            "Prompts",
            "/prompts",
            "ready" if prompt_count else "empty",
            {"active": prompt_count},
        ),
        _section(
            "commerce",
            "Commerce",
            "/products",
            "ready" if commerce else "empty",
            commerce.metrics if commerce else {},
            _source(commerce, "product_metric_snapshot"),
        ),
        _section(
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
        ),
    ]
    site_health_state = "running" if crawl_running else "not_setup"
    if not crawl_running and crawl and crawl.status == "failed":
        site_health_state = "failed"
    elif not crawl_running and health:
        site_health_state = "ready"
    improve = [
        _section(
            "content",
            "Content",
            "/content",
            (
                "running"
                if "content" in active_work
                else ("ready" if content else "empty")
            ),
            {"status": content.status if content else None},
            _source(content, "content_generation"),
        ),
        _section(
            "site_health",
            "Site Health",
            "/site-health",
            site_health_state,
            health_metrics,
            _source(
                health or crawl,
                "site_health_snapshot" if health else "site_crawl",
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
            "ready" if opportunity_count else "empty",
            {"open": opportunity_count},
        ),
        _section(
            "brand_knowledge",
            "Brand knowledge",
            "/knowledge-base",
            "ready" if profile else "not_setup",
            {"configured": profile is not None},
            _source(profile, "brand_profile", "updated_at"),
        ),
        _section(
            "projects",
            "Manage projects",
            "/projects",
            "ready",
            {"active_project": project.brand_name or project.name},
        ),
    ]
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
            "visibility_score": metric.visibility_score if metric else None,
            "site_health_score": health.overall_score if health else None,
            "open_opportunities": (
                opportunity_count if opportunity_count is not None else None
            ),
            "active_prompts": prompt_count if prompt_count is not None else None,
        },
        analyze=analyze,
        improve=improve,
        active_work=active_work,
    )
