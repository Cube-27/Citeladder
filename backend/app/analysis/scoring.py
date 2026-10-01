"""Persisted identity and citation classification for Python source inspection
and MCP AIO reads. Audit scoring is native; these read helpers retire with
those consumers in migration PRs 18 and 19."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any
from urllib.parse import urlparse

from app.analysis.normalization import (
    domain_matches,
    normalize_domain,
)
from app.connectors.answer_engines.grounding_redirect import (
    is_grounding_redirect,
)


@dataclass(frozen=True)
class CompetitorConfig:
    name: str
    aliases: tuple[str, ...]
    domains: tuple[str, ...]


def _competitor_configs(config: dict[str, Any]) -> tuple[CompetitorConfig, ...]:
    return tuple(
        CompetitorConfig(
            name=str(item.get("name") or ""),
            aliases=tuple(
                str(alias)
                for alias in ([item.get("name"), *(item.get("aliases") or [])])
                if alias
            ),
            domains=tuple(
                str(domain) for domain in (item.get("domains") or []) if domain
            ),
        )
        for item in (config.get("competitors") or [])
    )


@dataclass(frozen=True)
class ScoringConfig:
    brand_name: str
    brand_aliases: tuple[str, ...]
    owned_domains: tuple[str, ...]
    unintended_domains: tuple[str, ...]
    country_code: str = ""
    language_code: str = ""
    benchmark_mode: str = ""
    provider: str = ""
    model: str = ""
    products_services: tuple[str, ...] = field(default_factory=tuple)
    competitors: tuple[CompetitorConfig, ...] = field(default_factory=tuple)

    @classmethod
    def from_project(cls, config: dict[str, Any]) -> ScoringConfig:
        brand_name = _config_text(config, "brand_name")
        aliases = [brand_name, *(config.get("brand_aliases") or [])]
        return cls(
            brand_name=brand_name,
            brand_aliases=tuple(alias for alias in aliases if alias),
            owned_domains=tuple(config.get("owned_domains") or []),
            unintended_domains=tuple(config.get("unintended_domains") or []),
            country_code=_config_text(config, "country_code"),
            language_code=_config_text(config, "language_code"),
            benchmark_mode=_config_text(config, "benchmark_mode"),
            provider=_config_text(config, "provider"),
            model=_config_text(config, "model"),
            products_services=tuple(config.get("products_services") or []),
            competitors=_competitor_configs(config),
        )


def _config_text(config: dict[str, Any], key: str) -> str:
    return str(config.get(key) or "")


def _domain_in(domain: str, targets: tuple[str, ...]) -> bool:
    return any(domain_matches(domain, target) for target in targets)


def _url_domain(value: Any) -> str:
    raw = str(value or "").strip()
    if not raw:
        return ""
    try:
        return normalize_domain(urlparse(raw).hostname or "")
    except ValueError:
        return ""


def citation_domain(citation: dict[str, Any]) -> str:
    """Resolve publisher identity using strongest available URL evidence."""
    resolved = _url_domain(citation.get("resolved_url"))
    if resolved:
        return resolved
    annotation_url = citation.get("redirect_url") or citation.get("url")
    direct = _url_domain(annotation_url)
    if direct and not is_grounding_redirect(annotation_url):
        return direct
    return normalize_domain(citation.get("domain") or citation.get("title"))


def classify_citation(
    citation: dict[str, Any], config: ScoringConfig
) -> dict[str, Any]:
    """Annotate a raw citation dict with ownership/competitor classification."""
    domain = citation_domain(citation)
    matched_competitor = None
    for competitor in config.competitors:
        if _domain_in(domain, competitor.domains):
            matched_competitor = competitor.name
            break
    return {
        **citation,
        "domain": domain,
        "is_owned": _domain_in(domain, config.owned_domains),
        "is_unintended": _domain_in(domain, config.unintended_domains),
        "matched_competitor": matched_competitor,
    }
