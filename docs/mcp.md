# Hosted MCP

## Responsibility

CiteLadder's hosted MCP server lets a customer's AI assistant (Claude, ChatGPT,
Cursor and others) read their CiteLadder data and, when the person allows it,
make changes they confirm. It is an interface over the product owners: it owns
OAuth authorization records, the read and write catalogues, change
confirmations and their delivery, not business data, generation or external
mutation. Every write runs through the same [command layer](../frontend/services/api/src/commands)
as the browser and the public API. The read catalogue is also the in-app
[Agent](agents.md)'s, so both read the same evidence the same way; the Agent
never sees the write catalogue.
Public setup lives at `https://docs.citeladder.com/mcp/`; the protocol endpoint is
`https://api.citeladder.com/mcp`. The issuer, resource, discovery documents,
registration, authorize, token and revoke all live on that API host origin
(`PUBLIC_API_URL`, required when MCP is enabled); only consent is on the app.

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
permitted. The consent page labels the client name as an unverified
self-declaration and names the redirect host the flow enforces.

The [consent page](../frontend/services/api/src/mcp/consent-page.ts) carries the
design system's light palette inline (the CSP loads no stylesheet or font). It
names the signed-in account and lists every workspace the account could share
with what approving it needs. A single shareable workspace is pre-selected and
required. A workspace without the current Terms acceptance is shareable once the
person accepts the Terms on the page; the form carries the revision it showed,
a submission for an older revision is refused with nothing recorded, and the
acceptance is recorded with the `mcp_consent` context in the same transaction as
the code. A workspace whose trial or subscription has ended is shown, not
selectable, with a billing link; one whose access cannot be resolved is shown as
unconfirmed, without a billing fix.
When the client requested `citeladder:write` (or named no scope) and the person
is Member or above in a shareable workspace, the page offers **Allow changes**,
unticked, listing what changes are possible and that each is shown and
confirmed first. Ticking it adds `citeladder:write` to the code only for a
selection including such a workspace; otherwise the grant is read-only.
A workspace without a project links to onboarding, whose `return_to` brings the
person back to consent, so a visitor can register, verify, set up a project and
approve in one pass. A refused selection re-renders the form with the reason
and leaves the transaction unconsumed; an expired transaction or changed session
explains how to continue.

## Client registration and authorization

Dynamic registration stays open and unauthenticated, as RFC 7591 intends: MCP
clients register before any CiteLadder login exists. There is deliberately no
redirect-host allowlist; the protections are bounds and binding:

- The [registration guard](../frontend/services/api/src/mcp/registration.ts)
  charges per-client burst and window budgets and a global ceiling through the
  shared [usage limiter](../frontend/services/api/src/abuse/usage.ts) before the
  body is read, keyed by the trusted-proxy client identity. Refusals are 429
  with `Retry-After`; a client over its own budget does not spend the global one.
  Limits are owned by [abuse configuration](../frontend/services/api/src/config/abuse.ts).
- Redirects are HTTPS on a concrete host, loopback HTTP, or a native app's
  private-use scheme (RFC 8252 §7.1): a reverse-domain scheme or a listed editor
  scheme such as `cursor` or `vscode`. Credentials, fragments, wildcards and
  script/data/file schemes are refused. At most ten redirects and a bounded
  client name.
- Registration narrows rather than refuses what it does not support: grant types
  reduce to `authorization_code`/`refresh_token`, the scope to the supported
  `citeladder:read` and `citeladder:write` it names (read always; both when it
  names none),
  and `code` must be among the response types. An omitted auth method is
  `client_secret_basic` (RFC 7591 §2); a confidential client may present its
  secret in the body or the header.
- Unused registrations past the unused-client TTL are pruned in bounded batches
  by later registrations. Identical re-registrations are not merged.
- `/authorize` requires S256 PKCE and a registered redirect. A loopback redirect
  matches on any port (RFC 8252 §7.3) and the requested URI is the one bound;
  the token exchange rechecks it and the verifier. Unknown extra scopes (such as
  `offline_access`) are dropped; a request without `citeladder:read` is refused,
  and a request only offers write, never grants it. Queries over 8 KiB and states over 1,024 bytes
  are refused before writes; usage windows admit 10/client, 40/trusted source and
  120/global per minute, and the client row lock caps live requests at five.
