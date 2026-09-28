# TypeScript migration plan

Status: PR 1 (TS platform foundation) implemented on 27 September 2026 at the
owner's request, applying D1–D5 as drafted; D6 (team rule) still awaits the
owner. PR 2 (shared contracts and route-ownership gate) implemented on
27 September 2026 at the owner's request. PR 3 (first live reads) implemented
on 27 September 2026 at the owner's request: `executions`, `ai-referrals` and
`visibility` are TypeScript-owned, served through every ingress, with the
GCP runtime running the service image. PR 4 (queue engine and referral
analytics kinds) implemented on 27 September 2026 at the owner's request,
together with the removal of PR 3's Pydantic error-wording emulation. PR 5
(traffic, performance and demand projections) and PR 6 (Opportunity detectors
and verification) implemented locally on 27 September 2026 at the owner's
request. PR 6 includes the explicitly approved detector foundation for PR 7.
PR 7 is split at the owner's direction: PR 7a (Opportunity refresh and catalog
routes) implemented on 27 September 2026, without Python emulation. PR 7b
(Action routes and declarations) implemented on 27 September 2026. PR 7a-cleanup
removed Python emulation from PRs 3–6 on 27 September 2026 (rules 4 and 7).
The owner restated the objective on 28 September 2026 (section 1, rule 4), and
golden retirement removed every golden file and parity check. Earlier "As
implemented" notes that mention goldens or frozen fragments are historical.
PR 8 is split at the owner's direction (28 September 2026): 8a (Search
Intelligence) implemented on 28 September 2026; 8b (Commerce) not started.
Not execution authorization; each later PR is executed only when individually
assigned.

## 1. Goal, scope and pace

**Objective: a better architecture, not a port.** The Python application layer
has been changed many times and carries accumulated debt. Rather than keep
fixing it, each owner is rebuilt in clean, idiomatic TypeScript from its product
logic, and the Python is deleted. Python is a reference for *what* the product
does, never a template for *how*. There is no parity and there are no golden
files: nothing is built to compare TypeScript with Python or to reproduce a
Python quirk. When product behavior is unclear, ask the owner instead of copying
Python. Success is measured by debt removed.

The application layer moves in 14 self-contained PRs, least risky first. This plan does not target the whole
Python codebase. Every PR leaves the repository deployable and coherent if
migration stops permanently after it.

**PR size budget.** One PR retires at most about 50 Python files (application plus
tests), so creation and deletion together stay near 100 files. Counts below are
estimates from the 26 September tree; re-count before starting a PR and split it
if it exceeds the budget.

**Starting size.** 1,085 tracked Python files: 729 in `backend/app`, 327 in
`backend/tests`, 29 scripts, evaluations and migrations.

### In scope (moves to TypeScript)

API reads, analytics projection workers, opportunities, commerce and search
intelligence, projects, prompts and topics, integrations, auth and workspaces,
and MCP. That is roughly 500 Python files including tests.

### Out of scope (stays Python; a separate plan may revisit)

These form one coupled island around crawl execution and money. Audit creation
(`domain/audits/creation.py`) reserves capacity, runs funded admission and writes
the entitlements ledger, and brand discovery references billing and
entitlements. None of them can move without billing moving first.

- Site Health, all of it: `domain/site_health`, `api/site_health`,
  `workers/site_health*`, `connectors/web_evidence`, `analysis/site_health`
  (~200 files with tests). Crawl transport (`curl_cffi`, DNS pinning), robots
  (`protego`), sitemaps (`defusedxml`) and `lxml` parsing have no equal TS
  replacement.
- Audits (creation, schedules, scheduler, execution), answer-engine and
  search-surface connectors, and the DataForSEO two-phase park/poll.
- Billing, entitlements, BYOK providers (`domain/providers`).
- The existing Agent runtime and brand discovery.
- Source-page inspection (it fetches through `web_evidence`).
- `models/`, Alembic migrations and the queue sweeper, which serves every queue.

## 2. Verified constraints

- Ten backend processes run from one image (`docker-compose.yml`,
  `infra/gcp/runtime/compose.gcp.yml`), and all queues share
  `orchestration/postgres_task_queue.py`. Its claim already accepts a
  `task_kind` filter, so an analytics kind can be owned by exactly one stack.
- Production routes all `/api` traffic from the Caddy origin to `:8000`
  (`infra/gcp/runtime/Caddyfile`); local compose mirrors it in
  `frontend/local-compose-routes.caddy`. Per-path splitting needs only matchers.
- The pnpm workspace root is `frontend/`; AGENTS.md forbids a root lockfile.
  zod schemas live in `frontend/lib/api/schemas/` (31 files, 22 importers), with
  a CI OpenAPI↔zod drift guard. No TypeScript touches PostgreSQL today.
- Sessions: HS256 JWT cookie (`joserfc`), `ver` claim against
  `user.session_version` (`api/deps.py`); argon2 passwords; Fernet secrets
  (`core/security.py`). Rate limits are PostgreSQL counters (`domain/abuse`).
- `api/search_intelligence.py` has write routes (preferences, cancel,
  content-handoff, citation-matches), so it moves as a whole family with its
  worker kind rather than as an early read.
- Invariant 5: pre-launch semantic versions stay `1`. Porting known logic to
  TypeScript is not a semantic change.

## 3. Decisions to lock

- **D1 Layout.** Keep the single pnpm workspace rooted at `frontend/`; add
  `frontend/packages/contracts` and `frontend/services/api`.
- **D2 Runtime.** Node 22+ with Hono.
- **D3 Query layer.** Kysely with types generated from the Alembic-migrated
  schema. It cannot author migrations, which enforces D4.
