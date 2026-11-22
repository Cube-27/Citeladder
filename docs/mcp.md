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
Consent HTML has a script-free CSP and its form posts only to its own origin.
Browsers apply `form-action` to every redirect after a form post, so a decision
returns a page that refreshes to the client's redirect, with a link as fallback,
rather than a 303. The app Worker preserves this response policy.
Browser consent and login use `FRONTEND_URL`, including when the browser moves
to the app hostname. A stale consent submission on the old host receives an
explicit restart response; no cross-host POST redirect is permitted. The consent page labels the client name as an unverified
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
person back to consent.

## Client registration and authorization

Dynamic registration stays open and unauthenticated, as RFC 7591 intends: MCP
clients register before any CiteLadder login exists. There is deliberately no
redirect-host allowlist; the protections are bounds and binding:

- The [registration guard](../frontend/services/api/src/mcp/registration.ts)
  validates first, so an invalid registration spends nothing, then charges the
  registering network's budgets and last the global ceiling, inside the
  transaction that stores the client; a network over its own budget does not
  spend the global one.
- `/authorize` charges the client, its source network (IPv6 /64) and then a
  third pool. A client a person has already approved (it holds a grant) spends
  the global authorization budget. A client no person has approved yet, such as
  every fresh registration, spends its source network's own smaller pool
  (`ABUSE_MCP_AUTHORIZE_UNAPPROVED_NETWORK_LIMIT`) instead, so a flood of
  anonymous registrations cannot use up authorization for anyone else.
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
- Unused registrations past the unused-client TTL (30 days by default; clients
  such as ChatGPT keep their registration and never re-register) are pruned in
  bounded batches by later registrations. Identical re-registrations are not
  merged.
- `/authorize` requires S256 PKCE and a registered redirect. A loopback redirect
  matches on any port (RFC 8252 §7.3) and the requested URI is the one bound;
  the token exchange rechecks it and the verifier. Unknown extra scopes (such as
  `offline_access`) are dropped; a request without `citeladder:read` is refused,
  scopes never exceed what the client registered, and a request only offers
  write, never grants it. Oversized queries and states are refused
  before writes, and usage windows and the client row lock cap live requests
  (`config/mcp.ts`).
- Once the redirect is proven, every later `/authorize` error returns to the
  client's redirect with `error`, `state` and `iss` (RFC 6749 §4.1.2.1, RFC 9207),
  so the client is never stranded. Successful consent also carries `iss`.
  Before that (an unknown or pruned client, an unregistered redirect) the
  person gets a plain-text 400 telling them what to do, never a redirect and
  never a `Basic` challenge, which browsers show as a password prompt; that
  challenge belongs only to `/token` and `/revoke` client authentication.

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
- A password reset, password change or sign-out-everywhere-and-disconnect
  revokes the account's grants and ends its unexchanged codes in the same
  transaction ([workspace access](workspace-access.md)). Consent holds the
  account row and refuses a session whose version has changed, so a code minted
  while a reset commits is either refused or ended with the rest.
- Refresh slides but never past a hard cap from consent, then the connection
  consents again; a periodic cleanup prunes expired and consumed rows in bounded
  batches (`config/mcp.ts`).

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

Settings → MCP connections lists a user's connections, with the client name
labelled unverified. Workspace Owner/Admin also see the connecting account and
can remove only their workspace's authorization. Revocation is also available
through the OAuth endpoint.

## The catalogue

