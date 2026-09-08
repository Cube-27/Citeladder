# Consumable reservation + attempt accounting (slice23 Task 4 Part B).
#
# This module owns the ONLY write path into ``ConsumableLedger`` for funded
# ``audit_credits`` spend. A reservation is PER TASK
# (never per audit): ``reserve_funded_task`` locks the account's active grant
# rows ``FOR UPDATE`` in resolver draw order, computes immutable ledger
# balances (``grant.value - SUM(reservation) + SUM(release) - SUM(debit)``),
# and allocates the task's full ``max_attempts`` across grants in that order.
# Converting a reserved unit into a billable attempt atomically appends ONE
# release + ONE debit against the SAME grant; the unique partial index on
# ``(task_id, attempt) WHERE entry_kind='debit'`` makes retry accounting
# idempotent (a timed-out provider call is billable — outcome is never a
# parameter here). Terminalization releases every unused reserved unit.
#
# Idempotency: the first allocation row of a reservation carries the caller's
# base idempotency key verbatim (later rows suffix it per grant), so an exact
# replay is detected with one equality lookup against the per-account unique
# constraint; release/debit rows carry deterministic derived keys.
#
# The worker call sites live in Slice 1 (commit 7); this module owns the exact
# service/persistence contract and its component tests.
from __future__ import annotations

import hashlib
import json
import logging
import uuid
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config.billing_contracts import (
    TELEMETRY_CONSUMABLE_CREDITS_EXHAUSTED,
)
from app.core.config.entitlements import (
    CODE_FUNDED_CREDITS_EXHAUSTED,
    LEDGER_ENTRY_DEBIT,
    LEDGER_ENTRY_REFUND,
    LEDGER_ENTRY_RELEASE,
    LEDGER_ENTRY_RESERVATION,
)
from app.domain.entitlements.resolver import ordered_consumable_grants
from app.domain.entitlements.service import resolve_account_entitlement
from app.domain.entitlements.types import STATUS_RESOLVED, GrantInput
from app.models.audit import AuditTask
from app.models.billing import AccountGrant, ConsumableLedger, WorkspaceBillingLink

logger = logging.getLogger("app.billing")


@dataclass(frozen=True, slots=True)
class GrantAllocation:
    """The units one grant funds inside one task reservation."""

    grant_id: uuid.UUID
    units: int


@dataclass(frozen=True, slots=True)
class Reservation:
    """The frozen outcome of one successful task reservation."""

    reservation_id: uuid.UUID
    billing_account_id: uuid.UUID
    capability_key: str
    audit_id: uuid.UUID
    task_id: uuid.UUID
    units: int
    # Allocations in resolver draw order (the order units will be spent).
    allocations: tuple[GrantAllocation, ...]


@dataclass(frozen=True, slots=True)
class UsageSnapshot:
    """One account+capability consumable position at ``at``.

    ``granted`` is the resolved active allowance; ``reserved`` is outstanding
    (reservation minus release units); ``debited`` is consumed;
    ``available = granted - reserved - debited`` and never goes negative when
    every writer goes through this module.
    """

    capability_key: str
    granted: int
    reserved: int
    debited: int
    available: int


class LedgerError(RuntimeError):
    """Base for ledger contract violations (unknown reservation etc.)."""


def _fingerprint(payload: dict[str, object]) -> str:
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()
    return hashlib.sha256(encoded).hexdigest()


async def _audit_workspace(session: AsyncSession, task_id: uuid.UUID) -> uuid.UUID:
    workspace_id = await session.scalar(
        select(AuditTask.workspace_id).where(AuditTask.id == task_id)
    )
    if workspace_id is None:
        raise LedgerError("audit task not found")
    return workspace_id


class FundedCreditsExhaustedError(RuntimeError):
    """Graceful refusal: active grants cannot fund the requested reservation.

    Carries the config-owned code the API maps; the planner rolls the whole
    audit back (no audit/task/ledger rows persist, nothing is enqueued).
    """

    code = CODE_FUNDED_CREDITS_EXHAUSTED

    def __init__(self, message: str, *, capability_key: str) -> None:
        super().__init__(message)
        self.message = message
        self.details = {"capability_key": capability_key}


