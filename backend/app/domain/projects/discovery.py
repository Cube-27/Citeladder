"""Durable, evidence-only brand discovery workflow."""

from __future__ import annotations

import json
import logging
import re
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from ipaddress import ip_address
from urllib.parse import urlsplit

from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import Select

from app.analysis.normalization import alias_present, normalize_alias
from app.connectors.agent.client import AgentNotConfiguredError, DefaultAgentClient
from app.connectors.answer_engines.errors import ProviderError
from app.connectors.web_evidence.contracts import ResolvedTarget
from app.connectors.web_evidence.firecrawl import (
    FirecrawlPage,
    FirecrawlUnavailableError,
    competitor_search,
    rendered_scrape,
)
from app.connectors.web_evidence.resolver import SystemDnsResolver
from app.connectors.web_evidence.url_policy import canonicalize, resolve_target
from app.core.config.brand_discovery import (
    BRAND_DISCOVERY_PROMPT_GENERATOR_VERSION,
    BRAND_DISCOVERY_VERSION,
    BUSINESS_TYPES,
    CAPTURE_METHOD_CRAWLER,
    CAPTURE_METHOD_FIRECRAWL,
    CAPTURE_METHOD_FIRECRAWL_SEARCH,
    CAPTURE_METHOD_USER,
    COMPETITOR_EXCLUDED_DOMAINS,
    DISCOVERY_COMPETITOR_SYSTEM_PROMPT,
    DISCOVERY_MAX_COMPARISON_SHARE,
    DISCOVERY_PROGRESS_TOTAL_STEPS,
    DISCOVERY_STATUS_NEEDS_INPUT,
    DISCOVERY_STATUS_PROJECT_CREATED,
    DISCOVERY_STATUS_READY,
    DISCOVERY_SYNTHESIS_SYSTEM_PROMPT,
    PRICE_TIERS,
    brand_discovery_settings,
)
from app.core.config.projects import MAX_PROJECT_COMPETITORS
from app.core.config.prompts import ONBOARDING_PROMPT_SET_NAME
from app.domain.projects.activation import start_initial_site_review
from app.domain.projects.brand_evidence import collect_brand_evidence
from app.domain.projects.discovery_schemas import (
    BrandDiscoveryComplete,
    BrandDiscoveryCreate,
    DiscoveryCompetitorCandidates,
    DiscoveryEvidence,
    DiscoverySynthesis,
)
from app.domain.projects.schemas import BrandInput, CompetitorInput, ProjectCreate
from app.domain.projects.service import create_project
from app.domain.prompts.portfolio import prompt_identity_is_valid
from app.domain.prompts.service import prepare_prompt_inserts
from app.models.discovery import BrandDiscovery, BrandDiscoveryTask
from app.models.prompt import Prompt, PromptSet, Topic
from app.models.site_health import SiteCrawl

logger = logging.getLogger(__name__)


class BrandDiscoveryError(ValueError):
    pass


IDEMPOTENCY_KEY_REQUIRED = "Idempotency-Key is required"


def _progress(
    *,
    phase: str,
    completed_steps: int,
    pages_read: int = 0,
    competitors_found: int = 0,
    prompts_prepared: int = 0,
    previous: dict | None = None,
) -> dict:
    """Safe, persisted progress projection consumed by onboarding."""
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


async def _commit_progress(
    session: AsyncSession,
    row: BrandDiscovery,
    stage: str,
    *,
    phase: str,
    completed_steps: int,
    pages_read: int = 0,
    competitors_found: int = 0,
    prompts_prepared: int = 0,
) -> None:
    row.stage = stage
    row.progress = _progress(
        phase=phase,
        completed_steps=completed_steps,
        pages_read=pages_read,
        competitors_found=competitors_found,
        prompts_prepared=prompts_prepared,
        previous=row.progress,
    )
    await session.commit()


