# Execution credential resolution (T11): BYOK-first, platform-funded fallback.
#
# One function decides WHICH credential a task executes with, at admission
# time only:
#   1. a successfully probed, healthy, active, NOT-paused BYOK route in the
#      tenant workspace always wins (BYOK precedence);
#   2. otherwise the platform-funded credential in the reserved system
#      workspace — but ONLY when funded authorization is proven: a RESOLVED
#      entitlement, a COMPLETE expected execution cost, and the successful
#      per-task ledger reservation (a resolved allowance alone NEVER
#      authorizes funded execution — there is no funded-allowance boolean);
#   3. otherwise it raises ``execution_credentials_unavailable`` and no task
#      becomes claimable and no provider call happens.
#
# The planner freezes the returned identity (credential_source, concrete
# connection_id, reservation_id) into the task/audit snapshots; the worker
# only ever LOADS frozen identities — it never calls this module, never
# re-resolves, and never falls back. No key material is read here: selection
# uses metadata columns only (invariant 6).
from __future__ import annotations

import logging
import uuid
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import Row, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.config.costs import ExpectedExecutionCost
from app.core.config.provider_catalog import (
    CODE_EXECUTION_CREDENTIALS_UNAVAILABLE,
    CREDENTIAL_SOURCE_BYOK,
    CREDENTIAL_SOURCE_PLATFORM,
    ERROR_AUTH,
    TELEMETRY_BYOK_PAUSED,
    TELEMETRY_PLATFORM_AUTH_FAILED,
    TEST_STATUS_OK,
    is_endpoint_approved,
    is_route_approved,
    provider_catalog_settings,
)
from app.domain.entitlements.ledger import Reservation
from app.domain.entitlements.types import STATUS_RESOLVED, ResolvedEntitlement
from app.models.provider import ProviderConnection, ProviderRoute
from app.models.workspace import Workspace

# Operator telemetry for the credential lifecycle (T11). Payloads are safe
# fields only — never keys, ciphertext, prompts, answers, provider bodies, or
# authorization headers (invariant 6).
logger = logging.getLogger("app.providers")


