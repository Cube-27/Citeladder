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
import random
import secrets
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config.abuse import abuse_settings
from app.core.config.audits import (
    AUDIT_ACTIVE_STATUSES,
    AUDIT_STATUS_CANCELLED,
    AUDIT_STATUS_DRAFT,
    AUDIT_STATUS_QUEUED,
    AUDIT_STATUS_VALIDATING,
    AUDIT_TRIGGER_MANUAL,
    EVENT_AUDIT_CANCELLED,
    EVENT_AUDIT_CREATED,
    EVENT_AUDIT_QUEUED,
    MEASUREMENT_MODE_BENCHMARK,
    MEASUREMENT_POLICY_KEY,
    TASK_STATUS_CANCELLED,
    TASK_TERMINAL_STATUSES,
    MeasurementModePolicy,
    audit_settings,
    frozen_policy_configuration,
    measurement_policy_for_mode,
    system_instruction_for_mode,
)
from app.core.config.commerce import (
    SHOPPING_SURFACE_MEASUREMENT,
    SHOPPING_SURFACES,
)
from app.core.config.projects import (
    BENCHMARK_MODES,
    DEFAULT_BENCHMARK_MODE,
    MAX_REPETITIONS,
    MIN_REPETITIONS,
)
from app.core.config.prompts import PROMPT_STATUS_ACTIVE
from app.core.config.provider_catalog import (
    LOGICAL_ENGINES,
    is_endpoint_approved,
    is_route_approved,
    route_policy,
)
from app.domain.abuse.service import reserve_workspace_capacity
from app.domain.audits.state_events import apply_transition, record_event
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


class AuditValidationError(ValueError):
    """Raised when an audit request is invalid (bad prompts/engines/routes)."""


class AuditNotFoundError(LookupError):
    """Raised when an audit is missing or not in the caller's workspace."""


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


async def _resolve_routes(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    engines: list[str],
) -> dict[str, tuple[ProviderRoute, ProviderConnection]]:
    """Pick one active route + connection per requested logical engine.

    Prefers a route flagged ``is_default`` for the engine, else the first
    active one. Raises if an engine is unknown or has no configured route.
    """
    normalized = [str(e).strip().lower() for e in engines]
    seen: set[str] = set()
    unique_engines: list[str] = []
    for engine in normalized:
        if engine not in LOGICAL_ENGINES:
            raise AuditValidationError(f"Unknown logical engine: {engine}")
        if engine not in seen:
            seen.add(engine)
            unique_engines.append(engine)

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
    routes: dict[str, tuple[ProviderRoute, ProviderConnection]] = {}
    for route, connection in result.all():
        if not is_route_approved(route.logical_engine, route.transport_provider):
            continue
        if not is_endpoint_approved(
            connection.transport_provider, connection.base_url or ""
        ):
            continue
        routes.setdefault(route.logical_engine, (route, connection))

    resolved: dict[str, tuple[ProviderRoute, ProviderConnection]] = {}
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


def _compose_system_instruction(
    *, framing: str, policy: MeasurementModePolicy
) -> str:
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


def _freeze_plan(
    *,
    project: Project,
    prompts: list[Prompt],
    routes: dict[str, tuple[ProviderRoute, ProviderConnection]],
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
        benchmark_mode=framing_mode,
        measurement_mode=mode,
        policy=policy,
        repetitions=_resolve_repetitions(repetitions, policy),
        system_instruction=_compose_system_instruction(
            framing=framing, policy=policy
        ),
        route_policies={
            engine: _route_policy_snapshot(engine, route.transport_provider)
            for engine, (route, _connection) in routes.items()
        },
    )


def _frozen_configuration(
    *,
    project: Project,
    plan: _FrozenPlan,
    routes: dict[str, tuple[ProviderRoute, ProviderConnection]],
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
        "trigger": AUDIT_TRIGGER_MANUAL,
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
                "connection_id": str(connection.id),
                **plan.route_policies[engine],
            }
            for engine, (route, connection) in routes.items()
        },
        **_prompt_panel_snapshot(prompt_rows),
    }


def _task_route_snapshot(
    *,
    engine: str,
    route: ProviderRoute,
    connection: ProviderConnection,
    plan: _FrozenPlan,
) -> dict:
    """Per-task frozen route + policy snapshot (never a key — invariant 6)."""
    return {
        "logical_engine": engine,
        "transport_provider": route.transport_provider,
        "transport_model": route.transport_model,
        "connection_id": str(connection.id),
        "base_url": connection.base_url or "",
        "measurement_mode": plan.measurement_mode,
        **plan.route_policies[engine],
        **frozen_policy_configuration(plan.policy),
    }


async def create_audit(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    engines: list[str],
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
    ``_frozen_configuration`` so this function adds no branching of its own.
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
    routes = await _resolve_routes(session, workspace_id=workspace_id, engines=engines)

    plan = _freeze_plan(
        project=project,
        prompts=prompts,
        routes=routes,
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
        trigger=AUDIT_TRIGGER_MANUAL,
        benchmark_mode=plan.benchmark_mode,
        measurement_mode=plan.measurement_mode,
        system_instruction=plan.system_instruction,
        repetitions=reps,
        random_seed=seed,
        configuration=configuration,
        requested_count=total,
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
    for engine, (route, connection) in routes.items():
        engine_snapshot = AuditEngineSnapshot(
            audit_id=audit.id,
            logical_engine=engine,
            transport_provider=route.transport_provider,
            transport_model=route.transport_model,
            connection_id=connection.id,
            base_url=connection.base_url or "",
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

    for position, (prompt_index, engine, repetition) in enumerate(slots):
        prompt_snapshot = prompt_snapshots[prompt_index]
        engine_snapshot = engine_snapshots[engine]
        route, connection = routes[engine]
        # The trailing surface segment is intentional: it reserves the
        # shopping-surface identity in the idempotency key (measurement is
        # the empty string, so shipped keys end in ":").
        idempotency_key = (
            f"{audit.id}:{prompt_index}:{repetition}:{engine}:"
            f"{SHOPPING_SURFACE_MEASUREMENT}"
        )
        session.add(
            AuditTask(
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
                    engine=engine, route=route, connection=connection, plan=plan
                ),
                idempotency_key=idempotency_key,
                max_attempts=audit_settings.max_attempts,
            )
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
