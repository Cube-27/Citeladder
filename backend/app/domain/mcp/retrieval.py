"""Allowlisted, workspace-authorized MCP record retrieval."""

from __future__ import annotations

import uuid
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import date, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.analysis.evidence import get_execution_evidence
from app.domain.mcp.common import (
    _caller_is_member_of,
    current_user_id,
)
from app.domain.mcp.data import project_business_context
from app.domain.mcp.retrieval_document import parse_record_id, retrieval_document
from app.domain.site_health import service as site_health_service
from app.models.analysis import Citation
from app.models.audit import Audit, AuditTask
from app.models.demand import DemandSnapshot, QueryEvidenceRow, QueryEvidenceSnapshot
from app.models.opportunity import Opportunity
from app.models.project import Project
from app.models.prompt import Prompt, PromptSet
from app.models.search_intelligence import (
    SearchIntelligenceDataset,
    SearchIntelligenceRow,
    SearchIntelligenceRun,
)
from app.models.site_health.analysis import SiteIssue, SitePageAnalysis
from app.models.site_health.crawl import SiteCrawl
from app.models.site_health.links import SitePageLinkMetric
from app.models.site_health.snapshot import SiteHealthSnapshot
from app.models.source_pages import (
    SourcePage,
    SourcePageEntityPresence,
    SourcePageSnapshot,
)
from app.models.traffic import TrafficSnapshot


@dataclass(frozen=True)
class _ResolvedRecord:
    record: dict[str, Any]
    title: str
    project_id: uuid.UUID
    observed_at: datetime | date | None


def _resolved(
    record: dict[str, Any] | None,
    title: str,
    project_id: uuid.UUID | None,
    observed_at: datetime | date | None,
) -> _ResolvedRecord | None:
    if record is None or project_id is None:
        return None
    return _ResolvedRecord(record, title, project_id, observed_at)


async def _resolve_project(
    session: AsyncSession, row_id: uuid.UUID
) -> _ResolvedRecord | None:
    record: dict[str, Any] | None = None
    project_id: uuid.UUID | None = None
    observed_at: datetime | date | None = None
    record = await project_business_context(session, str(row_id))
    project_id = row_id
    title = record["project"]["name"]
    return _resolved(record, title, project_id, observed_at)


async def _resolve_opportunity(
    session: AsyncSession, row_id: uuid.UUID
) -> _ResolvedRecord | None:
    record: dict[str, Any] | None = None
    title = "Opportunity"
    project_id: uuid.UUID | None = None
    observed_at: datetime | date | None = None
    row = await session.scalar(
        select(Opportunity).where(
            Opportunity.id == row_id,
            _caller_is_member_of(Opportunity.workspace_id),
        )
    )
    if row:
        project_id = row.project_id
        observed_at = row.created_at
        title = row.title
        record = {
            "id": f"citeladder://opportunity/{row_id}",
            "type": "opportunity",
            "project_id": str(row.project_id),
            "title": row.title,
            "remediation": row.remediation,
            "status": row.status,
            "severity": row.severity,
            "priority_score": row.priority_score,
            "target_url": row.target_url,
            "evidence": row.evidence,
            "provenance": {
                "analyzer_version": row.analyzer_version,
                "rule_version": row.rule_version,
                "formula_version": row.formula_version,
            },
        }
    return _resolved(record, title, project_id, observed_at)


async def _resolve_prompt(
    session: AsyncSession, row_id: uuid.UUID
) -> _ResolvedRecord | None:
    record: dict[str, Any] | None = None
    title = "Prompt"
    project_id: uuid.UUID | None = None
    observed_at: datetime | date | None = None
    row = await session.scalar(
        select(Prompt)
        .join(PromptSet, PromptSet.id == Prompt.prompt_set_id)
        .join(Project, Project.id == PromptSet.project_id)
        .where(
            Prompt.id == row_id,
            _caller_is_member_of(Project.workspace_id),
        )
    )
    if row:
        prompt_project_id = await session.scalar(
            select(PromptSet.project_id).where(PromptSet.id == row.prompt_set_id)
        )
        project_id = prompt_project_id
        observed_at = row.created_at
        title = row.theme or "Prompt"
        record = {
            "id": f"citeladder://prompt/{row_id}",
            "type": "prompt",
            "project_id": str(prompt_project_id),
            "text": row.text,
            "theme": row.theme,
            "intent": row.intent,
            "buyer_stage": row.buyer_stage,
            "status": row.status,
            "origin": row.origin,
            "generation_evidence": row.generation_evidence,
        }
    return _resolved(record, title, project_id, observed_at)