- Once the redirect is proven, every later `/authorize` error returns to the
  client's redirect with `error`, `state` and `iss` (RFC 6749 §4.1.2.1, RFC 9207),
  so the client is never stranded. Successful consent also carries `iss`.

Client ID Metadata Documents are not supported or advertised. Support needs
SSRF-bounded, cached document fetches, URL-shaped client IDs and consent display
of the document host; DCR remains the compatibility path.

## Grants and tokens

The `mcp_*` tables in the [schema baseline](../frontend/services/api/migrations/0001_baseline.sql) persist clients, transactions, codes
and grants. Bearer, refresh, code and transaction values are stored as HMACs
keyed by the session secret (rotating it ends every connection); client secrets
use encrypted custody.

- Access tokens last an hour and are bound to the `/mcp` resource and the
  granted scopes (RFC 8707); every token holds read. A 401 carries
  `WWW-Authenticate` with the protected-resource metadata and both supported
  scopes (RFC 9728).
- A refresh may narrow the scopes (dropping write), never expand them or drop
  read; a connection gains write only by consenting again.
- Refresh rotates both tokens and keeps the superseded refresh token's hash. A
  concurrent refresh inside the 60-second grace window is refused without
  consequence; that token presented later means it leaked, so the grant is
  revoked and an `mcp.token_reuse` security event recorded. A replayed
  authorization code revokes the grant it minted (RFC 6749 §4.1.2).
- Refresh slides 30 days but never past 180 days from consent; a connection
  then consents again.
- Each grant records when it was last used, at five-minute resolution.
- The periodic cleanup removes expired unconsumed requests, codes and change
  confirmations at once,
  and consumed ones and ended grants after 180 days (a consumed code outlives the grant it minted), in bounded batches. The
  usage-window table is pruned by its own owner's lane.

## Authorization on each read

A grant binds to one account and the workspaces selected at consent. Codes carry
the selection into the grant; rotation preserves it; an empty grant cannot be
exchanged. On every tool call, [data](../frontend/services/api/src/mcp/data.ts)
resolves the account's current memberships and read roles, intersected with the
live grant's workspaces, and checks the workspace's trial or plan; revocation and
membership removal take effect on the next call. One tool call checks this once,
however many reads it composes; nothing is cached across calls. Joining another
workspace never widens a connection, system workspaces stay excluded, and
project or record IDs never authorize themselves. A pinned caller (the Agent) is
told a sibling project was "not found", the same as a missing one.

Settings → MCP connections leads with the shared
[connect strip](../frontend/components/mcp/connect-strip.tsx): one Connect
button, which opens Claude's prefilled add-connector page, then the endpoint
with a copy control. Hovering Connect (or ArrowDown/Space from it) offers
ChatGPT, Gemini and Grok, copying the URL for the person to paste there. Client links are owned by
[`mcp-clients.ts`](../frontend/lib/config/mcp-clients.ts); the public MCP page
uses the same strip. The tab lists a user's connections by client name (labelled
unverified), access (**Read** or **Read and change**), workspace names,
connected date and last use; workspace Owner/Admin
also see the connecting account and can remove only their workspace's
authorization. Revoking asks for confirmation. The account menu's Connect AI
assistants opens this tab. Revocation is also available through the OAuth
endpoint.

## The catalogue

