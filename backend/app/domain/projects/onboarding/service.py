"""Small orchestration layer for durable, failure-tolerant onboarding."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.analysis.normalization import normalize_alias
from app.connectors.web_evidence.url_policy import registrable_domain
from app.core.config.brand_discovery import (
    BRAND_DISCOVERY_VERSION,
    BUSINESS_TYPES,
    CAPTURE_METHOD_APPLICATION_MODEL,
    CAPTURE_METHOD_CRAWLER,
    CAPTURE_METHOD_USER,
    DISCOVERY_PROGRESS_TOTAL_STEPS,
    DISCOVERY_STATUS_FAILED,
    DISCOVERY_STATUS_READY,
    PRICE_TIERS,
    brand_discovery_settings,
)
from app.core.config.brand_profile import (
    BRAND_PROFILE_FIELDS,
    BRAND_PROFILE_REVIEW_UNREVIEWED,
    BRAND_PROFILE_SOURCE_AI_SUGGESTED,
)
from app.core.config.prompts import (
    ONBOARDING_PROMPT_SET_NAME,
    PROMPT_COHORT_BRAND_DIAGNOSTIC,
    PROMPT_COHORT_COMPARISON,
    PROMPT_COHORT_CORE,
)
from app.domain.projects.business_context import BusinessContext
from app.domain.projects.discovery_schemas import (
    BrandDiscoveryComplete,
    BrandDiscoveryCreate,
)
from app.domain.projects.onboarding.industry_library import (
    industry_context,
    industry_names,
    subindustries_by_industry,
)
from app.domain.projects.onboarding.normalization import (
    InvalidWebsiteUrl,
    normalize_primary_market,
    normalize_website_url,
)
from app.domain.projects.onboarding.research import research_brand
from app.domain.projects.onboarding.site_resolution import (
    SiteNotFoundError,
    resolve_site,
)
from app.domain.projects.schemas import BrandInput, CompetitorInput, ProjectCreate
from app.domain.projects.service import create_project
from app.models.discovery import (
    BrandDiscovery,
    BrandDiscoveryTask,
    BrandResearchSnapshot,
)
from app.models.project import Project
from app.models.prompt import PromptSet

IDEMPOTENCY_KEY_REQUIRED = "Idempotency-Key is required"


class BrandDiscoveryError(ValueError):
    pass


def _progress(
    *,
    phase: str,
    completed_steps: int,
    pages_read: int = 0,
    competitors_found: int = 0,
    prompts_prepared: int = 0,
    previous: dict | None = None,
) -> dict:
    prior = previous or {}
    return {
        "phase": phase,
        "completed_steps": min(
            DISCOVERY_PROGRESS_TOTAL_STEPS,
            max(completed_steps, int(prior.get("completed_steps") or 0)),
        ),
        "total_steps": DISCOVERY_PROGRESS_TOTAL_STEPS,
        "pages_read": max(pages_read, int(prior.get("pages_read") or 0)),
        "competitors_found": max(
            competitors_found, int(prior.get("competitors_found") or 0)
        ),
        "prompts_prepared": max(
            prompts_prepared, int(prior.get("prompts_prepared") or 0)
        ),
        "updated_at": datetime.now(UTC).isoformat(),
    }


def discovery_catalog() -> dict[str, object]:
    return {
        "business_types": list(BUSINESS_TYPES),
        "price_tiers": list(PRICE_TIERS),
        "required_fields": ["brand_name", "website_url", "primary_market"],
        "optional_fields": ["industry", "subindustry", "language_code"],
        "capture_methods": [
            CAPTURE_METHOD_CRAWLER,
            CAPTURE_METHOD_APPLICATION_MODEL,
            CAPTURE_METHOD_USER,
        ],
        "maximum_competitors": brand_discovery_settings.maximum_competitors,
        "industries": industry_names(),
        "subindustries": subindustries_by_industry(),
        "prompt_cohorts": [
            PROMPT_COHORT_CORE,
            PROMPT_COHORT_BRAND_DIAGNOSTIC,
            PROMPT_COHORT_COMPARISON,
        ],
    }


async def create_discovery(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    payload: BrandDiscoveryCreate,
    idempotency_key: str,
) -> BrandDiscovery:
    key = idempotency_key.strip()
    if not key:
        raise BrandDiscoveryError(IDEMPOTENCY_KEY_REQUIRED)
    existing = await session.scalar(
        select(BrandDiscovery).where(
            BrandDiscovery.workspace_id == workspace_id,
            BrandDiscovery.idempotency_key == key,
        )
    )
    if existing is not None:
        return existing
    try:
        primary_market = normalize_primary_market(payload.primary_market)
        normalized_url, _ = normalize_website_url(payload.website_url)
    except ValueError as exc:
        raise BrandDiscoveryError(str(exc)) from exc
    requested_industry = payload.industry.strip()
    if requested_industry and requested_industry not in industry_names():
        raise BrandDiscoveryError("industry is not supported")
    selected_industry, context = industry_context(requested_industry)
    subindustry = payload.subindustry.strip() if selected_industry != "General" else ""
    allowed_subindustries = set(context.get("subindustries") or [])
    if subindustry and subindustry not in allowed_subindustries:
        raise BrandDiscoveryError("subindustry is not valid for the selected industry")
    row = BrandDiscovery(
        workspace_id=workspace_id,
        input_data={
            **payload.model_dump(),
            "website_url": normalized_url,
            "industry": selected_industry,
            "subindustry": subindustry,
            "primary_market": primary_market,
            "discovery_version": BRAND_DISCOVERY_VERSION,
        },
        idempotency_key=key,
        stage="queued",
        progress=_progress(phase="opening_website", completed_steps=0),
    )
    session.add(row)
    await session.flush()
    session.add(
        BrandDiscoveryTask(
            discovery_id=row.id,
            workspace_id=workspace_id,
            idempotency_key=f"brand-discovery:{row.id}",
        )
    )
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        replay = await session.scalar(
            select(BrandDiscovery).where(
                BrandDiscovery.workspace_id == workspace_id,
                BrandDiscovery.idempotency_key == key,
            )
        )
        if replay is not None:
            return replay
        raise
    await session.refresh(row)
    return row


async def get_discovery(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    discovery_id: uuid.UUID,
    for_update: bool = False,
) -> BrandDiscovery:
    statement = select(BrandDiscovery).where(
        BrandDiscovery.id == discovery_id,
        BrandDiscovery.workspace_id == workspace_id,
    )
    if for_update:
        statement = statement.with_for_update().execution_options(
            populate_existing=True
        )
    row = await session.scalar(statement)
    if row is None:
        raise LookupError("Brand discovery not found")
    return row


async def process_discovery(session: AsyncSession, row: BrandDiscovery) -> None:
    """Resolve one site and always reach review unless URL/site existence fails."""
    data = dict(row.input_data)
    try:
        normalized_url, _ = normalize_website_url(str(data["website_url"]))
        site = await resolve_site(str(data["website_url"]), normalized_url)
    except InvalidWebsiteUrl:
        row.status = DISCOVERY_STATUS_FAILED
        row.stage = "failed"
        row.error_code = "invalid_url"
        row.error_detail = "The website URL is invalid"
        await session.commit()
        return
    except SiteNotFoundError:
        row.status = DISCOVERY_STATUS_FAILED
        row.stage = "failed"
        row.error_code = "site_not_found"
        row.error_detail = "The website could not be resolved"
        await session.commit()
        return
    row.input_data = {**data, "website_url": site.canonical_url}
    row.domains = [site.registrable_domain]
    row.progress = _progress(
        phase="understanding_business",
        completed_steps=1,
        pages_read=1,
        previous=row.progress,
    )
    await session.commit()

    selected_industry, _context = industry_context(
        str(data.get("industry") or "General")
    )

    async def _finding_competitors() -> None:
        row.progress = _progress(
            phase="finding_competitors",
            completed_steps=2,
            previous=row.progress,
        )
        await session.commit()

    result = await research_brand(
        brand_name=str(data["brand_name"]),
        primary_market=str(data["primary_market"]),
        industry=selected_industry,
        subindustry=str(data.get("subindustry") or ""),
        language_code=str(data.get("language_code") or "en"),
        site=site,
        on_competitor_phase=_finding_competitors,
    )
    row.profile = result.profile
    row.competitors = result.competitors
    row.topics = []
    row.prompt_suggestions = []
    row.evidence = result.evidence
    row.warnings = result.warnings
    row.gaps = []
    row.error_code = ""
    row.error_detail = ""
    row.status = DISCOVERY_STATUS_READY
    row.stage = "review"
    row.progress = _progress(
        phase="preparing_review",
        completed_steps=DISCOVERY_PROGRESS_TOTAL_STEPS - 1,
        pages_read=result.pages_read,
        competitors_found=len(result.competitors),
        prompts_prepared=0,
        previous=row.progress,
    )
    session.add(
        BrandResearchSnapshot(
            workspace_id=row.workspace_id,
            discovery_id=row.id,
            research_version=BRAND_DISCOVERY_VERSION,
            provider=result.provider,
            model=result.model,
            method="first_party+keenable+structured_models",
            extracted_fields={
                "profile": result.profile,
                "competitive_signature": result.competitive_signature,
                "competitors": result.competitors,
                "offerings": result.offerings,
                "evidence_manifest": result.evidence_manifest,
                "model_calls": result.model_calls,
                "metrics": result.metrics,
            },
            field_confidence=result.profile.get("field_confidence", {}),
            evidence=result.evidence,
            warnings=result.warnings,
        )
    )
    await session.commit()


def _confirmed_domains(values: list[str]) -> list[str]:
    domains: list[str] = []
    for value in values:
        try:
            _, domain = normalize_website_url(value)
        except InvalidWebsiteUrl as exc:
            raise BrandDiscoveryError(
                "Confirmed domains must be public domains"
            ) from exc
        domains.append(domain)
    return list(dict.fromkeys(domains))


def _confirmed_competitors(
    items: list[CompetitorInput], *, brand_name: str, owned_domains: list[str]
) -> list[dict]:
    confirmed: list[dict] = []
    seen: set[str] = set()
    for item in items:
        key = item.name.strip().casefold()
        if key == brand_name.strip().casefold() or key in seen:
            raise BrandDiscoveryError(
                "Competitors must be unique and distinct from the brand"
            )
        domains = _confirmed_domains(item.domains)
        if set(domains).intersection(owned_domains):
            raise BrandDiscoveryError("A competitor cannot use an owned domain")
        seen.add(key)
        confirmed.append(item.model_copy(update={"domains": domains}).model_dump())
    return confirmed


def _reviewed_profile_sources(confirmed: dict) -> dict[str, dict[str, str]]:
    """Record provenance for the brand-knowledge fields.

    None of these four are on the confirm screen any more -- it asks what you
    sell, who buys it and where, and the prose fields moved to the brand screen
    inside the app. So they cannot be stamped as reviewed: the client fills the
    empties from the confirmed category, and calling a generated string like
    "Buyers searching for ..." user-confirmed would make later consumers trust
    a sentence no user ever read. They stay AI-suggested and unreviewed until
    someone actually edits them where that work belongs.
    """
    return {
        field: {
            "origin": BRAND_PROFILE_SOURCE_AI_SUGGESTED,
            "review_state": BRAND_PROFILE_REVIEW_UNREVIEWED,
        }
        for field in BRAND_PROFILE_FIELDS
        if confirmed.get(field)
    }


async def _attach_research_source_artifacts(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    row: BrandDiscovery,
    project: Project,
    profile_sources: dict[str, dict[str, str]],
) -> uuid.UUID | None:
    research_snapshot_id = await session.scalar(
        select(BrandResearchSnapshot.id)
        .where(
            BrandResearchSnapshot.workspace_id == workspace_id,
            BrandResearchSnapshot.discovery_id == row.id,
        )
        .order_by(BrandResearchSnapshot.created_at.desc())
    )
    if research_snapshot_id and project.brand and project.brand.profile:
        project.brand.profile.source_artifact_ids = {
            field: str(research_snapshot_id) for field in profile_sources
        }
    return research_snapshot_id


async def _persist_project_shell(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    row: BrandDiscovery,
    payload: BrandDiscoveryComplete,
    profile_sources: dict[str, dict[str, str]],
) -> uuid.UUID:
    """Persist the immediately usable project and its empty prompt set."""
    data = row.input_data
    profile = payload.profile
    project = await create_project(
        session,
        workspace_id=workspace_id,
        payload=ProjectCreate(
            name=payload.name or str(data["brand_name"]),
            brand_name=str(data["brand_name"]),
            brand=BrandInput(
                aliases=_seed_brand_aliases(str(data["brand_name"]), list(row.domains))
            ),
            website_url=str(data["website_url"]),
            industry=str(data["industry"]),
            subindustry=str(data.get("subindustry") or ""),
            primary_market=str(data["primary_market"]),
            owned_domains=list(row.domains),
            competitors=[CompetitorInput(**item) for item in row.competitors],
            country_code=str(data["primary_market"]),
            language_code=str(data.get("language_code") or "en"),
            description=profile.description,
            positioning=profile.positioning,
            products_services=profile.products_services,
            target_audience=profile.target_audience,
            business_context=BusinessContext.from_onboarding(
                profile,
                primary_market=str(data["primary_market"]),
                language_code=str(data.get("language_code") or "en"),
            ).persisted(),
        ),
        commit=False,
        brand_profile_sources=profile_sources,
    )
    await _attach_research_source_artifacts(
        session,
        workspace_id=workspace_id,
        row=row,
        project=project,
        profile_sources=profile_sources,
    )
    prompt_set = PromptSet(
        id=uuid.uuid4(), project_id=project.id, name=ONBOARDING_PROMPT_SET_NAME
    )
    session.add(prompt_set)
    return project.id


def _confirmed_inputs(
    row: BrandDiscovery,
    *,
    payload: BrandDiscoveryComplete,
) -> tuple[list[str], list[dict], dict[str, dict[str, str]]]:
    domains = _confirmed_domains(payload.domains)
    competitors = _confirmed_competitors(
        payload.competitors,
        brand_name=str(row.input_data["brand_name"]),
        owned_domains=domains,
    )
    profile_sources = _reviewed_profile_sources(payload.profile.model_dump())
    return domains, competitors, profile_sources


def _domain_brand_aliases(domains: list[str]) -> list[str]:
    """The brand's own domain label, which no name split would produce.

    `brand_terms` bans distinctive tokens of the brand NAME, but a shopper (or
    a model) writes the brand the way the site is spelled: "ilovedooney", one
    word, is never a token of "I Love Dooney". It has to be banned from
    organic prompts explicitly, and that matters more now that ordinary words
    like "love" are no longer banned on their own.
    """
    aliases: list[str] = []
    for domain in domains:
        label = registrable_domain(domain).split(".")[0].strip()
        if len(label) >= 4:
            aliases.append(label)
    return list(dict.fromkeys(aliases))


def _seed_brand_aliases(brand_name: str, domains: list[str]) -> list[str]:
    """The brand's own aliases, seeded from what onboarding already confirmed.

    Competitors arrive from research carrying aliases; the brand arrived with
    none, and nothing downstream ever filled them, so a project's brand was
    matched by exactly one spelling -- whichever one happened to be typed into
    the setup form. A brand whose name was entered as its domain label then
    scored zero visibility against competitors that scored normally.

    The domain label is confirmed evidence of a second spelling and costs
    nothing to record. It is not a substitute for the owner correcting the
    list: aliases are editable on the project, and the compact matching in
    `app.analysis.normalization` covers the joined/split pair either way.

    A label is only trusted when it is RECOGNISABLY THIS BRAND.
    The label decides what counts as a mention, so an over-broad entry inflates
    the number the customer is paying to measure. "shop-online.com" would
    otherwise make every "shop online" in every answer a sighting of the brand.
    """
    brand_key = brand_name.strip().casefold()
    return [
        alias
        for alias in _domain_brand_aliases(domains)
        if alias.casefold() != brand_key and _names_the_brand(alias, brand_name)
    ]


def _names_the_brand(alias: str, brand_name: str) -> bool:
    """True when label and brand name are the same name, spelled two ways.

    Compared as PREFIXES of each other with the separators removed, because
    that is the actual relationship between a name and its domain: "Best &
    Less" is "bestandless", "I Love Dooney" is "ilovedooney", and "Kmart
    Australia" shortens to "kmart". Looking for a brand token anywhere inside
    the label instead let a short one match by accident -- a brand whose name
    contains "art" would have authorised "cart-example" and then counted every
    "cart example" in every answer as a sighting.

    Compacted through `normalize_alias`, the same function the scorer matches
    with, so "&" becomes "and" on both sides. Tokenizing instead DROPS the
    ampersand, which made "Best & Less" fail to recognise "bestandless" -- the
    exact pair this whole change exists to connect.
    """
    label = normalize_alias(alias).replace(" ", "")
    brand = normalize_alias(brand_name).replace(" ", "")
    if not label or not brand:
        return False
    shorter, longer = sorted((label, brand), key=len)
    return len(shorter) >= 4 and longer.startswith(shorter)
