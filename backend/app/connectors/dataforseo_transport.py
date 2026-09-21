"""HTTP and JSON primitives shared by DataForSEO acquisition lifecycles."""

from __future__ import annotations

from typing import Any

import httpx

from app.connectors.answer_engines.errors import ProviderError
from app.core.config.dataforseo import DataForSeoCredential
from app.core.config.provider_catalog import ERROR_PARSE


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
