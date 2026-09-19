"""One optional search and one model request for provisional competitors."""

from __future__ import annotations

import json
from dataclasses import dataclass

from pydantic import BaseModel, Field

from app.connectors.agent.gateway import ModelGateway
from app.connectors.keenable import KeenableClient
from app.core.config.brand_discovery import (
    BRAND_COMPETITOR_SUGGESTION_VERSION,
    COMPETITOR_EXCLUDED_DOMAINS,
    COMPETITOR_SUGGESTION_SYSTEM_PROMPT,
    brand_discovery_settings,
)
from app.core.config.observed_competitors import EXCLUDED_RESEARCH_DOMAINS
from app.domain.projects.discovery_schemas import (
    DiscoveryCompetitorSuggestion,
    DiscoveryProfile,
)
from app.domain.projects.onboarding.normalization import (
    InvalidWebsiteUrl,
    normalize_website_url,
)
from app.domain.projects.onboarding.research_evidence import (
    CompetitiveSignature,
    ResearchCallBudget,
    ResearchEvidenceItem,
    bounded_evidence,
)
from app.domain.projects.onboarding.structured_generation import (
    complete_validated_envelope,
)


class NamedCompetitor(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    domain: str = Field(min_length=1, max_length=255)


class CompetitorSuggestionEnvelope(BaseModel):
    competitors: list[NamedCompetitor] = Field(default_factory=list)


@dataclass(frozen=True, slots=True)
class CompetitorResearchResult:
    evidence: tuple[ResearchEvidenceItem, ...]
    state: str


def competitor_query(
    signature: CompetitiveSignature, market: str, *, brand_name: str
) -> str:
    company = " ".join(brand_name.split()[:6])
    category = " ".join(signature.category.split()[:6])
    place = " ".join((market or signature.market_context).split()[:3])
    return f"{company} {category} {place} competitors".strip()


async def discover_competitor_candidates(
    client: KeenableClient,
    *,
    brand_name: str,
    owned_domain: str,
    signature: CompetitiveSignature,
    budget: ResearchCallBudget,
    market: str = "",
) -> CompetitorResearchResult:
    if not signature.category or not budget.take(1):
        return CompetitorResearchResult((), "unavailable")
    try:
        response = await client.search(
            competitor_query(signature, market, brand_name=brand_name),
            max_results=brand_discovery_settings.competitor_search_max_results,
            snippet_max_length=brand_discovery_settings.keenable_snippet_max_chars,
        )
    except Exception:  # noqa: BLE001 - optional search must not block suggestions
        return CompetitorResearchResult((), "failed")
    evidence: list[ResearchEvidenceItem] = []
    seen: set[str] = set()
    for result in response.results:
        try:
            _, domain = normalize_website_url(result.url)
        except InvalidWebsiteUrl:
            continue
        if domain == owned_domain or domain in seen or _excluded_domain(domain):
            continue
        seen.add(domain)
        evidence.append(
            ResearchEvidenceItem(
                evidence_ref=f"kc-search-{len(evidence) + 1}",
                source_url=result.url,
                title=result.title,
                text=(result.snippet or result.description)[
                    : brand_discovery_settings.keenable_snippet_max_chars
                ],
                source_kind="external_search",
                provider="keenable",
                query_ref="competitor-company-category-market",
                published_at=result.published_at,
                acquired_at=result.acquired_at,
                supports=["competitors"],
            )
        )
    return CompetitorResearchResult(
        tuple(evidence), "ready" if evidence else "no_results"
    )


async def suggest_competitors(
    client: ModelGateway,
    *,
    profile: DiscoveryProfile,
    signature: CompetitiveSignature,
    evidence: tuple[ResearchEvidenceItem, ...],
    brand_name: str,
    owned_domain: str,
) -> list[DiscoveryCompetitorSuggestion]:
    bounded = bounded_evidence(
        evidence,
        max_chars=brand_discovery_settings.competitor_suggestion_evidence_max_chars,
    )
    request = json.dumps(
        {
            "prompt_version": BRAND_COMPETITOR_SUGGESTION_VERSION,
            "brand_name": brand_name,
            "brand_profile": profile.model_dump(mode="json"),
            "competitive_signature": signature.model_dump(mode="json"),
            "maximum_suggestions": (
                brand_discovery_settings.competitor_suggestion_maximum
            ),
            "search_snippets": [item.model_dump(mode="json") for item in bounded],
        },
        ensure_ascii=False,
    )
    envelope = await complete_validated_envelope(
        client,
        system=COMPETITOR_SUGGESTION_SYSTEM_PROMPT,
        user=request,
        schema_name="competitor_suggestions",
        envelope_type=CompetitorSuggestionEnvelope,
        validate=lambda _envelope: None,
        maximum_attempts=brand_discovery_settings.competitor_model_maximum_attempts,
        timeout_seconds=brand_discovery_settings.research_model_timeout_seconds,
    )
    seen_names: set[str] = set()
    seen_domains: set[str] = set()
    admitted: list[DiscoveryCompetitorSuggestion] = []
    for item in envelope.competitors:
        name = " ".join(item.name.split())
        try:
            _, domain = normalize_website_url(item.domain)
        except InvalidWebsiteUrl:
            continue
        if (
            not name
            or name.casefold() == brand_name.casefold()
            or name.casefold() in seen_names
            or domain == owned_domain
            or domain in seen_domains
            or _excluded_domain(domain)
        ):
            continue
        seen_names.add(name.casefold())
        seen_domains.add(domain)
        admitted.append(DiscoveryCompetitorSuggestion(name=name, domains=[domain]))
        if len(admitted) >= brand_discovery_settings.competitor_suggestion_maximum:
            break
    return admitted


def _excluded_domain(domain: str) -> bool:
    return any(
        domain == excluded or domain.endswith(f".{excluded}")
        for excluded in (*COMPETITOR_EXCLUDED_DOMAINS, *EXCLUDED_RESEARCH_DOMAINS)
    )
