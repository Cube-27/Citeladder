"""Pure helpers for the observed-surface worker path.

Everything here is I/O-free and session-free: shaping a submission reference,
reading a listing for a verified tag match, turning a parsed result into the
rows the existing pipeline consumes. They live beside the worker rather than
inside it so the lifecycle module stays about the LIFECYCLE — intent, submit,
park, poll, finalize — and these stay independently readable and testable.

The one exception is ``_bound_credential``, which needs a session to load the
connection; it sits here because it is part of the same "read what the task
froze" concern as ``_frozen_search_context`` beside it.
"""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.connectors.answer_engines.errors import ProviderError
from app.connectors.search_surfaces.contracts import (
    OUTCOME_PROVIDER_ERROR,
    SearchSurfaceResult,
)
from app.core.config import dataforseo as dataforseo_config
from app.core.config.audits import AUDIT_STATUS_CANCELLED, AUDIT_TERMINAL_STATUSES
from app.core.config.llm_scraper import PRODUCTS
from app.core.security import decrypt_secret
from app.domain.audits.cost_projection import normalize_optional_non_negative_int
from app.models.audit import Audit, AuditTask
from app.models.provider import ProviderConnection

logger = logging.getLogger("app.workers.audit_worker")


def uses_scraper_recovery(task: AuditTask) -> bool:
    return task.logical_engine in PRODUCTS and bool(task.provider_submission_ref)


def recovery_deadline(task: AuditTask) -> datetime | None:
    if task.logical_engine not in PRODUCTS or task.provider_task_submitted_at is None:
        return None
    hours = (task.request_snapshot or {}).get(
        "recovery_deadline_hours",
        dataforseo_config.dataforseo_settings.recovery_deadline_hours,
    )
    return task.provider_task_submitted_at + timedelta(hours=hours)


def _audit_is_closed(audit: Audit) -> bool:
    """True when nothing more should be done for this run."""
    return audit.status == AUDIT_STATUS_CANCELLED or (
        audit.status in AUDIT_TERMINAL_STATUSES
    )


def _context_is_owned(task: AuditTask, audit: Audit, owner: str, now: datetime) -> bool:
    return (
        task.audit_id == audit.id
        and task.workspace_id == audit.workspace_id
        and task.lease_owner == owner
        and task.lease_expires_at is not None
        and task.lease_expires_at > now
        and not _audit_is_closed(audit)
    )


def _context_metadata(task: AuditTask) -> dict[str, Any]:
    metadata = task.provider_metadata or {}
    request = task.request_snapshot or {}
    route = task.provider_route_snapshot or {}
    return {
        "reconciliation": metadata.get("reconciliation"),
        "request_settings": request.get("request_settings"),
        "base_url": str(route.get("base_url") or ""),
    }


def _frozen_search_context(snapshot: dict[str, Any] | None) -> dict[str, Any]:
    """The search context FROZEN at admission, never the live project.

    Falling back here covers a task frozen before the context existed; a task
    admitted since carries the real values, because admission refuses to plan
    one without them.
    """
    frozen = dict(snapshot or {})
    return {
        "location_code": int(
            frozen.get("location_code") or dataforseo_config.DEFAULT_LOCATION_CODE
        ),
        "language_code": str(
            frozen.get("language_code") or dataforseo_config.DEFAULT_LANGUAGE_CODE
        ),
        "device": str(frozen.get("device") or dataforseo_config.DEFAULT_DEVICE),
    }


async def _bound_credential(
    session: AsyncSession,
    *,
    connection_id: uuid.UUID | None,
    revision: uuid.UUID | None,
    workspace_id: uuid.UUID,
) -> tuple[str, uuid.UUID | None]:
    """The bound account's secret, and the revision the task is pinned to.

    On a FIRST submission the task carries no revision yet, so the connection's
    current one is captured and returned to be bound — that is what makes a
    later rotation detectable rather than silent.
    """
    if connection_id is None:
        return "", revision
    connection = await session.get(ProviderConnection, connection_id)
    if connection is not None and connection.workspace_id != workspace_id:
        return "", revision
    secret = _usable_secret(connection, revision)
    if revision is None and connection is not None:
        revision = connection.credential_revision
    return secret, revision


# --- Plain helpers --------------------------------------------------------


@dataclass(frozen=True, slots=True, kw_only=True)
class _SearchContext:
    """One phase's frozen view of a task. Deliberately carries no session.

    The search context is what was FROZEN at admission, not what the project
    is configured for now: a queued execution must never re-read mutable
    settings, or a location change would silently rewrite what past runs are
    reported to have measured.
    """

    task_id: uuid.UUID
    audit_id: uuid.UUID
    prompt_text: str
    idempotency_key: str
    submission_ref: str
    provider_task_id: str
    poll_count: int
    connection_id: uuid.UUID | None
    credential_revision: uuid.UUID | None
    secret: str
    base_url: str
    location_code: int
    language_code: str
    device: str
    logical_engine: str = "google_ai_overview"
    submitted_at: datetime | None = None
    reconciliation: dict[str, Any] | None = None
    request_settings: dict[str, Any] | None = None


