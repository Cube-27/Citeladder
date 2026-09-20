"""Scope-validating normalization for DataForSEO research responses."""

from __future__ import annotations

import hashlib
import json
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


def _host(url: str) -> str:
    return (urlsplit(url).hostname or "").casefold().strip(".")


def _prefix_ok(url: str, origin: str) -> bool:
    parts = urlsplit(url)
    expected = urlsplit(origin)
    return (
        parts.scheme in {"http", "https"}
        and parts.hostname == expected.hostname
        and (parts.path == "" or parts.path.startswith("/"))
        and parts.port == expected.port
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


def _footprint_summary(rows: list[object], hostname: str) -> dict[str, Any]:
    matches = _matching_footprints(rows, hostname)
    if len(matches) > 1:
        raise ValueError("provider returned duplicate exact-host footprint rows")
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
    }


def _ranking_row(item: dict[str, Any], *, hostname: str, origin: str) -> dict[str, Any]:
    keyword, volume, difficulty, intent = _keyword_data(item)
    organic = _organic_item(item.get("ranked_serp_element"))
    url = str(organic.get("url") or "")
    if url and (_host(url) != hostname or not _prefix_ok(url, origin)):
        raise ValueError("ranking row escaped the canonical host scope")
    return {
        "keyword": keyword,
        "search_volume": volume,
        "difficulty": difficulty,
        "intent": intent,
        "rank_group": _integer(organic.get("rank_group")),
        "url": url,
        "etv": _number(organic.get("etv")),
        "auxiliary": {"provider_updated_at": item.get("last_updated_time")},
    }


def _comparison_row(
    item: dict[str, Any], *, origin: str, competitor_origin: str
) -> dict[str, Any]:
    keyword, volume, difficulty, intent = _keyword_data(item)
    intersections = _dictionary(item.get("intersection_result"))
    competitor = _organic_item(intersections.get("1"))
    owned = _organic_item(intersections.get("2"))
    competitor_url = str(competitor.get("url") or "")
    owned_url = str(owned.get("url") or "")
    if competitor_url and not _prefix_ok(competitor_url, competitor_origin):
        raise ValueError("comparison row escaped competitor canonical prefix")
    if owned_url and not _prefix_ok(owned_url, origin):
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
        "auxiliary": {"position_status": "not_checked"},
    }


def _referring_domain_row(item: dict[str, Any], target_domain: str) -> dict[str, Any]:
    domain = str(item.get("domain") or "").casefold()
    if domain == target_domain or domain.endswith(f".{target_domain}"):
        raise ValueError("internal referring domain escaped provider filter")
    return {
        "domain": domain,
        "backlinks": _integer(item.get("backlinks")),
        "dataforseo_rank": _integer(item.get("rank")),
        "auxiliary": {"rank_scale": "one_hundred", "object_type": "referring_domain"},
    }


def _destination_page_row(item: dict[str, Any], origin: str) -> dict[str, Any]:
    url = str(item.get("url") or "")
    if not _prefix_ok(url, origin):
        raise ValueError("destination page escaped canonical prefix")
    return {
        "url": url,
        "backlinks": _integer(item.get("backlinks")),
        "referring_main_domains": _integer(item.get("referring_main_domains")),
        "dataforseo_rank": _integer(item.get("rank")),
        "auxiliary": {"rank_scale": "one_hundred", "object_type": "destination_page"},
    }


def _normalize_row(
    kind: str, item: dict[str, Any], plan: dict[str, Any]
) -> dict[str, Any]:
    target = _dictionary(plan["target"])
    origin = str(target["origin"])
    if kind == "ranking_keywords":
        return _ranking_row(item, hostname=str(target["hostname"]), origin=origin)
    if kind in {"missing_keywords", "shared_keywords"}:
        comparison = _dictionary(plan.get("comparison"))
        return _comparison_row(
            item, origin=origin, competitor_origin=str(comparison.get("origin") or "")
        )
    if kind == "keyword_suggestions":
        return _suggestion_row(item)
    if kind == "referring_domains":
        return _referring_domain_row(item, str(target["registrable_domain"]))
    if kind == "destination_pages":
        return _destination_page_row(item, origin)
    raise ValueError(f"unsupported dataset kind: {kind}")


def normalize_result(
    kind: str, result: dict[str, Any], plan: dict[str, Any]
) -> tuple[dict[str, Any], list[dict[str, Any]], int | None]:
    raw_items = result.get("items")
    items: list[object] = raw_items if isinstance(raw_items, list) else []
    target = _dictionary(plan["target"])
    total = _integer(result.get("total_count"))
    if kind == "footprint":
        return _footprint_summary(items, str(target["hostname"])), [], total
    if kind == "backlink_summary":
        return (
            {
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
        row["provider_row_key"] = _stable_key(
            kind, (row.get("keyword"), row.get("domain"), row.get("url"))
        )
    return {}, normalized, total


def normalize_response(
    kind: str, body: dict[str, Any], plan: dict[str, Any]
) -> tuple[dict[str, Any], list[dict[str, Any]], int | None]:
    return normalize_result(kind, _task_result(body), plan)
