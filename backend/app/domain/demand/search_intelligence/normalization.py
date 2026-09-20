"""Scope-validating normalization for DataForSEO research responses."""

from __future__ import annotations

import hashlib
import json
from datetime import date
from decimal import Decimal, InvalidOperation
from typing import Any
from urllib.parse import urlsplit


def _number(value: object) -> Decimal | None:
    if value is None or isinstance(value, bool):
        return None
    try:
        parsed = Decimal(str(value))
    except (InvalidOperation, ValueError):
        return None
    return parsed if parsed.is_finite() else None


def _integer(value: object) -> int | None:
    number = _number(value)
    return (
        int(number)
        if number is not None and number == number.to_integral_value()
        else None
    )


def _task_result(body: dict[str, Any]) -> dict[str, Any]:
    tasks = body.get("tasks")
    task = tasks[0] if isinstance(tasks, list) and tasks else {}
    results = task.get("result") if isinstance(task, dict) else None
    result = results[0] if isinstance(results, list) and results else {}
    return result if isinstance(result, dict) else {}


def _prefix_ok(url: str, origin: str, domain: str = "") -> bool:
    parts = urlsplit(url)
    expected = urlsplit(origin)
    return (
        parts.scheme in {"http", "https"}
        and (
            parts.hostname == domain or (parts.hostname or "").endswith(f".{domain}")
            if domain
            else parts.hostname == expected.hostname
        )
        and (parts.path == "" or parts.path.startswith("/"))
        and (bool(domain) or parts.port == expected.port)
    )


def _stable_key(kind: str, values: tuple[object, ...]) -> str:
    raw = json.dumps(
        [kind, *values], sort_keys=True, separators=(",", ":"), default=str
    ).encode()
    return hashlib.sha256(raw).hexdigest()


def _organic_item(value: object) -> dict[str, Any]:
    if not isinstance(value, dict):
        return {}
    item = value.get("serp_item") if "serp_item" in value else value
    return (
        item
        if isinstance(item, dict) and item.get("type", "organic") == "organic"
        else {}
    )


def _keyword_data(
    item: dict[str, Any], *, suggestion: bool = False
) -> tuple[str, int | None, int | None, str]:
    data = item if suggestion else _dictionary(item.get("keyword_data"))
    info = _dictionary(data.get("keyword_info"))
    properties = _dictionary(data.get("keyword_properties"))
    intent_info = _dictionary(data.get("search_intent_info"))
    intents = intent_info.get("main_intent") or intent_info.get("foreign_intent") or ""
    if isinstance(intents, list):
        intents = ", ".join(str(value) for value in intents)
    return (
        str(data.get("keyword") or ""),
        _integer(info.get("search_volume")),
        _integer(properties.get("keyword_difficulty")),
        str(intents),
    )


def _dictionary(value: object) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _matching_footprints(rows: list[object], hostname: str) -> list[dict[str, Any]]:
    matches: list[dict[str, Any]] = []
    for row in rows:
        if (
            isinstance(row, dict)
            and str(row.get("subdomain") or "").casefold() == hostname
        ):
            matches.append(row)
    return matches


def _top_ten(organic: dict[str, Any]) -> int | None:
    first = _integer(organic.get("pos_1"))
    second = _integer(organic.get("pos_2_3"))
    third = _integer(organic.get("pos_4_10"))
    if first is None or second is None or third is None:
        return None
    return first + second + third


def _footprint_summary(
    rows: list[object], hostname: str, broad: bool = False
) -> dict[str, Any]:
    matches = (
        [row for row in rows if isinstance(row, dict)]
        if broad
        else _matching_footprints(rows, hostname)
    )
    if len(matches) > 1:
        raise ValueError("provider returned duplicate footprint rows")
    if not matches:
        return {}
    organic = _dictionary(_dictionary(matches[0].get("metrics")).get("organic"))
    top10 = _top_ten(organic)
    count = _integer(organic.get("count"))
    traffic = _number(organic.get("etv"))
    percentage = None
    if top10 is not None and count is not None and count > 0:
        percentage = str(Decimal(top10) * 100 / count)
    return {
        "organic_keywords": count,
        "estimated_monthly_traffic": str(traffic) if traffic is not None else None,
        "top_10_keywords": top10,
        "top_10_percentage": percentage,
        "ranking_buckets": {
            key: _integer(value)
            for key, value in organic.items()
            if key.startswith("pos_")
        },
    }


def _ranking_row(
    item: dict[str, Any], *, origin: str, domain: str = ""
) -> dict[str, Any]:
    keyword, volume, difficulty, intent = _keyword_data(item)
    organic = _organic_item(item.get("ranked_serp_element"))
    url = str(organic.get("url") or "")
    if url and not _prefix_ok(url, origin, domain):
        raise ValueError("ranking row escaped the canonical host scope")
    return {
        "keyword": keyword,
        "search_volume": volume,
        "difficulty": difficulty,
        "intent": intent,
        "rank_group": _integer(organic.get("rank_group")),
        "url": url,
        "etv": _number(organic.get("etv")),
        "auxiliary": {
            **_keyword_details(item),
            "rank_absolute": _integer(organic.get("rank_absolute")),
        },
    }


