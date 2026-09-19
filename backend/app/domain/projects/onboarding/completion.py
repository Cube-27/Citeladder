"""Accepted onboarding completion and worker-side project creation."""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config.brand_discovery import (
    DISCOVERY_PROGRESS_TOTAL_STEPS,
    DISCOVERY_STATUS_COMPLETING,
    DISCOVERY_STATUS_PROJECT_CREATED,
    DISCOVERY_STATUS_READY,
    TASK_KIND_BRAND_COMPLETION,
    brand_discovery_settings,
)
from app.domain.projects.discovery_schemas import BrandDiscoveryComplete
from app.domain.projects.offering_harvest import OfferingHarvest, OfferingNode
from app.domain.projects.onboarding.normalization import (
    InvalidWebsiteUrl,
    normalize_website_url,
)
from app.domain.projects.onboarding.service import (
    IDEMPOTENCY_KEY_REQUIRED,
    BrandDiscoveryError,
    _confirmed_domains,
    _confirmed_portfolio_inputs,
    _generate_confirmed_portfolio,
    _persist_generated_prompts,
    _persist_project_shell,
    _progress,
    get_discovery,
)
from app.domain.projects.onboarding.site_resolution import (
    SiteNotFoundError,
    resolve_site,
)
from app.models.discovery import (
    BrandDiscovery,
    BrandDiscoveryTask,
    BrandResearchSnapshot,
)
from app.models.site_health.crawl import SiteCrawl


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
    if row.status == DISCOVERY_STATUS_COMPLETING:
        await _ensure_completion_task(session, row=row, workspace_id=row.workspace_id)
        await session.commit()
    existing_crawl = (
        await session.get(SiteCrawl, row.initial_crawl_id)
        if row.initial_crawl_id is not None
        else None
    )
    return row, existing_crawl


async def _ensure_completion_task(
    session: AsyncSession, *, row: BrandDiscovery, workspace_id: uuid.UUID
) -> None:
    task = await session.scalar(
        select(BrandDiscoveryTask)
        .where(
            BrandDiscoveryTask.discovery_id == row.id,
            BrandDiscoveryTask.task_kind == TASK_KIND_BRAND_COMPLETION,
        )
        .with_for_update()
    )
    if task is None:
        session.add(
            BrandDiscoveryTask(
                discovery_id=row.id,
                workspace_id=workspace_id,
                task_kind=TASK_KIND_BRAND_COMPLETION,
                idempotency_key=f"brand-completion:{row.id}",
            )
        )
        await session.flush()


async def complete_discovery(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    discovery_id: uuid.UUID,
    payload: BrandDiscoveryComplete,
    idempotency_key: str,
    reviewer_id: uuid.UUID,
) -> tuple[BrandDiscovery, SiteCrawl | None]:
    """Freeze a confirmed review and enqueue its portfolio generation."""
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

    domains, competitors, _, _, profile_sources = _confirmed_portfolio_inputs(
        row, payload=payload
    )
    row.domains = domains
    row.competitors = competitors
    row.profile = payload.profile.model_dump()
    row.topics = []
    row.input_data = {
        **row.input_data,
        "completion_idempotency_key": key,
        "completion_payload": payload.model_dump(mode="json"),
        "completion_reviewer_id": str(reviewer_id),
    }
    row.status = DISCOVERY_STATUS_COMPLETING
    row.stage = "generating_prompts"
    row.error_code = ""
    row.error_detail = ""
    row.project_id = await _persist_project_shell(
        session,
        workspace_id=workspace_id,
        row=row,
        payload=payload,
        profile_sources=profile_sources,
    )
    await _ensure_completion_task(session, row=row, workspace_id=workspace_id)
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
                resolved = await resolve_site(domain, url)
                if resolved.registrable_domain != normalized:
                    raise SiteNotFoundError("domain_redirected")
            except (InvalidWebsiteUrl, SiteNotFoundError) as exc:
                raise BrandDiscoveryError(
                    f"Could not resolve website for {competitor.name}: {domain}"
                ) from exc


