"""Canonical, persisted context projection for content generation."""

from __future__ import annotations

import json
import uuid
from collections.abc import Sequence
from dataclasses import dataclass, field
from typing import Any
from urllib.parse import urlsplit

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config.content import (
    CONTENT_CONTEXT_STATUS_INCLUDED,
    CONTENT_CONTEXT_STATUS_UNAVAILABLE,
    CONTENT_CONTEXT_VERSION,
)
from app.domain.content.website_context import (
    CrawlFragmentSelection,
    normalized_target_url,
    select_crawl_fragments,
)
from app.domain.opportunities.content_handoff import project_content_handoff
from app.domain.site_health.service.aeo_readiness import get_content_handoff
from app.domain.site_health.service.common import SiteHealthNotFoundError
from app.models.brand import Brand, BrandAlias, BrandProfile, Competitor
from app.models.demand import DemandSignal, DemandSnapshot
from app.models.opportunity import Opportunity
from app.models.project import Project
from app.models.site_health.urls import SiteUrl


class ContentContextNotFoundError(LookupError):
    """An origin was missing or outside the active workspace/project."""


class ContentContextConflictError(ValueError):
    """Two explicit origins selected different owned target pages."""


@dataclass(frozen=True)
class _ContentOrigins:
    project: Project
    target_url: str
    target_site_url_id: uuid.UUID | None
    opportunity: Opportunity | None
    site_health_handoff: dict | None
    demand_signal: DemandSignal | None
    demand_snapshot: DemandSnapshot | None


@dataclass(frozen=True)
class ContentContext:
    """The only generation context shape, frozen before provider I/O."""

    brand_block: str = ""
    target_page_block: str = ""
    issue_block: str = ""
    related_site_block: str = ""
    summary: dict[str, Any] = field(default_factory=dict)
    version: str = CONTENT_CONTEXT_VERSION

    @property
    def status(self) -> str:
        return (
            CONTENT_CONTEXT_STATUS_INCLUDED
            if any(self.reference_blocks())
            else CONTENT_CONTEXT_STATUS_UNAVAILABLE
        )

    def reference_blocks(self) -> list[str]:
        return [
            block
            for block in (
                self.brand_block,
                self.target_page_block,
                self.issue_block,
                self.related_site_block,
            )
            if block
        ]

    def snapshot(self) -> dict[str, Any]:
        return {
            "version": self.version,
            "brand_block": self.brand_block,
            "target_page_block": self.target_page_block,
            "issue_block": self.issue_block,
            "related_site_block": self.related_site_block,
            "summary": self.summary,
        }

    @classmethod
    def from_snapshot(cls, value: dict[str, Any]) -> ContentContext:
        value = value or {}
        return cls(
            brand_block=str(value.get("brand_block") or ""),
            target_page_block=str(value.get("target_page_block") or ""),
            issue_block=str(value.get("issue_block") or ""),
            related_site_block=str(value.get("related_site_block") or ""),
            summary=dict(value.get("summary") or {}),
            version=str(value.get("version") or CONTENT_CONTEXT_VERSION),
        )


async def _resolve_content_origins(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    target_site_url_id: uuid.UUID | None = None,
    target_url: str | None = None,
    opportunity_id: uuid.UUID | None = None,
    demand_signal_id: uuid.UUID | None = None,
    site_health_reference: Any | None = None,
) -> _ContentOrigins:
    """Resolve every request identifier under one context-owned authority."""
    project = await session.scalar(
        select(Project).where(
            Project.id == project_id, Project.workspace_id == workspace_id
        )
    )
    if project is None:
        raise ContentContextNotFoundError("Project not found")
    target, opportunity, signal, snapshot, handoff = await _origin_records(
        session,
        workspace_id=workspace_id,
        project_id=project_id,
        target_site_url_id=target_site_url_id,
        opportunity_id=opportunity_id,
        demand_signal_id=demand_signal_id,
        site_health_reference=site_health_reference,
    )
    if (
        handoff
        and target
        and site_health_reference is not None
        and target.id != site_health_reference.site_url_id
    ):
        raise ContentContextConflictError("target page conflicts with Site Health")
    return _ContentOrigins(
        project=project,
        target_url=_origin_target_url(
            target=target,
            target_url=target_url,
            handoff=handoff,
            opportunity=opportunity,
            signal=signal,
            project_url=project.website_url,
        ),
        target_site_url_id=target.id if target else None,
        opportunity=opportunity,
        site_health_handoff=handoff,
        demand_signal=signal,
        demand_snapshot=snapshot,
    )


