"""Dispatch and outcome events for frozen internal-link JEV requests."""

import uuid
from datetime import UTC, datetime

from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import defer

from app.core.config.jev import jev_settings
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


async def unavailable_reason(session: AsyncSession, run: SiteInternalLinkRun) -> str:
    """Why no judgment may be sent for this run, or an empty string."""
    role = await session.scalar(
        select(WorkspaceMember.role).where(
            WorkspaceMember.workspace_id == run.workspace_id,
            WorkspaceMember.user_id == run.actor_id,
        )
    )
    if not role or not role_allows(role, WorkspaceCapability.RUN):
        return "permission_unavailable"
    if not jev_settings.enabled:
        return "provider_unconfigured"
    return ""


async def prepare_dispatches(
    session: AsyncSession, run: SiteInternalLinkRun, requests: list[dict]
) -> list[dict]:
    """Record every sendable request's dispatch in one write; return those requests.

    A request dispatched by an earlier attempt without an outcome is never
    resent: its pairs settle as uncertain.
    """
    kinds: dict[uuid.UUID, set[str]] = {}
    for candidate_id, kind in await session.execute(
        select(SiteInternalLinkEvent.candidate_id, SiteInternalLinkEvent.kind).where(
            SiteInternalLinkEvent.run_id == run.id,
            SiteInternalLinkEvent.workspace_id == run.workspace_id,
        )
    ):
        kinds.setdefault(candidate_id, set()).add(kind)
    reason = await unavailable_reason(session, run)
    sendable = []
    for request in requests:
        ids = [uuid.UUID(item["id"]) for item in request["candidates"]]
        open_ids = [i for i in ids if "outcome" not in kinds.get(i, set())]
        if not open_ids:
            continue
        if any("dispatch" in kinds.get(i, set()) for i in open_ids):
            outcome = {"state": "uncertain", "reason": "interrupted_dispatch"}
        elif reason:
            outcome = {"state": "unavailable", "reason": reason}
        else:
            evidence = {
                "request_id": request["id"],
                "model": jev_settings.model,
                "policy_version": run.policy_version,
            }
            session.add_all(event(run, i, "dispatch", evidence) for i in open_ids)
            sendable.append(request)
            continue
        session.add_all(event(run, i, "outcome", outcome) for i in open_ids)
    return sendable
