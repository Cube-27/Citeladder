"""Server-owned DataForSEO request construction."""

from __future__ import annotations

import hashlib
import json
from typing import Any, TypedDict
from urllib.parse import urlsplit, urlunsplit

from app.core.config.search_intelligence import (
    BACKLINK_KINDS,
    BROAD_ENDPOINTS,
    ENDPOINTS,
    KEYWORD_ACQUISITION_FIELDS,
    PARSER_VERSION,
    ResearchScope,
)
from app.domain.demand.search_intelligence.targets import CanonicalTarget


class RequestOptions(TypedDict):
    research_scope: ResearchScope
    grouping: str
    order: str
    min_volume: int | None
    date_from: str
    date_to: str


def backlink_filters(
    target: CanonicalTarget, research_scope: ResearchScope = "exact_host"
) -> list[Any]:
    # These are backlink destination values, not URLs used for network calls.
    # Saved evidence can point to either scheme on the canonical host.
    url_filters: list[Any] = []
    for operator, suffix in (("like", "/%"), ("=", "")):
        for scheme in ("https", "http"):
            origin = urlunsplit((scheme, urlsplit(target.origin).netloc, "", "", ""))
            if url_filters:
                url_filters.append("or")
            url_filters.append(["url_to", operator, f"{origin}{suffix}"])
    exclusions: list[Any] = [
        ["domain_from", "<>", target.registrable_domain],
        "and",
        ["domain_from", "not_like", f"%.{target.registrable_domain}"],
    ]
    if research_scope == "domain_subdomains":
        return exclusions
    return [
        url_filters,
        "and",
        *exclusions,
    ]


def _backlink_request(
    kind: str,
    target: CanonicalTarget,
    limit: int,
    offset: int,
    research_scope: ResearchScope,
    grouping: str,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        # DataForSEO requires a domain target without www; the backlink
        # filter below preserves the saved canonical host within that index.
        "target": target.registrable_domain,
        "include_subdomains": research_scope == "domain_subdomains"
        or target.hostname != target.registrable_domain,
        "include_indirect_links": research_scope == "domain_subdomains",
        "backlinks_status_type": "live",
        "rank_scale": "one_hundred",
        "backlinks_filters": backlink_filters(target, research_scope),
    }
    if kind == "backlinks":
        payload["filters"] = payload.pop("backlinks_filters")
        payload.update(
            mode=grouping,
            limit=limit,
            offset=offset,
            order_by=["rank,desc", "url_from,asc"],
        )
    elif kind != "backlink_summary":
        field = "domain" if kind == "referring_domains" else "url"
        payload.update(
            limit=limit, offset=offset, order_by=["backlinks,desc", f"{field},asc"]
        )
    return payload


def build_request(
    *,
    kind: str,
    target: CanonicalTarget,
    comparison: CanonicalTarget | None,
    location_code: int | None,
    language_code: str,
    limit: int,
    offset: int,
    seed: str = "",
    research_scope: ResearchScope = "exact_host",
    grouping: str = "as_is",
    date_from: str = "",
    date_to: str = "",
    order: str = "volume",
    min_volume: int | None = None,
) -> tuple[str, dict[str, Any]]:
    common_labs: dict[str, Any] = {
        "location_code": location_code,
        "language_code": language_code,
        "limit": limit,
        "offset": offset,
    }
    if kind == "footprint":
        payload = {
            **common_labs,
            "target": target.registrable_domain,
            "filters": ["subdomain", "=", target.hostname],
            "item_types": ["organic"],
            "limit": 1,
            "offset": 0,
        }
    elif kind == "ranking_keywords":
        payload = {
            **common_labs,
            "target": target.registrable_domain,
            "item_types": ["organic"],
            "filters": ["ranked_serp_element.serp_item.domain", "=", target.hostname],
            "order_by": [
                "keyword_data.keyword_info.search_volume,desc",
                "keyword_data.keyword,asc",
            ],
        }
    elif kind in {"missing_keywords", "shared_keywords"}:
        if comparison is None:
            raise ValueError("comparison target is required")
        payload = {
            **common_labs,
            "pages": {"1": f"{comparison.origin}/*", "2": f"{target.origin}/*"},
            "intersection_mode": "union" if kind == "missing_keywords" else "intersect",
            "include_subdomains": False,
            "item_types": ["organic"],
            "order_by": [
                "keyword_data.keyword_info.search_volume,desc",
                "keyword_data.keyword,asc",
            ],
        }
        if kind == "missing_keywords":
            payload["pages"] = {"1": f"{comparison.origin}/*"}
            payload["exclude_pages"] = [f"{target.origin}/*"]
    elif kind == "keyword_suggestions":
        payload = {
            **common_labs,
            "keyword": seed.strip(),
            "exact_match": True,
            "include_seed_keyword": False,
            "include_serp_info": False,
            "order_by": ["keyword_info.search_volume,desc", "keyword,asc"],
        }
    elif kind == "organic_pages":
        payload = _organic_pages_request(common_labs, target, research_scope)
    elif kind == "backlink_history":
        payload = _history_request(target, research_scope, date_from, date_to)
    elif kind in BACKLINK_KINDS:
        payload = _backlink_request(
            kind, target, limit, offset, research_scope, grouping
        )
    else:
        raise ValueError(f"unsupported dataset kind: {kind}")
    endpoint = ENDPOINTS[kind]
    if research_scope == "domain_subdomains":
        endpoint = BROAD_ENDPOINTS.get(kind, endpoint)
        payload = _broad_request(kind, payload, target, comparison)
    _keyword_controls(kind, payload, research_scope, order, min_volume)
    return endpoint, payload


