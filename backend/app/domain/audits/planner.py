# Audit planner (invariant 9 — deterministic; invariant 3 — frozen snapshots).
#
# Adapts the reference ``ai_visibility/service.create_run`` + ``cancel_run`` to
# Searchify's workspace-scoped, UUID, BYOK-routed model. ``create_audit``:
#   1. resolves + authorizes the project and prompt source (workspace-scoped);
#   2. resolves one provider route per requested logical engine from the
#      workspace's ``ProviderConnection``s (never the key — invariant 6);
#   3. freezes prompt + engine + scoring snapshots (invariant 3);
#   4. generates one slot per (prompt x engine x repetition), shuffles them with
#      the stored 64-bit seed (invariant 9), and enqueues one ``AuditTask`` per
#      slot with a stable idempotency key.
# ``cancel_audit`` is cooperative: it flips the audit to ``cancelled`` and
# terminalizes unfinished tasks so a live worker stops at its boundary.
from __future__ import annotations

import hashlib
import logging
import random
import secrets
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config.abuse import abuse_settings
from app.core.config.audits import (
    AUDIT_ACTIVE_STATUSES,
    AUDIT_STATUS_CANCELLED,
    AUDIT_STATUS_DRAFT,
    AUDIT_STATUS_QUEUED,
    AUDIT_STATUS_VALIDATING,
    AUDIT_TRIGGERS,
    EVENT_AUDIT_CANCELLED,
    EVENT_AUDIT_CREATED,
    EVENT_AUDIT_QUEUED,
    MEASUREMENT_MODE_BENCHMARK,
    MEASUREMENT_MODE_PULSE,
    MEASUREMENT_POLICY_KEY,
    TASK_STATUS_CANCELLED,
    TASK_STATUS_PENDING_RESERVATION,
    TASK_STATUS_QUEUED,
    TASK_TERMINAL_STATUSES,
    MeasurementModePolicy,
    audit_settings,
    frozen_policy_configuration,
    measurement_policy_for_mode,
    system_instruction_for_mode,
)
from app.core.config.billing import (
    TELEMETRY_FUNDED_BUDGET_EXHAUSTED,
    billing_settings,
)
from app.core.config.commerce import (
    SHOPPING_SURFACE_MEASUREMENT,
    SHOPPING_SURFACES,
)
from app.core.config.costs import (
    MICRO_USD_PER_USD,
    RouteIdentity,
    expected_execution_cost,
)
from app.core.config.entitlements import (
    CODE_FUNDED_BUDGET_EXHAUSTED,
    CODE_FUNDED_COST_UNRESOLVED,
    CREDENTIAL_MODE_BYOK,
    CREDENTIAL_MODE_FUNDED,
    KEY_BENCHMARK_CREDITS,
    KEY_PULSE_CREDITS,
)
from app.core.config.projects import (
    BENCHMARK_MODES,
    DEFAULT_BENCHMARK_MODE,
    MAX_REPETITIONS,
    MIN_REPETITIONS,
)
from app.core.config.prompts import PROMPT_STATUS_ACTIVE
from app.core.config.provider_catalog import (
    APPROVED_ROUTES,
    LOGICAL_ENGINES,
    default_model,
    is_endpoint_approved,
    is_route_approved,
    route_policy,
)
from app.domain.abuse.service import reserve_workspace_capacity
from app.domain.audits.state_events import apply_transition, record_event
from app.domain.entitlements.enforcement import (
    RateAdmissionDeniedError,
    evaluate_manual_run_admission,
    lock_billing_account_capacity,
)
from app.domain.entitlements.ledger import (
    FundedCreditsExhaustedError,
    Reservation,
    reserve_funded_task,
)
from app.domain.entitlements.service import resolve_workspace_entitlement
from app.domain.entitlements.types import (
    STATUS_ENTITLEMENT_UNRESOLVED,
    STATUS_RESOLVED,
    ResolvedEntitlement,
)
from app.domain.products.shim import project_product_identity
from app.domain.projects.shim import project_scoring_identity
from app.models.audit import (
    Audit,
    AuditEngineSnapshot,
    AuditPromptSnapshot,
    AuditTask,
)
from app.models.brand import Brand
from app.models.product import CompetitorProduct
from app.models.project import Project
from app.models.prompt import Prompt, PromptSet
from app.models.provider import ProviderConnection, ProviderRoute

logger = logging.getLogger("app.billing")


class AuditValidationError(ValueError):
    """Raised when an audit request is invalid (bad prompts/engines/routes)."""


class AuditNotFoundError(LookupError):
    """Raised when an audit is missing or not in the caller's workspace."""


class FundedAdmissionError(RuntimeError):
    """Graceful funded-admission refusal (mapped at the API layer).

    Carries a config-owned code (``funded_budget_exhausted`` /
    ``funded_credits_exhausted`` / ``funded_cost_unresolved`` /
    ``entitlement_unresolved``). Nothing persists when raised inside the
    planner transaction: no audit, task, or ledger rows, nothing enqueued.
    """

    def __init__(
        self, message: str, *, code: str, details: dict[str, Any] | None = None
    ) -> None:
        super().__init__(message)
        self.message = message
        self.code = code
        self.details = details


@dataclass(frozen=True, slots=True)
class _ResolvedRoute:
    """One run's resolved route identity (never a key — invariant 6).

    BYOK runs point at the workspace's ``ProviderConnection``; funded runs
    have no connection (Slice 1 resolves the platform-funded credential from
    the frozen funding block at execution time).
    """

    logical_engine: str
    transport_provider: str
    transport_model: str
    connection_id: uuid.UUID | None
    base_url: str


