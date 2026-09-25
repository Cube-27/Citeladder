"""Action persistence: recompute sync, workspace-scoped reads, agent attach."""

from __future__ import annotations

import re
import uuid
from collections.abc import Sequence
from typing import Any
from urllib.parse import urlsplit

from sqlalchemy import and_, func, or_, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.analysis.normalization import normalize_domain
from app.analysis.opportunities.actions import (
    ActionGroup,
    ActionMember,
    group_members,
    page_group_key,
    select_approach,
)
from app.core.config.actions import (
    ACTION_ACTIVE_STATUSES,
    ACTION_LABEL_MAX_CHARS,
    ACTION_LIST_DEFAULT_LIMIT,
    ACTION_LIST_MAX_LIMIT,
    ACTION_ORIGIN_AGENT,
    ACTION_ORIGIN_EVIDENCE,
    ACTION_TARGET_KINDS,
    AGENT_ORIGIN_DEFAULT_SKILL,
    AGENT_TARGET_KINDS,
    FAMILY_AI_VISIBILITY,
    FAMILY_COMMERCE,
    FAMILY_LINK_GRAPH,
    FAMILY_SEARCH_CONSOLE,
    FAMILY_SITE_CHANGES,
    FAMILY_SITE_HEALTH,
    FAMILY_SOURCES,
    PLANNED_PAGE_TOPIC_MAX_CHARS,
    TARGET_PAGE,
)
from app.domain.opportunities.action_status import (
    effective_status,
    listed_actions,
    validate_status,
)
from app.domain.opportunities.common import _require_project, _utcnow
from app.domain.opportunities.errors import (
    InvalidCursorError,
    OpportunityNotFoundError,
    OpportunityValidationError,
)
from app.domain.site_health.normalization import (
    decode_keyset_cursor,
    encode_keyset_cursor,
)
from app.models.brand import OwnedDomain
from app.models.opportunity import Action, Opportunity
from app.models.project import Project

_ACTION_NOT_FOUND = "Action not found"
_LIST_SCOPE = "actions"
# A NULL priority (agent work with no evidence yet) sorts after every scored
# Action; the keyset compares this surrogate rather than NULL.
_UNSCORED = -1.0


def available_families(
    *, has_audit: bool, has_demand: bool, has_crawl: bool
) -> frozenset[str]:
    """Which evidence families one recompute actually had a source for."""
    families: set[str] = set()
    if has_audit:
        families |= {FAMILY_AI_VISIBILITY, FAMILY_SOURCES, FAMILY_COMMERCE}
    if has_demand:
        families.add(FAMILY_SEARCH_CONSOLE)
    if has_crawl:
        families |= {FAMILY_SITE_HEALTH, FAMILY_LINK_GRAPH, FAMILY_SITE_CHANGES}
    return frozenset(families)


def _member(row: Opportunity) -> ActionMember:
    evidence = row.evidence or {}
    prompt_text = evidence.get("prompt_text") or evidence.get("prompt")
    return ActionMember(
        opportunity_id=row.id,
        rule_id=row.rule_id,
        target_key=row.target_key,
        target_url=row.target_url,
        target_prompt_id=row.target_prompt_id,
        target_theme=row.target_theme,
        label_hint=prompt_text if isinstance(prompt_text, str) else None,
        title=row.title or row.rule_id,
        priority_score=float(row.priority_score or 0.0),
        source_analysis_ids=tuple(row.source_analysis_ids or ()),
        source_issue_ids=tuple(row.source_issue_ids or ()),
        source_metric_ids=tuple(row.source_metric_ids or ()),
    )


async def sync_actions(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    new_rows: Sequence[Opportunity],
    snapshot_id: uuid.UUID,
    families: frozenset[str],
) -> None:
    """Re-derive every Action of a project from its new live Opportunity set.

    Runs inside the recompute transaction, after the new rows and snapshot are
    flushed and under the recompute's project lock, so members, priority and
    diagnosis always describe the snapshot that superseded the old rows.
    Identity and origin never change; an Action no member targets any more
    keeps its row with its evidence cleared.
    """
    groups = group_members(
        (_member(row) for row in new_rows), available_families=families
    )
    existing = {
        action.group_key: action
        for action in (
            await session.scalars(
                select(Action)
                .where(
                    Action.workspace_id == workspace_id,
                    Action.project_id == project_id,
                )
                .with_for_update()
            )
        ).all()
    }
    now = _utcnow()
    seen: set[str] = set()
    actions_by_key: dict[str, Action] = {}
    for group in groups:
        seen.add(group.target.group_key)
        action = existing.get(group.target.group_key)
        if action is None:
            action = Action(
                workspace_id=workspace_id,
                project_id=project_id,
                group_key=group.target.group_key,
                target_kind=group.target.kind,
                origin=ACTION_ORIGIN_EVIDENCE,
            )
            session.add(action)
        _apply_group(action, group, snapshot_id=snapshot_id)
        actions_by_key[group.target.group_key] = action
    await session.flush()
    _stamp_members(groups, actions_by_key, new_rows)
    for group_key, action in existing.items():
        if group_key in seen:
            continue
        action.member_opportunity_ids = []
        action.families = []
        action.priority_score = None
        action.opportunity_snapshot_id = snapshot_id
        if (
            action.evidence_cleared_at is None
            and action.origin == ACTION_ORIGIN_EVIDENCE
        ):
            action.evidence_cleared_at = now


