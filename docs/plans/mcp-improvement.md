# MCP improvement plan

**Status:** decisions answered 2026-10-09; implementing in two PRs.

Feature 13 of the [feature review tracker](feature-review-tracker.md): the hosted
MCP server (transport, catalogue, OAuth and registration, consent, connections),
its reads over product owners, the MCP Apps package, the plugin package and the
public setup documentation. Shipped behaviour is owned by [Hosted MCP](../mcp.md),
not by this plan. Constraints: [invariants](../invariants.md), especially workspace
authorization on every read, reads that never repair state, distinct unknown /
zero / unavailable states, and the single migration baseline.

## Context

MCP is enabled in production (`MCP_ENABLED=true`, `infra/gcp/locals.tf:71`);
`MCP_UI_ENABLED` and `MCP_EXTENSIONS_ENABLED` are set nowhere. The in-app Agent
shares the same catalogue through `dispatchTool`, so a read fixed here is fixed
for the Agent too. The security core is sound: S256 PKCE, exact redirect binding,
single-use codes and rotation under row locks, hashed tokens, RFC 8707 resource
binding, RFC 9728 metadata, and a database recheck of grant, membership and
revocation on every read.

## Why

A read-only audit of transport, catalogue, OAuth, reads, the MCP app, the plugin
and the docs (2026-10-09) found, after verification:

**Reads have drifted from their owners.**

- `read_opportunities` rebuilds the Opportunities list instead of calling it and
  skips the active-status filter, so an MCP client's "what next" includes
  dismissed, measuring and done items; `rank` restarts at 1 on every page and an
  empty filtered page reads as unavailable (`mcp/evidence.ts:174-221`).
- `read_visibility_sources` points earned-source evidence at
  `source_pages.latest_snapshot_id`, the latest attempt; since feature 9 the owner
  reads the latest successful reading (`source-pages/reading.ts:77-96`).
- `read_visibility_audit` passes the raw stored `audits.summary` (every cohort ×
  engine, weighted composite scores, `sentiment: null`) instead of the Visibility
  owner's mention-rate projection, and the business context includes it by default.
- The business-context profile reads `brand_profiles` directly and exposes the
  internal `business_map` the owner's `readBrandMemory` removes.
- `read_visibility_results` returns `available` with no items for a foreign or
  missing `audit_id`.
- Deep links point to routes that do not exist (`/website`, `/visibility/prompts`,
  `/dashboard`; demand goes to `/performance`), and no screen reads `evidence=`
  or `record=` (`mcp/retrieval.ts:652-664`, `mcp/data.ts:187`,
  `mcp/evidence-analytics.ts:179`). A test pins the broken `/website` link.

**Errors hide the caller's mistake.** Only `McpInputError` reaches the client.
Owner `ApiError` 4xx (bad window, stale cursor, unknown sort or status, missing
explicit crawl) becomes "Evidence is unavailable.", so a model cannot correct
itself. Argument validation failures are JSON-RPC `-32602` with HTTP 400 and no
field detail; the 2025-11-25 revision asks for input errors as tool-execution
errors the model can read.

**Cost per call.** About nine queries authorize each tool call before any
evidence read (user reloaded, grant join, `workspaceAccess` per granted
workspace, project), twice in `search` and `fetch`. `read_visibility_results`
runs one citation query per item (up to 200). `read_site_health` returns eight
provenance ID arrays, one UUID per page and per rule-page evaluation, and is in
the default business context. A complete `fetch` document carries the record
three times, then the server sends it twice (text and `structuredContent`).
`get_project_business_context` runs about ten readers in sequence. Tool calls
have no rate limit. `tools/list` is 52.6 KB, of which 4.3 KB is descriptions:
the UUID regex 47 times, one generic `outputSchema` per tool, `$schema` 62 times.

**Real clients.** Registration accepts only HTTPS or loopback HTTP redirects, so
Cursor's `cursor://` callback is refused. Loopback redirects must match the port
exactly (RFC 8252 §7.3 says any port). An extra scope such as `offline_access`
or an unlisted grant is rejected instead of narrowed. `token_endpoint_auth_method`
defaults to `client_secret_post`, not RFC 7591's `client_secret_basic`. The
Origin guard returns 403 before CORS applies, so browser clients (MCP Inspector)
cannot register, and `.well-known` has no CORS headers.