async def _resolve_site_snapshot(
    session: AsyncSession, row_id: uuid.UUID
) -> _ResolvedRecord | None:
    record: dict[str, Any] | None = None
    title = "Site Snapshot"
    project_id: uuid.UUID | None = None
    observed_at: datetime | date | None = None
    row = await session.scalar(
        select(SiteHealthSnapshot).where(
            SiteHealthSnapshot.id == row_id,
            _caller_is_member_of(SiteHealthSnapshot.workspace_id),
        )
    )
    if row:
        project_id = row.project_id
        observed_at = row.created_at
        record = {
            "id": str(row.id),
            "project_id": str(row.project_id),
            "crawl_id": str(row.crawl_id),
            "scores": {
                "web_fundamentals": row.web_fundamentals_score,
                "aeo_readiness": row.aeo_readiness_score,
            },
            "coverage": row.coverage_evidence,
            "coverage_state": row.coverage_state,
            "status_counts": row.status_counts,
            "top_issues": row.top_issues,
            "created_at": row.created_at,
        }
    return _resolved(record, title, project_id, observed_at)


async def _resolve_site_crawl(
    session: AsyncSession, row_id: uuid.UUID
) -> _ResolvedRecord | None:
    record: dict[str, Any] | None = None
    title = "Site Crawl"
    project_id: uuid.UUID | None = None
    observed_at: datetime | date | None = None
    row = await session.scalar(
        select(SiteCrawl).where(
            SiteCrawl.id == row_id,
            _caller_is_member_of(SiteCrawl.workspace_id),
        )
    )
    if row:
        project_id = row.project_id
        observed_at = row.completed_at or row.created_at
        record = {
            "id": str(row.id),
            "project_id": str(row.project_id),
            "status": row.status,
            "discovery_status": row.discovery_status,
            "analysis_status": row.analysis_status,
            "root_url": row.root_url,
            "counts": {
                "admitted": row.admitted_url_count,
                "discovered": row.discovered_url_count,
                "analyzed": row.analyzed_url_count,
                "failed": row.failed_url_count,
            },
            "inventory_complete": row.inventory_complete,
            "partial_reason": row.partial_reason,
            "versions": {
                "extractor": row.extractor_version,
                "analyzer": row.analyzer_version,
                "rule_catalog": row.rule_catalog_version,
                "scoring": row.scoring_version,
            },
            "created_at": row.created_at,
            "completed_at": row.completed_at,
        }
    return _resolved(record, title, project_id, observed_at)


async def _resolve_site_page(
    session: AsyncSession, row_id: uuid.UUID
) -> _ResolvedRecord | None:
    record: dict[str, Any] | None = None
    title = "Site Page"
    project_id: uuid.UUID | None = None
    observed_at: datetime | date | None = None
    analysis = await session.scalar(
        select(SitePageAnalysis).where(
            SitePageAnalysis.id == row_id,
            _caller_is_member_of(SitePageAnalysis.workspace_id),
        )
    )
    if analysis:
        project_id = analysis.project_id
        observed_at = analysis.created_at
        record = await site_health_service.get_page_detail(
            session,
            workspace_id=analysis.workspace_id,
            crawl_id=analysis.crawl_id,
            site_url_id=analysis.site_url_id,
        )
        for issue in record.get("issues", []):
            issue_id = issue.get("occurrence_id")
            if issue_id:
                issue["record_uri"] = f"citeladder://site_issue/{issue_id}"
        title = record.get("title") or record.get("display_url") or title
    return _resolved(record, title, project_id, observed_at)


