"""HTTP and JSON primitives shared by DataForSEO acquisition lifecycles."""

from __future__ import annotations

from typing import Any

import httpx

from app.connectors.answer_engines.errors import (
    ProviderError,
    classify_provider_status,
    parse_retry_after,
)
from app.core.config.dataforseo import DataForSeoCredential
from app.core.config.provider_catalog import (
    ERROR_CONNECTION,
    ERROR_PARSE,
    ERROR_TIMEOUT,
)


async def authenticated_request(
    client: httpx.AsyncClient,
    method: str,
    url: str,
    *,
    credential: DataForSeoCredential,
    timeout_seconds: float,
    json: Any = None,
) -> httpx.Response:
    return await client.request(
        method,
        url,
        auth=credential.basic_auth(),
        json=json,
        timeout=timeout_seconds,
    )


def decode_json(response: httpx.Response, *, error_message: str) -> Any:
    try:
        return response.json()
    except ValueError as exc:
        raise ProviderError(
            error_message, error_code=ERROR_PARSE, retryable=False
        ) from exc


async def request_json(
    client: httpx.AsyncClient,
    method: str,
    url: str,
    *,
    credential: DataForSeoCredential,
    timeout_seconds: float,
    json: Any = None,
    transport_retryable: bool,
    error_message: str,
) -> dict[str, Any]:
    """One authenticated transport call; lifecycle policy stays with its caller."""
    try:
        response = await authenticated_request(
            client,
            method,
            url,
            credential=credential,
            json=json,
            timeout_seconds=timeout_seconds,
        )
    except (
        httpx.ConnectTimeout,
        httpx.ReadTimeout,
        httpx.WriteTimeout,
        httpx.PoolTimeout,
    ) as exc:
        raise ProviderError(
            "DataForSEO request timed out",
            error_code=ERROR_TIMEOUT,
            retryable=transport_retryable,
        ) from exc
    except httpx.HTTPError as exc:
        raise ProviderError(
            "Could not reach DataForSEO",
            error_code=ERROR_CONNECTION,
            retryable=transport_retryable,
        ) from exc
    if response.status_code != httpx.codes.OK:
        error_code, retryable = classify_provider_status(response.status_code)
        raise ProviderError(
            f"DataForSEO returned HTTP {response.status_code}",
            error_code=error_code,
            retryable=retryable,
            retry_after_seconds=parse_retry_after(response.headers.get("Retry-After")),
        )
    body = decode_json(response, error_message=error_message)
    if not isinstance(body, dict):
        raise ProviderError(error_message, error_code=ERROR_PARSE, retryable=False)
    return body
