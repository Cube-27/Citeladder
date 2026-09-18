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
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.connectors.answer_engines.errors import ProviderError
from app.connectors.search_surfaces.contracts import (
    OUTCOME_PROVIDER_ERROR,
    SearchSurfaceResult,
)
from app.core.config import dataforseo as dataforseo_config
from app.core.config.audits import AUDIT_STATUS_CANCELLED, AUDIT_TERMINAL_STATUSES
from app.core.security import decrypt_secret
from app.models.audit import Audit, AuditTask
from app.models.provider import ProviderConnection

logger = logging.getLogger("app.workers.audit_worker")


def _audit_is_closed(audit: Audit) -> bool:
    """True when nothing more should be done for this run."""
    return audit.status == AUDIT_STATUS_CANCELLED or (
        audit.status in AUDIT_TERMINAL_STATUSES
    )


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
) -> tuple[str, uuid.UUID | None]:
    """The bound account's secret, and the revision the task is pinned to.

    On a FIRST submission the task carries no revision yet, so the connection's
    current one is captured and returned to be bound — that is what makes a
    later rotation detectable rather than silent.
    """
    if connection_id is None:
        return "", revision
    connection = await session.get(ProviderConnection, connection_id)
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