The [catalogue](../frontend/services/api/src/mcp/tools.ts) is one list of read
tools, each declaring its input schema and the owner read it delegates to.
Project tools authorize the project on every call and must report a `state`
(`available`, `unavailable` with a `reason`, or the owner's `observed_zero`);
missing evidence is never zero and is never repaired by reading it. No read
crawls, calls a provider, enqueues work or writes; changes are a separate
catalogue (below).

| Area | Tools |
| --- | --- |
| Start | `list_projects`, `get_project_business_context` (profile, competitors, active prompts, latest visibility, top Actions, Site Health, connected data; sections run in parallel), `search` and `fetch` |
| AI visibility | `read_visibility_overview` (mention rate, citation rate, rankings and the run's status), `read_visibility_trends`, `read_visibility_results` (answers), `read_visibility_sources`, `read_source_url` (one cited page: prompts, engines, brands listed, your presence), `read_perception` (net sentiment with coverage, themes, verified quotes, sources cited alongside criticism, recommended rate; `view: quotes` pages the quotes), `read_ai_ads` (ChatGPT Search ad presence, advertisers, creatives and prompts; other engines are not applicable; ads never count as citations), `read_prompt_portfolio` |
| Work | `read_actions` (active Actions in priority order, or one Action with findings, remediation, go-live and measured outcome), `read_content_differentiation`, `read_ai_shelf` (Commerce) |
| Site | `read_site_health`, `read_site_pages`, `read_site_links`, `read_ai_crawlability` |
| Traffic | `read_performance` (totals with comparison, or a `dimension` breakdown), `read_query_evidence`, `read_demand`, `read_ai_referrals`, `read_crawl_logs` (summary, crawlers, coverage or individual requests), `read_ai_traffic_pages`, `read_ai_traffic_url`, `read_ai_traffic_insights`, `read_integration_status` |
| Research | `read_search_intelligence`, `read_search_dataset` (aggregate rows are not individual links) |
| App | `render_visibility`, `render_site_health`, `open_analytics` |

Each tool is a thin adapter over its owner (Visibility, Actions, Site Health,
AI Traffic, Commerce, Search Intelligence, brand memory), so a correction in the
owner reaches the app, the Agent and MCP together. Enumerated arguments are enums
(the engine set comes from the visibility configuration); paged tools take
`cursor` and `limit`, and a cursor continues only the selection that produced it.
Published input schemas omit `$schema`, patterns a `uuid`, `date` or
`date-time` format already names, safe-integer bounds and null branches, which
halved `tools/list` to about 25 KB.

Results carry IDs because the model needs them for its next call. The server
instructions tell clients never to show IDs or `citeladder://` references to
the user and to name the page, prompt, competitor or Action instead. Links point
to the app screen that shows the record ([links](../frontend/services/api/src/mcp/links.ts),
mirrored by the browser's evidence links).

`fetch` resolves an allowlisted `citeladder://` record (project, action,
opportunity, prompt, audit, visibility result, site snapshot/crawl/page/issue/link,
demand, query and traffic snapshots, search run/dataset/row) after reauthorizing
its workspace. A document is `id`/`title`/`text`/`url`/`metadata`, with the record
once as JSON text; a large one returns bounded parts with continuation IDs.

## Changes

The [write catalogue](../frontend/services/api/src/mcp/write-tools.ts) is listed
in `tools/list`, and callable, only for a grant holding `citeladder:write`;
a read-only grant gets "Unknown tool". Every write tool takes `project_id`:
[`writeActor`](../frontend/services/api/src/mcp/data.ts) authorizes the project
through the live grant and membership, then loads the member's live role, which
the command checks (a Viewer is refused; a demotion applies to the next call).
A record named by ID must belong to that project.

| Kind | Tools |
| --- | --- |
| Direct (one call, one transaction with its security event) | `create_topic`, `rename_topic`, `update_prompt_text`, `add_competitor`, `update_action_status`, `cancel_audit` |
| Prepared | `prepare_add_prompts` (1–50; drops duplicates and binding failures with reasons; shows prompt slots after), `prepare_archive_prompts`, `prepare_launch_audit` (estimate shown; `max_estimated_credits` frozen into the payload), `prepare_schedule`, `prepare_declare_implemented` |
| Confirm | `confirm_change` |

A prepare tool runs its command in **dry-run mode**
([`execute`](../frontend/services/api/src/commands/dry-run.ts)): every check,
admission and write the command makes, rolled back. It then stores the exact
payload in `mcp_confirmations` behind a single-use 43-character base62 token
(HMAC-stored, ten minutes, bound to the grant) and returns a preview without
IDs plus the token. [`confirm_change`](../frontend/services/api/src/mcp/confirmations.ts)
locks the row, refuses a used, expired or other-connection token, reauthorizes
through `writeActor`, re-runs the same command with the stored payload inside
the same transaction, marks the token consumed and records the security event.
Owners join that outer transaction, so a refused or failed change commits
nothing and leaves the token usable until expiry; a changed world (occupancy
now full, a larger estimate) returns the command's normal error. Prompts added
this way are active immediately. Each executed change records an
`mcp.write.<kind>` security event targeting the project.

Write calls spend the normal tool budgets plus 30 a minute per grant. Tools
carry their own annotations: reads `readOnlyHint: true`; writes
`readOnlyHint: false`, `destructiveHint` on archive, cancel and
`confirm_change`, `idempotentHint` on renames and status updates. The server
instructions require a prepare tool, showing its preview, and `confirm_change`
only after the user agrees. MCP elicitation is not offered: the transport is
stateless HTTP and cannot hold a server-to-client request, so every client uses
the token path.

## Errors and limits

Tool arguments are strict. A caller's mistake (an invalid argument, naming the
field; a stale cursor; an inverted window; an unknown sort, status or record; a
selection from another project) returns as a tool error (`isError`) with the
owner's message, so the model can correct the call. Any other failure returns
"Evidence is unavailable." and is logged without detail. An unknown tool or a
malformed request is a JSON-RPC error. A write that fails for any other reason
returns "The change was not made."; its transaction rolled back.

Tool calls are budgeted at 120 a minute per connection and 600 per account; a
refusal is a tool error naming the retry time.

The TypeScript transport supports the `2025-11-25` initialize lifecycle and the
`2026-07-28` per-request lifecycle (`server/discover`, protocol and method
headers, reserved request metadata). Protocol routes keep request-body, host
and origin guards; the credential-free OAuth and metadata endpoints also answer
browser-hosted clients with CORS. With MCP disabled every protocol path is absent
and the rest of the application starts normally.

## Interactive app

The [MCP app](../frontend/packages/mcp-app) is always offered. `render_visibility`,
`render_site_health` and `open_analytics` attach `ui://citeladder/analytics/v1`,
and `open_analytics` also declares ChatGPT's `openai/ui` sidebar (`global`) and
conversation-panel (`thread`) entries; hosts without MCP Apps ignore the
metadata and use the read tools. Render tools accept strict selections, never
datasets or model-computed totals; Overview and Sources pin a concrete run and
Site Health a snapshot. The resource is static HTML bundled at image build,
with no project data, cookies or network origins; data arrives only through the
MCP Apps bridge. Build it with `pnpm --filter @citeladder/mcp-app build`.

## Plugin and client acceptance

[The plugin](../plugins/citeladder/) packages AI Visibility Review, AI Search
Change Review and Technical SEO Triage over public read tools. Each mirrors its
in-app methodology (`ai_visibility`, `measure`, `technical_health`), and the
Agent owner-adapter test fails if a plugin skill names a tool the catalogue does
not have. The repository marketplace is `.agents/plugins/marketplace.json`;
portable clients use the package's `mcp.json`.

This repository proves the wire contract, not acceptance in a particular client
build or the deployed origin. Before public directory submission the release
owner verifies publisher identity, support/privacy/terms URLs, a reviewer
account, a recorded walkthrough and portal scans; the plugin's review cases
(five positive, three negative: publish, acquire, mutate) describe the expected
behaviour.

## Coverage

[Transport](../frontend/services/api/test/mcp-transport.test.ts) runs the real
catalogue: lifecycles, app metadata, argument and owner errors as tool errors,
unknown tools, guards and disabled MCP.
[OAuth](../frontend/services/api/test/mcp-oauth.test.ts) covers registration
bounds and native schemes, loopback ports, error redirects, CSRF, PKCE, code and
refresh replay, rotation, revocation, membership changes, the call budget and
cleanup. [Evidence](../frontend/services/api/test/mcp-evidence.test.ts) covers
pinned snapshots and runs, foreign selections, active Actions, prompt paging,
unavailable states and record fetches; [retrieval](../frontend/services/api/test/mcp-retrieval.test.ts)
covers links and document parts. The public tool reference is generated from the
catalogue with `pnpm --filter @citeladder/api mcp:reference`; the repository
check detects drift.
