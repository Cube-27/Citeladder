"""Onboarding model calls have bounded, independent attempts."""

from __future__ import annotations

import asyncio

import pytest
from pydantic import BaseModel

from app.connectors.answer_engines.errors import ProviderError
from app.core.config.provider_catalog import ERROR_AUTH, ERROR_RATE_LIMIT
from app.domain.projects.onboarding.structured_generation import (
    complete_validated_envelope,
)


class _Envelope(BaseModel):
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
async def test_invalid_output_retries_original_request_at_most_twice() -> None:
    gateway = _Gateway(['{"value":"wrong"}', '{"value":3}'])
    result = await complete_validated_envelope(
        gateway,
        system="system",
        user="original request",
        schema_name="fixture",
        envelope_type=_Envelope,
        validate=lambda _value: None,
        maximum_attempts=3,
    )
    assert result.value == 3
    assert gateway.users == ["original request", "original request"]


@pytest.mark.asyncio
async def test_per_attempt_timeout_can_retry_without_a_nested_repair() -> None:
    class SlowThenReady:
        def __init__(self) -> None:
            self.calls = 0

        async def complete_structured_json(self, **_kwargs) -> str:
            self.calls += 1
            if self.calls == 1:
                await asyncio.Event().wait()
            return '{"value":3}'

    gateway = SlowThenReady()
    result = await complete_validated_envelope(
        gateway,
        system="system",
        user="original request",
        schema_name="fixture",
        envelope_type=_Envelope,
        validate=lambda _value: None,
        maximum_attempts=3,
        timeout_seconds=0.001,
    )
    assert result.value == 3
    assert gateway.calls == 2


@pytest.mark.asyncio
@pytest.mark.parametrize("code", [ERROR_AUTH, ERROR_RATE_LIMIT])
async def test_auth_and_rate_limit_fail_fast(code: str) -> None:
    gateway = _Gateway(
        [ProviderError("provider refused", error_code=code, retryable=True)]
    )
    with pytest.raises(ProviderError, match="provider refused"):
        await complete_validated_envelope(
            gateway,
            system="system",
            user="original request",
            schema_name="fixture",
            envelope_type=_Envelope,
            validate=lambda _value: None,
            maximum_attempts=3,
        )
    assert gateway.users == ["original request"]


@pytest.mark.asyncio
async def test_persistent_invalid_output_stops_after_two_retries() -> None:
    gateway = _Gateway(['{"value":"wrong"}'] * 3)
    with pytest.raises(ValueError):
        await complete_validated_envelope(
            gateway,
            system="system",
            user="original request",
            schema_name="fixture",
            envelope_type=_Envelope,
            validate=lambda _value: None,
            maximum_attempts=3,
        )
    assert len(gateway.users) == 3
