"""Application-funded Firecrawl fallback; secrets remain backend-only."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import Any

import httpx

from app.connectors.answer_engines.errors import parse_retry_after
from app.core.config.brand_discovery import brand_discovery_settings


class FirecrawlUnavailableError(RuntimeError):
    pass


@dataclass(frozen=True, slots=True)
class FirecrawlPage:
    url: str
    title: str
    text: str


def _headers() -> dict[str, str]:
    key = brand_discovery_settings.firecrawl_api_key
    if key is None or not key.get_secret_value().strip():
        raise FirecrawlUnavailableError("firecrawl_not_configured")
    return {"Authorization": f"Bearer {key.get_secret_value()}"}


async def _post(path: str, payload: dict[str, Any]) -> dict[str, Any]:
    """POST one Firecrawl request with bounded retry and typed failures."""
    attempts = brand_discovery_settings.firecrawl_max_attempts
    try:
        async with httpx.AsyncClient(
            timeout=brand_discovery_settings.firecrawl_timeout_seconds
        ) as client:
            for attempt in range(attempts):
                try:
                    response = await client.post(
                        f"{brand_discovery_settings.firecrawl_api_url.rstrip('/')}/{path}",
                        headers=_headers(),
                        json=payload,
                    )
                except httpx.RequestError as exc:
                    if attempt + 1 >= attempts:
                        raise FirecrawlUnavailableError(
                            "firecrawl_transport_error"
                        ) from exc
                    delay = (
                        brand_discovery_settings.firecrawl_retry_backoff_seconds
                        * 2**attempt
                    )
                    await asyncio.sleep(delay)
                    continue

                retryable_status = (
                    response.status_code == 429 or response.status_code >= 500
                )
                if retryable_status and attempt + 1 < attempts:
                    retry_after = (
                        parse_retry_after(response.headers.get("Retry-After"))
                        if response.status_code == 429
                        else None
                    )
                    delay = retry_after or (
                        brand_discovery_settings.firecrawl_retry_backoff_seconds
                        * 2**attempt
                    )
                    await asyncio.sleep(
                        min(
                            delay,
                            brand_discovery_settings.firecrawl_retry_after_max_seconds,
                        )
                    )
                    continue

                try:
                    response.raise_for_status()
                    data = response.json()
                except (httpx.HTTPStatusError, ValueError) as exc:
                    raise FirecrawlUnavailableError("firecrawl_response_error") from exc
                if not isinstance(data, dict):
                    raise FirecrawlUnavailableError("firecrawl_response_error")
                return data
    except FirecrawlUnavailableError:
        raise
    except httpx.HTTPError as exc:
        raise FirecrawlUnavailableError("firecrawl_transport_error") from exc
    raise FirecrawlUnavailableError("firecrawl_retry_exhausted")


async def rendered_scrape(url: str) -> FirecrawlPage:
    payload = await _post(
        "scrape", {"url": url, "formats": ["markdown"], "onlyMainContent": True}
    )
    data = payload.get("data") or {}
    metadata = data.get("metadata") or {}
    return FirecrawlPage(
        url=str(metadata.get("sourceURL") or url),
        title=str(metadata.get("title") or ""),
        text=str(data.get("markdown") or ""),
    )


async def _search(query: str) -> list[FirecrawlPage]:
    response = await _post(
        "search",
        {
            "query": query,
            "limit": brand_discovery_settings.firecrawl_search_limit,
            "sources": ["web"],
        },
    )
    payload: Any = response.get("data") or {}
    rows = payload.get("web") if isinstance(payload, dict) else payload
    return [
        FirecrawlPage(
            url=str(row.get("url") or ""),
            title=str(row.get("title") or ""),
            text=str(row.get("description") or ""),
        )
        for row in (rows or [])
        if isinstance(row, dict) and row.get("url")
    ]


async def competitor_search(*, brand_name: str, industry: str) -> list[FirecrawlPage]:
    return await _search(
        f"{industry} companies alternatives to {brand_name} official website".strip()
    )