async def _origin_records(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    target_site_url_id: uuid.UUID | None,
    opportunity_id: uuid.UUID | None,
    demand_signal_id: uuid.UUID | None,
    site_health_reference: Any | None,
) -> tuple[
    SiteUrl | None,
    Opportunity | None,
    DemandSignal | None,
    DemandSnapshot | None,
    dict | None,
]:
    target = await _target_site_url(
        session,
        workspace_id=workspace_id,
        project_id=project_id,
        target_site_url_id=target_site_url_id,
    )
    opportunity = await _opportunity(
        session,
        workspace_id=workspace_id,
        project_id=project_id,
        opportunity_id=opportunity_id,
    )
    signal, snapshot = await _demand_signal(
        session,
        workspace_id=workspace_id,
        project_id=project_id,
        demand_signal_id=demand_signal_id,
    )
    handoff = await _site_health_handoff(
        session,
        workspace_id=workspace_id,
        project_id=project_id,
        reference=site_health_reference,
    )
    return target, opportunity, signal, snapshot, handoff


def _origin_target_url(
    *,
    target: SiteUrl | None,
    target_url: str | None,
    handoff: dict | None,
    opportunity: Opportunity | None,
    signal: DemandSignal | None,
    project_url: str,
) -> str:
    candidates = (
        target.normalized_url if target else "",
        (target_url or "").strip(),
        str((handoff or {}).get("normalized_url") or ""),
        _owned_url(opportunity.target_url or "", project_url) if opportunity else "",
        _owned_url(signal.page_url, project_url) if signal else "",
    )
    return next((candidate for candidate in candidates if candidate), "")


async def _target_site_url(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    target_site_url_id: uuid.UUID | None,
) -> SiteUrl | None:
    if target_site_url_id is None:
        return None
    target = await session.scalar(
        select(SiteUrl).where(
            SiteUrl.id == target_site_url_id,
            SiteUrl.workspace_id == workspace_id,
            SiteUrl.project_id == project_id,
        )
    )
    if target is None:
        raise ContentContextNotFoundError("Target page not found")
    return target


async def _opportunity(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    opportunity_id: uuid.UUID | None,
) -> Opportunity | None:
    if opportunity_id is None:
        return None
    opportunity = await session.scalar(
        select(Opportunity).where(
            Opportunity.id == opportunity_id,
            Opportunity.workspace_id == workspace_id,
            Opportunity.project_id == project_id,
        )
    )
    if opportunity is None:
        raise ContentContextNotFoundError("Opportunity not found")
    return opportunity


async def _demand_signal(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    demand_signal_id: uuid.UUID | None,
) -> tuple[DemandSignal | None, DemandSnapshot | None]:
    if demand_signal_id is None:
        return None, None
    pair = await session.execute(
        select(DemandSignal, DemandSnapshot)
        .join(DemandSnapshot, DemandSnapshot.id == DemandSignal.snapshot_id)
        .where(
            DemandSignal.id == demand_signal_id,
            DemandSignal.workspace_id == workspace_id,
            DemandSignal.project_id == project_id,
            DemandSnapshot.workspace_id == workspace_id,
            DemandSnapshot.project_id == project_id,
        )
    )
    result = pair.one_or_none()
    if result is None:
        raise ContentContextNotFoundError("Demand signal not found")
    signal, snapshot = result
    return signal, snapshot


async def _site_health_handoff(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    reference: Any | None,
) -> dict | None:
    if reference is None:
        return None
    if reference.project_id != project_id:
        raise ContentContextNotFoundError("Site Health reference not found")
    try:
        return await get_content_handoff(
            session,
            workspace_id=workspace_id,
            project_id=project_id,
            crawl_id=reference.crawl_id,
            site_url_id=reference.site_url_id,
            source_analysis_id=reference.source_analysis_id,
            dimension=reference.dimension,
            checkpoint_ids=reference.checkpoint_ids,
        )
    except SiteHealthNotFoundError as error:
        raise ContentContextNotFoundError(str(error)) from error