**OAuth hygiene.** A replayed old refresh token or consumed code does not revoke
the grant. Two concurrent refreshes leave one client logged out. Refresh expiry
slides forever. After the redirect is validated, `/authorize` and consent errors
return JSON or plain text instead of redirecting with `error=`, so the client never
gets a callback. The `/authorize` 429 says "Too many client registrations".
Consumed requests and codes are never pruned, and cleanup has no partial index.

**Consent and connections.** Consent is unstyled HTML; workspaces start
unticked even when there is one; a workspace without a current-revision terms
acceptance or an active subscription silently disappears, and Approve then
dead-ends on a plain-text 403. Settings → MCP connections has no endpoint, copy
button, setup link, connected date, workspaces or last used; Owner/Admin rows do
not name the user; revoke has no confirmation.

**Nothing tells non-plugin clients to keep internal IDs out of answers.** The
server instructions lack the rule the plugin skills carry; tool descriptions push
`citeladder://` URIs forward. Claude, Cursor and plain ChatGPT users see them.

**Dead and drifting surfaces.**

- The MCP Apps package (about 1,280 lines plus a 479-line test), three
  presentation tools, an `ext-apps` dependency and a 1.4 MB HTML build in every API
  image ship behind a flag enabled nowhere. The widget prints raw UUIDs and its
  tests require them.
- The generated public reference lists the three hidden tools as available.
- `plugin.json` promises the interactive app.
- `technical-seo-triage` lacks the crawlability and crawl-log reads its in-app
  twin uses. `ai-search-change-review` lacks performance, query evidence and the
  continue / revise / rollback / inconclusive decision of `measure`.
- Public setup names no client: six generic steps. It states that the grant
  follows all of the account's workspaces; it follows the ones selected at
  consent. Revoke never mentions Settings.

**Missing capabilities.** An external assistant cannot see Actions and their
verification, the Commerce AI Shelf or an earned-source URL page; Google AI
Overview is reachable only through an unvalidated free-text `engine`.

**Debt.**

- The bare-origin check is written three times.
- `scope_descriptions`, `supported_grant_types` and `supported_response_types` are
  unused; the lists they describe are hard-coded twice.
- Account eligibility is copied five times.
- `evidence-integrations.ts` only forwards.
- The robots read the Agent imports lives in `mcp/evidence.ts`, not Site Health.
- `maintenance.ts` prunes the shared `usage_windows` table.
- Evidence keys keep the retired Python names.
- `read_query_evidence` matches an error message string.

**Tests.**

- `mcp-transport.test.ts` mocks the whole catalogue, so argument validation,
  unknown tools and the `ApiError` path are never exercised.
- One assertion checks a mock's CSP against itself.
- The preflight test sends no `Origin`, so it cannot catch the CORS defect.
- No test covers `read_opportunities`, `read_visibility_audit`, the performance
  reads, `read_site_links`, error mapping or deep-link validity.

## Decisions (owner, 2026-10-09)

1. **Keep the interactive app and make it the ChatGPT experience.** ChatGPT's
   plugin extensions (DevDay 2026) open MCP Apps as sidebar (`global`) and
   conversation-panel (`thread`) entries through `openai/ui`, which the package
   already targets. The UI and extension flags go; the app ships on. No raw IDs
   appear anywhere in it.
2. **Consolidate the catalogue**, with no aliases for retired names. Tools and
   skills stay simple: frontier models need accurate data and little handholding.
   Plugin skills keep parity with the in-app Agent's twins.
3. **New reads:** Actions with verification, the Commerce AI Shelf and the earned
   URL page, each delegating to its owner.
4. **Connect in one click, and start the trial there.** One strip carries the MCP
   URL with a copy control and a Connect button. Its menu offers Claude (default),
   ChatGPT, Gemini, Cursor and Grok, and each opens that client's signed-in
   add-connector page (Cursor through its install deeplink). The strip replaces
   "Read setup guide" and "Book a demo" on the MCP product page and leads the
   Settings tab. A top announcement strip on the homepage links to the MCP page
   (owner-requested marketing change). A visitor without an account connects,
   registers, gets a workspace and returns to consent.
5. **Refresh tokens with grant columns:** reuse detection with a 60-second
   concurrency grace, 30-day sliding and 180-day absolute life, last use recorded.
   Nullable columns folded into `0001_initial.py` and applied additively.