async def _resolve_site_issue(
    session: AsyncSession, row_id: uuid.UUID
) -> _ResolvedRecord | None:
    record: dict[str, Any] | None = None
    title = "Site Issue"
    project_id: uuid.UUID | None = None
    observed_at: datetime | date | None = None
    row = await session.scalar(
        select(SiteIssue).where(
            SiteIssue.id == row_id,
            _caller_is_member_of(SiteIssue.workspace_id),
        )
    )
    if row:
        project_id = row.project_id
        observed_at = row.created_at
        title = row.description or row.rule_id
        record = {
            "id": str(row.id),
            "project_id": str(row.project_id),
            "crawl_id": str(row.crawl_id),
            "site_url_id": str(row.site_url_id),
            "analysis_id": str(row.analysis_id),
            "evaluation_id": str(row.evaluation_id),
            "source_artifact_id": str(row.source_artifact_id),
            "rule_id": row.rule_id,
            "dimension": row.dimension,
            "category": row.category,
            "severity": row.severity,
            "finding_class": row.finding_class,
            "evidence": row.evidence,
            "description": row.description,
            "remediation": row.remediation,
            "analyzer_version": row.analyzer_version,
            "rule_version": row.rule_version,
        }
    return _resolved(record, title, project_id, observed_at)


async def _resolve_site_link(
    session: AsyncSession, row_id: uuid.UUID
) -> _ResolvedRecord | None:
    record: dict[str, Any] | None = None
    title = "Site Link"
    project_id: uuid.UUID | None = None
    observed_at: datetime | date | None = None
    row = await session.scalar(
        select(SitePageLinkMetric).where(
            SitePageLinkMetric.id == row_id,
            _caller_is_member_of(SitePageLinkMetric.workspace_id),
        )
    )
    if row:
        project_id = row.project_id
        observed_at = row.created_at
        record = {
            "id": str(row.id),
            "project_id": str(row.project_id),
            "crawl_id": str(row.crawl_id),
            "site_url_id": str(row.site_url_id),
            "grain": "page_link_metrics_with_bounded_neighbors",
            "inbound_count": row.inbound_count,
            "outbound_count": row.outbound_count,
            "main_content_inbound_count": row.main_content_inbound_count,
            "main_content_outbound_count": row.main_content_outbound_count,
            "top_inbound": row.top_inbound or [],
            "top_outbound": row.top_outbound or [],
            "anchor_diagnostics": row.anchor_diagnostics or [],
            "extractor_version": row.extractor_version,
            "formula_version": row.formula_version,
        }
    return _resolved(record, title, project_id, observed_at)


async def _resolve_demand_snapshot(
    session: AsyncSession, row_id: uuid.UUID
) -> _ResolvedRecord | None:
    record: dict[str, Any] | None = None
    title = "Demand Snapshot"
    project_id: uuid.UUID | None = None
    observed_at: datetime | date | None = None
    row = await session.scalar(
        select(DemandSnapshot).where(
            DemandSnapshot.id == row_id,
            _caller_is_member_of(DemandSnapshot.workspace_id),
        )
    )
    if row:
        project_id = row.project_id
        observed_at = row.created_at
        record = {
            "id": str(row.id),
            "project_id": str(row.project_id),
            "window_start": row.window_start,
            "window_end": row.window_end,
            "summary": row.summary,
            "coverage": row.coverage,
            "comparison": row.comparison,
            "analyzer_version": row.analyzer_version,
        }
    return _resolved(record, title, project_id, observed_at)


async def _resolve_query_snapshot(
    session: AsyncSession, row_id: uuid.UUID
) -> _ResolvedRecord | None:
    record: dict[str, Any] | None = None
    title = "Query Snapshot"
    project_id: uuid.UUID | None = None
    observed_at: datetime | date | None = None
    row = await session.scalar(
        select(QueryEvidenceSnapshot).where(
            QueryEvidenceSnapshot.id == row_id,
            _caller_is_member_of(QueryEvidenceSnapshot.workspace_id),
        )
    )
    if row:
        project_id = row.project_id
        observed_at = row.created_at
        record = {
            "id": str(row.id),
            "project_id": str(row.project_id),
            "window_start": row.window_start,
            "window_end": row.window_end,
            "state": row.state,
            "coverage": row.coverage,
            "limitations": row.limitations,
            "analyzer_version": row.analyzer_version,
            "resolver_version": row.resolver_version,
        }
    return _resolved(record, title, project_id, observed_at)