def discovery_catalog() -> dict[str, object]:
    return {
        "business_types": list(BUSINESS_TYPES),
        "price_tiers": list(PRICE_TIERS),
        "required_fields": ["brand_name", "website_url"],
        "optional_fields": ["industry", "country_code", "language_code"],
        "capture_methods": [
            CAPTURE_METHOD_CRAWLER,
            CAPTURE_METHOD_FIRECRAWL,
            CAPTURE_METHOD_FIRECRAWL_SEARCH,
            CAPTURE_METHOD_USER,
        ],
        "maximum_competitors": MAX_PROJECT_COMPETITORS,
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
        ip_address(hostname)
    except ValueError:
        return
    raise BrandDiscoveryError("website_url must use a public domain, not an IP address")


def _normalized_url(value: str) -> tuple[str, str]:
    candidate = value.strip()
    if "://" not in candidate:
        candidate = f"https://{candidate}"
    try:
        url = canonicalize(candidate)
    except ValueError as exc:
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
        raise BrandDiscoveryError(IDEMPOTENCY_KEY_REQUIRED)
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
    return await _commit_new_discovery(
        session, row=row, workspace_id=workspace_id, idempotency_key=key
    )


async def _commit_new_discovery(
    session: AsyncSession,
    *,
    row: BrandDiscovery,
    workspace_id: uuid.UUID,
    idempotency_key: str,
) -> BrandDiscovery:
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        existing = await session.scalar(
            select(BrandDiscovery).where(
                BrandDiscovery.workspace_id == workspace_id,
                BrandDiscovery.idempotency_key == idempotency_key,
            )
        )
        if existing is not None:
            return existing
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
    statement = _discovery_statement(
        workspace_id=workspace_id,
        discovery_id=discovery_id,
        for_update=for_update,
    )
    row = await session.scalar(statement)
    if row is None:
        raise LookupError("Brand discovery not found")
    return row


def _discovery_statement(
    *, workspace_id: uuid.UUID, discovery_id: uuid.UUID, for_update: bool
) -> Select[tuple[BrandDiscovery]]:
    statement = select(BrandDiscovery).where(
        BrandDiscovery.id == discovery_id,
        BrandDiscovery.workspace_id == workspace_id,
    )
    if for_update:
        statement = statement.with_for_update()
    return statement


def _evidence_item(
    url: str, method: str, confidence: float, supports: list[str]
) -> DiscoveryEvidence:
    return DiscoveryEvidence(
        source_url=url,
        capture_method=method,
        confidence=confidence,
        captured_at=datetime.now(UTC),
        supports=supports,
    )


def _candidate_name(title: str, domain: str) -> str:
    cleaned = re.split(r"[|—–:-]", title, maxsplit=1)[0].strip()
    return cleaned or domain.split(".")[0].replace("-", " ").title()


def _validated_prompt_suggestions(
    synthesis: DiscoverySynthesis,
    *,
    brand_name: str,
    competitors: list[dict],
) -> list[dict]:
    """Keep only distinct prompts that satisfy their cohort identity rules."""
    brand_terms = [brand_name]
    competitor_terms = [
        term
        for competitor in competitors
        for term in [competitor.get("name", ""), *competitor.get("aliases", [])]
        if term
    ]
    accepted = _valid_prompt_candidates(
        synthesis,
        brand_terms=brand_terms,
        competitor_terms=competitor_terms,
    )
    return _select_prompt_cohorts(
        accepted,
        expect_comparison=bool(competitors),
        limit=brand_discovery_settings.synthesis_prompt_count,
    )


def _valid_prompt_candidates(
    synthesis: DiscoverySynthesis,
    *,
    brand_terms: list[str],
    competitor_terms: list[str],
) -> list[dict]:
    accepted: list[dict] = []
    seen: set[str] = set()
    for prompt in synthesis.prompts:
        normalized = normalize_alias(prompt.text)
        if normalized in seen:
            continue
        if not prompt_identity_is_valid(
            text=prompt.text,
            cohort=prompt.cohort,
            intent=prompt.intent,
            brand_terms=brand_terms,
            competitor_terms=competitor_terms,
        ):
            continue
        seen.add(normalized)
        accepted.append(prompt.model_dump())
    return accepted


def _select_prompt_cohorts(
    accepted: list[dict], *, expect_comparison: bool, limit: int
) -> list[dict]:
    comparison_limit = (
        int(limit * DISCOVERY_MAX_COMPARISON_SHARE) if expect_comparison else 0
    )
    core_limit = limit - comparison_limit
    core_candidates = [item for item in accepted if item.get("cohort") == "core"]
    core_count = min(len(core_candidates), core_limit)
    # The ratio applies to what we actually retain, not the requested capacity.
    # c / (core + c) <= 20% is equivalent to c <= floor(core / 4).
    comparison_limit = min(comparison_limit, core_count // 4)
    selected: set[str] = set()
    retained_core = 0
    retained_comparison = 0
    for item in accepted:
        cohort = item.get("cohort")
        if cohort == "core" and retained_core < core_count:
            retained_core += 1
        elif cohort == "comparison" and retained_comparison < comparison_limit:
            retained_comparison += 1
        else:
            continue
        selected.add(normalize_alias(str(item["text"])))
    return [item for item in accepted if normalize_alias(str(item["text"])) in selected]


def _confirmed_competitor_items(
    items: list[CompetitorInput], *, brand_name: str, owned_domains: list[str]
) -> list[dict]:
    if len(items) > MAX_PROJECT_COMPETITORS:
        raise BrandDiscoveryError(
            f"A project can have at most {MAX_PROJECT_COMPETITORS} competitors"
        )
    tracked_brand_names = {brand_name.casefold()}
    owned = set(owned_domains)
    confirmed: list[dict] = []
    seen_names: set[str] = set()
    for item in items:
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


async def _approve_vendor_url(url: str) -> ResolvedTarget:
    """Validate and canonicalize a domain URL immediately before delegation.

    Firecrawl is a remote SaaS and cannot use our locally pinned connect IP.
    Returning the validated canonical target minimizes the validation/delegation
    window, while rejecting IP-literal inputs keeps delegated URLs domain-only.
    """
    return await resolve_target(
        url,
        resolver=SystemDnsResolver(),
        enforce_scope=False,
    )


async def _synthesize_discovery(
    *,
    data: dict,
    homepage: str,
    captured_text: str,
    competitors: list[dict],
) -> DiscoverySynthesis:
    agent = DefaultAgentClient()
    evidence_limit = brand_discovery_settings.synthesis_evidence_max_chars
    user_payload = {
        "brand_name": data["brand_name"],
        "industry_hint": data.get("industry") or "",
        "country_code": data.get("country_code") or "",
        "language_code": data.get("language_code") or "en",
        "official_website": homepage,
        "official_site_evidence": captured_text[:evidence_limit],
        "verified_competitors": competitors,
        "requested_prompt_count": brand_discovery_settings.synthesis_prompt_count,
        "requested_topic_count": brand_discovery_settings.synthesis_topic_count,
    }
    return await _complete_synthesis(
        agent,
        user_payload=user_payload,
        attempts_remaining=brand_discovery_settings.synthesis_max_attempts,
    )


async def _complete_synthesis(
    agent: DefaultAgentClient, *, user_payload: dict, attempts_remaining: int
) -> DiscoverySynthesis:
    raw = await agent.complete_json(
        system=DISCOVERY_SYNTHESIS_SYSTEM_PROMPT,
        user=json.dumps(user_payload, ensure_ascii=False),
    )
    try:
        synthesis = DiscoverySynthesis.model_validate_json(raw)
    except ValidationError as exc:
        if attempts_remaining <= 1:
            raise
        feedback = [
            {"location": list(error["loc"]), "message": error["msg"]}
            for error in exc.errors(include_url=False, include_input=False)
        ]
        return await _complete_synthesis(
            agent,
            user_payload={**user_payload, "previous_validation_errors": feedback},
            attempts_remaining=attempts_remaining - 1,
        )
    competitors = list(user_payload.get("verified_competitors") or [])
    retained = _validated_prompt_suggestions(
        synthesis,
        brand_name=str(user_payload.get("brand_name") or ""),
        competitors=competitors,
    )
    core_count = sum(prompt.get("cohort") == "core" for prompt in retained)
    comparison_count = sum(prompt.get("cohort") == "comparison" for prompt in retained)
    minimum_core = min(
        brand_discovery_settings.synthesis_min_core_prompts,
        brand_discovery_settings.synthesis_prompt_count,
    )
    portfolio_errors: list[dict] = []
    if core_count < minimum_core:
        portfolio_errors.append(
            {
                "location": ["prompts"],
                "message": (
                    f"provide at least {minimum_core} brand-neutral core prompts"
                ),
            }
        )
    if competitors and comparison_count < 1:
        portfolio_errors.append(
            {
                "location": ["prompts"],
                "message": "provide a valid named comparison prompt after core breadth",
            }
        )
    if not portfolio_errors:
        return synthesis
    if attempts_remaining <= 1:
        raise BrandDiscoveryError("Discovery could not prepare a balanced prompt set")
    return await _complete_synthesis(
        agent,
        user_payload={**user_payload, "previous_validation_errors": portfolio_errors},
        attempts_remaining=attempts_remaining - 1,
    )


@dataclass(frozen=True, slots=True)
class _OwnedSiteEvidence:
    data: dict
    homepage: str
    owned_domain: str
    captured_text: str
    evidence: list[DiscoveryEvidence]
    gaps: list[str]


async def _rendered_site_evidence(
    homepage: str, *, discovery_id: uuid.UUID
) -> tuple[str, list[DiscoveryEvidence]]:
    try:
        rendered = await rendered_scrape(homepage)
    except FirecrawlUnavailableError:
        logger.info(
            "Firecrawl rendering unavailable; retaining secure crawler evidence",
            extra={"discovery_id": str(discovery_id)},
        )
        return "", []
    if not rendered.text.strip():
        return "", []
    return rendered.text, [
        _evidence_item(
            rendered.url,
            CAPTURE_METHOD_FIRECRAWL,
            0.9,
            [
                "official_website",
                "description",
                "positioning",
                "products_services",
                "target_audience",
                "owned_domain",
            ],
        )
    ]


async def _collect_owned_site(row: BrandDiscovery, data: dict) -> _OwnedSiteEvidence:
    row.stage = "normalize_url"
    homepage, owned_domain = _normalized_url(str(data["website_url"]))
    homepage = (await _approve_vendor_url(homepage)).url
    normalized_data = {**data, "website_url": homepage}
    row.input_data = normalized_data

    row.stage = "crawl_owned_site"
    crawled = await collect_brand_evidence(homepage)
    captured_parts = [
        part
        for page in crawled.pages
        for part in (page.meta_description, page.text)
        if part
    ]
    evidence_rows = [
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
        for page in crawled.pages
    ]
    rendered_text, rendered_rows = await _rendered_site_evidence(
        homepage, discovery_id=row.id
    )
    captured_parts.append(rendered_text)
    evidence_rows.extend(rendered_rows)
    evidence_rows.extend(
        _evidence_item("user://onboarding", CAPTURE_METHOD_USER, 1.0, [field])
        for field in ("industry", "country_code", "language_code")
        if normalized_data.get(field)
    )
    captured_text = " ".join(part for part in captured_parts if part)
    captured_word_count = len(captured_text.split())
    return _OwnedSiteEvidence(
        data=normalized_data,
        homepage=homepage,
        owned_domain=owned_domain,
        captured_text=captured_text,
        evidence=evidence_rows,
        gaps=(
            []
            if captured_word_count >= brand_discovery_settings.minimum_evidence_words
            else ["official_site_evidence"]
        ),
    )


def _industry_terms(industry: str) -> set[str]:
    return {
        token.casefold()
        for token in re.findall(r"[a-zA-Z0-9]+", industry)
        if len(token) >= 4
    }


async def _verify_competitor_candidate(
    candidate: FirecrawlPage,
    *,
    brand_name: str,
    industry_terms: set[str],
) -> tuple[dict, list[DiscoveryEvidence]] | None:
    domain = _competitor_domain(candidate.url)
    if domain is None:
        return None
    approved_url = (await _approve_vendor_url(candidate.url)).url
    approved_candidate = FirecrawlPage(
        url=approved_url,
        title=candidate.title,
        text=candidate.text,
    )
    verification, capture_method = await _read_competitor_site(approved_candidate)
    verification = _relevant_competitor_page(verification, industry_terms)
    if verification is None:
        return None
    name = _candidate_name(candidate.title, domain)
    if not _verified_candidate_identity(
        name=name,
        brand_name=brand_name,
        domain=domain,
        verification=verification,
    ):
        return None
    competitor = {"name": name, "aliases": [], "domains": [domain]}
    evidence = [
        _evidence_item(
            verification.url,
            capture_method,
            0.75,
            [f"competitor:{name}"],
        ),
    ]
    return competitor, evidence


def _competitor_domain(url: str) -> str | None:
    domain = (urlsplit(url).hostname or "").lower().removeprefix("www.")
    excluded = any(
        domain == blocked or domain.endswith(f".{blocked}")
        for blocked in COMPETITOR_EXCLUDED_DOMAINS
    )
    return None if not domain or excluded else domain


def _relevant_competitor_page(
    verification: FirecrawlPage | None, industry_terms: set[str]
) -> FirecrawlPage | None:
    if verification is None:
        return None
    verified_text = verification.text.casefold()
    if not verified_text or (
        industry_terms and not any(term in verified_text for term in industry_terms)
    ):
        return None
    return verification


def _candidate_identity_present(
    name: str, domain: str, verification: FirecrawlPage
) -> bool:
    """Require the claimed competitor identity on its fetched official site."""
    haystack = normalize_alias(
        " ".join((domain, verification.title, verification.text[:2000]))
    )
    return alias_present(normalize_alias(name), haystack)


def _verified_candidate_identity(
    *, name: str, brand_name: str, domain: str, verification: FirecrawlPage
) -> bool:
    return name.casefold() != brand_name.casefold() and _candidate_identity_present(
        name, domain, verification
    )


async def _read_competitor_site(
    candidate: FirecrawlPage,
) -> tuple[FirecrawlPage | None, str]:
    """Verify with the secure crawler, using rendered capture when needed."""
    secure = await collect_brand_evidence(candidate.url)
    if secure.pages:
        page = secure.pages[0]
        text = " ".join(
            part
            for evidence_page in secure.pages
            for part in (evidence_page.meta_description, evidence_page.text)
            if part
        )
        return (
            FirecrawlPage(url=page.url, title=page.title, text=text),
            CAPTURE_METHOD_CRAWLER,
        )
    try:
        return await rendered_scrape(candidate.url), CAPTURE_METHOD_FIRECRAWL
    except FirecrawlUnavailableError:
        return None, CAPTURE_METHOD_CRAWLER


async def _agent_competitor_candidates(
    *,
    data: dict,
    homepage: str,
    captured_text: str,
    search_results: list[FirecrawlPage],
) -> list[FirecrawlPage]:
    """Ask the configured research model for candidates, then verify each URL."""
    agent = DefaultAgentClient()
    evidence_limit = brand_discovery_settings.synthesis_evidence_max_chars
    raw = await agent.complete_json(
        system=DISCOVERY_COMPETITOR_SYSTEM_PROMPT,
        user=json.dumps(
            {
                "brand_name": data["brand_name"],
                "official_website": homepage,
                "industry_hint": data.get("industry") or "",
                "country_code": data.get("country_code") or "",
                "official_site_evidence": captured_text[:evidence_limit],
                "web_search_results": [
                    {"title": item.title, "url": item.url, "snippet": item.text}
                    for item in search_results
                ],
                "maximum_competitors": brand_discovery_settings.maximum_competitors,
                "requested_competitor_count": (
                    brand_discovery_settings.target_competitors
                ),
            },
            ensure_ascii=False,
        ),
    )
    parsed = DiscoveryCompetitorCandidates.model_validate_json(raw)
    candidates: list[FirecrawlPage] = []
    for competitor in parsed.competitors:
        if not competitor.domains:
            continue
        try:
            url, _ = _normalized_url(competitor.domains[0])
        except BrandDiscoveryError:
            continue
        candidates.append(FirecrawlPage(url=url, title=competitor.name, text=""))
    return candidates


async def _try_verify_competitor_candidate(
    candidate: FirecrawlPage,
    *,
    brand_name: str,
    industry_terms: set[str],
) -> tuple[dict, list[DiscoveryEvidence]] | None:
    try:
        return await _verify_competitor_candidate(
            candidate,
            brand_name=brand_name,
            industry_terms=industry_terms,
        )
    except (FirecrawlUnavailableError, ValueError) as exc:
        logger.info(
            "Competitor candidate verification failed",
            extra={
                "candidate_url": candidate.url,
                "error_type": type(exc).__name__,
            },
        )
        return None


async def _firecrawl_competitor_candidates(
    *, brand_name: str, industry: str
) -> list[FirecrawlPage]:
    try:
        return await competitor_search(brand_name=brand_name, industry=industry)
    except FirecrawlUnavailableError:
        return []


async def _safe_agent_competitor_candidates(
    *,
    data: dict,
    homepage: str,
    captured_text: str,
    search_results: list[FirecrawlPage],
) -> list[FirecrawlPage]:
    try:
        return await _agent_competitor_candidates(
            data=data,
            homepage=homepage,
            captured_text=captured_text,
            search_results=search_results,
        )
    except (AgentNotConfiguredError, ProviderError, ValueError):
        logger.exception("LLM competitor candidate discovery failed")
        return []


async def _verify_competitor_candidates(
    candidates: list[FirecrawlPage],
    *,
    brand_name: str,
    industry_terms: set[str],
    seen_domains: set[str],
) -> tuple[list[dict], list[DiscoveryEvidence]]:
    competitors: list[dict] = []
    evidence_rows: list[DiscoveryEvidence] = []
    for candidate in candidates:
        domain = _competitor_domain(candidate.url)
        if domain is None or domain in seen_domains:
            continue
        seen_domains.add(domain)
        verified = await _try_verify_competitor_candidate(
            candidate,
            brand_name=brand_name,
            industry_terms=industry_terms,
        )
        if verified is None:
            continue
        competitor, evidence = verified
        competitors.append(competitor)
        evidence_rows.extend(evidence)
        if len(competitors) >= brand_discovery_settings.maximum_competitors:
            break
    return competitors, evidence_rows


async def _discover_competitors(
    row: BrandDiscovery,
    *,
    data: dict,
    homepage: str,
    owned_domain: str,
    captured_text: str,
) -> tuple[list[dict], list[DiscoveryEvidence], list[str]]:
    row.stage = "competitor_verification"
    industry = str(data.get("industry") or "")
    brand_name = str(data["brand_name"])
    seen = {owned_domain}
    terms = _industry_terms(industry)
    search_results = await _firecrawl_competitor_candidates(
        brand_name=brand_name, industry=industry
    )
    candidates = await _safe_agent_competitor_candidates(
        data=data,
        homepage=homepage,
        captured_text=captured_text,
        search_results=search_results,
    )
    competitors, evidence_rows = await _verify_competitor_candidates(
        candidates or search_results,
        brand_name=brand_name,
        industry_terms=terms,
        seen_domains=seen,
    )
    return competitors, evidence_rows, [] if competitors else ["competitors"]


@dataclass(frozen=True, slots=True)
class _SynthesisOutput:
    profile: dict
    competitors: list[dict]
    topics: list[str]
    prompts: list[dict]
    gaps: list[str]


def _grouped_prompt_output(
    prompts: list[dict], *, suggested_topics: list[str], fallback_topic: str
) -> tuple[list[str], list[dict]]:
    """Give every generated prompt one canonical topic and drop orphan topics."""
    canonical = {
        topic.strip().casefold(): topic.strip()
        for topic in suggested_topics
        if topic.strip()
    }
    default_topic = next(iter(canonical.values()), fallback_topic.strip() or "General")
    grouped: list[dict] = []
    topic_names: dict[str, str] = {}
    for prompt in prompts:
        requested = str(prompt.get("theme") or "").strip()
        topic = canonical.get(requested.casefold()) if requested else None
        topic = topic or requested or default_topic
        topic_names.setdefault(topic.casefold(), topic)
        grouped.append({**prompt, "theme": topic})
    return list(topic_names.values()), grouped


def _verified_synthesized_competitors(
    synthesis: DiscoverySynthesis, verified: list[dict]
) -> list[dict]:
    verified_domains = {
        domain for competitor in verified for domain in competitor.get("domains", [])
    }
    normalized = [
        competitor.model_dump()
        for competitor in synthesis.competitors
        if competitor.domains and set(competitor.domains) <= verified_domains
    ]
    return normalized or verified


async def _synthesize_output(
    row: BrandDiscovery,
    *,
    data: dict,
    homepage: str,
    captured_text: str,
    competitors: list[dict],
) -> _SynthesisOutput:
    row.stage = "synthesize_profile_and_prompts"
    industry = str(data.get("industry") or "")
    try:
        synthesis = await _synthesize_discovery(
            data=data,
            homepage=homepage,
            captured_text=captured_text,
            competitors=competitors,
        )
    except (AgentNotConfiguredError, ProviderError, ValueError):
        logger.exception("Brand discovery synthesis failed")
        return _SynthesisOutput(
            profile={
                "description": " ".join(captured_text.split())[:1200],
                "positioning": "",
                "products_services": [],
                "target_audience": "",
                "industry": industry,
                "business_type": "both",
                "price_tier": "unknown",
            },
            competitors=competitors,
            topics=[industry] if industry else [],
            prompts=[],
            gaps=["profile_synthesis", "prompts"],
        )

    normalized_competitors = _verified_synthesized_competitors(synthesis, competitors)
    prompts = _validated_prompt_suggestions(
        synthesis,
        brand_name=str(data["brand_name"]),
        competitors=normalized_competitors,
    )
    topics, prompts = _grouped_prompt_output(
        prompts,
        suggested_topics=list(dict.fromkeys(synthesis.topics))[
            : brand_discovery_settings.synthesis_topic_count
        ],
        fallback_topic=industry,
    )
    return _SynthesisOutput(
        profile=synthesis.profile.model_dump(),
        competitors=normalized_competitors,
        topics=topics,
        prompts=prompts,
        gaps=[],
    )


def _apply_discovery_result(
    row: BrandDiscovery,
    *,
    owned_domain: str,
    evidence: list[DiscoveryEvidence],
    output: _SynthesisOutput,
    gaps: list[str],
) -> None:
    combined_gaps = [*gaps, *output.gaps]
    if not output.competitors:
        combined_gaps.append("competitors")
    if _has_prompt_cohort_gap(output):
        combined_gaps.append("prompts")
    row.profile = output.profile
    row.domains = [owned_domain]
    row.competitors = output.competitors
    row.topics = output.topics
    row.prompt_suggestions = output.prompts
    row.evidence = [item.model_dump(mode="json") for item in evidence]
    row.gaps = list(dict.fromkeys(combined_gaps))
    row.status = DISCOVERY_STATUS_NEEDS_INPUT if row.gaps else DISCOVERY_STATUS_READY
    row.stage = "review"
    row.error_detail = ""


def _has_prompt_cohort_gap(output: _SynthesisOutput) -> bool:
    prompt_cohorts = {prompt.get("cohort") for prompt in output.prompts}
    expected_cohorts = {"core"}
    if output.competitors:
        expected_cohorts.add("comparison")
    return not output.prompts or not expected_cohorts.issubset(prompt_cohorts)


def _existing_discovery_gaps(
    row: BrandDiscovery, collected_gaps: list[str]
) -> list[str]:
    try:
        persisted_gaps = list(row.gaps)
    except Exception:
        # ORM state can be expired after a database error. Never replace the
        # original discovery exception with a failed attribute load.
        persisted_gaps = []
    return list(dict.fromkeys([*collected_gaps, *persisted_gaps]))


async def _commit_discovery_attempt(
    session: AsyncSession, *, original_error: Exception | None
) -> None:
    """Commit user-safe state, then surface failures to the queue owner."""
    try:
        await session.commit()
    except Exception as commit_error:
        await session.rollback()
        if original_error is not None:
            raise original_error from commit_error
        raise
    if original_error is not None:
        raise original_error


async def process_discovery(session: AsyncSession, row: BrandDiscovery) -> None:
    """Discover a complete evidence-grounded brand profile from minimal input."""
    original_error: Exception | None = None
    workspace_id = row.workspace_id
    discovery_id = row.id
    collected_gaps: list[str] = []
    try:
        await _commit_progress(
            session,
            row,
            "normalize_url",
            phase="opening_website",
            completed_steps=0,
        )
        owned = await _collect_owned_site(row, row.input_data)
        collected_gaps = list(owned.gaps)
        pages_read = len(
            {
                item.source_url
                for item in owned.evidence
                if not item.source_url.startswith("user://")
            }
        )
        row.input_data = owned.data
        row.domains = [owned.owned_domain]
        row.evidence = [item.model_dump(mode="json") for item in owned.evidence]
        await _commit_progress(
            session,
            row,
            "crawl_owned_site",
            phase="understanding_business",
            completed_steps=1,
            pages_read=pages_read,
        )
        await _commit_progress(
            session,
            row,
            "competitor_verification",
            phase="finding_competitors",
            completed_steps=2,
            pages_read=pages_read,
        )
        competitors, competitor_evidence, competitor_gaps = await _discover_competitors(
            row,
            data=owned.data,
            homepage=owned.homepage,
            owned_domain=owned.owned_domain,
            captured_text=owned.captured_text,
        )
        collected_gaps.extend(competitor_gaps)
        row.competitors = competitors
        row.evidence = [
            item.model_dump(mode="json")
            for item in [*owned.evidence, *competitor_evidence]
        ]
        await _commit_progress(
            session,
            row,
            "synthesize_profile_and_prompts",
            phase="building_questions",
            completed_steps=3,
            pages_read=pages_read,
            competitors_found=len(competitors),
        )
        output = await _synthesize_output(
            row,
            data=owned.data,
            homepage=owned.homepage,
            captured_text=owned.captured_text,
            competitors=competitors,
        )
        _apply_discovery_result(
            row,
            owned_domain=owned.owned_domain,
            evidence=[*owned.evidence, *competitor_evidence],
            output=output,
            gaps=[*owned.gaps, *competitor_gaps],
        )
        row.progress = _progress(
            phase="preparing_review",
            completed_steps=DISCOVERY_PROGRESS_TOTAL_STEPS - 1,
            previous=row.progress,
            pages_read=pages_read,
            competitors_found=len(output.competitors),
            prompts_prepared=len(output.prompts),
        )
    except Exception as exc:
        original_error = exc
        logger.exception(
            "Brand discovery processing failed",
            extra={"discovery_id": str(discovery_id)},
        )
        existing_gaps = _existing_discovery_gaps(row, collected_gaps)
        await session.rollback()
        row = await get_discovery(
            session,
            workspace_id=workspace_id,
            discovery_id=discovery_id,
            for_update=True,
        )
        row.status = DISCOVERY_STATUS_NEEDS_INPUT
        row.stage = "review"
        row.gaps = list(dict.fromkeys([*existing_gaps, "discovery_unavailable"]))
        row.error_detail = type(exc).__name__
    finally:
        # The user-safe recovery state is durable before the original failure
        # reaches the queue owner and schedules retry/backoff.
        await _commit_discovery_attempt(session, original_error=original_error)


def _confirmed_domains(values: list[str]) -> list[str]:
    normalized: list[str] = []
    for value in values:
        if not value.strip():
            raise BrandDiscoveryError("Confirmed domains cannot be blank")
        normalized.append(_normalized_url(value)[1])
    return list(dict.fromkeys(normalized))


def _suggestion_topic_id(
    suggestion: dict, topics_by_name: dict[str, Topic]
) -> uuid.UUID | None:
    topic = topics_by_name.get(str(suggestion.get("theme") or "").casefold())
    return topic.id if topic is not None else None


def _discovered_project_payload(
    row: BrandDiscovery, requested_name: str | None
) -> ProjectCreate:
    data = row.input_data
    profile = row.profile
    return ProjectCreate(
        name=requested_name or str(data["brand_name"]),
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
    )


def _unique_topic_names(names: list[str]) -> list[str]:
    names_by_key: dict[str, str] = {}
    for name in names:
        names_by_key.setdefault(name.casefold(), name)
    return list(names_by_key.values())


def _discovery_topic_rows(names: list[str], project_id: uuid.UUID) -> list[Topic]:
    return [
        Topic(
            id=uuid.uuid4(),
            project_id=project_id,
            name=name,
            origin="generated",
        )
        for name in _unique_topic_names(names)
    ]


def _discovery_prompt_rows(
    row: BrandDiscovery,
    *,
    prompt_set_id: uuid.UUID,
    topics_by_name: dict[str, Topic],
) -> list[Prompt]:
    return [
        Prompt(
            prompt_set_id=prompt_set_id,
            topic_id=_suggestion_topic_id(suggestion, topics_by_name),
            text=suggestion["text"],
            theme=suggestion.get("theme", ""),
            intent=suggestion["intent"],
            cohort=suggestion["cohort"],
            branded=suggestion["cohort"] == "comparison",
            origin="generated",
            generation_evidence={
                "generator_version": BRAND_DISCOVERY_PROMPT_GENERATOR_VERSION,
                "discovery_id": str(row.id),
            },
        )
        for suggestion in row.prompt_suggestions
    ]


async def _capacity_approved_prompt_rows(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    prompt_set_id: uuid.UUID,
    prompt_rows: list[Prompt],
) -> list[Prompt]:
    approved = await prepare_prompt_inserts(
        session,
        workspace_id=workspace_id,
        prompt_set_id=prompt_set_id,
        texts=[prompt.text for prompt in prompt_rows],
    )
    retained: list[Prompt] = []
    seen: set[str] = set()
    for prompt in prompt_rows:
        prompt_hash = prompt.normalized_text_hash
        if prompt_hash not in approved or prompt_hash in seen:
            continue
        seen.add(prompt_hash)
        retained.append(prompt)
    return retained


async def _persist_project_resources(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    row: BrandDiscovery,
    requested_name: str | None,
) -> tuple[uuid.UUID, SiteCrawl]:
    """Persist project, grouped prompts, and initial crawl in one transaction."""
    project = await create_project(
        session,
        workspace_id=workspace_id,
        payload=_discovered_project_payload(row, requested_name),
        commit=False,
    )
    prompt_set = PromptSet(
        id=uuid.uuid4(), project_id=project.id, name=ONBOARDING_PROMPT_SET_NAME
    )
    session.add(prompt_set)
    prompt_rows = _discovery_prompt_rows(
        row, prompt_set_id=prompt_set.id, topics_by_name={}
    )
    approved_prompts = await _capacity_approved_prompt_rows(
        session,
        workspace_id=workspace_id,
        prompt_set_id=prompt_set.id,
        prompt_rows=prompt_rows,
    )
    if not approved_prompts:
        raise BrandDiscoveryError("No reviewed prompts remain after deduplication")
    approved_comparisons = sum(
        prompt.cohort == "comparison" for prompt in approved_prompts
    )
    if approved_comparisons > int(
        len(approved_prompts) * DISCOVERY_MAX_COMPARISON_SHARE
    ):
        raise BrandDiscoveryError(
            "Comparison prompts cannot exceed 20% after deduplication"
        )
    topic_rows = _discovery_topic_rows(
        _unique_topic_names([prompt.theme for prompt in approved_prompts]), project.id
    )
    session.add_all(topic_rows)
    topics_by_name = {topic.name.casefold(): topic for topic in topic_rows}
    for prompt in approved_prompts:
        topic = topics_by_name.get(prompt.theme.casefold())
        if topic is None:
            raise RuntimeError("Approved onboarding prompt is missing its topic")
        prompt.topic_id = topic.id
    session.add_all(approved_prompts)
    crawl = await start_initial_site_review(
        session,
        workspace_id=workspace_id,
        project_id=project.id,
        commit=False,
    )
    return project.id, crawl


def _apply_grouped_completion(
    row: BrandDiscovery,
    *,
    payload: BrandDiscoveryComplete,
    key: str,
) -> None:
    domains = _confirmed_domains(payload.domains)
    competitors = _confirmed_competitor_items(
        payload.competitors,
        brand_name=str(row.input_data["brand_name"]),
        owned_domains=domains,
    )
    prompts = [
        {**prompt.model_dump(), "theme": group.topic}
        for group in payload.prompt_groups
        for prompt in group.prompts
    ]
    comparison_count = sum(prompt["cohort"] == "comparison" for prompt in prompts)
    if comparison_count > int(len(prompts) * DISCOVERY_MAX_COMPARISON_SHARE):
        raise BrandDiscoveryError(
            "Comparison prompts cannot exceed 20% of the reviewed prompt set"
        )
    if comparison_count and not competitors:
        raise BrandDiscoveryError("Comparison prompts require a confirmed competitor")
    brand_terms = [str(row.input_data["brand_name"])]
    competitor_terms = [
        term
        for competitor in competitors
        for term in [competitor["name"], *competitor.get("aliases", [])]
    ]
    for prompt in prompts:
        if not prompt_identity_is_valid(
            text=str(prompt["text"]),
            cohort=str(prompt["cohort"]),
            intent=str(prompt["intent"]),
            brand_terms=brand_terms,
            competitor_terms=competitor_terms,
        ):
            raise BrandDiscoveryError(
                "Reviewed prompt does not match its core or comparison cohort"
            )
    row.profile = payload.profile.model_dump()
    row.domains = domains
    row.competitors = competitors
    row.topics = _unique_topic_names([group.topic for group in payload.prompt_groups])
    row.prompt_suggestions = prompts
    row.input_data = {**row.input_data, "completion_idempotency_key": key}
    row.gaps = []


async def complete_discovery(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    discovery_id: uuid.UUID,
    payload: BrandDiscoveryComplete,
    idempotency_key: str,
) -> tuple[BrandDiscovery, SiteCrawl]:
    """Atomically finalize reviewed discovery and queue its first site review."""
    key = idempotency_key.strip()
    if not key:
        raise BrandDiscoveryError(IDEMPOTENCY_KEY_REQUIRED)
    row = await get_discovery(
        session,
        workspace_id=workspace_id,
        discovery_id=discovery_id,
        for_update=True,
    )
    existing_key = str(row.input_data.get("completion_idempotency_key") or "")
    if existing_key:
        if existing_key != key:
            raise BrandDiscoveryError(
                "This discovery was already completed with a different Idempotency-Key"
            )
        if row.project_id is None or row.initial_crawl_id is None:
            raise BrandDiscoveryError(
                "Discovery completion is missing activation identity"
            )
        crawl = await session.get(SiteCrawl, row.initial_crawl_id)
        if crawl is None or crawl.workspace_id != workspace_id:
            raise BrandDiscoveryError("Discovery activation could not be found")
        return row, crawl
    if row.status not in {DISCOVERY_STATUS_NEEDS_INPUT, DISCOVERY_STATUS_READY}:
        raise BrandDiscoveryError("Discovery is not ready for completion")

    _apply_grouped_completion(row, payload=payload, key=key)
    project_id, crawl = await _persist_project_resources(
        session,
        workspace_id=workspace_id,
        row=row,
        requested_name=payload.name,
    )
    row.project_id = project_id
    row.initial_crawl_id = crawl.id
    row.status = DISCOVERY_STATUS_PROJECT_CREATED
    row.stage = "complete"
    row.progress = _progress(
        phase="complete",
        completed_steps=DISCOVERY_PROGRESS_TOTAL_STEPS,
        competitors_found=len(row.competitors),
        prompts_prepared=len(row.prompt_suggestions),
        previous=row.progress,
    )
    await session.commit()
    return row, crawl
