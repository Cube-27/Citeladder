# TypeScript migration plan

Status: PRs 1–8b and 9a implemented (27–28 September 2026), each at the
owner's request. PRs 7, 8 and 9 were split at the owner's direction (7a,
7a-cleanup, 7b; 8a, 8b; 9a, with 9b not started), and a golden-retirement pass
and contract convergence followed 7b.
D6 (team rule) still awaits the owner. Deployment and the one-week
error-rate/latency soak are pending for every cutover from PR 3 on.
This is not execution authorization: each later PR runs only when individually
assigned.

## 1. Objective

**Reduce Python technical debt; do not translate Python.** The long-term goal
is to move as much of the appropriate codebase as possible to TypeScript. Each
migrated owner is built as if greenfield, in idiomatic TypeScript that follows
the service's established conventions, and the Python it replaces is deleted.

**Preserve required behavior, not implementation.** Python is a reference for
business logic, API/data contracts that must stay compatible, edge cases and
operational knowledge, and tests that define correctness. It is never a template
for architecture, abstractions, patterns or semantics. Do not carry over
workarounds, compatibility shims, dead branches, helper layers, duplicated
logic, excess I/O or weak typing because Python has them.

Where practical, each PR simplifies the architecture, removes obsolete code,
consolidates duplication, tightens types and error handling, cuts unnecessary
dependencies and database/network round-trips, and improves testability and
observability. Redesign needs a clear benefit and stays within the PR's scope;
do not change things only for the sake of change. The result should be simpler,
more maintainable and more efficient than the Python it replaces. When product
behavior is unclear, ask the owner instead of copying Python. A PR is judged by
debt removed.

## 2. Scope and pace

The application layer moves in 14 self-contained PRs, least risky first. Every
PR leaves the repository deployable and coherent if migration stops after it.

**PR size budget.** One PR retires at most about 50 Python files (application
plus tests). Re-count before starting and split if it exceeds the budget.

**In scope:** API reads, analytics projection workers, opportunities, commerce
and search intelligence, projects, prompts and topics, integrations, auth and
workspaces, and MCP.

**Out of scope (stays Python; a separate plan may revisit).** One coupled island
around crawl execution and money: audit creation reserves capacity, runs funded
admission and writes the entitlements ledger, and brand discovery references
billing, so none of it moves before billing.

- Site Health: `domain/site_health`, `api/site_health`, `workers/site_health*`,
  `connectors/web_evidence`, `analysis/site_health`. Crawl transport
  (`curl_cffi`, DNS pinning), robots (`protego`), sitemaps (`defusedxml`) and
  `lxml` have no equal TS replacement.
- Audits (creation, schedules, scheduler, execution), answer-engine and
  search-surface connectors, and the DataForSEO two-phase park/poll.
- Billing, entitlements, BYOK providers (`domain/providers`).
- The existing Agent runtime and brand discovery.
- Source-page inspection (it fetches through `web_evidence`).
- `models/`, Alembic migrations and the queue sweeper, which serves every queue.

## 3. Verified constraints

- Backend processes share one image (`docker-compose.yml`,
  `infra/gcp/runtime/compose.gcp.yml`), and all queues share
  `orchestration/postgres_task_queue.py`, whose claim accepts a `task_kind`
  filter so each kind is owned by exactly one stack.
- All `/api` traffic reaches the stacks through Caddy
  (`infra/gcp/runtime/Caddyfile`, `frontend/local-compose-routes.caddy`, and
  the third API ingress); per-path splitting is matchers only.
- The pnpm workspace root is `frontend/`; AGENTS.md forbids a root lockfile.
- Sessions: HS256 JWT cookie (`joserfc`) with a `ver` claim against
  `user.session_version` (`api/deps.py`); argon2 passwords; Fernet secrets
  (`core/security.py`). Rate limits are PostgreSQL counters (`domain/abuse`).
- Invariant 5: pre-launch semantic versions stay `1`. Porting known logic is
  not a semantic change.

## 4. Decisions