def _owned_url(candidate: str, project_url: str) -> str:
    candidate_host = (urlsplit(candidate).hostname or "").casefold()
    project_host = (urlsplit(project_url).hostname or "").casefold()
    return candidate if candidate_host and candidate_host == project_host else ""


def _labelled(lines: Sequence[tuple[str, object]]) -> list[str]:
    rendered = []
    for label, value in lines:
        if isinstance(value, list):
            value = ", ".join(str(item).strip() for item in value if str(item).strip())
        text = str(value or "").strip()
        if text:
            rendered.append(f"{label}: {text}")
    return rendered


async def _render_brand(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    project: Project,
) -> tuple[str, list[str]]:
    profile = await session.scalar(
        select(BrandProfile).where(
            BrandProfile.workspace_id == workspace_id,
            BrandProfile.project_id == project.id,
        )
    )
    aliases = list(
        (
            await session.scalars(
                select(BrandAlias.alias)
                .join(Brand, Brand.id == BrandAlias.brand_id)
                .join(Project, Project.id == Brand.project_id)
                .where(
                    Brand.project_id == project.id,
                    Project.workspace_id == workspace_id,
                )
                .order_by(BrandAlias.created_at)
            )
        ).all()
    )
    competitors = list(
        (
            await session.scalars(
                select(Competitor.name)
                .join(Project, Project.id == Competitor.project_id)
                .where(
                    Competitor.project_id == project.id,
                    Project.workspace_id == workspace_id,
                )
                .order_by(Competitor.created_at)
            )
        ).all()
    )
    context = dict(profile.business_context or {}) if profile else {}
    fields = []
    values: list[tuple[str, object]] = [
        ("Name", project.brand_name or project.name),
        ("Website", project.website_url),
        ("Market and language", _project_locale(project)),
        ("Aliases", aliases),
        ("Known competitors", competitors),
    ]
    profile_values, profile_fields = _profile_brand_values(profile)
    context_values, context_fields = _business_context_values(context, project)
    values.extend(profile_values)
    values.extend(context_values)
    fields.extend(profile_fields)
    fields.extend(context_fields)
    lines = _labelled(values)
    return ("BRAND\n" + "\n".join(lines) if lines else "", fields)


def _profile_brand_values(
    profile: BrandProfile | None,
) -> tuple[list[tuple[str, object]], list[str]]:
    fields = ("description", "positioning", "products_services", "target_audience")
    labels = ("What they do", "Positioning", "Products and services", "Audience")
    values = [getattr(profile, field) if profile else "" for field in fields]
    return list(zip(labels, values, strict=True)), [
        field for field, value in zip(fields, values, strict=True) if value
    ]


def _business_context_values(
    context: dict, project: Project
) -> tuple[list[tuple[str, object]], list[str]]:
    fallbacks = {
        "category": project.subindustry,
        "sector": project.industry,
    }
    entries = (
        ("category", "Business category"),
        ("business_model", "Business model"),
        ("market_scope", "Market scope"),
        ("buyer_type", "Buyer type"),
        ("buyer_register", "Buyer register"),
        ("sector", "Sector"),
    )
    values = [
        (label, context.get(key) or fallbacks.get(key, "")) for key, label in entries
    ]
    fields = [
        f"business_context.{key}"
        for (key, _), (_, value) in zip(entries, values, strict=True)
        if value
    ]
    return values, fields


def _project_locale(project: Project) -> str:
    """Market/language hint so drafts stay in the project's locale."""
    return " ".join(
        part
        for part in (
            project.country_code or project.primary_market,
            project.language_code,
        )
        if part
    ).strip()


def _render_page(page: dict, *, heading: str) -> str:
    lines = [f"SOURCE: {page.get('final_url') or ''}"]
    lines.extend(
        _labelled(
            [
                ("Title", page.get("title")),
                ("Description", page.get("meta_description")),
                ("Page kind", page.get("page_kind")),
                ("Structured data", page.get("structured_data_types")),
                ("H1", page.get("h1")),
                ("Sections", page.get("h2")),
                ("Content", page.get("body_text")),
            ]
        )
    )
    return f"{heading}\n\n" + "\n".join(lines)