- **D4 Schema.** Alembic stays the sole schema author for this whole plan
  (invariant 17). The TS service never contains migration files.
- **D5 Policy.** `backend/app/core/config/*` remains the policy authority
  (invariant 2). TS reads a generated, drift-checked export. Config used only by
  migrated owners transfers to TS config in PR 14.
- **D6 Team rule.** New product services default to TypeScript after PR 1.
  In-flight plans (Prompt generation v2, Agent workspace) finish as planned;
  PRs 9–10 wait for Prompt generation v2 to complete.

## 4. Rules for every PR

1. **One writer.** Each route family, task kind and table has one writing stack.
   The PR that adds the TS owner deletes the Python owner (replacement gate,
   invariant 1). The route-ownership manifest (PR 2) is the single record.
2. **Shared Python code is retired last.** A Python module still called by the
   out-of-scope island is not deleted; TS gets its own implementation, and the
   Python copy's deletion condition is "last Python caller gone" (PR 14 or
   never).
3. **Revertible within the release.** Rollback is a manifest entry, a compose
   command or a kind set in config. Never a data repair.
4. **No parity, no goldens.** Write idiomatic TypeScript: zod validation,
   `JSON.stringify`, plain numbers, `toLowerCase`, WHATWG `URL` and plain error
   messages. Do not emulate Python semantics (`repr`, `casefold`, `str.split`,
   float spelling, Pydantic wording or schema shape, `json.dumps` byte layout).
   Add no golden files of any kind: no frozen OpenAPI fragments, no
   Python-generated fixtures, no parity harness or normalizer. The TypeScript
   owner defines its route contract in zod. Behavior is covered by focused TS
   tests and real-PostgreSQL tests. While both stacks exist, a few values are
   read by both: session cookies, the project advisory-lock key, hashes one
   stack stores and the other compares, and queue rows. Each one is named in
   its owner's section and disappears when its last Python side moves.
5. **Invariants unchanged:** workspace authorization (non-member → 404), reads
   never acquire or repair, commit-before-network-I/O, distinct unknown states,
   append-only evidence. Providers use recorded fixtures only.
6. **Telemetry parity.** Span and attribute names used by dashboards survive the
   move; each cutover soaks one week comparing error rate and latency.
7. **Greenfield, not debt-preserving.** Python is a behavior reference, not a
   template. Each TS owner is designed as if new:
   - its own module boundaries, types and data flow, following TypeScript
     service conventions (the reference is an all-TypeScript product like
     `every-app/open-seo`)
   - no file-by-file transliteration, and no carrying over Python
     workarounds, compatibility shims, dead branches or helper layers just
     because Python has them
   - Python semantics are kept only where rule 4 names a cross-stack contract

   Where Python behavior was a defect or accident, fix it and record the
   departure. A PR is judged by how much debt it removes, not by how exactly
   it reproduces Python.

## 5. PR sequence

| # | PR | Risk | Python files retired (est.) |
|---|---|---|---|
| 1 | TS platform foundation | Low | 0 |
| 2 | Shared contracts and route-ownership gate | Low | 0 |
| 3 | First live reads | Med-Low | ~40 |
| 4 | Queue engine and referral analytics kinds | Medium | ~25 |
| 5 | Traffic, performance and demand projections | Medium | ~40 |
| 6 | Opportunity detectors | Medium | ~30 |
| 7 | Opportunity store, refresh and routes | Med-High | ~40 |
| 8 | Commerce and search intelligence | Med-High | ~45 |
| 9 | Projects | Med-High | ~45 |
| 10 | Prompts and topics | Med-High | ~45 |
| 11 | Integrations | High | ~45 |
| 12 | Auth and workspaces | High | ~35 |
| 13 | MCP server and OAuth provider | High | ~20 |
| 14 | Consolidation and policy transfer | Medium | ~40 |

### PR 1: TS platform foundation

`frontend/services/api` on Hono: config loading, structured logging with the
request-id convention, the error envelope (`docs/api-error-contract.md`),
`/health` and `/ready`. PostgreSQL pool with the timeouts from
`core/database.py`, Kysely types generated from the schema (CI diffs them), a
query helper that requires `workspace_id`, and a CI rule forbidding migration
files. A generated export of the Python config the next PRs need, with a
staleness check. Session verification middleware (decode Python-issued cookies,
`ver` check, capability matrix; no issuance). A golden-master harness: a Python
command writes fixtures, and a TS runner replays them. Compose service, CI job,
`scripts/ci-changes.mjs` and `scripts/quality.mjs` scopes. Architecture and
invariant docs name the second language.
*Safe because* nothing routes to it. *Rollback:* remove the service.

### PR 2: Shared contracts and route-ownership gate

Move `frontend/lib/api/schemas/*` into `frontend/packages/contracts` and update
the 22 importers. Add the error machine-code union, the TS OpenAPI exporter and
the route-ownership manifest (family → stack). CI checks TS fragments against the
Python golden export for TS-owned families and checks both Caddyfiles against the
manifest. *Safe because* the manifest starts empty and the move is mechanical,
guarded by the existing drift check.

> **Stop point A.** Platform exists and serves nothing; Python is all behavior.

### PR 3: First live reads

GET-only routers `executions`, `ai_referrals`, `visibility_sources` and
`visibility_surfaces`, the `domain/analysis` read modules behind them, and the
deterministic leaves they use (`analysis/lexical`, `normalization`, `position`,
`trend_metrics`, `scoring`, `comparison`), each under rule 2. Their component
tests are ported with workspace-isolation cases. This is the first ingress split.

