"""The DataForSEO connectivity probe.

Two properties matter here. The probe must never create a billable task —
a button labelled "Test connection" that charges the customer is a defect,
not a feature — and it must read the provider's IN-BODY status, because
DataForSEO answers a rejected credential with HTTP 200.
"""

from __future__ import annotations

import httpx
import pytest

from app.connectors.answer_engines.errors import ProviderError
from app.connectors.search_surfaces.dataforseo import probe_credential
from app.core.config.dataforseo import PATH_USER_DATA, pack_credential

_SECRET = pack_credential(login="user@example.com", password="s3cret")


def _client(handler: httpx.MockTransport) -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=handler)


@pytest.mark.asyncio
async def test_the_probe_calls_only_the_non_billable_endpoint() -> None:
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200, json={"status_code": 20000, "status_message": "Ok."})

    async with _client(httpx.MockTransport(handler)) as client:
        result = await probe_credential(secret=_SECRET, client=client)

    assert len(seen) == 1
    assert seen[0].method == "GET"
    assert seen[0].url.path == PATH_USER_DATA
    # A task_post would have charged the customer for testing a credential.
    assert "task_post" not in str(seen[0].url)
    assert result.latency_ms >= 0


@pytest.mark.asyncio
async def test_the_probe_sends_the_pair_as_http_basic() -> None:
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200, json={"status_code": 20000})

    async with _client(httpx.MockTransport(handler)) as client:
        await probe_credential(secret=_SECRET, client=client)

    assert seen[0].headers["authorization"].startswith("Basic ")


@pytest.mark.asyncio
async def test_a_rejected_credential_inside_an_http_200_still_fails() -> None:
    """The whole reason the envelope is read at all."""

    def handler(_: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={"status_code": 40100, "status_message": "Invalid credentials."},
        )

    async with _client(httpx.MockTransport(handler)) as client:
        with pytest.raises(ProviderError) as excinfo:
            await probe_credential(secret=_SECRET, client=client)

    assert excinfo.value.error_code == "auth_failure"
    assert excinfo.value.retryable is False
    assert "Invalid credentials." in str(excinfo.value)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "status,error_code,retryable",
    [
        (401, "auth_failure", False),
        (403, "auth_failure", False),
        (429, "rate_limit", True),
        (503, "server_error", True),
        (400, "client_error", False),
    ],
)
async def test_transport_failures_use_the_shared_classification(
    status: int, error_code: str, retryable: bool
) -> None:
    def handler(_: httpx.Request) -> httpx.Response:
        return httpx.Response(status, json={})

    async with _client(httpx.MockTransport(handler)) as client:
        with pytest.raises(ProviderError) as excinfo:
            await probe_credential(secret=_SECRET, client=client)

    assert excinfo.value.error_code == error_code
    assert excinfo.value.retryable is retryable


@pytest.mark.asyncio
async def test_an_unreadable_body_is_a_parse_error_not_a_success() -> None:
    def handler(_: httpx.Request) -> httpx.Response:
        return httpx.Response(200, content=b"<html>maintenance</html>")

    async with _client(httpx.MockTransport(handler)) as client:
        with pytest.raises(ProviderError) as excinfo:
            await probe_credential(secret=_SECRET, client=client)

    assert excinfo.value.error_code == "parse_error"


@pytest.mark.asyncio
async def test_an_unreadable_stored_secret_never_reaches_the_network() -> None:
    def handler(_: httpx.Request) -> httpx.Response:  # pragma: no cover
        raise AssertionError("the probe must not call out with a broken secret")

    async with _client(httpx.MockTransport(handler)) as client:
        with pytest.raises(ProviderError) as excinfo:
            await probe_credential(secret="not-json", client=client)

    assert excinfo.value.error_code == "auth_failure"


@pytest.mark.asyncio
async def test_a_timeout_is_retryable() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("slow", request=request)

    async with _client(httpx.MockTransport(handler)) as client:
        with pytest.raises(ProviderError) as excinfo:
            await probe_credential(secret=_SECRET, client=client)

    assert excinfo.value.error_code == "timeout"
    assert excinfo.value.retryable is True


@pytest.mark.asyncio
async def test_the_probe_returns_no_account_detail() -> None:
    """Connection state only — never balance, quota or plan."""

    def handler(_: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                "status_code": 20000,
                "tasks": [{"result": [{"money": {"balance": 123.45}, "rates": {}}]}],
            },
        )

    async with _client(httpx.MockTransport(handler)) as client:
        result = await probe_credential(secret=_SECRET, client=client)

    assert [field for field in result.__slots__] == ["latency_ms"]
