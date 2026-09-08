"""Read-only persisted occupancy across billing-account-linked workspaces."""

from __future__ import annotations

import uuid
from collections.abc import Awaitable, Callable

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config.entitlements import KEY_PROJECT_SLOTS, KEY_PROMPT_SLOTS
from app.models.billing import WorkspaceBillingLink
from app.models.project import Project
from app.models.prompt import Prompt, PromptSet


async def _count_project_slots(session: AsyncSession, account_id: uuid.UUID) -> int:
    """Every Project in every workspace linked to the account."""
    return int(
        (
            await session.execute(
                select(func.count())
                .select_from(Project)
                .join(
                    WorkspaceBillingLink,
                    WorkspaceBillingLink.workspace_id == Project.workspace_id,
                )
                .where(WorkspaceBillingLink.billing_account_id == account_id)
            )
        ).scalar_one()
    )


async def _count_prompt_slots(session: AsyncSession, account_id: uuid.UUID) -> int:
    """Every persisted Prompt reachable through set/project/workspace links.

    Proposed, active, archived, manual, imported, and generated rows all
    count; only deletion frees a slot.
    """
    return int(
        (
            await session.execute(
                select(func.count())
                .select_from(Prompt)
                .join(PromptSet, PromptSet.id == Prompt.prompt_set_id)
                .join(Project, Project.id == PromptSet.project_id)
                .join(
                    WorkspaceBillingLink,
                    WorkspaceBillingLink.workspace_id == Project.workspace_id,
                )
                .where(WorkspaceBillingLink.billing_account_id == account_id)
            )
        ).scalar_one()
    )


# Key-specific aggregate queries. ``monitored_urls`` is intentionally absent:
# site_health's ``replace_monitored_set()`` stays its enforcement owner.
OCCUPANCY_COUNTERS: dict[str, Callable[[AsyncSession, uuid.UUID], Awaitable[int]]] = {
    KEY_PROJECT_SLOTS: _count_project_slots,
    KEY_PROMPT_SLOTS: _count_prompt_slots,
}
