"""Durable, evidence-only brand discovery workflow."""

from __future__ import annotations

import re
import uuid
from datetime import UTC, datetime, timedelta
from ipaddress import ip_address
from urllib.parse import urlsplit

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.connectors.web_evidence.firecrawl import competitor_search, rendered_scrape
from app.connectors.web_evidence.resolver import SystemDnsResolver
from app.connectors.web_evidence.url_policy import (
    UrlPolicyError,
    canonicalize,
    resolve_target,
)
from app.core.config.brand_discovery import (
    BRAND_DISCOVERY_VERSION,
    BUSINESS_TYPES,
    CAPTURE_METHOD_CRAWLER,
    CAPTURE_METHOD_FIRECRAWL,
    CAPTURE_METHOD_FIRECRAWL_SEARCH,
    CAPTURE_METHOD_USER,
    DISCOVERY_STATUS_CONFIRMED,
    DISCOVERY_STATUS_NEEDS_INPUT,
    DISCOVERY_STATUS_PROJECT_CREATED,
    DISCOVERY_STATUS_QUEUED,
    DISCOVERY_STATUS_READY,
    DISCOVERY_STATUS_RUNNING,
    PRICE_TIERS,
    brand_discovery_settings,
)
from app.core.config.prompts import (
    ONBOARDING_COMPARISON_TEMPLATE,
    ONBOARDING_CORE_TEMPLATES,
    ONBOARDING_PROMPT_SET_NAME,
)
from app.domain.projects.brand_evidence import collect_brand_evidence
from app.domain.projects.discovery_schemas import (
    BrandDiscoveryConfirm,
    BrandDiscoveryCreate,
    BrandDiscoveryCreateProject,
)
from app.domain.projects.schemas import BrandInput, CompetitorInput, ProjectCreate
from app.domain.projects.service import create_project
from app.models.discovery import BrandDiscovery
from app.models.prompt import Prompt, PromptSet, Topic


class BrandDiscoveryError(ValueError):
    pass


def discovery_catalog() -> dict[str, list[str]]:
    return {
        "business_types": list(BUSINESS_TYPES),
        "price_tiers": list(PRICE_TIERS),
        "required_fields": ["brand_name", "website_url", "industry", "business_type"],
        "optional_fields": [
            "products_services",
            "target_audience",
            "positioning",
            "price_tier",
            "additional_context",
        ],
        "capture_methods": [
            CAPTURE_METHOD_CRAWLER,
            CAPTURE_METHOD_FIRECRAWL,
            CAPTURE_METHOD_FIRECRAWL_SEARCH,
            CAPTURE_METHOD_USER,
        ],
    }


def _is_valid_domain_hostname(hostname: str) -> bool:
    labels = hostname.rstrip(".").split(".")
    if len(labels) < 2:
        return False
    label_pattern = re.compile(r"[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?")
    return all(label_pattern.fullmatch(label) is not None for label in labels)


def _validate_public_hostname(hostname: str) -> None:
    if hostname == "localhost" or not _is_valid_domain_hostname(hostname):
        raise BrandDiscoveryError("website_url must use a valid public domain")
    try:
        address = ip_address(hostname)
    except ValueError:
        return
    if not address.is_global:
        raise BrandDiscoveryError("website_url must use a public address")


def _normalized_url(value: str) -> tuple[str, str]:
    candidate = value.strip()
    if "://" not in candidate:
        candidate = f"https://{candidate}"
    try:
        url = canonicalize(candidate)
    except (UrlPolicyError, ValueError) as exc:
        raise BrandDiscoveryError("website_url is invalid") from exc
    hostname = (urlsplit(url).hostname or "").lower().removeprefix("www.")
    if not hostname:
        raise BrandDiscoveryError("website_url has no domain")
    _validate_public_hostname(hostname)
    return url, hostname


async def create_discovery(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    payload: BrandDiscoveryCreate,
    idempotency_key: str,
) -> BrandDiscovery:
    key = idempotency_key.strip()
    if not key:
        raise BrandDiscoveryError("Idempotency-Key is required")
    existing = await session.scalar(
        select(BrandDiscovery).where(
            BrandDiscovery.workspace_id == workspace_id,
            BrandDiscovery.idempotency_key == key,
        )
    )
    if existing is not None:
        return existing
    row = BrandDiscovery(
        workspace_id=workspace_id,
        input_data={
            **payload.model_dump(),
            "discovery_version": BRAND_DISCOVERY_VERSION,
        },
        idempotency_key=key,
    )
    session.add(row)
    await session.commit()
    await session.refresh(row)
    return row


