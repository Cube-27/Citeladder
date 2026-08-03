"""Application-funded Firecrawl fallback; secrets remain backend-only."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import httpx

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


async def rendered_scrape(url: str) -> FirecrawlPage:
    async with httpx.AsyncClient(
        timeout=brand_discovery_settings.firecrawl_timeout_seconds
    ) as client:
        response = await client.post(
            f"{brand_discovery_settings.firecrawl_api_url.rstrip('/')}/scrape",
            headers=_headers(),
            json={"url": url, "formats": ["markdown"], "onlyMainContent": True},
        )
        response.raise_for_status()
    data = response.json().get("data") or {}
    metadata = data.get("metadata") or {}
    return FirecrawlPage(
        url=str(metadata.get("sourceURL") or url),
        title=str(metadata.get("title") or ""),
        text=str(data.get("markdown") or ""),
    )


async def competitor_search(*, brand_name: str, industry: str) -> list[FirecrawlPage]:
    query = f"{industry} companies alternatives to {brand_name} official website"
    async with httpx.AsyncClient(
        timeout=brand_discovery_settings.firecrawl_timeout_seconds
    ) as client:
        response = await client.post(
            f"{brand_discovery_settings.firecrawl_api_url.rstrip('/')}/search",
            headers=_headers(),
            json={
                "query": query,
                "limit": brand_discovery_settings.firecrawl_search_limit,
                "sources": ["web"],
            },
        )
        response.raise_for_status()
    payload: Any = response.json().get("data") or {}
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
