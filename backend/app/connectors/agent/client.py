"""Default-agent client (OpenAI-compatible ``/chat/completions``).

The app-level general model that powers assisted features. Configured entirely
from env (``config/agent.py``): any provider with an OpenAI-compatible chat
endpoint works — OpenAI, Anthropic, Gemini, Mistral, Groq, a local gateway.
The request uses only the portable subset: messages plus an output cap, with
JSON requested in the prompt (callers validate it against their own schemas).
This is the application-model boundary for non-measurement AI calls; it
is NOT a measurement engine and NOT a BYOK connection:
measurement engines are only ever measured (roadmap non-goal), and BYOK keys
belong to ``ProviderConnection``.

Secret handling mirrors the answer-engine adapters (invariant 6 spirit): the
key is sent only as a Bearer header, never logged, never echoed into any DTO,
snapshot, or error message.
"""

from __future__ import annotations

import json
import logging
import re
import time
from collections.abc import Mapping
from typing import Any

import httpx

from app.connectors.agent.gateway import ModelCapabilities, ModelResult
from app.connectors.agent.json_utils import strip_json_fence
from app.connectors.answer_engines.errors import (
    ProviderError,
    classify_provider_status,
    parse_retry_after,
)
from app.connectors.output_cap import (
    LEGACY_OUTPUT_CAP_PARAM,
    OUTPUT_CAP_PARAM,
    rejects_output_cap,
)
from app.core.config.agent import DefaultAgentSettings, default_agent_settings
from app.core.config.provider_catalog import (
    ERROR_CONNECTION,
    ERROR_PARSE,
    ERROR_TIMEOUT,
)

logger = logging.getLogger(__name__)

# Routes (base URL, model) already known to need the legacy name.
_LEGACY_CAP_ROUTES: set[tuple[str, str]] = set()
# Provider error fields logged as diagnostics: short identifier tokens only,
# never the message (which can echo request content).
_ERROR_TOKEN = re.compile(r"^[A-Za-z0-9_.\-]{1,64}$")


class AgentNotConfiguredError(RuntimeError):
    """Raised when no default-agent API key is configured in the environment."""


