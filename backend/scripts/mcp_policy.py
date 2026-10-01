"""Python-owned MCP policy consumed by the TypeScript hosted surface."""

from collections.abc import Callable
from typing import Any

from pydantic_settings import BaseSettings

from app.core.config import legal, mcp
from app.core.config.http import API_REQUEST_BODY_MAX_BYTES


def mcp_policy(
    setting: Callable[[str, type[BaseSettings]], dict[str, Any]],
) -> dict[str, Any]:
    return {
        "settings": {
            name: setting(name, mcp.McpSettings)
            for name in mcp.McpSettings.model_fields
        },
        "constants": {
            **{
                name.removeprefix("MCP_").lower(): sorted(value)
                if isinstance(value, frozenset)
                else value
                for name, value in vars(mcp).items()
                if name.startswith("MCP_")
            },
            "api_request_body_max_bytes": API_REQUEST_BODY_MAX_BYTES,
        },
        "terms_revision": legal.TERMS_REVISION,
    }
