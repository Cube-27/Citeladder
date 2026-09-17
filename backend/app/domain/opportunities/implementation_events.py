"""Append-only Opportunity implementation declarations and read projection."""

from __future__ import annotations

import json
import uuid
from dataclasses import dataclass
from datetime import datetime
from hashlib import sha256

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config.opportunities import (
    EARNED_RULE_IDS,
    IMPLEMENTATION_TARGETS_MAX,
    IMPLEMENTATION_VERIFICATION_HISTORY_MAX,
    OPPORTUNITY_TYPE_SITE,
    OPPORTUNITY_TYPE_TRAFFIC,
)
from app.core.config.task_queue import TASK_STATUS_SUCCEEDED
from app.domain.demand.page_equivalence import resolve_owned_page
from app.domain.opportunities.placement_checks import (
    open_placement_check,
    placement_expected_check,
)
from app.domain.opportunities.visibility_checks import build_visibility_check
from app.models.content import ContentGeneration
from app.models.opportunity import (
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
    opportunity_id: uuid.UUID
    target_site_url_ids: list[uuid.UUID]
    generation_id: uuid.UUID | None
    declared_implemented_at: datetime
    expected_checks: list[dict]


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


async def _project_and_opportunity(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    opportunity_id: uuid.UUID,
) -> tuple[Project, Opportunity]:
    project = await session.scalar(
        select(Project).where(
            Project.workspace_id == workspace_id,
            Project.id == project_id,
        )
    )
    opportunity = await session.scalar(
        select(Opportunity).where(
            Opportunity.workspace_id == workspace_id,
            Opportunity.project_id == project_id,
            Opportunity.id == opportunity_id,
            Opportunity.superseded_at.is_(None),
        )
    )
    if project is None or opportunity is None:
        raise ImplementationNotFoundError("Opportunity not found")
    return project, opportunity


async def _resolve_targets(
    session: AsyncSession,
    *,
    project: Project,
    opportunity: Opportunity,
    requested_ids: list[uuid.UUID],
) -> ResolvedTargets:
    """Resolve what this declaration acted on, without crossing the boundary.

    An earned rule targets a third-party page. Routing its ``target_url``
    through ``resolve_owned_page`` would try to match a publisher's URL
    against this project's crawled inventory and raise a target conflict --
    so the action would surface to the user as broken rather than as
    unsupported. It short-circuits here instead.
    """
    if len(requested_ids) > IMPLEMENTATION_TARGETS_MAX:
        raise ImplementationConflictError("Too many implementation targets")
    if is_external_target(opportunity):
        if requested_ids:
            # Owned pages are not where this action happened. Accepting them
            # would later verify an owned-page change against an external
            # placement and report the two as one outcome.
            raise ImplementationConflictError(
                "An external placement cannot declare owned page targets"
            )
        if not opportunity.target_url:
            raise ImplementationConflictError("Implementation target is unresolved")
        return ResolvedTargets(site_url_ids=[], external_url=opportunity.target_url)
    if requested_ids:
        rows = list(
            (
                await session.scalars(
                    select(SiteUrl).where(
                        SiteUrl.workspace_id == project.workspace_id,
                        SiteUrl.project_id == project.id,
                        SiteUrl.id.in_(requested_ids),
                    )
                )
            ).all()
        )
        if {row.id for row in rows} != set(requested_ids):
            raise ImplementationConflictError("Implementation target is unresolved")
        return ResolvedTargets(site_url_ids=list(dict.fromkeys(requested_ids)))
    if not opportunity.target_url:
        return ResolvedTargets(site_url_ids=[])
    resolution = await resolve_owned_page(
        session,
        workspace_id=project.workspace_id,
        project_id=project.id,
        url=opportunity.target_url,
        preferred_origin=project.website_url,
    )
    if (
        resolution.outcome not in {"exact", "resolved"}
        or resolution.site_url_id is None
    ):
        raise ImplementationConflictError(
            "Implementation target is ambiguous or unresolved"
        )
    return ResolvedTargets(site_url_ids=[resolution.site_url_id])


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


async def _validate_generation(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    opportunity_id: uuid.UUID,
    generation_id: uuid.UUID | None,
) -> None:
    if generation_id is None:
        return
    generation = await session.scalar(
        select(ContentGeneration.id).where(
            ContentGeneration.workspace_id == workspace_id,
            ContentGeneration.project_id == project_id,
            ContentGeneration.id == generation_id,
            ContentGeneration.opportunity_id == opportunity_id,
            ContentGeneration.status == TASK_STATUS_SUCCEEDED,
        )
    )
    if generation is None:
        raise ImplementationConflictError("Generation not found")


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


async def create_implementation_event(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    actor_user_id: uuid.UUID,
    idempotency_key: str,
    declaration: ImplementationDeclaration,
) -> tuple[OpportunityImplementationEvent, bool]:
    request_payload = {
        "opportunity_id": declaration.opportunity_id,
        "target_site_url_ids": declaration.target_site_url_ids,
        "generation_id": declaration.generation_id,
        "declared_implemented_at": declaration.declared_implemented_at,
        "expected_checks": declaration.expected_checks,
    }
    if declaration.expected_checks:
        # Verification intent is server-owned. Accepting a caller's checks
        # would let a declaration choose the expectation that confirms it.
        raise ImplementationConflictError(
            "Expected checks are server-owned and cannot be supplied"
        )
    fingerprint = _fingerprint(request_payload)
    existing = await _idempotent_replay(
        session,
        workspace_id=workspace_id,
        idempotency_key=idempotency_key,
        fingerprint=fingerprint,
    )
    if existing is not None:
        return existing, False
    project, opportunity = await _project_and_opportunity(
        session,
        workspace_id=workspace_id,
        project_id=project_id,
        opportunity_id=declaration.opportunity_id,
    )
    snapshot = await _current_snapshot(
        session, workspace_id=workspace_id, project_id=project_id
    )
    targets = await _resolve_targets(
        session,
        project=project,
        opportunity=opportunity,
        requested_ids=declaration.target_site_url_ids,
    )
    await _validate_generation(
        session,
        workspace_id=workspace_id,
        project_id=project_id,
        opportunity_id=opportunity.id,
        generation_id=declaration.generation_id,
    )
    checks = await _project_expected_checks(
        session, project=project, opportunity=opportunity, snapshot=snapshot
    )
    row = OpportunityImplementationEvent(
        workspace_id=workspace_id,
        project_id=project_id,
        opportunity_id=declaration.opportunity_id,
        opportunity_snapshot_id=snapshot.id,
        target_site_url_ids=[str(item) for item in targets.site_url_ids],
        target_external_url=targets.external_url,
        generation_id=declaration.generation_id,
        declared_implemented_at=declaration.declared_implemented_at,
        expected_checks=checks,
        actor_user_id=actor_user_id,
        idempotency_key=idempotency_key,
        request_fingerprint=fingerprint,
    )
    stored, created = await _flush_declaration(
        session, row=row, fingerprint=fingerprint
    )
    # Only for a declaration that is actually new. A replay returns the row
    # that already exists, and opening a second check for it would leave two
    # rows racing to describe one attempt.
    if created and is_external_target(opportunity):
        await open_placement_check(
            session, declaration=stored, opportunity=opportunity, check=checks[0]
        )
    return stored, created


async def list_implementation_events(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    limit: int,
    opportunity_id: uuid.UUID | None = None,
) -> list[OpportunityImplementationEvent]:
    project = await session.scalar(
        select(Project.id).where(
            Project.workspace_id == workspace_id, Project.id == project_id
        )
    )
    if project is None:
        raise ImplementationNotFoundError("Project not found")
    statement = select(OpportunityImplementationEvent).where(
        OpportunityImplementationEvent.workspace_id == workspace_id,
        OpportunityImplementationEvent.project_id == project_id,
    )
    if opportunity_id is not None:
        statement = statement.where(
            OpportunityImplementationEvent.opportunity_id == opportunity_id
        )
    return list(
        (
            await session.scalars(
                statement.order_by(
                    OpportunityImplementationEvent.created_at.desc(),
                    OpportunityImplementationEvent.id.desc(),
                ).limit(limit)
            )
        ).all()
    )


async def get_implementation_event(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    event_id: uuid.UUID,
) -> OpportunityImplementationEvent:
    row = await session.scalar(
        select(OpportunityImplementationEvent).where(
            OpportunityImplementationEvent.workspace_id == workspace_id,
            OpportunityImplementationEvent.project_id == project_id,
            OpportunityImplementationEvent.id == event_id,
        )
    )
    if row is None:
        raise ImplementationNotFoundError("Implementation event not found")
    return row


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
