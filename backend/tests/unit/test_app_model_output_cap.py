"""Customer app-model requests adapt to the provider's output-cap dialect."""

from __future__ import annotations

from typing import Any, cast

import pytest

from app.connectors.app_model_transport import (
    AppModelJsonResponse,
    AppModelTransportError,
    post_with_output_cap,
)
from app.connectors.web_evidence.contracts import ResolvedTarget


class _Transport:
    def __init__(self, *failures: AppModelTransportError) -> None:
        self.failures = list(failures)
        self.payloads: list[dict[str, Any]] = []

    async def post(self, *, payload: dict[str, Any], **_: Any) -> AppModelJsonResponse:
        self.payloads.append(payload)
        if self.failures:
            raise self.failures.pop(0)
        return AppModelJsonResponse(status_code=200, body={}, latency_ms=1)


async def _post(transport: _Transport) -> None:
    await post_with_output_cap(
        transport,
        target=cast(ResolvedTarget, object()),
        api_key="k",
        payload={"model": "m"},
        output_cap=32,
        timeout_seconds=1,
        max_response_bytes=1024,
    )


def _rejection(*, refused: bool) -> AppModelTransportError:
    return AppModelTransportError(
        "provider_error", "HTTP 400", status_code=400, refused_output_cap=refused
    )


@pytest.mark.asyncio
async def test_refused_cap_is_retried_once_with_the_legacy_name() -> None:
    transport = _Transport(_rejection(refused=True))
    await _post(transport)
    assert transport.payloads == [
        {"model": "m", "max_completion_tokens": 32},
        {"model": "m", "max_tokens": 32},
    ]


@pytest.mark.asyncio
async def test_other_provider_errors_are_not_retried() -> None:
    transport = _Transport(_rejection(refused=False))
    with pytest.raises(AppModelTransportError):
        await _post(transport)
    assert len(transport.payloads) == 1