- **D1 Layout.** Single pnpm workspace rooted at `frontend/`, with
  `frontend/packages/contracts` and `frontend/services/api`.
- **D2 Runtime.** Node 22+ with Hono.
- **D3 Query layer.** Kysely with types generated from the Alembic-migrated
  schema (CI diffs them).
- **D4 Schema.** Alembic stays the sole schema author (invariant 17). The TS
  service never contains migration files.
- **D5 Policy.** `backend/app/core/config/*` remains the policy authority
  (invariant 2). TS reads a generated, drift-checked export; refresh and other
  policy is exported, never restated. Config used only by migrated owners
  transfers to TS config in PR 14.
- **D6 Team rule (awaiting owner).** New product services default to
  TypeScript. In-flight plans (Prompt generation v2, Agent workspace) finish as
  planned; PRs 9–10 wait for Prompt generation v2.

## 5. Rules for every PR

1. **One writer.** Each route family, task kind and table has one writing stack.
   The PR that adds the TS owner deletes the Python owner (replacement gate,
   invariant 1). The route-ownership manifest is the single record; CI checks
   it against served routes and every ingress Caddyfile. Any cross-stack
   writer exception is named with its lock order in its owner's section.
2. **Shared Python code is retired last.** A Python module still called by
   Python code that has not moved stays as a bridge; TS gets its own
   implementation. A bridge is deleted when its last Python caller moves (PR 14
   or never), not simply when a later PR lands.
3. **Revertible within the release.** Rollback is a manifest entry, a compose
   command or a kind set in config, never a data repair.
4. **No parity, no goldens, no emulation.** Use zod validation, `JSON.stringify`,
   plain numbers, `toLowerCase`, WHATWG `URL`, ISO dates and plain error
   messages. Never emulate Python (`repr`, `casefold`, `str.split`, float
   spelling, Pydantic wording or schema shape, `json.dumps` byte layout). Add no
   golden files, frozen OpenAPI fragments, Python-generated fixtures, parity
   harnesses or normalizers. The TS owner defines its contract in zod; behavior
   is covered by focused TS tests and real-PostgreSQL tests. The only shared
   semantics are values both stacks read (section 7).
5. **Contracts.** A response the browser reads is the shared
   `@citeladder/contracts` schema, and `defineRoute` types each handler's return
   against it, so drift is a compile error. Server-only responses and request
   bodies stay beside their route. Views parse persisted enums with the
   contract's schema, JSON columns through `db/json.ts`, and serialize dates
   explicitly; a malformed stored value fails loudly on the server.
6. **Invariants unchanged:** workspace authorization (non-member → 404), reads
   never acquire or repair, commit-before-network-I/O, distinct unknown states,
   append-only evidence. Providers use recorded fixtures only.
7. **Telemetry.** Span and attribute names used by dashboards survive the move;
   each cutover soaks one week comparing error rate and latency.
8. **Record departures.** Where Python behavior was a defect or accident, fix it
   and list the departure in the PR's section.

## 6. PR sequence

| # | PR | Risk | Status |
|---|---|---|---|
| 1 | TS platform foundation | Low | Done |
| 2 | Shared contracts and route-ownership gate | Low | Done |
| 3 | First live reads | Med-Low | Done |
| 4 | Queue engine and referral analytics kinds | Medium | Done |
| 5 | Traffic, performance and demand projections | Medium | Done |
| 6 | Opportunity detectors and verification | Medium | Done |
| 7 | Opportunity store, refresh and routes (7a, 7a-cleanup, 7b) | Med-High | Done |
| 8 | Search intelligence (8a) and database-only Commerce (8b) | Med-High | Done |
| 9 | Projects: brand identity (9a); projects-tagged reads (9b) | Med-High | 9a done |
| 10 | Prompts and topics | Med-High | |
| 11 | Integrations | High | |
| 12 | Auth and workspaces | High | |
| 13 | MCP server and OAuth provider | High | |
| 14 | Consolidation and policy transfer | Medium | |

Paths in bridge tables are relative to `backend/app`.

