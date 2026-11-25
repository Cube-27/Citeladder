# CiteLadder plugin

The source package contains three read-only review skills and the existing
`https://api.citeladder.com/mcp` connection. It requires a connected CiteLadder
account, explicit workspace consent and existing project measurements. The
connection is read-only; changes are made in the CiteLadder app. There is no
sample mode. The repository marketplace is
`.agents/plugins/marketplace.json`; restart ChatGPT desktop to discover it.
Portable clients use `mcp.json`. The published ChatGPT plugin is
https://chatgpt.com/plugins/plugin_asdk_app_6b04f8e29ee481919d3827248811c8f4.

Build the interactive app from `frontend` with
`pnpm --filter @citeladder/mcp-app build`; the API Docker build performs that
step and packages the HTML. The server always offers it: hosts with MCP Apps,
ChatGPT included, render it inline in the conversation, and hosts without MCP
Apps use the read tools as text. Resource loads contain no project data; the UI calls
authenticated tools through the MCP Apps bridge and makes no direct network
requests.

Private development installation is not deployed-host or directory acceptance.
The owner documentation in [docs/mcp.md](../../docs/mcp.md) retains the client
matrix, review cases, CIMD assessment and external release requirements.
