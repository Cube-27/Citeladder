# TypeScript migration plan

Status: PRs 1–14 implemented (27–30 September 2026), each at the owner's
request. PRs 7, 8 and 9 were split at the owner's direction (7a, 7a-cleanup,
7b; 8a, 8b; 9a, 9b), and a golden-retirement pass and contract convergence
followed 7b. On 28 September 2026 the owner widened the objective (section 1)
and brought the former out-of-scope island into the plan (section 2, D7); PR 10
recorded that change and re-sequenced PRs 11–20 so that each PR first moves
what unlocks the next ones. Deployment and the one-week error-rate/latency soak
are pending for every cutover from PR 3 on. This is not execution
authorization: each later PR runs only when individually assigned.

## 1. Objective

**Reduce Python technical debt; do not translate Python.** The goal is to move
the application to TypeScript. The measurable target (owner, 28 September 2026)
is Python at **30% or less** of the repository's Python plus TypeScript source
lines, and lower where practical; on 28 September 2026 it was about 63% (257k
Python, 149k TypeScript lines, tests included). Python tests are about 37% of
the Python lines and are deleted with the code they cover. Each
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
observability. A TypeScript library is added only when it replaces a Python
dependency and improves the architecture. Redesign needs a clear benefit and stays within the PR's scope;
do not change things only for the sake of change. The result should be simpler,
more maintainable and more efficient than the Python it replaces. When product
behavior is unclear, ask the owner instead of copying Python. A PR is judged by
debt removed.

## 2. Scope and pace

The application layer moves in 14 self-contained PRs, least risky first. Every
PR leaves the repository deployable and coherent if migration stops after it.

**PR size budget.** One PR retires at most about 50 Python files (application
plus tests). Re-count before starting and split if it exceeds the budget.

**In scope (D7, 28 September 2026):** the whole application layer: API reads
and writes, analytics projection workers, opportunities, commerce, search
intelligence, projects and onboarding, prompts and generation, integrations,
auth and workspaces, MCP, billing and entitlements, BYOK providers, audits and
their connectors, Site Health and source-page inspection, brand discovery and
the Agent runtime. The former "island" moves in dependency order: entitlements
first (PR 10), because occupancy and capacity locks were the reason most write
paths had to stay Python.

**Stays Python (by design, not by default):**

- `models/` and Alembic migrations (D4 keeps Alembic the schema author).
- `core/config` until PR 20 transfers what only TypeScript reads.
- The queue sweeper while any Python kind remains.
- Crawl fetching only if TLS-fingerprint impersonation (`curl_cffi`) proves
  necessary in PR 18: then a small Python fetch service stays behind a queue
  contract. `lxml`, `protego` and `defusedxml` have Node replacements (parse5,
  a robots parser, fast-xml-parser) and are not reasons to stay.

At stop point D these are roughly 40–45k Python lines, about 15–20% of the
total.

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
  transfers to TS config in PR 20.
- **D6 Team rule (owner, 28 September 2026).** New product services are
  TypeScript. Prompt generation v2 and the Agent workspace continue as planned
  and move with PRs 11 and 19.
- **D7 Standing decisions (owner, 28 September 2026).** Settled once so PRs do
  not reopen them:
  1. Scope is section 2. "It touches billing, entitlements, audits, Site Health
     or the Agent" is no longer a reason to keep a path in Python; it is a
     dependency that the PR order resolves.
  2. Ingress routes by path, so a path moves whole. When one method on a path
     depends on an owner that has not moved yet, the path waits for the PR that
     moves that owner (see the order in section 6); the PR does not stop to ask.
  3. Budget: when a PR would retire more than about 50 Python files, split it
     into dependency-ordered sub-PRs (a, b, …) and proceed without asking.
  4. A TypeScript library that replaces a Python dependency is approved (for
     example the Anthropic TypeScript SDK for the model gateway, a PDF library
     for invoices, parse5, a robots parser, fast-xml-parser).
  5. Dead code and dead configuration found while porting are deleted in the
     same PR and listed as departures.
  6. Ask the owner only about product behavior that is genuinely unclear, not
     about scope, splits or sequencing.

## 5. Rules for every PR

