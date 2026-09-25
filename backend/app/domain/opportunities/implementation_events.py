"""Append-only implementation declarations on Actions, and their reads.

A user declares an Action implemented, optionally naming the exact output
revision they shipped. Everything the verifier later measures against --
members, targets and expected checks -- is decided here from persisted rows and
frozen on the declaration. The caller supplies none of it.
"""

from __future__ import annotations

import json
import uuid
from dataclasses import dataclass
from datetime import datetime
from hashlib import sha256

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config.actions import TARGET_EARNED_PAGE, TARGET_PAGE
from app.core.config.agent import OUTPUT_PHASE_OUTLINE
from app.core.config.opportunities import (
    EARNED_RULE_IDS,
    IMPLEMENTATION_TARGETS_MAX,
    IMPLEMENTATION_VERIFICATION_HISTORY_MAX,
    OPPORTUNITY_TYPE_SITE,
    OPPORTUNITY_TYPE_TRAFFIC,
)
from app.core.config.placement import PLACEMENT_CHECK_KIND
from app.domain.demand.page_equivalence import resolve_owned_page
from app.domain.opportunities.action_status import record_implemented
from app.domain.opportunities.errors import OpportunityValidationError
from app.domain.opportunities.placement_checks import (
    open_placement_check,
    placement_expected_check,
)
from app.domain.opportunities.visibility_checks import build_visibility_check
from app.models.agent import AgentOutput, AgentOutputRevision
from app.models.opportunity import (
    Action,
    Opportunity,
    OpportunityImplementationEvent,
    OpportunitySnapshot,
    OpportunityVerificationEvent,
)
from app.models.project import Project
from app.models.site_health.urls import SiteUrl


class ImplementationNotFoundError(LookupError):
    pass


class ImplementationConflictError(Exception):
    pass


class ImplementationIdempotencyConflictError(ImplementationConflictError):
    pass


@dataclass(frozen=True, slots=True)
class ImplementationDeclaration:
    action_id: uuid.UUID
    output_revision_id: uuid.UUID | None
    declared_implemented_at: datetime


@dataclass(frozen=True, slots=True)
class ResolvedTargets:
    """What one declaration says it changed: our pages, or somebody else's.

    Exactly one side is populated. An action performed on a publisher's page
    has no owned page to name, and naming one anyway would make an unrelated
    owned URL look like the thing that was edited.
    """

    site_url_ids: list[uuid.UUID]
    external_url: str | None = None


def is_external_target(opportunity: Opportunity) -> bool:
    """Whether this rule's action happens on a page somebody else owns.

    Read from the rule id rather than sniffing the URL: whether a URL is ours
    is a question with an answer (``resolve_owned_page``), but asking it about
    a publisher's page is the failure being prevented, not the test.
    """
    return opportunity.rule_id in EARNED_RULE_IDS


async def _project_expected_checks(
    session: AsyncSession,
    *,
    project: Project,
    opportunity: Opportunity,
    snapshot: OpportunitySnapshot,
) -> list[dict]:
    """Server-owned verification intent for the rule/pathway.

    The caller never supplies this. What a declaration will be measured
    against is decided here, from the opportunity and its frozen snapshot, so
    a client cannot declare itself verified against an expectation of its own
    choosing.

    An earned action gets a PLACEMENT check and not the baseline-anchored
    visibility one. Every non-site, non-traffic opportunity used to fall
    through to "did the project score move", which is not what a declaration
    against a publisher's page claims: a listing can go live while the score
    sits still, and the score can move for reasons nothing to do with it.
    """
    evidence = opportunity.evidence or {}
    if is_external_target(opportunity):
        return [
            placement_expected_check(opportunity, brand_name=project.brand_name or "")
        ]
    if opportunity.opportunity_type == OPPORTUNITY_TYPE_SITE:
        check: dict = {
            "kind": "site_rule",
            "rule_id": str(evidence.get("issue_rule_id") or opportunity.rule_id),
            "expected_outcome": "pass",
        }
        if evidence.get("site_url_id"):
            check["target_site_url_id"] = str(evidence["site_url_id"])
        return [check]
    if opportunity.opportunity_type == OPPORTUNITY_TYPE_TRAFFIC:
        return [
            {
                "kind": "traffic_metric",
                "metric": "clicks",
                "direction": "increase",
                "expected_value": 1,
                "tolerance": 0,
            }
        ]
    return [
        await build_visibility_check(
            session, opportunity=opportunity, snapshot=snapshot
        )
    ]


