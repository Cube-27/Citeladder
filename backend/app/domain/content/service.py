# Content-generation domain service (workspace-scoped, invariant 5).
#
# Owns enqueue (race-safe workspace-scoped idempotency + provider-config
# check + frozen website-context/message snapshots), the bounded history
# list, detail, cancel, regenerate (context rebuilt) and try-again (frozen
# snapshot reused). Every query filters by the caller's workspace; a record
# in another workspace is indistinguishable from a missing one (404).
#
# The provider API key never appears here — the worker resolves it at call
# time from config (invariant 6).
from __future__ import annotations

import hashlib
import json
import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config.abuse import abuse_settings
from app.core.config.app_models import APP_FEATURE_CONTENT
from app.core.config.content import (
    CONTENT_DEFAULT_SKILL,
    CONTENT_FEEDBACK_REASONS,
    CONTENT_GENERATOR_VERSION,
    CONTENT_LIST_MAX_LIMIT,
    FEEDBACK_ACCEPTED,
    FEEDBACK_REJECTED,
    skill_version,
)
from app.core.config.entitlements import KEY_AI_CREDITS
from app.core.config.task_queue import (
    TASK_ACTIVE_STATUSES,
    TASK_STATUS_CANCELLED,
    TASK_STATUS_SUCCEEDED,
    TASK_TERMINAL_STATUSES,
)
from app.domain.abuse.service import reserve_workspace_capacity
from app.domain.billing.catalog_revisions import (
    CatalogUnavailableError,
    published_ai_credit_policy,
)
from app.domain.content.context_builder import (
    ContentContext,
    ContentContextConflictError,
    ContentContextNotFoundError,
    build_content_context,
)
from app.domain.content.message_builder import build_messages
from app.domain.content.schemas import (
    ContentContextSummary,
    ContentGenerationDetail,
    ContentGenerationListItem,
    ContentTargetPage,
    SiteHealthReference,
    instruction_preview,
)
from app.domain.content.website_context import select_crawl_fragments
from app.domain.entitlements.metered import MeteredSubject, reserve_metered_usage
from app.domain.providers.app_routes import (
    AppModelRouteUnavailableError,
    has_configured_app_model_route,
    resolve_app_model_route,
)
from app.models.content import ContentGeneration
from app.models.project import Project


class ContentGenerationNotFoundError(LookupError):
    """Record/project missing or owned by another workspace (-> 404)."""


class ProviderNotConfiguredError(RuntimeError):
    """The content provider key is not configured (-> 409)."""


class IdempotencyConflictError(RuntimeError):
    """Same idempotency key, different request fingerprint (-> 409)."""


class ContentGenerationConflictError(RuntimeError):
    """Authorized origins selected mutually incompatible target pages."""


class CancelNotAllowedError(RuntimeError):
    """Cancel requested on a terminal record (-> 409)."""


class DeleteNotAllowedError(RuntimeError):
    """Deletion requested on an active record (-> 409)."""


async def _reserve_content_capacity(
    session: AsyncSession, *, workspace_id: uuid.UUID
) -> None:
    await reserve_workspace_capacity(
        session,
        workspace_id=workspace_id,
        lock_namespace="content-enqueue",
        model=ContentGeneration,
        active_statuses=TASK_ACTIVE_STATUSES,
        active_limit=abuse_settings.active_content_jobs_per_workspace,
        active_operation="content.active_jobs",
        usage_operation="content.provider_jobs",
        usage_limit=abuse_settings.content_jobs_per_workspace_daily,
        retry_after_seconds=abuse_settings.active_job_retry_after_seconds,
    )


