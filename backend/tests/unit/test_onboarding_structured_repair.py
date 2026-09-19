"""Bounded schema repair and provider-backoff behavior for onboarding."""

from __future__ import annotations

import json

import httpx
import pytest
from pydantic import BaseModel

from app.connectors.agent.client import DefaultAgentClient
from app.connectors.answer_engines.errors import ProviderError
from app.core.config.agent import DefaultAgentSettings
from app.core.config.provider_catalog import ERROR_AUTH, ERROR_RATE_LIMIT
from app.domain.projects.onboarding import structured_repair as module


class _Envelope(BaseModel):
    status: str
    value: int


class _Gateway:
    def __init__(self, responses: list[str | Exception]) -> None:
        self.responses = responses
        self.users: list[str] = []

    async def complete_structured_json(self, **kwargs) -> str:
        self.users.append(kwargs["user"])
        response = self.responses.pop(0)
        if isinstance(response, Exception):
            raise response
        return response


@pytest.mark.asyncio
async def test_schema_failure_receives_immediate_safe_repair_feedback(
    monkeypatch,
) -> None:
    delays: list[float] = []

    async def record_sleep(delay: float) -> None:
        delays.append(delay)

    monkeypatch.setattr(module.asyncio, "sleep", record_sleep)
    gateway = _Gateway(
        [
            json.dumps({"status": "ok", "value": "not-an-integer"}),
            '{"status":"ok","value":3}',
        ]
    )

    result = await module.complete_validated_envelope(
        gateway,
        system="system",
        user='{"evidence":"private observation"}',
        schema_name="fixture",
        envelope_type=_Envelope,
        validate=lambda _value: None,
    )

    assert result.value == 3
    assert delays == []
    assert "CORRECTION_REQUIRED" not in gateway.users[0]
    assert "int_parsing" in gateway.users[1]
    assert "not-an-integer" not in gateway.users[1]


@pytest.mark.asyncio
async def test_retryable_provider_error_honors_retry_after(monkeypatch) -> None:
    delays: list[float] = []

    async def record_sleep(delay: float) -> None:
        delays.append(delay)

    monkeypatch.setattr(module.asyncio, "sleep", record_sleep)
    gateway = _Gateway(
        [
            ProviderError(
                "rate limited",
                error_code=ERROR_RATE_LIMIT,
                retryable=True,
                retry_after_seconds=7,
            ),
            '{"status":"ok","value":3}',
        ]
    )

    result = await module.complete_validated_envelope(
        gateway,
        system="system",
        user="request",
        schema_name="fixture",
        envelope_type=_Envelope,
        validate=lambda _value: None,
    )

    assert result.value == 3
    assert delays == [7]
    assert gateway.users == ["request", "request"]


@pytest.mark.asyncio
async def test_non_retryable_provider_error_is_not_repeated(monkeypatch) -> None:
    async def unexpected_sleep(_delay: float) -> None:
        pytest.fail("non-retryable failures must not sleep")

    monkeypatch.setattr(module.asyncio, "sleep", unexpected_sleep)
    error = ProviderError("bad key", error_code=ERROR_AUTH, retryable=False)
    gateway = _Gateway([error])

    with pytest.raises(ProviderError, match="bad key"):
        await module.complete_validated_envelope(
            gateway,
            system="system",
            user="request",
            schema_name="fixture",
            envelope_type=_Envelope,
            validate=lambda _value: None,
        )

    assert gateway.users == ["request"]


@pytest.mark.asyncio
async def test_persistent_rate_limit_stops_after_one_retry(monkeypatch) -> None:
    async def no_wait(_delay: float) -> None:
        return None

    monkeypatch.setattr(module.asyncio, "sleep", no_wait)
    gateway = _Gateway(
        [
            ProviderError("rate limited", error_code=ERROR_RATE_LIMIT, retryable=True),
            ProviderError("rate limited", error_code=ERROR_RATE_LIMIT, retryable=True),
            '{"status":"ok","value":3}',
        ]
    )

    with pytest.raises(ProviderError, match="rate limited"):
        await module.complete_validated_envelope(
            gateway,
            system="system",
            user="request",
            schema_name="fixture",
            envelope_type=_Envelope,
            validate=lambda _value: None,
        )
    assert gateway.users == ["request", "request"]


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "invalid_content", ["not json", '{"status":"ok","value":"invalid"}']
)
async def test_mock_transport_repairs_invalid_json_or_schema(
    invalid_content: str,
) -> None:
    requests: list[dict[str, object]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(json.loads(request.content))
        content = invalid_content if len(requests) == 1 else '{"status":"ok","value":3}'
        return httpx.Response(
            200, json={"choices": [{"message": {"content": content}}]}
        )

    settings = DefaultAgentSettings(
        DEFAULT_AGENT_API_KEY="test-key",
        DEFAULT_AGENT_BASE_URL="https://provider.invalid/v1",
        DEFAULT_AGENT_MODEL="test-model",
        DEFAULT_AGENT_STRUCTURED_OUTPUT_MODE="prompt_json",
        _env_file=None,
    )
    client = DefaultAgentClient(settings, transport=httpx.MockTransport(handler))
    result = await module.complete_validated_envelope(
        client,
        system="system",
        user="request",
        schema_name="fixture",
        envelope_type=_Envelope,
        validate=lambda _value: None,
        maximum_attempts=2,
    )

    assert result.value == 3
    assert len(requests) == 2
    assert "response_format" not in requests[0]
    assert "CORRECTION_REQUIRED" in requests[1]["messages"][1]["content"]


@pytest.mark.asyncio
async def test_mock_transport_never_accepts_persistently_invalid_output() -> None:
    calls = 0

    def handler(_request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(
            200, json={"choices": [{"message": {"content": '{"value":3}'}}]}
        )

    settings = DefaultAgentSettings(
        DEFAULT_AGENT_API_KEY="test-key",
        DEFAULT_AGENT_BASE_URL="https://provider.invalid/v1",
        DEFAULT_AGENT_MODEL="test-model",
        _env_file=None,
    )
    client = DefaultAgentClient(settings, transport=httpx.MockTransport(handler))
    with pytest.raises(ValueError):
        await module.complete_validated_envelope(
            client,
            system="system",
            user="request",
            schema_name="fixture",
            envelope_type=_Envelope,
            validate=lambda _value: None,
            maximum_attempts=2,
        )
    assert calls == 2
