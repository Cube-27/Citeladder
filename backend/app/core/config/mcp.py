"""Configuration for the account-scoped, read-only MCP surface."""

from __future__ import annotations

from urllib.parse import SplitResult, urlsplit

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

from app.core.config import settings
from app.core.config.dotenv import dotenv_sources

MCP_READ_SCOPE = "citeladder:read"
MCP_SERVER_VERSION = "1.0.0"
MCP_MAX_SEARCH_RESULTS = 20


class McpSettings(BaseSettings):
    """Deployment-owned admission, endpoint, and credential lifetimes."""

    model_config = SettingsConfigDict(
        env_prefix="MCP_",
        env_file=dotenv_sources(),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    enabled: bool = False
    public_base_url: str = ""
    allowed_account_email: str = ""
    authorization_request_ttl_seconds: int = Field(default=600, ge=60, le=1800)
    authorization_code_ttl_seconds: int = Field(default=300, ge=60, le=600)
    access_token_ttl_seconds: int = Field(default=3600, ge=300, le=86_400)
    refresh_token_ttl_seconds: int = Field(default=2_592_000, ge=3600, le=31_536_000)


mcp_settings = McpSettings()


def mcp_public_origin() -> str:
    """Return the canonical public origin or fail closed on an unsafe shape."""
    candidate = (mcp_settings.public_base_url.strip() or settings.frontend_url).rstrip(
        "/"
    )
    parsed = urlsplit(candidate)
    if _invalid_origin(parsed):
        raise RuntimeError("MCP_PUBLIC_BASE_URL must be an HTTP(S) origin")
    if settings.app_env.casefold() == "production" and parsed.scheme != "https":
        raise RuntimeError("MCP_PUBLIC_BASE_URL must use HTTPS in production")
    _validate_demo_admission()
    return candidate


def _invalid_origin(parsed: SplitResult) -> bool:
    return bool(
        parsed.scheme not in {"http", "https"}
        or not parsed.hostname
        or parsed.username is not None
        or parsed.password is not None
        or parsed.query
        or parsed.fragment
        or parsed.path not in {"", "/"}
    )


def _validate_demo_admission() -> None:
    if (
        mcp_settings.enabled
        and settings.demo_mode
        and mcp_settings.allowed_account_email.strip().casefold()
        != settings.dev_login_email.strip().casefold()
    ):
        raise RuntimeError(
            "Demo MCP access must be restricted to the provisioned dev account"
        )
