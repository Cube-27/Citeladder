"""Reuse the shared provider and credit owners for frozen content questions."""

import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import site_health_content_structure as config
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
from app.models.site_health.content_structure import (
    SiteContentStructureEvent,
    SiteContentStructureRun,
)
from app.models.workspace import WorkspaceMember


async def locked_run(
    session: AsyncSession, task: AnalyticsTask
) -> SiteContentStructureRun | None:
    current_task = await session.scalar(
        select(AnalyticsTask)
        .where(
            AnalyticsTask.id == task.id,
            AnalyticsTask.workspace_id == task.workspace_id,
            AnalyticsTask.lease_owner == task.lease_owner,
            AnalyticsTask.status == "running",
            AnalyticsTask.lease_expires_at > datetime.now(UTC),
        )
        .with_for_update()
    )
    if current_task is None:
        return None
    return await session.scalar(
        select(SiteContentStructureRun)
        .where(
            SiteContentStructureRun.id
            == uuid.UUID(str((task.payload or {})["run_id"])),
            SiteContentStructureRun.workspace_id == task.workspace_id,
            SiteContentStructureRun.project_id == task.project_id,
        )
        .with_for_update()
    )


def event(
    run: SiteContentStructureRun, candidate_id: uuid.UUID, kind: str, evidence: dict
) -> SiteContentStructureEvent:
    return SiteContentStructureEvent(
        workspace_id=run.workspace_id,
        project_id=run.project_id,
        run_id=run.id,
        candidate_id=candidate_id,
        kind=kind,
        evidence=evidence,
    )


async def prepare_dispatch(
    session: AsyncSession, run: SiteContentStructureRun, candidate: dict
) -> dict | None:
    candidate_id = uuid.UUID(candidate["id"])
    existing = list(
        await session.scalars(
            select(SiteContentStructureEvent).where(
                SiteContentStructureEvent.run_id == run.id,
                SiteContentStructureEvent.workspace_id == run.workspace_id,
                SiteContentStructureEvent.candidate_id == candidate_id,
            )
        )
    )
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
    role = await session.scalar(
        select(WorkspaceMember.role).where(
            WorkspaceMember.workspace_id == run.workspace_id,
            WorkspaceMember.user_id == run.actor_id,
        )
    )
    if (
        not role
        or not role_allows(role, WorkspaceCapability.RUN)
        or not jev_settings.enabled
    ):
        session.add(event(run, candidate_id, "outcome", {"state": "unavailable"}))
        return None
    try:
        account_id = await billing_account_id_for(session, run.workspace_id)
        if account_id is None:
            raise LedgerError("content_structure_account_unavailable")
        reservation = await reserve_metered_usage(
            session,
            account_id=account_id,
            capability_key=KEY_AI_CREDITS,
            subject=MeteredSubject(
                kind="site_crawl",
                subject_id=run.crawl_id,
                workspace_id=run.workspace_id,
            ),
            hold_units=config.CONTENT_STRUCTURE_CREDITS_PER_JUDGMENT,
            idempotency_key=f"content:{run.id}:{candidate_id}",
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
        "credits": config.CONTENT_STRUCTURE_CREDITS_PER_JUDGMENT,
        "reservation_id": str(reservation.reservation_id),
    }
    session.add(event(run, candidate_id, "dispatch", evidence))
    return evidence


async def finish_dispatch(
    session: AsyncSession,
    run: SiteContentStructureRun,
    candidate_id: uuid.UUID,
    dispatch: dict,
    outcome: dict,
) -> None:
    # A flat per-judgment charge; a dispatch that made no provider call is free.
    credits = 0 if outcome["state"] == "unavailable" else int(dispatch["credits"])
    await settle_metered_usage(
        session,
        reservation_id=uuid.UUID(dispatch["reservation_id"]),
        dispatch_key=str(candidate_id),
        attempt=1,
        charged_units=credits,
        unknown_usage_charge=credits,
        idempotency_key=f"content:{run.id}:{candidate_id}:settle",
        at=datetime.now(UTC),
    )
    session.add(event(run, candidate_id, "outcome", outcome))