def _render_opportunity(opportunity: Opportunity | None) -> str:
    if opportunity is None:
        return ""
    handoff = project_content_handoff(opportunity) or {}
    citations = [
        " — ".join(
            value
            for value in (
                str(item.get("title") or ""),
                str(item.get("url") or ""),
            )
            if value
        )
        for item in handoff.get("representative_citations") or []
        if isinstance(item, dict)
    ]
    lines = _labelled(
        [
            ("Opportunity", opportunity.title),
            ("Recommended action", opportunity.remediation),
            ("Action pathway", handoff.get("pathway")),
            ("Source class", handoff.get("source_class")),
            ("Target URL", handoff.get("target_url")),
            ("Target theme", handoff.get("target_theme")),
            ("Affected themes", handoff.get("affected_themes")),
            ("Observed competitors", handoff.get("observed_competitors")),
            ("Representative cited pages", citations),
            ("Limitations", handoff.get("limitations")),
        ]
    )
    return "OPPORTUNITY EVIDENCE\n" + "\n".join(lines) if lines else ""


def _render_site_health(handoff: dict | None) -> str:
    if not handoff:
        return ""
    lines = _labelled(
        [
            ("Affected page", handoff.get("normalized_url")),
            ("Dimension", handoff.get("dimension")),
            ("Checkpoints", handoff.get("checkpoint_ids")),
            ("Expected capability", handoff.get("expected_capability")),
            ("Remediation", handoff.get("remediation")),
            ("Observed page kind", handoff.get("page_kind")),
            ("Observed page traits", handoff.get("page_traits")),
            ("Observed evidence", json.dumps(handoff.get("observed_evidence") or [])),
        ]
    )
    return "SITE HEALTH EVIDENCE\n" + "\n".join(lines) if lines else ""


def _render_demand(signal: DemandSignal | None, snapshot: DemandSnapshot | None) -> str:
    if signal is None or snapshot is None:
        return ""
    lines = _labelled(
        [
            ("Demand signal", signal.signal_type),
            ("State", signal.state),
            ("Topic", signal.topic_cluster),
            ("Current page", signal.page_url),
            ("Window start", snapshot.window_start),
            ("Window end", snapshot.window_end),
            ("Demand snapshot", snapshot.id),
            ("Source artifacts", snapshot.source_artifact_ids),
            ("Metrics", json.dumps(signal.metrics or {}, sort_keys=True)),
            ("Evidence", json.dumps(signal.evidence or {}, sort_keys=True)),
            ("Coverage", json.dumps(signal.coverage or {}, sort_keys=True)),
            ("Limitations", signal.limitations),
        ]
    )
    return "DEMAND EVIDENCE\n" + "\n".join(lines) if lines else ""


def _selection_summary(
    selection: CrawlFragmentSelection,
    *,
    brand_memory: bool,
    brand_fields: list[str],
    target_page: dict | None,
    target_url: str,
    related_page_count: int,
    opportunity: Opportunity | None,
    site_health_handoff: dict | None,
    demand_signal: DemandSignal | None,
    demand_snapshot: DemandSnapshot | None,
) -> dict[str, Any]:
    summary = selection.summary or {}
    return {
        "brand_memory": brand_memory,
        "target_page": _target_label(target_page, target_url),
        "issue_count": _issue_count(opportunity, site_health_handoff, demand_signal),
        "related_page_count": related_page_count,
        "target_url": target_url or None,
        "crawl_page_count": len(selection.pages),
        "crawl_urls": [str(page.get("final_url") or "") for page in selection.pages],
        "crawl_completed_at": summary.get("crawl_completed_at"),
        "brand_fields": brand_fields,
        "opportunity_id": str(opportunity.id) if opportunity else None,
        "site_health_reference": _bounded_site_health_reference(site_health_handoff),
        "demand_signal_id": str(demand_signal.id) if demand_signal else None,
        "demand_snapshot_id": str(demand_snapshot.id) if demand_snapshot else None,
        "selection_policy_version": summary.get("selection_policy_version", ""),
        "omissions": list(summary.get("omissions") or []),
    }


def _target_label(target_page: dict | None, target_url: str) -> str:
    if target_page is None:
        return target_url
    title = target_page.get("title")
    if title:
        return str(title)
    return str(target_page.get("final_url") or target_url)


