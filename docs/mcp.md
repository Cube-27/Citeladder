# Hosted MCP

## Responsibility

CiteLadder's hosted MCP server is a read interface over persisted product
owners. It owns OAuth authorization records and bounded tool delivery, not
business data, generation or external mutation. Public client setup is served
at `https://docs.citeladder.com/mcp/`; engineering ownership is here. The protocol
endpoint remains on the configured apex origin, not the documentation hostname.

## Connection and consent

The [server](../frontend/services/api/src/mcp/server.ts) mounts stateless Streamable
HTTP at /mcp through the application factory. Its
[OAuth provider](../frontend/services/api/src/mcp/oauth.ts) exposes metadata,
dynamic registration, PKCE authorization codes, rotating refresh tokens and
revocation. Dynamic registration uses /mcp/register to avoid the browser signup
route. Browser login establishes identity; /mcp/oauth/consent requires explicit
approval or denial of the one-time transaction and protects both decisions
against CSRF. A denial consumes only that validated transaction and returns the
standard OAuth `access_denied` result to its previously validated redirect.
Consent HTML has a script-free CSP; form submission permits only its own origin
and the transaction's registered redirect origin so browser-enforced policy
preserves the OAuth POST return. The app Worker preserves this response policy.
The MCP issuer, resource, discovery and token endpoints remain on the configured
protocol origin. Browser consent and login use `FRONTEND_URL`, including when
the browser moves to the app hostname. A stale consent submission on the old
host receives an explicit restart response; no cross-host POST redirect is
permitted.

## Client registration

Dynamic registration stays open and unauthenticated, as RFC 7591 intends: MCP
clients register before any CiteLadder login exists. A remote HTTPS callback on
any host is legitimate; there is deliberately no redirect-host allowlist. The
protections are bounds and binding instead:

- The [registration guard](../frontend/services/api/src/mcp/registration.ts)
  charges per-client burst and window budgets and a global ceiling in the shared
  PostgreSQL usage counters before the body is read, keyed by the trusted-proxy
  client identity. Refusals are 429 with `Retry-After`; a client already over
  its own budget does not spend the global one. CORS preflight is not metered.
  Limits are owned by [abuse configuration](../frontend/services/api/src/config/abuse.ts).
- The body is capped at a registration size. The provider accepts only the
  `authorization_code`/`refresh_token` grants and the `code` response type,
  at most ten concrete-host HTTPS or loopback-HTTP redirects without
  credentials, fragments or wildcards, and a bounded client name.
- Registrations older than the configured unused-client TTL that never held a
  grant and have no live authorization request or code are pruned in bounded
  batches by later registrations. Identical re-registrations are not merged:
  confidential clients must not share a minted secret, and the budgets bound
  duplicates.
- Authorization requires S256 PKCE and an exact match against a registered
  redirect. The token exchange rechecks that redirect and the verifier, and a
  code is single-use.
- `/authorize` rejects queries over 8 KiB and states over 1,024 UTF-8 bytes
  before writes. Atomic usage windows admit 10/client, 40/trusted source and
  120/global per minute; the client row lock caps live unconsumed requests at
  five. Limits belong to the native MCP configuration. The periodic runner
  cleanup removes at most 100 expired unconsumed requests, codes and expired
  usage windows per table per pass, preserving grants and consumed audit data.

The consent page labels the client name as an unverified self-declaration and
names the redirect host the flow actually enforces.

Client ID Metadata Documents are not supported or advertised yet. Support needs SSRF-bounded, cached
document fetches at authorization time, URL-shaped client IDs in the OAuth
tables, and consent display of the document host. Advertising the flag before
that exists would steer CIMD-capable clients into a client ID this server
cannot resolve. It is a separate change; DCR remains the compatibility path.

## Configuration and persistence

[Configuration](../frontend/services/api/src/config/mcp.ts) owns enablement and bounds.
An enabled server requires a safe public origin; disabled MCP must not break
the rest of application startup. Protocol routes remain behind request-body and
transport-security guards. A demo allowlist is an additional admission condition,
not the tenant boundary.

[MCP models](../backend/app/models/mcp.py) persist clients, transactions, codes
and grants. Bearer/refresh/code values are hashed rather than stored raw;
confidential client secrets use encrypted custody. Expiration, rotation and
revocation prevent reusing a grant as permanent access.

## Authorization on each read

A grant binds to a CiteLadder user account and explicitly selected workspaces.
The consent form starts with no workspace selected. Authorization codes carry
the selection into the grant; token rotation preserves it. Empty legacy grants
cannot be exchanged for access and require a new consent flow.
[Data projections](../frontend/services/api/src/mcp/data.ts) resolve that account's
current workspace memberships and permitted read roles on every product read,
intersected with the live grant's selected workspaces. Revocation and removal of
a workspace authorization are checked in the database even for an already loaded
request token; joining another workspace never expands a connection.
System workspaces remain excluded even if a stray membership exists.
Project/object IDs never authorize themselves. Revoking membership changes
what an existing grant may read without copying business data into MCP.