def _normalize_seed(value: str | None) -> str:
    """Return a decimal string for a 64-bit unsigned seed.

    Accepts an explicit seed (any 64-bit-representable int, decimal string) or
    generates a fresh 64-bit one when omitted (invariant 9 — stored + replayed).
    """
    if value is None or not str(value).strip():
        return str(secrets.randbits(64))
    try:
        seed_int = int(str(value).strip())
    except ValueError as exc:
        raise AuditValidationError("random_seed must be an integer") from exc
    # Keep it in the unsigned 64-bit range so replay is exact.
    return str(seed_int & ((1 << 64) - 1))


def _prompt_panel_snapshot(rows: list[dict]) -> dict:
    """Stable hash of the frozen prompt panel (audit-scoping evidence)."""
    import json

    encoded = json.dumps(rows, sort_keys=True, ensure_ascii=False).encode("utf-8")
    digest = hashlib.sha256(encoded).hexdigest()
    return {
        "panel_id": digest[:16],
        "panel_hash": digest,
        "prompt_hashes": [
            hashlib.sha256(str(r["text"]).encode("utf-8")).hexdigest() for r in rows
        ],
    }


async def _load_project(
    session: AsyncSession, *, workspace_id: uuid.UUID, project_id: uuid.UUID
) -> Project:
    result = await session.execute(
        select(Project)
        .options(
            selectinload(Project.brand).selectinload(Brand.aliases),
            selectinload(Project.competitors),
            selectinload(Project.owned_domains),
            selectinload(Project.unintended_domains),
            selectinload(Project.products),
            selectinload(Project.competitor_products).selectinload(
                CompetitorProduct.competitor
            ),
        )
        .where(
            Project.id == project_id,
            Project.workspace_id == workspace_id,
        )
    )
    project = result.scalars().unique().one_or_none()
    if project is None:
        raise AuditValidationError("Project not found")
    return project


async def _resolve_prompts(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    prompt_set_id: uuid.UUID | None,
    prompt_ids: list[uuid.UUID],
) -> list[Prompt]:
    """Resolve active, enabled prompts from a set or explicit ids, workspace-scoped."""
    stmt = (
        select(Prompt)
        .join(PromptSet, PromptSet.id == Prompt.prompt_set_id)
        .join(Project, Project.id == PromptSet.project_id)
        .where(
            Project.workspace_id == workspace_id,
            Project.id == project_id,
            Prompt.enabled.is_(True),
            # Proposed (unreviewed AI suggestions) and archived prompts are
            # never audit-eligible — only human-accepted active prompts run.
            Prompt.status == PROMPT_STATUS_ACTIVE,
        )
        .order_by(Prompt.created_at.asc())
    )
    if prompt_ids:
        stmt = stmt.where(Prompt.id.in_(prompt_ids))
    elif prompt_set_id is not None:
        stmt = stmt.where(Prompt.prompt_set_id == prompt_set_id)
    else:
        raise AuditValidationError("Either prompt_set_id or prompt_ids is required")
    prompts = list((await session.scalars(stmt)).all())
    # For an explicit id list, reject the whole request if any requested prompt
    # is missing / disabled / from another project or workspace, rather than
    # silently auditing a smaller set than the caller asked for.
    if prompt_ids:
        requested = set(prompt_ids)
        resolved_ids = {prompt.id for prompt in prompts}
        unavailable = requested - resolved_ids
        if unavailable:
            missing = ", ".join(str(pid) for pid in sorted(map(str, unavailable)))
            raise AuditValidationError(
                f"Prompt(s) not found, disabled, not active, or not in this "
                f"project: {missing}"
            )
    if not prompts:
        raise AuditValidationError("No enabled prompts to audit")
    return prompts


def _normalize_engines(engines: list[str]) -> list[str]:
    """Validate + dedupe the requested logical engines (order-preserving)."""
    normalized = [str(e).strip().lower() for e in engines]
    seen: set[str] = set()
    unique_engines: list[str] = []
    for engine in normalized:
        if engine not in LOGICAL_ENGINES:
            raise AuditValidationError(f"Unknown logical engine: {engine}")
        if engine not in seen:
            seen.add(engine)
            unique_engines.append(engine)
    return unique_engines


async def _resolve_routes(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    engines: list[str],
) -> dict[str, _ResolvedRoute]:
    """Pick one active BYOK route + connection per requested logical engine.

    Prefers a route flagged ``is_default`` for the engine, else the first
    active one. Raises if an engine is unknown or has no configured route.
    """
    unique_engines = _normalize_engines(engines)
    result = await session.execute(
        select(ProviderRoute, ProviderConnection)
        .join(
            ProviderConnection,
            ProviderConnection.id == ProviderRoute.connection_id,
        )
        .where(
            ProviderRoute.workspace_id == workspace_id,
            ProviderRoute.active.is_(True),
            ProviderConnection.active.is_(True),
        )
        .order_by(
            ProviderRoute.is_default.desc(),
            ProviderRoute.created_at.asc(),
        )
    )
    routes: dict[str, _ResolvedRoute] = {}
    for route, connection in result.all():
        if not is_route_approved(route.logical_engine, route.transport_provider):
            continue
        if not is_endpoint_approved(
            connection.transport_provider, connection.base_url or ""
        ):
            continue
        routes.setdefault(
            route.logical_engine,
            _ResolvedRoute(
                logical_engine=route.logical_engine,
                transport_provider=route.transport_provider,
                transport_model=route.transport_model,
                connection_id=connection.id,
                base_url=connection.base_url or "",
            ),
        )

    resolved: dict[str, _ResolvedRoute] = {}
    missing: list[str] = []
    for engine in unique_engines:
        if engine in routes:
            resolved[engine] = routes[engine]
        else:
            missing.append(engine)
    if missing:
        raise AuditValidationError(
            "No active provider route configured for engine(s): " + ", ".join(missing)
        )
    return resolved


