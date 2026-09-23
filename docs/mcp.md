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
approval or denial of the one-time transaction and protects both decisions
against CSRF. A denial consumes only that validated transaction and returns the
standard OAuth `access_denied` result to its previously validated redirect.
The MCP issuer, resource, discovery and token endpoints remain on the configured
protocol origin. Browser consent and login use `FRONTEND_URL`, including when
the browser moves to the app hostname. A stale consent submission on the old
host receives an explicit restart response; no cross-host POST redirect is
permitted.

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

The catalog exposes bounded project and prompt enumeration, business context,
citation-compatible search/fetch documents, query-page evidence, Site Health
pages/link projections, visibility results/sources, Search Intelligence
datasets, Content/task catalog metadata and shared growth-evidence reads. It
delegates to [Growth Agent tools](../backend/app/domain/agent/tools.py) and the
existing domain read services. Search is bounded persisted retrieval; it is not
a web search or provider request. Missing projections remain unavailable and
cannot be repaired by reading them. Search Intelligence summaries retain their
dataset grain: referring-domain and destination-page aggregates are not exposed
as individual backlink edges.

Every retrievable evidence reference uses an allowlisted `citeladder://` record
type. `fetch` reauthorizes the owning workspace and returns the normalized
`id`/`title`/`text`/`url`/`metadata` document while preserving the structured
record for established callers. Raw provider transports, credentials, arbitrary
URLs, tables, SQL and filesystem paths are not resolvers.

## Client experience and limits

Clients discover authorized projects, inspect the available-dataset inventory,
then page through or fetch specific evidence. The browser account menu links to
public setup instructions; there is no separate MCP Settings editor. OAuth
return paths are restricted to the internal consent transaction and cannot
become arbitrary redirects. Grant revocation is available through the OAuth
revocation endpoint and supporting clients; membership removal blocks affected
reads immediately.

The locked SDK is `mcp==2.2.0`. Component acceptance covers the legacy
`2025-11-25` initialize lifecycle and the `2026-07-28` per-request lifecycle
(`server/discover`, protocol/method headers and reserved request metadata).
This proves the repository wire contract, not acceptance in every client build
or the deployed origin.

A tool response does not authorize publishing, prompt activation, a crawl,
model generation or any other mutation. Streamable HTTP delivery has no
authority to rerun a product acquisition when a client retries.
[Workspace access](workspace-access.md) remains the shared role/identity owner.

[Protocol and authorization tests](../backend/tests/component/test_mcp.py) and
[evidence catalog tests](../backend/tests/component/test_mcp_evidence_catalog.py)
cover consent denial, rotation/revocation, both supported protocol lifecycles,
generated catalog parity, bounded enumeration, retrieval documents, disabled
server behavior, request limits and tenant isolation. These tests do not
establish that a particular public client or deployed origin has passed
external acceptance.
