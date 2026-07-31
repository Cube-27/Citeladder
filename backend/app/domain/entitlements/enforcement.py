# Account-capacity serialization + occupancy enforcement (slice23 Task 4).
#
# Occupancy capabilities (``project_slots`` / ``prompt_slots``) count
# PERSISTED rows across every workspace linked to one billing account; only
# deletion frees a slot. Every check runs in the SAME transaction as the
# insert it guards, under a transaction-scoped PostgreSQL advisory lock
# derived deterministically from the account UUID and a fixed config-owned
# namespace, so concurrent mutations on one account serialize at the
# database and the committed count can never exceed the grant.
#
# Lock ordering: the account-capacity lock is always the LAST lock a path
# acquires (generation takes the project then prompt-set advisory locks
# first); no path takes a project/prompt-set lock after this one, so
# opposing lock orders cannot arise.
#
# Resolution contract — fail closed where it matters:
#   - entitlement UNRESOLVED (no billing link, missing account, corrupt
#     fold) -> ``OccupancyUnresolvedError`` (API 403); nothing inserts;
#   - resolved with NO active grant for the key -> the account is
#     unprovisioned for the capability: ``allowance`` is None and the
#     mutation is not occupancy-gated (the pre-commercial contract is
#     preserved until any grant exists);
#   - resolved with an allowance -> ``current + requested`` must fit, else
#     ``OccupancyLimitExceededError`` (API 403 with safe details).
#
# ``monitored_urls`` deliberately has NO counter here: the existing
# workspace-wide active count + runtime-row lock in site_health's
# ``replace_monitored_set()`` remains the owner of that capability (its
# allowance already projects from account grants).
from __future__ import annotations

import hashlib
import logging
import uuid
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config.entitlements import (
    CODE_OCCUPANCY_LIMIT_EXCEEDED,
    CODE_OCCUPANCY_UNRESOLVED,
    EVENT_OCCUPANCY_LIMIT_EXCEEDED,
    EVENT_OCCUPANCY_UNRESOLVED,
    KEY_PROJECT_SLOTS,
    KEY_PROMPT_SLOTS,
    OCCUPANCY_LOCK_NAMESPACE,
)
from app.domain.entitlements.service import resolve_account_entitlement
from app.domain.entitlements.types import STATUS_RESOLVED
from app.models.billing import WorkspaceBillingLink
from app.models.project import Project
from app.models.prompt import Prompt, PromptSet

logger = logging.getLogger("app.billing")


@dataclass(frozen=True, slots=True)
class OccupancySnapshot:
    """The frozen, typed outcome of one occupancy check.

    ``allowance``/``remaining`` are None when the account is unprovisioned
    for the capability (resolved entitlement, no active grant) — the check
    passes and no limit applies. ``current`` is the persisted count taken
    under the account lock; ``requested`` is the delta actually charged
    (duplicates never charge).
    """

    key: str
    allowance: int | None
    current: int
    requested: int
    remaining: int | None


class OccupancyError(RuntimeError):
    """Base for occupancy enforcement failures mapped at the API layer."""

    code: str = ""
    details: dict[str, Any] | None = None

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


class OccupancyUnresolvedError(OccupancyError):
    """Fail-closed denial: the account's entitlement cannot resolve (403)."""

    code = CODE_OCCUPANCY_UNRESOLVED


class OccupancyLimitExceededError(OccupancyError):
    """The requested delta would exceed the resolved allowance (403)."""

    code = CODE_OCCUPANCY_LIMIT_EXCEEDED

    def __init__(self, message: str, *, snapshot: OccupancySnapshot) -> None:
        super().__init__(message)
        self.snapshot = snapshot
        # Safe fields only: capability key + integer counts (invariant 6).
        self.details = {
            "key": snapshot.key,
            "allowance": snapshot.allowance,
            "current": snapshot.current,
            "requested": snapshot.requested,
        }


def _capacity_lock_key(account_id: uuid.UUID) -> int:
    """Derive the stable signed 64-bit advisory-lock key for one account.

    Deterministic across processes (fixed config namespace + account UUID),
    so every writer on the account contends for the same lock.
    """
    digest = hashlib.blake2b(
        OCCUPANCY_LOCK_NAMESPACE.to_bytes(4, "big") + account_id.bytes,
        digest_size=8,
        person=b"searchify-cap",
    ).digest()
    return int.from_bytes(digest, "big", signed=True)