def _fingerprint(payload: dict) -> str:
    raw = json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str)
    return sha256(raw.encode()).hexdigest()


async def _current_snapshot(
    session: AsyncSession, *, workspace_id: uuid.UUID, project_id: uuid.UUID
) -> OpportunitySnapshot:
    snapshot = await session.scalar(
        select(OpportunitySnapshot)
        .where(
            OpportunitySnapshot.workspace_id == workspace_id,
            OpportunitySnapshot.project_id == project_id,
        )
        .order_by(OpportunitySnapshot.created_at.desc(), OpportunitySnapshot.id.desc())
        .limit(1)
    )
    if snapshot is None:
        raise ImplementationConflictError("No current opportunity snapshot")
    return snapshot


async def _idempotent_replay(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    idempotency_key: str,
    fingerprint: str,
) -> OpportunityImplementationEvent | None:
    row = await session.scalar(
        select(OpportunityImplementationEvent).where(
            OpportunityImplementationEvent.workspace_id == workspace_id,
            OpportunityImplementationEvent.idempotency_key == idempotency_key,
        )
    )
    if row is not None and row.request_fingerprint != fingerprint:
        raise ImplementationIdempotencyConflictError("Idempotency key was reused")
    return row


async def _flush_declaration(
    session: AsyncSession,
    *,
    row: OpportunityImplementationEvent,
    fingerprint: str,
) -> tuple[OpportunityImplementationEvent, bool]:
    try:
        async with session.begin_nested():
            session.add(row)
            await session.flush()
    except IntegrityError:
        replay = await _idempotent_replay(
            session,
            workspace_id=row.workspace_id,
            idempotency_key=row.idempotency_key,
            fingerprint=fingerprint,
        )
        if replay is None:
            raise ImplementationIdempotencyConflictError(
                "Idempotency key was reused"
            ) from None
        return replay, False
    return row, True


async def _locked_action(
    session: AsyncSession, *, workspace_id: uuid.UUID, action_id: uuid.UUID
) -> Action:
    action = await session.scalar(
        select(Action)
        .where(Action.id == action_id, Action.workspace_id == workspace_id)
        .with_for_update()
    )
    if action is None:
        raise ImplementationNotFoundError("Action not found")
    return action


async def _live_members(session: AsyncSession, *, action: Action) -> list[Opportunity]:
    """The Action's current member rows, in its stored member order."""
    member_ids = [
        uuid.UUID(str(value)) for value in action.member_opportunity_ids or []
    ]
    if not member_ids:
        return []
    rows = (
        await session.scalars(
            select(Opportunity).where(
                Opportunity.workspace_id == action.workspace_id,
                Opportunity.project_id == action.project_id,
                Opportunity.id.in_(member_ids),
                Opportunity.superseded_at.is_(None),
            )
        )
    ).all()
    by_id = {row.id: row for row in rows}
    return [by_id[member_id] for member_id in member_ids if member_id in by_id]


async def _checked_revision(
    session: AsyncSession, *, action: Action, revision_id: uuid.UUID | None
) -> uuid.UUID | None:
    """The named revision, only if it is this Action's work and shippable.

    A revision from another chat's output would declare work this Action never
    received, and an outline is a plan, not something a site can carry.
    """
    if revision_id is None:
        return None
    phase = await session.scalar(
        select(AgentOutputRevision.phase)
        .join(AgentOutput, AgentOutput.id == AgentOutputRevision.output_id)
        .where(
            AgentOutputRevision.id == revision_id,
            AgentOutputRevision.workspace_id == action.workspace_id,
            AgentOutputRevision.project_id == action.project_id,
            AgentOutput.action_id == action.id,
        )
    )
    if phase is None:
        raise ImplementationConflictError(
            "The output revision does not belong to this Action"
        )
    if phase == OUTPUT_PHASE_OUTLINE:
        raise ImplementationConflictError(
            "An outline cannot be declared implemented; write the draft first"
        )
    return revision_id