async def _resolve_query_row(
    session: AsyncSession, row_id: uuid.UUID
) -> _ResolvedRecord | None:
    record: dict[str, Any] | None = None
    title = "Query Row"
    project_id: uuid.UUID | None = None
    observed_at: datetime | date | None = None
    row = await session.scalar(
        select(QueryEvidenceRow).where(
            QueryEvidenceRow.id == row_id,
            _caller_is_member_of(QueryEvidenceRow.workspace_id),
        )
    )
    if row:
        project_id = row.project_id
        observed_at = row.created_at
        record = {
            "id": str(row.id),
            "project_id": str(row.project_id),
            "snapshot_id": str(row.snapshot_id),
            "date": row.date,
            "query": row.normalized_query,
            "observed_page_url": row.observed_page_url,
            "site_url_id": str(row.site_url_id) if row.site_url_id else None,
            "resolved_page_url": row.resolved_page_url or None,
            "resolution_outcome": row.resolution_outcome,
            "resolution_candidates": row.resolution_candidates,
            "impressions": row.impressions,
            "clicks": row.clicks,
            "ctr": row.ctr,
            "position": row.position,
            "source_metric_row_id": str(row.source_metric_row_id),
            "source_artifact_id": str(row.source_artifact_id),
        }
    return _resolved(record, title, project_id, observed_at)


async def _resolve_audit(
    session: AsyncSession, row_id: uuid.UUID
) -> _ResolvedRecord | None:
    record: dict[str, Any] | None = None
    title = "Audit"
    project_id: uuid.UUID | None = None
    observed_at: datetime | date | None = None
    row = await session.scalar(
        select(Audit).where(
            Audit.id == row_id,
            _caller_is_member_of(Audit.workspace_id),
        )
    )
    if row:
        project_id = row.project_id
        observed_at = row.completed_at or row.created_at
        record = {
            "id": str(row.id),
            "project_id": str(row.project_id),
            "status": row.status,
            "benchmark_mode": row.benchmark_mode,
            "audit_scope": row.audit_scope,
            "counts": {
                "requested": row.requested_count,
                "completed": row.completed_count,
                "failed": row.failed_count,
            },
            "summary": row.summary,
            "analyzer_version": row.analyzer_version,
            "created_at": row.created_at,
            "completed_at": row.completed_at,
        }
    return _resolved(record, title, project_id, observed_at)


async def _resolve_visibility_result(
    session: AsyncSession, row_id: uuid.UUID
) -> _ResolvedRecord | None:
    record: dict[str, Any] | None = None
    title = "Visibility Result"
    project_id: uuid.UUID | None = None
    observed_at: datetime | date | None = None
    task = await session.scalar(
        select(AuditTask).where(
            AuditTask.id == row_id,
            _caller_is_member_of(AuditTask.workspace_id),
        )
    )
    if task:
        project_id = task.project_id
        observed_at = task.completed_at or task.created_at
        evidence = await get_execution_evidence(
            session, workspace_id=task.workspace_id, task_id=task.id
        )
        record = evidence.model_dump(mode="json")
        record["answer_text"] = task.answer_text
        record["search_events"] = task.search_events or []
        title = f"{task.logical_engine} answer for prompt {task.prompt_index + 1}"
    return _resolved(record, title, project_id, observed_at)


async def _resolve_citation(
    session: AsyncSession, row_id: uuid.UUID
) -> _ResolvedRecord | None:
    record: dict[str, Any] | None = None
    title = "Citation"
    project_id: uuid.UUID | None = None
    observed_at: datetime | date | None = None
    row = await session.scalar(
        select(Citation).where(
            Citation.id == row_id,
            _caller_is_member_of(Citation.workspace_id),
        )
    )
    if row:
        audit = await session.scalar(
            select(Audit).where(
                Audit.id == row.audit_id,
                Audit.workspace_id == row.workspace_id,
            )
        )
        if audit:
            project_id = audit.project_id
            observed_at = row.created_at
            title = row.title or row.url or title
            record = {
                "id": str(row.id),
                "project_id": str(audit.project_id),
                "audit_id": str(row.audit_id),
                "analysis_id": str(row.analysis_id),
                "ordinal": row.ordinal,
                "url": row.url,
                "title": row.title,
                "domain": row.domain,
                "classification": row.classification,
                "source_class": row.source_class,
                "source_origin": row.source_origin,
                "is_owned": row.is_owned,
                "is_unintended": row.is_unintended,
                "matched_competitor": row.matched_competitor,
                "resolved_url": row.resolved_url,
                "canonical_url": row.canonical_url,
                "analyzer_version": row.analyzer_version,
            }
    return _resolved(record, title, project_id, observed_at)


