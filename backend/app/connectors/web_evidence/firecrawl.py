"""Application-funded Firecrawl fallback; secrets remain backend-only."""

from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable
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


async def _post(
    path: str,
    payload: dict[str, Any],
    *,
    transport: httpx.AsyncBaseTransport | None = None,
    sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
) -> dict[str, Any]:
    """POST one Firecrawl request with bounded retry and typed failures."""
    attempts = brand_discovery_settings.firecrawl_max_attempts
    url = f"{brand_discovery_settings.firecrawl_api_url.rstrip('/')}/{path}"
    try:
        async with httpx.AsyncClient(
            timeout=brand_discovery_settings.firecrawl_timeout_seconds,
            transport=transport,
        ) as client:
            for attempt in range(attempts):
                response = await _request_attempt(
                    client,
                    url=url,
                    payload=payload,
                    attempt=attempt,
                    attempts=attempts,
                    sleep=sleep,
                )
                if response is None:
                    continue
                if await _retry_response(
                    response, attempt=attempt, attempts=attempts, sleep=sleep
                ):
                    continue
                return _response_payload(response)
    except FirecrawlUnavailableError:
        raise
    except httpx.HTTPError as exc:
        raise FirecrawlUnavailableError("firecrawl_transport_error") from exc
    raise FirecrawlUnavailableError("firecrawl_retry_exhausted")


async def _request_attempt(
    client: httpx.AsyncClient,
    *,
    url: str,
    payload: dict[str, Any],
    attempt: int,
    attempts: int,
    sleep: Callable[[float], Awaitable[None]],
) -> httpx.Response | None:
    try:
        return await client.post(url, headers=_headers(), json=payload)
    except httpx.RequestError as exc:
        if attempt + 1 >= attempts:
            raise FirecrawlUnavailableError("firecrawl_transport_error") from exc
        await sleep(_bounded_backoff(attempt))
        return None


def _backoff(attempt: int) -> float:
    return brand_discovery_settings.firecrawl_retry_backoff_seconds * 2**attempt


def _bounded_backoff(attempt: int) -> float:
    return min(
        _backoff(attempt),
        brand_discovery_settings.firecrawl_retry_after_max_seconds,
    )


async def _retry_response(
    response: httpx.Response,
    *,
    attempt: int,
    attempts: int,
    sleep: Callable[[float], Awaitable[None]],
) -> bool:
    retryable = response.status_code == 429 or response.status_code >= 500
    if not retryable or attempt + 1 >= attempts:
        return False
    retry_after = (
        parse_retry_after(response.headers.get("Retry-After"))
        if response.status_code == 429
        else None
    )
    delay = retry_after if retry_after is not None else _backoff(attempt)
    await sleep(min(delay, brand_discovery_settings.firecrawl_retry_after_max_seconds))
    return True


def _response_payload(response: httpx.Response) -> dict[str, Any]:
    try:
        response.raise_for_status()
        data = response.json()
    except (httpx.HTTPStatusError, ValueError) as exc:
        raise FirecrawlUnavailableError("firecrawl_response_error") from exc
    if not isinstance(data, dict):
        raise FirecrawlUnavailableError("firecrawl_response_error")
    return data


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
