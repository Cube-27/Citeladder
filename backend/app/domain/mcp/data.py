"""Bounded, workspace-authorized read projections exposed through MCP."""

from __future__ import annotations

import uuid
from typing import Any
from urllib.parse import urlsplit

from mcp.server.auth.middleware.auth_context import get_access_token
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config.agent import AGENT_TASK_POLICIES
from app.core.config.content import (
    CONTENT_SKILL_CATALOG_VERSION,
    CONTENT_SKILL_REGISTRY,
)
from app.core.config.mcp import MCP_MAX_SEARCH_RESULTS
from app.domain.agent.tools import ToolExecutionContext, execute_tool
from app.models.brand import BrandProfile
from app.models.opportunity import Opportunity
from app.models.project import Project
from app.models.prompt import Prompt, PromptSet
from app.models.workspace import Workspace, WorkspaceMember

_CONTEXT_TOOLS = (
    "site.read_snapshot",
    "demand.read_snapshot",
    "opportunities.read_ranked",
    "audits.read_latest",
)


def current_user_id() -> uuid.UUID:
    token = get_access_token()
    if token is None or not token.subject:
        raise PermissionError("An authenticated CiteLadder account is required")
    try:
        return uuid.UUID(token.subject)
    except ValueError as exc:
        raise PermissionError("The MCP grant has an invalid account identity") from exc


def _caller_is_member_of(workspace_column: Any) -> Any:
    """The predicate authorizing the caller to read rows in a workspace.

    Every read below is workspace-scoped, and each one used to spell its own
    ``WorkspaceMember`` join out inline. Six of the seven omitted
    ``Workspace.is_system``, so MCP was the one reader where a stray
    system-workspace membership row would have authorized — while
    ``list_account_projects``, which did filter it, hid the same project. Two
    halves of one boundary disagreeing is the shape of bug that never shows up
    in tests.

    Stated once here, mirroring ``get_membership`` (T11: system workspaces
    cannot have memberships, so even a stray row stays inert). An EXISTS
    subquery rather than a join, so adding it can neither duplicate rows for a
    caller holding several memberships nor collide with a query's own joins —
    it drops into any ``where`` unchanged.
    """
    return (
        select(WorkspaceMember.id)
        .join(Workspace, Workspace.id == WorkspaceMember.workspace_id)
        .where(
            WorkspaceMember.workspace_id == workspace_column,
            WorkspaceMember.user_id == current_user_id(),
            Workspace.is_system.is_(False),
        )
        .exists()
    )


async def list_account_projects(session: AsyncSession) -> dict[str, Any]:
    rows = (
        await session.execute(
            select(Project, Workspace)
            .join(Workspace, Workspace.id == Project.workspace_id)
            .where(_caller_is_member_of(Project.workspace_id))
            .order_by(Workspace.created_at.asc(), Project.created_at.asc())
        )
    ).all()
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
            for project, workspace in rows
        ],
    }


async def project_business_context(
    session: AsyncSession, project_id: str
) -> dict[str, Any]:
    project = await _authorized_project(session, project_id)
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
            ).where(
                BrandProfile.workspace_id == project.workspace_id,
                BrandProfile.project_id == project.id,
            )
        )
    ).one_or_none()
    evidence: dict[str, Any] = {}
    context = ToolExecutionContext(
        session=session,
        workspace_id=project.workspace_id,
        project_id=project.id,
    )
    for tool_name in _CONTEXT_TOOLS:
        evidence[tool_name] = await execute_tool(tool_name, context, {})
    prompt_rows = (
        await session.execute(
            select(
                Prompt.id,
                Prompt.text,
                Prompt.theme,
                Prompt.intent,
                Prompt.buyer_stage,
                Prompt.origin,
            )
            .join(PromptSet, PromptSet.id == Prompt.prompt_set_id)
            .where(PromptSet.project_id == project.id, Prompt.enabled.is_(True))
            .order_by(Prompt.created_at.asc(), Prompt.id.asc())
            .limit(51)
        )
    ).all()
    prompts = prompt_rows[:50]
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
        "brand_profile": (
            {
                "description": profile.description,
                "positioning": profile.positioning,
                "products_services": profile.products_services,
                "target_audience": profile.target_audience,
                "business_context": profile.business_context,
                "sources": profile.sources,
            }
            if profile
            else {"state": "unavailable", "reason": "no_brand_profile"}
        ),
        "active_prompts": [
            {
                "id": str(prompt.id),
                "text": prompt.text,
                "theme": prompt.theme,
                "intent": prompt.intent,
                "buyer_stage": prompt.buyer_stage,
                "origin": prompt.origin,
            }
            for prompt in prompts
        ],
        "prompt_omissions": (
            [{"reason": "active_prompt_limit", "limit": 50}]
            if len(prompt_rows) > len(prompts)
            else []
        ),
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
    return {"query": normalized, "results": results, "count": len(results)}


async def fetch_business_record(
    session: AsyncSession, record_id: str
) -> dict[str, Any]:
    kind, row_id = _parse_record_id(record_id)
    # Reject an unauthenticated caller before any query work; the predicates
    # below re-resolve the same identity.
    current_user_id()
    if kind == "project":
        return await project_business_context(session, str(row_id))
    if kind == "opportunity":
        row = await session.scalar(
            select(Opportunity).where(
                Opportunity.id == row_id,
                _caller_is_member_of(Opportunity.workspace_id),
            )
        )
        if row:
            return {
                "id": record_id,
                "type": kind,
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
    elif kind == "prompt":
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
            return {
                "id": record_id,
                "type": kind,
                "text": row.text,
                "theme": row.theme,
                "intent": row.intent,
                "buyer_stage": row.buyer_stage,
                "status": row.status,
                "origin": row.origin,
                "generation_evidence": row.generation_evidence,
            }
    raise LookupError("The requested record was not found in this account")


async def read_growth_evidence(
    session: AsyncSession, project_id: str, tool_name: str
) -> dict[str, Any]:
    project = await _authorized_project(session, project_id)
    return await execute_tool(
        tool_name,
        ToolExecutionContext(
            session=session,
            workspace_id=project.workspace_id,
            project_id=project.id,
        ),
        {},
    )


async def _authorized_project(session: AsyncSession, project_id: str) -> Project:
    try:
        parsed_id = uuid.UUID(project_id)
    except ValueError as exc:
        raise ValueError("project_id must be a UUID") from exc
    row = await session.scalar(
        select(Project).where(
            Project.id == parsed_id,
            _caller_is_member_of(Project.workspace_id),
        )
    )
    if row is None:
        raise LookupError("Project was not found in this account")
    return row


async def _optional_project_filter(
    session: AsyncSession, project_id: str | None
) -> tuple[Any, ...]:
    if not project_id:
        return ()
    project = await _authorized_project(session, project_id)
    return (Project.id == project.id,)


def _result(kind: str, row_id: uuid.UUID, title: str, text: str) -> dict[str, str]:
    return {
        "id": f"citeladder://{kind}/{row_id}",
        "type": kind,
        "title": title,
        "text": text[:500],
    }


def _parse_record_id(record_id: str) -> tuple[str, uuid.UUID]:
    parsed = urlsplit(record_id)
    if parsed.scheme != "citeladder" or not parsed.netloc:
        raise ValueError("id must be a citeladder:// record URI returned by search")
    kind = parsed.netloc
    if kind not in {"project", "opportunity", "prompt"}:
        raise ValueError("Unsupported CiteLadder record type")
    try:
        return kind, uuid.UUID(parsed.path.lstrip("/"))
    except ValueError as exc:
        raise ValueError("Record id must contain a UUID") from exc
