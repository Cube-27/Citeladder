"""Trusted billing-operator domain operations."""

from __future__ import annotations

import re
import uuid
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.billing.catalog_revisions import (
    approved_phase1_payload,
    create_draft,
    publish_revision,
    seed_phase1_draft,
    validate_payload,
)
from app.domain.entitlements.grants import issue_override_bundle, revoke_grants
from app.domain.entitlements.types import GrantSpec
from app.models.billing import (
    AccountGrant,
    BillingAccount,
    BillingCatalogRevision,
    GrantRevocation,
)
from app.models.user import User

_SECRET_FIELD = re.compile(r"(?:secret|password|api[_-]?key|credential|code)", re.I)


@dataclass(frozen=True, slots=True)
class OperatorContext:
    actor: User
    reason: str
    idempotency_key: str
    dry_run: bool


def require_operator(context: OperatorContext) -> None:
    if not context.actor.is_active or context.actor.role != "admin":
        raise PermissionError("active_admin_required")
    if not context.reason.strip() or len(context.reason) > 255:
        raise ValueError("reason_required")
    if not context.idempotency_key.strip() or len(context.idempotency_key) > 255:
        raise ValueError("idempotency_key_required")


def redact(value: Any) -> Any:
    if isinstance(value, dict):
        return {
            key: "[REDACTED]" if _SECRET_FIELD.search(key) else redact(item)
            for key, item in value.items()
        }
    if isinstance(value, list):
        return [redact(item) for item in value]
    return value


async def catalog_validate(payload: dict[str, object]) -> dict[str, object]:
    parsed = validate_payload(payload)
    return redact(parsed.model_dump(mode="json"))


async def catalog_diff(
    session: AsyncSession, payload: dict[str, object]
) -> dict[str, object]:
    proposed = validate_payload(payload).model_dump(mode="json")
    current = await session.scalar(
        select(BillingCatalogRevision).where(
            BillingCatalogRevision.publication_state == "published"
        )
    )
    return redact(
        {
            "current_revision": current.revision if current else None,
            "changed": current is None or current.payload != proposed,
        }
    )


async def seed_catalog(
    session: AsyncSession, *, context: OperatorContext
) -> BillingCatalogRevision:
    require_operator(context)
    row = await seed_phase1_draft(session, actor=context.actor, reason=context.reason)
    if context.dry_run:
        await session.rollback()
    return row


async def import_catalog(
    session: AsyncSession,
    *,
    revision: str,
    payload: dict[str, object],
    context: OperatorContext,
) -> BillingCatalogRevision:
    require_operator(context)
    row = await create_draft(
        session,
        revision=revision,
        payload=payload,
        actor=context.actor,
        reason=context.reason,
    )
    if context.dry_run:
        await session.rollback()
    return row


async def publish_catalog(
    session: AsyncSession, *, revision: str, context: OperatorContext
) -> BillingCatalogRevision:
    require_operator(context)
    row = await publish_revision(
        session, revision=revision, actor=context.actor, reason=context.reason
    )
    if context.dry_run:
        await session.rollback()
    return row


async def inspect_account(
    session: AsyncSession, *, account_id: uuid.UUID, context: OperatorContext
) -> dict[str, object]:
    require_operator(context)
    account = await session.get(BillingAccount, account_id)
    if account is None:
        raise ValueError("billing_account_not_found")
    grants = (
        (
            await session.execute(
                select(AccountGrant).where(
                    AccountGrant.billing_account_id == account_id
                )
            )
        )
        .scalars()
        .all()
    )
    return {
        "account_id": str(account.id),
        "status": account.status,
        "grant_ids": [str(row.id) for row in grants],
    }


async def issue_grant(
    session: AsyncSession,
    *,
    account_id: uuid.UUID,
    key: str,
    value: int,
    valid_from: datetime,
    valid_until: datetime | None,
    context: OperatorContext,
) -> tuple[AccountGrant, ...]:
    require_operator(context)
    if value < 0:
        raise ValueError("grant_value_must_be_nonnegative")
    rows = await issue_override_bundle(
        session,
        operator_user=context.actor,
        account_id=account_id,
        grants=(GrantSpec(key=key, value=value),),
        reason=context.reason,
        valid_from=valid_from,
        valid_until=valid_until,
        idempotency_key=context.idempotency_key,
    )
    if context.dry_run:
        await session.rollback()
    return rows


async def revoke_grant(
    session: AsyncSession,
    *,
    grant_id: uuid.UUID,
    effective_from: datetime,
    context: OperatorContext,
) -> tuple[GrantRevocation, ...]:
    require_operator(context)
    row = await session.get(AccountGrant, grant_id)
    if row is None:
        raise ValueError("grant_not_found")
    rows = await revoke_grants(
        session,
        grant_ids=(grant_id,),
        effective_from=effective_from,
        reason=context.reason,
        actor_kind="operator",
        actor_user_id=context.actor.id,
        idempotency_key=context.idempotency_key,
    )
    if context.dry_run:
        await session.rollback()
    return rows


def phase1_seed_payload() -> dict[str, object]:
    return approved_phase1_payload()