async def _active_grants_in_draw_order(
    session: AsyncSession, *, account_id: uuid.UUID, capability_key: str, at: datetime
) -> list[AccountGrant]:
    """Active grant rows for the capability, locked in resolver draw order.

    The resolver fold owns which grants are active at ``at`` and the exact
    consumable draw order (invariant 2); this locks each row ``FOR UPDATE``
    in that order so concurrent reservations serialize on the rows themselves.
    """
    entitlement = await resolve_account_entitlement(
        session, account_id=account_id, at=at
    )
    capability = (
        entitlement.capability(capability_key)
        if entitlement.status == STATUS_RESOLVED
        else None
    )
    draw_ids = capability.ordered_draw_grant_ids if capability is not None else ()
    rows: list[AccountGrant] = []
    for grant_id in draw_ids:
        row = await session.get(AccountGrant, grant_id, with_for_update=True)
        if row is not None:
            rows.append(row)
    return rows


async def _ledger_sums(
    session: AsyncSession, *, account_id: uuid.UUID, capability_key: str
) -> dict[str, int]:
    """Aggregate ``{entry_kind: units}`` over immutable ledger rows."""
    stmt = (
        select(ConsumableLedger.entry_kind, func.sum(ConsumableLedger.units))
        .where(
            ConsumableLedger.billing_account_id == account_id,
            ConsumableLedger.capability_key == capability_key,
        )
        .group_by(ConsumableLedger.entry_kind)
    )
    rows = (await session.execute(stmt)).all()
    return {kind: int(total or 0) for kind, total in rows}


async def _grant_balances(
    session: AsyncSession, grants: list[AccountGrant]
) -> dict[uuid.UUID, int]:
    """Immutable ledger balance per grant (value - reserved + released - debited)."""
    if not grants:
        return {}
    rows = (
        await session.execute(
            select(
                ConsumableLedger.grant_id,
                ConsumableLedger.entry_kind,
                func.sum(ConsumableLedger.units),
            )
            .where(ConsumableLedger.grant_id.in_([row.id for row in grants]))
            .group_by(ConsumableLedger.grant_id, ConsumableLedger.entry_kind)
        )
    ).all()
    sums: dict[uuid.UUID, dict[str, int]] = {}
    for grant_id, entry_kind, total in rows:
        sums.setdefault(grant_id, {})[entry_kind] = int(total or 0)
    balances: dict[uuid.UUID, int] = {}
    for row in grants:
        kind_sums = sums.get(row.id, {})
        balances[row.id] = (
            row.value
            - kind_sums.get(LEDGER_ENTRY_RESERVATION, 0)
            + kind_sums.get(LEDGER_ENTRY_RELEASE, 0)
            - kind_sums.get(LEDGER_ENTRY_DEBIT, 0)
            + kind_sums.get(LEDGER_ENTRY_REFUND, 0)
        )
    return balances


async def _reservation_entries(
    session: AsyncSession, reservation_id: uuid.UUID
) -> list[ConsumableLedger]:
    return list(
        (
            await session.scalars(
                select(ConsumableLedger)
                .where(
                    ConsumableLedger.reservation_id == reservation_id,
                    ConsumableLedger.entry_kind == LEDGER_ENTRY_RESERVATION,
                )
                .with_for_update()
            )
        ).all()
    )


def _allocate_reservation(
    grants: list[AccountGrant],
    balances: dict[uuid.UUID, int],
    *,
    units: int,
) -> tuple[list[GrantAllocation], int]:
    """Allocate available grant balances in the caller-frozen draw order."""
    allocations: list[GrantAllocation] = []
    remaining = units
    for row in grants:
        take = min(max(balances.get(row.id, 0), 0), remaining)
        if take > 0:
            allocations.append(GrantAllocation(grant_id=row.id, units=take))
            remaining -= take
        if remaining == 0:
            break
    return allocations, remaining


