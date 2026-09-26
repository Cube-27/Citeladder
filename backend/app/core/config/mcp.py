"""Configuration for the account-scoped, read-only MCP surface."""

from __future__ import annotations

from urllib.parse import SplitResult, urlsplit

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

from app.core.config import settings
from app.core.config.dotenv import dotenv_sources

# The consent document contains no executable script. Its one registered OAuth
# redirect origin is added to form-action by the response owner for POST returns.
MCP_CONSENT_CSP = (
    "default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; "
    "object-src 'none'; base-uri 'none'; frame-ancestors 'none'"
)

MCP_READ_SCOPE = "citeladder:read"
MCP_SCOPE_DESCRIPTIONS = {MCP_READ_SCOPE: "Read CiteLadder project data"}
MCP_SERVER_VERSION = "1.1.0"
MCP_DOCUMENTATION_URL = "https://docs.citeladder.com/mcp/"
MCP_MAX_SEARCH_RESULTS = 20
MCP_DEFAULT_LIST_LIMIT = 50
MCP_MAX_LIST_LIMIT = 200
MCP_MAX_DOCUMENT_BYTES = 256_000
MCP_MAX_VISIBILITY_SOURCE_OFFSET = 20_000

# Dynamic client registration bounds. The body cap sits far below the protocol
# app's general limit because registration is anonymous and persists what it
# accepts; a real registration document is well under 2 KiB.
MCP_REGISTRATION_MAX_BODY_BYTES = 16_384
MCP_MAX_REDIRECT_URIS = 10
MCP_MAX_REDIRECT_URI_LENGTH = 2_048
MCP_MAX_CLIENT_NAME_LENGTH = 200
MCP_SUPPORTED_GRANT_TYPES = frozenset({"authorization_code", "refresh_token"})
MCP_SUPPORTED_RESPONSE_TYPES = frozenset({"code"})
MCP_UNUSED_CLIENT_PRUNE_BATCH = 100


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
    # A registered client that never obtained a grant within this window is
    # pruned by later registrations; the client re-registers if it returns.
    unused_client_ttl_seconds: int = Field(default=86_400, ge=3600, le=2_592_000)


mcp_settings = McpSettings()


def mcp_public_origin() -> str:
    """Return the canonical public origin or fail closed on an unsafe shape."""
    configured = mcp_settings.public_base_url.strip()
    if (
        mcp_settings.enabled
        and settings.app_env.casefold() == "production"
        and not configured
    ):
        raise RuntimeError(
            "MCP_PUBLIC_BASE_URL is required when MCP is enabled in production"
        )
    candidate = (configured or settings.frontend_url).rstrip("/")
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
