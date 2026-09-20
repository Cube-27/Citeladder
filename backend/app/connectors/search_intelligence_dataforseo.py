"""Synchronous DataForSEO Labs and Backlinks Live transport."""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from typing import Any

import httpx

from app.connectors.answer_engines.errors import ProviderError, parse_retry_after
from app.connectors.answer_engines.http_client import shared_client
from app.core.config.dataforseo import DATAFORSEO_BASE_URL, STATUS_OK, unpack_credential
from app.core.config.provider_catalog import (
    ERROR_AUTH,
    ERROR_CONNECTION,
    ERROR_PARSE,
    ERROR_RATE_LIMIT,
    ERROR_TIMEOUT,
)


@dataclass(frozen=True, slots=True)
class ResearchResponse:
    body: dict[str, Any]
    response_sha256: str
    provider_task_id: str
    cost_usd: Decimal | None
    cost_source: str | None


def _decimal_cost(value: object) -> Decimal | None:
    if value is None or isinstance(value, bool):
        return None
    try:
        result = Decimal(str(value))
    except (InvalidOperation, ValueError):
        return None
    return result if result.is_finite() and result >= 0 else None


def _reported_cost(body: dict[str, Any]) -> tuple[Decimal | None, str | None]:
    tasks = body.get("tasks")
    if isinstance(tasks, list) and len(tasks) == 1 and isinstance(tasks[0], dict):
        task_cost = _decimal_cost(tasks[0].get("cost"))
        if task_cost is not None:
            return task_cost, "task"
    envelope_cost = _decimal_cost(body.get("cost"))
    return (envelope_cost, "envelope") if envelope_cost is not None else (None, None)


def _safe_message(body: dict[str, Any]) -> str:
    message = str(body.get("status_message") or "DataForSEO request failed")
    return message[:300]


async def _post_once(
    client: httpx.AsyncClient,
    *,
    url: str,
    auth: tuple[str, str],
    payload: dict[str, Any],
    timeout_seconds: float,
) -> httpx.Response:
    try:
        return await client.post(
            url, auth=auth, json=[payload], timeout=timeout_seconds
        )
    except (httpx.ConnectTimeout, httpx.ReadTimeout, httpx.PoolTimeout) as exc:
        raise ProviderError(
            "DataForSEO request timed out", error_code=ERROR_TIMEOUT, retryable=False
        ) from exc
    except httpx.HTTPError as exc:
        raise ProviderError(
            "DataForSEO connection failed",
            error_code=ERROR_CONNECTION,
            retryable=False,
        ) from exc


def _response_body(response: httpx.Response) -> dict[str, Any]:
    if response.status_code in {401, 403}:
        raise ProviderError(
            "DataForSEO authentication failed", error_code=ERROR_AUTH, retryable=False
        )
    if response.status_code == 429:
        raise ProviderError(
            "DataForSEO rate limited the request",
            error_code=ERROR_RATE_LIMIT,
            retryable=False,
            retry_after_seconds=parse_retry_after(response.headers.get("Retry-After")),
        )
    try:
        body = response.json()
    except ValueError as exc:
        raise ProviderError(
            "DataForSEO returned unreadable JSON",
            error_code=ERROR_PARSE,
            retryable=False,
        ) from exc
    if not isinstance(body, dict) or body.get("status_code") != STATUS_OK:
        raise ProviderError(
            _safe_message(body if isinstance(body, dict) else {}),
            error_code=ERROR_PARSE,
            retryable=False,
        )
    return body


def _single_task(body: dict[str, Any]) -> dict[str, Any]:
    tasks = body.get("tasks")
    if not isinstance(tasks, list) or len(tasks) != 1 or not isinstance(tasks[0], dict):
        raise ProviderError(
            "DataForSEO returned an invalid task envelope",
            error_code=ERROR_PARSE,
            retryable=False,
        )
    task: dict[str, Any] = tasks[0]
    if task.get("status_code") != STATUS_OK:
        raise ProviderError(
            str(task.get("status_message") or "DataForSEO task failed")[:300],
            error_code=ERROR_PARSE,
            retryable=False,
        )
    return task


async def execute_live(
    *,
    encrypted_secret: str,
    endpoint: str,
    payload: dict[str, Any],
    base_url: str = "",
    timeout_seconds: float = 90.0,
    client: httpx.AsyncClient | None = None,
) -> ResearchResponse:
    """Send exactly one reviewed Live request. No retry is performed here."""
    from app.core.security import decrypt_secret

    credential = unpack_credential(decrypt_secret(encrypted_secret))
    url = f"{(base_url or DATAFORSEO_BASE_URL).rstrip('/')}/{endpoint.lstrip('/')}"
    response = await _post_once(
        client or shared_client(),
        url=url,
        auth=credential.basic_auth(),
        payload=payload,
        timeout_seconds=timeout_seconds,
    )
    body = _response_body(response)
    task = _single_task(body)
    canonical = json.dumps(
        body, sort_keys=True, separators=(",", ":"), ensure_ascii=False
    ).encode("utf-8")
    cost, source = _reported_cost(body)
    return ResearchResponse(
        body=body,
        response_sha256=hashlib.sha256(canonical).hexdigest(),
        provider_task_id=str(task.get("id") or "")[:255],
        cost_usd=cost,
        cost_source=source,
    )