### Platform (PRs 1–2, golden retirement, contract convergence)

`frontend/services/api` on Hono: config loading, structured logging with the
request-id convention, the error envelope (`docs/api-error-contract.md`),
`/health`, `/ready`. PostgreSQL pool with the `core/database.py` timeouts,
generated Kysely types, a query helper that requires `workspace_id`, and a CI
rule forbidding migration files. The Python policy export is generated by
`export_ts_platform.py` with a staleness check. Session middleware verifies
Python-issued cookies (`ver` check, capability matrix); it issues nothing.
`defineRoute` supports `authorize: 'project'`, which resolves membership from
the path's project (like `require_project_member`) without `X-Workspace-Id`.

`frontend/lib/api/schemas/*` moved into `frontend/packages/contracts`. The
route-ownership manifest (family → stack) and the error machine-code union live
there. The contract-drift guard checks only Python-owned families against
FastAPI. All golden files, frozen fragments, `src/python` emulation helpers and
their Python builders were deleted; query keys, prompt-text hashes and Action
query group keys lower-case in both stacks.

### PR 3: First live reads

TS owns `executions`, `ai-referrals` and `visibility`. `get_execution_evidence`,
`execution_surface_evidence` and `get_ai_referrals` stay Python for MCP and the
Agent. `analysis/lexical`, `trend_metrics` and `comparison` move with the PRs
whose readers call them.

### PR 4: Queue engine and referral analytics kinds

The TS queue implements what a claiming worker runs on `analytics_tasks`: claim
(eligibility re-check on the locked relation, workspace-turn fairness), lease,
`mark_running`, heartbeat, owner checks and locked finalize. Expiry, parking,
retry and cancel stay with the Python queue and sweeper. Kind ownership is
`ANALYTICS_TS_OWNED_TASK_KINDS` in `core/config/analytics.py`, exported to TS;
Python claims the complement, and rollback is reverting that constant. The
worker runs from the API image as `analytics-worker-ts`. A PostgreSQL test
proves concurrent claimers with disjoint kind sets never cross-claim.

TS-owned kinds so far: `ingest_referrals`, `classify_referrals`,
`ai_referrals_snapshot_refresh`, `referral_retention_sweep`,
`traffic_snapshot_refresh`, `performance_range_projection`,
`demand_snapshot_refresh`, `opportunity_verification`, `opportunity_refresh`,
`commerce_catalog_projection`.

Known gap: nothing enqueues `referral_retention_sweep` in either stack (it
predates the migration).

### PR 5: Traffic, performance and demand

TS owns the four Performance projection/read routes and all five Demand routes.
`/performance/sync` and `/readiness` stay Python under their own manifest
entries (`performance-sync`, `readiness`) because they call integrations
admission and readiness readers.

| Python bridge | Remaining caller |
| --- | --- |
| `traffic.performance`, `traffic.query_support` and DTOs | Agent |
| trimmed `traffic.service` | integrations sync targets |
| `demand.query_evidence_reads`, query normalization | MCP |
| `demand.selection` | prompts, opportunities |
| `demand.page_equivalence` | implementation events |

Departures: non-finite/boolean provider metrics contribute zero and
unavailable positions stay null; an override with no searchable characters is a
structured 422; concurrent demand retries serialize on a transaction advisory
lock and reuse the immutable snapshot; a range projection keeps a concurrently
written snapshot. Demand analyzer/rule identifiers are `*-1`.

### PR 6: Opportunity detectors and verification

The detectors were ported as the foundation for PR 7. The TS analytics worker
owns `opportunity_verification`: it reads persisted evidence and appends
verification observations with the same trigger revision, processing versions
and idempotency format, with no provider I/O. Python admission stays.

Departures: every verification query enforces workspace scope, including
audits, baselines and metrics formerly fetched by ID; foreign provenance yields
unavailable evidence. `opp-analyzer`, `opp-rules`, `opp-formula`,
`implementation-verifier` and `source-taxonomy` versions are `*-1` (databases
reset; no legacy rows). Source-page extractor versions are unaffected.

