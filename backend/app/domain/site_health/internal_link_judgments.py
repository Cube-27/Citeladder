"""Reuse the shared provider and credit owners for frozen internal-link questions."""

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import defer

from app.core.config import site_health_internal_links as config
from app.core.config.entitlements import KEY_AI_CREDITS
from app.core.config.jev import jev_settings
from app.domain.billing.accounts import billing_account_id_for
from app.domain.entitlements.ledger import FundedCreditsExhaustedError, LedgerError
from app.domain.entitlements.metered import (
    MeteredSubject,
    reserve_metered_usage,
    settle_metered_usage,
)
from app.domain.workspaces.policy import WorkspaceCapability, role_allows
from app.models.analytics import AnalyticsTask
from app.models.site_health.internal_links import (
    SiteInternalLinkEvent,
    SiteInternalLinkRun,
)
from app.models.workspace import WorkspaceMember


async def locked_run(
    session: AsyncSession,
    task: AnalyticsTask,
    *,
    terminal: bool = False,
    include_manifest: bool = False,
) -> SiteInternalLinkRun | None:
    ownership = and_(
        AnalyticsTask.lease_owner == task.lease_owner,
        AnalyticsTask.status == "running",
        AnalyticsTask.lease_expires_at > datetime.now(UTC),
    )
    if terminal:
        ownership = or_(ownership, AnalyticsTask.status == "failed")
    current_task = await session.scalar(
        select(AnalyticsTask)
        .where(
            AnalyticsTask.id == task.id,
            AnalyticsTask.workspace_id == task.workspace_id,
            AnalyticsTask.project_id == task.project_id,
            ownership,
        )
        .with_for_update()
    )
    if current_task is None:
        return None
    statement = (
        select(SiteInternalLinkRun)
        .options(defer(SiteInternalLinkRun.result, raiseload=True))
        .where(
            SiteInternalLinkRun.id == uuid.UUID(str((task.payload or {})["run_id"])),
            SiteInternalLinkRun.workspace_id == task.workspace_id,
            SiteInternalLinkRun.project_id == task.project_id,
        )
        .with_for_update()
    )
    # The manifest contains the whole site's bounded evidence. Fetch it once
    # per job, never once per credit reservation/settlement or progress write.
    if not include_manifest:
        statement = statement.options(
            defer(SiteInternalLinkRun.manifest, raiseload=True)
        )
    return await session.scalar(statement)


def event(
    run: SiteInternalLinkRun, candidate_id: uuid.UUID, kind: str, evidence: dict
) -> SiteInternalLinkEvent:
    return SiteInternalLinkEvent(
        workspace_id=run.workspace_id,
        project_id=run.project_id,
        run_id=run.id,
        candidate_id=candidate_id,
        kind=kind,
        evidence=evidence,
    )


@dataclass
class DispatchContext:
    events: dict[uuid.UUID, list[SiteInternalLinkEvent]]
    unavailable_reason: str
    account_id: uuid.UUID | None


async def dispatch_context(
    session: AsyncSession, run: SiteInternalLinkRun, candidates: list[dict]
) -> DispatchContext:
    rows = list(
        await session.scalars(
            select(SiteInternalLinkEvent).where(
                SiteInternalLinkEvent.run_id == run.id,
                SiteInternalLinkEvent.workspace_id == run.workspace_id,
                SiteInternalLinkEvent.candidate_id.in_(
                    [uuid.UUID(c["id"]) for c in candidates]
                ),
            )
        )
    )
    events: dict[uuid.UUID, list[SiteInternalLinkEvent]] = {}
    for row in rows:
        events.setdefault(row.candidate_id, []).append(row)
    role = await session.scalar(
        select(WorkspaceMember.role).where(
            WorkspaceMember.workspace_id == run.workspace_id,
            WorkspaceMember.user_id == run.actor_id,
        )
    )
    reason = ""
    if not role or not role_allows(role, WorkspaceCapability.RUN):
        reason = "permission_unavailable"
    elif not jev_settings.enabled:
        reason = "provider_unconfigured"
    account_id = (
        None if reason else await billing_account_id_for(session, run.workspace_id)
    )
    return DispatchContext(events, reason, account_id)


async def prepare_dispatch(
    session: AsyncSession,
    run: SiteInternalLinkRun,
    candidate: dict,
    *,
    context: DispatchContext,
) -> dict | None:
    candidate_id = uuid.UUID(candidate["id"])
    existing = context.events.get(candidate_id, [])
    if any(row.kind == "outcome" for row in existing):
        return None
    dispatched = next((row for row in existing if row.kind == "dispatch"), None)
    if dispatched is not None:
        await finish_dispatch(
            session,
            run,
            candidate_id,
            dispatched.evidence,
            {"state": "uncertain", "reason": "interrupted_dispatch"},
        )
        return None
    if context.unavailable_reason:
        session.add(
            event(
                run,
                candidate_id,
                "outcome",
                {
                    "state": "unavailable",
                    "reason": context.unavailable_reason,
                },
            )
        )
        return None
    try:
        account_id = context.account_id
        if account_id is None:
            raise LedgerError("internal_link_account_unavailable")
        reservation = await reserve_metered_usage(
            session,
            account_id=account_id,
            capability_key=KEY_AI_CREDITS,
            subject=MeteredSubject(
                kind="site_crawl",
                subject_id=run.crawl_id,
                workspace_id=run.workspace_id,
            ),
            hold_units=config.INTERNAL_LINKS_CREDITS_PER_JUDGMENT,
            idempotency_key=f"internal-link:{run.id}:{candidate_id}",
            at=datetime.now(UTC),
        )
    except (LedgerError, FundedCreditsExhaustedError):
        session.add(
            event(
                run,
                candidate_id,
                "outcome",
                {"state": "unavailable", "reason": "funding_unavailable"},
            )
        )
        return None
    evidence = {
        "request": candidate["request"],
        "model": jev_settings.model,
        "policy_version": run.policy_version,
        "credits": config.INTERNAL_LINKS_CREDITS_PER_JUDGMENT,
        "reservation_id": str(reservation.reservation_id),
    }
    session.add(event(run, candidate_id, "dispatch", evidence))
    return evidence


async def finish_dispatch(
    session: AsyncSession,
    run: SiteInternalLinkRun,
    candidate_id: uuid.UUID,
    dispatch: dict,
    outcome: dict,
) -> None:
    # A flat per-judgment charge; a dispatch that made no provider call is free.
    charged_credits = (
        0 if outcome["state"] == "unavailable" else int(dispatch["credits"])
    )
    await settle_metered_usage(
        session,
        reservation_id=uuid.UUID(dispatch["reservation_id"]),
        dispatch_key=str(candidate_id),
        attempt=1,
        charged_units=charged_credits,
        unknown_usage_charge=charged_credits,
        idempotency_key=f"internal-link:{run.id}:{candidate_id}:settle",
        at=datetime.now(UTC),
    )
    session.add(event(run, candidate_id, "outcome", outcome))
