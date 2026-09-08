"""Race-safe billing bootstrap for users and owner workspaces.

Ensures the ``BillingAccount`` and ``WorkspaceBillingLink`` rows, then applies
the idempotent public-signup or configured-development entitlement baseline.
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
from app.domain.entitlements.grants import issue_grant_bundle
from app.domain.entitlements.types import GrantSpec
from app.models.billing import (
    BillingAccount,
    BillingCatalogRevision,
    WorkspaceBillingLink,
)
from app.models.user import User
from app.models.workspace import WorkspaceMember


async def ensure_user_billing(
    session: AsyncSession,
    user: User,
    *,
    workspace_ids: tuple[uuid.UUID, ...] | None = None,
    provision_access: bool = True,
) -> BillingAccount:
    """Ensure one account and links for owned workspaces.

    The caller owns the transaction boundary. PostgreSQL upserts make login
    repair and concurrent first requests idempotent without rolling back the
    caller's registration/workspace transaction.
    """
    await session.execute(
        pg_insert(BillingAccount)
        .values(owner_user_id=user.id, registration_cohort_at=user.created_at)
        .on_conflict_do_nothing(index_elements=["owner_user_id"])
    )
    account = await session.scalar(
        select(BillingAccount).where(BillingAccount.owner_user_id == user.id)
    )
    if account is None:  # pragma: no cover - impossible after insert/select
        raise RuntimeError("billing account bootstrap failed")

    if workspace_ids is None:
        workspace_ids = tuple(
            (
                await session.scalars(
                    select(WorkspaceMember.workspace_id).where(
                        WorkspaceMember.user_id == user.id,
                        WorkspaceMember.role == "owner",
                    )
                )
            ).all()
        )

    for workspace_id in dict.fromkeys(workspace_ids):
        await session.execute(
            pg_insert(WorkspaceBillingLink)
            .values(workspace_id=workspace_id, billing_account_id=account.id)
            .on_conflict_do_nothing(index_elements=["workspace_id"])
        )

    await session.flush()
    if provision_access:
        await _ensure_baseline_access(session, user=user, account=account)
    return account


async def _ensure_baseline_access(
    session: AsyncSession, *, user: User, account: BillingAccount
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
    """Cheap read-only guard for the common successful-login path."""
    account = await session.scalar(
        select(BillingAccount).where(BillingAccount.owner_user_id == user.id)
    )
    if account is None:
        return False
    owner_workspace_ids = set(
        (
            await session.scalars(
                select(WorkspaceMember.workspace_id).where(
                    WorkspaceMember.user_id == user.id,
                    WorkspaceMember.role == "owner",
                )
            )
        ).all()
    )
    linked_workspace_ids = set(
        (
            await session.scalars(
                select(WorkspaceBillingLink.workspace_id).where(
                    WorkspaceBillingLink.billing_account_id == account.id,
                    WorkspaceBillingLink.workspace_id.in_(owner_workspace_ids),
                )
            )
        ).all()
    )
    return owner_workspace_ids == linked_workspace_ids


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