async def _resolve_traffic_snapshot(
    session: AsyncSession, row_id: uuid.UUID
) -> _ResolvedRecord | None:
    record: dict[str, Any] | None = None
    title = "Traffic Snapshot"
    project_id: uuid.UUID | None = None
    observed_at: datetime | date | None = None
    row = await session.scalar(
        select(TrafficSnapshot).where(
            TrafficSnapshot.id == row_id,
            _caller_is_member_of(TrafficSnapshot.workspace_id),
        )
    )
    if row:
        project_id = row.project_id
        observed_at = row.created_at
        record = {
            "id": str(row.id),
            "project_id": str(row.project_id),
            "window_start": row.window_start,
            "window_end": row.window_end,
            "granularity": row.granularity,
            "metrics": row.metrics,
            "dimension_counts": row.dimension_counts,
            "coverage": row.coverage,
            "formula_version": row.formula_version,
            "normalization_version": row.normalization_version,
        }
    return _resolved(record, title, project_id, observed_at)


async def _resolve_earned_source_snapshot(
    session: AsyncSession, row_id: uuid.UUID
) -> _ResolvedRecord | None:
    record: dict[str, Any] | None = None
    title = "Earned Source Snapshot"
    project_id: uuid.UUID | None = None
    observed_at: datetime | date | None = None
    row = await session.scalar(
        select(SourcePageSnapshot).where(
            SourcePageSnapshot.id == row_id,
            _caller_is_member_of(SourcePageSnapshot.workspace_id),
        )
    )
    if row:
        source_page = await session.scalar(
            select(SourcePage).where(
                SourcePage.id == row.source_page_id,
                SourcePage.workspace_id == row.workspace_id,
                SourcePage.project_id == row.project_id,
            )
        )
        presences = list(
            (
                await session.scalars(
                    select(SourcePageEntityPresence)
                    .where(
                        SourcePageEntityPresence.workspace_id == row.workspace_id,
                        SourcePageEntityPresence.project_id == row.project_id,
                        SourcePageEntityPresence.snapshot_id == row.id,
                    )
                    .order_by(SourcePageEntityPresence.id.asc())
                )
            ).all()
        )
        project_id = row.project_id
        observed_at = row.fetched_at
        title = (
            str((row.page_facts or {}).get("title") or row.final_url)
            or "Inspected source page"
        )
        record = {
            "id": str(row.id),
            "project_id": str(row.project_id),
            "source_page_id": str(row.source_page_id),
            "audit_id": str(row.audit_id) if row.audit_id else None,
            "canonical_url": source_page.canonical_url if source_page else None,
            "source_class": source_page.source_class if source_page else None,
            "page_format": source_page.page_format if source_page else None,
            "page_format_method": (
                source_page.page_format_method if source_page else None
            ),
            "requested_url": row.requested_url,
            "final_url": row.final_url,
            "redirect_chain": row.redirect_chain,
            "status_code": row.status_code,
            "content_type": row.content_type,
            "body_bytes": row.body_bytes,
            "page_facts": row.page_facts,
            "evidence_passages": row.evidence_passages,
            "extracted_chars": row.extracted_chars,
            "robots_state": row.robots_state,
            "outcome": row.outcome,
            "outcome_reason": row.outcome_reason,
            "entity_presences": [
                {
                    "id": str(presence.id),
                    "entity_kind": presence.entity_kind,
                    "entity_name": presence.entity_name,
                    "presence": presence.presence,
                    "match_method": presence.match_method,
                    "match_count": presence.match_count,
                    "passage_refs": presence.passage_refs or [],
                }
                for presence in presences
            ],
            "extractor_version": row.extractor_version,
            "inspector_version": row.inspector_version,
            "fetched_at": row.fetched_at,
        }
    return _resolved(record, title, project_id, observed_at)