*As implemented:* the routes reach only the leaves listed in the port —
normalization's domain helpers, the grounding-redirect predicate, citation
classification, mention position and frozen provenance. PR 7a-cleanup replaced
the classification parity corpora with TS decision and PostgreSQL route coverage. `lexical`, `trend_metrics`
and `comparison` are not on these routes' paths and move with the PRs whose
readers call them. `get_execution_evidence`, `execution_surface_evidence` and
`get_ai_referrals` stay in Python for MCP and the Agent (rule 2); the rates,
source series and URL detail retired with their routers (about 15 Python files
including tests). PR 7a-cleanup removed their frozen golden masters; PostgreSQL
route tests retain behavior and workspace-isolation coverage.

### PR 4: Queue engine and referral analytics kinds

Port `postgres_task_queue.py` statement for statement: double-applied eligibility
re-check on the locked relation, workspace-turn fairness, lease, heartbeat and
owner checks, park states that spend no attempts, and `max_attempts_exceeded`.
A two-stack concurrency test proves that disjoint kind sets are never
cross-claimed. A TS analytics worker takes `ingest_referrals`,
`classify_referrals`, `ai_referrals_snapshot_refresh` and
`referral_retention_sweep` (`domain/analytics`). Kind ownership lives in
`core/config/analytics.py`, and the Python worker claims the complement. The
Python sweeper keeps expiring leases for every queue.

*As implemented:* the TS queue ports what a claiming worker runs (the claim,
`mark_running`, heartbeat and the worker's locked finalize) for
`analytics_tasks`; expiry, parking, retry and cancel stay with the Python queue
that the sweeper and other workers use, so no second copy exists without a
caller. `ANALYTICS_TS_OWNED_TASK_KINDS` is a config constant exported to TS,
so both images always agree; rollback is reverting that constant. The worker
runs from the API service image as `analytics-worker-ts`. The two-stack proof
is a PostgreSQL test of concurrent claimers with disjoint kind sets through
the shared claim SQL, plus a Python test that its worker leaves TS-owned rows
queued. Classification stayed in Python until PR 5; the sanitizer, event mapping
and snapshot projection retired with their executors. PR 7a-cleanup removed the
frozen corpora in favor of worker and focused redaction/identity tests. Nothing enqueues
`referral_retention_sweep` yet, in either stack; the executor is ported, the
scheduling gap predates this PR.

The same PR removed PR 3's Pydantic error-wording emulation (speedate
datetime diagnostics, uuid-crate messages, the casefold table and the frozen
`request_parameters` golden): parity is the 422 contract (status, code, `loc`,
`type`), not message text. PR 7a-cleanup later relaxed `type` for dates (see
there).

> **Stop point B.** Reads and the first worker kinds are TS; the queue is proven
> with two stacks.

### PR 5: Traffic, performance and demand projections

`domain/traffic`, the non-search-intelligence part of `domain/demand`, and the
`performance` and `demand` routes. Kinds: `traffic_snapshot_refresh`,
`performance_range_projection`, `demand_snapshot_refresh`. Golden masters on
projection output.

*As implemented:* the pre-code inventory was 38 directly scoped Python files
(23 application files and 15 tests), below the roughly 50-file budget; no split
was needed. TypeScript owns the four Performance projection/read routes, all
five Demand routes, and `traffic_snapshot_refresh`,
`performance_range_projection`, `demand_snapshot_refresh`. The generated kind
set, manifest and all three API ingress Caddyfiles agree. `/performance/sync`
and `/readiness` remain Python under separate `performance-sync` and `readiness`
manifest entries: they call integrations-owned enqueue/admission and readiness
readers. Compose continues using the existing TS analytics worker image.

The traffic fold, demand projection/admission/evidence writers and demand router
retired, along with their Python-only component/unit tests. Their retained
contracts are covered by TS PostgreSQL tests, including the cold-connect chain
through both workers. PR 7a-cleanup removed the frozen projection/classification
corpora.
`analytics/classification.py` also lost its final runtime caller and retired;
its frozen golden was removed by PR 7a-cleanup. Config, models, Alembic, enqueue helpers and
the Python queue/sweeper remain authoritative.

Python bridges remain only for their current callers: `traffic.performance`,
`traffic.query_support` and their DTOs serve the Agent; the trimmed
`traffic.service` lists integrations sync targets; `demand.query_evidence_reads`
and query normalization serve MCP; `demand.selection` serves prompts and
opportunities; `demand.page_equivalence` serves implementation events.
`demand.search_intelligence` stays untouched for PR 8. Remove each bridge when
its last Python caller moves. PR 7a-cleanup keeps live URL/query identity goldens
because Python still writes SiteUrl hashes and compares query keys; page-equivalence
and Performance conversion corpora were removed. The real cross-runtime reader
test checks Performance results/cursors and query-evidence paging.
Current-demand selection remains the Python consumer's window-first selector;
the migrated `/demand/latest` preserves its existing creation-time ordering.

Deliberate departures: boolean/non-finite provider metrics no longer coerce to
counts or crash a fold; invalid additive values contribute zero and unavailable
positions remain null. An override with no searchable characters returns a
structured 422 instead of Python's unhandled `ValueError`. Concurrent demand
retries serialize with a transaction advisory lock and reuse the immutable
snapshot instead of racing its unique constraint. A display-only range
projection that meets a concurrently written snapshot keeps that row instead of
overwriting it. Each has TS coverage.
At the owner's direction, the existing demand analyzer/rule identifiers were
changed from `*-2` to `*-1`; no database reset or migration was performed.
Every project's demand `source_hash` therefore changes on deploy, and existing
`*-2` snapshots are superseded on their first refresh; reads are
version-agnostic.
The casefold export here preserves persisted query identities, not Pydantic
error wording. Deployment and the one-week error-rate/latency soak remain
pending.