def _resolve_funded_routes(engines: list[str]) -> dict[str, _ResolvedRoute]:
    """Resolve the catalog-approved funded route per requested engine.

    Exactly one approved transport per engine exists (invariant 10), so a
    funded run needs no workspace connection: the frozen funding block (not
    a connection id) is what Slice 1 credential resolution consumes.
    """
    resolved: dict[str, _ResolvedRoute] = {}
    for engine in _normalize_engines(engines):
        transports = APPROVED_ROUTES.get(engine, {})
        if not transports:
            raise AuditValidationError(f"No approved funded route for engine: {engine}")
        transport = next(iter(transports))
        resolved[engine] = _ResolvedRoute(
            logical_engine=engine,
            transport_provider=transport,
            transport_model=default_model(engine, transport),
            connection_id=None,
            base_url="",
        )
    return resolved


async def _resolve_run_routes(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    engines: list[str],
    credential_mode: str,
) -> dict[str, _ResolvedRoute]:
    """Route resolution for one run: BYOK workspace routes or funded catalog."""
    if credential_mode == CREDENTIAL_MODE_FUNDED:
        return _resolve_funded_routes(engines)
    if credential_mode != CREDENTIAL_MODE_BYOK:
        raise AuditValidationError(f"Unsupported credential_mode: {credential_mode}")
    return await _resolve_routes(session, workspace_id=workspace_id, engines=engines)


def _resolve_benchmark_mode(value: str | None, project: Project) -> str:
    mode = str(value or project.benchmark_mode or DEFAULT_BENCHMARK_MODE)
    mode = mode.strip().lower()
    if mode not in BENCHMARK_MODES:
        raise AuditValidationError(f"Unsupported benchmark_mode: {mode}")
    return mode


@dataclass(frozen=True, slots=True)
class _FrozenPlan:
    """Everything the planner decided BEFORE it touches the audit row.

    ``create_audit`` is an orchestration shell: it consumes this precomputed
    result instead of branching on policy itself. Every field here is frozen
    onto the audit and never re-read from live settings afterwards
    (invariant 9).
    """

    trigger: str
    benchmark_mode: str
    measurement_mode: str
    policy: MeasurementModePolicy
    repetitions: int
    system_instruction: str
    route_policies: dict[str, dict]


def _resolve_measurement_policy(value: str | None) -> tuple[str, MeasurementModePolicy]:
    """Resolve + FREEZE the measurement-mode policy exactly once.

    Reads live settings here and nowhere else; the returned policy is what the
    audit stores and the worker executes. Fails closed on an unknown mode —
    ``measurement_policy_for_mode`` raises rather than defaulting to a cheaper
    or costlier shape.
    """
    mode = str(value or MEASUREMENT_MODE_BENCHMARK).strip().lower()
    try:
        return mode, measurement_policy_for_mode(mode)
    except ValueError as exc:
        raise AuditValidationError(f"Unsupported measurement_mode: {mode}") from exc


def _compose_system_instruction(*, framing: str, policy: MeasurementModePolicy) -> str:
    """Compose the neutral prompt-framing instruction with the mode's addendum.

    The two axes are INDEPENDENT: ``framing`` comes from ``benchmark_mode``
    (consumer_like | controlled_localized | forced_grounded) and the addendum
    from ``measurement_mode``. Neither constrains the other, so any of the six
    combinations composes. The pulse addendum is an UNMEASURED CANDIDATE (see
    ``config/audits.PULSE_ANSWER_INSTRUCTION``); benchmark contributes "".
    Never carries brand/competitor identity (invariant 6).
    """
    return " ".join(part for part in (framing, policy.answer_instruction) if part)


def _resolve_repetitions(requested: int | None, policy: MeasurementModePolicy) -> int:
    """Repetitions for the run: an explicit request, else the mode default.

    The mode policy owns the default (pulse 1, benchmark 3) — the project's
    ``default_repetitions`` is a project-level preference that an explicit
    request still overrides, and neither may exceed the configured bounds.
    """
    reps = int(requested or policy.repetitions)
    if reps < MIN_REPETITIONS or reps > MAX_REPETITIONS:
        raise AuditValidationError(
            f"repetitions must be between {MIN_REPETITIONS} and {MAX_REPETITIONS}"
        )
    return reps


def _validate_prompt_lengths(prompts: list[Prompt]) -> None:
    """Reject any prompt longer than the config-owned ceiling (invariant 1)."""
    limit = audit_settings.max_prompt_chars
    too_long = [prompt for prompt in prompts if len(prompt.text or "") > limit]
    if too_long:
        raise AuditValidationError(
            f"Prompt(s) exceed the maximum length of {limit} characters"
        )