async def reserve_funded_task(
    session: AsyncSession,
    *,
    account_id: uuid.UUID,
    capability_key: str,
    audit_id: uuid.UUID,
    task_id: uuid.UUID,
    units: int,
    idempotency_key: str,
    at: datetime,
) -> Reservation:
    """Reserve one task's full ``max_attempts`` across active grants.

    Idempotent on ``idempotency_key``: an exact replay returns the persisted
    reservation without writing new rows. Insufficient balance raises
    ``FundedCreditsExhaustedError`` (graceful) and emits the
    ``billing.consumable_credits_exhausted`` telemetry event; the caller's
    transaction rolls back every row it wrote.
    """
    if units <= 0:
        raise LedgerError(f"reservation units must be positive, got {units}")
    fingerprint = _fingerprint(
        {
            "account_id": str(account_id),
            "capability_key": capability_key,
            "subject_kind": "audit",
            "audit_id": str(audit_id),
            "task_id": str(task_id),
            "units": units,
        }
    )
    base_row = await session.scalar(
        select(ConsumableLedger).where(
            ConsumableLedger.billing_account_id == account_id,
            ConsumableLedger.idempotency_key == idempotency_key,
        )
    )
    if base_row is not None:
        if base_row.request_fingerprint != fingerprint:
            raise LedgerError("idempotency_key_reused")
        entries = await _reservation_entries(session, base_row.reservation_id)
        return Reservation(
            reservation_id=base_row.reservation_id,
            billing_account_id=account_id,
            capability_key=capability_key,
            audit_id=audit_id,
            task_id=task_id,
            units=sum(entry.units for entry in entries),
            allocations=tuple(
                GrantAllocation(grant_id=entry.grant_id, units=entry.units)
                for entry in entries
            ),
        )

    grants = await _active_grants_in_draw_order(
        session, account_id=account_id, capability_key=capability_key, at=at
    )
    balances = await _grant_balances(session, grants)
    allocations, remaining = _allocate_reservation(grants, balances, units=units)
    if remaining > 0:
        logger.info(
            TELEMETRY_CONSUMABLE_CREDITS_EXHAUSTED
            + " account_id=%s capability_key=%s requested=%s shortfall=%s",
            account_id,
            capability_key,
            units,
            remaining,
        )
        raise FundedCreditsExhaustedError(
            f"Insufficient {capability_key} balance to reserve {units} units",
            capability_key=capability_key,
        )

    reservation_id = uuid.uuid4()
    workspace_id = await _audit_workspace(session, task_id)
    linked_account = await session.scalar(
        select(WorkspaceBillingLink.billing_account_id).where(
            WorkspaceBillingLink.workspace_id == workspace_id
        )
    )
    if linked_account != account_id:
        raise LedgerError("audit subject does not belong to billing account")
    for index, allocation in enumerate(allocations):
        # The FIRST allocation row carries the base key verbatim so replays
        # resolve with one equality lookup; later rows derive unique keys.
        key = (
            idempotency_key
            if index == 0
            else f"{idempotency_key}#{allocation.grant_id}"
        )
        session.add(
            ConsumableLedger(
                billing_account_id=account_id,
                grant_id=allocation.grant_id,
                capability_key=capability_key,
                entry_kind=LEDGER_ENTRY_RESERVATION,
                reservation_id=reservation_id,
                subject_kind="audit",
                subject_id=task_id,
                workspace_id=workspace_id,
                audit_id=audit_id,
                task_id=task_id,
                content_generation_id=None,
                agent_task_run_id=None,
                dispatch_key="reservation",
                request_fingerprint=fingerprint,
                allocation_order=index,
                refund_of_id=None,
                attempt=None,
                units=allocation.units,
                idempotency_key=key,
                created_at=at,
            )
        )
    await session.flush()
    return Reservation(
        reservation_id=reservation_id,
        billing_account_id=account_id,
        capability_key=capability_key,
        audit_id=audit_id,
        task_id=task_id,
        units=units,
        allocations=tuple(allocations),
    )


async def _reservation_state(
    session: AsyncSession, reservation_id: uuid.UUID
) -> tuple[ConsumableLedger, dict[uuid.UUID, int]]:
    """(base entry, per-grant outstanding units) for one reservation.

    Every reservation row of one reservation carries the same account,
    capability, audit, and task ids, so the first entry serves as the base
    row — no second query. Per-grant outstanding units are the reserved sums
    minus the released sums.
    """
    entries = await _reservation_entries(session, reservation_id)
    if not entries:
        raise LedgerError(f"unknown reservation: {reservation_id}")
    outstanding = {entry.grant_id: entry.units for entry in entries}
    releases = (
        await session.execute(
            select(ConsumableLedger.grant_id, func.sum(ConsumableLedger.units))
            .where(
                ConsumableLedger.reservation_id == reservation_id,
                ConsumableLedger.entry_kind == LEDGER_ENTRY_RELEASE,
            )
            .group_by(ConsumableLedger.grant_id)
        )
    ).all()
    for grant_id, released in releases:
        outstanding[grant_id] = outstanding.get(grant_id, 0) - int(released or 0)
    return entries[0], outstanding


