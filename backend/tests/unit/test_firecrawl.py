"""Firecrawl transport retry and error-normalization coverage."""

from __future__ import annotations

import httpx
import pytest
from pydantic import SecretStr

from app.connectors.web_evidence import firecrawl
from app.connectors.web_evidence.firecrawl import FirecrawlUnavailableError
from app.core.config.brand_discovery import brand_discovery_settings


def _install_transport(
    monkeypatch: pytest.MonkeyPatch,
    handler: httpx.MockTransport,
) -> httpx.MockTransport:
    monkeypatch.setattr(
        brand_discovery_settings, "firecrawl_api_key", SecretStr("test-key")
    )
    monkeypatch.setattr(brand_discovery_settings, "firecrawl_max_attempts", 3)
    monkeypatch.setattr(brand_discovery_settings, "firecrawl_retry_backoff_seconds", 0)
    return handler


@pytest.mark.asyncio
async def test_post_honors_retry_after_for_429(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls = 0
    delays: list[float] = []

    def respond(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        if calls == 1:
            return httpx.Response(429, headers={"Retry-After": "2"}, request=request)
        return httpx.Response(200, json={"data": {}}, request=request)

    async def record_sleep(delay: float) -> None:
        delays.append(delay)

    transport = _install_transport(monkeypatch, httpx.MockTransport(respond))

    assert await firecrawl._post(
        "search", {"query": "acme"}, transport=transport, sleep=record_sleep
    ) == {"data": {}}
    assert calls == 2
    assert delays == [2.0]


@pytest.mark.asyncio
async def test_post_retries_5xx_then_succeeds(monkeypatch: pytest.MonkeyPatch) -> None:
    statuses = iter((503, 200))

    def respond(request: httpx.Request) -> httpx.Response:
        status = next(statuses)
        return httpx.Response(
            status,
            json={"data": {}} if status == 200 else None,
            request=request,
        )

    transport = _install_transport(monkeypatch, httpx.MockTransport(respond))

    assert await firecrawl._post(
        "search", {"query": "acme"}, transport=transport, sleep=lambda _: _no_op()
    ) == {"data": {}}


async def _no_op() -> None:
    return None


@pytest.mark.asyncio
async def test_post_translates_transport_failures(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def fail(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("offline", request=request)

    transport = _install_transport(monkeypatch, httpx.MockTransport(fail))
    monkeypatch.setattr(brand_discovery_settings, "firecrawl_max_attempts", 1)

    with pytest.raises(FirecrawlUnavailableError, match="transport"):
        await firecrawl._post(
            "scrape", {"url": "https://example.com"}, transport=transport
        )


@pytest.mark.asyncio
async def test_post_caps_transport_retry_backoff(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls = 0
    delays: list[float] = []

    def respond(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        if calls == 1:
            raise httpx.ConnectError("offline", request=request)
        return httpx.Response(200, json={"data": {}}, request=request)

    async def record_sleep(delay: float) -> None:
        delays.append(delay)

    transport = _install_transport(monkeypatch, httpx.MockTransport(respond))
    monkeypatch.setattr(
        brand_discovery_settings, "firecrawl_retry_backoff_seconds", 100
    )
    monkeypatch.setattr(
        brand_discovery_settings, "firecrawl_retry_after_max_seconds", 7
    )

    assert await firecrawl._post(
        "search", {"query": "acme"}, transport=transport, sleep=record_sleep
    ) == {"data": {}}
    assert calls == 2
    assert delays == [7]


@pytest.mark.asyncio
async def test_post_requires_api_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(brand_discovery_settings, "firecrawl_api_key", None)

    with pytest.raises(FirecrawlUnavailableError, match="firecrawl_not_configured"):
        await firecrawl._post("search", {"query": "acme"})


@pytest.mark.asyncio
async def test_post_rejects_non_object_json(monkeypatch: pytest.MonkeyPatch) -> None:
    def respond(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=["unexpected"], request=request)

    transport = _install_transport(monkeypatch, httpx.MockTransport(respond))

    with pytest.raises(FirecrawlUnavailableError, match="firecrawl_response_error"):
        await firecrawl._post("search", {"query": "acme"}, transport=transport)


@pytest.mark.asyncio
@pytest.mark.parametrize("status", [429, 503])
async def test_post_terminal_retryable_status_raises_typed_error(
    monkeypatch: pytest.MonkeyPatch, status: int
) -> None:
    calls = 0

    def respond(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(status, request=request)

    transport = _install_transport(monkeypatch, httpx.MockTransport(respond))

    with pytest.raises(FirecrawlUnavailableError, match="firecrawl_response_error"):
        await firecrawl._post(
            "search",
            {"query": "acme"},
            transport=transport,
            sleep=lambda _: _no_op(),
        )
    assert calls == brand_discovery_settings.firecrawl_max_attempts
