"""Integrations API DTOs — these NEVER carry tokens (invariant 6).

Tokens live Fernet-encrypted on ``IntegrationOAuthGrant`` and are decrypted
only inside the service for an exchange/probe/revoke call. The wire shapes
match the frontend zod contracts exactly (contract C6):
``integrationConnectionSchema``, ``integrationTestResultSchema``,
``integrationSyncRunSchema``, and ``integrationSyncEnqueueSchema`` are
``.strict()`` — any leaked token key fails their validation loud.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import BaseModel, Field


class IntegrationConnectionResponse(BaseModel):
    """``GET /integrations`` row: a connection joined to its grant.

    Carries the grant's ``status`` + ``granted_scopes``; the grant's
    encrypted token columns are never present by construction.
    """

    id: uuid.UUID
    workspace_id: uuid.UUID
    grant_id: uuid.UUID
    provider: str
    label: str
    account_ref: str
    grant_status: str
    granted_scopes: list[str]
    last_synced_at: datetime | None
    created_at: datetime
    updated_at: datetime


class IntegrationTestResponse(BaseModel):
    """``POST /integrations/{id}/test`` probe result (never the token)."""

    connection_id: uuid.UUID
    status: str
    error_code: str = ""
    detail: str = ""
    tested_at: datetime


class SyncWindowRequest(BaseModel):
    """Optional explicit window body for ``POST /integrations/{id}/sync``.

    Both bounds absent → the config default trailing window; both present →
    validated + clamped by the sync service; exactly one present → 422.
    """

    window_start: date | None = None
    window_end: date | None = None


class IntegrationSyncEnqueueResponse(BaseModel):
    """202 enqueue identity (contract C3) — the frontend polls the detail.

    Matches ``integrationSyncEnqueueSchema`` exactly (strict).
    """

    sync_run_id: uuid.UUID
    connection_id: uuid.UUID
    status: str


class IntegrationSyncRunResponse(BaseModel):
    """Sync-run history/detail projection (status, window, row counts).

    ``row_count`` is the summed ``row_count`` of the run's immutable import
    artifacts (0 before the worker lands any). ``error_code``/``error_detail``
    are ``""`` when there is no error. Matches ``integrationSyncRunSchema``
    exactly (strict) — a queue-row projection, never any token (invariant 7).
    """

    id: uuid.UUID
    connection_id: uuid.UUID
    sync_kind: str
    status: str
    window_start: date
    window_end: date
    row_count: int
    resync_seq: int
    error_code: str
    error_detail: str
    created_at: datetime
    updated_at: datetime
    completed_at: datetime | None


class IntegrationBackfillProgressResponse(BaseModel):
    """The connection's history-import rollup (a projection, not a table).

    Derived entirely from the connection's ``backfill``-kind
    ``IntegrationSyncRun`` rows, so it says exactly what those rows say and
    nothing more. ``state`` distinguishes the cases invariant 7 keeps apart:

    - ``not_started`` — no backfill run exists. NOT "zero windows imported":
      a property was never selected, or the import was never enqueued.
    - ``importing`` — at least one window is still queued or running.
    - ``complete`` — every window reached a terminal state, none failed.
    - ``partial`` — every window is terminal but some failed, so the covered
      history has holes the counts make visible.

    ``covered_from`` / ``covered_through`` bound the SUCCEEDED windows only,
    so a failed chunk never widens the claimed coverage. Both are null until
    one window succeeds.
    """

    connection_id: uuid.UUID
    state: str
    total_windows: int
    completed_windows: int
    failed_windows: int
    pending_windows: int
    covered_from: date | None
    covered_through: date | None


class IntegrationPropertyResponse(BaseModel):
    """One selectable provider property from ``GET /{id}/properties``.

    Provider-side discovery output, not stored state: ``property_ref`` is
    the canonical ref the caller posts back to create a mapping, ``label``
    is display-only. Carries no token and no provider credentials.
    """

    property_ref: str
    label: str


class IntegrationPropertyMappingCreate(BaseModel):
    """``POST /integrations/{id}/mappings`` body.

    ``provider`` must equal the referenced connection's provider (422);
    ``property_ref`` must resolve to one of the target project's owned
    domains (422) — GA4 property refs excepted: they are numeric property
    ids validated on shape, never domains, and persist as the canonical
    bare id (a ``properties/`` prefix is stripped). Width caps mirror the
    DB columns so an overlong value fails 422 here instead of a DataError
    at insert time.
    """

    provider: str = Field(min_length=1, max_length=16)
    property_ref: str = Field(min_length=1, max_length=512)
    project_id: uuid.UUID


class IntegrationPropertyMappingResponse(BaseModel):
    """One property→project bridge row (status ``active | disabled``)."""

    id: uuid.UUID
    workspace_id: uuid.UUID
    connection_id: uuid.UUID
    provider: str
    property_ref: str
    project_id: uuid.UUID
    status: str
    created_at: datetime
    updated_at: datetime


class ProjectReadinessResponse(BaseModel):
    """Where a project sits on the post-connect ladder, and why.

    A pure projection over already-persisted rows (invariant 7): grant
    status, backfill runs, snapshot presence, demand snapshot presence and
    live opportunity count. It reports the HIGHEST stage reached, plus the
    individual facts, so a surface can render the ladder rather than one
    undifferentiated spinner.

    The stages are distinct STATES, never a percentage:

    - ``not_connected`` — the project has no active mapped connection. Not
      "importing nothing": nobody has connected a provider.
    - ``connected`` — a connection exists, but no import has been enqueued.
    - ``importing`` — at least one backfill window is still queued or running.
    - ``import_failed`` — every window reached a terminal status, none
      succeeded, and nothing projected. Off the ladder rather than on it: no
      further data is coming, so this is not a slower ``importing``.
    - ``core_data_ready`` — a Performance snapshot exists, so the user's own
      GSC/GA4 numbers can render, while analysis may still be computing.
    - ``analysis_ready`` — a demand snapshot exists too, so CiteLadder's own
      layer is present.

    ``opportunity_count`` counts LIVE opportunities only (superseded rows are
    history). Zero of them with ``analysis_ready`` is a measured zero — the
    analysis ran and found nothing — which is NOT the same as analysis that
    has not run, and the stage is what keeps those apart.
    """

    project_id: uuid.UUID
    stage: str
    connection_count: int
    #: The distinct providers behind those connections, sorted. A surface uses
    #: it to decide whether an engine's panel belongs on screen at all: a
    #: project with no Bing connection has no Bing panel, which is not the
    #: same as a Bing panel that measured nothing.
    providers: list[str]
    #: The backfill rollup across every mapped connection, or null when the
    #: project has no mapped connection at all.
    backfill_state: str | None
    #: The date through which EVERY mapped connection has imported — null as
    #: soon as one of them has imported nothing. Never the furthest
    #: connection's reach, which would claim coverage the project lacks.
    imported_through: date | None
    has_performance_snapshot: bool
    has_demand_snapshot: bool
    opportunity_count: int
