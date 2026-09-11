"""Race-safe billing bootstrap for workspaces.

Ensures the workspace's single ``BillingAccount`` row, then applies the
idempotent public-signup or configured-development entitlement baseline
(plan §2.2). One workspace, one account: creating another workspace
provisions only its own baseline terms and never copies another workspace's
grants or subscription.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config.entitlements import (
    BASELINE_GRANT_REVISION,
    CAPABILITY_REGISTRY,
    FREE_MONITORED_URLS,
    FREE_PROJECT_SLOTS,
    FREE_PROMPT_SLOTS,
    GRANT_SOURCE_OVERRIDE,
    KEY_MONITORED_URLS,
    KEY_PROJECT_SLOTS,
    KEY_PROMPT_SLOTS,
    CapabilityType,
)
from app.domain.billing.accounts import billing_account_for
from app.domain.entitlements.grants import issue_grant_bundle
from app.domain.entitlements.types import GrantSpec
from app.domain.workspaces.policy import WORKSPACE_ROLE_OWNER
from app.models.billing import BillingAccount, BillingCatalogRevision
from app.models.user import User
from app.models.workspace import Workspace, WorkspaceMember


async def ensure_workspace_billing(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    provisioning_user: User,
    provision_access: bool = True,
) -> BillingAccount:
    """Ensure the ONE billing account for ``workspace_id``, idempotently.

    The caller owns the transaction boundary. A PostgreSQL upsert on the
    unique ``workspace_id`` makes login repair, concurrent first requests and
    a repeated workspace creation idempotent without rolling back the caller's
    transaction.

    ``registration_cohort_at`` is frozen from the PROVISIONING user's
    registration timestamp when the account is first created, and is never
    rewritten afterwards — not on login, not on invite acceptance, and not on
    owner transfer. That preserves the original anti-reset intent now that
    accounts belong to workspaces rather than users.
    """
    await session.execute(
        pg_insert(BillingAccount)
        .values(
            workspace_id=workspace_id,
            owner_user_id=provisioning_user.id,
            registration_cohort_at=provisioning_user.created_at,
        )
        .on_conflict_do_nothing(index_elements=["workspace_id"])
    )
    account = await billing_account_for(session, workspace_id)
    if account is None:  # pragma: no cover - impossible after insert/select
        raise RuntimeError("billing account bootstrap failed")
    await session.flush()
    if provision_access:
        await _ensure_baseline_access(session, account=account)
    return account


async def owned_workspace_account(
    session: AsyncSession, user: User, *, provision_access: bool = True
) -> BillingAccount:
    """The billing account for the ONE workspace ``user`` owns.

    Provisioning helper for operator/demo bootstrap paths that hold a user and
    need its account; ordinary request handling resolves the account from the
    REQUEST's workspace instead (``billing_account_for``), never from whoever
    is signed in.
    """
    workspace_id = await session.scalar(
        select(WorkspaceMember.workspace_id)
        .join(Workspace, Workspace.id == WorkspaceMember.workspace_id)
        .where(
            WorkspaceMember.user_id == user.id,
            WorkspaceMember.role == WORKSPACE_ROLE_OWNER,
            Workspace.is_system.is_(False),
        )
        .order_by(WorkspaceMember.created_at.asc())
        .limit(1)
    )
    if workspace_id is None:
        raise RuntimeError("user owns no workspace to provision billing for")
    return await ensure_workspace_billing(
        session,
        workspace_id=workspace_id,
        provisioning_user=user,
        provision_access=provision_access,
    )


async def ensure_billing_for_user_workspaces(
    session: AsyncSession,
    user: User,
    *,
    workspace_ids: tuple[uuid.UUID, ...] | None = None,
    provision_access: bool = True,
) -> None:
    """Repair billing for the workspaces ``user`` OWNS (login/signup path).

    Ordinary signup and login repair provision the user's own workspace.
    Accepting an invitation joins a workspace that already has its own
    account, so nothing here creates a duplicate sponsor account or copies
    personal grants into somebody else's workspace.
    """
    if workspace_ids is None:
        workspace_ids = tuple(
            (
                await session.scalars(
                    select(WorkspaceMember.workspace_id)
                    .join(Workspace, Workspace.id == WorkspaceMember.workspace_id)
                    .where(
                        WorkspaceMember.user_id == user.id,
                        WorkspaceMember.role == WORKSPACE_ROLE_OWNER,
                        Workspace.is_system.is_(False),
                    )
                )
            ).all()
        )
    for workspace_id in dict.fromkeys(workspace_ids):
        await ensure_workspace_billing(
            session,
            workspace_id=workspace_id,
            provisioning_user=user,
            provision_access=provision_access,
        )


async def _ensure_baseline_access(
    session: AsyncSession, *, account: BillingAccount
) -> None:
    """Public authentication always provisions the ordinary free profile."""
    await issue_grant_bundle(
        session,
        account_id=account.id,
        source_kind=GRANT_SOURCE_OVERRIDE,
        source_ref="system:public-signup",
        grants=(
            GrantSpec(key=KEY_PROJECT_SLOTS, value=FREE_PROJECT_SLOTS),
            GrantSpec(key=KEY_PROMPT_SLOTS, value=FREE_PROMPT_SLOTS),
            GrantSpec(key=KEY_MONITORED_URLS, value=FREE_MONITORED_URLS),
        ),
        catalog_revision=CAPABILITY_REGISTRY.revision,
        idempotency_key=f"{BASELINE_GRANT_REVISION}:system:public-signup",
        valid_from=datetime.now(UTC),
        valid_until=None,
        bundle_role="primary",
        profile_key="free",
        profile_priority=0,
    )


async def provision_development_access(
    session: AsyncSession, *, user: User, account: BillingAccount, allowance: int
) -> None:
    """Explicit bootstrap only; the audited grant is bound to the persisted UUID."""
    from app.domain.entitlements.grants import issue_override_bundle

    grants = tuple(
        GrantSpec(
            key=capability.key,
            value=(
                1
                if capability.capability_type is CapabilityType.FLAG
                else len(capability.ordered_values) - 1
                if capability.capability_type is CapabilityType.LEVEL
                else allowance
            ),
        )
        for capability in CAPABILITY_REGISTRY.entries
        if capability.issuable
    )
    await issue_override_bundle(
        session,
        operator_user=user,
        account_id=account.id,
        grants=grants,
        reason="explicit configured development bootstrap",
        valid_from=datetime.now(UTC),
        valid_until=None,
        idempotency_key=f"development-bootstrap:{user.id}:{allowance}",
    )


async def user_billing_bootstrap_complete(session: AsyncSession, user: User) -> bool:
    """Cheap read-only guard for the common successful-login path.

    True when every workspace the user OWNS already has its billing account.
    Workspaces the user only belongs to are somebody else's to provision.
    """
    owned = (
        await session.scalars(
            select(WorkspaceMember.workspace_id)
            .join(Workspace, Workspace.id == WorkspaceMember.workspace_id)
            .where(
                WorkspaceMember.user_id == user.id,
                WorkspaceMember.role == WORKSPACE_ROLE_OWNER,
                Workspace.is_system.is_(False),
            )
        )
    ).all()
    if not owned:
        return False
    provisioned = set(
        (
            await session.scalars(
                select(BillingAccount.workspace_id).where(
                    BillingAccount.workspace_id.in_(owned)
                )
            )
        ).all()
    )
    return set(owned) == provisioned


async def ensure_initial_catalog(session: AsyncSession, *, operator: User) -> None:
    """Explicit environment bootstrap; never called by public auth or reads."""
    from app.domain.billing.admin import OperatorContext, publish_catalog, seed_catalog

    if not operator.is_active or operator.role != "admin":
        raise PermissionError("active_admin_required")
    existing = await session.scalar(
        select(BillingCatalogRevision.id).where(
            BillingCatalogRevision.publication_state == "published"
        )
    )
    if existing is not None:
        return
    context = OperatorContext(
        actor=operator,
        reason="initialize approved pricing for a provisioned environment",
        idempotency_key="environment-initial-catalog",
        dry_run=False,
    )
    draft = await seed_catalog(session, context=context)
    await publish_catalog(session, revision=draft.revision, context=context)