def _route_policy_snapshot(logical_engine: str, transport_provider: str) -> dict:
    """The frozen execution-time route policy for one approved route."""
    policy = route_policy(logical_engine, transport_provider)
    return {
        "reasoning_effort": policy.reasoning_effort,
        "reasoning_pinnable": policy.reasoning_pinnable,
        "representative_status": policy.representative_status,
        "batch_enabled": policy.batch_enabled,
    }


def _validate_trigger(trigger: str) -> str:
    """Fail closed on a trigger outside the config-owned vocabulary."""
    normalized = str(trigger).strip().lower()
    if normalized not in AUDIT_TRIGGERS:
        raise AuditValidationError(f"Unsupported trigger: {trigger}")
    return normalized


def _freeze_plan(
    *,
    project: Project,
    prompts: list[Prompt],
    routes: dict[str, _ResolvedRoute],
    trigger: str,
    benchmark_mode: str | None,
    measurement_mode: str | None,
    repetitions: int | None,
) -> _FrozenPlan:
    """Precompute every policy decision for a run, before any row is written.

    Resolves both mode axes, validates prompt length, resolves repetitions from
    the frozen mode policy, composes the system instruction, and snapshots the
    per-route execution policy.
    """
    framing_mode = _resolve_benchmark_mode(benchmark_mode, project)
    mode, policy = _resolve_measurement_policy(measurement_mode)
    _validate_prompt_lengths(prompts)
    framing = system_instruction_for_mode(
        mode=framing_mode,
        country_code=project.country_code,
        language_code=project.language_code,
    )
    return _FrozenPlan(
        trigger=_validate_trigger(trigger),
        benchmark_mode=framing_mode,
        measurement_mode=mode,
        policy=policy,
        repetitions=_resolve_repetitions(repetitions, policy),
        system_instruction=_compose_system_instruction(framing=framing, policy=policy),
        route_policies={
            engine: _route_policy_snapshot(engine, route.transport_provider)
            for engine, route in routes.items()
        },
    )


def _frozen_configuration(
    *,
    project: Project,
    plan: _FrozenPlan,
    routes: dict[str, _ResolvedRoute],
    prompt_rows: list[dict],
) -> dict:
    """Assemble the immutable ``Audit.configuration`` snapshot (invariant 9).

    ``engine_routes`` mirrors each ``AuditEngineSnapshot`` and additionally
    carries that route's frozen execution policy (the snapshot table itself has
    no policy column, so this mirror is the frozen home for it).
    """
    return {
        **project_scoring_identity(project),
        # Frozen product catalog (Agentic Commerce): the deterministic
        # product analyzer scores against this copy, so later catalog edits
        # never alter the audit (invariant 9).
        **project_product_identity(project),
        "trigger": plan.trigger,
        "benchmark_mode": plan.benchmark_mode,
        "measurement_mode": plan.measurement_mode,
        MEASUREMENT_POLICY_KEY: frozen_policy_configuration(plan.policy),
        "system_instruction": plan.system_instruction,
        "engines": list(routes.keys()),
        # Frozen shopping-surface gate (§7.1): ``[]`` while the gate is
        # disabled — no probe slots are generated and ``total`` is not
        # multiplied.
        "shopping_surfaces": list(SHOPPING_SURFACES),
        "repetitions": plan.repetitions,
        "max_attempts": audit_settings.max_attempts,
        "max_call_seconds": audit_settings.max_call_seconds,
        "max_run_seconds": audit_settings.max_run_seconds,
        # The frozen per-call timeout is the MODE's, not the generic live
        # ``request_timeout_seconds``: an env change mid-run must never alter an
        # in-flight audit (invariant 9).
        "request_timeout_seconds": plan.policy.timeout_seconds,
        "engine_routes": {
            engine: {
                "logical_engine": engine,
                "transport_provider": route.transport_provider,
                "transport_model": route.transport_model,
                "connection_id": (
                    str(route.connection_id)
                    if route.connection_id is not None
                    else None
                ),
                **plan.route_policies[engine],
            }
            for engine, route in routes.items()
        },
        **_prompt_panel_snapshot(prompt_rows),
    }


def _task_route_snapshot(
    *,
    engine: str,
    route: _ResolvedRoute,
    plan: _FrozenPlan,
) -> dict:
    """Per-task frozen route + policy snapshot (never a key — invariant 6)."""
    return {
        "logical_engine": engine,
        "transport_provider": route.transport_provider,
        "transport_model": route.transport_model,
        "connection_id": (
            str(route.connection_id) if route.connection_id is not None else None
        ),
        "base_url": route.base_url,
        "measurement_mode": plan.measurement_mode,
        **plan.route_policies[engine],
        **frozen_policy_configuration(plan.policy),
    }


# ---------------------------------------------------------------------------
# Funded admission (slice23 Task 4 Part B)
# ---------------------------------------------------------------------------
@dataclass(frozen=True, slots=True)
class _FundedAdmission:
    """The frozen funded-admission decision for one run (disabled for BYOK).

    ``reserved_cost_microusd`` is the audit's worst-case funded cost for the
    UTC calendar month of ``budget_period_start`` — deliberately conservative,
    never released, so concurrent admitted work cannot exceed the ceiling.
    """

    enabled: bool
    account_id: uuid.UUID | None
    capability_key: str
    entitlement: ResolvedEntitlement | None
    reserved_cost_microusd: int | None
    budget_period_start: datetime | None


_FUNDED_DISABLED = _FundedAdmission(
    enabled=False,
    account_id=None,
    capability_key="",
    entitlement=None,
    reserved_cost_microusd=None,
    budget_period_start=None,
)