def _organic_pages_request(
    common: dict[str, Any], target: CanonicalTarget, research_scope: ResearchScope
) -> dict[str, Any]:
    payload = {
        **common,
        "target": target.registrable_domain,
        "order_by": ["metrics.organic.etv,desc", "page_address,asc"],
    }
    if research_scope == "exact_host":
        netloc = urlsplit(target.origin).netloc
        payload["filters"] = [
            ["page_address", "like", urlunsplit(("https", netloc, "/%", "", ""))],
            "or",
            ["page_address", "like", urlunsplit(("http", netloc, "/%", "", ""))],
        ]
    return payload


def _history_request(
    target: CanonicalTarget, research_scope: ResearchScope, date_from: str, date_to: str
) -> dict[str, Any]:
    if research_scope != "domain_subdomains" or not date_from or not date_to:
        raise ValueError("history requires broad scope and a finite date interval")
    return {
        "target": target.registrable_domain,
        "date_from": date_from,
        "date_to": date_to,
        "rank_scale": "one_hundred",
    }


def _keyword_controls(
    kind: str,
    payload: dict[str, Any],
    research_scope: ResearchScope,
    order: str,
    min_volume: int | None,
) -> None:
    if kind not in {
        "ranking_keywords",
        "missing_keywords",
        "shared_keywords",
        "keyword_suggestions",
    }:
        return
    prefix = "" if kind == "keyword_suggestions" else "keyword_data."
    if order in KEYWORD_ACQUISITION_FIELDS:
        field = prefix + KEYWORD_ACQUISITION_FIELDS[order]
    elif kind == "ranking_keywords":
        field = "ranked_serp_element.serp_item." + (
            "etv" if order == "traffic" else "rank_group"
        )
    elif (
        kind in {"missing_keywords", "shared_keywords"}
        and research_scope == "domain_subdomains"
    ):
        field = "first_domain_serp_element." + (
            "etv" if order == "traffic" else "rank_group"
        )
    else:
        raise ValueError("Selected acquisition order is not supported by this endpoint")
    direction = "asc" if order in {"position", "difficulty"} else "desc"
    payload["order_by"] = [f"{field},{direction}", f"{prefix}keyword,asc"]
    if min_volume is not None:
        condition = [prefix + "keyword_info.search_volume", ">=", min_volume]
        payload["filters"] = (
            [payload["filters"], "and", condition]
            if payload.get("filters")
            else condition
        )


def _broad_request(
    kind: str,
    payload: dict[str, Any],
    target: CanonicalTarget,
    comparison: CanonicalTarget | None,
) -> dict[str, Any]:
    if kind in {"footprint", "ranking_keywords"}:
        payload.pop("filters", None)
    if kind == "footprint":
        payload.pop("item_types", None)
    if kind in {"missing_keywords", "shared_keywords"}:
        if comparison is None:
            raise ValueError("comparison is required")
        for key in (
            "pages",
            "exclude_pages",
            "intersection_mode",
            "include_subdomains",
        ):
            payload.pop(key, None)
        payload.update(
            target1=comparison.registrable_domain,
            target2=target.registrable_domain,
            intersections=kind == "shared_keywords",
        )
    return payload


def scope_hash(value: dict[str, Any]) -> str:
    encoded = json.dumps(value, sort_keys=True, separators=(",", ":")).encode()
    return hashlib.sha256(encoded).hexdigest()


def request_identity(
    kind: str,
    target: CanonicalTarget,
    comparison: CanonicalTarget | None,
    location_code: int | None,
    language_code: str,
    payload: dict[str, Any],
    research_scope: ResearchScope = "exact_host",
) -> dict[str, Any]:
    stable_payload = {
        key: value for key, value in payload.items() if key not in {"limit", "offset"}
    }
    return {
        "kind": kind,
        "research_scope": research_scope,
        "target": target.public_dict(),
        "comparison": comparison.public_dict() if comparison else None,
        "location_code": location_code if kind not in BACKLINK_KINDS else None,
        "language_code": language_code if kind not in BACKLINK_KINDS else "",
        "provider": stable_payload,
        "parser_version": PARSER_VERSION,
    }