async def get_discovery(
    session: AsyncSession, *, workspace_id: uuid.UUID, discovery_id: uuid.UUID
) -> BrandDiscovery:
    row = await session.scalar(
        select(BrandDiscovery).where(
            BrandDiscovery.id == discovery_id,
            BrandDiscovery.workspace_id == workspace_id,
        )
    )
    if row is None:
        raise LookupError("Brand discovery not found")
    return row


async def claim_discovery(
    session: AsyncSession, *, worker_id: str
) -> BrandDiscovery | None:
    now = datetime.now(UTC)
    row = await session.scalar(
        select(BrandDiscovery)
        .where(
            or_(
                BrandDiscovery.status == DISCOVERY_STATUS_QUEUED,
                (
                    (BrandDiscovery.status == DISCOVERY_STATUS_RUNNING)
                    & (BrandDiscovery.lease_expires_at < now)
                ),
            ),
            BrandDiscovery.available_at <= now,
            or_(
                BrandDiscovery.lease_expires_at.is_(None),
                BrandDiscovery.lease_expires_at < now,
            ),
        )
        .order_by(BrandDiscovery.created_at)
        .with_for_update(skip_locked=True)
        .limit(1)
    )
    if row is None:
        return None
    row.status = DISCOVERY_STATUS_RUNNING
    row.stage = "normalize_url"
    row.lease_owner = worker_id
    row.lease_expires_at = now + timedelta(
        seconds=brand_discovery_settings.lease_seconds
    )
    row.attempt_count += 1
    await session.commit()
    return row


def _evidence_item(
    url: str, method: str, confidence: float, supports: list[str]
) -> dict:
    return {
        "source_url": url,
        "capture_method": method,
        "confidence": confidence,
        "captured_at": datetime.now(UTC).isoformat(),
        "supports": supports,
    }


def _candidate_name(title: str, domain: str) -> str:
    cleaned = re.split(r"[|—–:-]", title, maxsplit=1)[0].strip()
    return cleaned or domain.split(".")[0].replace("-", " ").title()


def _confirmed_competitors(
    payload: BrandDiscoveryConfirm, *, brand_name: str, owned_domains: list[str]
) -> list[dict]:
    tracked_brand_names = {brand_name.casefold()}
    owned = set(owned_domains)
    confirmed: list[dict] = []
    seen_names: set[str] = set()
    for item in payload.competitors:
        name_key = item.name.strip().casefold()
        aliases = {alias.strip().casefold() for alias in item.aliases if alias.strip()}
        if name_key in tracked_brand_names or aliases & tracked_brand_names:
            raise BrandDiscoveryError("A competitor cannot be the tracked brand")
        if name_key in seen_names:
            raise BrandDiscoveryError("Competitor names must be unique")
        domains = list(
            dict.fromkeys(_normalized_url(domain)[1] for domain in item.domains)
        )
        if owned.intersection(domains):
            raise BrandDiscoveryError("A competitor cannot use an owned domain")
        seen_names.add(name_key)
        confirmed.append(item.model_copy(update={"domains": domains}).model_dump())
    return confirmed


async def _approve_vendor_url(url: str) -> None:
    """Apply the same DNS/IP SSRF gate before sending a URL to Firecrawl."""
    await resolve_target(
        url,
        resolver=SystemDnsResolver(),
        enforce_scope=False,
    )