def _complete_execution_cost_microusd(
    *,
    token_cost: int | None,
    search_fee: int | None,
    searches: int | None,
    retrieval_enabled: bool,
) -> int | None:
    """Micro-USD of ONE execution, or None when the estimate is incomplete.

    Completeness is exact: an absent token estimate is always incomplete;
    retrieval ON requires the search fee AND the expected-search count;
    retrieval OFF leaves the search fields not applicable — never read, never
    coerced to zero, never required.
    """
    if token_cost is None:
        return None
    if not retrieval_enabled:
        return token_cost
    if search_fee is None or searches is None:
        return None
    return token_cost + search_fee * searches


def _funded_expected_cost_microusd(
    *,
    routes: dict[str, _ResolvedRoute],
    plan: _FrozenPlan,
    tasks_per_engine: int,
    max_attempts: int,
) -> int:
    """Worst-case funded cost of the whole audit (per-task cost x attempts).

    Reads ONLY ``config/costs.expected_execution_cost`` (the sole cost owner)
    and fails closed with ``funded_cost_unresolved`` on any incomplete
    estimate. Retrieval applicability comes from the frozen mode policy.
    """
    total = 0
    for route in routes.values():
        expected = expected_execution_cost(
            RouteIdentity(
                logical_engine=route.logical_engine,
                transport_provider=route.transport_provider,
                transport_model=route.transport_model,
            ),
            plan.measurement_mode,
            plan.policy.retrieval_enabled,
        )
        per_execution = _complete_execution_cost_microusd(
            token_cost=expected.token_cost_microusd,
            search_fee=expected.search_fee_microusd,
            searches=expected.expected_searches,
            retrieval_enabled=plan.policy.retrieval_enabled,
        )
        if per_execution is None or not expected.complete:
            raise FundedAdmissionError(
                "Expected execution cost is unresolved for "
                f"{route.logical_engine}/{route.transport_provider}",
                code=CODE_FUNDED_COST_UNRESOLVED,
            )
        total += per_execution * max_attempts * tasks_per_engine
    return total


async def _admit_funded_run(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    credential_mode: str,
    plan: _FrozenPlan,
    routes: dict[str, _ResolvedRoute],
    tasks_per_engine: int,
    max_attempts: int,
    at: datetime,
) -> _FundedAdmission:
    """Funded admission: entitlement resolution + monthly budget gate.

    The exact sequence for a funded task set: resolve at the shared
    ``admission_at``, fail closed unless resolved (the resolver emits
    ``billing.entitlement_unresolved``), select the mode's credit key, then
    under the account advisory lock sum the month's reserved worst-case cost
    plus the candidate against the minor-USD ceiling converted through
    ``MICRO_USD_PER_USD``. BYOK bypasses budget admission entirely.
    """
    if credential_mode != CREDENTIAL_MODE_FUNDED:
        return _FUNDED_DISABLED
    entitlement = await resolve_workspace_entitlement(
        session, workspace_id=workspace_id, at=at
    )
    if entitlement.status != STATUS_RESOLVED:
        raise FundedAdmissionError(
            "Billing entitlement is unavailable for this workspace",
            code=STATUS_ENTITLEMENT_UNRESOLVED,
        )
    capability_key = (
        KEY_PULSE_CREDITS
        if plan.measurement_mode == MEASUREMENT_MODE_PULSE
        else KEY_BENCHMARK_CREDITS
    )
    account_id = entitlement.account_id
    # The account-capacity lock is the LAST lock this path acquires (the
    # abuse workspace lock was taken earlier); it serializes every funded
    # admission on the account so the budget ceiling holds concurrently.
    await lock_billing_account_capacity(session, account_id)
    candidate = _funded_expected_cost_microusd(
        routes=routes,
        plan=plan,
        tasks_per_engine=tasks_per_engine,
        max_attempts=max_attempts,
    )
    period_start = at.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    period_end = (period_start + timedelta(days=32)).replace(day=1)
    reserved = await session.scalar(
        select(func.coalesce(func.sum(Audit.funded_reserved_cost_microusd), 0)).where(
            Audit.funding_account_id == account_id,
            Audit.funded_budget_period_start >= period_start,
            Audit.funded_budget_period_start < period_end,
        )
    )
    ceiling_microusd = (
        billing_settings.funded_monthly_budget_minor * MICRO_USD_PER_USD // 100
    )
    if int(reserved or 0) + candidate > ceiling_microusd:
        logger.info(
            TELEMETRY_FUNDED_BUDGET_EXHAUSTED
            + " account_id=%s capability_key=%s reserved_microusd=%s",
            account_id,
            capability_key,
            int(reserved or 0),
        )
        raise FundedAdmissionError(
            "The account's funded monthly budget is exhausted",
            code=CODE_FUNDED_BUDGET_EXHAUSTED,
            details={"capability_key": capability_key},
        )
    return _FundedAdmission(
        enabled=True,
        account_id=account_id,
        capability_key=capability_key,
        entitlement=entitlement,
        reserved_cost_microusd=candidate,
        budget_period_start=period_start,
    )


def _entitlement_provenance(entitlement: ResolvedEntitlement | None) -> dict:
    """Safe resolver provenance for frozen configurations (invariant 6)."""
    if entitlement is None:
        return {}
    return {
        "registry_revision": entitlement.registry_revision,
        "entitlement_lifecycle_version": entitlement.entitlement_lifecycle_version,
        "resolved_at": entitlement.resolved_at.isoformat(),
    }


