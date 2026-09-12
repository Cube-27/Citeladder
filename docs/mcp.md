# Hosted MCP

## Responsibility

CiteLadder's hosted MCP server is a read interface over persisted product
owners. It owns OAuth authorization records and bounded tool delivery, not
business data, generation or external mutation. Public client setup is served
at /docs/mcp; engineering ownership is here.

## Connection and consent

The [server](../backend/app/domain/mcp/server.py) mounts stateless Streamable
HTTP at /mcp through the application factory. Its
[OAuth provider](../backend/app/domain/mcp/oauth_provider.py) exposes metadata,
dynamic registration, PKCE authorization codes, rotating refresh tokens and
revocation. Dynamic registration uses /mcp/register to avoid the browser signup
route. Browser login establishes identity; /mcp/oauth/consent requires explicit
approval of the one-time transaction and protects consent against CSRF.

[Configuration](../backend/app/core/config/mcp.py) owns enablement and bounds.
An enabled server requires a safe public origin; disabled MCP must not break
the rest of application startup. Protocol routes remain behind request-body and
transport-security guards. A demo allowlist is an additional admission condition,
not the tenant boundary.

[MCP models](../backend/app/models/mcp.py) persist clients, transactions, codes
and grants. Bearer/refresh/code values are hashed rather than stored raw;
confidential client secrets use encrypted custody. Expiration, rotation and
revocation prevent reusing a grant as permanent access.

## Authorization on each read

A grant binds to a CiteLadder user account.
[Data projections](../backend/app/domain/mcp/data.py) resolve that account's
current workspace memberships and permitted read roles on every product read.
System workspaces remain excluded even if a stray membership exists.
Project/object IDs never authorize themselves. Revoking membership changes
what an existing grant may read without copying business data into MCP.

The catalog exposes project discovery, business context, bounded search/fetch,
Content/task catalog metadata and shared growth-evidence reads. It delegates
to [Growth Agent tools](../backend/app/domain/agent/tools.py) and existing domain
read services. Search is bounded persisted retrieval; it is not a web search or
provider request. Missing projections remain unavailable and cannot be repaired
by reading them.

## Client experience and limits

Clients discover authorized projects, request project context, then fetch
specific evidence. The browser account menu links to public setup instructions;
there is no separate MCP Settings editor. OAuth return paths are restricted to
the internal consent transaction and cannot become arbitrary redirects.

A tool response does not authorize publishing, prompt activation, a crawl,
model generation or any other mutation. Streamable HTTP delivery has no
authority to rerun a product acquisition when a client retries.
[Workspace access](workspace-access.md) remains the shared role/identity owner.

[Protocol and authorization tests](../backend/tests/component/test_mcp.py)
cover consent, rotation/revocation, disabled-server behavior, request limits
and exclusion of system-workspace data. These tests do not establish that a
particular public client or deployed origin has passed external acceptance.