### PR 6: Opportunity detectors

`analysis/opportunities/*` (pure detectors) and `opportunity_verification`.
Every detector has golden-master coverage. No routes move.

*As implemented:* the pre-code inventory found 19 substantive application
modules (11 detector modules and eight transitive leaves), an empty package
initializer, and 13 directly relevant test modules. Only one application file
and one test file are retired, below the retirement budget. The owner chose
option 2 after the inventory confirmed that the detector port has no TS runtime
caller in this PR: it was an explicitly approved foundation for PR 7.
PR 7a-cleanup replaces the detector corpora with TS decision and PostgreSQL coverage. The verifier is the live TS runtime cutover.

The inventory and rule 2 bridges are below. Paths are relative to `backend/app`;
all listed Python modules remain unless marked retired. Removal requires the
last Python caller to move, not simply PR 7 landing.

| Python module | Remaining Python callers / disposition |
| --- | --- |
| `analysis/opportunities/actions.py` | `domain/opportunities/actions.py` |
| `analysis/opportunities/detectors.py` | `source_mix`, `earned_pages`; domain visibility evidence, commerce/change/earned-page/demand hits, snapshot build and recompute |
| `analysis/opportunities/earned_page_brief.py` | `earned_pages` |
| `analysis/opportunities/earned_page_evidence.py` | `earned_page_brief`, `earned_pages`, domain earned-page hits |
| `analysis/opportunities/earned_pages.py` | domain earned-page hits |
| `analysis/opportunities/exports.py` | `api/opportunities.py` |
| `analysis/opportunities/page_predicates.py` | `earned_pages`, `placement_outcome` |
| `analysis/opportunities/placement_outcome.py` | domain placement checks, used by Python source-page inspection |
| `analysis/opportunities/scoring.py` | detectors, earned pages and domain recompute |
| `analysis/opportunities/source_mix.py` | domain summary, snapshot projection and recompute |
| `analysis/opportunities/source_patterns.py` | detectors, source mix, domain visibility evidence and `analysis/service.py` |
| `analysis/comparison.py` | analysis service, domain visibility/trends/matched/source comparisons, comparison projection, prompt outcomes and command center |
| `analysis/csv_cells.py` | Opportunity, analysis and Site Health exports |
| `analysis/normalization.py` | `analysis/entity_assessment`, `analysis/scoring`, Opportunity source patterns/page predicates, source-page presence; domain analysis visibility, integrations mappings, Opportunity actions, project onboarding and prompt portfolio; answer-engine normalization |
| `analysis/site_health/indexing.py` | Opportunity actions and Site Health rules/schema rules |
| `domain/opportunities/verification.py` | enqueue helpers only: `domain/site_health/terminal_refresh.py` and `workers/source_pages/inspector.py`; terminal refresh retains the audit helper admission path |
| `domain/opportunities/verification_result.py` | retired; sole executor caller moved to TS |
| `domain/opportunities/visibility_checks.py` | implementation declarations freeze their baseline |
| `domain/opportunities/placement_checks.py` | declarations and source-page inspector; only `placement_section` retired into TS |

`opportunity_verification` joins `ANALYTICS_TS_OWNED_TASK_KINDS`; the TS
analytics worker claims it and Python claims the complement. Python admission,
models, Alembic, sweeper, source inspection, Opportunity refresh and routes stay
with their existing owners. The executor reads persisted evidence and appends
verification observations with the same trigger revision, processing versions
and idempotency format. It adds no provider I/O or new spans; existing queue
worker telemetry remains in force. Route ownership and both Caddyfiles are
unchanged.

PR 7a-cleanup retains `opportunity_comparisons` for the shared measurement hash
and removes the detector and frozen verification corpora. Focused TS tests cover
uncertain placement, source classification, strict page-fact equality and ISO
microseconds; the PostgreSQL suite covers the verifier's decisions.
PostgreSQL coverage exercises Python enqueue → TS claim/complete → Python read,
concurrent replay, exact provenance, finalized/current evidence, missing prompt
targets, changed audit cohorts and referral/demand before/after states.

The nine pure detector test modules remain (`test_action_grouping`,
`test_earned_page_detector`, `test_opportunity_scoring`,
`test_opportunity_exports`, `test_opportunity_source_mix`,
`test_opportunity_site_detectors`, `test_placement_outcome`,
`test_source_patterns`, `test_visibility_detectors`).
`test_opportunity_verification_result.py` is retired into TS PostgreSQL coverage;
PR 7a-cleanup removes its frozen golden corpus. Verifier-only cases leave `test_visibility_metric_check`
and `test_placement_checks` with the same behavior covered in TS; their Python
helper, declaration, inspection and recheck tests remain. The Action declaration
reader test now consumes seeded observations. `test_post_sync_chain` additionally
proves real Python enqueue deduplication and exclusion from Python claims.

Deliberate departures: every verification query now enforces workspace scope,
including referenced audits, baselines and metrics that the former Python
verifier fetched by ID; existing rule-row scope is retained. Foreign provenance
yields unavailable evidence and is covered at PostgreSQL. At the owner's explicit direction,
`opp-analyzer-3`, `opp-rules-3`, `opp-formula-2`,
`implementation-verifier-2` and `source-taxonomy-2` become their `*-1`
identifiers. This changes newly derived identities and verification enqueue/event
idempotency keys. The local database has been reset and the GCP database will be
reset before deployment, so no legacy `*-2`/`*-3` rows exist and the
normalization needs no legacy-row handling. No schema migration is performed.
Python remains the policy authority; generated TS policy is drift-checked.
Source-page extractor versions are outside this normalization.

