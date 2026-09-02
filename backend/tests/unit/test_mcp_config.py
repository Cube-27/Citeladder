"""Fail-closed configuration for the public MCP authorization origin."""

from __future__ import annotations

import pytest

from app.core.config import settings
from app.core.config.mcp import mcp_public_origin, mcp_settings


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
