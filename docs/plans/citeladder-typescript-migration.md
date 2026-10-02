# TypeScript migration plan

Status: PRs 1–14 implemented (27–30 September 2026), each at the owner's
request. PRs 7, 8 and 9 were split at the owner's direction (7a, 7a-cleanup,
7b; 8a, 8b; 9a, 9b), and a golden-retirement pass and contract convergence
followed 7b. On 28 September 2026 the owner widened the objective (section 1)
and brought the former out-of-scope island into the plan (section 2, D7); PR 10
recorded that change and re-sequenced PRs 11–20 so that each PR first moves
what unlocks the next ones. Deployment is pending for every cutover from PR 3
on; on 1 October 2026 the owner dropped the one-week soak while there are no
customers, so cutovers are accepted on smoke tests (rule 7). This is not execution
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
- **D2 Runtime.** Node 26 with Hono. CI, the Workers deploys, every image and
  `engines` use the same major (aligned 1 October 2026).
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
7. **Telemetry.** Span and attribute names used by dashboards survive the move.
   While there are no customers, a cutover is accepted on smoke tests of its
   route families and workers; there is no one-week soak (owner, 1 October 2026).
   Earlier PR sections that mention a soak are superseded by this rule.
8. **Record departures.** Where Python behavior was a defect or accident, fix it
   and list the departure in the PR's section.