1. **One writer.** Each route family, task kind and table has one writing stack.
   The PR that adds the TS owner deletes the Python owner (replacement gate,
   invariant 1). The route-ownership manifest is the single record; CI checks
   it against served routes and every ingress Caddyfile. Any cross-stack
   writer exception is named with its lock order in its owner's section.
2. **Shared Python code is retired last.** A Python module still called by
   Python code that has not moved stays as a bridge; TS gets its own
   implementation. A bridge is deleted when its last Python caller moves (PR 20
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
| 9 | Projects: brand identity (9a); projects-tagged reads (9b) | Med-High | Done |
| 10 | Entitlement enforcement and the prompt library | Med-High | Done |
| 11 | Model gateway and prompt generation | High | Done |
| 12 | Projects, onboarding and brand discovery | High | Done |
| 13 | Integrations | High | Done |
| 14 | Auth and workspaces | High | Done |
| 15 | MCP server and OAuth provider | High | Done |
| 16 | Billing and the entitlement ledger (16a PDF, 16b commercial/ledger) | High | Done |
| 17 | Audits, providers and answer-engine connectors | High | 17a done |
| 18 | Site Health and source-page inspection | High | |
| 19 | Agent runtime | High | |
| 20 | Consolidation and policy transfer | Medium | |

Order rationale: each PR moves the owner that blocks the most later paths.
Entitlements (10) unblock every slot-consuming write; the model gateway (11)
unblocks generation, Commerce buyer-prompt generation, brand discovery and the
Agent; billing (16) precedes audits (17), whose admission reserves ledger
credits; Site Health (18) follows audits because audit creation and the crawl
share funded admission.

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
At this stage, `/performance/sync` and `/readiness` stayed Python under their
own manifest entries (`performance-sync`, `readiness`). PR 13 moves
`/performance/sync` to TypeScript; `/readiness` remains Python because the
Agent still consumes its persisted projection.

| Python bridge | Remaining caller |
| --- | --- |
| `traffic.performance`, `traffic.query_support` and DTOs | Agent |
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
  Fernet BYOK decryption (PR 17) and provider-capacity locking shared with
  audits.
- `service.py` `readiness`, `dataset_page`, `dataset_dict`, `row_dict` and
  `pagination.py`: bridges for the retained `domain/mcp` Agent reads until PR 19.

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
- the command center and executive PDF (see 9b).

| Python bridge | Remaining caller |
| --- | --- |
| `business_map` value models, `read_business_map`, `with_model_suggestions` | prompt generation (PR 11) |
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

**9b.** TS owns the six projects-tagged visibility reads, joined to the
existing `visibility` family (`src/visibility/`, `src/routes/visibility.ts`)
and its selection, evidence-scope and brand-identity code: the dashboard
(latest, run and range), prompt scores (one run or a pooled period), trends,
query fanout, the Sources table and per-answer evidence. Ingress collapses the
family to `/projects/*/visibility`, `/visibility/*` and `/visibility/sources/*`.
The Python routes, `trends`, `trend_folding`, `range_projection`,
`fanout_projection`, `prompt_period`, `prompt_outcomes` and
`source_comparison` are deleted, with `get_prompt_metrics`, the evidence
filters, the Sources baseline branch, the range and named-baseline paths of
`get_visibility`, and the unreachable `VISIBILITY_TRENDS_STRICT_VERSION_BUCKETS`
(a bucket's identity already carries its versions).

The command center and executive PDF stay Python: the PDF renders the command
center through `reportlab`, which billing invoices keep, so moving it would add
a Node PDF library and retire no Python dependency. (Superseded: PR 16a moved
both and retired the visibility bridges they alone used.)

| Python bridge | Remaining caller |
| --- | --- |
| `evidence.get_visibility_evidence`, `get_execution_evidence`, `selection`, `source_projection` with `source_mentions`, `source_page_links`, `brand_identity`, `evidence_selection`, `aio_evidence` | `domain/mcp` (PR 15) |
| `metrics.get_metrics`, `evidence.load_export_bundle`, `schemas.MetricsResponse` | `api/audits.py` (audit island) |

All 9b routes are reads; no table gains a second writer.

Departures: a non-core cohort reads its own aggregate (Python served the
comparison block for any non-core cohort, so `commerce` showed comparison
numbers); a URL-dimension baseline compares pages (Python counted domains and
moved every URL row against zero); prompt reads reject an unknown engine like
every other visibility read; range rankings take marks by brand or competitor
identity, including entities absent from the last run; evidence cursors are
TS keyset cursors bound to the selection, filters and `as_of` (Python cursors
fail once); fanout search lower-cases; fanout reads answers in bounded batches;
evidence mention and citation lookups are workspace-scoped; range `from_at`,
`to_at` and `baseline_at` render as UTC instants; 422 messages print values
without Python quoting.

### PR 10: Entitlement enforcement and the prompt library

Re-scoped at the owner's direction (28 September 2026): the PR carries the
section 1, 2 and D7 changes and moves the owner that kept every slot-consuming
write in Python.

TS owns entitlement resolution and prompt-slot occupancy
(`src/entitlements/`): the grant fold (one primary bundle by priority, every
supplement; flags OR, levels max, counters sum; add-ons and top-ups only while
the base subscription has a readable end), `lockWorkspaceCapacity` and
`admitPrompts`. It fails closed exactly as Python does (no billing account or a
corrupt grant is 403 `occupancy_unresolved`; an unprovisioned account is not
gated). TS also owns the `bulk_import` usage window (`src/abuse/usage.ts`).

TS owns the `prompts` family (`src/prompts/`, `src/routes/prompts.ts`): prompt
sets (list, create, read, rename, delete), prompts (list, create, edit,
delete, bulk status), import of parsed rows, candidate list and review, and
topics (list, create, edit, delete). Topical binding for manual, edited,
activated and imported text is TS (`binding.ts`). Ingress lists every path
explicitly; `/prompt-sets/*-*-*-*-*` matches only the set resource, so
`/generate` still reaches Python. CSV export has no server side (the browser
writes it), so nothing moved there.

Stays Python (`prompt-generation` family), by reason:
- `POST /prompt-sets/{id}/generate`: model gateway, quality judge and the
  `agent.provider_call` limiter. Moves in PR 11.

Deleted: `domain/prompts/service.py`, `topics.py`, `importing.py`,
`csv_import.py`, `receipts.py`, `domain/entitlements/cache.py`,
`api/request_bodies.py`, the review half of `candidates.py`, the request
schemas, binding enforcement (`TopicalBindingError`, `enforce_prompt_binding`,
`load_project_vocabulary`) and the audit route's unreachable binding-error
mapping, plus their tests (about 4,300 net Python lines, 11 files).

| Python bridge | Remaining caller |
| --- | --- |
| `generation*`, `candidates.stage_candidates`, `quality_*`, `query_patterns`, `portfolio*`, `map_suggestions`, `agent_proposals`, `demand_grounding`, `topic_recovery`, `locks`, `normalization` | generation (PR 11) |
| `topical_binding` validator and `binding_tokens` | generation; Commerce buyer-prompt validation (PR 11) |
| `mappers.prompt_set_to_response`, `PromptResponse`, `PromptSetResponse` | project response (PR 12) |
| `entitlements.enforcement` (`lock_workspace_capacity`, `enforce_occupancy`, `require_workspace_capability`) | project CRUD, Commerce manual entry, Agent (PRs 11, 12, 19) |
| `entitlements.resolver`, `service`, ledger and grants | billing reads, audits, Site Health, integrations history window (PRs 13–18) |

Rule 1 exceptions and lock order:
- `prompts`: TS inserts (manual, import, accept), edits and deletes; Python
  Commerce inserts buyer prompts (generation, manual entry) and TS approves
  them (PR 8b). TS inserts take the project lock, then the prompt-set lock,
  then the account capacity lock; Commerce takes only the capacity lock, never
  a project or set lock after it, so no cycle exists. The per-set
  `uq_prompt_set_normalized_text` stays the final guard.
- `prompt_sets`: Python onboarding and Commerce create sets; TS creates,
  renames and deletes. TS delete takes project, then set.
- `topics`: Python generation (topic recovery) creates under the project lock;
  Commerce creates its target topic under the capacity lock only; TS creates,
  edits, re-parents and deletes under the project lock. `uq_topic_project_name`
  (lower-cased) guards concurrent creates.
- `prompt_candidates` and `prompt_generation_runs`: Python generation stages
  and purges under project, then set; TS review takes project, then set, then
  the candidate rows (`FOR UPDATE`), then capacity on accept.
- The stored business map: unchanged from 9a (TS edits under the project lock
  then the profile row; Python generation adds suggestions under the project
  lock).
- `usage_windows`: both stacks upsert counters (`bulk_import` is TS-only now,
  `agent.provider_call` Python); the conditional upsert needs no lock.

Departures:
- The BLAKE2b personalization is zero-padded to 16 bytes as Python pads it
  (`citeladder-cap` is 14 bytes); the lock families moved into
  `core/config/prompts.py` and `entitlements.py` and are exported, replacing
  the private-name export in `opportunity_policy.py`.
- `branded` is true for `comparison` and `brand_diagnostic` on every path
  (Python manual create, edit and import set it only for `comparison`).
- Import persists each row's cohort (Python dropped it and stored `core`).
- Edit and activation bind against the prompt's own topic, as create does
  (Python ignored the topic on update, so a topic-admitted prompt could not be
  re-activated).
- Whitespace-only text is a 422 (Python accepted it and answered 409).
- Manual create no longer accepts `origin`/`generation_receipt`: nothing issues
  receipts since candidates replaced direct generated inserts, so the path was
  dead. `receipts.py` and its tests are deleted.
- Import accepts only parsed rows: the multipart and raw `text/csv` forms had
  no caller (the browser parses and previews), so the server CSV parser and
  `apiClient.postForm` are deleted. The 1 MiB body cap is kept (413).
- `proposed_count` is removed from the topic contract (always zero since the
  `proposed` status was retired); topic counts are active prompts.
- Prompt-set lists and topic lists tie-break by id; timestamps are ISO
  instants; coded 403/422 errors carry the code in `error.code` with a plain
  `detail` string.
- Dead config removed: `ENTITLEMENT_CACHE_MAX_ENTRIES`,
  `ENTITLEMENT_CACHE_MAX_TTL_SECONDS`, `IMPORT_READ_CHUNK_BYTES`,
  `IMPORT_MAX_COLUMNS`, `IMPORT_MAX_CELL_CHARS`.

### PR 11: Model gateway and prompt generation

TS owns the config-only OpenAI-compatible model gateway and JEV transport
(`src/models/`), using injected `fetch`, bounded retries, structured JSON
validation and the output-cap fallback. No provider SDK or BYOK decryption is
needed. Python configuration remains authoritative through `export_ts_platform`.
The shared `agent.provider_call` window now admits multi-call reservations in
`src/abuse/usage.ts`, alongside bulk import.

TS owns `prompt-generation` and the two Commerce buyer-prompt writes:
`POST /prompt-sets/{id}/generate`,
`POST /projects/{id}/commerce/buyer-prompts/generate` and
`POST /projects/{id}/commerce/buyer-prompts/manual`. All three ingress files
route them to TS. Browser response contracts and paths are unchanged.

Generation reads scoped persisted context, recovers missing topics from confirmed
offerings, suggests missing business maps, plans compatible cells, admits drafts,
judges through JEV, selects and stages candidates. Agent portfolios enter the same
admission path with exact revision/output/run provenance and no generation call.
Demand grounding retains observed periods, metrics and source IDs; verbatim
observed queries cannot become candidates. Strong JEV failures are text-free
outcomes; unavailable judgments remain reviewable. Only explicit candidate
acceptance consumes prompt slots. Commerce creates disabled prompts and target
relations under capacity admission; approval remains separate.

Remaining Python owners after PR 12: competitor discovery (`commerce-python`,
SecureFetcher), Agent execution, Commerce shelf analysis, billing and internal
links. Discovery queue execution moves in PR 12.

| Python bridge | Remaining caller / retirement condition |
| --- | --- |
| `connectors/agent/*`, `connectors/app_model*.py` | Agent, Commerce shelf and providers; retire after those callers move |
| `connectors/jev.py` | Internal-links worker; its retry cap now comes from shared JEV config |
| `prompts/normalization.py` | Prompt model and analysis; retire with their final Python caller |
| `prompts/locks.py` project lock | Source-page admission; unused prompt-set acquisition removed |
| `entitlements/enforcement.py` | Agent and remaining admission callers; retain until their owners move |

Lock order and shared writers:
- Generation topic recovery takes the project lock. Candidate staging/purge takes
  project, then prompt set; review continues project → set → candidate rows →
  account capacity. Every provider/JEV call occurs outside a transaction.
- Commerce takes capacity only, never project/set locks afterward. The unique
  normalized prompt hash and case-insensitive topic index remain final guards.
- Python onboarding still creates prompt sets. `agent.provider_call` is now
  TS-only (Python Agent counts `agent.runs`) in the shared usage-window format.
- Business-map suggestions are merged under the project lock and profile row,
  only where the still-confirmed offering remains facet-empty.

Retired: 40 Python files, including the generation route, generation/admission/
quality modules, Commerce prompt owner/validator, calibration script and their
tests. Mixed Commerce and brand-discovery files retain tests of remaining Python
subjects; retired generation assertions move to TS behavioral coverage. The
additional Agent-proposal integration test was retired after its scoped handoff
and provenance path moved to the PostgreSQL TS test. The calibration operator
entry point is `frontend/services/api/scripts/jev-calibration.ts`; it requires an
active persisted admin and reads aggregate decisions without prompt text.

Departures:
- Plain fetch replaces only the default configured gateway; the earlier SDK
  wording was inapplicable to these routes.
- New provenance/state hashes use ordinary `JSON.stringify`, without Python
  serialization emulation. Prior decisions remain immutable.
- Actual returned model identity, usage and latency are retained in run evidence.
- Commerce validates workspace/target ownership before model configuration and
  returns a deliberate 409 for normalized duplicates instead of an integrity 500.
- Blank Commerce manual text is rejected after trimming. Generation skips texts
  already tracked in the Commerce set, so a repeat run is not a 409.
- The gateway refuses plain-HTTP endpoints other than loopback, and a JEV
  deadline also interrupts retry backoff. A model call retries transient
  statuses within one `timeout_seconds` envelope (Python made a single attempt).
- Commerce prompts use the shared 300-character prompt cap (Python's manual
  schema allowed 2000); an over-long generated item is dropped individually.
- The model receives slots and reference evidence as one JSON payload rather
  than Python's labeled message; admission still rejects verbatim observed
  queries and tracked names. Selection diversifies by offering too, and review
  lists pending candidates in staging order, without shadow-last ranking.
- Calibration sweep values and JEV retry cap moved to configuration; the unused
  Python `prompt_generation_settings` singleton is removed. The settings class
  remains the exported policy authority.
- No Commerce literal-route exclusions existed in the current TS route registry;
  its method guards already prefer explicit literal routes over UUID routes.

Implementation is complete locally; deployment and the one-week soak remain
separate release work. PR validation records contain exact commands and results.

### PR 12: Projects, onboarding and brand discovery

Project CRUD (project-slot occupancy and the deletion capability through
`src/entitlements/`), the project response, onboarding, logo refresh (a TS
fetcher with the SSRF rules of `SecureFetcher`) and brand discovery. The
command center moves here; the executive PDF moves with billing's PDF library
in PR 16.

Implemented under the TypeScript Projects owner, with a discovery queue/worker
under the existing queue and worker owners. Project admission and deletion use
the account entitlement lock. Completion locks the discovery and creates the
project/profile and empty prompt set atomically; selected-domain resolution runs
before that transaction. No topics, prompts or crawl are created. Safe website
fetching pins validated DNS addresses, retains TLS hostname verification,
revalidates redirects and bounds wire and expanded bytes.

Retired 36 Python files: the project/discovery mutation routes and worker,
onboarding research/completion, logo orchestration/favicon transport, unused
knowledge/offering helpers, project/prompt wire DTOs and their moved tests.
Retained coverage is in the TypeScript project, discovery, research and logo
suites: authorization, account capacity and deletion restrictions; completion
atomicity/replay/provenance and no-crawl behavior; live leases, retry and legacy
drain; DNS/redirect/content bounds; citations, bounded independent model
attempts and cache failure/identity changes. Command-center tests cover frozen
comparison identities and unknown versus observed zero. Alias-seeding tests
moved with onboarding; Python scorer tests remain. The obsolete Python prompt
DTO literal assertions were removed; generic vocabulary guard tests remain.
Remaining Python consumer tests seed persisted projects directly.

| Retained Python bridge | Remaining caller and removal condition |
|---|---|
| Authorized project reads and pure logo URL helpers | Python readiness route (`api/performance.py`) and MCP source projection (`analysis/brand_identity`); remove after the last caller migrates |
| Discovery profile/facet value types and BusinessContext | Commerce and Agent context (PR 19); remove with their last Python consumer |
| Onboarding normalization/site resolution | Search Intelligence targets; remove when its Python executor migrates |
| Discovery lease-expiry/retry reconciliation | Shared Python queue sweeper; remove when that queue owner migrates |

Research snapshots retain brand-discovery-v1 under the pre-launch policy and
record first-party/external processing versions and provider publication and
acquisition timestamps. Identity
inputs apply the configured first-party text budget; confirmed competitor
domains use the same count bound as confirmed owned domains before resolution.

Departures: unavailable models retain evidence and unknown prose instead of
inventing a generic business profile. PostgreSQL RESTRICT violations return a
409 alongside ordinary foreign-key violations. Provider deployment and the
one-week cutover soak remain pending.

### PR 13: Integrations

A Fernet-compatible TS encrypt/decrypt proven against Python ciphertext.
`domain/integrations`, `connectors/integrations` (GSC, GA4, Bing, OAuth), the
`integrations` routes, and the `integration-dispatcher` and `integration-worker`
processes. The import worker's immutable artifacts and resume-from-artifact
behavior are tested with recorded page sequences, including mid-run failure.

Implementation is complete locally; deployment and the one-week cutover soak
remain separate release work.

### PR 14: Auth and workspaces

Login, registration, cookie issuance, Google sign-in, members and invitations:
`api/auth.py`, `api/oauth.py`, `api/workspaces.py`, `domain/auth`,
`domain/workspaces`, `domain/abuse`. Argon2 parameters, JWT claims and cookie
attributes are identical, so Python's `api/deps.py` keeps verifying TS-issued
sessions for the remaining Python routes. Soak with sessions from each stack
accepted by both.

The TS owner includes policy acceptance and per-membership product-tour state.
It uses shared zod response contracts, committed PostgreSQL request budgets,
cookie-bound OAuth state, bounded Google identity requests and transactional
security receipts. Signup/login bootstrap creates only the ordinary free
profile, freezes the provisioning user's registration cohort and projects
Site Health runtime in the same transaction. The policy exporter retains
Python config authority for Argon2 parameters, OAuth catalog, abuse limits,
baseline grants and crawl projection settings.

Ingress moves only auth and the enumerated workspace paths. Billing's
`/workspaces/{id}/entitlements` remains Python. The Python auth, OAuth,
workspace and rate-limit HTTP owners, Google identity connector, moved schemas,
policy acceptance and membership/tour mutation paths are removed. Five Python
component-test modules for those retired owners are replaced by focused TS
auth/workspace tests, including PostgreSQL contention and receipt rollback.
Remaining Python consumer tests seed persisted identity/session fixtures
instead of calling retired endpoints.

Cross-stack writer exceptions: the interactive account manager holds the
workspace root before actor/target membership and invitation locks; password
updates follow those locks. Auth bootstrap takes the shared
`workspace.create:{user_id}` advisory lock and billing-account lock before
the final user credential/version recheck. Both baseline writers serialize on
the billing account and share the idempotency key. Both abuse writers use the
same subject hash, fixed window and atomic PostgreSQL upsert. Security receipts
are appended only in the caller's mutation transaction.

| Python bridge | Remaining caller / retirement condition |
|---|---|
| `domain/auth/service.py`, `core/security.py`, `api/browser_cookies.py` | Operator/demo provisioning, MCP browser authorization and remaining APIs/integration OAuth; remove when the last caller moves |
| `domain/workspaces/service.py`, `members.py`, `invitations.py` | Membership reads for remaining APIs/MCP; bootstrap and the interactive account manager; operator coverage stays in `test_account_manager.py` |
| `domain/workspaces/policy.py` | Shared role matrix exported for TS and read by Python; transfer authority at PR 20 after Python callers retire |
| `domain/abuse/service.py`, `domain/auth/security_events.py` | Agent, audits, integrations, MCP and operator commands; remove each bridge after its last caller moves |
| Billing bootstrap and Site Health runtime projection | Python billing/operator writers until their owning migration slices; TS auth provisions only the shared free baseline |

Departures: ownership transfer now enforces the accepted one-owned-workspace
limit; stale owner/admin authority is rechecked under the root lock. Logout
increments session versions atomically. Password verification is followed by
a locked hash/version recheck; refusal rolls back any login repair. OAuth
account/link races serialize on subject and email rather than escaping as
uniqueness errors. The obsolete browser-visible nonce fallback is removed;
the binding nonce travels only in the HttpOnly cookie. No deployment, live
provider call or one-week cutover soak is part of this local implementation.

### PR 15: MCP server and OAuth provider

`domain/mcp`, `api/mcp_connections`, the `/mcp`, `/authorize`, `/token` and
`/revoke` paths, and the consent CSP.

**Implemented:** hosted Streamable HTTP, discovery, the bounded tool catalogue,
registration, PKCE consent, rotating tokens and connection administration now
run in the TypeScript API service. Ingress and route ownership move together.
Persisted OAuth rows and Fernet client secrets remain readable across runtimes;
all evidence reads intersect live selected grants with current memberships.
The public tool reference is derived from the live TypeScript catalogue.

Python hosted routes, OAuth/registration owners, SDK dependency and hosted tests
are removed. Python `domain/mcp` read adapters remain only for the Agent's
`domain/agent/tool_catalog.py`; its retained bridge tests cover isolation and
persisted evidence until PR 19 removes that caller. The TypeScript Site Page
resolver uses the exact requested analysis and its artifact instead of selecting
a newer analysis for the same URL. Referral presets now follow the analytics
owner's `30d`/`90d`/`1y` values, and a missing explicit window stays unavailable.
Local protocol and PostgreSQL coverage do not
replace external client or deployment acceptance.

### PR 16: Billing and the entitlement ledger

Split under D7's retirement budget: the initial inventory exceeds 50 Python
application/test files before retained bridges are accounted for.

**16a: receipt reads and PDF exports.** TypeScript owns the existing invoice
list/download paths (`billing-documents`) and executive PDF (`executive-report`).
The latter consumes the same persisted command-center projection as the UI.
Local-font PDF rendering validates frozen amounts, wraps long text, paginates
tables and keeps measurement/evidence provenance.

Retired: the two Python route modules, invoice PDF/DTO modules, the four
command-center modules and their obsolete component tests; reportlab and its
type stubs; and the visibility bridges only the executive PDF still reached
(`analysis/visibility`, `comparison_projection`, `matched_comparison`,
`measurement`, their response schemas and `get_project_logo_urls`).
Read/download isolation and document rendering coverage moves to TypeScript.

Departures: missing metrics render as Unknown; observed zero remains zero.
Executive documents include the metric-snapshot ID, processing versions and
resolved-action event IDs. Receipt and credit-note documents paginate long
text instead of relying on a one-page layout. Stored amount inconsistencies
fail on the server rather than presenting a guessed receipt. Local Noto Sans
supports Latin, Greek, Cyrillic and Devanagari; unsupported characters retain
their explicit Unicode code point.

Receipt reads require the declared `manage_billing` capability. PDFs use
monochrome text and bold headings without introducing a second color-token
authority.

**16b: commercial runtime and entitlement ledger.** Implemented: strict
workspace-scoped checkout, frozen quotes and recurring terms, no-card claims, upgrades/downgrades and cancellation, authenticated durable
webhook receipts, leased bounded recovery, invoice/credit-note issuance and
typed consumable accounting. Razorpay uses a fixed-origin TS REST client;
browser callbacks only schedule recovery and never grant paid access.

Retired: Python runtime billing routes, checkout/quote/settlement/receipt writers,
provider checkout/webhook/recovery adapters and the reconciliation runner. Their
money, isolation, idempotency and concurrency coverage moves to real PostgreSQL
TS tests, as does 16a's remaining refund replay, credit allocation and numbering
coverage. No schema or historical evidence is rewritten.

Retained bridges: catalog/operator administration and read-only provider-plan
verification; workspace bootstrap; grant writes, resolver, admission and metering
for Python audit, Site Health and Agent callers. Each continues under its current
owner and retires with its last caller (runtime workers in PRs 17–19, operator
administration during consolidation). Both stacks retain the shared account lock,
grant UUIDs, period identity and typed ledger parents.

Recovery renews leases during bounded provider I/O and refuses stale owners.
Unknown or exhausted provider evidence requires inspection rather than granting
or abandoning a purchase. Paid terminal subscriptions retain their verified paid
period; new one-time purchases require an unexpired base period. No autonomous
publishing or payment activation is added. Payments stay disabled until the
owner's live sign-off. Deployment, provider acceptance and the cutover soak
are pending.

### PR 17: Audits, providers and answer-engine connectors

**17a: schedule management.** TypeScript owns all five methods in the
`audit-schedules` family, using the existing shared browser response contract.
The Python router, CRUD service and wire schemas are removed; their persistence
and request-validation coverage moves to focused TypeScript/PostgreSQL tests.
Scheduler cadence/lease/planning tests remain Python. Policy remains in
`core/config/audit_schedules.py` and is exported for TypeScript, including the
configured minimum interval and the selectable engine catalog.

The Python scheduler is retained until audit admission and the worker move.
It writes schedule lease and run-state columns; TypeScript manages the stored
user request. Scheduler claim/finalize and TypeScript update/delete operations
lock the schedule row, with no network I/O under that lock. This named temporary
cross-stack writer exception ends with the scheduler cutover. Schema models
remain Python as planned.

Departures: required patch fields reject explicit null rather than reaching a
NOT NULL database failure; timezone text and
interval integers are bounded by their database columns. Timezones are
canonicalized through Intl to IANA identifiers the retained scheduler can load;
numeric UTC offsets are rejected. Partial edits validate the merged locked row;
omitted scope and scheduler state remain unchanged.

Split under D7's retirement budget: the audit, provider and acquisition scope
exceeds it, so the remaining slices (scheduler, funded admission through the
16b ledger, worker, providers and connectors) follow in dependency order.
17a performs no deployment, provider call or cutover soak.

Audit creation, schedules, the scheduler, funded admission, the audit worker,
BYOK providers, answer-engine and search-surface connectors, and the
DataForSEO two-phase park/poll (including Search Intelligence acquisition and
review creation).

### PR 18: Site Health and source-page inspection

`domain/site_health`, `analysis/site_health`, `workers/site_health*`,
`connectors/web_evidence` and source-page inspection, with Node replacements
for robots, sitemaps and HTML parsing. Decide here whether crawl fetching
needs TLS impersonation; if so, keep only a Python fetch service (section 2).

### PR 19: Agent runtime

The Agent tool catalog, runs and outputs, retiring the remaining Opportunity,
visibility, traffic and demand bridges its tools call.

### PR 20: Consolidation and policy transfer

Move `core/config` modules consumed only by TS into TS config and shrink the
export. Delete Python bridges whose last caller has moved. Remove empty Python
routers and dead registrations. Document the final Python↔TS boundary in the
architecture owner.

> **Stop point D (end of this plan).** TypeScript owns the application layer.
> Python keeps the schema (models and Alembic), any policy not yet transferred,
> the queue sweeper while a Python kind remains, and at most a crawl fetch
> service: about 15–20% of source lines.

## 7. Values both stacks read

No generated fixture guards these; each is covered by live PostgreSQL tests and
retires with its last Python side. Move those callers early rather than add
guards.

- Session cookies (until PR 14) and the BLAKE2b advisory-lock keys: project
  and prompt-set (`citeladder-locks`) and account capacity (`citeladder-cap`),
  personalization zero-padded to 16 bytes.
- `SiteUrl.url_hash` (Site Health writes it) and normalized query keys (Python
  demand readers compare them).
- Source-page roster hash (source inspection stamps it) and the prompt-text
  hash (sha256 of the lower-cased, whitespace-collapsed text without trailing
  `PROMPT_TRAILING_PUNCTUATION`): TS writers and Python generation dedupe
  against the same `normalized_text_hash` until PR 11.
- Occupancy counts and grants: every persisted prompt in the account's
  workspace counts toward `prompt_slots`; grants and revocations are read by
  both folds until PR 16.
- `usage_windows` rows: sha256 of the lower-cased workspace id, fixed window
  start, `uq_usage_window_subject_operation_start`.
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
- Crypto interop (JOSE in PR 14, Fernet in PR 13, argon2 in PR 14).
- Dashboards keyed on logfire attributes going dark after a cutover.
- Compose and GCP compose drifting from the ownership manifest.
