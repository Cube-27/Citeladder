"""Fail-closed configuration for the public MCP authorization origin."""

from __future__ import annotations

import httpx
import pytest
from starlette.responses import PlainTextResponse

from app.core.config import settings
from app.core.config.mcp import mcp_public_origin, mcp_settings
from app.domain.mcp.server import McpDispatchMiddleware, _transport_security


def test_mcp_origin_requires_https_in_production(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "app_env", "production")
    monkeypatch.setattr(mcp_settings, "public_base_url", "http://example.test")

    with pytest.raises(RuntimeError, match="HTTPS"):
        mcp_public_origin()


def test_demo_mcp_must_use_the_provisioned_account(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "app_env", "development")
    monkeypatch.setattr(settings, "demo_mode", True)
    monkeypatch.setattr(settings, "dev_login_email", "demo@example.test")
    monkeypatch.setattr(mcp_settings, "enabled", True)
    monkeypatch.setattr(mcp_settings, "public_base_url", "http://127.0.0.1:3000")
    monkeypatch.setattr(mcp_settings, "allowed_account_email", "other@example.test")

    with pytest.raises(RuntimeError, match="provisioned dev account"):
        mcp_public_origin()


def test_enabled_production_mcp_requires_explicit_protocol_origin(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "app_env", "production")
    monkeypatch.setattr(settings, "frontend_url", "https://app.example.test")
    monkeypatch.setattr(mcp_settings, "enabled", True)
    monkeypatch.setattr(mcp_settings, "public_base_url", "")

    with pytest.raises(RuntimeError, match="required"):
        mcp_public_origin()


def test_valid_demo_mcp_origin_is_canonical(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "app_env", "development")
    monkeypatch.setattr(settings, "demo_mode", True)
    monkeypatch.setattr(settings, "dev_login_email", "demo@example.test")
    monkeypatch.setattr(mcp_settings, "enabled", True)
    monkeypatch.setattr(mcp_settings, "public_base_url", "http://127.0.0.1:3000/")
    monkeypatch.setattr(mcp_settings, "allowed_account_email", "DEMO@example.test")

    assert mcp_public_origin() == "http://127.0.0.1:3000"


@pytest.mark.asyncio
async def test_split_origin_admits_only_browser_consent_on_app_host(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "frontend_url", "https://app.example.test")
    monkeypatch.setattr(mcp_settings, "enabled", True)
    transport_security = _transport_security()
    assert "app.example.test:443" in transport_security.allowed_hosts
    assert "https://app.example.test:443" in transport_security.allowed_origins

    async def protocol(scope, receive, send):  # type: ignore[no-untyped-def]
        await PlainTextResponse("protocol")(scope, receive, send)

    async def fallback(scope, receive, send):  # type: ignore[no-untyped-def]
        await PlainTextResponse("not found", status_code=404)(scope, receive, send)

    app = McpDispatchMiddleware(fallback, protocol)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app)) as client:
        consent = await client.get(
            "https://app.example.test/mcp/oauth/consent",
            headers={
                "Host": "app.example.test:443",
                "Origin": "https://app.example.test",
            },
        )
        explicit_origin = await client.get(
            "https://app.example.test/mcp/oauth/consent",
            headers={"Origin": "https://app.example.test:443"},
        )
        wrong_port = await client.get(
            "https://app.example.test/mcp/oauth/consent",
            headers={"Host": "app.example.test:444"},
        )
        wrong_origin = await client.get(
            "https://app.example.test/mcp/oauth/consent",
            headers={"Origin": "https://app.example.test:444"},
        )
        credentialed_origin = await client.get(
            "https://app.example.test/mcp/oauth/consent",
            headers={"Origin": "https://someone@app.example.test"},
        )
        app_token = await client.post("https://app.example.test/token")
        apex_consent = await client.post("http://127.0.0.1:3000/mcp/oauth/consent")
        apex_token = await client.post("http://127.0.0.1:3000/token")
    assert consent.status_code == 200
    assert explicit_origin.status_code == 200
    assert wrong_port.status_code == 403
    assert wrong_origin.status_code == 403
    assert credentialed_origin.status_code == 403
    assert app_token.status_code == 403
    assert apex_consent.status_code == 409
    assert apex_token.status_code == 200