def request_fingerprint(
    *,
    project_id: uuid.UUID,
    user_instruction: str,
    skill_id: str = CONTENT_DEFAULT_SKILL,
    target_site_url_id: uuid.UUID | None = None,
    target_url: str | None = None,
    opportunity_id: uuid.UUID | None = None,
    demand_signal_id: uuid.UUID | None = None,
    site_health_reference: dict | None = None,
) -> str:
    """Stable comparator for idempotency replay-vs-conflict decisions."""
    canonical = "\x1f".join(
        [
            str(project_id),
            user_instruction.strip(),
            skill_id,
            _optional_uuid(target_site_url_id),
            (target_url or "").strip(),
            _optional_uuid(opportunity_id),
            _optional_uuid(demand_signal_id),
            json.dumps(
                site_health_reference or {}, sort_keys=True, separators=(",", ":")
            ),
        ]
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _optional_uuid(value: uuid.UUID | None) -> str:
    return "" if value is None else str(value)


async def _project_in_workspace(
    session: AsyncSession, *, workspace_id: uuid.UUID, project_id: uuid.UUID
) -> Project:
    project = await session.scalar(
        select(Project).where(
            Project.id == project_id,
            Project.workspace_id == workspace_id,
        )
    )
    if project is None:
        raise ContentGenerationNotFoundError("Project not found")
    return project


def _summary_dto(row: ContentGeneration) -> ContentContextSummary:
    """Bounded public provenance: counts and URLs, never the rendered blocks."""
    snapshot = row.context_snapshot or {}
    summary = snapshot.get("summary") or {}
    target_url = summary.get("target_url")
    return ContentContextSummary(
        version=str(snapshot.get("version", "")),
        crawl_page_count=int(summary.get("crawl_page_count", 0)),
        crawl_urls=_string_list(summary.get("crawl_urls")),
        crawl_completed_at=summary.get("crawl_completed_at"),
        brand_memory=bool(summary.get("brand_memory")),
        brand_fields=_string_list(summary.get("brand_fields")),
        target_url=str(target_url) if target_url else None,
        issue_count=int(summary.get("issue_count", 0)),
        related_page_count=int(summary.get("related_page_count", 0)),
        omissions=list(summary.get("omissions", [])),
    )


def _string_list(value: object) -> list[str]:
    return [str(item) for item in value] if isinstance(value, list) else []


def to_list_item(row: ContentGeneration) -> ContentGenerationListItem:
    item = ContentGenerationListItem.model_validate(row)
    item.instruction_preview = instruction_preview(row.user_instruction)
    return item


def to_detail(row: ContentGeneration) -> ContentGenerationDetail:
    payload = {
        field_name: getattr(row, field_name)
        for field_name in ContentGenerationDetail.model_fields
        if field_name not in {"instruction_preview", "context_summary"}
    }
    payload["instruction_preview"] = instruction_preview(row.user_instruction)
    payload["context_summary"] = _summary_dto(row)
    return ContentGenerationDetail.model_validate(payload)


def _insert_generation(
    session: AsyncSession,
    *,
    row: ContentGeneration,
    context: ContentContext,
) -> ContentGeneration:
    messages, digest, message_snapshot = build_messages(
        user_instruction=row.user_instruction,
        context=context,
        skill_id=row.skill_id,
    )
    # ``messages`` itself is never persisted — the worker rebuilds it from the
    # frozen instruction + snapshot; only the digest + safe snapshot are stored.
    del messages
    row.context_status = context.status
    row.context_snapshot = context.snapshot()
    row.message_digest = digest
    row.message_snapshot = message_snapshot
    # Resolved HERE, from the same registry read that just produced the body
    # above, rather than passed in by the caller. ``build_messages`` renders
    # whatever pack is deployed when it runs, so a version stamped anywhere
    # else can name a body that was never sent — and because the digest is
    # computed over the messages actually built, it would agree with itself
    # and hide the mismatch. ``try_again`` in particular used to copy the
    # ORIGINAL row's version onto a retry rendered from today's pack, claiming
    # old provenance for new instructions.
    row.skill_version = skill_version(row.skill_id)
    session.add(row)
    return row


async def _billing_account_id(
    session: AsyncSession, *, workspace_id: uuid.UUID
) -> uuid.UUID:
    from app.models.billing import WorkspaceBillingLink

    account_id = await session.scalar(
        select(WorkspaceBillingLink.billing_account_id).where(
            WorkspaceBillingLink.workspace_id == workspace_id
        )
    )
    if account_id is None:
        raise ProviderNotConfiguredError("workspace funding sponsor is unavailable")
    return account_id


async def _admitted_customer_route(session: AsyncSession, *, workspace_id: uuid.UUID):
    try:
        return await resolve_app_model_route(
            session,
            workspace_id=workspace_id,
            feature=APP_FEATURE_CONTENT,
            at=datetime.now(UTC),
        )
    except AppModelRouteUnavailableError as exc:
        if await has_configured_app_model_route(
            session, workspace_id=workspace_id, feature=APP_FEATURE_CONTENT
        ):
            raise ProviderNotConfiguredError(
                "The configured customer Content model route is unavailable"
            ) from exc
        return None


async def _apply_funding(
    session: AsyncSession, *, row: ContentGeneration, route
) -> None:
    if route is not None:
        row.provider = "customer_byok"
        row.requested_model = route.model
        row.funding_source = "customer_byok"
        row.route_id = route.route_id
        row.connection_id = route.connection_id
        row.route_revision = route.route_revision
        row.credential_revision = route.credential_revision
        return
    try:
        revision, policy = await published_ai_credit_policy(session)
    except CatalogUnavailableError as exc:
        raise ProviderNotConfiguredError(
            "platform AI-credit policy is unavailable"
        ) from exc
    from app.core.config.content import content_settings

    rate = policy.rate(
        feature=APP_FEATURE_CONTENT, model=content_settings.resolved_model
    )
    if rate is None:
        raise ProviderNotConfiguredError(
            "platform model has no published AI-credit rate"
        )
    reservation = await reserve_metered_usage(
        session,
        account_id=await _billing_account_id(session, workspace_id=row.workspace_id),
        capability_key=KEY_AI_CREDITS,
        subject=MeteredSubject(
            kind="content", subject_id=row.id, workspace_id=row.workspace_id
        ),
        hold_units=rate.call_credit_cap,
        idempotency_key=f"content:{row.id}:hold",
        at=datetime.now(UTC),
    )
    row.provider = "platform"
    row.requested_model = content_settings.resolved_model
    row.funding_source = "platform"
    row.policy_revision = revision
    row.reservation_id = reservation.reservation_id
    row.customer_charge_cap = rate.call_credit_cap


async def enqueue_generation(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    user_instruction: str,
    idempotency_key: str = "",
    skill_id: str = CONTENT_DEFAULT_SKILL,
    target_site_url_id: uuid.UUID | None = None,
    target_url: str | None = None,
    opportunity_id: uuid.UUID | None = None,
    demand_signal_id: uuid.UUID | None = None,
    site_health_reference: SiteHealthReference | None = None,
) -> tuple[ContentGeneration, bool]:
    """Enqueue one generation. Returns ``(row, created)``.

    ``created`` is False on an idempotent replay (same workspace key + same
    fingerprint). A same-key different-fingerprint request raises
    ``IdempotencyConflictError``; a concurrent same-key insert converges via
    the IntegrityError reload/compare path.
    """
    await _project_in_workspace(
        session, workspace_id=workspace_id, project_id=project_id
    )

    reference_dict = (
        site_health_reference.model_dump(mode="json") if site_health_reference else None
    )
    fingerprint = request_fingerprint(
        project_id=project_id,
        user_instruction=user_instruction,
        skill_id=skill_id,
        target_site_url_id=target_site_url_id,
        target_url=target_url,
        opportunity_id=opportunity_id,
        demand_signal_id=demand_signal_id,
        site_health_reference=reference_dict,
    )
    # A server-side key when the client sent none: the composite constraint is
    # always satisfied and keyless requests never collide with each other.
    key = idempotency_key or str(uuid.uuid4())

    # Replay before the provider-config check: a retry of an already-accepted
    # request must stay retrievable even if the provider was unconfigured (or
    # broken) in between.
    existing = await _idempotent_replay(
        session,
        workspace_id=workspace_id,
        idempotency_key=idempotency_key,
        key=key,
        fingerprint=fingerprint,
    )
    if existing is not None:
        return existing, False

    try:
        context = await build_content_context(
            session,
            workspace_id=workspace_id,
            project_id=project_id,
            user_instruction=user_instruction,
            target_site_url_id=target_site_url_id,
            target_url=target_url or "",
            opportunity_id=opportunity_id,
            demand_signal_id=demand_signal_id,
            site_health_reference=site_health_reference,
        )
    except ContentContextNotFoundError as exc:
        raise ContentGenerationNotFoundError(str(exc)) from exc
    except ContentContextConflictError as exc:
        raise ContentGenerationConflictError(str(exc)) from exc

    app_route = await _admitted_customer_route(session, workspace_id=workspace_id)
    await _reserve_content_capacity(session, workspace_id=workspace_id)

    row = _insert_generation(
        session,
        row=ContentGeneration(
            workspace_id=workspace_id,
            project_id=project_id,
            user_instruction=user_instruction,
            idempotency_key=key,
            request_fingerprint=fingerprint,
            skill_id=skill_id,
            target_site_url_id=target_site_url_id,
            target_url=(target_url or "").strip(),
            opportunity_id=opportunity_id,
            demand_signal_id=demand_signal_id,
            site_health_reference=reference_dict,
            # `skill_version` is stamped by `_insert_generation`, from the same
            # registry read that renders the body. The skill catalog and the
            # generator version move independently: a reworded directive
            # changes what was asked for even when the generator is untouched,
            # so provenance records both.
            provider="pending",
            requested_model="pending",
            generator_version=CONTENT_GENERATOR_VERSION,
        ),
        context=context,
    )
    await _apply_funding(session, row=row, route=app_route)
    winner = await _commit_generation(
        session, workspace_id=workspace_id, key=key, fingerprint=fingerprint
    )
    if winner is not None:
        return winner, False
    await session.refresh(row)
    return row, True


async def _idempotent_replay(
    session, *, workspace_id, idempotency_key, key, fingerprint
):
    if not idempotency_key:
        return None
    existing = await session.scalar(
        select(ContentGeneration).where(
            ContentGeneration.workspace_id == workspace_id,
            ContentGeneration.idempotency_key == key,
        )
    )
    if existing is None:
        return None
    if existing.request_fingerprint == fingerprint:
        return existing
    raise IdempotencyConflictError(
        "idempotency key was already used with a different request"
    )


async def _commit_generation(session, *, workspace_id, key, fingerprint):
    try:
        await session.commit()
        return None
    except IntegrityError as exc:
        await session.rollback()
        winner = await session.scalar(
            select(ContentGeneration).where(
                ContentGeneration.workspace_id == workspace_id,
                ContentGeneration.idempotency_key == key,
            )
        )
        if winner is None:
            raise exc
        if winner.request_fingerprint == fingerprint:
            return winner
        raise IdempotencyConflictError(
            "idempotency key was already used with a different request"
        ) from None


async def list_generations(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    limit: int,
) -> list[ContentGeneration]:
    """The project's generations, newest first, bounded (authorizes first)."""
    await _project_in_workspace(
        session, workspace_id=workspace_id, project_id=project_id
    )
    capped = max(1, min(limit, CONTENT_LIST_MAX_LIMIT))
    rows = await session.scalars(
        select(ContentGeneration)
        .where(
            ContentGeneration.workspace_id == workspace_id,
            ContentGeneration.project_id == project_id,
            ContentGeneration.archived_at.is_(None),
        )
        .order_by(
            ContentGeneration.created_at.desc(),
            ContentGeneration.id.desc(),
        )
        .limit(capped)
    )
    return list(rows.all())


async def context_preview(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    target_site_url_id: uuid.UUID | None = None,
    target_url: str | None = None,
    opportunity_id: uuid.UUID | None = None,
    demand_signal_id: uuid.UUID | None = None,
    site_health_reference: SiteHealthReference | None = None,
) -> dict:
    """Build the canonical persisted context and expose only its compact summary."""
    try:
        context = await build_content_context(
            session,
            workspace_id=workspace_id,
            project_id=project_id,
            user_instruction="",
            target_site_url_id=target_site_url_id,
            target_url=target_url or "",
            opportunity_id=opportunity_id,
            demand_signal_id=demand_signal_id,
            site_health_reference=site_health_reference,
        )
    except ContentContextNotFoundError as exc:
        raise ContentGenerationNotFoundError(str(exc)) from exc
    except ContentContextConflictError as exc:
        raise ContentGenerationConflictError(str(exc)) from exc
    summary = context.summary
    return {
        "brand_memory": bool(summary.get("brand_memory")),
        "target_page": str(summary.get("target_page") or "") or None,
        "issue_count": int(summary.get("issue_count") or 0),
        "related_page_count": int(summary.get("related_page_count") or 0),
    }


async def list_target_pages(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    query: str = "",
) -> list[ContentTargetPage]:
    """Search the newest usable persisted crawl; never crawl on a read."""
    await _project_in_workspace(
        session, workspace_id=workspace_id, project_id=project_id
    )
    selection = await select_crawl_fragments(
        session,
        workspace_id=workspace_id,
        project_id=project_id,
        query_text=query,
    )
    return [
        ContentTargetPage(
            site_url_id=page["site_url_id"],
            title=page["title"],
            url=page["final_url"],
            display_url=page["final_url"],
            page_kind=page["page_kind"],
        )
        for page in selection.pages
    ]


async def get_generation(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    generation_id: uuid.UUID,
) -> ContentGeneration:
    row = await session.scalar(
        select(ContentGeneration).where(
            ContentGeneration.id == generation_id,
            ContentGeneration.workspace_id == workspace_id,
            ContentGeneration.archived_at.is_(None),
        )
    )
    if row is None:
        raise ContentGenerationNotFoundError("Content generation not found")
    return row


async def cancel_generation(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    generation_id: uuid.UUID,
) -> ContentGeneration:
    """Cooperative cancel: allowed for any non-terminal status.

    Sets ``cancelled`` + clears the lease under ``FOR UPDATE`` so a worker's
    later terminal write (which re-checks owner + status under its own lock)
    discards the in-flight result (invariant 3/9).
    """
    locked = await session.scalar(
        select(ContentGeneration)
        .where(
            ContentGeneration.id == generation_id,
            ContentGeneration.workspace_id == workspace_id,
        )
        .with_for_update()
    )
    if locked is None:
        raise ContentGenerationNotFoundError("Content generation not found")
    if locked.status in TASK_TERMINAL_STATUSES:
        # Capture before rollback: rollback expires the instance and a later
        # attribute access would trigger sync lazy-loading (MissingGreenlet).
        terminal_status = locked.status
        await session.rollback()
        raise CancelNotAllowedError(f"cannot cancel a {terminal_status} generation")
    locked.status = TASK_STATUS_CANCELLED
    locked.lease_owner = None
    locked.lease_expires_at = None
    locked.completed_at = datetime.now(UTC)
    if not locked.error_code:
        locked.error_code = "cancelled"
    await session.commit()
    await session.refresh(locked)
    return locked


async def delete_generation(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    generation_id: uuid.UUID,
) -> None:
    """Archive/redact one terminal generation while retaining provenance."""
    locked = await session.scalar(
        select(ContentGeneration)
        .where(
            ContentGeneration.id == generation_id,
            ContentGeneration.workspace_id == workspace_id,
        )
        .with_for_update()
    )
    if locked is None:
        raise ContentGenerationNotFoundError("Content generation not found")
    if locked.status not in TASK_TERMINAL_STATUSES:
        active_status = locked.status
        await session.rollback()
        raise DeleteNotAllowedError(
            f"cannot delete an active {active_status} generation"
        )
    _archive_generation(locked)
    await session.commit()


def _archive_generation(row: ContentGeneration) -> None:
    row.archived_at = datetime.now(UTC)
    row.user_instruction = "[redacted]"
    row.context_snapshot = {}
    row.message_snapshot = None
    row.output_text = None
    row.request_snapshot = None
    row.error_detail = ""


async def clear_terminal_generations(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
) -> None:
    """Archive terminal history for one project, retaining financial identity."""
    await _project_in_workspace(
        session, workspace_id=workspace_id, project_id=project_id
    )
    rows = await session.scalars(
        select(ContentGeneration)
        .where(
            ContentGeneration.workspace_id == workspace_id,
            ContentGeneration.project_id == project_id,
            ContentGeneration.status.in_(TASK_TERMINAL_STATUSES),
            ContentGeneration.archived_at.is_(None),
        )
        .with_for_update()
    )
    for row in rows:
        _archive_generation(row)
    await session.commit()


async def regenerate(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    generation_id: uuid.UUID,
) -> ContentGeneration:
    """New record from an existing one, context REBUILT from the newest
    eligible crawl. The original is never mutated."""
    source = await get_generation(
        session, workspace_id=workspace_id, generation_id=generation_id
    )
    row, _created = await enqueue_generation(
        session,
        workspace_id=workspace_id,
        project_id=source.project_id,
        user_instruction=source.user_instruction,
        skill_id=source.skill_id,
        target_site_url_id=source.target_site_url_id,
        target_url=source.target_url,
        opportunity_id=source.opportunity_id,
        demand_signal_id=source.demand_signal_id,
        site_health_reference=(
            SiteHealthReference.model_validate(source.site_health_reference)
            if source.site_health_reference
            else None
        ),
    )
    return row


async def try_again(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    generation_id: uuid.UUID,
) -> ContentGeneration:
    """New record re-using the source's exact frozen context snapshot
    (reproducible; no rebuild). The original is never mutated."""
    source = await get_generation(
        session, workspace_id=workspace_id, generation_id=generation_id
    )
    app_route = await _admitted_customer_route(session, workspace_id=workspace_id)
    await _reserve_content_capacity(session, workspace_id=workspace_id)
    frozen = ContentContext.from_snapshot(source.context_snapshot or {})
    fingerprint = request_fingerprint(
        project_id=source.project_id,
        user_instruction=source.user_instruction,
        skill_id=source.skill_id,
        target_site_url_id=source.target_site_url_id,
        target_url=source.target_url,
        opportunity_id=source.opportunity_id,
        demand_signal_id=source.demand_signal_id,
        site_health_reference=source.site_health_reference,
    )
    row = _insert_generation(
        session,
        row=ContentGeneration(
            workspace_id=workspace_id,
            project_id=source.project_id,
            user_instruction=source.user_instruction,
            idempotency_key=str(uuid.uuid4()),
            request_fingerprint=fingerprint,
            skill_id=source.skill_id,
            target_site_url_id=source.target_site_url_id,
            target_url=source.target_url,
            opportunity_id=source.opportunity_id,
            demand_signal_id=source.demand_signal_id,
            site_health_reference=source.site_health_reference,
            # NOT copied from `source`: the retry is rendered from whatever
            # pack is deployed now, so `_insert_generation` stamps the version
            # that actually produced it.
            provider="pending",
            requested_model="pending",
            generator_version=CONTENT_GENERATOR_VERSION,
        ),
        context=frozen,
    )
    await _apply_funding(session, row=row, route=app_route)
    await session.commit()
    await session.refresh(row)
    return row


async def record_feedback(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    generation_id: uuid.UUID,
    feedback: str,
    reason: str = "",
) -> ContentGeneration:
    """Record an immutable accepted/rejected reaction on completed output.

    ``reason`` is an optional rejection category from the fixed vocabulary; it
    is meaningless on an acceptance and ignored there.
    """
    row = await session.scalar(
        select(ContentGeneration)
        .where(
            ContentGeneration.id == generation_id,
            ContentGeneration.workspace_id == workspace_id,
        )
        .with_for_update()
    )
    if row is None:
        raise ContentGenerationNotFoundError("Content generation not found")
    if feedback not in {FEEDBACK_ACCEPTED, FEEDBACK_REJECTED}:
        raise ValueError("unknown content feedback")
    if reason and reason not in CONTENT_FEEDBACK_REASONS:
        raise ValueError("unknown content feedback reason")
    if row.status != TASK_STATUS_SUCCEEDED or not row.output_text:
        raise ValueError("only completed content can be reviewed")
    if row.feedback is not None and row.feedback != feedback:
        raise ValueError("content feedback cannot be changed once recorded")
    if row.feedback == feedback:
        await session.commit()
        return row
    row.feedback = feedback
    row.feedback_reason = reason if feedback == FEEDBACK_REJECTED else ""
    row.feedback_at = datetime.now(UTC)
    await session.commit()
    await session.refresh(row)
    return row