def _task_funding_block(*, funded: _FundedAdmission, reservation: Reservation) -> dict:
    """Frozen per-task funding provenance for Slice 1 credential resolution."""
    return {
        "credential_mode": CREDENTIAL_MODE_FUNDED,
        "capability_key": reservation.capability_key,
        "funding_account_id": str(reservation.billing_account_id),
        "reservation_id": str(reservation.reservation_id),
        "reserved_units": reservation.units,
        "grant_allocations": [
            {"grant_id": str(allocation.grant_id), "units": allocation.units}
            for allocation in reservation.allocations
        ],
        "entitlement": _entitlement_provenance(funded.entitlement),
    }


async def _create_audit_tasks(
    session: AsyncSession,
    *,
    audit: Audit,
    slots: list[tuple[int, str, int]],
    routes: dict[str, _ResolvedRoute],
    plan: _FrozenPlan,
    prompt_snapshots: list[AuditPromptSnapshot],
    engine_snapshots: dict[str, AuditEngineSnapshot],
    funded: _FundedAdmission,
    workspace_id: uuid.UUID,
    at: datetime,
) -> None:
    """Create one task per shuffled slot; funded tasks reserve before claimable.

    A funded task is written in the NON-claimable ``pending_reservation``
    state, reserves its full ``max_attempts`` in this same transaction,
    records the reservation provenance in its frozen funding configuration,
    and only then flips to ``queued`` — the task row and its full reservation
    become visible atomically at commit, so no worker can claim an unreserved
    funded task. A credit shortfall raises ``FundedAdmissionError`` and the
    whole audit (tasks + reservations) rolls back; nothing is enqueued.
    """
    task_reservations: dict[str, str] = {}
    for position, (prompt_index, engine, repetition) in enumerate(slots):
        prompt_snapshot = prompt_snapshots[prompt_index]
        engine_snapshot = engine_snapshots[engine]
        route = routes[engine]
        # The trailing surface segment is intentional: it reserves the
        # shopping-surface identity in the idempotency key (measurement is
        # the empty string, so shipped keys end in ":").
        idempotency_key = (
            f"{audit.id}:{prompt_index}:{repetition}:{engine}:"
            f"{SHOPPING_SURFACE_MEASUREMENT}"
        )
        task = AuditTask(
            audit_id=audit.id,
            workspace_id=workspace_id,
            prompt_snapshot_id=prompt_snapshot.id,
            engine_snapshot_id=engine_snapshot.id,
            prompt_index=prompt_index,
            repetition=repetition,
            randomized_position=position,
            logical_engine=engine,
            transport_provider=route.transport_provider,
            transport_model=route.transport_model,
            shopping_surface=SHOPPING_SURFACE_MEASUREMENT,
            prompt_text=prompt_snapshot.text,
            provider_route_snapshot=_task_route_snapshot(
                engine=engine, route=route, plan=plan
            ),
            idempotency_key=idempotency_key,
            max_attempts=audit_settings.max_attempts,
            status=(
                TASK_STATUS_PENDING_RESERVATION
                if funded.enabled
                else TASK_STATUS_QUEUED
            ),
        )
        session.add(task)
        if not funded.enabled:
            continue
        await session.flush()  # assign task.id for the reservation FK
        assert funded.account_id is not None  # enabled implies resolved account
        try:
            reservation = await reserve_funded_task(
                session,
                account_id=funded.account_id,
                capability_key=funded.capability_key,
                audit_id=audit.id,
                task_id=task.id,
                units=task.max_attempts,
                idempotency_key=f"{audit.id}:{task.id}:funded-reserve",
                at=at,
            )
        except FundedCreditsExhaustedError as exc:
            raise FundedAdmissionError(
                exc.message, code=exc.code, details=exc.details
            ) from exc
        task.provider_route_snapshot = {
            **(task.provider_route_snapshot or {}),
            "funding": _task_funding_block(funded=funded, reservation=reservation),
        }
        task.status = TASK_STATUS_QUEUED
        task_reservations[str(task.id)] = str(reservation.reservation_id)
    if funded.enabled:
        audit.configuration = {
            **(audit.configuration or {}),
            "funding": {
                "credential_mode": CREDENTIAL_MODE_FUNDED,
                "capability_key": funded.capability_key,
                "funding_account_id": str(funded.account_id),
                "admission_at": at.isoformat(),
                "budget_period_start": (
                    funded.budget_period_start.isoformat()
                    if funded.budget_period_start is not None
                    else None
                ),
                "reserved_cost_microusd": funded.reserved_cost_microusd,
                "entitlement": _entitlement_provenance(funded.entitlement),
            },
            # Replay/provenance map: task id -> reservation id.
            "task_reservations": task_reservations,
        }