The catalog exposes bounded project and prompt enumeration, business context,
citation-compatible search/fetch documents, query-page evidence, Site Health
pages/link projections, visibility results/sources, Search Intelligence
datasets and shared growth-evidence reads. The [catalogue](../frontend/services/api/src/mcp/tools.ts)
delegates to the existing TypeScript domain read services and scoped persisted
projections. The in-app [Agent](agents.md) uses its native TypeScript runtime
and owner adapters; the Python Agent read bridges have been retired.
Its internal skills and Agent-only reads are not exposed here. Search is bounded persisted retrieval; it is not
a web search or provider request. Missing projections remain unavailable and
cannot be repaired by reading them. Search Intelligence summaries retain their
dataset grain: referring-domain and destination-page aggregates are not exposed
as individual backlink edges.

`read_ai_crawlability` reads the latest authorized project's persisted Site
Health robots projection, including per-bot matched groups, root permissions,
sample policies and snapshot provenance. Its optional `crawl_id` pins an exact
authorized crawl, including historical/unavailable observations; a foreign or
missing explicit crawl is refused instead of falling back to latest. Crawl
status/time remain separate from robots observation status/time.
`get_project_business_context` includes this projection in its selectable
`crawlability` section. A missing
crawl or missing robots observation returns an explicit unavailable result;
neither read starts a crawl. Snapshot references identify provenance but are
not raw-body fetch resolvers. The browser's separately paged robots history
read owns retained text comparisons.

`read_crawl_logs` reads persisted summary, crawler and coverage projections with
the selected window and verification filter. `list_bot_requests` pages sanitized
retained requests with bot/status/folder/resource filters. Business context accepts
`crawl_logs`. These adapters share the [AI Traffic](ai-traffic.md) readers and
workspace authorization. Missing or incomplete evidence remains unavailable;
neither tool starts collection or refresh. `read_ai_referrals` adds per-source
key events/commerce in the property currency, landing pages, quality flags and
the property-wide channel comparison to its session/share measures.
`read_ai_traffic_pages` pages the independently aggregated path-level signal
join with filters, verification and sorting; `read_ai_traffic_url` canonicalizes
through `canonicalPage`, rejects off-origin URLs and reads the persisted detail
timeline. `read_ai_traffic_insights` returns the persisted preset-window snapshot
or an awaiting-refresh notice. These tools cannot repair missing data or enqueue
work. Requests, GA4 sessions and tracked citations
remain separate units.

Every retrievable evidence reference uses an allowlisted `citeladder://` record
type. `fetch` reauthorizes the owning workspace and returns the normalized
`id`/`title`/`text`/`url`/`metadata` document while preserving the structured
record for established callers. Raw provider transports, credentials, arbitrary
URLs, tables, SQL and filesystem paths are not resolvers.

## Client experience and limits

### Plugin analytics and public workflows

[The source plugin](../plugins/citeladder/) packages AI Visibility Review,
AI Search Change Review and Technical SEO Triage. Its workflows use only public
read tools and host reasoning, with no internal Agent run or saved deliverable.
The repository marketplace is `.agents/plugins/marketplace.json`; portable
clients use the package's `mcp.json`. Registered ChatGPT app mappings require a
real connection ID and are not fabricated in source. Installation, deployed-host
acceptance and public-directory approval remain separate from repository checks.

`read_visibility_overview` adapts the existing dashboard owner, including
counts, rates, model provenance and domain-owned comparison status. An explicit
`baseline_id` must be a ready run in the same authorized project. Latest resolves
to a concrete `audit_id`; explicit unavailable measurements never fall back.
`read_visibility_trends` adapts the existing trend owner with an explicit,
timezone-aware window, engine/cohort, granularity and optional frozen
model/retrieval filters. It retains source audit/snapshot IDs, comparison keys,
versions and nullable rates. It does not manufacture period movement or fill gaps.
Sources remains audit-scoped; optional domain filtering and result domain/URL
filters support source-to-answer drill-down without a provider call.

`MCP_UI_ENABLED` defaults off. When enabled, `render_visibility`,
`render_site_health` and `open_analytics` attach
`ui://citeladder/analytics/v1`; data/search/fetch tools carry no widget metadata.
Render tools accept strict identifiers/selections, never arbitrary datasets or
model-computed totals. Overview and Sources pin a concrete audit. Trends requires
an explicit window and has no audit selector; clicking Sources selects one run.
Site Health pins `snapshot_id` and `crawl_id` and reports persisted coverage
states separately from scores. `read_site_health` accepts that snapshot ID;
foreign or missing explicit snapshots are refused. Current Opportunities are
labelled separately from the selected snapshot's evidence.

Build from `frontend` with `pnpm --filter @citeladder/mcp-app build`; source-run
development reads the resulting `packages/mcp-app/dist/analytics.html`. The API image
build generates and packages static HTML from the isolated workspace entry and
shared design primitives. Resource requests are authenticated, contain no
user/project data, and never invoke a product reader. Scripts/styles are bundled
inline; CSP declares no network/resource/frame origins. Data arrives exclusively
through the MCP Apps bridge. No cookies or bearer tokens enter UI state.
Selections clear prior results and invalidate pending responses; access errors
clear cached evidence. Unknown, unavailable, partial and observed-zero states
remain distinct in accessible tables and charts.

