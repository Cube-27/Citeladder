# TypeScript migration plan

Status: draft, saved 26 September 2026. Awaiting owner approval of
[section 3](#3-decisions-to-lock). Not execution authorization; each PR is
executed only when individually assigned.

## 1. Goal, scope and pace

Move CiteLadder's **application layer** from Python to TypeScript slowly, in 14
self-contained PRs ordered least risky first. This plan does not target the whole
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
- Invariant 5: pre-launch semantic versions stay `1`. A faithful port produces
  identical output (proven by golden masters) and is not a semantic change.

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
   out-of-scope island is not deleted; TS gets a golden-master-checked
   counterpart, and the Python copy's deletion condition is "last Python caller
   gone" (PR 14 or never).
3. **Revertible within the release.** Rollback is a manifest entry, a compose
   command or a kind set in config. Never a data repair.
4. **Parity gates.** The TS OpenAPI fragment equals the Python golden fragment
   before traffic moves. Deterministic ports pass golden masters generated by the
   Python code (regex, Unicode normalization, integer money, timezones, JSON
   ordering). Crypto interop is tested against Python-produced tokens and
   ciphertext.
5. **Invariants unchanged:** workspace authorization (non-member → 404), reads
   never acquire or repair, commit-before-network-I/O, distinct unknown states,
   append-only evidence. Providers use recorded fixtures only.
6. **Telemetry parity.** Span and attribute names used by dashboards survive the
   move; each cutover soaks one week comparing error rate and latency.

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

> **Stop point B.** Reads and the first worker kinds are TS; the queue is proven
> with two stacks.

### PR 5: Traffic, performance and demand projections

`domain/traffic`, the non-search-intelligence part of `domain/demand`, and the
`performance` and `demand` routes. Kinds: `traffic_snapshot_refresh`,
`performance_range_projection`, `demand_snapshot_refresh`. Golden masters on
projection output.

### PR 6: Opportunity detectors

`analysis/opportunities/*` (pure detectors) and `opportunity_verification`.
Every detector has golden-master coverage. No routes move.

### PR 7: Opportunity store, refresh and routes

`domain/opportunities`, `api/opportunities`, `opportunity_refresh`.

### PR 8: Commerce and search intelligence

`domain/commerce` (except `audit_context`, which audit creation still calls),
the Tavily client, `commerce_catalog_projection` and
`commerce_competitor_discovery`. Also `domain/demand/search_intelligence`, the
synchronous DataForSEO Labs/Backlinks client (`search_intelligence_dataforseo.py`,
`dataforseo_transport.py`, money as integer minor units), the
`search_intelligence` kind, and the whole `commerce` and `search-intelligence`
route families. Recorded fixtures only.

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

- Pydantic vs zod edge drift (optional vs nullable, coercion, enums): the
  fragment gate.
- Asyncio vs Node behavior under lock contention: lease tests run against real
  PostgreSQL.
- Crypto interop (JOSE in PRs 1 and 12, Fernet in PR 11, argon2 in PR 12).
- Dashboards keyed on logfire attributes going dark after a cutover.
- Compose and GCP compose drifting from the ownership manifest.