6. **Native redirect schemes** and any-port loopback are accepted.
7. **Tool-call budget:** 120 calls a minute per grant, 600 per workspace.

## Delivery

Two PRs, merged in order, each rebased on `main` (not stacked):

- **PR 1, server** (phases 1–4): reads, errors, cost, OAuth, schema, catalogue,
  new reads, flag removal, Agent and plugin skill parity, the connections
  contract (`workspaces`, `user`, `created_at`, `last_used_at`).
- **PR 2, connect experience** (phase 5): the MCP app without IDs, the connect
  strip and client menu, Settings, consent and the MCP-led trial, the account menu,
  the marketing announcement strip and MCP page, and the public docs.

## Phase 1: correctness and owner alignment

| # | Finding | Change | Where |
|---|---|---|---|
| 1.1 | Opportunities drift. | `read_opportunities` calls `listOpportunities` (active filter, global rank, owner cursor); an empty result is `available` with no items. | `mcp/evidence.ts`, `opportunities/reads.ts` |
| 1.2 | Sources point at the latest attempt. | Inspection evidence comes from the owner's latest successful reading in the existing enrichment; the second `source_pages` query goes. | `mcp/evidence.ts`, `visibility/sources.ts` |
| 1.3 | Raw audit summary. | `read_visibility_audit` (or the folded overview) returns the owner's mention-rate projection; raw summary and composite scores leave MCP. | `mcp/evidence.ts`, `visibility/metrics.ts` |
| 1.4 | Profile bypasses its owner. | Business context reads `readBrandMemory`. | `mcp/evidence.ts` |
| 1.5 | Foreign audit reads empty. | `read_visibility_results` authorizes the audit in the project and refuses a foreign or missing one; `total_count` 0 for no rows. | `mcp/evidence.ts`, `visibility/evidence.ts` |
| 1.6 | Dead deep links. | One link builder over the router's real paths (`/site`, `/prompts`, `/demand`, `/agent/actions/:id`, …), with no unread params. | `mcp/retrieval.ts`, `mcp/data.ts`, `mcp/evidence-analytics.ts` |
| 1.7 | Errors hide the cause. | Owner `ApiError` 4xx and `McpInputError` become tool-execution errors carrying the message; argument failures name the field. Protocol errors keep JSON-RPC codes with consistent HTTP status. | `mcp/server.ts`, `mcp/tools.ts` |
| 1.8 | Crawl-log cut unreported. | Omission reported at the owner's page cap. | `mcp/evidence.ts` |
| 1.9 | IDs in answers. | Server instructions add the plugin's rule: never show record IDs, UUIDs or `citeladder://` references; cite by page, prompt or title. | `mcp/server.ts` |

## Phase 2: cost and payload

| # | Change | Where |
|---|---|---|
| 2.1 | Authorize once per request: reuse the authenticated principal, load grant workspaces and access in one query, memoize per request. | `mcp/data.ts`, `mcp/oauth.ts` |
| 2.2 | Citation IDs selected in `citationsByAnalysis`; the per-item query goes. | `visibility/evidence.ts`, `mcp/evidence.ts` |
| 2.3 | Site Health provenance arrays become counts plus the snapshot ID; business context reads in parallel. | `mcp/evidence.ts` |
| 2.4 | `fetch` carries the record once; `text` is a readable rendering; owner `url`/`title` are kept. | `mcp/retrieval.ts` |
| 2.5 | `structuredContent` carries the value and `text` a compact summary. Schemas share one UUID definition, drop `$schema` and the generic `outputSchema`, and enumerate closed values. | `mcp/server.ts`, `mcp/tools.ts` |
| 2.6 | Per-grant and per-workspace tool-call budget (decision 7). | `mcp/server.ts`, `config/mcp.ts` |
| 2.7 | Constant `applicability` blocks and per-row constants removed. | `mcp/tools.ts`, `mcp/evidence.ts` |

## Phase 3: OAuth and client compatibility

