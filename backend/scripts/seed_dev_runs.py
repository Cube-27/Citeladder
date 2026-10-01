"""Worker drains for the development seeder.

``seed_dev_data`` builds rows; this module runs the REAL workers over them:
the two audits, the Site Health crawl trio, and the opportunity/comparison
pass. The Opportunity refresh is the TypeScript analytics worker's
(migration PR 7a): the seeder enqueues it and waits for that worker. Split
out so row construction and worker orchestration are separately readable,
and so neither module carries the other's imports.

Nothing here is reachable from the API or a worker image (``setuptools`` ships
``app*`` only). It is gated exactly like ``app/`` -- ruff, mypy, the CC/LOC
policy, vulture -- because an operational script that silently rots is a
script nobody can run on the day they need it.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.config.analytics import ANALYTICS_TASK_KIND_OPPORTUNITY_REFRESH
from app.core.config.entitlements import KEY_MONITORED_URLS
from app.core.config.provider_catalog import (
    ENGINE_CHATGPT,
    ENGINE_CLAUDE,
    ENGINE_GEMINI,
)
from app.core.config.site_health_contracts import (
    CRAWL_STATUS_COMPLETED,
    CRAWL_TERMINAL_STATUSES,
)
from app.core.config.task_queue import (
    TASK_STATUS_CANCELLED,
    TASK_STATUS_FAILED,
    TASK_STATUS_SUCCEEDED,
)
from app.core.database import SessionLocal
from app.domain.billing.bootstrap import ensure_workspace_billing
from app.domain.entitlements.grants import issue_override_bundle
from app.domain.entitlements.types import GrantSpec
from app.domain.opportunities.queue import enqueue_opportunity_refresh
from app.domain.site_health.planner import create_crawl
from app.domain.site_health.selection import (
    BULK_SELECT_MODE_ALL,
    bulk_select_monitored_set,
)
from app.models.analytics import AnalyticsTask
from app.models.project import Project
from app.models.prompt import Prompt, PromptSet
from app.models.site_health.crawl import SiteCrawl
from app.models.user import User
from app.workers.site_health_worker import SiteHealthWorker
from scripts.seed_dev_support import (
    SEED_MONITORED_URL_ALLOWANCE,
    _FakeResolver,
    _site_transport,
    seed_answer,
)

logger = logging.getLogger("seed_dev_data")
NATIVE_API_ROOT = Path(__file__).resolve().parents[2] / "frontend" / "services" / "api"

#: Every engine the primary project audits across.
#
#: The three ANSWER ENGINES only, deliberately. ``google_ai_overview`` is a
#: fourth measured surface in the product, but the seeder's deterministic stub
#: replaces ``audit_execution.build_adapter``, and an observed surface does not
#: go through it -- it takes the submit/park/poll branch, which constructs its
#: DataForSEO adapter directly. Adding the surface here would make `seed_dev`
#: POST real, billable tasks to a live provider with a fake dev key. Seeding it
#: needs a stubbed search-surface adapter first.
ALL_ENGINES = [ENGINE_CHATGPT, ENGINE_CLAUDE, ENGINE_GEMINI]

#: How long the seeder waits for the TypeScript analytics worker to refresh.
SEED_REFRESH_TIMEOUT_SECONDS = 120
_REFRESH_TERMINAL = (TASK_STATUS_SUCCEEDED, TASK_STATUS_FAILED, TASK_STATUS_CANCELLED)


async def seed_monitored_urls_grant(
    session: AsyncSession,
    owner_user_id: uuid.UUID,
    workspace_id: uuid.UUID,
) -> None:
    """Give the demo workspace a positive ``monitored_urls`` allowance.

    Uses the production grant path (billing bootstrap + operator override
    bundle) so the projected ``WorkspaceSiteHealthRuntime`` row is a true
    projection: full discovery, user selection, and count disclosure -- exactly
    what the seeded "discover -> select -> recrawl analyzes" flow needs.
    """
    owner = await session.get(User, owner_user_id)
    if owner is None:  # pragma: no cover - the seeder just created this user
        raise RuntimeError("demo user missing during entitlement seed")
    account = await ensure_workspace_billing(
        session, workspace_id=workspace_id, provisioning_user=owner
    )
    await issue_override_bundle(
        session,
        operator_user=owner,
        account_id=account.id,
        grants=(GrantSpec(key=KEY_MONITORED_URLS, value=SEED_MONITORED_URL_ALLOWANCE),),
        reason="dev seed monitored-URL allowance",
        valid_from=datetime.now(UTC) - timedelta(days=1),
        valid_until=None,
        idempotency_key=f"seed-dev-data:{workspace_id}",
    )


async def drain_site_crawl(
    worker: SiteHealthWorker, *, workspace_id: uuid.UUID, crawl_id: uuid.UUID
) -> None:
    """Drain delayed host-gated tasks until the selected crawl terminalizes."""
    for _ in range(120):
        await worker.run_until_idle()
        async with SessionLocal() as session:
            status = await session.scalar(
                select(SiteCrawl.status).where(
                    SiteCrawl.id == crawl_id,
                    SiteCrawl.workspace_id == workspace_id,
                )
            )
        if status in CRAWL_TERMINAL_STATUSES:
            if status != CRAWL_STATUS_COMPLETED:
                raise RuntimeError(
                    f"seed Site Health crawl terminalized unsuccessfully: "
                    f"{crawl_id} ({status})"
                )
            return
        await asyncio.sleep(0.25)
    raise RuntimeError(f"seed Site Health crawl did not terminalize: {crawl_id}")


async def _run_audit(
    *,
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    engines: list[str],
    owner: str,
    random_seed: str,
    repetitions: int,
    prompt_set_id: uuid.UUID | None = None,
    prompt_ids: list[uuid.UUID] | None = None,
    generation: int = 0,
) -> uuid.UUID:
    """Plan one audit through the real planner, then drain it to completion."""
    async with SessionLocal() as session:
        query = (
            select(Prompt.text)
            .join(PromptSet, PromptSet.id == Prompt.prompt_set_id)
            .join(Project, Project.id == PromptSet.project_id)
            .where(Project.workspace_id == workspace_id, Project.id == project_id)
        )
        if prompt_ids:
            query = query.where(Prompt.id.in_(prompt_ids))
        elif prompt_set_id:
            query = query.where(Prompt.prompt_set_id == prompt_set_id)
        texts = list((await session.scalars(query)).all())
    request = {
        "workspace_id": str(workspace_id),
        "input": {
            "project_id": str(project_id),
            "prompt_set_id": str(prompt_set_id) if prompt_set_id else None,
            "prompt_ids": [str(value) for value in prompt_ids or []],
            "engines": engines,
            "repetitions": repetitions,
            "random_seed": random_seed,
        },
        "answers": {text: seed_answer(text, generation) for text in texts},
    }
    process = await asyncio.create_subprocess_exec(
        "node",
        "src/cli/seed-audit.ts",
        cwd=NATIVE_API_ROOT,
        env={
            **os.environ,
            "APP_ENV": settings.app_env,
            "DATABASE_URL": settings.database_url,
            "ENCRYPTION_KEY": settings.encryption_key,
        },
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    output, _errors = await process.communicate(json.dumps(request).encode())
    if process.returncode:
        raise RuntimeError("Native development audit failed")
    audit_id = uuid.UUID(json.loads(output.decode().splitlines()[-1])["audit_id"])
    logger.info("Completed audit %s for project %s via %s", audit_id, project_id, owner)
    return audit_id


async def run_seed_audits(
    *,
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    active_prompt_ids: list[uuid.UUID],
    agency_workspace_id: uuid.UUID,
    project2_id: uuid.UUID,
    prompt_set2_id: uuid.UUID,
) -> uuid.UUID:
    """Run both seeded audits against the stubbed adapter (no network calls).

    Returns the primary project's audit id, which the action set is built from.
    """
    audit1_id = await _run_audit(
        workspace_id=workspace_id,
        project_id=project_id,
        engines=ALL_ENGINES,
        owner="seed-worker-1",
        random_seed="42",
        repetitions=2,
        prompt_ids=active_prompt_ids,
    )
    await _run_audit(
        workspace_id=agency_workspace_id,
        project_id=project2_id,
        engines=[ENGINE_GEMINI],
        owner="seed-worker-2",
        random_seed="7",
        repetitions=1,
        prompt_set_id=prompt_set2_id,
    )
    return audit1_id


async def _plan_and_drain_crawl(
    worker: SiteHealthWorker,
    *,
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    random_seed: str,
    label: str,
) -> uuid.UUID:
    async with SessionLocal() as session:
        crawl = await create_crawl(
            session,
            workspace_id=workspace_id,
            project_id=project_id,
            random_seed=random_seed,
        )
        crawl_id = crawl.id
    await drain_site_crawl(worker, workspace_id=workspace_id, crawl_id=crawl_id)
    logger.info("Completed %s %s", label, crawl_id)
    return crawl_id


async def run_site_health_crawls(
    *, workspace_id: uuid.UUID, project_id: uuid.UUID, demo_user_id: uuid.UUID
) -> uuid.UUID:
    """Discover, select every URL as monitored, then run two analysis crawls.

    Runs the REAL crawl planner (``create_crawl``) and the REAL
    ``SiteHealthWorker`` (against a mocked transport), mirroring the production
    "discover -> select monitored URLs -> recrawl analyzes" flow; a hand-built
    crawl/task never goes through that selection gate.

    The second analysis crawl supplies the immediate comparable A/B pair the
    Website Changes projection needs. The deterministic transport is unchanged
    between the two, so it is also the clean-stack zero-false-regression proof.
    Returns that crawl's id.
    """
    async with SessionLocal() as session:
        await seed_monitored_urls_grant(session, demo_user_id, workspace_id)
        # `ensure_user_billing` and `issue_override_bundle` leave the
        # transaction to the caller. While this ran in the same session as
        # `create_crawl` it was committed by that call as a side effect;
        # each stage owns its own session now, so it commits its own writes.
        # Without this the allowance rolls back and the planner falls through
        # to a sample crawl, so no monitored analysis flow is seeded at all.
        await session.commit()

    worker = SiteHealthWorker(
        session_factory=SessionLocal,
        owner="seed-site-worker",
        resolver=_FakeResolver(),
        transport=_site_transport(),
    )
    discovery_crawl_id = await _plan_and_drain_crawl(
        worker,
        workspace_id=workspace_id,
        project_id=project_id,
        random_seed="99",
        label="site health discovery crawl",
    )
    async with SessionLocal() as session:
        await bulk_select_monitored_set(
            session,
            workspace_id=workspace_id,
            project_id=project_id,
            crawl_id=discovery_crawl_id,
            mode=BULK_SELECT_MODE_ALL,
            expected_selection_version=0,
        )
        await session.commit()

    await _plan_and_drain_crawl(
        worker,
        workspace_id=workspace_id,
        project_id=project_id,
        random_seed="100",
        label="site health analysis crawl",
    )
    return await _plan_and_drain_crawl(
        worker,
        workspace_id=workspace_id,
        project_id=project_id,
        random_seed="101",
        label="comparable site health crawl",
    )


async def _refresh_opportunities(
    *,
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    trigger_kind: str,
    trigger_id: uuid.UUID,
) -> None:
    """Enqueue a source's refresh and wait for the TypeScript worker to run it.

    The finished audit or crawl already enqueued the same idempotent task, so
    this only makes sure it exists. A failed or unfinished refresh is logged;
    a seed run without the TypeScript analytics worker leaves it queued.
    """
    async with SessionLocal() as session:
        await enqueue_opportunity_refresh(
            session,
            workspace_id=workspace_id,
            project_id=project_id,
            trigger_kind=trigger_kind,
            trigger_id=trigger_id,
        )
        await session.commit()
    deadline = asyncio.get_running_loop().time() + SEED_REFRESH_TIMEOUT_SECONDS
    while asyncio.get_running_loop().time() < deadline:
        async with SessionLocal() as session:
            status = await session.scalar(
                select(AnalyticsTask.status).where(
                    AnalyticsTask.workspace_id == workspace_id,
                    AnalyticsTask.task_kind == ANALYTICS_TASK_KIND_OPPORTUNITY_REFRESH,
                    AnalyticsTask.payload["trigger_id"].astext == str(trigger_id),
                )
            )
        if status in _REFRESH_TERMINAL:
            if status != TASK_STATUS_SUCCEEDED:
                logger.warning(
                    "Opportunity refresh for %s %s ended %s",
                    trigger_kind,
                    trigger_id,
                    status,
                )
            return
        await asyncio.sleep(1)
    logger.warning(
        "Opportunity refresh for %s %s did not finish in %ss; is the "
        "TypeScript analytics worker running?",
        trigger_kind,
        trigger_id,
        SEED_REFRESH_TIMEOUT_SECONDS,
    )


async def run_actions_and_comparison(
    *,
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    active_prompt_ids: list[uuid.UUID],
    audit_id: uuid.UUID,
    site_crawl_id: uuid.UUID,
) -> None:
    """Materialize the first action set, then give it comparable history.

    Later deterministic adapter generations improve the evidence mix without
    changing prompt or engine identity, which keeps the pair comparable.
    """
    # The crawl finished after the audit, so its refresh reads both.
    await _refresh_opportunities(
        workspace_id=workspace_id,
        project_id=project_id,
        trigger_kind="site_crawl",
        trigger_id=site_crawl_id,
    )

    comparison_audit_id = audit_id
    for generation, random_seed in ((1, "43"), (2, "44")):
        comparison_audit_id = await _run_audit(
            workspace_id=workspace_id,
            project_id=project_id,
            engines=ALL_ENGINES,
            owner=f"seed-worker-comparison-{generation}",
            random_seed=random_seed,
            repetitions=2,
            prompt_ids=active_prompt_ids,
            generation=generation,
        )

    await _refresh_opportunities(
        workspace_id=workspace_id,
        project_id=project_id,
        trigger_kind="audit",
        trigger_id=comparison_audit_id,
    )
    logger.info(
        "Completed comparable audit %s with action history for project %s",
        comparison_audit_id,
        project_id,
    )