def _comparison_row(
    item: dict[str, Any],
    *,
    origin: str,
    competitor_origin: str,
    domain: str = "",
    competitor_domain: str = "",
) -> dict[str, Any]:
    keyword, volume, difficulty, intent = _keyword_data(item)
    intersections = _dictionary(item.get("intersection_result"))
    competitor = _organic_item(
        item.get("first_domain_serp_element") if domain else intersections.get("1")
    )
    owned = _organic_item(
        item.get("second_domain_serp_element") if domain else intersections.get("2")
    )
    competitor_url = str(competitor.get("url") or "")
    owned_url = str(owned.get("url") or "")
    if competitor_url and not _prefix_ok(
        competitor_url, competitor_origin, competitor_domain
    ):
        raise ValueError("comparison row escaped competitor canonical prefix")
    if owned_url and not _prefix_ok(owned_url, origin, domain):
        raise ValueError("comparison row escaped owned canonical prefix")
    owned_etv = _number(owned.get("etv"))
    return {
        "keyword": keyword,
        "search_volume": volume,
        "difficulty": difficulty,
        "intent": intent,
        "rank_group": _integer(competitor.get("rank_group")),
        "owned_rank_group": _integer(owned.get("rank_group")),
        "url": competitor_url,
        "etv": _number(competitor.get("etv")),
        "auxiliary": {
            **_keyword_details(item),
            "rank_absolute": _integer(competitor.get("rank_absolute")),
            "owned_url": owned_url,
            "owned_etv": str(owned_etv) if owned_etv is not None else None,
        },
    }


def _suggestion_row(item: dict[str, Any]) -> dict[str, Any]:
    keyword, volume, difficulty, intent = _keyword_data(item, suggestion=True)
    return {
        "keyword": keyword,
        "search_volume": volume,
        "difficulty": difficulty,
        "intent": intent,
        "auxiliary": {
            **_keyword_details(item, suggestion=True),
            "position_status": "not_checked",
        },
    }


def _keyword_details(item: dict[str, Any], suggestion: bool = False) -> dict[str, Any]:
    data = item if suggestion else _dictionary(item.get("keyword_data"))
    info = _dictionary(data.get("keyword_info"))
    cpc = _number(info.get("cpc"))
    return {
        "cpc": str(cpc) if cpc is not None else None,
        "cpc_currency": "USD",
        "provider_updated_at": info.get("last_updated_time"),
        "serp_updated_at": _dictionary(data.get("serp_info")).get("last_updated_time"),
    }


def _backlink_details(item: dict[str, Any]) -> dict[str, Any]:
    return {
        key: _integer(item.get(key))
        for key in (
            "referring_domains",
            "referring_pages",
            "broken_backlinks",
            "broken_pages",
            "backlinks_spam_score",
            "rank",
            "domain_from_rank",
            "page_from_rank",
            "page_to_rank",
            "links_count",
            "new_backlinks",
            "lost_backlinks",
            "new_referring_domains",
            "lost_referring_domains",
        )
    } | {
        "target_spam_score": _integer(
            _dictionary(item.get("info")).get("target_spam_score")
        ),
        "first_seen": item.get("first_seen"),
    }


def _referring_domain_row(item: dict[str, Any], target_domain: str) -> dict[str, Any]:
    domain = str(item.get("domain") or "").casefold()
    if domain == target_domain or domain.endswith(f".{target_domain}"):
        raise ValueError("internal referring domain escaped provider filter")
    return {
        "domain": domain,
        "backlinks": _integer(item.get("backlinks")),
        "dataforseo_rank": _integer(item.get("rank")),
        "auxiliary": {
            **_backlink_details(item),
            "rank_scale": "one_hundred",
            "object_type": "referring_domain",
        },
    }


def _destination_page_row(
    item: dict[str, Any], origin: str, domain: str = ""
) -> dict[str, Any]:
    url = str(item.get("url") or "")
    if not _prefix_ok(url, origin, domain):
        raise ValueError("destination page escaped canonical prefix")
    return {
        "url": url,
        "backlinks": _integer(item.get("backlinks")),
        "referring_main_domains": _integer(item.get("referring_main_domains")),
        "dataforseo_rank": _integer(item.get("rank")),
        "auxiliary": {
            **_backlink_details(item),
            "rank_scale": "one_hundred",
            "object_type": "destination_page",
        },
    }


def _backlink_row(
    item: dict[str, Any], origin: str, domain: str, root: str
) -> dict[str, Any]:
    url = str(item.get("url_to") or "")
    if not _prefix_ok(url, origin, domain):
        raise ValueError("backlink destination escaped scope")
    source = str(item.get("domain_from") or "").casefold()
    if source == root or source.endswith(f".{root}"):
        raise ValueError("internal backlink escaped filter")
    return {
        "domain": source,
        "url": url,
        "dataforseo_rank": _integer(item.get("rank")),
        "auxiliary": {
            **_backlink_details(item),
            "rank_scale": "one_hundred",
            "object_type": "backlink",
            **{
                key: item.get(key)
                for key in (
                    "url_from",
                    "anchor",
                    "item_type",
                    "attributes",
                    "dofollow",
                    "last_seen",
                    "prev_seen",
                    "last_visited",
                    "lost_date",
                    "is_new",
                    "is_lost",
                    "is_broken",
                )
            },
        },
    }