async def create_audit(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    engines: list[str],
    trigger: str,
    credential_mode: str = CREDENTIAL_MODE_BYOK,
    prompt_set_id: uuid.UUID | None = None,
    prompt_ids: list[uuid.UUID] | None = None,
    repetitions: int | None = None,
    benchmark_mode: str | None = None,
    measurement_mode: str | None = None,
    random_seed: str | None = None,
) -> Audit:
    """Create + enqueue an audit (freeze snapshots, deterministic slot shuffle).

    Commits with all tasks ``queued`` so the worker can claim them.

    An orchestration SHELL: every policy decision (both mode axes, the frozen
    measurement policy, repetitions, the composed system instruction, the route
    policies) is precomputed by ``_freeze_plan`` and assembled by
    ``_frozen_configuration``; the rolling manual-run rate is EVALUATED by
    ``evaluate_manual_run_admission`` and only applied here; funded admission
    (entitlement resolution, the monthly budget gate, and per-task credit
    reservations before claimability) is owned by ``_admit_funded_run`` and
    ``_create_audit_tasks``. This shell adds no branching of its own.
    """
    project = await _load_project(
        session, workspace_id=workspace_id, project_id=project_id
    )
    prompts = await _resolve_prompts(
        session,
        workspace_id=workspace_id,
        project_id=project_id,
        prompt_set_id=prompt_set_id,
        prompt_ids=list(prompt_ids or []),
    )
    # ONE admission instant shared by the rate evaluation, the entitlement
    # resolution, the budget period, and every reservation timestamp.
    admission_at = datetime.now(UTC)
    routes = await _resolve_run_routes(
        session,
        workspace_id=workspace_id,
        engines=engines,
        credential_mode=credential_mode,
    )

    plan = _freeze_plan(
        project=project,
        prompts=prompts,
        routes=routes,
        trigger=trigger,
        benchmark_mode=benchmark_mode,
        measurement_mode=measurement_mode,
        repetitions=repetitions,
    )
    reps = plan.repetitions
    engine_list = list(routes.keys())
    total = len(prompts) * len(engine_list) * reps
    if total > audit_settings.max_tasks_per_audit:
        raise AuditValidationError(
            f"Audit would create {total} tasks, exceeding the limit of "
            f"{audit_settings.max_tasks_per_audit}"
        )

    await reserve_workspace_capacity(
        session,
        workspace_id=workspace_id,
        lock_namespace="audit-enqueue",
        model=Audit,
        active_statuses=AUDIT_ACTIVE_STATUSES,
        active_limit=abuse_settings.active_audits_per_workspace,
        active_operation="audit.active_jobs",
        usage_operation="audit.provider_tasks",
        usage_limit=abuse_settings.audit_tasks_per_workspace_daily,
        amount=total,
        retry_after_seconds=abuse_settings.active_job_retry_after_seconds,
    )

    # Rolling manual-run rate (account-scoped, under the account advisory
    # lock — acquired LAST, after the abuse workspace lock): evaluated by the
    # entitlements owner; this shell only APPLIES the typed decision. The
    # active-audit/task abuse controls above stay separate protections.
    rate_decision = await evaluate_manual_run_admission(
        session, workspace_id=workspace_id, trigger=plan.trigger, at=admission_at
    )
    if not rate_decision.allowed:
        raise RateAdmissionDeniedError(
            "The account's manual run rate allowance is exhausted",
            decision=rate_decision,
        )

    # Funded admission (no-op for BYOK): resolves the entitlement at
    # ``admission_at``, gates the UTC-month budget under the account lock,
    # and selects the mode's consumable credit key.
    funded = await _admit_funded_run(
        session,
        workspace_id=workspace_id,
        credential_mode=credential_mode,
        plan=plan,
        routes=routes,
        tasks_per_engine=len(prompts) * reps,
        max_attempts=audit_settings.max_attempts,
        at=admission_at,
    )

    seed = _normalize_seed(random_seed)
    prompt_rows = [
        {
            "text": prompt.text or "",
            "theme": prompt.theme or "",
            "intent": prompt.intent or "",
        }
        for prompt in prompts
    ]
    configuration = _frozen_configuration(
        project=project, plan=plan, routes=routes, prompt_rows=prompt_rows
    )

    audit = Audit(
        workspace_id=workspace_id,
        project_id=project.id,
        status=AUDIT_STATUS_DRAFT,
        trigger=plan.trigger,
        benchmark_mode=plan.benchmark_mode,
        measurement_mode=plan.measurement_mode,
        system_instruction=plan.system_instruction,
        repetitions=reps,
        random_seed=seed,
        configuration=configuration,
        requested_count=total,
        # Funded worst-case monthly reservation (null for BYOK runs).
        funding_account_id=funded.account_id,
        funded_budget_period_start=funded.budget_period_start,
        funded_reserved_cost_microusd=funded.reserved_cost_microusd,
    )
    session.add(audit)
    await session.flush()  # assign audit.id

    # Freeze prompt snapshots (immutable copies, invariant 3).
    prompt_snapshots: list[AuditPromptSnapshot] = []
    for index, prompt in enumerate(prompts):
        snapshot = AuditPromptSnapshot(
            audit_id=audit.id,
            prompt_id=prompt.id,
            prompt_index=index,
            text=prompt.text or "",
            theme=prompt.theme or "",
            intent=prompt.intent or "",
        )
        session.add(snapshot)
        prompt_snapshots.append(snapshot)

    # Freeze engine snapshots (provenance triple + connection, invariant 10).
    engine_snapshots: dict[str, AuditEngineSnapshot] = {}
    for engine, route in routes.items():
        engine_snapshot = AuditEngineSnapshot(
            audit_id=audit.id,
            logical_engine=engine,
            transport_provider=route.transport_provider,
            transport_model=route.transport_model,
            connection_id=route.connection_id,
            base_url=route.base_url,
        )
        session.add(engine_snapshot)
        engine_snapshots[engine] = engine_snapshot
    await session.flush()  # assign snapshot ids

    # Build every (prompt_index, engine, repetition) slot, then shuffle it
    # deterministically with the stored seed (invariant 9). The same seed
    # reproduces the same order.
    slots = [
        (prompt_index, engine, repetition)
        for prompt_index in range(len(prompts))
        for engine in engine_list
        for repetition in range(reps)
    ]
    random.Random(int(seed)).shuffle(slots)

    await _create_audit_tasks(
        session,
        audit=audit,
        slots=slots,
        routes=routes,
        plan=plan,
        prompt_snapshots=prompt_snapshots,
        engine_snapshots=engine_snapshots,
        funded=funded,
        workspace_id=workspace_id,
        at=admission_at,
    )

    # Move DRAFT -> VALIDATING -> QUEUED through the state machine so an illegal
    # move raises instead of silently corrupting the lifecycle (invariant 9).
    apply_transition(
        session,
        audit=audit,
        target=AUDIT_STATUS_VALIDATING,
        message="audit validating",
    )
    apply_transition(
        session,
        audit=audit,
        target=AUDIT_STATUS_QUEUED,
        message="audit queued",
    )
    record_event(
        session,
        audit_id=audit.id,
        event_type=EVENT_AUDIT_CREATED,
        message="audit created",
        payload={"requested_count": total, "engines": engine_list},
    )
    record_event(
        session,
        audit_id=audit.id,
        event_type=EVENT_AUDIT_QUEUED,
        message="audit queued",
        payload={"task_count": len(slots)},
    )

    await session.commit()
    # `engine_snapshots` is a lazy relationship; a bare ``session.refresh``
    # only reloads scalar columns, so accessing it later (e.g. from
    # ``AuditResponse.model_validate`` in the API layer, outside of an async
    # greenlet) raises ``MissingGreenlet``. Re-fetch through ``get_audit``,
    # which eagerly loads it via ``selectinload``, so the returned instance is
    # safe to serialize.
    return await get_audit(session, workspace_id=workspace_id, audit_id=audit.id)