def _stamp_members(
    groups: Sequence[ActionGroup],
    actions_by_key: dict[str, Action],
    rows: Sequence[Opportunity],
) -> None:
    """Point each new row at its Action, in the recompute that wrote it."""
    action_for_row: dict[uuid.UUID, uuid.UUID] = {}
    for group in groups:
        action_id = actions_by_key[group.target.group_key].id
        for member in group.members:
            action_for_row[member.opportunity_id] = action_id
    for row in rows:
        row.action_id = action_for_row.get(row.id)


def _apply_group(action: Action, group: ActionGroup, *, snapshot_id: uuid.UUID) -> None:
    action.target_label = group.target.label
    action.target_url = group.target.url
    action.target_prompt_id = group.target.prompt_id
    action.priority_score = group.priority_score
    action.families = list(group.families)
    action.approach = group.approach
    action.skill_id = group.skill_id
    action.diagnosis = group.diagnosis
    action.member_opportunity_ids = [
        str(member.opportunity_id) for member in group.members
    ]
    action.opportunity_snapshot_id = snapshot_id
    action.evidence_cleared_at = None


async def list_actions(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    limit: int | None = None,
    cursor: str | None = None,
    status: str | None = None,
    target_kind: str | None = None,
) -> tuple[list[tuple[Action, str]], str | None]:
    """Actions by descending priority, each with its effective status.

    Without a status filter the list is the work queue (open and in
    progress); cleared evidence-only rows are always hidden.
    """
    await _require_project(session, workspace_id=workspace_id, project_id=project_id)
    if status is not None:
        validate_status(status)
    if target_kind is not None and target_kind not in ACTION_TARGET_KINDS:
        raise OpportunityValidationError(f"unknown target kind: {target_kind!r}")
    bounded = max(1, min(limit or ACTION_LIST_DEFAULT_LIMIT, ACTION_LIST_MAX_LIMIT))
    sort_priority = func.coalesce(Action.priority_score, _UNSCORED)
    current = effective_status()
    statement = select(Action, current).where(
        Action.workspace_id == workspace_id,
        Action.project_id == project_id,
        listed_actions(),
        current == status if status else current.in_(sorted(ACTION_ACTIVE_STATUSES)),
    )
    if target_kind:
        statement = statement.where(Action.target_kind == target_kind)
    filters = {
        "project_id": str(project_id),
        "status": status,
        "target_kind": target_kind,
    }
    if cursor:
        try:
            last_priority, last_id = decode_keyset_cursor(
                cursor, scope=_LIST_SCOPE, filters=filters
            )
            priority_value = float(last_priority)
            id_value = uuid.UUID(last_id)
        except ValueError as exc:
            raise InvalidCursorError(str(exc)) from exc
        statement = statement.where(
            or_(
                sort_priority < priority_value,
                and_(sort_priority == priority_value, Action.id > id_value),
            )
        )
    rows = [
        (action, str(value))
        for action, value in (
            await session.execute(
                statement.order_by(sort_priority.desc(), Action.id.asc()).limit(
                    bounded + 1
                )
            )
        ).all()
    ]
    page = rows[:bounded]
    next_cursor = None
    if len(rows) > bounded:
        last = page[-1][0]
        next_cursor = encode_keyset_cursor(
            scope=_LIST_SCOPE,
            filters=filters,
            sort_values=[
                last.priority_score if last.priority_score is not None else _UNSCORED,
                last.id,
            ],
        )
    return page, next_cursor


async def get_action(
    session: AsyncSession, *, workspace_id: uuid.UUID, action_id: uuid.UUID
) -> tuple[Action, str, list[Opportunity]]:
    """One Action, its effective status and its current live members."""
    row = (
        await session.execute(
            select(Action, effective_status()).where(
                Action.id == action_id, Action.workspace_id == workspace_id
            )
        )
    ).first()
    if row is None:
        raise OpportunityNotFoundError(_ACTION_NOT_FOUND)
    action, status = row
    return action, str(status), await _members(session, action=action)