Deployment and the one-week error-rate/latency soak remain pending.

### PR 7: Opportunity store, refresh and routes

`domain/opportunities`, `api/opportunities`, `opportunity_refresh`.

The inventory estimated about 105 changed files, so the owner split PR 7:
**7a** moves the refresh and the Opportunity catalog routes; **7b** moves the
Action routes and declarations.

*As implemented (7a):* `opportunity_refresh` joins
`ANALYTICS_TS_OWNED_TASK_KINDS` and the TypeScript analytics worker claims it;
Python admission (`domain/opportunities/queue.py`) and every enqueueing source
are unchanged. The `opportunities` family moves to TypeScript in the
route-ownership manifest, and all three Caddyfiles route list, summary,
recompute, history, detail, order and CSV/Markdown export to it. The Action
routes are retagged `actions` and stay Python. The Python fragment was frozen as
`golden/families/opportunities.json` while Python still served it, and the gate
proves parity.

Replacement-gate inventory (paths relative to `backend/app`):

| Python module | Disposition |
| --- | --- |
| `domain/opportunities/recompute`, `change_hits`, `commerce_hits`, `demand_hits`, `earned_page_hits`, `site_coverage`, `snapshot_build`, `snapshot_projection`, `summary`, `history`, `commands`, `export` | moved and retired |
| `analysis/opportunities/detectors`, `earned_page_brief`, `earned_page_evidence`, `earned_pages`, `exports`, `scoring`, `source_mix` | retired; the PR 6 TS ports are now live |
| `analysis/opportunities/actions.py` | bridge: `page_group_key`, `select_approach` for Agent attach; grouping retired |
| `domain/opportunities/actions.py` | bridge until 7b: Action reads and Agent attach; `sync_actions` retired |
| `domain/opportunities/queries.py` | bridge: `list_opportunities` for the command center and dev seed |
| `domain/opportunities/projection.py` | bridge: `project_item`, `stable_key` for queries and placement checks |
| `domain/opportunities/schemas.py` | bridge: `OpportunityItem`, `VerificationEventView` |
| `domain/opportunities/visibility_evidence.py` | bridge: `owned_domain_list` for placement checks |
| `domain/opportunities/common.py`, `errors.py` | retained for the remaining owners; retired-only messages/errors removed |
| `api/opportunities.py` | Action routes only, until 7b |
| `queue`, `verification`, `action_status`, `action_schemas`, `implementation_events`, `measurement_legs`, `page_links`, `placement_checks`, `visibility_checks`, `content_handoff` | unchanged; 7b or later owners |
| `workers/analytics_worker.py` | `_refresh_opportunities` executor retired |

A bridge is removed when its last Python caller moves. For the command center
and dev seed this is not simply PR 7b landing.

Rule 1 exception: `actions` has two writers across the stack boundary. The TS
refresh derives evidence Actions and restamps derivation columns (members,
families, priority, approach, diagnosis, snapshot, evidence clearing). Python
writes workflow status and declarations until 7b. The Python Agent inserts only
`agent`-origin rows with insert … on conflict do nothing on
`(project_id, group_key)`. The TS insert adopts such a row on the same key, so a
concurrent attach never aborts a refresh. Both stacks take the same blake2b
project advisory lock (`citeladder-locks` person, exported in policy). 7b
retires the Python status and declaration writers; the Agent insert remains
until the Agent moves.

No Python emulation (rule 4, restated by the owner during this PR). The
refresh writes plain JSON; the cursor, CSV/Markdown cells and 422 messages are
idiomatic TypeScript. The retired decisions are not frozen as goldens; the
PostgreSQL suite covers the behavior. A live `opportunity_sources` golden
holds only the values both stacks compare:
- the roster hash (Python stamps it on source-page presences)
- the prompt-text hash
- the project lock key
- the URL form behind an Action's page key

The four PR 6 edge notes were resolved as follows:
- an empty-string `prompt_id` still targets that prompt
- scoring avoids `Math.max(...spread)`
- an unknown source class throws

Refresh policy is exported (`refresh` section), never restated.

PostgreSQL coverage (`opportunity-refresh.test.ts`) exercises:
- Python enqueue (deduplicated) → TS claim → Python read through the retained bridges
- exact snapshot/row provenance and versions
- replay as a no-op
- two workers racing for one task
- concurrent recomputes serialized by the lock
- supersede-not-mutate with Action identity kept and vanished evidence cleared
- dismissed status surviving a refresh
- Agent-row adoption
- keyset paging, filters (including `status=dismissed`), malformed/foreign cursors and 422 filter tokens
- order versioning with a coded 409
- owner reads of summary (with `source_mix` and the staleness flip), history, detail and both exports, with their headers
- a foreign-audit 404
- a 401, and non-member 404s on every route, including `export.csv`

Pure decisions the seeded scenario never reaches (earned-page selection and
factors, site-change promotion) have focused tests in `opportunity-decisions.test.ts`.

Retired Python tests:
- 11 detector/recompute/projection modules and `test_action_grouping`: their behavior is covered by the TS PostgreSQL suite.
- `test_opportunities_api` becomes `test_actions_api`, keeping only the Action routes.
- The Action, command-center, declaration, placement and replay tests now seed the live set directly (`seed_live_set`) instead of recomputing.
- The dev seeder enqueues the refresh and waits, bounded, for the TS worker.