async def process_discovery(session: AsyncSession, row: BrandDiscovery) -> None:
    """Complete best-effort discovery. Every fault becomes editable needs_input."""
    data = row.input_data
    evidence_rows: list[dict] = []
    gaps: list[str] = []
    try:
        homepage, owned_domain = _normalized_url(str(data["website_url"]))
        row.stage = "crawl_owned_site"
        evidence = await collect_brand_evidence(homepage)
        captured_text = " ".join(
            part
            for page in evidence.pages
            for part in (page.meta_description, page.text)
            if part
        )
        for page in evidence.pages:
            evidence_rows.append(
                _evidence_item(
                    page.url,
                    CAPTURE_METHOD_CRAWLER,
                    0.9,
                    [
                        "description",
                        "positioning",
                        "products_services",
                        "target_audience",
                        "owned_domain",
                    ],
                )
            )
        if evidence.word_count < brand_discovery_settings.minimum_evidence_words:
            row.stage = "rendered_fallback"
            try:
                await _approve_vendor_url(homepage)
                rendered = await rendered_scrape(homepage)
                captured_text = rendered.text
                evidence_rows.append(
                    _evidence_item(
                        rendered.url,
                        CAPTURE_METHOD_FIRECRAWL,
                        0.85,
                        [
                            "description",
                            "positioning",
                            "products_services",
                            "target_audience",
                            "owned_domain",
                        ],
                    )
                )
            except Exception:  # noqa: BLE001
                gaps.append("website_evidence")

        user_products = list(data.get("products_services") or [])
        description = str(data.get("additional_context") or "").strip()
        if not description and captured_text:
            description = " ".join(captured_text.split())[:1200]
        profile = {
            "description": description,
            "positioning": str(data.get("positioning") or "").strip(),
            "products_services": user_products,
            "target_audience": str(data.get("target_audience") or "").strip(),
            "industry": str(data["industry"]).strip(),
            "business_type": data["business_type"],
            "price_tier": data.get("price_tier") or "unknown",
        }
        for field in ("industry", "business_type"):
            evidence_rows.append(
                _evidence_item("user://onboarding", CAPTURE_METHOD_USER, 1.0, [field])
            )

        row.stage = "competitor_verification"
        competitors: list[dict] = []
        try:
            candidates = await competitor_search(
                brand_name=str(data["brand_name"]), industry=str(data["industry"])
            )
            seen = {owned_domain}
            for candidate in candidates:
                domain = (
                    (urlsplit(candidate.url).hostname or "")
                    .lower()
                    .removeprefix("www.")
                )
                if not domain or domain in seen:
                    continue
                seen.add(domain)
                verification = await collect_brand_evidence(candidate.url)
                if not verification.pages:
                    continue
                industry_terms = {
                    token.casefold()
                    for token in re.findall(r"[a-zA-Z0-9]+", str(data["industry"]))
                    if len(token) >= 4
                }
                verified_text = verification.serialize().casefold()
                if industry_terms and not any(
                    term in verified_text for term in industry_terms
                ):
                    continue
                name = _candidate_name(candidate.title, domain)
                if name.casefold() == str(data["brand_name"]).casefold():
                    continue
                competitors.append({"name": name, "aliases": [], "domains": [domain]})
                evidence_rows.append(
                    _evidence_item(
                        candidate.url,
                        CAPTURE_METHOD_FIRECRAWL_SEARCH,
                        0.65,
                        [f"competitor_candidate:{name}"],
                    )
                )
                evidence_rows.append(
                    _evidence_item(
                        verification.pages[0].url,
                        CAPTURE_METHOD_CRAWLER,
                        0.75,
                        [f"competitor:{name}"],
                    )
                )
                if len(competitors) >= brand_discovery_settings.maximum_competitors:
                    break
        except Exception:  # noqa: BLE001
            gaps.append("competitors")

        if not profile["description"]:
            gaps.append("description")
        if not profile["products_services"]:
            gaps.append("products_services")
        if not competitors:
            gaps.append("competitors")
        row.profile = profile
        row.domains = [owned_domain]
        row.competitors = competitors
        row.topics = list(dict.fromkeys([str(data["industry"]), *user_products]))
        row.evidence = evidence_rows
        row.gaps = list(dict.fromkeys(gaps))
        row.status = (
            DISCOVERY_STATUS_NEEDS_INPUT if row.gaps else DISCOVERY_STATUS_READY
        )
        row.stage = "review"
        row.error_detail = ""
    except Exception as exc:  # noqa: BLE001
        row.status = DISCOVERY_STATUS_NEEDS_INPUT
        row.stage = "review"
        row.gaps = list(dict.fromkeys([*row.gaps, "discovery_unavailable"]))
        row.error_detail = type(exc).__name__
    finally:
        row.lease_owner = None
        row.lease_expires_at = None
        await session.commit()