async def _members(session: AsyncSession, *, action: Action) -> list[Opportunity]:
    member_ids = [uuid.UUID(value) for value in action.member_opportunity_ids or []]
    if not member_ids:
        return []
    rows = (
        await session.scalars(
            select(Opportunity).where(
                Opportunity.workspace_id == action.workspace_id,
                Opportunity.project_id == action.project_id,
                Opportunity.id.in_(member_ids),
            )
        )
    ).all()
    by_id = {row.id: row for row in rows}
    return [by_id[member_id] for member_id in member_ids if member_id in by_id]


def planned_page_group_key(topic: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", topic.casefold()).strip("-")
    if not slug:
        raise OpportunityValidationError("a planned page needs a topic")
    return f"planned:{slug[:PLANNED_PAGE_TOPIC_MAX_CHARS]}"


async def attach_or_create_action(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    target_kind: str,
    target: str,
    user_id: uuid.UUID | None,
) -> Action:
    """The Action for an agent output's target, created once if missing.

    Idempotent under concurrency: two runs resolving the same target insert
    against the ``(project_id, group_key)`` unique constraint and both read
    the one row that won. The caller commits.
    """
    if target_kind not in AGENT_TARGET_KINDS:
        raise OpportunityValidationError(f"agent work cannot target {target_kind!r}")
    target = target.strip()
    if target_kind == TARGET_PAGE:
        await _require_owned_url(
            session, workspace_id=workspace_id, project_id=project_id, url=target
        )
        group_key, url = page_group_key(target), target
    else:
        await _require_project(
            session, workspace_id=workspace_id, project_id=project_id
        )
        group_key, url = planned_page_group_key(target), None
    branch_skill = (
        select_approach(rule_ids=set(), target_kind=target_kind).skill_id
        if target_kind == TARGET_PAGE
        else AGENT_ORIGIN_DEFAULT_SKILL
    )
    await session.execute(
        insert(Action)
        .values(
            id=uuid.uuid4(),
            workspace_id=workspace_id,
            project_id=project_id,
            group_key=group_key,
            target_kind=target_kind,
            target_label=target[:ACTION_LABEL_MAX_CHARS],
            target_url=url,
            origin=ACTION_ORIGIN_AGENT,
            families=[],
            approach="",
            skill_id=branch_skill,
            diagnosis={},
            member_opportunity_ids=[],
            created_by_user_id=user_id,
            created_at=_utcnow(),
            updated_at=_utcnow(),
        )
        .on_conflict_do_nothing(constraint="uq_actions_project_group")
    )
    action = await session.scalar(
        select(Action).where(
            Action.workspace_id == workspace_id,
            Action.project_id == project_id,
            Action.group_key == group_key,
        )
    )
    if action is None:  # pragma: no cover - the insert or its winner exists
        raise OpportunityNotFoundError(_ACTION_NOT_FOUND)
    return action


async def _require_owned_url(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    url: str,
) -> None:
    parts = urlsplit(url)
    if parts.scheme not in {"http", "https"} or not parts.hostname:
        raise OpportunityValidationError("a page target must be an absolute URL")
    project = await session.scalar(
        select(Project).where(
            Project.id == project_id, Project.workspace_id == workspace_id
        )
    )
    if project is None:
        raise OpportunityNotFoundError("Project not found")
    owned = await session.scalars(
        select(OwnedDomain.domain).where(OwnedDomain.project_id == project_id)
    )
    # Exact host match only: a subdomain is a different property the project
    # has not claimed, and agent work never expands scope on its own.
    domains = {normalize_domain(value) for value in owned.all()}
    domains.add(normalize_domain(project.website_url or ""))
    domains.discard("")
    if normalize_domain(parts.hostname) not in domains:
        raise OpportunityValidationError(
            "a page target must be on a domain the project owns"
        )


def action_projection(action: Action, status: str) -> dict[str, Any]:
    return {
        "id": action.id,
        "status": status,
        "project_id": action.project_id,
        "target_kind": action.target_kind,
        "target_label": action.target_label,
        "target_url": action.target_url,
        "target_prompt_id": action.target_prompt_id,
        "origin": action.origin,
        "priority_score": action.priority_score,
        "families": list(action.families or []),
        "approach": action.approach,
        "skill_id": action.skill_id,
        "member_count": len(action.member_opportunity_ids or []),
        "evidence_cleared_at": action.evidence_cleared_at,
        "created_at": action.created_at,
        "updated_at": action.updated_at,
    }