### PR 7: Opportunity store, refresh and routes

**7a.** TS owns `opportunity_refresh` and the `opportunities` family (list,
summary, recompute, history, detail, order, CSV/Markdown export). Python
admission (`domain/opportunities/queue.py`) and every enqueueing source are
unchanged. **7a-cleanup** removed all Python emulation from PRs 3–6. **7b.** TS
owns the `actions` family: persisted list/detail, workflow updates and
implementation declarations.

Declarations take the project lock before the Action row lock, freeze targets,
checks, visibility baselines and placement intent atomically with the status
event, check same-key retries before resolving evidence, and compare replays on
the immutable request fields (timestamps at PostgreSQL microsecond precision).

Rule 1 exception on `actions`: the TS refresh derives evidence Actions and
restamps derivation columns; the Python Agent inserts only `agent`-origin rows
with insert … on conflict do nothing on `(project_id, group_key)`, and the TS
insert adopts such a row. Both stacks take the same blake2b project advisory
lock (`citeladder-locks` person, exported in policy).

| Python bridge | Remaining caller / deletion condition |
| --- | --- |
| `domain/opportunities/actions.py` reads and attach; `analysis/opportunities/actions.py` (`page_group_key`, `select_approach`) | Agent tool catalog and output attachment |
| `domain/opportunities/action_status.py` | effective-status reads for Agent, MCP, command center |
| `domain/opportunities/placement_checks.py` | TS creates checks; Python source-page inspector settles and reschedules them |
| `domain/opportunities/verification.py` | enqueue only: Site Health terminal refresh, source-page inspector |
| `queries.py`, `projection.py`, `schemas.py` (`OpportunityItem`, `VerificationEventView`), `content_handoff` | command center, Agent, dev seed |
| `common.py`, `errors.py` | remaining Python owners |
| `analysis/opportunities/page_predicates`, `placement_outcome`, `source_patterns` | placement checks, source-page inspection, analysis service |
| `analysis/comparison`, `csv_cells`, `normalization`, `site_health/indexing` | many Python callers, including Site Health |

The dev seeder enqueues the refresh and waits, bounded, for the TS worker.

Departures: commerce hit queries are ordered; citation, mention, source-page,
presence and baseline reads add workspace/project predicates; placement
baselines must belong to the target source page, and owned domains include the
primary website; measurement legs select the newest observation; exports
render JavaScript numbers (`30`, not `30.0`); Python-issued keyset cursors fail
once with `invalid_cursor`; refreshes stamp `clock_timestamp()` so same-
millisecond refreshes still order; float parameters accept decimal notation
only; request-date 422s use `date_parsing`/`date_type`.

### PR 8a: Search Intelligence

TS owns the `search-intelligence` family (`src/search-intelligence/`):
readiness (no network I/O; registrable domains via `tldts` and WHATWG `URL`),
preferences, confirm, cancel, run list and detail, dataset rows, content
handoff and citation matches. Each path is listed explicitly in the Caddyfiles
so review creation still reaches Python. Error codes are `CODE_*` constants in
`core/config/search_intelligence.py`; the `search_intelligence` policy section
exports price version, task kind, transport, test status, default scope and
depths, maximum depth and sort fields.

Stays Python, by reason:
- `POST .../reviews` (tag `search-intelligence-reviews`): resolves competitor
  sites through `SecureFetcher`.
- `search_intelligence_acquisition` kind and the synchronous DataForSEO client:
  Fernet BYOK decryption (PR 11) and provider-capacity locking shared with
  audits.
- `service.py` `readiness`, `dataset_page`, `dataset_dict`, `row_dict` and
  `pagination.py`: bridges for `domain/mcp` until PR 13.

Rule 1 exception on `search_intelligence_runs`: Python creates and executes
runs; TS confirms and cancels. Both take the run row lock; confirmation takes
the project row lock first, so one acquisition is active per project, and
enqueues `search_intelligence_acquisition` (key
`analytics:search_intelligence_acquisition:{run_id}`, payload `{run_id}`) in the
same transaction.