class ExecutionCredentialsUnavailableError(RuntimeError):
    """No executable credential exists for a task (coded, safe).

    Raised BEFORE any task becomes claimable or any provider call happens.
    The code is config-owned (``execution_credentials_unavailable``) and the
    message/details carry no key material, no provider response detail, and
    no system-workspace information (invariant 6).
    """

    def __init__(self, message: str, *, details: dict[str, Any] | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.code = CODE_EXECUTION_CREDENTIALS_UNAVAILABLE
        self.details = details


@dataclass(frozen=True, slots=True)
class ResolvedCredential:
    """The frozen execution-credential identity for ONE task.

    Everything the worker needs to load the frozen identity at execution
    time: ``connection_id`` is the concrete ``ProviderConnection`` row (a
    tenant BYOK row, or the platform row in the system workspace) and
    ``reservation_id`` is the funded reservation proving the task's credits
    (None for BYOK, which never touches the ledger). Never a key.
    """

    credential_source: str
    connection_id: uuid.UUID
    transport_provider: str
    model: str
    reservation_id: uuid.UUID | None


def connection_paused(connection: ProviderConnection, *, at: datetime) -> bool:
    """Whether a connection is paused at ``at`` (recoverable, never retired).

    A pause with no deadline does not expire on its own; a deadline that has
    passed lets resolution try the credential again (the pause row remains as
    provenance until the pause writer clears it).
    """
    if connection.paused_at is None:
        return False
    return connection.pause_until is None or connection.pause_until > at


async def pause_connection_after_key_failure(
    session: AsyncSession, connection_id: uuid.UUID, at: datetime
) -> None:
    """Pause a credential after an ERROR_AUTH-classified execution failure.

    Sets ``paused_at``, the safe ``pause_reason`` classification token (the
    recorded status — raw provider detail NEVER persists, invariant 6), and
    ``pause_until = at + byok_key_grace_days``. Resolution already skips
    paused rows, so no new tasks use the credential until the grace deadline
    passes (or an operator rotation clears the pause); in-flight tasks keep
    their frozen identity. Emits the source-specific telemetry event
    (``provider.byok.paused`` for a tenant row, ``provider.platform.auth_failed``
    for the platform row — the row's own ``credential_source`` distinguishes
    the source) with opaque ids + pause timing only. The caller commits. A
    missing row is a no-op so the worker's failure path never crashes on a
    connection deleted mid-run.
    """
    connection = await session.get(ProviderConnection, connection_id)
    if connection is None:
        return
    connection.paused_at = at
    connection.pause_reason = ERROR_AUTH
    connection.pause_until = at + timedelta(
        days=provider_catalog_settings.byok_key_grace_days
    )
    event = (
        TELEMETRY_PLATFORM_AUTH_FAILED
        if connection.credential_source == CREDENTIAL_SOURCE_PLATFORM
        else TELEMETRY_BYOK_PAUSED
    )
    logger.info(
        event + " connection_id=%s pause_reason=%s paused_at=%s pause_until=%s",
        connection.id,
        connection.pause_reason,
        at.isoformat(),
        connection.pause_until.isoformat(),
    )


def _unavailable(logical_engine: str) -> ExecutionCredentialsUnavailableError:
    """THE refusal for every unresolvable path — identical by construction.

    Every caller raises this one shape so a refusal can never leak which leg
    failed (no BYOK/platform distinction, no system-workspace hint, no
    provider detail — invariant 6).
    """
    return ExecutionCredentialsUnavailableError(
        "No executable credential available for this task",
        details={"logical_engine": logical_engine},
    )


def _route_candidates(
    *,
    workspace_id: uuid.UUID,
    credential_source: str,
    logical_engine: str,
):
    """Active, key-set, successfully probed routes of one source + workspace."""
    return (
        select(ProviderConnection, ProviderRoute)
        .join(ProviderRoute, ProviderRoute.connection_id == ProviderConnection.id)
        .where(
            ProviderRoute.workspace_id == workspace_id,
            ProviderRoute.logical_engine == logical_engine,
            ProviderRoute.active.is_(True),
            ProviderConnection.workspace_id == workspace_id,
            ProviderConnection.credential_source == credential_source,
            ProviderConnection.active.is_(True),
            ProviderConnection.api_key_encrypted != "",
            # "Successfully probed" is the denormalized LATEST probe outcome:
            # a connection whose latest probe failed is not healthy.
            ProviderConnection.last_test_status == TEST_STATUS_OK,
        )
        .order_by(
            ProviderRoute.is_default.desc(),
            ProviderRoute.created_at.asc(),
        )
    )


def _first_healthy(
    rows: Sequence[Row[Any]], *, at: datetime
) -> tuple[ProviderConnection, ProviderRoute] | None:
    """First catalog/endpoint-approved, unpaused (connection, route), or None."""
    for connection, route in rows:
        if not is_route_approved(route.logical_engine, route.transport_provider):
            continue
        if not is_endpoint_approved(
            connection.transport_provider, connection.base_url or ""
        ):
            continue
        if connection_paused(connection, at=at):
            continue
        return connection, route
    return None


async def _select_byok_route(
    session: AsyncSession, *, workspace_id: uuid.UUID, logical_engine: str, at: datetime
) -> tuple[ProviderConnection, ProviderRoute] | None:
    """A healthy tenant BYOK route for the engine, or None (never platform)."""
    result = await session.execute(
        _route_candidates(
            workspace_id=workspace_id,
            credential_source=CREDENTIAL_SOURCE_BYOK,
            logical_engine=logical_engine,
        )
    )
    return _first_healthy(result.all(), at=at)


async def _select_platform_route(
    session: AsyncSession, *, logical_engine: str, at: datetime
) -> tuple[ProviderConnection, ProviderRoute] | None:
    """A healthy platform route in THE ONE system workspace, or None."""
    system_workspace_id = await session.scalar(
        select(Workspace.id).where(Workspace.is_system.is_(True))
    )
    if system_workspace_id is None:
        return None
    result = await session.execute(
        _route_candidates(
            workspace_id=system_workspace_id,
            credential_source=CREDENTIAL_SOURCE_PLATFORM,
            logical_engine=logical_engine,
        )
    )
    return _first_healthy(result.all(), at=at)


def _require_funded_proofs(
    *,
    logical_engine: str,
    account_id: uuid.UUID | None,
    entitlement: ResolvedEntitlement,
    reservation: Reservation | None,
    expected_cost: ExpectedExecutionCost,
) -> Reservation:
    """Fail-closed funded authorization; returns the proven reservation.

    Funded execution is authorized ONLY by the conjunction of: a resolved
    entitlement, a complete expected cost, and the successful per-task
    reservation (whose account must match the admitted funding account).
    """
    # The reservation is THE funding proof, so its absence is checked first and
    # on its own: folding it into the conjunction below left the returned value
    # optional to every reader (and to the type checker) even though this
    # function's whole contract is that it hands back a proven reservation.
    if reservation is None:
        raise _unavailable(logical_engine)
    unavailable = (
        entitlement.status != STATUS_RESOLVED
        or not expected_cost.complete
        or (account_id is not None and reservation.billing_account_id != account_id)
    )
    if unavailable:
        raise _unavailable(logical_engine)
    return reservation


async def resolve_execution_credentials(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    account_id: uuid.UUID | None,
    logical_engine: str,
    entitlement: ResolvedEntitlement,
    reservation: Reservation | None,
    expected_cost: ExpectedExecutionCost,
    at: datetime,
    dev_test_login: bool = False,
) -> ResolvedCredential:
    """Resolve the ONE credential a task executes with (admission-time only).

    BYOK precedence: a healthy tenant BYOK route wins outright — even when
    funded proofs are present — and is frozen with ``reservation_id=None``.
    With no BYOK route, the platform credential requires the full funded
    proof chain; anything missing raises
    ``ExecutionCredentialsUnavailableError`` with no claimable task and no
    provider call.

    Dev-test login gate (T11): Part B's dev-only fixed login is treated like
    any tenant session — when ``dev_test_login`` is set it cannot resolve
    platform credentials or reach the reserved system workspace unless the
    dedicated ``DEV_TEST_LOGIN_ALLOW_PLATFORM_CREDENTIALS`` gate is enabled.
    The check fails closed BEFORE any system-workspace read; BYOK resolution
    (the tenant's own key) is unaffected either way.
    """
    byok = await _select_byok_route(
        session, workspace_id=workspace_id, logical_engine=logical_engine, at=at
    )
    if byok is not None:
        connection, route = byok
        return ResolvedCredential(
            credential_source=CREDENTIAL_SOURCE_BYOK,
            connection_id=connection.id,
            transport_provider=route.transport_provider,
            model=route.transport_model,
            reservation_id=None,
        )
    if dev_test_login and not settings.dev_test_login_allow_platform_credentials:
        raise _unavailable(logical_engine)
    proven = _require_funded_proofs(
        logical_engine=logical_engine,
        account_id=account_id,
        entitlement=entitlement,
        reservation=reservation,
        expected_cost=expected_cost,
    )
    platform = await _select_platform_route(
        session, logical_engine=logical_engine, at=at
    )
    if platform is None:
        raise _unavailable(logical_engine)
    connection, route = platform
    return ResolvedCredential(
        credential_source=CREDENTIAL_SOURCE_PLATFORM,
        connection_id=connection.id,
        transport_provider=route.transport_provider,
        model=route.transport_model,
        reservation_id=proven.reservation_id,
    )
