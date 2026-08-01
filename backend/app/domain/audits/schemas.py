# Audit request/response DTOs (string UUID ids; workspace-scoped, invariant 5).
#
# Mirrors the `POST /audits` contract in docs/backend-architecture.md §4. The
# request references a project + prompt source + logical engines; provider keys
# are NEVER carried here — the worker resolves the decrypted key from the
# workspace's ``ProviderConnection`` at execution time (invariant 6). Responses
# never expose secrets or the raw brand list.
from __future__ import annotations

import uuid
from collections.abc import Iterable
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.core.config.audits import (
    MEASUREMENT_MODE_BENCHMARK,
    MEASUREMENT_MODE_PULSE,
    MEASUREMENT_POLICY_KEY,
)
from app.core.config.commerce import SHOPPING_SURFACE_MEASUREMENT
from app.core.config.projects import MAX_REPETITIONS, MIN_REPETITIONS
from app.core.config.provider_catalog import APPROVED_ROUTES

BenchmarkModeStr = str


# --- Measurement provenance (read-path projections, invariants 4/7) --------
#
# Every helper below derives provenance ONLY from frozen audit/task/artifact
# fields (``Audit.measurement_mode``/``configuration``, the frozen task
# request/route snapshots). Live config is NEVER consulted to infer retrieval
# state or a measurement mode: when the frozen fields do not record a value
# the projection reports ``None``/``""`` rather than guessing (reports are
# projections — if it is not persisted, it does not appear).


class ModelProvenance(BaseModel):
    """One measured route's provenance on an AGGREGATE surface.

    ``(logical_engine, transport_provider, transport_model, retrieval_enabled)``
    for one route the audit measured. Aggregate surfaces (audit, overview,
    trend point, exports) carry a LIST of these in stable catalog order and
    never force a singular model when the aggregate spans models.
    ``retrieval_enabled`` comes only from frozen fields; ``None`` means the
    audit predates the frozen policy block (never inferred from live config).
    """

    logical_engine: str
    transport_provider: str
    transport_model: str
    retrieval_enabled: bool | None = None


# Stable catalog order: the engine order of the approved-route catalog
# (config-owned; unknown/retired engines sort after it, deterministically).
_ENGINE_CATALOG_ORDER: dict[str, int] = {
    engine: index for index, engine in enumerate(APPROVED_ROUTES)
}


def _provenance_sort_key(item: ModelProvenance) -> tuple[int, str, str, str, str]:
    return (
        _ENGINE_CATALOG_ORDER.get(item.logical_engine, len(_ENGINE_CATALOG_ORDER)),
        item.logical_engine,
        item.transport_provider,
        item.transport_model,
        "" if item.retrieval_enabled is None else str(item.retrieval_enabled),
    )


def build_model_provenance(
    items: Iterable[ModelProvenance],
) -> list[ModelProvenance]:
    """Dedupe exact provenance items and order them by the stable catalog."""
    unique: dict[tuple[str, str, str, bool | None], ModelProvenance] = {}
    for item in items:
        unique.setdefault(
            (
                item.logical_engine,
                item.transport_provider,
                item.transport_model,
                item.retrieval_enabled,
            ),
            item,
        )
    return sorted(unique.values(), key=_provenance_sort_key)


def frozen_retrieval_enabled(*snapshots: dict | None) -> bool | None:
    """First frozen ``retrieval_enabled`` across snapshots; None if unrecorded."""
    for snapshot in snapshots:
        if isinstance(snapshot, dict) and "retrieval_enabled" in snapshot:
            return bool(snapshot["retrieval_enabled"])
    return None


def frozen_measurement_mode(*snapshots: dict | None) -> str:
    """First non-empty frozen ``measurement_mode`` across snapshots ("" if none)."""
    for snapshot in snapshots:
        if isinstance(snapshot, dict):
            mode = snapshot.get("measurement_mode")
            if isinstance(mode, str) and mode:
                return mode
    return ""


def audit_frozen_retrieval_enabled(configuration: dict | None) -> bool | None:
    """Retrieval state from the audit's frozen measurement-policy block."""
    frozen = (configuration or {}).get(MEASUREMENT_POLICY_KEY)
    if not isinstance(frozen, dict):
        return None
    return frozen_retrieval_enabled(frozen)


def model_provenance_for(
    engine_snapshots: Iterable[Any], configuration: dict | None
) -> list[ModelProvenance]:
    """Aggregate provenance from frozen engine snapshots + the frozen policy.

    The retrieval state is audit-wide (the frozen mode policy), applied to
    every route the audit measured; items are in stable catalog order.
    """
    retrieval = audit_frozen_retrieval_enabled(configuration)
    return build_model_provenance(
        ModelProvenance(
            logical_engine=snapshot.logical_engine,
            transport_provider=snapshot.transport_provider,
            transport_model=snapshot.transport_model,
            retrieval_enabled=retrieval,
        )
        for snapshot in engine_snapshots
    )