`MCP_EXTENSIONS_ENABLED` also defaults off and, with UI enabled, advertises the
same app as global and thread entries through `open_analytics`, which accepts
empty arguments. Hosts without extensions still use cards or text. Standard
model-context updates contain the current selection, evidence references and
limitations; model tool results
update the view through the same validated selection contract. Host deep links
use `/analytics?project_id=<uuid>&view=<view>&audit_id=<uuid>` in
`openai/deepLink`; they contain identifiers, never credentials or evidence
bodies, and every resulting tool read reauthorizes access.

#### Client compatibility and release acceptance

| Client | Repository path | External acceptance |
| --- | --- | --- |
| ChatGPT Work web | OAuth DCR/PKCE, MCP Apps card, optional global/thread entry | Actual connection, ingress/resource binding and installed workflow not verified |
| ChatGPT desktop | Same protocol and UI, repository marketplace package | Installed package/new-chat OAuth and UI journey not verified |
| Headless Codex | Portable MCP connection, structured/text reads and public skills | Actual client linking not verified; no UI is required |

CIMD assessment: retain DCR for this release. URL-shaped client resolution,
SSRF-bounded cached metadata retrieval, document-bound redirects and consent
identity are not implemented by the current OAuth owner. Advertising CIMD now
would direct clients into an unsupported flow; it remains unadvertised. A future
CIMD slice must preserve existing DCR grants and independently validate those
boundaries. The plugin adds no authentication migration.

The package includes five positive and three negative review cases and draft
release notes. They are prepared from supported behavior, not a recorded demo
or evidence of portal acceptance:

1. Connect, consent to selected workspaces and select an authorized project.
2. Review Overview rates, counts, measurement identity and evidence freshness.
3. Select a trend window; discuss change only using compatible canonical
   comparisons and keep missing points as gaps.
4. Drill down from a concrete audit to domains, URLs and retained cited answers.
5. Read a pinned Site Health snapshot, coverage, its pages and current findings.

The three negative tool-selection cases cover publication, acquisition and
prompt/Action mutation requests; none has a write tool. Additional safety cases
verify foreign project/audit/snapshot access is denied and absent or incompatible
evidence produces an honest unavailable/limited result. Also exercise the no-account/no-project onboarding
handoff, reconnect, token rotation/revocation and removed membership.

Before public submission, publisher verification, eligible commercial plans,
support ownership, privacy/retention disclosures, verified support/privacy/terms
URLs, reviewer account, accessible recorded walkthrough, supported countries,
domain verification and portal scans still need release-owner acceptance.
Reviewer credentials belong only in secure portal fields, never the package.
No deployment, public sample mode, events, acquisition or publication is implied.

Clients discover authorized projects, inspect the available-dataset inventory,
then page through or fetch specific evidence. The browser account menu links to
public setup instructions. Settings has an MCP connections tab: users revoke
their connections, and workspace Owner/Admin can view and remove only their
workspace's authorization without seeing the grant's other workspace IDs. OAuth
return paths are restricted to the internal consent transaction and cannot
become arbitrary redirects. Grant revocation is available through the OAuth
revocation endpoint and supporting clients; membership removal blocks affected
reads immediately.

Tool arguments are strict: unknown arguments, out-of-range limits and
malformed UUIDs are rejected as invalid params (JSON-RPC `-32602`) rather than
ignored or clamped. Defaulted arguments are optional in the published schema.
Caller-caused read errors, such as a stale cursor or an inverted window, return
their message; other read failures return only "Evidence is unavailable."
A client may refresh only with a grant type it registered.

The TypeScript transport has no Python MCP SDK dependency. Component acceptance covers the legacy
`2025-11-25` initialize lifecycle and the `2026-07-28` per-request lifecycle
(`server/discover`, protocol/method headers and reserved request metadata).
This proves the repository wire contract, not acceptance in every client build
or the deployed origin.

A tool response does not authorize publishing, prompt activation, a crawl,
model generation or any other mutation. Streamable HTTP delivery has no
authority to rerun a product acquisition when a client retries.
[Workspace access](workspace-access.md) remains the shared role/identity owner.

[Protocol tests](../frontend/services/api/test/mcp-transport.test.ts),
[OAuth and registration tests](../frontend/services/api/test/mcp-oauth.test.ts),
[evidence tests](../frontend/services/api/test/mcp-evidence.test.ts) and
[retrieval tests](../frontend/services/api/test/mcp-retrieval.test.ts)
cover registration limits, redirect and PKCE binding, consent denial, rotation/revocation, both supported protocol lifecycles,
bounded enumeration, retrieval documents, disabled
server behavior, request limits and tenant isolation. These tests do not
establish that a particular public client or deployed origin has passed
external acceptance.

The public tool reference is generated from the live TypeScript catalogue with
`pnpm --filter @citeladder/api mcp:reference`; the repository check detects drift.
Native [Agent owner-adapter tests](../frontend/services/api/test/agent-owner-adapters.test.ts)
cover project pinning and membership isolation for the shared MCP reads.