| # | Change | Where |
|---|---|---|
| 3.1 | Native schemes (decision 6), loopback any-port matching, narrowed scopes and grants, `client_secret_basic` default. | `mcp/registration.ts`, `mcp/oauth-routes.ts` |
| 3.2 | CORS: the Origin guard admits cross-origin calls to the public OAuth and metadata endpoints; `.well-known` sends CORS headers. Consent keeps its same-origin guard. | `mcp/server.ts`, `mcp/oauth-routes.ts` |
| 3.3 | `/authorize` and consent errors after redirect validation redirect with `error=` and `state`; `iss` in the response. | `mcp/oauth-routes.ts`, `mcp/oauth.ts` |
| 3.4 | Refresh reuse and grace window, absolute limit, code replay revokes its grant (decision 5). | `mcp/oauth.ts`, `0001_initial.py`, `models/mcp.py` |
| 3.5 | Cleanup prunes consumed requests, codes and long-revoked grants with partial indexes; the shared usage-window prune moves to its owner. | `mcp/maintenance.ts`, `abuse/usage.ts`, `0001_initial.py` |
| 3.6 | Correct 429 wording and `WWW-Authenticate` on Basic failure. `/revoke` without a token is `invalid_request`. | `mcp/oauth-routes.ts`, `mcp/registration.ts` |

## Phase 4: catalogue and capabilities

| # | Change | Where |
|---|---|---|
| 4.1 | `MCP_UI_ENABLED` and `MCP_EXTENSIONS_ENABLED` go; the app resource, presentation tools and `openai/ui` entries ship on (decision 1). | `mcp/tools.ts`, `mcp/server.ts`, `config/mcp.ts`, infra |
| 4.2 | Consolidate overlapping tools and arguments (decision 2); Agent skills follow. | `mcp/tools.ts`, `agent/skills` |
| 4.3 | `read_actions`, `read_ai_shelf` and `read_source_url` delegate to their owners (decision 3); `engine` validated against the engine set. | `mcp/tools.ts`, `mcp/evidence.ts`, owners |
| 4.4 | Robots read moves to Site Health. Forwarders, unused config and the triplicated origin and eligibility checks go. Evidence keys are renamed. | `site-health`, `mcp/*`, `config/mcp.ts` |
| 4.5 | Plugin skills regain parity with their twins; `plugin.json` drops the app; a quality rule checks that every tool a skill names exists. | `plugins/citeladder`, `scripts/quality.mjs` |

## Phase 5: connect in one click (UX addition, PR 2)

| # | Change | Where |
|---|---|---|
| 5.1 | One connect strip (URL, copy, Connect with a Claude / ChatGPT / Gemini / Cursor / Grok menu, Claude default) shared by the app and the public site. | shared component, `components/settings`, `components/marketing` |
| 5.2 | Settings → MCP connections leads with the strip. Each row shows the client (unverified), its workspaces, when it was connected and last used, and the user in the admin view. Revoke asks for confirmation, and the empty state points to the strip. | `components/settings/mcp-connections.tsx` |
| 5.3 | Consent in the design system: the signed-in account and a single workspace pre-ticked. A missing workspace or terms acceptance is resolved in place, and errors offer a way back. A visitor without an account registers, gets a workspace and returns to consent. | `mcp/oauth-routes.ts`, `mcp/oauth.ts` (consent), auth and onboarding return paths |
| 5.4 | The MCP app shows no raw IDs; its tests assert what a user sees. | `packages/mcp-app` |
| 5.5 | The MCP product page swaps "Read setup guide" and "Book a demo" for the strip. A homepage announcement strip links to it. The account menu reads "Connect AI assistants". | `components/marketing`, `components/layout/user-menu.tsx` |
| 5.6 | Public docs: per-client steps, the correct grant scope, and revoking from Settings. The tool reference data moves to `apps/docs`. | `apps/docs/src/content/mcp*` |

## Tests

Tests for credible regressions:

- The real catalogue through the transport: invalid arguments name the field;
  an owner 4xx returns its message; an unknown tool is refused.
- `read_opportunities` lists only active Actions with a global rank.
- A foreign audit is refused.
- Sources use the last successful reading.
- Every deep link resolves to a router path.
- A `cursor://` registration is accepted and an `http://example.com` one refused.
- Loopback accepts any port.
- Refresh replay after the grace window revokes; a concurrent refresh inside it
  succeeds.
- A cross-origin preflight with `Origin` is admitted.
- The call budget is refused with a retry.
- Consent shows a pre-ticked single workspace.

Delete:

- The mocked CSP self-check and the literal `/website` URL assertion.
- The MCP app tests, with the package.
- The settings tab-label list assertion.

Measure count and runtime before and after.

## Out of scope

- MCP Events: backlog, unchanged.
- Client ID Metadata Documents: DCR remains the path.
- Connector-directory submission: owner release work.
