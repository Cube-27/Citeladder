"""Generate the public MCP tool reference from registered server metadata."""

from __future__ import annotations

import asyncio
import json
from pathlib import Path

from app.core.config.mcp import MCP_SERVER_VERSION
from app.domain.mcp.server import mcp_server

TOOL_REFERENCE_PATH = (
    Path(__file__).resolve().parents[2]
    / "frontend/apps/marketing/src/data/mcp-tools.json"
)


async def reference() -> dict[str, object]:
    tools = sorted(await mcp_server.list_tools(), key=lambda item: item.name)
    return {
        "server_version": MCP_SERVER_VERSION,
        "access": "read_only",
        "tools": [
            {
                "name": tool.name,
                "title": tool.title,
                "description": tool.description,
                "input_schema": tool.input_schema,
                "read_only": bool(tool.annotations and tool.annotations.read_only_hint),
            }
            for tool in tools
        ],
    }


def main() -> None:
    TOOL_REFERENCE_PATH.parent.mkdir(parents=True, exist_ok=True)
    TOOL_REFERENCE_PATH.write_text(
        json.dumps(asyncio.run(reference()), indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
