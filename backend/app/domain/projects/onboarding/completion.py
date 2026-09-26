"""Accepted onboarding completion: the project shell, created in one request."""

from __future__ import annotations

import asyncio
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config.brand_discovery import (
    DISCOVERY_PROGRESS_TOTAL_STEPS,
    DISCOVERY_STATUS_PROJECT_CREATED,
    DISCOVERY_STATUS_READY,
    LEGACY_DISCOVERY_STATUS_COMPLETING,
)
from app.core.config.brand_evidence import BRAND_EVIDENCE_TOTAL_TIMEOUT_SECONDS
from app.domain.projects.discovery_schemas import BrandDiscoveryComplete
from app.domain.projects.onboarding.normalization import (
    InvalidWebsiteUrl,
    normalize_website_url,
)
from app.domain.projects.onboarding.service import (
    IDEMPOTENCY_KEY_REQUIRED,
    BrandDiscoveryError,
    _confirmed_domains,
    _confirmed_inputs,
    _persist_project_shell,
    _progress,
    get_discovery,
)
from app.domain.projects.onboarding.site_resolution import (
    SiteNotFoundError,
    resolve_site,
)
from app.models.discovery import BrandDiscovery
from app.models.site_health.crawl import SiteCrawl


def finalize_project_shell(row: BrandDiscovery) -> None:
    """Mark a discovery whose project shell is committed as complete.

    Onboarding creates no prompts or topics: the project starts with an empty
    prompt set and the user chooses what to track. The caller holds the
    discovery lock and commits.
    """
    row.status = DISCOVERY_STATUS_PROJECT_CREATED
    row.stage = "complete"
    row.topics = []
    row.prompt_suggestions = []
    row.progress = _progress(
        phase="complete",
        completed_steps=DISCOVERY_PROGRESS_TOTAL_STEPS,
        competitors_found=len(row.competitors),
        prompts_prepared=0,
        previous=row.progress,
    )


async def _completion_replay(
    session: AsyncSession,
    *,
    row: BrandDiscovery,
    idempotency_key: str,
) -> tuple[BrandDiscovery, SiteCrawl | None] | None:
    existing_key = str(row.input_data.get("completion_idempotency_key") or "")
    if not existing_key:
        return None
    if existing_key != idempotency_key:
        raise BrandDiscoveryError(
            "Discovery was completed with another Idempotency-Key"
        )
    if row.status == LEGACY_DISCOVERY_STATUS_COMPLETING and row.project_id is not None:
        finalize_project_shell(row)
        await session.commit()
    existing_crawl = (
        await session.get(SiteCrawl, row.initial_crawl_id)
        if row.initial_crawl_id is not None
        else None
    )
    return row, existing_crawl


async def complete_discovery(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    discovery_id: uuid.UUID,
    payload: BrandDiscoveryComplete,
    idempotency_key: str,
    reviewer_id: uuid.UUID,
) -> tuple[BrandDiscovery, SiteCrawl | None]:
    """Freeze a confirmed review and create its project with no prompts."""
    key = idempotency_key.strip()
    if not key:
        raise BrandDiscoveryError(IDEMPOTENCY_KEY_REQUIRED)
    row = await get_discovery(
        session, workspace_id=workspace_id, discovery_id=discovery_id
    )
    if row.status == DISCOVERY_STATUS_READY and not row.input_data.get(
        "completion_idempotency_key"
    ):
        # The read transaction must end before any selected-domain network I/O.
        owned = set(_confirmed_domains(payload.domains))
        await session.commit()
        await _resolve_selected_competitors(payload, owned_domains=owned)
    row = await get_discovery(
        session,
        workspace_id=workspace_id,
        discovery_id=discovery_id,
        for_update=True,
    )
    replay = await _completion_replay(session, row=row, idempotency_key=key)
    if replay is not None:
        return replay
    if row.status != DISCOVERY_STATUS_READY:
        raise BrandDiscoveryError("Discovery is not ready for completion")

    domains, competitors, profile_sources = _confirmed_inputs(row, payload=payload)
    row.domains = domains
    row.competitors = competitors
    row.profile = payload.profile.model_dump()
    row.input_data = {
        **row.input_data,
        "completion_idempotency_key": key,
        "completion_payload": payload.model_dump(mode="json"),
        "completion_reviewer_id": str(reviewer_id),
    }
    row.error_code = ""
    row.error_detail = ""
    row.project_id = await _persist_project_shell(
        session,
        workspace_id=workspace_id,
        row=row,
        payload=payload,
        profile_sources=profile_sources,
    )
    finalize_project_shell(row)
    await session.commit()
    return row, None


async def _resolve_selected_competitors(
    payload: BrandDiscoveryComplete, *, owned_domains: set[str]
) -> None:
    for competitor in payload.competitors:
        if not competitor.domains:
            raise BrandDiscoveryError(
                f"Could not resolve website for {competitor.name}: add a domain"
            )
        for domain in competitor.domains:
            try:
                url, normalized = normalize_website_url(domain)
                if normalized in owned_domains:
                    raise SiteNotFoundError("owned_domain")
                async with asyncio.timeout(BRAND_EVIDENCE_TOTAL_TIMEOUT_SECONDS):
                    resolved = await resolve_site(domain, url)
                if resolved.registrable_domain != normalized:
                    raise SiteNotFoundError("domain_redirected")
            except (InvalidWebsiteUrl, SiteNotFoundError, TimeoutError) as exc:
                raise BrandDiscoveryError(
                    f"Could not resolve website for {competitor.name}: {domain}"
                ) from exc