def _submission_ref(idempotency_key: str) -> str:
    """A stable correlation identifier derived from the task's own identity.

    Derived rather than random so the same task always produces the same ref:
    a reconciliation sweep can then recognise a submission even if the local
    row was reconstructed. Capped to the provider's tag limit, because a
    truncated tag would not match on the way back.
    """
    return idempotency_key[: dataforseo_config.TAG_MAX_CHARS]


def _listed_rows(listing: dict[str, Any]) -> list[dict[str, Any]]:
    """Every task row in an id-list response, with the envelope flattened."""
    rows: list[dict[str, Any]] = []
    for task in listing.get("tasks") or []:
        if not isinstance(task, dict):
            continue
        rows.extend(row for row in (task.get("result") or []) if isinstance(row, dict))
    return rows


def _row_tag(row: dict[str, Any]) -> str:
    """The correlation tag a listed row carries, or "" if it carries none.

    The tag lives in ``metadata`` and nowhere else on this endpoint, so a row
    listed without metadata simply cannot be identified.
    """
    metadata = row.get("metadata")
    return str(metadata.get("tag") or "") if isinstance(metadata, dict) else ""


def _match_by_tag(listing: dict[str, Any], submission_ref: str) -> str | None:
    """The provider task whose tag EQUALS ours, or nothing.

    Nothing else is accepted, and ambiguity is not resolved by picking one:
    two provider tasks carrying our tag means we cannot say which observation
    is ours, and guessing would attach a real AI Overview to the wrong
    repetition without ever failing loudly.
    """
    if not submission_ref:
        return None
    matches = [
        task_id
        for row in _listed_rows(listing)
        if _row_tag(row) == submission_ref
        and (task_id := str(row.get("id") or "").strip())
    ]
    return matches[0] if len(matches) == 1 else None


def _provider_refusal(exc: ProviderError) -> SearchSurfaceResult:
    """A non-retryable provider refusal.

    ``provider_status_code`` stays null on purpose: a transport-level refusal
    never produced a task status, and inventing one would put a number in the
    evidence that the provider never said.
    """
    logger.info(
        "search surface refused by provider",
        extra={"error_code": exc.error_code},
    )
    return SearchSurfaceResult(outcome=OUTCOME_PROVIDER_ERROR)


def _citation_rows(result: SearchSurfaceResult) -> list[dict[str, Any]]:
    """Root references in the shape the existing scorer already consumes.

    Same keys as the LLM path's serialisation, so ``analyze_task`` needs no
    knowledge that this surface exists.
    """
    return [
        {
            "ordinal": index,
            "url": reference.url,
            "domain": reference.domain,
            "title": reference.title,
            "start_index": None,
            "end_index": None,
            "cited_text": "",
        }
        for index, reference in enumerate(result.references)
    ]


def _task_metadata(task: AuditTask, result: SearchSurfaceResult) -> dict[str, Any]:
    """Merge the observation's provenance into the task's provider metadata."""
    metadata = dict(task.provider_metadata or {})
    metadata.update(
        {
            "search_surface_outcome": result.outcome,
            "provider_status_code": result.provider_status_code,
            "aio_serp_position": result.aio_serp_position,
            "aio_markdown": result.aio_markdown,
        }
    )
    if result.provider_cost_microusd is not None:
        metadata["provider_reported_cost_microusd"] = result.provider_cost_microusd
    return metadata


def _surface_usage(
    task: AuditTask, result: SearchSurfaceResult
) -> dict[str, Any] | None:
    """What the provider charged for this task, in the shape the ledger reads.

    The route is flat-fee and priced per task, so there is no token usage to
    carry -- only the real charge. That charge is ONE number reported twice:
    DataForSEO bills at submission, and the retrieval echoes the same task's
    cost back rather than adding a second one. Summing them would bill every
    observation double.

    The submission figure wins. It is the moment the money actually moved,
    and it is recorded even for a task whose retrieval never lands -- the
    retrieval echo only stands in when no submission figure was captured.

    None when neither reported anything. A fabricated zero would be
    indistinguishable from a real zero-cost report and would overstate how
    much of the bill is known.
    """
    submitted = normalize_optional_non_negative_int(
        (task.provider_metadata or {}).get("provider_submission_cost_microusd")
    )
    charge = submitted if submitted is not None else result.provider_cost_microusd
    if charge is None:
        return None
    return {"provider_cost_microusd": charge}


def _frozen_connection_id(route: dict[str, Any]) -> uuid.UUID | None:
    raw = route.get("connection_id")
    if not raw:
        return None
    try:
        return uuid.UUID(str(raw))
    except (TypeError, ValueError):
        return None


def _usable_secret(
    connection: ProviderConnection | None, revision: uuid.UUID | None
) -> str:
    """The bound connection's secret, or "" if it may no longer be used.

    Rotated, paused or deactivated all mean the same thing here: the account
    that owns the outstanding task is no longer available, and polling a
    different one would be wrong rather than merely unlucky.
    """
    if connection is None or not connection.active or connection.paused_at is not None:
        return ""
    if revision is not None and connection.credential_revision != revision:
        return ""
    if not connection.api_key_encrypted:
        return ""
    try:
        return decrypt_secret(connection.api_key_encrypted)
    except Exception:  # noqa: BLE001 - an unreadable secret is an unusable one
        logger.warning("bound search-surface credential could not be decrypted")
        return ""
