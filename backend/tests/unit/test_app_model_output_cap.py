"""Customer app-model requests adapt to the provider's output-cap dialect."""

from __future__ import annotations

import uuid
from typing import Any, cast

import pytest

from app.connectors import app_model_transport as transport_module
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


_ROUTE = (uuid.uuid4(), uuid.uuid4(), uuid.uuid4())


@pytest.fixture(autouse=True)
def _fresh_cap_memo(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(transport_module, "_LEGACY_CAP_ROUTES", set())


async def _post(transport: _Transport, route: tuple = _ROUTE) -> None:
    await post_with_output_cap(
        transport,
        route_key=route,
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
async def test_refused_cap_is_retried_once_and_remembered_per_route() -> None:
    transport = _Transport(_rejection(refused=True))
    await _post(transport)
    await _post(transport)
    # Another route, or a new revision of this one, learns its own dialect.
    await _post(transport, (_ROUTE[0], uuid.uuid4(), _ROUTE[2]))
    assert transport.payloads == [
        {"model": "m", "max_completion_tokens": 32},
        {"model": "m", "max_tokens": 32},
        {"model": "m", "max_tokens": 32},
        {"model": "m", "max_completion_tokens": 32},
    ]


@pytest.mark.asyncio
async def test_other_provider_errors_are_not_retried() -> None:
    transport = _Transport(_rejection(refused=False))
    with pytest.raises(AppModelTransportError):
        await _post(transport)
    assert len(transport.payloads) == 1
