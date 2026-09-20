"""Server-owned DataForSEO request construction."""

from __future__ import annotations

from typing import Any

from app.core.config.search_intelligence import ENDPOINTS
from app.domain.demand.search_intelligence.targets import CanonicalTarget


def backlink_filters(target: CanonicalTarget) -> list[Any]:
    prefix = f"{target.origin}/%"
    return [
        ["url_to", "like", prefix],
        "and",
        ["domain_from", "<>", target.registrable_domain],
        "and",
        ["domain_from", "not_like", f"%.{target.registrable_domain}"],
    ]


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
    elif kind in {"backlink_summary", "referring_domains", "destination_pages"}:
        payload = {
            "target": target.registrable_domain,
            "include_subdomains": False,
            "include_indirect_links": False,
            "backlinks_status_type": "live",
            "rank_scale": "one_hundred",
            "backlinks_filters": backlink_filters(target),
        }
        if kind != "backlink_summary":
            payload.update(
                {
                    "limit": limit,
                    "offset": offset,
                    "order_by": [
                        "backlinks,desc",
                        "domain,asc" if kind == "referring_domains" else "url,asc",
                    ],
                }
            )
    else:
        raise ValueError(f"unsupported dataset kind: {kind}")
    return ENDPOINTS[kind], payload