async def run_completion(session: AsyncSession, row: BrandDiscovery) -> None:
    """Generate the accepted portfolio and fill its committed project shell."""
    workspace_id = row.workspace_id
    discovery_id = row.id
    payload = BrandDiscoveryComplete.model_validate(
        row.input_data.get("completion_payload") or {}
    )
    (
        domains,
        competitors,
        brand_name,
        primary_market,
        _,
    ) = _confirmed_portfolio_inputs(row, payload=payload)
    harvest, page_evidence = await _topic_context(session, row=row)
    await session.commit()

    portfolio = await _generate_confirmed_portfolio(
        payload=payload,
        brand_name=brand_name,
        primary_market=primary_market,
        language_code=str(row.input_data.get("language_code") or ""),
        competitors=competitors,
        domains=domains,
        harvest=harvest,
        page_evidence=page_evidence,
    )
    row = await get_discovery(
        session,
        workspace_id=workspace_id,
        discovery_id=discovery_id,
        for_update=True,
    )
    if row.status == DISCOVERY_STATUS_PROJECT_CREATED:
        return
    row.domains = domains
    row.competitors = competitors
    row.profile = payload.profile.model_dump()
    row.topics = [topic.model_dump(mode="json") for topic in portfolio.topics]
    row.prompt_suggestions = list(portfolio.prompts)
    row.warnings = list(dict.fromkeys([*row.warnings, *portfolio.warnings]))
    await _persist_generated_prompts(
        session,
        workspace_id=workspace_id,
        row=row,
        prompts=list(portfolio.prompts),
        discovery_topics=list(portfolio.topics),
        prompt_provider=portfolio.provider,
        prompt_model=portfolio.model,
        intents=list(portfolio.intents),
    )
    row.status = DISCOVERY_STATUS_PROJECT_CREATED
    row.stage = "complete"
    row.progress = _progress(
        phase="complete",
        completed_steps=DISCOVERY_PROGRESS_TOTAL_STEPS,
        competitors_found=len(row.competitors),
        prompts_prepared=len(portfolio.prompts),
        previous=row.progress,
    )
    await session.commit()


async def _topic_context(
    session: AsyncSession, *, row: BrandDiscovery
) -> tuple[OfferingHarvest, list[dict[str, str]]]:
    fields = await _research_fields(session, row=row)
    return (
        _offering_harvest(fields.get("offerings")),
        _page_evidence(fields.get("evidence_manifest")),
    )


async def _research_fields(session: AsyncSession, *, row: BrandDiscovery) -> dict:
    snapshot = await session.scalar(
        select(BrandResearchSnapshot)
        .where(
            BrandResearchSnapshot.workspace_id == row.workspace_id,
            BrandResearchSnapshot.discovery_id == row.id,
        )
        .order_by(BrandResearchSnapshot.created_at.desc())
    )
    if snapshot is None or not isinstance(snapshot.extracted_fields, dict):
        return {}
    return snapshot.extracted_fields


def _offering_harvest(value: object) -> OfferingHarvest:
    items = value if isinstance(value, list) else []
    return OfferingHarvest(
        nodes=tuple(
            OfferingNode(
                ref=str(item.get("ref") or ""),
                label=str(item.get("label") or ""),
                path=str(item.get("path") or ""),
            )
            for item in items
            if isinstance(item, dict)
            and item.get("ref")
            and item.get("label")
            and item.get("path")
        )
    )


def _page_evidence(value: object) -> list[dict[str, str]]:
    items = value if isinstance(value, list) else []
    return [
        _page_evidence_item(item)
        for item in items
        if isinstance(item, dict) and item.get("evidence_ref")
    ]


def _page_evidence_item(item: dict) -> dict[str, str]:
    fields = {
        "evidence_ref": "evidence_ref",
        "url": "source_url",
        "title": "title",
        "source_kind": "source_kind",
        "provider": "provider",
        "query_ref": "query_ref",
        "acquired_at": "acquired_at",
    }
    serialized = {key: str(item.get(source) or "") for key, source in fields.items()}
    serialized["text"] = str(item.get("text") or "")[
        : brand_discovery_settings.topic_evidence_max_chars_per_page
    ]
    return serialized