async def lock_billing_account_capacity(
    session: AsyncSession, account_id: uuid.UUID
) -> None:
    """Serialize occupancy-checked mutations for one billing account.

    Transaction-scoped (``pg_advisory_xact_lock``): the lock releases at
    COMMIT/ROLLBACK, so no caller can leak it, and re-acquiring inside the
    same transaction is a no-op. Non-PostgreSQL dialects (isolated unit
    tests) skip the lock; production always runs PostgreSQL.
    """
    if session.bind is None or session.bind.dialect.name != "postgresql":
        return
    await session.execute(
        text("SELECT pg_advisory_xact_lock(:key)").bindparams(
            key=_capacity_lock_key(account_id)
        )
    )


async def lock_workspace_capacity(
    session: AsyncSession, workspace_id: uuid.UUID
) -> uuid.UUID:
    """Resolve a workspace's billing account and take its capacity lock.

    The billing link is the ONLY legitimate boundary from workspace scope to
    account scope (invariant 5); a workspace with no link fails closed.
    Returns the account id for ``enforce_occupancy``.
    """
    account_id = await session.scalar(
        select(WorkspaceBillingLink.billing_account_id).where(
            WorkspaceBillingLink.workspace_id == workspace_id
        )
    )
    if account_id is None:
        logger.info(
            EVENT_OCCUPANCY_UNRESOLVED + " workspace_id=%s error=%s",
            workspace_id,
            "workspace_billing_link_missing",
        )
        raise OccupancyUnresolvedError(
            "Billing entitlement is unavailable for this workspace"
        )
    await lock_billing_account_capacity(session, account_id)
    return account_id


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
_OCCUPANCY_COUNTERS: dict[str, Callable[[AsyncSession, uuid.UUID], Awaitable[int]]] = {
    KEY_PROJECT_SLOTS: _count_project_slots,
    KEY_PROMPT_SLOTS: _count_prompt_slots,
}


async def enforce_occupancy(
    session: AsyncSession,
    *,
    account_id: uuid.UUID,
    key: str,
    requested_delta: int,
    at: datetime,
) -> OccupancySnapshot:
    """Check one account's occupancy allowance under the capacity lock.

    Acquires the account lock (reentrant when the caller already holds it),
    resolves the allowance through the entitlement resolver — fail closed on
    any status other than ``STATUS_RESOLVED`` — and counts persisted rows
    with the key-specific aggregate query, all in the caller's transaction.
    Raises ``OccupancyLimitExceededError`` when the rows that would actually
    insert do not fit; returns the snapshot otherwise.
    """
    counter = _OCCUPANCY_COUNTERS.get(key)
    if counter is None:
        # A key with no counter here has another owner (monitored_urls) or
        # is a programming error — never a silent pass.
        raise ValueError(f"unsupported occupancy key: {key!r}")
    await lock_billing_account_capacity(session, account_id)
    entitlement = await resolve_account_entitlement(
        session, account_id=account_id, at=at
    )
    if entitlement.status != STATUS_RESOLVED:
        logger.info(
            EVENT_OCCUPANCY_UNRESOLVED + " account_id=%s key=%s errors=%s",
            account_id,
            key,
            ",".join(entitlement.errors),
        )
        raise OccupancyUnresolvedError(
            "Billing entitlement is unavailable for this account"
        )
    capability = entitlement.capability(key)
    allowance = capability.value if capability is not None else None
    current = await counter(session, account_id)
    remaining = None if allowance is None else allowance - current - requested_delta
    snapshot = OccupancySnapshot(
        key=key,
        allowance=allowance,
        current=current,
        requested=requested_delta,
        remaining=remaining,
    )
    if remaining is not None and remaining < 0:
        logger.info(
            EVENT_OCCUPANCY_LIMIT_EXCEEDED
            + " account_id=%s key=%s allowance=%s current=%s requested=%s",
            account_id,
            key,
            allowance,
            current,
            requested_delta,
        )
        raise OccupancyLimitExceededError(
            f"The request would exceed the account's {key} allowance "
            f"({current} in use, {requested_delta} requested, "
            f"allowance {allowance})",
            snapshot=snapshot,
        )
    return snapshot