async def _owned_ids(
    session: AsyncSession, *, project: Project, requested: list[uuid.UUID]
) -> list[uuid.UUID]:
    """``requested`` narrowed to crawled pages of this project, order kept."""
    if not requested:
        return []
    owned = set(
        (
            await session.scalars(
                select(SiteUrl.id).where(
                    SiteUrl.workspace_id == project.workspace_id,
                    SiteUrl.project_id == project.id,
                    SiteUrl.id.in_(requested),
                )
            )
        ).all()
    )
    return [item for item in dict.fromkeys(requested) if item in owned]


async def _resolve_targets(
    session: AsyncSession,
    *,
    project: Project,
    action: Action,
    members: list[Opportunity],
) -> ResolvedTargets:
    """Resolve what this declaration acted on, without crossing the boundary.

    An earned Action targets a third-party page. Routing its URL through
    ``resolve_owned_page`` would try to match a publisher's URL against this
    project's crawled inventory, so it short-circuits to the external URL. An
    owned page must resolve to exactly one crawled page; other targets name the
    pages their member evidence already resolved, if any.
    """
    if action.target_kind == TARGET_EARNED_PAGE or any(
        is_external_target(member) for member in members
    ):
        if not action.target_url:
            raise ImplementationConflictError("Implementation target is unresolved")
        return ResolvedTargets(site_url_ids=[], external_url=action.target_url)
    evidence_ids = [
        uuid.UUID(str(raw))
        for member in members
        if (raw := (member.evidence or {}).get("site_url_id"))
    ]
    site_url_ids = await _owned_ids(session, project=project, requested=evidence_ids)
    if action.target_kind == TARGET_PAGE and not site_url_ids and action.target_url:
        site_url_ids = [
            await _resolved_page(session, project=project, url=action.target_url)
        ]
    if len(site_url_ids) > IMPLEMENTATION_TARGETS_MAX:
        raise ImplementationConflictError("Too many implementation targets")
    return ResolvedTargets(site_url_ids=site_url_ids)


async def _resolved_page(
    session: AsyncSession, *, project: Project, url: str
) -> uuid.UUID:
    """The one crawled page an owned-page Action names, or a conflict."""
    resolution = await resolve_owned_page(
        session,
        workspace_id=project.workspace_id,
        project_id=project.id,
        url=url,
        preferred_origin=project.website_url,
    )
    if (
        resolution.outcome not in {"exact", "resolved"}
        or resolution.site_url_id is None
    ):
        raise ImplementationConflictError(
            "Implementation target is ambiguous or unresolved"
        )
    return resolution.site_url_id


async def _member_checks(
    session: AsyncSession,
    *,
    project: Project,
    members: list[Opportunity],
    snapshot: OpportunitySnapshot,
) -> list[tuple[dict, Opportunity]]:
    """The union of the member rules' checks, each with the row it came from."""
    checks: list[tuple[dict, Opportunity]] = []
    seen: set[str] = set()
    for member in members:
        for check in await _project_expected_checks(
            session, project=project, opportunity=member, snapshot=snapshot
        ):
            key = _fingerprint(check)
            if key not in seen:
                seen.add(key)
                checks.append((check, member))
    return checks