async def _resolve_search_run(
    session: AsyncSession, row_id: uuid.UUID
) -> _ResolvedRecord | None:
    record: dict[str, Any] | None = None
    title = "Search Run"
    project_id: uuid.UUID | None = None
    observed_at: datetime | date | None = None
    row = await session.scalar(
        select(SearchIntelligenceRun).where(
            SearchIntelligenceRun.id == row_id,
            _caller_is_member_of(SearchIntelligenceRun.workspace_id),
        )
    )
    if row:
        project_id = row.project_id
        observed_at = row.completed_at or row.created_at
        record = {
            "id": str(row.id),
            "project_id": str(row.project_id),
            "status": row.status,
            "action": row.action,
            "frozen_scope": row.frozen_scope,
            "pricing_version": row.pricing_version,
            "counts": {
                "planned_calls": row.planned_calls,
                "completed_calls": row.completed_calls,
                "planned_rows": row.planned_rows,
                "received_rows": row.received_rows,
                "uncertain_calls": row.uncertain_calls,
            },
            "error_code": row.error_code,
            "created_at": row.created_at,
            "completed_at": row.completed_at,
        }
    return _resolved(record, title, project_id, observed_at)


async def _resolve_search_dataset(
    session: AsyncSession, row_id: uuid.UUID
) -> _ResolvedRecord | None:
    record: dict[str, Any] | None = None
    title = "Search Dataset"
    project_id: uuid.UUID | None = None
    observed_at: datetime | date | None = None
    row = await session.scalar(
        select(SearchIntelligenceDataset).where(
            SearchIntelligenceDataset.id == row_id,
            SearchIntelligenceDataset.status == "published",
            _caller_is_member_of(SearchIntelligenceDataset.workspace_id),
        )
    )
    if row:
        project_id = row.project_id
        observed_at = row.published_at or row.created_at
        from app.domain.demand.search_intelligence.service import dataset_dict

        record = dataset_dict(row)
    return _resolved(record, title, project_id, observed_at)


async def _resolve_search_row(
    session: AsyncSession, row_id: uuid.UUID
) -> _ResolvedRecord | None:
    record: dict[str, Any] | None = None
    title = "Search Row"
    project_id: uuid.UUID | None = None
    observed_at: datetime | date | None = None
    row = await session.scalar(
        select(SearchIntelligenceRow)
        .join(
            SearchIntelligenceDataset,
            SearchIntelligenceDataset.id == SearchIntelligenceRow.dataset_id,
        )
        .where(
            SearchIntelligenceRow.id == row_id,
            SearchIntelligenceDataset.status == "published",
            _caller_is_member_of(SearchIntelligenceRow.workspace_id),
        )
    )
    if row:
        project_id = row.project_id
        observed_at = row.created_at
        from app.domain.demand.search_intelligence.service import row_dict

        record = row_dict(row)
    return _resolved(record, title, project_id, observed_at)


_RecordResolver = Callable[[AsyncSession, uuid.UUID], Awaitable[_ResolvedRecord | None]]

_RESOLVERS: dict[str, _RecordResolver] = {
    "project": _resolve_project,
    "opportunity": _resolve_opportunity,
    "prompt": _resolve_prompt,
    "site_snapshot": _resolve_site_snapshot,
    "site_crawl": _resolve_site_crawl,
    "site_page": _resolve_site_page,
    "site_issue": _resolve_site_issue,
    "site_link": _resolve_site_link,
    "demand_snapshot": _resolve_demand_snapshot,
    "query_snapshot": _resolve_query_snapshot,
    "query_row": _resolve_query_row,
    "audit": _resolve_audit,
    "visibility_result": _resolve_visibility_result,
    "citation": _resolve_citation,
    "traffic_snapshot": _resolve_traffic_snapshot,
    "earned_source_snapshot": _resolve_earned_source_snapshot,
    "search_run": _resolve_search_run,
    "search_dataset": _resolve_search_dataset,
    "search_row": _resolve_search_row,
}


async def fetch_business_record(
    session: AsyncSession, record_id: str
) -> dict[str, Any]:
    kind, row_id, requested_part = parse_record_id(record_id)
    current_user_id()
    resolved = await _RESOLVERS[kind](session, row_id)
    if resolved is None:
        raise LookupError("The requested record was not found in this account")
    return retrieval_document(
        kind,
        row_id,
        requested_part,
        resolved.record,
        resolved.title,
        resolved.project_id,
        resolved.observed_at,
    )
