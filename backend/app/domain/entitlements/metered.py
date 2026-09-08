"""Typed variable-unit reservations for Content and Growth Agent calls."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config.entitlements import LEDGER_ENTRY_RESERVATION
from app.domain.entitlements.ledger import (
    FundedCreditsExhaustedError,
    GrantAllocation,
    LedgerError,
    Reservation,
    _active_grants_in_draw_order,
    _allocate_reservation,
    _fingerprint,
    _grant_balances,
    _reservation_entries,
    _reservation_state,
    record_billable_attempt,
    release_unused_reservation,
)
from app.models.billing import ConsumableLedger, WorkspaceBillingLink


@dataclass(frozen=True, slots=True)
class MeteredSubject:
    kind: str
    subject_id: uuid.UUID
    workspace_id: uuid.UUID

    def __post_init__(self) -> None:
        if self.kind not in {"content", "agent"}:
            raise LedgerError(f"unsupported metered subject: {self.kind}")


@dataclass(frozen=True, slots=True)
class MeteredSettlement:
    charged_units: int
    absorbed_units: int
    usage_complete: bool


async def reserve_metered_usage(
    session: AsyncSession,
    *,
    account_id: uuid.UUID,
    capability_key: str,
    subject: MeteredSubject,
    hold_units: int,
    idempotency_key: str,
    at: datetime,
) -> Reservation:
    """Reserve a finite per-call cap for a typed Content/Agent subject."""
    if hold_units <= 0:
        raise LedgerError("metered hold must be positive")
    fingerprint = _fingerprint(
        {
            "account_id": str(account_id),
            "capability_key": capability_key,
            "subject_kind": subject.kind,
            "subject_id": str(subject.subject_id),
            "workspace_id": str(subject.workspace_id),
            "units": hold_units,
        }
    )
    existing = await session.scalar(
        select(ConsumableLedger).where(
            ConsumableLedger.billing_account_id == account_id,
            ConsumableLedger.idempotency_key == idempotency_key,
        )
    )
    if existing is not None:
        if existing.request_fingerprint != fingerprint:
            raise LedgerError("idempotency_key_reused")
        entries = await _reservation_entries(session, existing.reservation_id)
        return Reservation(
            reservation_id=existing.reservation_id,
            billing_account_id=account_id,
            capability_key=capability_key,
            audit_id=subject.subject_id,
            task_id=subject.subject_id,
            units=sum(entry.units for entry in entries),
            allocations=tuple(
                GrantAllocation(grant_id=entry.grant_id, units=entry.units)
                for entry in entries
            ),
        )
    linked_account = await session.scalar(
        select(WorkspaceBillingLink.billing_account_id).where(
            WorkspaceBillingLink.workspace_id == subject.workspace_id
        )
    )
    if linked_account != account_id:
        raise LedgerError("metered subject does not belong to billing account")
    grants = await _active_grants_in_draw_order(
        session, account_id=account_id, capability_key=capability_key, at=at
    )
    allocations, remaining = _allocate_reservation(
        grants, await _grant_balances(session, grants), units=hold_units
    )
    if remaining:
        raise FundedCreditsExhaustedError(
            f"Insufficient {capability_key} balance to reserve {hold_units} units",
            capability_key=capability_key,
        )
    reservation_id = uuid.uuid4()
    typed_ids = {
        "content_generation_id": (
            subject.subject_id if subject.kind == "content" else None
        ),
        "agent_task_run_id": subject.subject_id if subject.kind == "agent" else None,
    }
    for index, allocation in enumerate(allocations):
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
                subject_kind=subject.kind,
                subject_id=subject.subject_id,
                workspace_id=subject.workspace_id,
                audit_id=None,
                task_id=None,
                dispatch_key="reservation",
                request_fingerprint=fingerprint,
                allocation_order=index,
                refund_of_id=None,
                attempt=None,
                units=allocation.units,
                idempotency_key=key,
                created_at=at,
                **typed_ids,
            )
        )
    await session.flush()
    return Reservation(
        reservation_id=reservation_id,
        billing_account_id=account_id,
        capability_key=capability_key,
        audit_id=subject.subject_id,
        task_id=subject.subject_id,
        units=hold_units,
        allocations=tuple(allocations),
    )


async def settle_metered_usage(
    session: AsyncSession,
    *,
    reservation_id: uuid.UUID,
    dispatch_key: str,
    charged_units: int | None,
    unknown_usage_charge: int,
    idempotency_key: str,
    at: datetime,
) -> MeteredSettlement:
    """Settle actual usage or the bounded unknown-use amount, releasing excess."""
    base, outstanding = await _reservation_state(session, reservation_id)
    held = sum(max(units, 0) for units in outstanding.values())
    usage_complete = charged_units is not None
    requested = charged_units if charged_units is not None else unknown_usage_charge
    debit = min(max(requested, 0), held)
    if debit:
        await record_billable_attempt(
            session,
            reservation_id=reservation_id,
            task_id=base.subject_id,
            attempt=1,
            units=debit,
            idempotency_key=f"{idempotency_key}:{dispatch_key}",
            at=at,
        )
    await release_unused_reservation(
        session,
        reservation_id=reservation_id,
        idempotency_key=f"{idempotency_key}:{dispatch_key}:excess",
        at=at,
    )
    return MeteredSettlement(
        charged_units=debit,
        absorbed_units=max(requested - debit, 0),
        usage_complete=usage_complete,
    )