Deliberate departures:
- Commerce hit queries gain an `ORDER BY` for determinism.
- Citation, mention, source-page and presence reads add workspace predicates the Python loaders relied on joins for.
- Exports render whole floats as JavaScript numbers (`30`, not Python's `30.0`); rule 4, nothing parses the `.0`.
- Keyset cursors issued by the Python routes fail once with `invalid_cursor` after cutover; clients restart from the first page.
- A refresh stamps one microsecond database time (`clock_timestamp()`) on its snapshot and rows, so refreshes in the same millisecond still order by `created_at`.
- Float query parameters accept decimal notation only (no `0x10`, no `1_000`).

Spans and attributes are unchanged; the refresh adds no provider I/O. Deployment
and soak remain pending.

### PR 7a-cleanup: Remove Python emulation (before 7b)

PRs 3–6 were built under the old parity rule and carry Python emulation into
TypeScript. This PR removes it across the whole TS service before any further
owner moves. It moves no routes or kinds.

- **Delete the frozen golden corpora** in `frontend/services/api/golden/frozen/`
  (about 27k lines): `opportunity_verification`, `traffic_projections`,
  `demand_projections`, `ai_referrals_projections`, `query_classifications`,
  `aio_rates`, `source_series_assembly`, `referral_event_rows`,
  `referral_classifications`. Behavior stays covered by the existing
  PostgreSQL route and worker tests. Add a focused TS unit test only where a
  real decision would otherwise go untested.
- **Replace `src/python/`** (`text.ts` and `urlparse.ts`, about 500 lines of
  `repr`, `strip`, `casefold`, `int()` and `urlsplit` emulation, imported by
  about 35 modules) with plain TypeScript: WHATWG `URL`, `trim`, ordinary
  comparisons and zod coercion. Delete `python-text.test.ts`.
- **Cut live goldens to real contracts** (rule 4). Keep the route fragments
  (`golden/families/`), the OpenAPI gate harness, session-token interop and
  `opportunity_sources`. Keep the error envelope only as a shape contract.
  Drop pure-emulation sets (`python_int_or_zero`, error wording, correlation
  ids and the like). For each classification set (citations, mention
  positions, domains, comparisons, detectors), keep it only if Python still
  writes a value that TS compares; otherwise delete it.
- **Remove Pydantic-worded validation** in `http/params.ts` and
  `http/datetimes.ts`. Keep status, code and `loc`, but use plain messages and
  standard ISO parsing.
- **Delete the matching Python builders**: `backend/scripts/golden_masters*.py`
  down to the kept sets, and their registration in `export_ts_platform.py`.
- **Update the earlier PRs' "As implemented" notes** only where they claim
  golden coverage that no longer exists. Point to this PR.

*As implemented:* the Opportunity-port slice landed first with PR 7a (`3ab65637`);
this PR removed the rest. The generic `src/python` helpers, all ten frozen fixture sets,
seventeen non-contract live sets, their replay adapters and unused Python builders
are removed. Route fragments, the OpenAPI harness, session interop, error-envelope
shape and shared identity operations remain under live contract coverage.
No routes, task kinds, schema or policy ownership move.

Cross-stack exceptions are local to their owners: Site Health still writes
`SiteUrl.url_hash`, Python demand readers compare normalized query keys, source
inspection writes roster hashes, prompt writers compare prompt hashes, both
stacks take the project lock, and the Python Agent attaches work to the persisted
Action by its page key. Frozen measurement identities remain shared. Their live
goldens and narrow Unicode/serialization rules retire when the final Python
producer/consumer moves (the Agent retains the Action bridge after 7b; other owners in their later
assigned PRs).

Deliberate departures: ordinary URL parsing uses WHATWG URL; request dates use
ISO validation; error messages use plain language; derived metric rounding uses
JavaScript numbers; referral content hashes use JSON.stringify; stored numeric
metrics reject booleans/non-finite values; page facts use strict JSON equality;
missing crawl references remain null. Verification source revisions retain exact
microseconds instead of reproducing floating-point timestamp rounding. Request
date 422s use `date_parsing`/`date_type` instead of Pydantic's
`date_from_datetime_*` tokens. Corrupt stored values fail loudly on TS-owned reads
instead of Python truthiness: a non-null, non-object stored score (a null score
still composes AIO entities, without competitor order), non-list
`competitors_mentioned`, and non-integer session counts.
The shared URL hash/group-key owners retain only the raw path/host and query
serialization details that their active Python counterparts still compare.

Validation: `./scripts/check.ps1`, affected TS suites on disposable PostgreSQL,
and the route-ownership gate. Deployment and cutover soaks remain pending.

### PR 7b: Action routes and declarations

*As implemented:* the `actions` family is TypeScript-owned in the manifest and
all three ingress Caddyfiles. Its four routes serve persisted list/detail reads,
workflow updates and implementation declarations. The Python OpenAPI family was
frozen before retirement; no retired implementation output corpus is retained.
No schema or task-kind ownership changes.

Declarations take the shared project lock before the Action row lock, so a
refresh cannot mix member and snapshot revisions. They freeze server-owned
targets, checks, visibility baselines and placement intent atomically with the
status event. Same-key retries are checked before resolving evidence; workspace
key collisions across projects recover without writing losing status events.

Retired application modules: `api/opportunities.py`, `action_schemas.py`,
`implementation_events.py`, `measurement_legs.py`, `visibility_checks.py` and
`visibility_evidence.py` (the latter five under `domain/opportunities`). The
Python status writers, status counts, declaration DTO and placement-opening
functions are also removed. Five Python route/declaration/measurement test
modules and the three status-write tests move to TS PostgreSQL coverage;
placement inspection tests seed their declaration/check input directly.
The development seeder still runs refreshes and comparable audits, but no longer
automatically dismisses an Action through the retired Python workflow writer.
The Agent runtime test reads its retained bridge, and the Action 404-envelope
case moves from Python to the TS route test.

Retained bridges and deletion conditions:
- `actions.py` reads and attach plus `analysis/opportunities/actions.py`: the
  Agent's tool catalog and output attachment still call them; retire after the
  last Agent caller moves. Shared page-key goldens therefore remain.
- `action_status.py`: effective-status reads for the Agent, MCP and command
  center remain; no Python workflow mutation remains.
- `placement_checks.py`: the Python source-page inspector still settles and
  reschedules the TS-created check. TS owns creation, Python owns inspection.
- Opportunity queries, projections, content handoff and `OpportunityItem`
  remain for the command center, Agent and seed tooling until those callers move.

Deliberate corrections: visibility and placement baseline queries enforce
workspace/project provenance; placement baselines must also belong to the
target source page. Placement expectations include the project's primary
website among owned domains. Measurement legs select the newest observation.
The client visibility-check schema now accepts baseline/min-delta expectations
instead of requiring the unrelated absolute traffic `expected_value`.
Declaration fingerprints use normalized ISO timestamps and ordinary JSON.
Replays compare the immutable original request fields, including timestamp
equality at PostgreSQL microsecond precision, so Python-created declarations
remain replayable without Python serialization emulation. Deployment and soak
remain pending.

### Golden retirement (before PR 8)

*As implemented (28 September 2026):* rule 4 was corrected and everything the
old rule left behind was deleted:
- the eight frozen OpenAPI fragments (`golden/families/`), `--freeze-family`
  and the parity half of the route-ownership gate, which keeps the manifest,
  served-route and ingress checks;
- `golden/openapi/parity.json`, the fragment normalizer (`openapi/fragment.ts`,
  `test/openapi.test.ts`) and `scripts/openapi_fragments.py` with its test;
- the six live golden sets, their Python builders (`scripts/golden_masters*.py`),
  `test/golden.test.ts` and `test/sources-golden.ts`;
- the generated `query-casefold.json` table and the `str.split` whitespace
  emulation: identities use `toLowerCase()` and `\s+`;
- the contract-drift guard's merge of frozen fragments. It now checks only
  Python-owned families against FastAPI.

Departure: query keys, prompt-text hashes and Action query group keys now
lower-case instead of casefolding. The Python prompt-text hash and query
normalizer switched to plain `lower()` too, so both stacks agree on the simple
rule (no stored data needed preserving).

### Contract convergence (after golden retirement)

*As implemented (28 September 2026):* one contract per response. A response the
browser reads is the shared `@citeladder/contracts` schema; the route publishes
it, and `defineRoute` types each JSON handler's return value against its
response schema, so contract drift is a compile error. Server-only responses
and request bodies stay beside their route.
- `executions`, `visibility`, `ai-referrals`, `opportunities` and `actions` now
  serve the shared schemas; their TS-side duplicates and the hand-written
  response types they mirrored are deleted.
- Views narrow persisted values at the boundary: enums parse with the
  contract's own schema, JSON columns go through `db/json.ts`, and dates are
  serialized explicitly. A stored value outside the contract now fails on the
  server instead of in the browser's `strictValidate`.
- The typing exposed shipped drift, now fixed: Action timestamps and
  measurement legs were serialized from raw `Date`s, execution evidence
  carried an undeclared `cohort` (added to the contract), and several status
  fields were untyped strings.

### PR 8: Commerce and search intelligence

`domain/commerce` (except `audit_context`, which audit creation still calls),
the Tavily client, `commerce_catalog_projection` and
`commerce_competitor_discovery`. Also `domain/demand/search_intelligence`, the
synchronous DataForSEO Labs/Backlinks client (`search_intelligence_dataforseo.py`,
`dataforseo_transport.py`, money as integer minor units), the
`search_intelligence` kind, and the whole `commerce` and `search-intelligence`
route families. Recorded fixtures only.

*Owner decision (28 September 2026):* the inventory found that most of this scope
depends on code that stays Python. PR 8 therefore moves only what does not, and is
split: **8a** moves Search Intelligence, **8b** moves Commerce. A path that needs
billing/entitlements, the Site Health secure fetcher, the model gateway or the
provider-capacity pools shared with audits stays Python under its own manifest
family, as 7a did with `actions`.

Stays Python, with its reason:
- SI review creation (`POST .../search-intelligence/reviews`): it resolves
  competitor websites through `SecureFetcher` (`resolve_site`). Retagged
  `search-intelligence-reviews`.
- The `search_intelligence_acquisition` kind: it needs Fernet decryption of the
  BYOK key (planned for PR 11) and the provider-capacity locking it shares with
  audits' DataForSEO calls. The synchronous DataForSEO client stays with it.
- Commerce buyer-prompt generation (model gateway, abuse limit, prompt-slot
  occupancy) and manual buyer prompts (prompt-slot occupancy).
- Commerce competitor discovery and its kind (`SecureFetcher`, the lxml parser,
  Keenable, brand-discovery settings).
- Commerce shelf analysis and finalization, which audit terminalization calls.

*8b scope (not started):* database-only Commerce routes (catalog read and CSV
import, candidate list, discovery status and decision, buyer-prompt list and
decision, AI Shelf read) and the `commerce_catalog_projection` kind. Re-inventory
before starting.

*As implemented (8a, 28 September 2026):* the `search-intelligence` family is
TypeScript-owned in the manifest and all three ingress Caddyfiles, each path
listed explicitly so `POST .../reviews` still reaches Python. TypeScript serves
readiness, preferences, confirm, cancel, the run list and detail, dataset rows,
content handoff and citation matches (`src/search-intelligence/`). `defineRoute`
gains `authorize: 'project'`, which resolves membership from the path's project
like `require_project_member` and does not read `X-Workspace-Id`. Responses are
the shared `@citeladder/contracts/search-intelligence` schemas; only the request
bodies and the handoff response live beside the route. Error codes are
`CODE_*` constants in `core/config/search_intelligence.py`, and the new
`search_intelligence` policy section exports the price version, task kind,
transport, test status, default scope and depths, maximum depth and sort fields.
Readiness makes no network I/O; registrable domains come from `tldts` (ICANN
list) and WHATWG `URL`.

Rule 1 exception: `search_intelligence_runs` has two writers. Python creates
reviewed runs and executes queued ones; TypeScript confirms and cancels. Both
take the run row lock, and confirmation takes the project row lock first, so
one acquisition is active per project. Confirmation enqueues the Python-owned
`search_intelligence_acquisition` task (key
`analytics:search_intelligence_acquisition:{run_id}`, payload `{run_id}`) in
the same transaction that queues the run. The citation-match scope hash is the
one value both stacks' stored rows share: sha256 of
`{audit_ids, citation_ids, parent_dataset_id}` as compact JSON in that key order.

Replacement-gate inventory (paths relative to `backend/app`):

| Python module | Disposition |
| --- | --- |
| `api/search_intelligence.py` | `POST /reviews` only, tag `search-intelligence-reviews` |
| `domain/demand/search_intelligence/citations.py` | retired |
| `service.py` `confirm_review`, `cancel_run`, `update_preferences`, `content_handoff`, `_validate_confirmation` | retired |
| `domain/analytics/enqueue.py` `enqueue_search_intelligence` | retired |
| `schemas.py` handoff, citation, row and page models | retired |
| `service.py` `readiness`, `dataset_page`, `dataset_dict`, `row_dict`; `pagination.py` | bridge for `domain/mcp` until PR 13 |
| `service.py` `create_review`, `requests`, `targets`, `review_state`, `executor`, `normalization`, `dispatch_evidence` | Python-owned (review and acquisition) |

Python component tests keep review creation and the executor; they seed
confirmation and cancellation through `tests/component/search_intelligence_helpers.py`
and read published results through the retained bridges. Read, transition,
handoff, citation and authorization coverage moves to
`frontend/services/api/test/search-intelligence.test.ts`, including a
concurrent-confirmation race and concurrent citation derivation.
`contract-schema-map.ts` keeps only `searchRunSchema: 'RunResponse'`, which the
review route still publishes.

Deliberate departures:
- Timestamps serialize as ISO millisecond UTC (`toISOString`).
- Stored JSON columns, preferences and research scope are validated at read; a
  malformed stored value fails loudly instead of reading as `{}`.
- Dataset cursors are the shared keyset format; cursors issued by Python fail
  once with `invalid_cursor`.
- Handoff canonicalizes row id case, and `row_ids` echo lowercase.
- Saving preferences bumps the project's `updated_at`.
- A missing run on confirmation is `Run not found` (was `Review not found`).
- The latest run and dataset lists tie-break by id.
- Research scopes are not exported: the contract's enum is the authority.
- Citation-match rows also record the citation's `analyzer_version`, and
  owned-domain and competitor reads join the workspace-scoped project.

Spans and attributes are unchanged. Deployment and soak remain pending.

> **Stop point C.** All in-scope analytics and read-heavy product surfaces are
> TS. Python holds writes to core entities, integrations, auth and the island.

### PR 9: Projects

`domain/projects` and `api/projects`, after Prompt generation v2 completes.
Project reads still needed by the island stay under rule 2. Includes the
Postgres-backed rate-limit helper for the routes that use it.

### PR 10: Prompts and topics

`domain/prompts`, `api/prompts`, CSV import and export, and candidate review. If
prompt generation still calls models through `connectors/app_model_*`, generation
stays a Python-owned task kind and only the CRUD, review and import paths move.

### PR 11: Integrations

A Fernet-compatible TS encrypt/decrypt proven against Python ciphertext.
`domain/integrations`, `connectors/integrations` (GSC, GA4, Bing, OAuth), the
`integrations` routes, and both the `integration-dispatcher` and
`integration-worker` processes. The import worker's immutable artifacts and
resume-from-artifact behavior are tested with recorded page sequences, including
mid-run failure.

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

Move the `core/config` modules now consumed only by TS into TS config and shrink
the export. Delete Python leaves whose last caller has moved (rule 2). Remove
empty Python routers and dead registrations. Document the final Python↔TS
boundary (queue row contracts, ownership manifest) in the architecture owner.

> **Stop point D (end of this plan).** TypeScript owns the application layer.
> Python owns the Site Health, audits, billing and Agent island behind documented
> queue and route contracts. Moving that island, or transferring schema
> ownership away from Alembic, needs its own plan.

## 6. Known traps

- Values both stacks still read (lock key, prompt hash, source-page roster,
  Action page key): no generated fixture guards them; each retires with its
  last Python side. Move those callers early rather than add guards.
- Asyncio vs Node behavior under lock contention: lease tests run against real
  PostgreSQL.
- Crypto interop (JOSE in PRs 1 and 12, Fernet in PR 11, argon2 in PR 12).
- Dashboards keyed on logfire attributes going dark after a cutover.
- Compose and GCP compose drifting from the ownership manifest.