9. **Workers can drain and exit (from PR 18b, owner, 1 October 2026).** Every
   new or moved TypeScript worker exposes a bounded drain mode: claim and run
   due work until its queue is empty or a time budget expires, then exit 0.
   The long-polling loop stays for local compose. Section 9 depends on this.

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
| 17 | Audits, providers and answer-engine connectors | High | Done; 17b merged (#217) |
| 18 | Site Health and source-page inspection | High | Done; 18b5b (#224), 18b5c (#225) merged |
| 19 | Agent runtime (19a foundation; 19b cutover) | High | 19a merged (#226); 19b adapters, activation and retirement implemented; PR validation pending |
| 19c | Commerce competitor discovery and remaining acquisition bridges | High | Implemented 2 October 2026; deployment pending |
| 20 | Consolidation and policy transfer | Medium | 20a–g merged; test-only acquisition retirement implemented; further policy transfer in progress |
| 21 | Scale-to-zero runner (section 9) | Medium | Proposed |
| 22 | Low-cost GCP foundation (section 9) | Medium | Proposed |
| 23 | Database move and HTTP cutover (section 9) | High | Proposed |
| 24 | Retire the Mumbai deployment (section 9) | Low | Proposed |

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
| `domain/opportunities/verification.py` | enqueue only: Site Health terminal refresh |
| `queries.py`, `projection.py`, `schemas.py` (`OpportunityItem`, `VerificationEventView`), `content_handoff` | command center, Agent, dev seed |
| `common.py`, `errors.py` | remaining Python owners |
| `analysis/opportunities/source_patterns` | analysis service |
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
| `prompts/normalization.py` | Prompt model and analysis; retire with their final Python caller |
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
At the 17a boundary, scheduler cadence/lease/planning tests remained Python.
Policy remains in
`core/config/audit_schedules.py` and is exported for TypeScript, including the
configured minimum interval and the selectable engine catalog.

17a temporarily retained the Python scheduler as the schedule lease/run-state
writer. PR 17b ends that cross-stack writer exception: native scheduling and
admission lock the schedule row without provider I/O. Schema models remain
Python as planned.

Departures: required patch fields reject explicit null rather than reaching a
NOT NULL database failure; timezone text and
interval integers are bounded by their database columns. Timezones must
name a zone in the pinned tzdata set (exported with
the policy) and are stored in its exact spelling; numeric UTC offsets are rejected. Partial edits validate the merged locked row;
omitted scope and scheduler state remain unchanged.

**17b: remaining PR 17 scope.** The owner explicitly assigned everything left
after 17a to one branch, overriding D7's normal file budget for this PR.
Dependency-ordered commits move provider custody/probes, direct answer engines,
DataForSEO paid submission and free reconciliation, frozen admission and funded
settlement, queue/capacity leases, immutable execution evidence and native
analysis, Commerce shelf derivation, audit reads/exports/repair, scheduling,
independent maintenance, and Search Intelligence reviews/acquisition.
Local/GCP runtime commands, development audit seeding and execution repricing
use the native owners. The offline measurement harness batches synthetic
fixtures through the production native scorer without provider or database I/O.

Retired Python audit routes, admission/worker/scheduler modules, direct and
DataForSEO transports, audit analysis, Commerce shelf writers, Search
Intelligence writers and their superseded tests. Mixed Python consumer tests
seed persisted fixtures; they retain authorization, evidence and schema coverage.
Replacements use native contract and PostgreSQL tests rather than retaining a
second implementation. The merged PR 18a worker registrations remain intact.

| Retained bridge | Caller and removal condition |
|---|---|
| Identity/citation helpers in `analysis/scoring.py` and `position.py` | MCP AIO persisted reads; remove with the PR 19 consumer |
| Search Intelligence readiness, targets and dataset DTOs | Remaining Agent/MCP read projections; remove with their PR 19 callers |
| Frozen evidence helpers in `domain/analysis/evidence.py` | Remaining MCP execution readers; remove with their migration |
| Answer finish-reason and search-surface constants | Python models/policy exports; retire when schema/config authority moves in PR 20 |
| `domain/providers/app_routes.py` route resolution and pause predicate | Retained Agent model connectors; remove with their final caller in PR 19 |
| Shared model HTTP/error helpers | Remaining Agent/model connectors; retire with their final caller. The unused answer-engine pool, audit credential resolver and DataForSEO identity module are retired |

Funding denies unverified expected-cost catalogs, including the currently empty
platform catalog. Unknown provider cost remains unknown. Submission uncertainty
never authorizes a second paid request; late receipts preserve evidence without
reviving a terminal run. Historical integer-seeded slot ordering remains stable.
Neither 17a nor 17b performs deployment, live provider calls or the cutover soak;
those external acceptance gates remain pending.

### PR 18: Site Health and source-page inspection

`domain/site_health`, `analysis/site_health`, `workers/site_health*`,
`connectors/web_evidence` and source-page inspection, with Node replacements
for robots, sitemaps and HTML parsing. Decide here whether crawl fetching
needs TLS impersonation; if so, keep only a Python fetch service (section 2).

D7 splits this retirement into dependency-ordered slices. PR 18a moves the
`internal_link_judgment` and `source_page_inspection` analytics kinds, source
extraction/presence, content differentiation, and placement settlement. It
retires their Python writers and terminal-compensation hooks. Python keeps
citation identity and source projections for answer analysis, report listing
for Agent tools, and shared web acquisition for the remaining Site Health
crawler. The core crawl task kinds, page analysis, change intelligence and Site
Health route family are assigned to pending PR 18b; PR 18 is not complete here.

Node pinned acquisition identifies CiteLadder's crawler and checks robots and
durable suppression at each hop. The existing owner does not require browser
TLS impersonation, so the moved source inspector needs no Python fetch service.

Departures in 18a: a truncated extraction cannot establish absence; a positive
literal match without retained quotation space abstains as ambiguous; headings
retain DOM order; an organic-only admission no longer consumes the citation
recurrence marker; placement settlement and its verification enqueue commit
atomically; `content_hash` is re-derived by the TS extractor, so the first TS
reading of a Python-inspected page may differ once; canonical URLs collapse
dot segments (otherwise serialized exactly as Python's `url_hash` writers);
terminal compensation retries until it succeeds, rotating a failing row behind
untried ones. TS heartbeat and mark-running refuse an expired lease instead of
reviving it; the sweeper reclaims it and late writes stay fenced. Replaced Python tests move to focused TypeScript and PostgreSQL
coverage; schema integrity and Python bridge tests remain.

PR 18a also adds the TypeScript SiteCrawlTask lease worker and moves `link_metrics`.
Both Python worker lanes exclude that kind. Metrics and the architecture
successor commit with acknowledgement under crawl/task locks. Link metrics and
architecture admit only evidence stamped with the crawl's analyzer/extractor
versions, and anchor lexical alignment is unknown, not 0.0, when the target has
no usable title/H1 tokens.
Python retains terminal-crawl metric admission and its schema-isolation tests;
graph decisions, persistence, cancellation and queue concurrency move to TS tests.
PR 18a moves observed architecture and its root-anchored findings. Both Python
lanes exclude `architecture`; its Python writer, phase and queue admission helper
are retired. Python retains the persisted architecture reader and schema-isolation
coverage. Native tests cover hierarchy evidence priority, cycles, incomplete
coverage, archetype abstention, exact source IDs and replay. Architecture now
bounds source admission to 500 current-version pages (selected in SQL by
normalized URL before canonicalization), downgrades capped coverage,
reads relationships from the parser's structured-data blocks, and rejects numeric
strings as confidence.

**PR 18b** is split under D7's retirement budget (about 126 application files)
into dependency-ordered slices:

1. **18b1, read API (implemented).** TypeScript serves the `site-health`
   family: the entitlement view, crawl detail, inventory, pages, page detail,
   issues, issue detail, issue history, events (JSON replay and SSE), CSV and
   Markdown exports, the dashboard, Overview, AEO Readiness, architecture and
   changes. Python's remaining crawl mutations are retagged
   `site-health-crawls`: crawl creation and list, URL preview, cancel, page
   rerun and the monitored set. MCP's page read uses the same page query.
   Python keeps the page reads and content hand-off the Agent and MCP bridges
   call until PR 19.
2. **18b2, change intelligence (implemented).** The TypeScript Site Health
   worker claims `change_intel`: it selects the comparable predecessor,
   compares persisted page evidence, appends the immutable snapshot and its
   observations, and performs the analytics handoff (implementation
   verification, then Demand or Opportunities). Python keeps `change_intel`
   admission at finalization and the handoff of a crawl without usable
   analysis until 18b5. One TypeScript helper builds every Opportunity refresh
   and verification key.
3. **18b3, page analysis (implemented):** the parser, classifier,
   deterministic rules and scoring, with the `analyze` executor. The
   TypeScript worker claims `analyze` and commits the artifact, attempts,
   provisional analysis, evaluations, issues and the Commerce projection
   enqueue with the task outcome. Python claims only `discover` and
   `site_setup`; its acquisition lane reserve is gone. Python still extracts
   facts for discovery and runs finalization, so
   `workers/site_health/ts_analysis_reconcile.py` replays the per-task crawl
   reconcile for analyze rows TypeScript settled; it is deleted in 18b5 when
   the lifecycle moves beside the analyzer.
4. **18b4, acquisition (implemented):** the TypeScript worker claims every
   Site Health kind. `discover` acquires the page under the crawl's scope
   (admission screens every redirect hop), extracts links and facts from one
   parse, and commits the artifact, observation, frontier admission, the
   page's disposition (document, canonical alias or analysis hand-off) and
   the task outcome together. `site_setup` publishes robots, AI-crawler
   stance and llms.txt evidence, then walks the bounded sitemap tree
   (fast-xml-parser replaces defusedxml) and admits it in a second commit. The
   Python discover/site-setup phases, robots cache, host gate, sitemap and
   robots parsers, frontier admission and their tests are deleted; the Python
   worker is maintenance only. `ts_analysis_reconcile.py` now replays the
   per-task reconcile for discover and site-setup rows too, and Python
   lifecycle tests seed discovery through
   `_settle_discovery_as_typescript`; both retire in 18b5.
5. **18b5, crawl control:** admission, URL preview, cancellation, reruns, the
   monitored set, finalization and lease recovery; the Python Site Health
   worker retires and the TypeScript worker gains its drain mode (rule 9).
   The re-count found about 40 application and 16 test files to retire, over
   D7.3's budget and the 100-file review limit, so 18b5 ships as two PRs.
   **18b5b, crawl lifecycle (implemented)** combines lease recovery with the
   drain mode (rule 9) and adds the lifecycle. The TypeScript worker
   reconciles each settled discover, site-setup or analyze task, and terminal
   lease recovery reconciles its crawls. Every pass, drains included, runs the
   stalled, overdue and cancelled-crawl backstops. Finalization covers alias
   reconcile, cross-page checks, final revisions, the snapshot and score
   summary, fetch settlement, successor admission and the no-evidence
   analytics handoff. The Python Site Health worker, `ts_analysis_reconcile.py`,
   both `_settle_*_as_typescript` seams, the snapshot/summary/scoring modules
   and the worker guard helpers retire with their tests (23 application and 9
   test files).
   Cancellation is the seam between the two PRs. Python's cancel commits only
   the stop. The TypeScript worker then publishes the cancelled run's evidence
   under the crawl lock, so the snapshot keeps one writer.
   **18b5c, crawl control (implemented)** moves the `site-health-crawls` family (admission
   with monitored seeding and `add_automatic_root`, URL preview, cancel, page
   rerun, the crawl list and the monitored set), then retires the Python
   routes, planner, selection and frontier bridges.
   The final retirement is 17 application and 7 test files, below D7.3's
   approximately 50-file budget. Python's dev seeder invokes a local TypeScript
   CLI for creation and bulk selection; it retires when the Python seeder moves.
   Agent/MCP persisted-read bridges remain until PR 19.

Departures in 18b1: reads resolve the Site Health runtime from the account's
grants instead of refreshing `workspace_site_health_runtime` (a read never
writes); presentation status is derived in SQL, so status-filtered pages are
always full instead of advancing a sparse scan cursor; a page's issue count is
its current analysis's issues, matching page detail (it counted every issue of
the URL in the crawl); the issues export's first column is the group id (the
`id` column was always empty); inventory search escapes LIKE wildcards; issue
groups load in one query rather than one per rule; MCP's page read gains the
link-metric version filter and the current-analysis issue count. The grouped
issue-history view, the single change-observation route and the Site Health
content-handoff route had no caller and are deleted; the Agent keeps the
hand-off as a Python bridge. Cursors issued by Python are not accepted after
the cutover.

Departures in 18b2: the snapshot, its analytics handoff and the task's
acknowledgement commit in one transaction (Python acknowledged the task after
committing, so a crash between them re-ran the task); rule evaluations load
through one array parameter rather than one bind per evaluation id, which a
large crawl could push past the driver's parameter limit; the page join scopes artifacts, URLs and observations
to the workspace; an implementation event's malformed target id no longer fails
the task; and comparison text is lower-cased rather than Python-casefolded,
which changes only stored shingles. The source hash is unchanged, so a task
retried across the cutover reuses Python's snapshot. PR 18 is complete through
18b5b (#224) and 18b5c (#225).

Departures in 18b3: an analyzer crash settles as the worker's retryable
`task_failed` rather than Python's terminal `crawl_task_crashed`, so
classification reason groups name `task_failed`; and the unreferenced
company-entity completeness rule and its vocabulary are deleted
rather than ported.

Departures in 18b4: discover evidence, admission and acknowledgement commit in
one transaction, so a reclaimed discover never finds durable evidence to
acknowledge; a discover or site-setup crash settles as retryable
`task_failed` rather than terminal `crawl_task_crashed`; host pacing applies
per request through the shared pacer rather than a task-wide host slot, and a
429 cools the host for `rate_limit_cooldown_seconds` without reading
`Retry-After`; robots and llms.txt URLs in site facts are spelled from the
origin, without the default port; the fetched root keeps `discovery_status`
`completed` (its own admission upsert reset it to `running`); the crawl's
admitted counter is incremented once, under the crawl lock; discovery locks
the workspace runtime row without refreshing it from grants (billing owns that
write), and a missing row grants no automatic allowance; a sitemap declaring
any entity is refused. The Python URL policy's infrastructure-document
exception lost its only callers and is deleted with the robots/llms/sitemap
fetch purposes, the AI-crawler stance and robots-status tokens, the discovery
progress event constant and the admitted-frontier status (D7.5). The dev seed's
Site Health crawls now rely on the TypeScript worker; its mocked Python
transport is gone.

Departures in 18b5b:
- **Cancellation.** Cancel commits the stop, task cancellation and fetch
  settlement only. The worker publishes the cancelled run's final revisions,
  snapshot and successors under the crawl lock within a poll interval.
  Python wrote them in a best-effort second transaction of the request, and
  pressing Stop again was its only retry.
- **Overdue crawls.** The watchdog fails a crawl's outstanding tasks and
  reconciles it in one transaction; Python committed the failures first.
- **`paused`.** Nothing writes this status, and the lifecycle leaves a paused
  crawl untouched. Python reconciled its counters and could persist a snapshot
  without terminalizing it.
- **Resolution evidence.** Each attempt is joined to its own artifact; Python
  joined every artifact of the task to every attempt.
- **Final revision `audit_time`.** It is serialized as `Z` UTC rather than
  `+00:00`.
- **Repeated canonical.** A canonical declared several times identically
  resolves its target; Python left it unresolved (`unknown`) although the
  integrity check counted one canonical.

Departures in 18b5c:
- Monitored-set reads resolve grants without writing the runtime projection.
- Admission refreshes grants while holding the shared capacity/account lock,
  then locks runtime and profile. Selection/rerun lock project and active crawl
  before runtime/profile, preventing races with worker publication.
- Bulk selection treats `%` and `_` as literal search text, matching inventory.
  Its normalized/display-URL filter is retained.
- Crawl-list cursors are bound to workspace as well as project; Python-issued
  cursors are rejected after the cutover.

| Python bridge kept by 18b4 | Remaining caller / retirement condition |
| --- | --- |
| `connectors/web_evidence/{fetcher,curl_transport,url_policy,brand_evidence}.py` | Commerce competitor discovery and retained URL identities. Onboarding site resolution has no current application caller. Provider probes are TypeScript; the Agent's `app_model_transport.py` still uses the DNS/target validation helpers. Retire after Agent and 19c caller inventories. |
| `analysis/site_health/parser.py` and its fact extractors | Commerce competitor discovery |
| `domain/site_health/discovery.add_automatic_root`, `frontier_support.py` | retired in 18b5c (TypeScript crawl admission) |
| `canonical_aliases.reconcile_crawl_duplicate_aliases` | retired in 18b5b (TypeScript finalization) |

### PR 19: Agent runtime

**19a — independent runtime core.** Implemented from main `ef44035a` without
PR 17/18 branch changes. The inactive `frontend/services/api/src/agent` owner
uses the existing Agent schema and shared response contracts for chats/messages,
admission, runs, leases/heartbeats, retries/recovery, committed model dispatch
and receipt orchestration, context manifests, a server-pinned read-tool
registry, bounded structured turns and immutable output revisions. Reply,
revision and success commit together under the lease and chat locks. Edits and
restores serialize with admission; outline approval and draft admission can
commit atomically. Persisted reads include progress and precise keyset paging.
No schema, ingress, production worker registration or ownership cutover occurs.
Python Agent/MCP and entitlement/provider/Site Health bridges remain intact.

The core has required typed adapter seams rather than a second implementation
of unresolved owners. Test adapters exercise PostgreSQL transactions without
provider I/O. Missing adapter configuration cannot silently choose platform
funding, discard named origins or fabricate a tool result. Existing stable
workspace authorization, queue vocabulary, generated table types, model receipt
types and Agent browser contracts are reused. Agent bounds are exported from
their Python config authority; the existing two-error protocol limit now lives
there too, with unchanged Python behavior.

Departures within the inactive core: lease fencing includes attempt identity
even when a worker name is reused; PostgreSQL time governs lease eligibility;
transcript bounds retain the latest request and freshest steps; unverified
record references are also removed from output titles; JSON is validated at
persisted boundaries; keys and nested references use canonical JavaScript JSON
for request fingerprints (no Python JSON emulation). These are not changes to
the currently served Python Agent. PR 19b must account for pre-cutover replay
keys, including non-ASCII fingerprints, rather than silently reinterpret them.

#### PR 19b deferred dependencies

19b is separately authorized work. Resolve the owners that actually exist at
that time; 19a neither assumes their final interfaces nor implements substitutes.

| Required work / seam | Retained owner and cutover condition |
|---|---|
| Funding and abuse admission (`Admission`) | Keep Python Agent capability, exact customer route selection, development-login eligibility, account capacity and daily usage admission. Bind to stable TS billing/entitlement owners and the final provider owner only when available; no entitlement/provider bridge retirement in 19a. |
| Per-step funding (`Funding.reserve/settle`) | Bind exact route/key revisions, capability and development identity rechecks; published and historical Agent credit rates/caps; reservation, debit and release through the existing ledger. Preserve zero BYOK debit and no platform fallback. Pricing/destination validation remains in existing Python owners until this adapter is ready. The 19a tests prove dispatch/receipt fencing and the required finite-hold contract, not a production ledger adapter. |
| Model destination (`AgentModel`, `modelFor`) | Connect platform and customer structured transports, schema negotiation, endpoint/credential validation, timeout signals and retry classification to the final provider owner. The existing TS generation gateway has a different structured-call interface; 19a reuses its receipt type without changing that gateway or copying the PR 17 provider work. |
| Skill catalog (`SkillCatalog`) | Bind the existing packaged skill methodologies, operating contract, vocabulary expansion, content formats and content fingerprint. Keep Python packaging and skill-loader tests until the TS loader and deployment assets are complete. No copied skill bodies or guessed catalog version in 19a. |
| Content context (`ContextReader`) | Bind reviewed business facts through their migrated owner; authorize typed Opportunity, Demand, target page, Site Health and Search Intelligence origins; preserve omissions, exact artifact IDs, processing versions, target conflict rules and bounded related-page selection. Action mentions and versioned instructions are implemented in the core. Crawl/page/handoff adapters wait for the actual PR 18 evidence owners; no parallel parser, Site Health reader or knowledge store. |
| Read-tool bindings (`ToolRegistry`) | Adapt the final TS MCP catalogue, with project selection/list_projects excluded and live member authorization retained; complete Agent-only list_actions/get_action/list_content_differentiation. Bind stable visibility, traffic, demand, prompts, integration and search reads to their existing owners. Audit/provider/Site Health tools wait for the actual PR 17/18 owners. No tool migration or Python MCP bridge deletion in 19a. |
| Output targets (`AttachTarget`) | Bind the existing Action attachment/convergence owner with its project advisory lock and target validation. Preserve unusable-target behavior, attached-Action identity and format validation. Prompt portfolio review and explicit implementation declaration remain owner commands, never Agent write tools. |
| API completion and activation | Finish request validators, skills/instructions/revision endpoints, browser context DTO projection, handoffs and error mapping. Atomically update the Agent manifest family and every ingress; register the TS worker only after the Python claimant is excluded. Until then Python owns every served Agent path. |
| Recovery and operations | Bind retry-delay configuration and bounded expiry/cancelled-dispatch reconciliation to the shared sweeper/worker ownership decision; preserve dashboards' telemetry names, worker draining and deployment assets. A rollback must restore a single writer without data repair. Deployment and cutover smoke tests (rule 7) remain separate release work. |
| Python bridge retirement | Inventory all remaining callers at cutover, then delete Python Agent runtime/API/worker and only the Opportunity, visibility, traffic, demand, MCP, entitlement/provider and Site Health bridges whose last callers actually moved. Retain schema/models/Alembic and any shared sweeper/policy owners still required. |

PR 19a retained Python Agent production ownership. PR 19b binds these seams to
the existing TypeScript owners and activates the API, worker, recovery and
ingress together. Historical Python idempotency keys explicitly conflict with
`legacy_runtime` details; current non-ASCII requests replay normally. The caller
inventory permits retirement of the Python Agent and its read, entitlement and
provider bridges. Python models, Alembic, policy export, billing operator owners
and the Opportunity queue helper used by development seeding remain.

The owner's delivery instruction is one complete PR 19b in at most six slice
commits. Its atomic retirement closure overrides the generic 50-file PR budget;
Commerce discovery remains the separate authorized PR 19c.

### PR 19c: Commerce competitor discovery

Move `POST /projects/{id}/commerce/competitors/discover` and the
`commerce_competitor_discovery` analytics executor together, reusing PR 18's
safe fetch, parser, fact extraction and classifier. Retire Python Commerce
discovery and its exclusively used acquisition bridges. Recheck the Python
analytics worker, kind complement, sweeper spec, parent reconcilers and unused
onboarding site resolution/normalization before deleting them; a recovery owner
must transfer before its Python sweeper registration disappears. The owner
assigned this separate PR before consolidation on 2 October 2026.

Implemented: TypeScript owns discovery admission and its analytics executor,
with frozen target context, Tavily/Keenable search and target-aware verification
through the existing Site Health acquisition and analysis owners. Every attempt,
pending candidate and queue outcome commits together under the live claim;
expired and reclaimed attempts cannot publish, finalize or heartbeat a later
claim even when the worker name is reused. The native analytics worker owns
bounded lease recovery, terminal compensation and a time-bounded drain command.
The Python analytics claimant, complement, queue spec and Compose services are
removed. The Python sweeper and parent reconciler stay for brand discovery and
integrations; their recovery is not retired here.

Retirement removes 44 Python application/test files: Commerce discovery, its
transport, unused onboarding resolution, the Site Health parser/classifier graph
and exclusively used fetch/acquisition bridges. `curl-cffi`, `lxml`, their stubs
and the obsolete connector-to-DOM exception are removed. URL policy, fetch
contracts, normalization and acquisition suppression remain for active fixture
and safety-test callers; consolidation rechecks those callers. Action content
fixtures now extract facts through TypeScript. The historical Site Health
evaluation corpus remains evidence of the Python-era implementation.

Departures: redirects to owned, marketplace or editorial destinations are
excluded before verification; shared robots policy and host pacing now apply to
candidate pages; verification records the current extractor/classifier versions.
Search source IDs and processing versions survive into attempts and candidates;
Tavily results without a provider ID receive a deterministic payload hash.
Malformed provider envelopes fail over or retry rather than silently becoming an
empty successful result. Provider credentials require canonical HTTPS destinations
and never follow redirects. Invalid Tavily destinations are rejected by both
configuration consumers, and drain budgets must be finite and positive.
Failed attempts use the shared analytics retry code;
unavailable providers and unusable names retain explicit terminal codes. Queue
outcomes and evidence settle atomically instead of separate commits, and expired
claims cannot finalize. No live provider or deployment acceptance is implied.
Follow-up review repairs restore the Site Health `content_page` format hint and
empty-title fallback, fix plain-string environment aliases in the shared policy
export (including the image's `AGENT_SKILLS_DIRECTORY` contract), and remove the
second analytics kind list. Registry coverage compares real executors to the
full kind vocabulary. Removed targets terminalize without retries; Tavily JSON
is byte-bounded; boolean query qualifiers are deliberately omitted. The Agent
API's absent-context 404 and conservative malformed/failed usage settlement are
recorded in their owner documents. Active runtime and restore instructions now
refer to the TypeScript owners; dated legal evidence retains its original date.

### PR 20: Consolidation and policy transfer

Move `core/config` modules consumed only by TS into TS config and shrink the
export. Delete Python bridges whose last caller has moved. Remove empty Python
routers and dead registrations. Document the final Python↔TS boundary in the
architecture owner.

**20a.** Native configuration now owns brand evidence/logo acquisition,
internal-link retrieval and judgment, Agent context and skill vocabulary, MCP
protocol settings, prompt-generation templates, and Site Health authorship and
company identity. Prompt templates compose examples and cohort rules at use
time instead of exporting every expanded combination. Python retains the
model-consumed prompt vocabulary and normalization, shared security/settings,
queue policy and other still-shared sections; the generated bridge remains
drift-checked.

Retired bridges: Python analytics reads/enqueue, project business-context and
identity shims, legacy normalization/source-pattern analysis, CSV helpers,
Keenable, output-cap handling, streaming and executor-error shells. Their
Python-only tests retire with them; native owner tests remain. Cold-connect
coverage now uses integration completion's native successor admission.
Literal-vocabulary guards retire with their last Python schema consumer;
prompt exemplar substring tests retire with the templates, with native
generation/admission and packaged-skill tests covering the consumers.

**20b.** Update frontend/API dependencies and Python's resolved dependency set,
align pnpm 12.8.1 in workspace/root metadata and all Node images, and retire
`python-multipart` with the already-removed Python upload routes. Frontend Knip
and backend deptry remain the unused-dependency gates. Vite+/Vitest stay coupled
at the bundled versions; MSW stays on 2.x because that mocker requires it.
SQLAlchemy remains resolved at 2.1.1 until the 2.1.2 release supplies the
Python 3.12 Linux wheel required by binary-only deployment installs. All Node
dependency stages include every workspace manifest for pnpm's frozen checks.

Remaining PR20 work: further field-level policy transfer and bridge retirement.
Models/Alembic
remain Python; supported operator tooling and deploy-time bootstrap remain
explicit consumers until their callers are replaced. No schema tables are
dropped merely because their HTTP owner moved.

**20c.** Transfer abuse budgets, customer model connection policy, JEV settings
and judgment catalogs, product-tour version, content differentiation, onboarding
industries, Opportunity/Action decision catalogs, placement verification and
cited-source taxonomy/inspection policy to native config. Retain Python's
model-consumed lifecycle defaults and the Opportunity versions used by the
development enqueue producer. Remove the duplicated Action rule catalog and
unused industry prompt templates/context and customer-model timeout setting
(the gateway's configured timeout remains authoritative). Native consumers retain environment bounds,
threshold ordering and the complete rule-to-evidence-family guard. Python
source-page persistence tests keep their behavior coverage with literal evidence
fixtures instead of importing the retired application vocabulary.

**20d.** Native startup enforces the complete production-security gate, while
Python retains it for migration/operator processes. Discovery and integration
workers recover expired leases and support bounded drain-and-exit operation;
the existing independent `queue-sweeper` service now uses the API image and
TypeScript entry point. Discovery parent failure commits with task recovery.
Integration recovery preserves attempts already charged at claim; claim-time
availability uses PostgreSQL's clock to agree with recovery. Retire Python's
generic queue/protocol, queue specs and parent reconciler. Native real-PostgreSQL
tests replace the retired queue implementation/wiring tests; Python model
constraint and isolation coverage remains.

**20e.** Retire Python's health-only web process, ASGI middleware/dependencies,
OpenAPI exporter, obsolete HTTP test helpers, generic drain shell and unused
telemetry wiring. Remove FastAPI, Starlette, Uvicorn, Logfire and structlog;
declare the infrastructure tests' YAML parser in the dev dependencies. Python's
image remains the migrations/bootstrap and offline-operator image. All local
and production API/protocol ingress reaches the native service; Caddy retains
origin-token, host and forwarded-header admission. The native route gate checks
all 31 manifest families and three ingresses without a Python OpenAPI artifact.
The empty Python component drift map and its acquisition pipeline retire;
native schema-typed handlers and browser consumers share their contracts.

**20f.** Commerce acquisition/admission bounds, buyer-prompt templates and shelf
policy now belong to native config; prompt examples compose at use time.
Python retains only Commerce versions used by models and error vocabulary
pending the error-code authority transfer. Audit-scheduler runtime settings and
the pinned timezone catalog move to native config, retiring Python's unused
`tzdata` dependency; model defaults and the shared
provider catalog remain exported. Both transfers preserve environment aliases
and exclusive bounds. Timezone admission also checks the native runtime's
support, rejecting catalog names such as `Factory` that cannot execute.
Further policy and test-only acquisition bridge retirement
remain open; PR20 is not complete.

**20g.** The hand-owned `@citeladder/contracts/error-codes` vocabulary now owns
API machine codes. Native error configuration owns HTTP defaults and retry
classification, retiring Python's unused generic error policy, Commerce's
unused API error constants and the error-code generator/drift coupling.
The shared policy export remains for genuine Python model/operator consumers.
Further TS-only policy transfer and acquisition bridge retirement remain open.

**20h.** Retire test-only Python acquisition contracts, URL policy,
normalization, suppression, inventory scope and failure readers, together with
their implementation tests. Native per-hop tests cover global/parent/IDNA
suppression, operator resumption, inert bare-TLD rows, unavailable policy storage
and malformed destinations; admission tests retain hard-exclusion, document,
binary, length and public-suffix scope decisions. The native transport now
rejects overlong DNS names before lookup. Existing native SSRF, redirect,
rebinding and failure-read coverage remains.
Python model/isolation fixtures use known canonical URLs; Commerce's
`seed_site_crawl` caller remains. Retain the supported offline
`scripts/acquisition_control.py` operator, its model and security-event owner.
Remove declaration-only onboarding direct-fetch settings and `tldextract` with
its unused transitive dependencies. Further TS-only policy transfer remains open.

**20i.** Move Site Health acquisition, analysis, readiness, rule, architecture,
link-metric and change-intelligence catalogs and TS-only runtime settings to
native config. Compose rule metadata and checklist IDs from their owning maps;
startup validates catalog relationships and environment bounds, including
cross-field constraints previously enforced only by Python.
Retire 19 Python catalogs/builders/tests whose last application caller moved.
Python retains model defaults, terminal states and the supported allowance
projection with five shared settings: automatic/requested limits, sample
analysis/discovery limits and task attempts. Native analysis/read/acquisition
coverage and catalog/settings decision tests replace the retired readiness
tests; real-PostgreSQL model/isolation and entitlement coverage remains.
Further field-level policy transfer remains open.

**20j.** Transfer Agent runtime/gateway, discovery research/worker and prompt
library/HTTP policy to native config. Preserve environment aliases, exclusive
bounds, lazy generation defaults and the packaged-skills image/fallback path.
Competitor suggestion instructions compose with the resolved limit at use time;
retire the unused discovery research template. Python retains Agent run attempts,
discovery queued/task/attempt defaults, prompt model defaults and normalization
punctuation. Retire Python HTTP/API policy modules and the obsolete Agent gateway
dotenv test; native gateway/admission/skills tests and remaining Python dotenv
coverage guard the retained consumers. Other policy families remain open.

**20k.** Transfer Search Intelligence acquisition/pricing, Demand lexical policy,
integration transports/settings/datasets, traffic and referral catalogs, analytics
runtime and OAuth policy to native config. Dataset arity, dimension separators,
OAuth transaction cookies and analytics execution/recovery kinds compose from
their sole native owners. Preserve credential aliases and sync/worker cross-field
bounds. Python retains integration and analytics queue defaults, provenance
versions, entitlement identities and supported Opportunity enqueue behavior.
Retire the uncalled Python analytics fixture helper and execution-only catalogs,
OAuth helpers and tests. Native recorded-provider and PostgreSQL paths retain
classification, redaction, resume, lease, scope and distinct unavailable coverage;
model/isolation and deployment-secret coverage stays in Python. Further policy
transfer remains open.

**20l.** Transfer audit lifecycle, scoring, Visibility reads and observed
competitor policy, then provider capacity/endpoints/credentials, DataForSEO
request policy and execution pricing to native config. Selectable engines derive
from the shared public provider catalog and frozen routes. Native audit
transitions refuse invalid jumps/terminal revival without writing events;
provider failure details remain opaque. Retire 12 Python files: execution-only
catalogs, state/error bridges, their superseded tests and the uncalled audit seed
helper. Remove the obsolete Python funded-test policy fixtures. Python retains
model defaults/provenance, public catalogs, frozen route identities and supported
offline evaluation/non-secret provisioning. Native recorded-provider/cost and
PostgreSQL paths cover the transferred decisions; retained Python operator,
evaluation and persistence tests cover the shared boundary. Other PR20 policy
families remain open.

> **Stop point D (end of this plan).** TypeScript owns the application layer.
> Python keeps the schema (models and Alembic), any policy not yet transferred,
> and supported offline operators/bootstrap. Queue recovery is native; Python
> has no HTTP or executing worker process.

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
- The terminal-crawl analytics handoff keys: verification `site_crawl:<crawl>`,
  Opportunity refresh and the Demand revision (`<trigger>:<id>`, first 24
  characters). TypeScript alone writes them since 18b5b (the `change_intel`
  executor and no-evidence finalization).
- The stored business map (`business_context.business_map`: offerings, entries
  with origin, review state, reviewer and source, and exclusions) and the brand
  profile `sources` provenance, read by Python prompt generation.

## 8. Known traps

- Asyncio vs Node behavior under lock contention: lease tests run against real
  PostgreSQL.
- Crypto interop (JOSE in PR 14, Fernet in PR 13, argon2 in PR 14).
- Dashboards keyed on logfire attributes going dark after a cutover.
- Compose and GCP compose drifting from the ownership manifest.

## 9. Low-cost hosting (PRs 21–24, proposed 1 October 2026)

Status: direction accepted by the owner on 1 October 2026. Each PR still runs
only when individually assigned.

**Objective.** The product has no customers yet. The current deployment
costs about ₹6,000 a month: one Mumbai e2-standard-2 runs PostgreSQL, Caddy and
about 15 Python and TypeScript processes around the clock, with a balanced disk
and a static IP. The target is under ₹500 a month in fixed hosting, excluding
provider usage (JEV, DataForSEO, models) and the domain. Marketing, docs and
the app stay available, and the app serves a few concurrent users. GCP and
Cloudflare remain the only platforms.

**Target.**

```text
Cloudflare Workers (free): marketing, docs, app shell; /api/* proxy
        │  origin token header
        ▼
Cloud Run us-central1 (scale to zero)
  api       service, min 0 / max 2, DB pool ≤ 4
  runner    job: drains every TypeScript worker lane, then exits
  migrate   job: alembic upgrade head (Python image), run on deploy
Cloud Scheduler: one tick job (sweep leases, enqueue due schedules/syncs, drain)
        │  Direct VPC egress (private IP)
        ▼
Compute Engine e2-micro us-central1 (free tier): PostgreSQL 16 only,
30 GB pd-standard, small max_connections, swap
```

**Rules.**

- Nothing except PostgreSQL runs continuously. Nothing except PostgreSQL runs
  on the VM.
- Application logic stays out of Cloudflare Workers (10 ms CPU on the free
  plan). No Hyperdrive and no tunnel: Cloudflare never connects to PostgreSQL.
- The API keeps commit-before-network-I/O: a write that enqueues work commits,
  then starts a runner execution. Leases make duplicate executions harmless,
  so starts are not deduplicated. The tick recovers any missed start.
- Cloud Run's raw URL rejects requests without the origin token. Caddy
  enforces this today, so the API service takes over the check.
- Scale-up changes sizes, not services: raise Cloud Run limits, resize the VM,
  or move PostgreSQL to Cloud SQL with a dump and a connection-string change.

**PR 21: Scale-to-zero runner.** One `runner` entry point drains every
TypeScript lane in one process with a shared, small pool and a time budget,
then exits. One `tick` entry point performs the periodic work that the
dispatcher, scheduler and sweeper loops do today. The API starts a runner
execution after committing work. Requires PR 20: no Python process remains at
runtime except the migration.

**PR 22: Foundation.** Terraform for a new us-central1 environment beside the
current one: the e2-micro PostgreSQL VM without a public address, the
Cloud Run API service, runner and migrate jobs, the scheduler tick, Secret
Manager wiring, a US backup bucket with short retention, an Artifact Registry
cleanup policy, and budget alerts at ₹500 a month and about ₹20 a day.

**PR 23: Move and cut over.** Back up the Mumbai database, restore it on the
new VM, run the migrate job and smoke-test each route family, the runner and
the tick. Point the app Worker's `ORIGIN_UPSTREAM` at Cloud Run. Stop the
Mumbai VM after the smoke tests pass, and keep its final backup.

**PR 24: Retire Mumbai.** Delete the e2-standard-2, its disk, static IP,
Caddy and origin configuration, and the `compose.gcp.yml` path. After seven
days, check billing by SKU and remove anything unexpectedly non-zero.

**Owner decisions (1 October 2026).** us-central1 is accepted despite about
250 ms more per API round trip from India. The owner stops the Mumbai VM
manually if needed; no PR stops it before PR 23. Cutovers need no soak (rule 7).
The free tier is confirmed for one e2-micro with 30 GB standard disk in
us-central1. The database VM has no public address regardless, and the first
week's billing by SKU confirms nothing else is charged.
