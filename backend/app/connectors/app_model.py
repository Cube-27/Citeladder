"""OpenAI-compatible Content and Growth adapters over the pinned BYOK boundary."""

from __future__ import annotations

import time
from collections.abc import Mapping
from typing import Any
from urllib.parse import urlsplit

from app.connectors.agent.gateway import ModelCapabilities, ModelResult
from app.connectors.agent.json_utils import strip_json_fence
from app.connectors.answer_engines.errors import ProviderError
from app.connectors.app_model_config import AppModelRouteConfig
from app.connectors.app_model_transport import (
    AppModelJsonTransport,
    AppModelTransportError,
    CurlAppModelJsonTransport,
    chat_completions_url,
    resolve_app_model_target,
)
from app.connectors.discovery_models.contracts import (
    DiscoveryRequest,
    DiscoveryResponse,
)
from app.core.config.app_models import APP_MODEL_MAX_RESPONSE_BYTES
from app.core.config.provider_catalog import ERROR_PARSE


class OpenAICompatibleAppModelClient:
    """One explicit verified customer route; it has no platform fallback."""

    def __init__(
        self,
        route: AppModelRouteConfig,
        *,
        transport: AppModelJsonTransport | None = None,
    ) -> None:
        self._route = route
        self._transport = transport or CurlAppModelJsonTransport()
        self.provider = "customer_byok"

    @property
    def adapter_name(self) -> str:
        return "openai_compatible_byok"

    @property
    def model(self) -> str:
        return self._route.model

    @property
    def base_url_host(self) -> str:
        return urlsplit(self._route.api_base_url).hostname or ""

    def validate_configuration(self) -> None:
        if not self._route.api_key or not self._route.model:
            raise RuntimeError("App model route is unavailable")

    def capabilities(self) -> ModelCapabilities:
        return ModelCapabilities(
            structured_output=True,
            native_tool_calling=False,
            context_limit=0,
            output_limit=0,
            streaming=False,
            usage_reporting=True,
            safety_metadata=False,
        )

    async def generate(self, request: DiscoveryRequest) -> DiscoveryResponse:
        started = time.monotonic()
        body = await self._chat(
            messages=list(request.messages),
            max_tokens=request.max_output_tokens,
            timeout_seconds=request.timeout_seconds,
        )
        content, choice = _completion_content(body)
        raw_usage = body.get("usage")
        usage: dict[str, Any] = raw_usage if isinstance(raw_usage, dict) else {}
        return DiscoveryResponse(
            provider=self.provider,
            requested_model=self.model,
            returned_model=str(body.get("model") or self.model),
            output_text=content,
            finish_reason=str(choice.get("finish_reason") or ""),
            usage=dict(usage),
            latency_ms=int((time.monotonic() - started) * 1000),
        )

    async def complete_text(self, *, system: str, user: str) -> ModelResult:
        return await self._complete(system=system, user=user, response_format=None)

    async def complete_json(self, *, system: str, user: str) -> str:
        return strip_json_fence(
            (await self.complete_text(system=system, user=user)).content
        )

    async def complete_structured(
        self,
        *,
        system: str,
        user: str,
        schema_name: str,
        schema: Mapping[str, Any],
    ) -> ModelResult:
        return await self._complete(
            system=system,
            user=user,
            response_format={
                "type": "json_schema",
                "json_schema": {
                    "name": schema_name,
                    "strict": True,
                    "schema": dict(schema),
                },
            },
        )

    async def complete_structured_json(
        self,
        *,
        system: str,
        user: str,
        schema_name: str,
        schema: Mapping[str, Any],
    ) -> str:
        result = await self.complete_structured(
            system=system, user=user, schema_name=schema_name, schema=schema
        )
        return strip_json_fence(result.content)

    async def _complete(
        self,
        *,
        system: str,
        user: str,
        response_format: Mapping[str, Any] | None,
    ) -> ModelResult:
        messages = [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ]
        body = await self._chat(messages=messages, response_format=response_format)
        content, choice = _completion_content(body)
        usage = body.get("usage") if isinstance(body.get("usage"), dict) else {}
        return ModelResult(
            content=content,
            provider_adapter=self.adapter_name,
            endpoint_host=self.base_url_host,
            requested_model=self.model,
            returned_model=str(body.get("model") or self.model),
            finish_status=str(choice.get("finish_reason") or "unknown"),
            usage=self.normalize_usage(usage),
            latency_ms=0,
            safety={},
        )

    async def _chat(
        self,
        *,
        messages: list[dict[str, Any]],
        max_tokens: int | None = None,
        timeout_seconds: float = 60.0,
        response_format: Mapping[str, Any] | None = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "model": self.model,
            "messages": messages,
            "stream": False,
        }
        if max_tokens is not None:
            payload["max_tokens"] = max_tokens
        if response_format is not None:
            payload["response_format"] = dict(response_format)
        try:
            target = await resolve_app_model_target(
                chat_completions_url(self._route.api_base_url)
            )
            response = await self._transport.post(
                target=target,
                api_key=self._route.api_key,
                payload=payload,
                timeout_seconds=timeout_seconds,
                max_response_bytes=APP_MODEL_MAX_RESPONSE_BYTES,
            )
        except AppModelTransportError as exc:
            raise ProviderError(
                str(exc),
                error_code=exc.code,
                retryable=exc.code in {"timeout", "connection"},
            ) from exc
        return response.body

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
                item = value.get(key)
                if isinstance(item, int):
                    normalized[target] = item
                    break
        return normalized

    @staticmethod
    def classify_error(exc: Exception) -> dict[str, Any]:
        return {
            "code": str(getattr(exc, "error_code", "connection")),
            "retryable": bool(getattr(exc, "retryable", False)),
        }


def _completion_content(body: dict[str, Any]) -> tuple[str, dict[str, Any]]:
    try:
        choice = body["choices"][0]
        content = choice["message"]["content"]
    except (KeyError, IndexError, TypeError) as exc:
        raise ProviderError(
            "Customer model returned an invalid completion",
            error_code=ERROR_PARSE,
            retryable=False,
        ) from exc
    if not isinstance(choice, dict) or not isinstance(content, str):
        raise ProviderError(
            "Customer model returned an invalid completion",
            error_code=ERROR_PARSE,
            retryable=False,
        )
    return content, choice