def _issue_count(
    opportunity: Opportunity | None,
    site_health_handoff: dict | None,
    demand_signal: DemandSignal | None,
) -> int:
    count = int(opportunity is not None) + int(demand_signal is not None)
    if site_health_handoff:
        count += len(site_health_handoff.get("checkpoint_ids") or [])
    return count


def _bounded_site_health_reference(handoff: dict | None) -> dict[str, object] | None:
    if not handoff:
        return None
    return {
        "crawl_id": str(handoff.get("crawl_id") or ""),
        "site_url_id": str(handoff.get("site_url_id") or ""),
        "source_analysis_id": str(handoff.get("source_analysis_id") or ""),
        "dimension": str(handoff.get("dimension") or ""),
        "checkpoint_ids": list(handoff.get("checkpoint_ids") or []),
    }


async def build_content_context(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    user_instruction: str,
    target_site_url_id: uuid.UUID | None = None,
    target_url: str = "",
    opportunity_id: uuid.UUID | None = None,
    demand_signal_id: uuid.UUID | None = None,
    site_health_reference: Any | None = None,
) -> ContentContext:
    """Build one context from authorized persisted sources; never fetches."""
    origins = await _resolve_content_origins(
        session,
        workspace_id=workspace_id,
        project_id=project_id,
        target_site_url_id=target_site_url_id,
        target_url=target_url,
        opportunity_id=opportunity_id,
        demand_signal_id=demand_signal_id,
        site_health_reference=site_health_reference,
    )
    selection = await select_crawl_fragments(
        session,
        workspace_id=workspace_id,
        project_id=project_id,
        query_text=_origin_query(user_instruction, origins),
        target_url=origins.target_url,
    )
    brand_block, fields = await _render_brand(
        session,
        workspace_id=workspace_id,
        project=origins.project,
    )
    target_page, related_pages = _target_and_related_pages(selection, origins)
    issue_blocks = [
        _render_opportunity(origins.opportunity),
        _render_site_health(origins.site_health_handoff),
        _render_demand(origins.demand_signal, origins.demand_snapshot),
    ]
    related_blocks = [
        _render_page(page, heading="SOURCE").removeprefix("SOURCE\n\n")
        for page in related_pages
    ]
    return ContentContext(
        brand_block=brand_block,
        target_page_block=(
            _render_page(target_page, heading="TARGET PAGE")
            if target_page
            else _render_target_url(origins.target_url)
        ),
        issue_block="\n\n".join(block for block in issue_blocks if block),
        related_site_block=("RELATED SITE CONTEXT\n\n" + "\n\n".join(related_blocks))
        if related_blocks
        else "",
        summary=_selection_summary(
            selection,
            brand_memory=bool(brand_block),
            brand_fields=fields,
            target_page=target_page,
            target_url=origins.target_url,
            related_page_count=len(related_pages),
            opportunity=origins.opportunity,
            site_health_handoff=origins.site_health_handoff,
            demand_signal=origins.demand_signal,
            demand_snapshot=origins.demand_snapshot,
        ),
    )


def _origin_query(user_instruction: str, origins: _ContentOrigins) -> str:
    return " ".join(
        item
        for item in (
            user_instruction,
            origins.opportunity.target_theme if origins.opportunity else "",
            origins.demand_signal.topic_cluster if origins.demand_signal else "",
        )
        if item
    )


def _target_and_related_pages(
    selection: CrawlFragmentSelection, origins: _ContentOrigins
) -> tuple[dict | None, list[dict]]:
    target = next(
        (
            page
            for page in selection.pages
            if (
                origins.target_site_url_id
                and page.get("site_url_id") == str(origins.target_site_url_id)
            )
            or _same_url(page.get("final_url"), origins.target_url)
        ),
        None,
    )
    return target, [page for page in selection.pages if page is not target]


def _same_url(first: object, second: str) -> bool:
    """Match the selector's own comparison, so a scheme difference still binds."""
    if not second:
        return False
    return normalized_target_url(str(first or "")) == normalized_target_url(second)


def _render_target_url(target_url: str) -> str:
    return f"TARGET PAGE\n\nURL: {target_url}" if target_url else ""
