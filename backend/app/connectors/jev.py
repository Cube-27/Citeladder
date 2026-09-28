"""Thin TypeSafe System One (JEV) client: one ``decide`` call per state.

``POST /v1/systemone`` evaluates a ``state`` against named typed questions and
returns one answer per question id (https://docs.typesafe.ai/api.md). Only
rate limits (429), overload (529), unavailability (503) and timeouts retry;
auth (401) and validation (422) failures never do. JEV is built for parallel
calls, so the connection pool is not capped here. The API key and state bodies are never
logged.
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from typing import Any

import httpx

from app.connectors.answer_engines.errors import ProviderError, parse_retry_after
from app.core.config.jev import JevSettings, jev_settings
from app.core.config.provider_catalog import (
    ERROR_AUTH,
    ERROR_CLIENT,
    ERROR_CONNECTION,
    ERROR_PARSE,
    ERROR_RATE_LIMIT,
    ERROR_SERVER,
    ERROR_TIMEOUT,
)

logger = logging.getLogger(__name__)

_DECIDE_PATH = "/v1/systemone"
_OVERLOADED = 529
_UNAVAILABLE = 503
_RETRY_AFTER_CAP_SECONDS = 10.0


@dataclass(frozen=True, slots=True)
class JevDecision:
    model: str
    answers: dict[str, dict[str, Any]]
    usage: dict[str, int] = field(default_factory=dict)


def _status_error(response: httpx.Response) -> ProviderError:
    status = response.status_code
    if status == 429:
        code, retryable = ERROR_RATE_LIMIT, True
    elif status in (_OVERLOADED, _UNAVAILABLE):
        code, retryable = ERROR_SERVER, True
    elif status in (401, 403):
        code, retryable = ERROR_AUTH, False
    elif status >= 500:
        code, retryable = ERROR_SERVER, False
    else:
        code, retryable = ERROR_CLIENT, False
    return ProviderError(
        f"JEV returned HTTP {status}",
        error_code=code,
        retryable=retryable,
        retry_after_seconds=parse_retry_after(response.headers.get("retry-after")),
    )


def _parse_decision(response: httpx.Response) -> JevDecision:
    try:
        body = response.json()
    except ValueError as exc:
        raise ProviderError(
            "JEV returned non-JSON", error_code=ERROR_PARSE, retryable=False
        ) from exc
    answers = body.get("answers") if isinstance(body, dict) else None
    if not isinstance(answers, dict) or not all(
        isinstance(answer, dict) for answer in answers.values()
    ):
        raise ProviderError(
            "JEV response is missing answers", error_code=ERROR_PARSE, retryable=False
        )
    usage = body.get("usage")
    return JevDecision(
        model=str(body.get("model") or ""),
        answers=answers,
        usage=(
            {k: v for k, v in usage.items() if isinstance(v, int)}
            if isinstance(usage, dict)
            else {}
        ),
    )


class JevClient:
    def __init__(
        self,
        *,
        api_key: str,
        base_url: str,
        model: str,
        timeout_seconds: float,
        max_attempts: int,
        backoff_seconds: float,
        transport: httpx.AsyncBaseTransport | None = None,
        sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
    ) -> None:
        if not api_key:
            raise ValueError("JEV API key is not configured")
        self.model = model
        self._url = base_url.rstrip("/") + _DECIDE_PATH
        self._headers = {
            "Authorization": f"Bearer {api_key}",
            "Accept": "application/json",
        }
        self._max_attempts = max(1, max_attempts)
        self._backoff = backoff_seconds
        self._sleep = sleep
        self._client = httpx.AsyncClient(
            timeout=timeout_seconds,
            transport=transport,
            trust_env=False,
            limits=httpx.Limits(max_connections=None, max_keepalive_connections=None),
        )

    async def __aenter__(self) -> JevClient:
        return self

    async def __aexit__(self, *_exc: object) -> None:
        await self.aclose()

    async def aclose(self) -> None:
        await self._client.aclose()

    async def decide(
        self, state: object, questions: dict[str, dict[str, Any]]
    ) -> JevDecision:
        body = {"state": state, "model": self.model, "questions": questions}
        for attempt in range(1, self._max_attempts + 1):
            try:
                return await self._once(body)
            except ProviderError as exc:
                if not exc.retryable or attempt == self._max_attempts:
                    raise
                await self._sleep(self._delay(attempt, exc.retry_after_seconds))
        raise AssertionError("unreachable")  # pragma: no cover

    def _delay(self, attempt: int, retry_after: float | None) -> float:
        backoff = self._backoff * (2 ** (attempt - 1))
        if retry_after is None:
            return backoff
        return min(max(backoff, retry_after), _RETRY_AFTER_CAP_SECONDS)

    async def _once(self, body: dict[str, Any]) -> JevDecision:
        try:
            response = await self._client.post(
                self._url, json=body, headers=self._headers
            )
        except httpx.TimeoutException as exc:
            raise ProviderError(
                "JEV request timed out", error_code=ERROR_TIMEOUT, retryable=True
            ) from exc
        except httpx.HTTPError as exc:
            raise ProviderError(
                f"JEV connection error: {type(exc).__name__}",
                error_code=ERROR_CONNECTION,
                retryable=False,
            ) from exc
        if response.status_code >= 400:
            error = _status_error(response)
            logger.warning(
                "jev call failed",
                extra={"status": response.status_code, "error_code": error.error_code},
            )
            raise error
        return _parse_decision(response)


def create_jev_client(settings: JevSettings = jev_settings) -> JevClient | None:
    """A JEV client when ``JEV_API_KEY`` is set; ``None`` (judge off) otherwise."""
    if not settings.enabled:
        return None
    return JevClient(
        api_key=settings.api_key.get_secret_value().strip(),
        base_url=settings.base_url,
        model=settings.model,
        timeout_seconds=settings.timeout_seconds,
        max_attempts=settings.max_attempts,
        backoff_seconds=settings.backoff_seconds,
    )
