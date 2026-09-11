"""Usage and admission share persisted account-wide occupancy without writes."""

from __future__ import annotations

from datetime import UTC, datetime

import httpx
import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.billing.reads import account_usage
from app.domain.entitlements.types import GrantSpec
from app.models.project import Project
from app.models.prompt import Prompt, PromptSet
from tests.component.auth_helpers import register_and_login
from tests.component.occupancy_helpers import (
    seed_account_workspace,
    seed_occupancy_grants,
)


@pytest.mark.asyncio
@pytest.mark.parametrize("email", ["ordinary@example.com", "dev@citeladder.com"])
async def test_login_usage_allows_first_project(
    client: httpx.AsyncClient, email: str
) -> None:
    await register_and_login(client, email)
    assert (await client.get("/api/v1/projects")).json() == []
    response = await client.get("/api/v1/billing/usage")
    assert response.status_code == 200
    items = {item["key"]: item for item in response.json()["items"]}
    slots = items["project_slots"]
    assert slots["limit_state"] == "finite"
    assert slots["allowance"] > 0
    assert slots["consumed"] == slots["reserved"] == 0
    assert slots["remaining"] == slots["allowance"]


@pytest.mark.asyncio
async def test_usage_counts_only_its_own_workspace(
    db_session: AsyncSession,
) -> None:
    """One workspace, one account: usage is that workspace's occupancy.

    A second workspace has its OWN account and its own budget, so its
    projects and prompts never appear in this account's usage. This replaces
    the previous multi-workspace aggregation, superseded by the owner's
    one-account-per-workspace decision.
    """
    account, workspace, _ = await seed_account_workspace(db_session)
    _, foreign_workspace, _ = await seed_account_workspace(db_session)
    for workspace_id in (workspace.id, foreign_workspace.id):
        project = Project(workspace_id=workspace_id, name="Persisted project")
        db_session.add(project)
        await db_session.flush()
        prompt_set = PromptSet(project_id=project.id, name="Persisted set")
        db_session.add(prompt_set)
        await db_session.flush()
        db_session.add(
            Prompt(
                prompt_set_id=prompt_set.id, text="Persisted prompt", status="archived"
            )
        )
    await seed_occupancy_grants(
        db_session,
        workspace_id=workspace.id,
        grants=(
            GrantSpec(key="project_slots", value=1),
            GrantSpec(key="prompt_slots", value=5),
        ),
    )
    await db_session.commit()
    before_version = account.entitlement_lifecycle_version
    usage = await account_usage(db_session, account=account, at=datetime.now(UTC))
    items = {item.key: item for item in usage.items}
    assert (
        items["project_slots"].allowance,
        items["project_slots"].consumed,
        items["project_slots"].remaining,
    ) == (1, 1, 0)
    assert (
        items["prompt_slots"].allowance,
        items["prompt_slots"].consumed,
        items["prompt_slots"].remaining,
    ) == (5, 1, 4)
    assert items["project_slots"].reserved == items["prompt_slots"].reserved == 0
    assert items["monitored_urls"].limit_state == "unknown"
    assert not db_session.new and not db_session.dirty and not db_session.deleted
    assert account.entitlement_lifecycle_version == before_version


@pytest.mark.asyncio
async def test_missing_occupancy_authority_stays_unknown(
    db_session: AsyncSession,
) -> None:
    account, _, _ = await seed_account_workspace(db_session)
    usage = await account_usage(db_session, account=account, at=datetime.now(UTC))
    slots = next(item for item in usage.items if item.key == "project_slots")
    assert slots.limit_state == "unknown"
    assert (
        slots.allowance is slots.consumed is slots.reserved is slots.remaining is None
    )