class DefaultAgentClient:
    """Chat client for any OpenAI-compatible chat-completions endpoint."""

    def __init__(
        self,
        settings: DefaultAgentSettings | None = None,
        *,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self._settings = settings or default_agent_settings
        self._transport = transport
        if not self._settings.configured:
            raise AgentNotConfiguredError(
                "No default agent configured "
                "(set DEFAULT_AGENT_API_KEY, DEFAULT_AGENT_BASE_URL and "
                "DEFAULT_AGENT_MODEL)"
            )

    @property
    def adapter_name(self) -> str:
        return "openai_compatible"

    @property
    def model(self) -> str:
        return self._settings.model

    @property
    def base_url_host(self) -> str:
        """Credential-free endpoint host, safe for provenance records."""
        return httpx.URL(self._settings.base_url).host or ""

    def validate_configuration(self) -> None:
        """Fail early before a task is persisted or sent to a provider."""
        if not self._settings.configured:
            raise AgentNotConfiguredError("Default agent configuration is incomplete")

    def capabilities(self) -> ModelCapabilities:
        return ModelCapabilities(
            structured_output=True,
            native_tool_calling=False,
            context_limit=self._settings.context_limit,
            output_limit=self._settings.max_output_tokens,
            streaming=False,
            usage_reporting=True,
            safety_metadata=False,
        )

    async def complete_text(self, *, system: str, user: str) -> ModelResult:
        return await self._complete_result(system=system, user=user)

    async def complete_structured(
        self,
        *,
        system: str,
        user: str,
        schema_name: str,
        schema: Mapping[str, Any],
    ) -> ModelResult:
        """Request JSON for a caller-owned JSON Schema.

        The schema travels in the prompt, which every provider honors; native
        response formats differ per provider, so callers validate instead.
        """
        return await self._complete_result(
            system=system,
            user=(
                f"{user}\n\nReturn JSON that matches the {schema_name} "
                "schema exactly:\n"
                + json.dumps(dict(schema), ensure_ascii=False, separators=(",", ":"))
            ),
        )

    async def complete_json(self, *, system: str, user: str) -> str:
        """Request a JSON object; the prompt carries the format contract."""
        result = await self._complete_result(
            system=system,
            user=f"{user}\n\nReturn only a valid JSON object, without commentary.",
        )
        return strip_json_fence(result.content)

    async def complete_structured_json(
        self,
        *,
        system: str,
        user: str,
        schema_name: str,
        schema: Mapping[str, Any],
    ) -> str:
        result = await self.complete_structured(
            system=system,
            user=user,
            schema_name=schema_name,
            schema=schema,
        )
        return strip_json_fence(result.content)

    async def _complete_result(self, *, system: str, user: str) -> ModelResult:
        """Run one completion without logging prompt data."""
        settings = self._settings
        started = time.monotonic()
        response = await self._post_with_cap_fallback(system=system, user=user)
        latency_ms = int((time.monotonic() - started) * 1000)
        if response.status_code >= 400:
            error_code, retryable = classify_provider_status(response.status_code)
            # Status + provider error tokens only — never the body or message.
            logger.warning(
                "default agent call failed",
                extra={
                    "status": response.status_code,
                    "error_code": error_code,
                    "model": settings.model,
                    **_provider_error_tokens(response),
                },
            )
            raise ProviderError(
                f"Default agent returned HTTP {response.status_code}",
                error_code=error_code,
                retryable=retryable,
                retry_after_seconds=parse_retry_after(
                    response.headers.get("retry-after")
                ),
            )

        try:
            body = response.json()
            choice = body["choices"][0]
            content = choice["message"]["content"]
        except (ValueError, LookupError, TypeError) as exc:
            raise ProviderError(
                f"Default agent returned an unparseable response: {type(exc).__name__}",
                error_code=ERROR_PARSE,
                retryable=False,
            ) from exc
        if not isinstance(content, str) or not content.strip():
            # A reasoning model can spend the whole output cap before answering.
            finish_reason = str(choice.get("finish_reason") or "unknown")[:32]
            raise ProviderError(
                f"Default agent returned empty content (finish_reason={finish_reason})",
                error_code=ERROR_PARSE,
                retryable=False,
            )
        logger.info(
            "default agent call ok",
            extra={"latency_ms": latency_ms, "model": settings.model},
        )
        usage = self.normalize_usage(body.get("usage"))
        return ModelResult(
            content=content,
            provider_adapter="openai_compatible",
            endpoint_host=self.base_url_host,
            requested_model=settings.model,
            returned_model=str(body.get("model") or settings.model),
            finish_status=str(choice.get("finish_reason") or "unknown"),
            usage=usage,
            latency_ms=latency_ms,
        )

    async def _post_with_cap_fallback(
        self, *, system: str, user: str
    ) -> httpx.Response:
        route = (self._settings.base_url.rstrip("/"), self._settings.model)
        if route in _LEGACY_CAP_ROUTES:
            return await self._post(LEGACY_OUTPUT_CAP_PARAM, system=system, user=user)
        response = await self._post(OUTPUT_CAP_PARAM, system=system, user=user)
        if not rejects_output_cap(response.status_code, response.text):
            return response
        response = await self._post(LEGACY_OUTPUT_CAP_PARAM, system=system, user=user)
        # Remember the legacy name only once a request with it succeeded.
        if response.status_code < 400:
            _LEGACY_CAP_ROUTES.add(route)
        return response

    async def _post(self, cap_param: str, *, system: str, user: str) -> httpx.Response:
        settings = self._settings
        payload: dict[str, Any] = {
            "model": settings.model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            cap_param: settings.max_output_tokens,
        }
        headers = {
            "Authorization": f"Bearer {settings.resolved_api_key}",
            "Content-Type": "application/json",
        }
        url = settings.base_url.rstrip("/") + "/chat/completions"
        try:
            async with httpx.AsyncClient(
                timeout=settings.timeout_seconds,
                transport=self._transport,
                trust_env=False,
            ) as client:
                return await client.post(url, json=payload, headers=headers)
        except (httpx.ConnectTimeout, httpx.ReadTimeout, httpx.PoolTimeout) as exc:
            raise ProviderError(
                f"Default agent request timed out: {exc}",
                error_code=ERROR_TIMEOUT,
                retryable=True,
            ) from exc
        except httpx.HTTPError as exc:
            raise ProviderError(
                f"Default agent connection error: {exc}",
                error_code=ERROR_CONNECTION,
                retryable=True,
            ) from exc

    @staticmethod
    def normalize_usage(value: object) -> dict[str, int]:
        if not isinstance(value, Mapping):
            return {}
        aliases = {
            "input_tokens": ("input_tokens", "prompt_tokens"),
            "output_tokens": ("output_tokens", "completion_tokens"),
            "total_tokens": ("total_tokens",),
        }
        normalized: dict[str, int] = {}
        for target, keys in aliases.items():
            for key in keys:
                raw = value.get(key)
                if isinstance(raw, int) and raw >= 0:
                    normalized[target] = raw
                    break
        return normalized

    @staticmethod
    def classify_error(exc: Exception) -> dict[str, Any]:
        return {
            "code": str(getattr(exc, "error_code", ERROR_CONNECTION)),
            "retryable": bool(getattr(exc, "retryable", False)),
        }


def _provider_error_tokens(response: httpx.Response) -> dict[str, str]:
    try:
        body = response.json()
    except ValueError:
        return {}
    error = body.get("error") if isinstance(body, Mapping) else None
    if not isinstance(error, Mapping):
        return {}
    return {
        f"provider_error_{key}": value
        for key in ("type", "code", "param")
        if isinstance(value := error.get(key), str) and _ERROR_TOKEN.match(value)
    }