The [catalogue](../frontend/services/api/src/mcp/tools.ts) is one list of read
tools, each declaring its input schema and the owner read it delegates to.
Project tools authorize the project on every call and must report a `state`
(`available`, `unavailable` with a `reason`, or the owner's `observed_zero`);
missing evidence is never zero and is never repaired by reading it. No read
crawls, calls a provider, enqueues work or writes; changes are a separate
catalogue (below). The generated public tool reference lists the tools.

Each market is measured apart: market-scoped reads take `market_id` (omitted
is the default market). Visibility overview, trends, results, sources, query
fanouts and competitor focus take `topic_id`, the topic each run froze (AV-5),
and refuse a topic of another project. New reads are views on an existing tool
before they are new tools ([decision](decisions.md#agent-mcp-and-public-api)). Ads never count as citations. `read_page_text` reads
the crawled page, never the live one. Page URLs the Site tools return drop
their query string and fragment (they can carry tokens or emails); pages that
differ only by query stay apart by `site_url_id`, and their cursors carry no URL.

Each tool is a thin adapter over its owner (Visibility, Actions, Site Health,
AI Traffic, Commerce, Keyword research, brand memory), so a correction in the
owner reaches the app, the Agent and MCP together. Enumerated arguments are enums
(the engine set comes from the visibility configuration); paged tools take
`cursor` and `limit`, and a cursor continues only the selection that produced it.

Results carry IDs because the model needs them for its next call. The server
instructions tell clients never to show IDs or `citeladder://` references to
the user and to name the page, prompt, competitor or Action instead. Links point
to the app screen that shows the record. A file the app exports (the overview
report PDF, a CSV) is returned only as a link to its project-scoped download,
which the signed-in browser opens; MCP never returns the file. One
[record-kind table](../frontend/packages/contracts/src/record-kinds.ts) owns the
allowlisted kinds, their labels and screens; MCP links and the browser's
evidence links both read it.

`fetch` resolves an allowlisted `citeladder://` record after reauthorizing its
workspace; a large one returns bounded parts with continuation IDs. Every
URL in a site record (a page's address, fetch artifact, crawl facts and rule
evidence; an issue's evidence; a link record's neighbours) drops its query
string and fragment, as the Site tools' do.

## Changes

The [write catalogue](../frontend/services/api/src/mcp/write-tools.ts) is listed
in `tools/list`, and callable, only for a grant holding `citeladder:write`;
a read-only grant gets "Unknown tool". Every write tool takes `project_id`:
[`writeActor`](../frontend/services/api/src/mcp/data.ts) authorizes the project
through the live grant and membership, holds the grant row (still unrevoked and
holding write) and the membership row shared until commit, and loads the
member's live role, which
the command checks (a Viewer is refused; a demotion applies to the next call).
A record named by ID must belong to that project.

Write tools come in three kinds: direct (one call, one transaction with its
security event), Prompt builder runs (metered, with no dry run) and prepared
changes that only `confirm_change` executes.

The Prompt builder tools call the same command owners as the builder's routes
(`commands/prompts.ts`), with the same `run` capability, metering, AI-credit
holds and owner errors. A model call cannot be rehearsed inside a rolled-back
transaction, so they are not prepared: the server instructions and the
`prompt-discovery` plugin skill require the user's yes before each, and
`generate_prompts` activates nothing (only Track in the Prompt builder does).
Its required `run_key` is the generation owner's idempotency key: a retry with the same key
and request replays the persisted run instead of spending a second one, and the
same key for a different request is refused.

Prepared kinds, and every direct tool except the two deletes, are entries in
the change table MCP shares with the Agent
([`changes/kinds.ts`](../frontend/services/api/src/changes/kinds.ts),
[Agent](agents.md#proposed-changes)): the permission its command needs, its
payload schema and one `execute`. A direct tool runs its kind's `execute` at
once; the table also holds kinds only the Agent proposes, which no MCP tool
names. `confirm_change` accepts only the five prepared kinds listed in
[`confirmations.ts`](../frontend/services/api/src/mcp/confirmations.ts). A prepare tool runs the kind's `execute` as a **dry run** (`rehearse`,
over the operator rollback transaction): every check, admission and write the
command makes, rolled back. It then stores the exact
payload in `mcp_confirmations` behind a single-use 43-character base62 token
(HMAC-stored, ten minutes, bound to the grant) and returns a preview without
IDs plus the token. [`confirm_change`](../frontend/services/api/src/mcp/confirmations.ts)
locks the row, refuses a used, expired or other-connection token, reauthorizes
through `writeActor` and the kind's permission, runs the same `execute` with the
stored payload inside the same transaction, marks the token consumed and records
the security event.
Owners join that outer transaction, so a refused or failed change commits
nothing and leaves the token usable until expiry; a changed world (occupancy
now full, a larger estimate) returns the command's normal error. Prompts added
this way are active immediately. Each executed change records an
`mcp.write.<kind>` security event targeting the project.

Write calls spend the normal tool budgets plus a per-grant write budget. Tool
annotations live in `write-tools.ts`; only `confirm_change` carries
`openWorldHint: true`, because a confirmed audit launch asks external AI
engines. The server instructions require the user's yes before any change tool, and for a prepare
tool its preview shown and `confirm_change` only after the user agrees to it. MCP elicitation is not offered: the transport is
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

Tool calls are budgeted per connection and account (`config/mcp.ts`); a
refusal is a tool error naming the retry time.

The TypeScript transport supports the `2025-11-25` initialize lifecycle and the
`2026-07-28` per-request lifecycle (`server/discover`, protocol and method
headers, reserved request metadata). On that lifecycle every result carries
`resultType`, and the cacheable ones (`server/discover`, the three lists of
tools, resources and templates, `prompts/list` and `resources/read`) carry the
required `ttlMs` and `cacheScope`: catalogue documents and the app view are
`public` for an hour, the grant-shaped tool list `private` for an hour, and a
project read `private` and immediately stale. OpenAI's plugin scanner validates
these fields and stops the scan without them. Protocol routes keep request-body, host
and origin guards; the credential-free OAuth and metadata endpoints also answer
browser-hosted clients with CORS. With MCP disabled every protocol path is absent
and the rest of the application starts normally.

## Interactive app

The [MCP app](../frontend/packages/mcp-app) is always offered. `render_visibility`,
`render_site_health` and `open_analytics` attach `ui://citeladder/analytics/v1`
and render inline in the conversation; hosts without MCP Apps ignore the
metadata and use the read tools. ChatGPT's `openai/ui` sidebar and panel
entrypoints are not declared: ChatGPT's own widget lookup returned 404 for them
while the same view rendered inline (2026-10-14). Render tools accept strict selections, never
datasets or model-computed totals; Overview and Sources pin a concrete run and
Site Health a snapshot. The resource is static HTML bundled at image build,
with no project data, cookies or network origins; data arrives only through the
MCP Apps bridge. Build it with `pnpm --filter @citeladder/mcp-app build`.

## Plugin and client acceptance

[The plugin](../plugins/citeladder/) packages four skills (AI Visibility
Review, AI Search Change Review, Technical SEO Triage and prompt discovery)
over public tools. Each mirrors its in-app methodology (`ai_visibility`,
`measure`, `technical_health`, `prompt_discovery`), and the Agent owner-adapter test fails if a plugin skill names a tool the catalogue does
not have. `plugin.json` also carries the OpenAI directory listing; its category
is `Data & Analytics` because `Productivity` failed the listing check. The
submitted ZIP is this folder without its README.

This repository proves the wire contract, not acceptance in a particular client
build or the deployed origin. Before public directory submission the release
owner verifies publisher identity, support/privacy/terms URLs, a reviewer
account, a recorded walkthrough and portal scans; the plugin's review cases
(six positive, three negative: publish, acquire, mutate) describe the expected
behaviour. The public tool reference is generated from the catalogue
(`pnpm --filter @citeladder/api mcp:reference`); the repository check detects
drift.