async def record_billable_attempt(
    session: AsyncSession,
    *,
    reservation_id: uuid.UUID,
    task_id: uuid.UUID,
    attempt: int,
    units: int = 1,
    idempotency_key: str,
    at: datetime,
) -> None:
    """Convert reserved units into one billable attempt (release + debit).

    The release and debit hit the SAME grant in one transaction. The unique
    ``(task_id, attempt)`` debit index makes retry accounting idempotent: a
    repeat call for an already-billed attempt returns without writing.
    A timed-out provider call bills exactly like any other — outcome is not
    a parameter of this contract.
    """
    if units <= 0 or attempt <= 0:
        raise LedgerError(
            f"billable attempt needs positive units/attempt, got {units}/{attempt}"
        )
    settlement_fingerprint = _fingerprint(
        {
            "reservation_id": str(reservation_id),
            "subject_id": str(task_id),
            "attempt": attempt,
            "units": units,
        }
    )
    base, outstanding = await _reservation_state(session, reservation_id)
    billed = await session.scalar(
        select(ConsumableLedger).where(
            ConsumableLedger.reservation_id == reservation_id,
            ConsumableLedger.entry_kind == LEDGER_ENTRY_DEBIT,
            ConsumableLedger.attempt == attempt,
        )
    )
    if billed is not None:
        if billed.request_fingerprint != settlement_fingerprint:
            raise LedgerError("idempotency_key_reused")
        return
    ordered_grants = await _ordered_outstanding_grants(
        session, reservation_id=reservation_id, outstanding=outstanding
    )
    remaining = units
    settlement: list[tuple[uuid.UUID, int]] = []
    for grant_id in ordered_grants:
        take = min(max(outstanding.get(grant_id, 0), 0), remaining)
        if take:
            settlement.append((grant_id, take))
            remaining -= take
        if remaining == 0:
            break
    if remaining:
        raise LedgerError(
            f"reservation {reservation_id} has no {units} outstanding unit(s) "
            f"to bill for attempt {attempt}"
        )
    for index, (grant_id, allocation_units) in enumerate(settlement):
        common = dict(
            billing_account_id=base.billing_account_id,
            grant_id=grant_id,
            capability_key=base.capability_key,
            reservation_id=reservation_id,
            subject_kind=base.subject_kind,
            subject_id=base.subject_id,
            workspace_id=base.workspace_id,
            audit_id=base.audit_id,
            task_id=task_id,
            content_generation_id=base.content_generation_id,
            agent_task_run_id=base.agent_task_run_id,
            dispatch_key=str(attempt),
            request_fingerprint=settlement_fingerprint,
            allocation_order=index,
            refund_of_id=None,
            units=allocation_units,
            created_at=at,
        )
        session.add(
            ConsumableLedger(
                **common,
                entry_kind=LEDGER_ENTRY_RELEASE,
                attempt=None,
                idempotency_key=f"{idempotency_key}:release:{grant_id}",
            )
        )
        session.add(
            ConsumableLedger(
                **common,
                entry_kind=LEDGER_ENTRY_DEBIT,
                attempt=attempt,
                idempotency_key=f"{idempotency_key}:debit:{grant_id}",
            )
        )
    await session.flush()


async def _ordered_outstanding_grants(
    session: AsyncSession,
    *,
    reservation_id: uuid.UUID,
    outstanding: dict[uuid.UUID, int],
) -> tuple[uuid.UUID, ...]:
    """Outstanding grants in the reservation's frozen allocation order.

    Expiry/revocation after authorization blocks new work but cannot reorder
    or invalidate settlement of an already-dispatched call within its cap.
    """
    candidates = [gid for gid, left in outstanding.items() if left > 0]
    if not candidates:
        return ()
    rows = (
        await session.scalars(
            select(AccountGrant).where(AccountGrant.id.in_(candidates))
        )
    ).all()
    inputs = tuple(
        GrantInput(
            id=row.id,
            key=row.key,
            value=row.value,
            source_kind=row.source_kind,
            valid_from=row.valid_from,
            valid_until=row.valid_until,
        )
        for row in rows
    )
    # Reservation rows freeze allocation_order; use it when available rather
    # than re-deriving order after top-up expiry/subscription changes.
    frozen = (
        await session.execute(
            select(
                ConsumableLedger.grant_id,
                func.min(ConsumableLedger.allocation_order),
            )
            .where(
                ConsumableLedger.reservation_id == reservation_id,
                ConsumableLedger.grant_id.in_(candidates),
                ConsumableLedger.entry_kind == LEDGER_ENTRY_RESERVATION,
            )
            .group_by(ConsumableLedger.grant_id)
            .order_by(
                func.min(ConsumableLedger.allocation_order),
                ConsumableLedger.grant_id,
            )
        )
    ).all()
    if frozen:
        return tuple(grant_id for grant_id, _ in frozen)
    return ordered_consumable_grants(inputs, None)


