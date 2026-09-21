"""Bounded, workspace-authorized read projections exposed through MCP."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any
from urllib.parse import quote

from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config.agent import AGENT_TASK_POLICIES
from app.core.config.content import (
    CONTENT_SKILL_CATALOG_VERSION,
    CONTENT_SKILL_REGISTRY,
)
from app.core.config.mcp import (
    MCP_MAX_SEARCH_RESULTS,
    mcp_public_origin,
)
from app.domain.agent.tools import ToolExecutionContext, execute_tool
from app.domain.demand.search_intelligence.service import (
    readiness as search_intelligence_readiness,
)
from app.domain.mcp.common import (
    _authorized_project,
    _caller_is_member_of,
    _cursor_decode,
    _cursor_encode,
    _limit,
    _normalize_refs,
    current_user_id,
)
from app.domain.mcp.schemas import page
from app.models.brand import BrandProfile, Competitor, OwnedDomain
from app.models.opportunity import Opportunity
from app.models.project import Project
from app.models.prompt import Prompt, PromptSet
from app.models.workspace import Workspace

# Project context excludes paged performance tables. The mapping is also the
# single authority for section selection in this projection.
_INTEGRATIONS_READ = "integrations.read_status"
_CONTEXT_SECTIONS_BY_TOOL = {
    "site.read_snapshot": "site_health",
    "demand.read_snapshot": "demand",
    "opportunities.read_ranked": "opportunities",
    "audits.read_latest": "visibility",
    "performance.read_snapshot": "performance",
    "referrals.read_snapshot": "referrals",
    _INTEGRATIONS_READ: "integrations",
}


async def list_account_projects(
    session: AsyncSession, *, cursor: str | None = None, limit: int | None = None
) -> dict[str, Any]:
    bounded = _limit(limit)
    statement = (
        select(Project, Workspace)
        .join(Workspace, Workspace.id == Project.workspace_id)
        .where(_caller_is_member_of(Project.workspace_id))
    )
    if cursor:
        created_at, row_id = _cursor_decode(cursor, 2)
        try:
            cursor_at = datetime.fromisoformat(created_at)
            cursor_id = uuid.UUID(row_id)
        except ValueError as exc:
            raise ValueError("cursor is invalid") from exc
        statement = statement.where(
            or_(
                Project.created_at > cursor_at,
                and_(Project.created_at == cursor_at, Project.id > cursor_id),
            )
        )
    rows = list(
        (
            await session.execute(
                statement.order_by(Project.created_at.asc(), Project.id.asc()).limit(
                    bounded + 1
                )
            )
        ).all()
    )
    emitted = rows[:bounded]
    next_cursor = (
        _cursor_encode(emitted[-1][0].created_at.isoformat(), emitted[-1][0].id)
        if len(rows) > bounded
        else None
    )
    return {
        "scope": "account",
        "projects": [
            {
                "id": str(project.id),
                "workspace_id": str(project.workspace_id),
                "workspace_name": workspace.name,
                "name": project.name,
                "brand_name": project.brand_name,
                "website_url": project.website_url,
                "industry": project.industry,
                "primary_market": project.primary_market,
            }
            for project, workspace in emitted
        ],
        "pagination": page(items=[], next_cursor=next_cursor)
        | {"returned_count": len(emitted)},
    }


_CONTEXT_SECTIONS = {
    "profile",
    "prompts",
    "site_health",
    "demand",
    "opportunities",
    "visibility",
    "performance",
    "referrals",
    "integrations",
    "search_intelligence",
}


def _context_sections(sections: list[str] | None) -> set[str]:
    selected = set(sections or _CONTEXT_SECTIONS)
    unknown = selected - _CONTEXT_SECTIONS
    if unknown:
        raise ValueError(
            f"unsupported context section(s): {', '.join(sorted(unknown))}"
        )
    return selected


async def project_business_context(
    session: AsyncSession, project_id: str, sections: list[str] | None = None
) -> dict[str, Any]:
    project = await _authorized_project(session, project_id)
    selected_sections = _context_sections(sections)
    loaded = await _load_project_context(session, project, selected_sections)
    dataset_inventory = _dataset_inventory(loaded[6], loaded[3])
    return _render_project_context(
        project, selected_sections, loaded, dataset_inventory
    )


async def _load_project_context(
    session: AsyncSession, project: Project, selected_sections: set[str]
) -> tuple[Any, list[Any], list[str], dict[str, Any], list[Any], list[Any], Any]:
    # Column selects, not entity loads: six of BrandProfile's fields and six of
    # Prompt's are rendered below, and hydrating whole ORM instances to read
    # them costs identity-map bookkeeping and serialization for columns this
    # projection never touches.
    profile = (
        await session.execute(
            select(
                BrandProfile.description,
                BrandProfile.positioning,
                BrandProfile.products_services,
                BrandProfile.target_audience,
                BrandProfile.business_context,
                BrandProfile.sources,
                BrandProfile.source_artifact_ids,
                BrandProfile.updated_at,
            ).where(
                BrandProfile.workspace_id == project.workspace_id,
                BrandProfile.project_id == project.id,
            )
        )
    ).one_or_none()
    competitor_rows = list(
        (
            await session.scalars(
                select(Competitor)
                .where(Competitor.project_id == project.id)
                .order_by(Competitor.name.asc(), Competitor.id.asc())
            )
        ).all()
    )
    owned_domains = list(
        (
            await session.scalars(
                select(OwnedDomain.domain)
                .where(OwnedDomain.project_id == project.id)
                .order_by(OwnedDomain.domain.asc())
            )
        ).all()
    )
    evidence: dict[str, Any] = {}
    context = ToolExecutionContext(
        session=session,
        workspace_id=project.workspace_id,
        project_id=project.id,
    )
    for tool_name, section in _CONTEXT_SECTIONS_BY_TOOL.items():
        if section not in selected_sections:
            continue
        evidence[tool_name] = _normalize_refs(
            await execute_tool(tool_name, context, {})
        )
    prompt_rows = list(
        (
            await session.execute(
                select(
                    Prompt.id,
                    Prompt.text,
                    Prompt.theme,
                    Prompt.intent,
                    Prompt.buyer_stage,
                    Prompt.origin,
                    Prompt.cohort,
                    Prompt.status,
                )
                .join(PromptSet, PromptSet.id == Prompt.prompt_set_id)
                .where(PromptSet.project_id == project.id, Prompt.enabled.is_(True))
                .order_by(Prompt.created_at.asc(), Prompt.id.asc())
                .limit(51)
            )
        ).all()
    )
    prompts = prompt_rows[:50] if "prompts" in selected_sections else []
    search_readiness = (
        await search_intelligence_readiness(
            session, workspace_id=project.workspace_id, project_id=project.id
        )
        if "search_intelligence" in selected_sections
        else None
    )
    return (
        profile,
        competitor_rows,
        owned_domains,
        evidence,
        prompt_rows,
        prompts,
        search_readiness,
    )


def _dataset_inventory(
    search_readiness: Any, evidence: dict[str, Any]
) -> list[dict[str, Any]]:
    if search_readiness is None:
        search_state = "not_requested"
    elif search_readiness.datasets:
        search_state = "available"
    else:
        search_state = "unavailable"
    dataset_inventory = [
        {
            "kind": "site_health",
            "read_tool": "read_site_health",
            "state": evidence.get("site.read_snapshot", {}).get(
                "state", "not_requested"
            ),
            "limitation": "bounded normalized page facts; not raw HTML",
        },
        {
            "kind": "query_page_evidence",
            "read_tool": "read_query_evidence",
            "state": "available"
            if evidence.get("demand.read_snapshot", {}).get("state") == "available"
            else "unavailable",
            "limitation": "exact saved windows only",
        },
        {
            "kind": "visibility",
            "read_tool": "read_visibility_results",
            "state": evidence.get("audits.read_latest", {}).get(
                "state", "not_requested"
            ),
            "limitation": "saved answers and citations only; no reruns",
        },
        {
            "kind": "search_intelligence",
            "read_tool": "read_search_intelligence",
            "state": search_state,
            "observed_at": max(
                (
                    item.published_at
                    for item in (search_readiness.datasets if search_readiness else [])
                    if item.published_at is not None
                ),
                default=None,
            ),
            "limitation": (
                "dataset-specific saved grain; aggregate backlink datasets "
                "are not backlink edges"
            ),
        },
    ]
    return dataset_inventory


def _render_project_context(
    project: Project,
    selected_sections: set[str],
    loaded: tuple[Any, list[Any], list[str], dict[str, Any], list[Any], list[Any], Any],
    dataset_inventory: list[dict[str, Any]],
) -> dict[str, Any]:
    (
        profile,
        competitor_rows,
        owned_domains,
        evidence,
        prompt_rows,
        prompts,
        _search_readiness,
    ) = loaded
    if "profile" not in selected_sections:
        brand_profile: dict[str, Any] = {"state": "not_requested"}
    elif profile is None:
        brand_profile = {"state": "unavailable", "reason": "no_brand_profile"}
    else:
        brand_profile = {
            "description": profile.description,
            "positioning": profile.positioning,
            "products_services": profile.products_services,
            "target_audience": profile.target_audience,
            "business_context": profile.business_context,
            "sources": profile.sources,
            "source_artifact_ids": profile.source_artifact_ids,
            "review_state_by_field": {
                field: source.get("review_state", "unavailable")
                for field, source in (profile.sources or {}).items()
                if isinstance(source, dict)
            },
            "updated_at": profile.updated_at,
        }
    return {
        "scope": "project",
        "project": {
            "id": str(project.id),
            "workspace_id": str(project.workspace_id),
            "name": project.name,
            "brand_name": project.brand_name,
            "website_url": project.website_url,
            "industry": project.industry,
            "subindustry": project.subindustry,
            "primary_market": project.primary_market,
            "country_code": project.country_code,
            "language_code": project.language_code,
        },
        "brand_profile": brand_profile,
        "owned_domains": owned_domains,
        "accepted_competitors": [
            {
                "id": str(row.id),
                "name": row.name,
                "aliases": row.aliases,
                "domains": row.domains,
            }
            for row in competitor_rows
        ],
        "active_prompts": [
            {
                "id": str(prompt.id),
                "text": prompt.text,
                "theme": prompt.theme,
                "intent": prompt.intent,
                "buyer_stage": prompt.buyer_stage,
                "origin": prompt.origin,
                "cohort": prompt.cohort,
                "status": prompt.status,
                "record_uri": f"citeladder://prompt/{prompt.id}",
            }
            for prompt in prompts
        ],
        "prompt_omissions": (
            [
                {
                    "reason": "active_prompt_limit",
                    "limit": 50,
                    "continuation_tool": "read_prompt_portfolio",
                }
            ]
            if "prompts" in selected_sections and len(prompt_rows) > len(prompts)
            else []
        ),
        "available_datasets": dataset_inventory,
        "applicability": {
            "identity": {
                "state": "applicable",
                "snapshot_id": "applicable",
                "audit_id": "applicable",
                "crawl_id": "applicable",
                "dataset_id": "applicable",
            },
            "coverage": "applicable",
            "pagination": "applicable",
            "follow_through": "applicable",
        },
        "evidence": evidence,
    }


def skill_catalog() -> dict[str, Any]:
    return {
        "catalog_version": CONTENT_SKILL_CATALOG_VERSION,
        "content_skills": [
            {
                "id": skill.id,
                "label": skill.label,
                "channel": skill.channel,
                "description": skill.description,
                "version": skill.version,
            }
            for skill in CONTENT_SKILL_REGISTRY.values()
        ],
        "growth_agent_tasks": [
            {"task_type": task.task_type, "read_tools": list(task.allowed_tools)}
            for task in AGENT_TASK_POLICIES.values()
        ],
        "access": "read_only",
    }


async def search_business_context(
    session: AsyncSession,
    query: str,
    project_id: str | None = None,
    limit: int = 10,
) -> dict[str, Any]:
    normalized = query.strip()
    if not normalized:
        raise ValueError("query must not be empty")
    bounded_limit = max(1, min(limit, MCP_MAX_SEARCH_RESULTS))
    # Reject an unauthenticated caller before any query work; the predicates
    # below re-resolve the same identity.
    current_user_id()
    project_filter = await _optional_project_filter(session, project_id)
    # Backslash first: it is the LIKE escape character below, so escaping the
    # wildcards before it would double-escape their new prefixes, and leaving a
    # literal backslash unescaped makes the pattern a malformed escape sequence.
    escaped = normalized.replace("\\", "\\\\").replace("%", r"\%").replace("_", r"\_")
    pattern = f"%{escaped}%"
    results: list[dict[str, str]] = []
    projects = list(
        (
            await session.scalars(
                select(Project)
                .where(
                    _caller_is_member_of(Project.workspace_id),
                    or_(
                        Project.name.ilike(pattern, escape="\\"),
                        Project.brand_name.ilike(pattern, escape="\\"),
                        Project.website_url.ilike(pattern, escape="\\"),
                        Project.industry.ilike(pattern, escape="\\"),
                    ),
                    *project_filter,
                )
                .limit(bounded_limit)
            )
        ).all()
    )
    results.extend(
        _result("project", row.id, row.name, f"{row.brand_name} — {row.website_url}")
        for row in projects
    )
    remaining = bounded_limit - len(results)
    if remaining > 0:
        opportunities = list(
            (
                await session.scalars(
                    select(Opportunity)
                    .join(Project, Project.id == Opportunity.project_id)
                    .where(
                        _caller_is_member_of(Opportunity.workspace_id),
                        Opportunity.superseded_at.is_(None),
                        or_(
                            Opportunity.title.ilike(pattern, escape="\\"),
                            Opportunity.remediation.ilike(pattern, escape="\\"),
                            Opportunity.target_url.ilike(pattern, escape="\\"),
                        ),
                        *project_filter,
                    )
                    .order_by(Opportunity.priority_score.desc())
                    .limit(remaining)
                )
            ).all()
        )
        results.extend(
            _result("opportunity", row.id, row.title, row.remediation)
            for row in opportunities
        )
    remaining = bounded_limit - len(results)
    if remaining > 0:
        prompts = list(
            (
                await session.scalars(
                    select(Prompt)
                    .join(PromptSet, PromptSet.id == Prompt.prompt_set_id)
                    .join(Project, Project.id == PromptSet.project_id)
                    .where(
                        _caller_is_member_of(Project.workspace_id),
                        or_(
                            Prompt.text.ilike(pattern, escape="\\"),
                            Prompt.theme.ilike(pattern, escape="\\"),
                        ),
                        *project_filter,
                    )
                    .limit(remaining)
                )
            ).all()
        )
        results.extend(
            _result("prompt", row.id, row.theme or "Prompt", row.text)
            for row in prompts
        )
    return {
        "query": normalized,
        "results": results,
        "count": len(results),
        "pagination": {
            "returned_count": len(results),
            "has_more": len(results) == bounded_limit,
            "next_cursor": None,
            "total_count": None,
        },
    }


async def read_growth_evidence(
    session: AsyncSession,
    project_id: str,
    tool_name: str,
    payload: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Run one evidence tool for a project the CALLER is a member of.

    The project id is authorized first, every time: it is an argument from an
    MCP client, and on its own it grants nothing (invariant 5).
    """
    project = await _authorized_project(session, project_id)
    result = await execute_tool(
        tool_name,
        ToolExecutionContext(
            session=session,
            workspace_id=project.workspace_id,
            project_id=project.id,
        ),
        payload or {},
    )
    _normalize_refs(result)
    result.setdefault("project_id", str(project.id))
    identity_applicability = (
        {
            "state": "applicable",
            "connection_id": "applicable",
            "snapshot_id": "not_applicable",
            "audit_id": "not_applicable",
            "crawl_id": "not_applicable",
            "dataset_id": "not_applicable",
        }
        if tool_name == _INTEGRATIONS_READ
        else "applicable"
    )
    result.setdefault(
        "applicability",
        {
            "identity": identity_applicability,
            "coverage": "applicable",
            "pagination": (
                "applicable"
                if tool_name in {"opportunities.read_ranked", "performance.read_table"}
                else "not_applicable"
            ),
            "follow_through": (
                "not_applicable" if tool_name == _INTEGRATIONS_READ else "applicable"
            ),
        },
    )
    return result


async def _optional_project_filter(
    session: AsyncSession, project_id: str | None
) -> tuple[Any, ...]:
    if not project_id:
        return ()
    project = await _authorized_project(session, project_id)
    return (Project.id == project.id,)


def _result(kind: str, row_id: uuid.UUID, title: str, text: str) -> dict[str, str]:
    record_uri = f"citeladder://{kind}/{row_id}"
    return {
        "id": record_uri,
        "type": kind,
        "title": title,
        "url": f"{mcp_public_origin()}/dashboard?record={quote(record_uri, safe='')}",
        "text": text[:500],
    }