Departures: ISO millisecond timestamps; stored JSON validated at read; shared
keyset cursors (Python ones fail once); handoff lower-cases row ids; saving
preferences bumps project `updated_at`; lists tie-break by id; research scopes
come from the contract enum; citation-match rows record `analyzer_version`.

### PR 8b: Database-only Commerce

TS owns the eight database-only Commerce routes (catalog read and CSV import,
candidate list, discovery status and decision, buyer-prompt list and decision,
AI Shelf read) and `commerce_catalog_projection`. Buyer-prompt approval moved
under an explicit owner exception: it enables an existing Prompt and consumes
no prompt slot. There are no MCP Commerce callers.

Stays Python (`commerce-python` family where routed):
- competitor discovery route and kind (`SecureFetcher`, lxml, Keenable,
  brand-discovery settings);
- buyer-prompt generation (model gateway, abuse limit, prompt-slot occupancy)
  and manual entry (entitlement lock, prompt-slot occupancy), with
  `prompts.py` context helpers and `buyer_prompt_validation`;
- the audit island: `audit_context.freeze_commerce_context`,
  `shelf.analyze_commerce_task`, `shelf_metrics.finalize_commerce_shelf`.

| Python bridge | Remaining caller |
| --- | --- |
| `service.enqueue_catalog_projection`, `eligibility.project_sells_catalog` | Site Health analyze phase (outside this plan) |
| `service.require_project`, `CommerceNotFoundError` | remaining competitor and prompt entry points |
| `price.normalized_price_value` | `shelf._parse_price_value` |
| remaining `schemas` models | discovery/generation/manual routes |

Rule 1 exceptions and lock order:
- `commerce_competitor_candidates`: Python discovery/shelf insert; TS updates
  decisions under the candidate row lock; no catalog lock after a candidate
  lock.
- `prompts` and `commerce_prompt_targets`: Python creates disabled Prompts and
  targets; TS approval locks Prompt, then target, and creates nothing.
- Catalog import and projection serialize on the project row before catalog
  writes; all catalog writers are TS.

Departures: a real CSV parser (quoted fields, BOM, malformed records); invalid
prices and overlong fields become rejected row outcomes; concurrent imports
replay the winning immutable artifact; projection and import never overwrite
each other's field authority; projected categories record canonical URLs and
the name-owning category wins over a URL-only match; canonical trust counts
private suffixes; literal method guards precede parameter routes and ingress
globs exclude the Python `discover`, `generate`, `manual` literals; locale
category sort with id tie-breaks; approval bumps `Prompt.updated_at`.

> **Stop point C.** In-scope analytics and read-heavy surfaces are TS. Python
> holds writes to core entities, integrations, auth and the island.

### PR 9: Projects

Split at the owner's direction (28 September 2026). Project create and delete
run entitlement occupancy (out of scope), and ingress routes by path, so the
project resource (`GET`/`POST /projects`, `GET`/`PATCH`/`DELETE
/projects/{id}`) stays whole in Python with one `ProjectResponse` serializer.

**9a.** TS owns the `brand-identity` family (`src/projects/`): brand-profile
read and edit, business-map read and edit, competitor-suggestion list and
accept, and the brand and competitor logo reads. The Python `brand_profile` and
`observed_competitors` modules, the business-map edit contract and the logo
asset read are deleted. The rate-limit helper stays Python: its only project
caller is logo refresh.

Stays Python (`projects` family):
- project CRUD (entitlement occupancy and capability);
- logo refresh (`SecureFetcher`, abuse limiter);
- 9b candidates: command center, executive PDF and the projects-tagged
  visibility reads (visibility, prompts, trends, fanout, sources, evidence).

| Python bridge | Remaining caller |
| --- | --- |
| `business_map` value models, `read_business_map`, `with_model_suggestions` | prompt generation (PR 10) |
| `service.brand_logo_url`, `competitor_logo_url`, `logos.get_project_logo_urls` | project response, analysis brand identity |