def _history_row(item: dict[str, Any], plan: dict[str, Any]) -> dict[str, Any]:
    observation = str(item.get("date") or "")
    date.fromisoformat(observation[:10])
    request = plan["request"]
    if not request["date_from"] <= observation[:10] <= request["date_to"]:
        raise ValueError("history observation escaped reviewed dates")
    return {
        "backlinks": _integer(item.get("backlinks")),
        "referring_main_domains": _integer(item.get("referring_main_domains")),
        "auxiliary": {**_backlink_details(item), "date": observation},
    }


def _scope_domain(target: dict[str, Any], plan: dict[str, Any]) -> str:
    return (
        str(target.get("registrable_domain") or "")
        if plan.get("research_scope") == "domain_subdomains"
        else ""
    )


def _normalize_row(
    kind: str, item: dict[str, Any], plan: dict[str, Any]
) -> dict[str, Any]:
    target = _dictionary(plan["target"])
    origin = str(target["origin"])
    domain = _scope_domain(target, plan)
    if kind == "ranking_keywords":
        return _ranking_row(item, origin=origin, domain=domain)
    if kind in {"missing_keywords", "shared_keywords"}:
        comparison = _dictionary(plan.get("comparison"))
        return _comparison_row(
            item,
            origin=origin,
            competitor_origin=str(comparison.get("origin") or ""),
            domain=domain,
            competitor_domain=_scope_domain(comparison, plan),
        )
    if kind == "keyword_suggestions":
        return _suggestion_row(item)
    if kind == "referring_domains":
        return _referring_domain_row(item, str(target["registrable_domain"]))
    if kind == "destination_pages":
        return _destination_page_row(item, origin, domain)
    if kind == "organic_pages":
        url = str(item.get("page_address") or "")
        if not _prefix_ok(url, origin, domain):
            raise ValueError("organic page escaped scope")
        organic = _dictionary(_dictionary(item.get("metrics")).get("organic"))
        return {
            "url": url,
            "etv": _number(organic.get("etv")),
            "auxiliary": {
                "organic_keywords": _integer(organic.get("count")),
                "provider_updated_at": item.get("last_updated_time"),
            },
        }
    if kind == "backlinks":
        return _backlink_row(item, origin, domain, str(target["registrable_domain"]))
    if kind == "backlink_history":
        return _history_row(item, plan)
    raise ValueError(f"unsupported dataset kind: {kind}")


def _validate_result_scope(result: dict[str, Any], plan: dict[str, Any]) -> None:
    request = _dictionary(plan.get("request"))
    for key in ("target", "target1", "target2"):
        expected = request.get(key)
        returned = result.get(key)
        if expected is not None and returned is not None and returned != expected:
            raise ValueError("provider aggregate escaped reviewed target scope")


def normalize_result(
    kind: str, result: dict[str, Any], plan: dict[str, Any]
) -> tuple[dict[str, Any], list[dict[str, Any]], int | None]:
    _validate_result_scope(result, plan)
    raw_items = result.get("items")
    items: list[object] = raw_items if isinstance(raw_items, list) else []
    target = _dictionary(plan["target"])
    total = _integer(result.get("total_count"))
    if kind == "footprint":
        return (
            _footprint_summary(
                items,
                str(target["hostname"]),
                plan.get("research_scope") == "domain_subdomains",
            ),
            [],
            total,
        )
    if kind == "backlink_summary":
        return (
            {
                **_backlink_details(result),
                "backlinks": _integer(result.get("backlinks")),
                "referring_main_domains": _integer(
                    result.get("referring_main_domains")
                ),
                "rank": _integer(result.get("rank")),
                "rank_scale": "one_hundred",
                "object_type": "analyzed_domain",
            },
            [],
            total,
        )
    normalized = [
        _normalize_row(kind, item, plan) for item in items if isinstance(item, dict)
    ]
    for row in normalized:
        auxiliary = row.get("auxiliary", {})
        row["provider_row_key"] = _stable_key(
            kind,
            (
                row.get("keyword"),
                row.get("domain"),
                row.get("url"),
                auxiliary.get("url_from"),
                auxiliary.get("date"),
                auxiliary.get("anchor"),
                auxiliary.get("item_type"),
            ),
        )
    return {}, normalized, total


def normalize_response(
    kind: str, body: dict[str, Any], plan: dict[str, Any]
) -> tuple[dict[str, Any], list[dict[str, Any]], int | None]:
    result = _task_result(body)
    summary, rows, total = normalize_result(kind, result, plan)
    items = result.get("items")
    received = len(items) if isinstance(items, list) else 0
    if kind == "backlink_summary" and any(
        result.get(field) is not None
        for field in ("backlinks", "referring_main_domains", "rank")
    ):
        received = 1
    return (
        {
            **summary,
            "result_available": bool(result),
            "provider_items_received": received,
        },
        rows,
        total,
    )
