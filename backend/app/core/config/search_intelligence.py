"""Search Intelligence policy, pricing, and provider request contracts."""

from __future__ import annotations

from dataclasses import dataclass
from decimal import ROUND_CEILING, Decimal
from math import ceil
from typing import Final, Literal

PRICE_VERSION: Final = "dataforseo-standard-2026-09-20"
PARSER_VERSION: Final = "1"
REUSE_DAYS: Final = 30
REVIEW_TTL_SECONDS: Final = 600
PROVIDER_PAGE_SIZE: Final = 1000
MAX_SAFE_DEPTH: Final = 1_000_000
ROW_SORT_FIELDS: Final = frozenset(
    {
        "id",
        "keyword",
        "domain",
        "url",
        "search_volume",
        "difficulty",
        "intent",
        "rank_group",
        "owned_rank_group",
        "etv",
        "backlinks",
        "referring_main_domains",
        "dataforseo_rank",
    }
)

LABS_TASK_USD: Final = Decimal("0.012")
LABS_ITEM_USD: Final = Decimal("0.00012")
BACKLINKS_REQUEST_USD: Final = Decimal("0.024")
BACKLINKS_ROW_USD: Final = Decimal("0.000036")

DatasetKind = Literal[
    "footprint",
    "ranking_keywords",
    "missing_keywords",
    "shared_keywords",
    "keyword_suggestions",
    "backlink_summary",
    "referring_domains",
    "destination_pages",
    "citation_matches",
]

LIST_KINDS: Final = frozenset(
    {
        "ranking_keywords",
        "missing_keywords",
        "shared_keywords",
        "keyword_suggestions",
        "referring_domains",
        "destination_pages",
    }
)
LABS_KINDS: Final = frozenset(
    {
        "footprint",
        "ranking_keywords",
        "missing_keywords",
        "shared_keywords",
        "keyword_suggestions",
    }
)
BACKLINK_KINDS: Final = frozenset(
    {
        "backlink_summary",
        "referring_domains",
        "destination_pages",
    }
)
DEFAULT_DEPTHS: Final = {
    "ranking_keywords": 200,
    "missing_keywords": 100,
    "shared_keywords": 100,
    "referring_domains": 100,
    "destination_pages": 100,
    "keyword_suggestions": 150,
}

ENDPOINTS: Final = {
    "footprint": "/v3/dataforseo_labs/google/subdomains/live",
    "ranking_keywords": "/v3/dataforseo_labs/google/ranked_keywords/live",
    "missing_keywords": "/v3/dataforseo_labs/google/page_intersection/live",
    "shared_keywords": "/v3/dataforseo_labs/google/page_intersection/live",
    "keyword_suggestions": "/v3/dataforseo_labs/google/keyword_suggestions/live",
    "backlink_summary": "/v3/backlinks/summary/live",
    "referring_domains": "/v3/backlinks/referring_domains/live",
    "destination_pages": "/v3/backlinks/domain_pages_summary/live",
}


@dataclass(frozen=True, slots=True)
class QuoteLine:
    dataset_kind: str
    targets: int
    requested_rows: int
    calls: int
    estimated_usd: Decimal


def validate_depth(value: int) -> int:
    if isinstance(value, bool) or value < 1 or value > MAX_SAFE_DEPTH:
        raise ValueError(f"depth must be an integer between 1 and {MAX_SAFE_DEPTH}")
    return value


def page_count(rows: int) -> int:
    return ceil(validate_depth(rows) / PROVIDER_PAGE_SIZE)


def page_sizes(rows: int) -> tuple[int, ...]:
    remaining = validate_depth(rows)
    result: list[int] = []
    while remaining:
        size = min(PROVIDER_PAGE_SIZE, remaining)
        result.append(size)
        remaining -= size
    return tuple(result)


def estimate_dataset(kind: str, *, rows: int, targets: int = 1) -> QuoteLine:
    if targets < 1:
        raise ValueError("targets must be positive")
    if kind not in ENDPOINTS:
        raise ValueError(f"unsupported dataset kind: {kind}")
    requested = validate_depth(rows)
    pages = page_count(requested) if kind in LIST_KINDS else 1
    if kind in LABS_KINDS:
        amount = (LABS_TASK_USD * pages) + (LABS_ITEM_USD * requested)
    else:
        amount = (BACKLINKS_REQUEST_USD * pages) + (BACKLINKS_ROW_USD * requested)
    return QuoteLine(
        kind, targets, requested * targets, pages * targets, amount * targets
    )


def quote_total(lines: tuple[QuoteLine, ...]) -> Decimal:
    return sum((line.estimated_usd for line in lines), Decimal("0"))


def display_upper_usd(value: Decimal) -> str:
    """Round an estimate upward to four decimals without hiding fractional cents."""
    return str(value.quantize(Decimal("0.0001"), rounding=ROUND_CEILING))