Rule 1 exceptions and lock order:
- `brand_profiles`: Python creates profiles (project create, onboarding) and
  generation adds business-map suggestions under the project advisory lock.
  TS edits take the same lock, then the profile row, and write only the edited
  fields or the `business_map` key.
- `competitors`: Python project create/update replace them; TS accept takes the
  project row lock, then the candidate row.

Departures: a missing project is `Project not found` on every route; the brand
profile contract publishes `business_context`; review times render as ISO
instants; a malformed stored business map fails loudly instead of reading as
empty; accepting a suggestion enforces the project competitor ceiling (409),
serializes concurrent accepts and returns the competitor's logo URL;
suggestions tie-break by id; 422 messages quote names with double quotes.

### PR 10: Prompts and topics

`domain/prompts`, `api/prompts`, CSV import and export, and candidate review. If
prompt generation still calls models through `connectors/app_model_*`, generation
stays a Python-owned task kind and only CRUD, review and import move.

### PR 11: Integrations

A Fernet-compatible TS encrypt/decrypt proven against Python ciphertext.
`domain/integrations`, `connectors/integrations` (GSC, GA4, Bing, OAuth), the
`integrations` routes, and the `integration-dispatcher` and `integration-worker`
processes. The import worker's immutable artifacts and resume-from-artifact
behavior are tested with recorded page sequences, including mid-run failure.

### PR 12: Auth and workspaces

Login, registration, cookie issuance, Google sign-in, members and invitations:
`api/auth.py`, `api/oauth.py`, `api/workspaces.py`, `domain/auth`,
`domain/workspaces`, `domain/abuse`. Argon2 parameters, JWT claims and cookie
attributes are identical, so Python's `api/deps.py` keeps verifying TS-issued
sessions for the island routes. Soak with sessions from each stack accepted by
both.

### PR 13: MCP server and OAuth provider

`domain/mcp`, `api/mcp_connections`, the `/mcp`, `/authorize`, `/token` and
`/revoke` paths, and the consent CSP.

### PR 14: Consolidation and policy transfer

Move `core/config` modules consumed only by TS into TS config and shrink the
export. Delete Python bridges whose last caller has moved. Remove empty Python
routers and dead registrations. Document the final Python↔TS boundary (queue row
contracts, ownership manifest) in the architecture owner.

> **Stop point D (end of this plan).** TypeScript owns the application layer.
> Python owns the Site Health, audits, billing and Agent island behind documented
> queue and route contracts. Moving that island, or transferring schema
> ownership away from Alembic, needs its own plan.

## 7. Values both stacks read

No generated fixture guards these; each is covered by live PostgreSQL tests and
retires with its last Python side. Move those callers early rather than add
guards.

- Session cookies (until PR 12) and the blake2b project advisory-lock key.
- `SiteUrl.url_hash` (Site Health writes it) and normalized query keys (Python
  demand readers compare them).
- Source-page roster hash (source inspection stamps it) and prompt-text hash.
- The URL form behind an Action's page key (Python Agent attach).
- Citation-match scope hash: sha256 of `{audit_ids, citation_ids,
  parent_dataset_id}` as compact JSON in that key order.
- Queue rows: task keys and payloads, e.g. commerce projection payload
  `{source_analysis_id}` with key
  `commerce:project:{analysis_id}:{commerce-projector-1}`.
- Commerce catalog IDs, canonical URLs, prices, attributes, provenance and
  memberships; candidate `state`/`decision_at`; Prompt `enabled` and target
  `approved_at` (inputs to Python discovery, prompt context and audit freezing).
- The stored business map (`business_context.business_map`: offerings, entries
  with origin, review state, reviewer and source, and exclusions) and the brand
  profile `sources` provenance, read by Python prompt generation.

## 8. Known traps

- Asyncio vs Node behavior under lock contention: lease tests run against real
  PostgreSQL.
- Crypto interop (JOSE in PR 12, Fernet in PR 11, argon2 in PR 12).
- Dashboards keyed on logfire attributes going dark after a cutover.
- Compose and GCP compose drifting from the ownership manifest.
