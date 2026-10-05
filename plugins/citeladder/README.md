# CiteLadder plugin

The source package contains public read-only review skills and the existing
`https://citeladder.com/mcp` connection. It requires a connected CiteLadder
account, explicit workspace consent and existing project measurements. There
is no sample mode. The repository marketplace is
`.agents/plugins/marketplace.json`; restart ChatGPT desktop to discover it.
Portable clients use `mcp.json`. A registered ChatGPT connection binding must
use its actual app ID; this package deliberately contains no invented ID.

Build the static resource from `frontend` with
`pnpm --filter @citeladder/mcp-app build`. The API Docker build performs that
step and packages the HTML. Set `MCP_UI_ENABLED=true` to expose presentation
tools/resources and optionally `MCP_EXTENSIONS_ENABLED=true` for global/thread
entries. Base read tools and grants work independently of those switches.
Resource loads contain no project data; the UI calls authenticated tools via
the MCP Apps bridge and makes no direct application network requests.

Private development installation is not deployed-host or directory acceptance.
The owner documentation in [docs/mcp.md](../../docs/mcp.md) retains the client
matrix, review cases, CIMD assessment and external release requirements.