async def get_audit(
    session: AsyncSession, *, workspace_id: uuid.UUID, audit_id: uuid.UUID
) -> Audit:
    result = await session.execute(
        select(Audit)
        .options(
            selectinload(Audit.engine_snapshots),
            selectinload(Audit.shopping_surface_snapshots),
        )
        .where(
            Audit.id == audit_id,
            Audit.workspace_id == workspace_id,
        )
    )
    audit = result.scalars().unique().one_or_none()
    if audit is None:
        raise AuditNotFoundError(str(audit_id))
    return audit


async def list_audits(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    project_id: uuid.UUID | None = None,
    limit: int = 50,
) -> list[Audit]:
    stmt = (
        select(Audit)
        .options(
            selectinload(Audit.engine_snapshots),
            selectinload(Audit.shopping_surface_snapshots),
        )
        .where(Audit.workspace_id == workspace_id)
        .order_by(Audit.created_at.desc())
        .limit(limit)
    )
    if project_id is not None:
        stmt = stmt.where(Audit.project_id == project_id)
    return list((await session.scalars(stmt)).unique().all())


async def list_tasks(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    audit_id: uuid.UUID,
    surface: str = SHOPPING_SURFACE_MEASUREMENT,
) -> list[AuditTask]:
    """List an audit's tasks for ONE shopping surface (default measurement)."""
    await get_audit(session, workspace_id=workspace_id, audit_id=audit_id)
    stmt = (
        select(AuditTask)
        .where(
            AuditTask.audit_id == audit_id,
            AuditTask.shopping_surface == surface,
        )
        .order_by(AuditTask.randomized_position.asc())
    )
    return list((await session.scalars(stmt)).all())


async def cancel_audit(
    session: AsyncSession, *, workspace_id: uuid.UUID, audit_id: uuid.UUID
) -> Audit:
    """Cooperatively cancel an active audit and terminalize open tasks.

    Flips the audit to ``cancelled`` (so a live worker stops at the next
    execution boundary) and marks any non-terminal task ``cancelled`` so counts
    and the UI stay consistent. This also cleans up a zombie audit whose worker
    died mid-run.
    """
    audit = await get_audit(session, workspace_id=workspace_id, audit_id=audit_id)
    if audit.status not in AUDIT_ACTIVE_STATUSES:
        raise AuditValidationError("Only active audits can be cancelled")
    now = datetime.now(UTC)
    audit.completed_at = now
    # Route the flip through the state machine (invariant 9): AUDIT_ACTIVE_STATUSES
    # only contains statuses the machine allows to reach CANCELLED, so this never
    # raises here, but it keeps the single enforcement path and records the event.
    apply_transition(
        session,
        audit=audit,
        target=AUDIT_STATUS_CANCELLED,
        message="audit cancelled",
    )
    await session.execute(
        update(AuditTask)
        .where(AuditTask.audit_id == audit.id)
        .where(AuditTask.status.not_in(list(TASK_TERMINAL_STATUSES)))
        .values(
            status=TASK_STATUS_CANCELLED,
            lease_owner=None,
            lease_expires_at=None,
            completed_at=now,
            error_code="cancelled",
        )
    )
    record_event(
        session,
        audit_id=audit.id,
        event_type=EVENT_AUDIT_CANCELLED,
        message="audit cancelled",
        payload={"status": AUDIT_STATUS_CANCELLED},
    )
    await session.commit()
    # See the comment in ``create_audit``: refresh() would expire (and later
    # lazy-load) ``engine_snapshots``, which needs to stay eagerly loaded for
    # safe serialization outside the async greenlet.
    return await get_audit(session, workspace_id=workspace_id, audit_id=audit.id)