async def confirm_discovery(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    discovery_id: uuid.UUID,
    payload: BrandDiscoveryConfirm,
) -> BrandDiscovery:
    row = await session.scalar(
        select(BrandDiscovery)
        .where(
            BrandDiscovery.id == discovery_id,
            BrandDiscovery.workspace_id == workspace_id,
        )
        .with_for_update()
    )
    if row is None:
        raise LookupError("Brand discovery not found")
    if row.status not in {DISCOVERY_STATUS_NEEDS_INPUT, DISCOVERY_STATUS_READY}:
        raise BrandDiscoveryError("Discovery is not ready for confirmation")
    domains = list(
        dict.fromkeys(_normalized_url(value)[1] for value in payload.domains)
    )
    competitors = _confirmed_competitors(
        payload,
        brand_name=str(row.input_data["brand_name"]),
        owned_domains=domains,
    )
    row.profile = payload.profile.model_dump()
    row.domains = domains
    row.competitors = competitors
    row.topics = list(dict.fromkeys(payload.topics))
    row.gaps = []
    row.status = DISCOVERY_STATUS_CONFIRMED
    row.stage = "confirmed"
    await session.commit()
    return row


async def create_project_from_discovery(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    discovery_id: uuid.UUID,
    payload: BrandDiscoveryCreateProject,
    idempotency_key: str,
) -> BrandDiscovery:
    row = await get_discovery(
        session, workspace_id=workspace_id, discovery_id=discovery_id
    )
    if row.status == DISCOVERY_STATUS_PROJECT_CREATED:
        return row
    if row.status != DISCOVERY_STATUS_CONFIRMED:
        raise BrandDiscoveryError("Confirm discovery before creating the project")
    key = idempotency_key.strip()
    if not key:
        raise BrandDiscoveryError("Idempotency-Key is required")
    existing_key = str(row.input_data.get("project_idempotency_key") or "")
    if existing_key and existing_key != key:
        raise BrandDiscoveryError(
            "This discovery was already submitted with a different Idempotency-Key"
        )
    row.input_data = {**row.input_data, "project_idempotency_key": key}
    data = row.input_data
    profile = row.profile
    project = await create_project(
        session,
        workspace_id=workspace_id,
        payload=ProjectCreate(
            name=payload.name or str(data["brand_name"]),
            brand_name=str(data["brand_name"]),
            brand=BrandInput(),
            website_url=str(data["website_url"]),
            owned_domains=list(row.domains),
            competitors=[CompetitorInput(**item) for item in row.competitors],
            country_code=str(data.get("country_code") or ""),
            language_code=str(data.get("language_code") or "en"),
            description=str(profile.get("description") or ""),
            positioning=str(profile.get("positioning") or ""),
            products_services=list(profile.get("products_services") or []),
            target_audience=str(profile.get("target_audience") or ""),
        ),
        commit=False,
    )
    prompt_set = PromptSet(project_id=project.id, name=ONBOARDING_PROMPT_SET_NAME)
    session.add(prompt_set)
    await session.flush()
    audience = str(profile.get("target_audience") or "buyers").strip()
    topics = list(row.topics) or [str(profile.get("industry") or data["industry"])]
    for topic_name in topics:
        topic = Topic(project_id=project.id, name=str(topic_name), origin="generated")
        session.add(topic)
        await session.flush()
        for template, intent in ONBOARDING_CORE_TEMPLATES:
            session.add(
                Prompt(
                    prompt_set_id=prompt_set.id,
                    topic_id=topic.id,
                    text=template.format(topic=topic.name, audience=audience),
                    theme=topic.name,
                    intent=intent,
                    cohort="core",
                    branded=False,
                    origin="generated",
                    generation_evidence={
                        "generator_version": "confirmed-profile-template-v1",
                        "discovery_id": str(row.id),
                    },
                )
            )
    comparison_topic = topics[0]
    for competitor in row.competitors:
        session.add(
            Prompt(
                prompt_set_id=prompt_set.id,
                text=ONBOARDING_COMPARISON_TEMPLATE.format(
                    brand=data["brand_name"],
                    competitor=competitor["name"],
                    topic=comparison_topic,
                ),
                theme=comparison_topic,
                intent="comparison",
                cohort="comparison",
                branded=True,
                origin="generated",
                generation_evidence={
                    "generator_version": "confirmed-comparison-template-v1",
                    "discovery_id": str(row.id),
                },
            )
        )
    row.project_id = project.id
    row.status = DISCOVERY_STATUS_PROJECT_CREATED
    row.stage = "complete"
    await session.commit()
    return row
