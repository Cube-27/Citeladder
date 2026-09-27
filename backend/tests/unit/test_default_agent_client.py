"""Application-model client tests (mock transport; no external model calls)."""

from __future__ import annotations

import json

import httpx
import pytest

from app.connectors.agent import client as client_module
from app.connectors.agent.client import AgentNotConfiguredError, DefaultAgentClient
from app.connectors.answer_engines.errors import ProviderError
from app.core.config.agent import DefaultAgentSettings
from app.core.config.provider_catalog import ERROR_PARSE, ERROR_RATE_LIMIT


def _settings(*, api_key: str = "test-key") -> DefaultAgentSettings:
    return DefaultAgentSettings(
        DEFAULT_AGENT_API_KEY=api_key,
        DEFAULT_AGENT_BASE_URL="https://mock.provider.test/v1",
        DEFAULT_AGENT_MODEL="test-model",
        DEFAULT_AGENT_TIMEOUT_SECONDS=5,
        DEFAULT_AGENT_MAX_OUTPUT_TOKENS=123,
    )


def _client(handler) -> DefaultAgentClient:
    return DefaultAgentClient(_settings(), transport=httpx.MockTransport(handler))


@pytest.fixture(autouse=True)
def _fresh_cap_memo(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(client_module, "_LEGACY_CAP_ROUTES", set())


@pytest.mark.asyncio
async def test_complete_json_uses_prompt_mode_without_key_in_body() -> None:
    captured: dict[str, object] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["authorization"] = request.headers["authorization"]
        captured["body"] = json.loads(request.content)
        return httpx.Response(
            200, json={"choices": [{"message": {"content": '{"ok":true}'}}]}
        )

    result = await _client(handler).complete_json(system="system", user="user")

    assert result == '{"ok":true}'
    assert captured["authorization"] == "Bearer test-key"
    body = captured["body"]
    assert isinstance(body, dict)
    assert "response_format" not in body
    assert "valid JSON object" in body["messages"][1]["content"]
    assert body["max_completion_tokens"] == 123
    assert "max_tokens" not in body
    assert "test-key" not in json.dumps(body)


@pytest.mark.asyncio
async def test_complete_json_removes_markdown_fences() -> None:
    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={"choices": [{"message": {"content": '```json\n{"ok":true}\n```'}}]},
        )

    result = await _client(handler).complete_json(system="system", user="user")

    assert result == '{"ok":true}'


@pytest.mark.asyncio
async def test_complete_structured_json_prompts_with_schema_by_default() -> None:
    captured: dict[str, object] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["body"] = json.loads(request.content)
        return httpx.Response(200, json={"choices": [{"message": {"content": "{}"}}]})

    await _client(handler).complete_structured_json(
        system="system",
        user="user",
        schema_name="brand_research",
        schema={"type": "object", "additionalProperties": False},
    )

    body = captured["body"]
    assert isinstance(body, dict)
    assert "response_format" not in body
    assert "additionalProperties" in body["messages"][1]["content"]


@pytest.mark.asyncio
async def test_errors_are_classified_and_do_not_expose_key() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(429, headers={"retry-after": "4"})

    with pytest.raises(ProviderError) as excinfo:
        await _client(handler).complete_json(system="s", user="u")

    assert excinfo.value.error_code == ERROR_RATE_LIMIT
    assert excinfo.value.retry_after_seconds == 4
    assert "test-key" not in str(excinfo.value)


@pytest.mark.asyncio
async def test_malformed_success_body_is_a_parse_error() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"choices": []})

    with pytest.raises(ProviderError) as excinfo:
        await _client(handler).complete_json(system="s", user="u")
    assert excinfo.value.error_code == ERROR_PARSE


def test_missing_key_is_rejected() -> None:
    with pytest.raises(AgentNotConfiguredError):
        DefaultAgentClient(_settings(api_key=""))


@pytest.mark.parametrize("missing", ["base_url", "model"])
def test_endpoint_and_model_are_required_for_configuration(missing: str) -> None:
    settings = _settings().model_copy(update={missing: ""})

    assert not settings.configured
    with pytest.raises(AgentNotConfiguredError):
        DefaultAgentClient(settings)


@pytest.mark.asyncio
async def test_output_cap_falls_back_once_and_is_remembered() -> None:
    sent: list[dict] = []

    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        sent.append(body)
        if "max_completion_tokens" in body:
            # Mistral-style validation error naming the refused field.
            return httpx.Response(
                422,
                json={"detail": [{"loc": ["body", "max_completion_tokens"]}]},
            )
        return httpx.Response(200, json={"choices": [{"message": {"content": "{}"}}]})

    client = _client(handler)
    await client.complete_json(system="s", user="u")
    await client.complete_json(system="s", user="u")

    assert [next(k for k in b if k.startswith("max_")) for b in sent] == [
        "max_completion_tokens",
        "max_tokens",
        "max_tokens",
    ]
    assert all(b["max_tokens"] == 123 for b in sent[1:])


@pytest.mark.asyncio
async def test_failed_fallback_is_not_remembered() -> None:
    sent: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        sent.append(next(k for k in body if k.startswith("max_")))
        if "max_completion_tokens" in body:
            return httpx.Response(
                400, json={"error": {"param": "max_completion_tokens"}}
            )
        return httpx.Response(401, json={"error": {"code": "invalid_api_key"}})

    client = _client(handler)
    for _ in range(2):
        with pytest.raises(ProviderError):
            await client.complete_json(system="s", user="u")

    assert sent == ["max_completion_tokens", "max_tokens"] * 2


@pytest.mark.asyncio
async def test_unrelated_client_error_is_not_retried(
    caplog: pytest.LogCaptureFixture,
) -> None:
    calls = 0

    def handler(_request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(
            400,
            json={
                "error": {
                    "type": "invalid_request_error",
                    "code": "model_not_found",
                    "param": "model",
                    "message": "echoed prompt text",
                }
            },
        )

    with pytest.raises(ProviderError), caplog.at_level("WARNING"):
        await _client(handler).complete_json(system="s", user="u")

    assert calls == 1
    record = next(r for r in caplog.records if r.message == "default agent call failed")
    assert record.provider_error_code == "model_not_found"
    assert record.provider_error_param == "model"
    assert "echoed prompt text" not in str(record.__dict__)


@pytest.mark.asyncio
async def test_exhausted_reasoning_budget_names_the_finish_reason() -> None:
    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={"choices": [{"message": {"content": ""}, "finish_reason": "length"}]},
        )

    with pytest.raises(ProviderError, match="finish_reason=length") as excinfo:
        await _client(handler).complete_json(system="s", user="u")
    assert excinfo.value.error_code == ERROR_PARSE
