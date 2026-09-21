"""Generate the public MCP tool reference from registered server metadata."""

from __future__ import annotations

import argparse
import asyncio
import json
from pathlib import Path

from app.core.config.mcp import MCP_SERVER_VERSION
from app.domain.mcp.server import mcp_server


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
    parser = argparse.ArgumentParser()
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(asyncio.run(reference()), indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