def execution_frozen_provenance(
    *,
    request_snapshot: dict | None,
    route_snapshot: dict | None,
    audit_measurement_mode: str | None = None,
    audit_configuration: dict | None = None,
) -> tuple[str, bool | None]:
    """Frozen ``(measurement_mode, retrieval_enabled)`` for one execution.

    The frozen task request snapshot (what the call executed under) wins,
    then the planner's frozen route snapshot, then the audit's frozen mode
    column + policy block. Live config is never consulted (invariants 4/7).
    """
    mode = frozen_measurement_mode(request_snapshot, route_snapshot)
    if not mode:
        mode = audit_measurement_mode or ""
    retrieval = frozen_retrieval_enabled(request_snapshot, route_snapshot)
    if retrieval is None:
        retrieval = audit_frozen_retrieval_enabled(audit_configuration)
    return mode, retrieval


class AuditCreate(BaseModel):
    """`POST /audits` body. The workspace is resolved from the session/header."""

    project_id: uuid.UUID
    # Prompt source: a whole set, or explicit prompt ids (at least one).
    prompt_set_id: uuid.UUID | None = None
    prompt_ids: list[uuid.UUID] = Field(default_factory=list)
    # Logical engines to measure (chatgpt|gemini|claude). Must have a workspace
    # provider route configured for each.
    engines: list[str] = Field(default_factory=list, min_length=1)
    repetitions: int | None = Field(
        default=None, ge=MIN_REPETITIONS, le=MAX_REPETITIONS
    )
    benchmark_mode: BenchmarkModeStr | None = None
    # Measurement mode — an axis INDEPENDENT of ``benchmark_mode`` (prompt
    # framing): it selects the frozen route/output policy (retrieval, output
    # cap, timeout, repetitions, answer instruction). Defaults to ``benchmark``
    # so an explicit manual run keeps its full-run shape; a later PR3
    # schedule/trial caller passes its own mode explicitly.
    measurement_mode: Literal[MEASUREMENT_MODE_PULSE, MEASUREMENT_MODE_BENCHMARK] = (
        MEASUREMENT_MODE_BENCHMARK
    )
    # Optional explicit 64-bit seed (decimal string). Generated + stored when
    # omitted so the slot shuffle is reproducible (invariant 9).
    random_seed: str | None = None


class AuditTaskResponse(BaseModel):
    """A single execution/queue row projection (never contains secrets).

    Execution-level surface: the provenance triple is singular (one execution
    = one exact model). ``measurement_mode``/``retrieval_enabled`` project the
    frozen task request/route snapshots only — never live config (inv. 4/7).
    """

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    audit_id: uuid.UUID
    prompt_index: int
    repetition: int
    randomized_position: int
    logical_engine: str
    transport_provider: str
    transport_model: str
    shopping_surface: str = SHOPPING_SURFACE_MEASUREMENT
    measurement_mode: str = ""
    retrieval_enabled: bool | None = None
    status: str
    attempt_count: int
    max_attempts: int
    answer_text: str = ""
    search_used: bool = False
    error_code: str = ""
    error_detail: str = ""
    latency_ms: int | None = None
    created_at: datetime
    completed_at: datetime | None = None

    @model_validator(mode="before")
    @classmethod
    def _inject_frozen_provenance(cls, data: Any) -> Any:
        """Project frozen per-execution provenance from the task snapshots."""
        if isinstance(data, dict):
            return data
        values = {
            name: getattr(data, name)
            for name in cls.model_fields
            if hasattr(data, name)
        }
        values["measurement_mode"], values["retrieval_enabled"] = (
            execution_frozen_provenance(
                request_snapshot=getattr(data, "request_snapshot", None),
                route_snapshot=getattr(data, "provider_route_snapshot", None),
            )
        )
        return values


class AuditEngineSnapshotResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    logical_engine: str
    transport_provider: str
    transport_model: str


class AuditShoppingSurfaceSnapshotResponse(BaseModel):
    """Frozen shopping-surface identity (empty list while the gate is off)."""

    model_config = ConfigDict(from_attributes=True)

    shopping_surface: str
    logical_engine: str
    transport_provider: str
    transport_model: str


class AuditResponse(BaseModel):
    """Audit projection. Includes engine provenance but never the key.

    Aggregate surface: ``measurement_mode`` is the frozen column and
    ``model_provenance`` is the stable catalog-ordered list of every measured
    route (never a forced singular model when the audit spans models).
    """

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    workspace_id: uuid.UUID
    project_id: uuid.UUID
    status: str
    benchmark_mode: str = ""
    measurement_mode: str = ""
    repetitions: int
    random_seed: str = ""
    requested_count: int
    completed_count: int
    failed_count: int
    error_message: str = ""
    engine_snapshots: list[AuditEngineSnapshotResponse] = Field(default_factory=list)
    shopping_surface_snapshots: list[AuditShoppingSurfaceSnapshotResponse] = Field(
        default_factory=list
    )
    model_provenance: list[ModelProvenance] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime
    started_at: datetime | None = None
    completed_at: datetime | None = None

    @model_validator(mode="before")
    @classmethod
    def _inject_aggregate_provenance(cls, data: Any) -> Any:
        """Project aggregate provenance from frozen snapshots + policy only."""
        if isinstance(data, dict):
            return data
        values = {
            name: getattr(data, name)
            for name in cls.model_fields
            if hasattr(data, name)
        }
        values["model_provenance"] = model_provenance_for(
            getattr(data, "engine_snapshots", None) or [],
            getattr(data, "configuration", None),
        )
        return values


class AuditEventResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    audit_id: uuid.UUID
    event_type: str
    message: str = ""
    payload: dict | None = None
    created_at: datetime
