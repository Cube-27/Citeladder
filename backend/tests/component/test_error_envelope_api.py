"""Component tests for the unified API error envelope (WS-A A1).

Exercises the live HTTP boundary: the retained Python routers
raise ``ApiException``; legacy raw
``HTTPException`` raises (unmigrated routers + Starlette routing errors) go
through the compatibility shim; request validation and unhandled exceptions
hit the two global handlers. Every non-2xx response carries the canonical
``{detail, error: {code, message, request_id, retryable, details?}}`` payload
while the legacy ``detail`` shape (string or coded dict) is preserved.
"""

from __future__ import annotations

import uuid

import httpx
import pytest
from fastapi import FastAPI
from httpx import ASGITransport

from app.core.config import settings
from app.core.telemetry import (
    generate_correlation_id,
    reset_correlation_id,
    set_correlation_id,
)
from app.main import app
from tests.component.auth_helpers import register_and_login

pytestmark = pytest.mark.asyncio

_EMAIL = "envelope@example.com"


async def _register(client: httpx.AsyncClient, email: str = _EMAIL) -> None:
    await register_and_login(client, email)


def _assert_envelope(body: dict, *, code: str, retryable: bool) -> None:
    """The canonical block is present, coherent, and correlation-identified."""
    error = body["error"]
    assert error["code"] == code
    assert error["retryable"] is retryable
    assert isinstance(error["message"], str)
    assert error["message"]
    assert isinstance(error["request_id"], str)
    assert error["request_id"]
    # ``detail`` stays the legacy human payload; the block mirrors it.
    assert body["detail"] == error["message"] or isinstance(body["detail"], dict)


# =========================================================================
# Shim: Starlette routing errors + unmigrated legacy HTTPException routers
# =========================================================================
async def test_unknown_route_404_uses_envelope(client: httpx.AsyncClient) -> None:
    resp = await client.get(f"/api/v1/no-such-route/{uuid.uuid4()}")
    assert resp.status_code == 404
    body = resp.json()
    assert body["detail"] == "Not Found"
    _assert_envelope(body, code="not_found", retryable=False)


async def test_legacy_http_exception_router_normalized_by_shim(
    client: httpx.AsyncClient,
) -> None:
    """Unmigrated router authorization keeps its normalized envelope."""
    invalid = await client.post(
        f"/api/v1/projects/{uuid.uuid4()}/commerce/competitors/discover",
        json={"targets": [{"kind": "product", "id": str(uuid.uuid4())}]},
    )
    assert invalid.status_code == 401
    body = invalid.json()
    assert isinstance(body["detail"], str)  # legacy string detail preserved
    _assert_envelope(body, code="unauthorized", retryable=False)
    assert body["error"]["message"] == body["detail"]


async def test_request_validation_error_envelope(client: httpx.AsyncClient) -> None:
    """FastAPI's 422 array normalizes into sanitized field-level details."""
    await _register(client, "env-validation@example.com")
    resp = await client.post(
        "/api/v1/projects/not-a-uuid/commerce/competitors/discover",
        json={"targets": [{"kind": "product", "id": str(uuid.uuid4())}]},
    )
    assert resp.status_code == 422
    body = resp.json()
    # ``detail`` is now a human string, not the raw validation array.
    assert isinstance(body["detail"], str)
    assert "project_id" in body["detail"]
    _assert_envelope(body, code="validation_error", retryable=False)
    errors = body["error"]["details"]["errors"]
    assert errors[0]["loc"] == ["project_id"]
    for entry in errors:
        assert set(entry) <= {"loc", "message", "type"}


# =========================================================================
# Global handler: unhandled exceptions become a sanitized 500 envelope
# =========================================================================
async def test_unhandled_exception_returns_internal_error_envelope() -> None:
    marker = "boom-internal-marker"

    async def _boom() -> None:
        raise RuntimeError(marker)

    # A LOCAL app carrying the shared app's registered handlers, rather than
    # adding a throwaway route to the shared router and stripping it in a
    # `finally`: that mutation is visible to every other test while it is in
    # place, and a crash between the add and the cleanup leaks the route for
    # the rest of the session.
    test_app = FastAPI()
    test_app.add_api_route(
        "/__test-unhandled-envelope", _boom, methods=["GET"], include_in_schema=False
    )
    for exc_class_or_status, handler in app.exception_handlers.items():
        test_app.add_exception_handler(exc_class_or_status, handler)

    # The shared app's correlation middleware is a closure inside
    # ``create_app`` (not importable), so mint the id the same way here — the
    # handler reads ``request.state.correlation_id``, and the A6 support path
    # this test asserts depends on that id being present.
    @test_app.middleware("http")
    async def _correlation(request, call_next):
        correlation_id = generate_correlation_id()
        request.state.correlation_id = correlation_id
        token = set_correlation_id(correlation_id)
        try:
            response = await call_next(request)
        finally:
            reset_correlation_id(token)
        response.headers[settings.request_id_header] = correlation_id
        return response

    # ServerErrorMiddleware re-raises after responding; don't re-raise here.
    transport = ASGITransport(app=test_app, raise_app_exceptions=False)
    async with httpx.AsyncClient(
        transport=transport, base_url="http://testserver"
    ) as raw_client:
        resp = await raw_client.get("/__test-unhandled-envelope")

    assert resp.status_code == 500
    body = resp.json()
    _assert_envelope(body, code="internal_error", retryable=True)
    assert body["error"]["message"] == "An unexpected error occurred"
    # No stack trace / internals in the body.
    assert marker not in resp.text
    assert "RuntimeError" not in resp.text
    assert "Traceback" not in resp.text
    # The request id correlates with backend logs (A6 support path).
    assert resp.headers[settings.request_id_header] == body["error"]["request_id"]
