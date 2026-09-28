"""JEV connector: request shape, retry policy and response parsing.

Every call runs against ``httpx.MockTransport``; no test reaches TypeSafe.
"""

from __future__ import annotations

import json

import httpx
import pytest

from app.connectors.answer_engines.errors import ProviderError
from app.connectors.jev import JevClient
from app.core.config.jev import JevSettings

_ANSWER = {
    "model": "jev-1.13.0",
    "answers": {"natural": {"type": "noul", "noul": 0.9}},
    "usage": {"input_tokens": 12, "output_tokens": 3},
}


def _client(handler, *, sleeps: list[float] | None = None) -> JevClient:
    async def _sleep(seconds: float) -> None:
        if sleeps is not None:
            sleeps.append(seconds)

    return JevClient(
        api_key="test-key",
        base_url="https://jev.test/",
        model="jev-latest",
        timeout_seconds=1,
        max_attempts=3,
        backoff_seconds=0.25,
        transport=httpx.MockTransport(handler),
        sleep=_sleep,
    )


@pytest.mark.asyncio
async def test_decide_posts_state_and_questions_with_bearer_auth() -> None:
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200, json=_ANSWER)

    questions = {"natural": {"type": "noul", "instructions": "Natural?"}}
    async with _client(handler) as client:
        decision = await client.decide({"candidate": {"question": "q"}}, questions)

    assert decision.model == "jev-1.13.0"
    assert decision.answers["natural"]["noul"] == 0.9
    assert decision.usage == {"input_tokens": 12, "output_tokens": 3}
    request = seen[0]
    assert str(request.url) == "https://jev.test/v1/systemone"
    assert request.headers["authorization"] == "Bearer test-key"
    assert json.loads(request.content) == {
        "state": {"candidate": {"question": "q"}},
        "model": "jev-latest",
        "questions": questions,
    }


@pytest.mark.asyncio
@pytest.mark.parametrize("status", [429, 503, 529])
async def test_rate_limit_and_overload_retry_then_succeed(status: int) -> None:
    responses = [httpx.Response(status, headers={"retry-after": "2"})]
    sleeps: list[float] = []

    def handler(_request: httpx.Request) -> httpx.Response:
        return responses.pop(0) if responses else httpx.Response(200, json=_ANSWER)

    async with _client(handler, sleeps=sleeps) as client:
        decision = await client.decide("state", {})

    assert decision.answers
    assert sleeps == [2.0]


@pytest.mark.asyncio
async def test_timeouts_retry_until_attempts_are_spent() -> None:
    calls = 0
    sleeps: list[float] = []

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        raise httpx.ReadTimeout("slow", request=request)

    async with _client(handler, sleeps=sleeps) as client:
        with pytest.raises(ProviderError) as caught:
            await client.decide("state", {})

    assert calls == 3
    assert sleeps == [0.25, 0.5]
    assert caught.value.error_code == "timeout"


@pytest.mark.asyncio
@pytest.mark.parametrize("status", [401, 422])
async def test_auth_and_validation_failures_never_retry(status: int) -> None:
    calls = 0

    def handler(_request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(status, json={"detail": "no"})

    async with _client(handler) as client:
        with pytest.raises(ProviderError) as caught:
            await client.decide("state", {})

    assert calls == 1
    assert caught.value.retryable is False


@pytest.mark.asyncio
async def test_a_response_without_answers_is_a_parse_error() -> None:
    async with _client(lambda _r: httpx.Response(200, json={"model": "x"})) as client:
        with pytest.raises(ProviderError) as caught:
            await client.decide("state", {})
    assert caught.value.error_code == "parse_error"


def test_blank_key_means_off_and_base_url_must_be_https() -> None:
    assert JevSettings(api_key="").enabled is False
    assert JevSettings(api_key="k").enabled is True
    with pytest.raises(ValueError):
        JevSettings(base_url="http://api.typesafe.ai")