async def release_unused_reservation(
    session: AsyncSession,
    *,
    reservation_id: uuid.UUID,
    idempotency_key: str,
    at: datetime,
) -> None:
    """Release every still-reserved unit of one task reservation.

    Idempotent: once nothing is outstanding the call is a no-op, and each
    release row carries a deterministic per-grant key as the final race guard.
    """
    base, outstanding = await _reservation_state(session, reservation_id)
    for grant_id, units in sorted(outstanding.items(), key=lambda kv: kv[0].bytes):
        if units <= 0:
            continue
        session.add(
            ConsumableLedger(
                billing_account_id=base.billing_account_id,
                grant_id=grant_id,
                capability_key=base.capability_key,
                entry_kind=LEDGER_ENTRY_RELEASE,
                reservation_id=reservation_id,
                subject_kind=base.subject_kind,
                subject_id=base.subject_id,
                workspace_id=base.workspace_id,
                audit_id=base.audit_id,
                task_id=base.task_id,
                content_generation_id=base.content_generation_id,
                agent_task_run_id=base.agent_task_run_id,
                dispatch_key="release",
                request_fingerprint=_fingerprint(
                    {
                        "reservation_id": str(reservation_id),
                        "grant_id": str(grant_id),
                        "units": units,
                    }
                ),
                allocation_order=base.allocation_order,
                refund_of_id=None,
                attempt=None,
                units=units,
                idempotency_key=f"{idempotency_key}:{grant_id}",
                created_at=at,
            )
        )
    await session.flush()


async def release_terminal_funded_task(
    session: AsyncSession,
    *,
    reservation_id: uuid.UUID,
    audit_id: uuid.UUID,
    task_id: uuid.UUID,
    trigger: str,
    at: datetime,
) -> None:
    """Release a terminalized funded task's unused reservation exactly once.

    The ONE release owner for every funded terminalization path, keyed per
    trigger source: BYOK precedence (``byok``), worker terminalization
    (``unused``), audit cancel (``cancel``), queue-sweeper reclaim
    (``sweep``), and crash (``crash``). A same-trigger replay is a no-op and
    a same-key concurrent race hits the designed IntegrityError guard; a
    cross-trigger race is suppressed by the outstanding computation
    (reserved − released per grant, settled under the terminalization path's
    row locks), so exactly the still-reserved units are ever released. The
    provider call that DID happen is never touched: billed units are already
    released+debited by ``record_billable_attempt`` and stay consumed.
    """
    await release_unused_reservation(
        session,
        reservation_id=reservation_id,
        idempotency_key=f"{audit_id}:{task_id}:funded-release-{trigger}",
        at=at,
    )


async def consumable_usage(
    session: AsyncSession,
    *,
    account_id: uuid.UUID,
    capability_key: str,
    at: datetime,
) -> UsageSnapshot:
    """The account's consumable position for one capability at ``at``."""
    entitlement = await resolve_account_entitlement(
        session, account_id=account_id, at=at
    )
    granted = (
        entitlement.capability_value(capability_key)
        if entitlement.status == STATUS_RESOLVED
        else 0
    )
    sums = await _ledger_sums(
        session, account_id=account_id, capability_key=capability_key
    )
    reserved = sums.get(LEDGER_ENTRY_RESERVATION, 0) - sums.get(LEDGER_ENTRY_RELEASE, 0)
    debited = sums.get(LEDGER_ENTRY_DEBIT, 0) - sums.get(LEDGER_ENTRY_REFUND, 0)
    # Historical ledger rows from expired/revoked grants do not reduce the
    # newly active allowance. Derive active usage from the same contributing
    # grant set the resolver returned.
    active_ids = {
        grant_id
        for capability in entitlement.capabilities
        if capability.key == capability_key
        for grant_id in capability.contributing_grant_ids
    }
    if active_ids:
        rows = (
            await session.execute(
                select(ConsumableLedger.entry_kind, func.sum(ConsumableLedger.units))
                .where(
                    ConsumableLedger.grant_id.in_(active_ids),
                    ConsumableLedger.capability_key == capability_key,
                )
                .group_by(ConsumableLedger.entry_kind)
            )
        ).all()
        active_sums = {kind: int(total or 0) for kind, total in rows}
        reserved = active_sums.get(LEDGER_ENTRY_RESERVATION, 0) - active_sums.get(
            LEDGER_ENTRY_RELEASE, 0
        )
        debited = active_sums.get(LEDGER_ENTRY_DEBIT, 0) - active_sums.get(
            LEDGER_ENTRY_REFUND, 0
        )
    else:
        reserved = 0
        debited = 0
    return UsageSnapshot(
        capability_key=capability_key,
        granted=granted,
        reserved=reserved,
        debited=debited,
        available=granted - reserved - debited,
    )