async def declare_action_implemented(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    actor_user_id: uuid.UUID,
    idempotency_key: str,
    declaration: ImplementationDeclaration,
) -> tuple[OpportunityImplementationEvent, bool]:
    """Freeze one Action's declaration and store its ``implemented`` status.

    The Action row is locked first, so concurrent declarations serialize: a
    replay of the same request returns the stored row, and any other second
    declaration finds the Action no longer open.
    """
    fingerprint = _fingerprint(
        {
            "action_id": declaration.action_id,
            "output_revision_id": declaration.output_revision_id,
            "declared_implemented_at": declaration.declared_implemented_at,
        }
    )
    action = await _locked_action(
        session, workspace_id=workspace_id, action_id=declaration.action_id
    )
    existing = await _idempotent_replay(
        session,
        workspace_id=workspace_id,
        idempotency_key=idempotency_key,
        fingerprint=fingerprint,
    )
    if existing is not None:
        return existing, False
    project = await session.scalar(
        select(Project).where(
            Project.workspace_id == workspace_id, Project.id == action.project_id
        )
    )
    if project is None:
        raise ImplementationNotFoundError("Action not found")
    try:
        record_implemented(session, action=action, changed_by_user_id=actor_user_id)
    except OpportunityValidationError as exc:
        raise ImplementationConflictError(str(exc)) from exc
    revision_id = await _checked_revision(
        session, action=action, revision_id=declaration.output_revision_id
    )
    members = await _live_members(session, action=action)
    if not members:
        # Checks come only from live findings; a declaration with none could
        # never be measured and would sit in ``implemented`` for good.
        raise ImplementationConflictError(
            "No current finding targets this Action, so there is nothing to measure"
        )
    snapshot = await _current_snapshot(
        session, workspace_id=workspace_id, project_id=project.id
    )
    targets = await _resolve_targets(
        session, project=project, action=action, members=members
    )
    checks = await _member_checks(
        session, project=project, members=members, snapshot=snapshot
    )
    row = OpportunityImplementationEvent(
        workspace_id=workspace_id,
        project_id=project.id,
        action_id=action.id,
        output_revision_id=revision_id,
        member_opportunity_ids=[str(member.id) for member in members],
        opportunity_snapshot_id=snapshot.id,
        target_site_url_ids=[str(item) for item in targets.site_url_ids],
        target_external_url=targets.external_url,
        declared_implemented_at=declaration.declared_implemented_at,
        expected_checks=[check for check, _member in checks],
        actor_user_id=actor_user_id,
        idempotency_key=idempotency_key,
        request_fingerprint=fingerprint,
    )
    stored, created = await _flush_declaration(
        session, row=row, fingerprint=fingerprint
    )
    # Driven by the check that was projected, not by re-deciding the pathway.
    # One placement check per declaration: an earned page's rules are mutually
    # exclusive, so its members never project two.
    placement = next(
        (
            (check, member)
            for check, member in checks
            if check.get("kind") == PLACEMENT_CHECK_KIND
        ),
        None,
    )
    if created and placement is not None:
        await open_placement_check(
            session, declaration=stored, opportunity=placement[1], check=placement[0]
        )
    return stored, created


async def action_declaration(
    session: AsyncSession, *, workspace_id: uuid.UUID, action_id: uuid.UUID
) -> OpportunityImplementationEvent | None:
    return await session.scalar(
        select(OpportunityImplementationEvent).where(
            OpportunityImplementationEvent.workspace_id == workspace_id,
            OpportunityImplementationEvent.action_id == action_id,
        )
    )


async def list_verification_events(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    implementation_event_ids: list[uuid.UUID],
) -> dict[uuid.UUID, list[OpportunityVerificationEvent]]:
    if not implementation_event_ids:
        return {}
    ranked = (
        select(
            OpportunityVerificationEvent.id.label("id"),
            func.row_number()
            .over(
                partition_by=OpportunityVerificationEvent.implementation_event_id,
                order_by=(
                    OpportunityVerificationEvent.created_at.desc(),
                    OpportunityVerificationEvent.id.desc(),
                ),
            )
            .label("rank"),
        )
        .where(
            OpportunityVerificationEvent.workspace_id == workspace_id,
            OpportunityVerificationEvent.project_id == project_id,
            OpportunityVerificationEvent.implementation_event_id.in_(
                implementation_event_ids
            ),
        )
        .subquery()
    )
    rows = list(
        (
            await session.scalars(
                select(OpportunityVerificationEvent)
                .join(ranked, ranked.c.id == OpportunityVerificationEvent.id)
                .where(ranked.c.rank <= IMPLEMENTATION_VERIFICATION_HISTORY_MAX)
                .order_by(
                    OpportunityVerificationEvent.created_at.asc(),
                    OpportunityVerificationEvent.id.asc(),
                )
            )
        ).all()
    )
    grouped: dict[uuid.UUID, list[OpportunityVerificationEvent]] = {}
    for row in rows:
        grouped.setdefault(row.implementation_event_id, []).append(row)
    return grouped
