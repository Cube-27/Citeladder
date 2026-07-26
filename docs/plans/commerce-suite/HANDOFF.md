# Commerce Suite — Implementation Handoff

> **For the next agent picking up this work.** Everything you need is in this repo —
> no external/environment context required. Read this file first, then the plan it
> points to. Branch: **`vorflux/commerce-suite`** (tracked by draft PR #25).

## 1. What this is

Implementation of the Commerce slice of `docs/plans/v4-commerce-suite-m2-m5.md`,
scoped to the **approved fastest-value path** and delivered as **one combined PR**.

**In scope:** M2a (Analyzer v2 + shopping-surface slot) → M5 Layer A1 (GA4
attribution) → M4 Shopify (catalog + orders) → M5 Layer A2 (order-level referrer),
plus the frontend.

**Out of scope (do NOT build):** M2b fanout, M2c probe connectors, all of M3
(Opportunities), BigCommerce, Google Merchant Center, M5 Layer C / `LiftEstimate`,
holdout-geo, checkout/feed write-back.

## 2. Authoritative documents (all in this repo)

| Doc | Path | Purpose |
|---|---|---|
| **Detailed plan** | `docs/plans/commerce-suite/v1-commerce-suite.md` | The spec. Three workstreams: WS-A (M2a backend), WS-B (M4/M5 backend), WS-C (frontend). |
| Plan overview | `docs/plans/commerce-suite/v1-commerce-suite-summary.md` | High-level summary. |
| Part plans | `docs/plans/commerce-suite/parts/{m2a,m4m5,frontend}.md` | Per-workstream detail (identical content to the unified file). |
| Exploration context | `docs/plans/commerce-suite/context-exploration.md` | Codebase inventory + locked decisions behind the plan. |
| Design mockups | `docs/plans/commerce-suite/designs/*.html` + `design-plan.json` | Approved UI layout/information architecture (nested sub-tabs). **Note:** these predate the v2 redesign that landed on main (PR #27); the shipped frontend follows the v2 design language in `docs/design.md` and uses the mockups for layout only. |
| Repo rules | `Agents.md`, `docs/invariants.md` | Always-on invariants. **Read before writing code.** |
| Source spec | `docs/plans/v4-commerce-suite-m2-m5.md` | Original milestone doc (reference only; the plan above is authoritative). |

## 3. Current state — what's DONE and committed

The branch has been **rebased onto current `origin/main`** (`6ecae2f`, which includes
the v2 frontend redesign) and carries these slices, each fully integrated and green:

1. **WS-A M2a — Analyzer v2 + shopping-surface slot** (`config/commerce.py`,
   `analysis/product_scoring.py` v2, `domain/products/visibility.py`, versioned
   schema delta, all 13 query-site filters, `?surface=` routes, CSV columns).
2. **WS-B Task 1 — GA4 A1 attribution slice** (three GA4 ecommerce templates +
   capability gating, `currency_code` on page payload, `Ga4DimensionCompatibilityError`
   narrow fallback, `AttributionSnapshot` model, `build_a1_projection`,
   `refresh_attribution_snapshot` upsert, dataset-aware `enqueue_post_sync_projections`,
   `GET …/commerce/attribution` route in `api/commerce.py`).
3. **WS-B Task 2 — Shopify GraphQL OAuth + durable cursor transport**
   (`connectors/integrations/shopify.py`, GraphQL Admin API `2026-07` only, offline
   token, `read_products`+`read_orders`, shop-domain validation, HMAC callback
   verification, `paging_mode="cursor"` with `pageCursor`/`nextPageCursor` persisted
   in artifact `query_snapshot`, `INTEGRATION_OAUTH_REFRESHABLE`).
4. **WS-B Task 3 — Shopify catalog/feed/order derivation**
   (`domain/commerce/{sanitize,catalog,feed,orders,derive}.py`, `OrderFact` +
   `FeedIssue` models, product provenance columns `connection_id`/`external_item_ref`/
   `last_seen_sync_run_id`, `ProductResponse` extended with those three
   required-nullable fields and `origin` narrowed to `manual|imported|synced`,
   order-retention sweep task kind).
5. **WS-C — Commerce workspace frontend, all of C1–C5** (strict zod contracts in
   `lib/api/schemas.ts`, new `lib/api/{commerce,attribution}.ts` transports,
   three-tab shell Catalog|Visibility|Attribution with nested sub-tabs on
   `components/ui/segmented.tsx`, catalog feed-health columns + sync polling,
   visibility v2 win-rate/price-relation/attributes/destinations/co-placement panels,
   evidence kinds + product drill-down sub-tabs, attribution A1/A2/delta/unattributed
   per-currency cards + recompute polling, nav label Products→Commerce).

`docs/roadmap/README.md` has a Commerce Suite row.

### Runtime integration caveat (read carefully)

Backend and frontend slices were verified **independently** (backend: real-DB
component tests; frontend: fetch-stub/MSW tests only — never run against a live
backend). Against the live backend on this branch:

- **Works:** product CRUD with the new provenance fields, product visibility v2
  (`?surface=`, win rate, destinations, co-placement), A1 attribution read
  (`GET …/commerce/attribution` — emits `a1` plus empty `a2`/`delta`/`unattributed`
  and `statistical.not_offered`, which the strict frontend schema parses fine).
- **404s until the pending backend tasks land:** `GET …/commerce/catalog-health`
  (Catalog tab feed-health query) and `POST/GET …/commerce/attribution/recompute*`
  (Attribution tab Recompute button) — both are WS-B Task 5; and
  `GET …/commerce/attribution/orders` (order drill-down) — WS-B Task 4.

## 4. What's LEFT to build

### Backend — WS-B Task 4: A2 links, combined snapshots, unattributed, order drill-down

Full spec: `docs/plans/commerce-suite/parts/m4m5.md` lines 279–325. In brief:

- `AttributionLink` model (`models/attribution.py`): workspace/project FKs CASCADE;
  same-workspace composite FK to `order_facts`; `method`, `confidence`,
  `matched_rule_id`, `rule_version`, `analyzer_version`, `evidence_refs`,
  `revenue_amount`, `currency`; `UNIQUE(order_fact_id, matched_rule_id, rule_version)`
  named `uq_attribution_link_order_rule_version`. Register in `models/__init__.py`.
  No Alembic revision (greenfield).
- `ANALYTICS_TASK_KIND_ATTRIBUTION_LINK = "attribution_link"`; register
  `run_attribution_link` + the order-retention executor in
  `workers/analytics_worker.py::EXECUTORS`.
- `enqueue_attribution_link(...)` with rule/analyzer versions in the idempotency key;
  Shopify **order** artifacts enqueue one link task per sync run via
  `enqueue_post_sync_projections` (catalog artifacts enqueue none); link completion
  enqueues the attribution snapshot refresh.
- `domain/attribution/link.py`: classify sanitized `attribution_keys` via
  `classify_referral_signals`; match → `method=order_referrer` link; no match → no
  link. `run_attribution_link` reads only latest facts, `ON CONFLICT DO NOTHING`,
  enqueues the window snapshot in the same commit.
- Extend `domain/attribution/snapshot.py`: `metrics.deterministic.a2` as separate
  ISO-currency partitions by AI source/surface/product (no conversion rate for A2),
  explicit coverage block, `unattributed` partitions, per-currency `delta` rows
  (never summed, never cross-currency), exact provenance id arrays on every upsert.
- Schemas/service/route: strict DTOs incl. `AttributionOrderRow` (never exposes
  `order_ref_hash`/raw payload), `AttributionOrdersPage(items, next_cursor)` with the
  shared keyset cursor helpers from `domain/traffic/service.py` (bind all filters,
  400 on tamper); `GET /projects/{project_id}/commerce/attribution/orders`.
- Tests: `unit/test_attribution_link.py`; complete `component/test_attribution_api.py`
  (A1-only/A2-only/both, no summed total, comparable + unavailable deltas,
  per-currency, fallback label, coverage, unattributed share, statistical
  `not_offered`, latest refund revision, safe order DTO, cursor tamper → 400,
  cross-workspace 404); update `test_analytics_queue.py`, `test_post_sync_chain.py`,
  `test_integration_{ga4,shopify}.py`, `test_analytics_snapshot.py`,
  `unit/test_analytics_config.py` for the new chain/counts.

### Backend — WS-B Task 5: catalog-health + attribution-recompute routes

Full spec: `docs/plans/commerce-suite/parts/m4m5.md` lines 327–350. In brief:

- `domain/commerce/schemas.py` + `get_catalog_health(...)` in
  `domain/commerce/service.py`: persisted-only projection (bound connections via
  `IntegrationPropertyMapping`, latest `IntegrationSyncRun` per connection, per-product
  health from latest `FeedIssue` + `Product.last_seen_sync_run_id`; match by
  `product_id`, never name). DTO must match the frontend `commerceCatalogHealthSchema`
  exactly (see `frontend/lib/api/schemas.ts` and the plan). Synced product with no
  feed row → `status=unavailable`; unbound product absent.
- `GET /projects/{project_id}/commerce/catalog-health`.
- `enqueue_attribution_recompute(...)`: manual revision scoped
  `(project_id, window_start, window_end)` = `COALESCE(MAX(resync_seq),-1)+1` over the
  project's persisted attribution-snapshot **task rows** (not `IntegrationSyncRun`,
  not the snapshot row), allocated under the project row lock in the same transaction;
  idempotency-race loss → return the pre-existing task UUID (endpoint always returns
  a pollable task id). Recompute = rebuild from persisted rows, never a provider call.
- `POST /projects/{project_id}/commerce/attribution/recompute` (optional `{from,to}`,
  default = latest synced window) and `GET …/recompute/{task_id}` (queue status
  vocabulary `queued|leased|running|retry_wait|succeeded|failed|cancelled`;
  cross-workspace → 404; NO generic `/analytics-tasks/{id}` route).
- All routes use `require_active_workspace` + `get_project(..., workspace_id)`.
- Tests: `component/test_commerce_catalog_health_api.py`; recompute cases in
  `component/test_attribution_api.py`.

### WS-A test gaps (small, mechanical; case lists are exact)

- `backend/tests/component/test_audit_task_slot_surface.py` — case list:
  `docs/plans/commerce-suite/parts/m2a.md` lines 448–455.
- `backend/tests/component/test_products_visibility_api.py` (PLURAL, new file — the
  singular M1 file exists; do not modify it) — case list:
  `docs/plans/commerce-suite/parts/m2a.md` lines 438–446.

### Finalization steps (after the code above lands)

- Full backend verify (§7) + frontend `pnpm test && pnpm lint && pnpm check:policy && pnpm build`.
- Run code-review/refactor passes over the whole diff and an end-to-end verification
  pass (seeded/fixture-backed only — no live provider credentials exist).
- Then mark draft PR #25 ready for review.

## 5. Locked decisions (do not re-litigate)

1. Fastest-value path: M2a → A1 → Shopify orders → A2. Single combined PR.
2. Shopify = GraphQL Admin API `2026-07`, no REST.
3. Mixed currency **partitioned by ISO code** — never convert, never sum (no FX source).
4. GA4 granularity fallback persisted per-connection; labels `session_source_medium` → `default_channel_group`.
5. Attribute seed catalog: `DEFAULT` + `footwear`/`outerwear`/`accessories`.
6. All new flat routes use `require_active_workspace` (NOT `require_workspace_member`).
7. Commerce-health/recompute routes are project-scoped; **no** generic `/analytics-tasks/{id}` route.
8. Surface discovery via `available_surfaces` on the product visibility projection.
9. A1/A2 are cross-checks, never summed; backend projects the `A1 − A2` delta.
10. Greenfield: **edit ORM models, recreate the DB** — do NOT add Alembic revision files.

## 6. Environment / verification constraints

- **No LLM, GA4, Shopify, or OAuth credentials.** Never run a live audit/sync.
  - M2a verification: fixture answer text + persisted `RawResponseArtifact` re-scoring.
  - Connector verification: `httpx.MockTransport` via the injected
    `httpx.AsyncBaseTransport` seam (pattern: `tests/component/test_integration_ga4.py`,
    `tests/component/test_integration_shopify.py`).
  - Frontend: global-fetch stubs (`lib/api/products.test.ts`) + MSW (`test/msw-server.ts`).
- **Database:** the test suite needs a running Postgres. Docker Postgres is on port 5432
  with password `searchify_dev_password` (NOT the code-default `postgres`). The suite
  auto-creates/drops a throwaway `searchify_tests_<runid>` DB from
  `settings.database_url`. **`backend/.env` must contain**
  `DATABASE_URL=postgresql+asyncpg://postgres:searchify_dev_password@localhost:5432/searchify`
  or component tests fail with `InvalidPasswordError`. (A `.env` with this exact line
  exists in this worktree but is gitignored — recreate it if missing.)
- Start DB: `cd infra/docker && docker compose up -d db`.
- `uv` may not be on PATH: `export PATH="$HOME/.local/bin:$PATH"` first.

## 7. Verify commands (from `backend/`)

```bash
# unit
uv run pytest tests/unit/test_product_scoring.py tests/unit/test_product_scoring_v2.py \
  tests/unit/test_product_shim.py tests/unit/test_attribution_config.py \
  tests/unit/test_attribution_snapshot.py tests/unit/test_integrations_config.py \
  tests/unit/test_analytics_config.py tests/unit/test_integrations_oauth.py \
  tests/unit/test_order_sanitize.py tests/unit/test_feed_validators.py \
  tests/unit/test_product_schemas.py -q
# component (focused)
uv run pytest tests/component/test_product_analysis_worker.py \
  tests/component/test_product_visibility_api.py tests/component/test_attribution_api.py \
  tests/component/test_integration_ga4.py tests/component/test_integration_shopify.py \
  tests/component/test_catalog_sync_merge.py tests/component/test_order_resync_seq.py \
  tests/component/test_integrations_oauth_api.py tests/component/test_products_api.py \
  tests/component/test_analytics_queue.py tests/component/test_post_sync_chain.py \
  tests/component/test_analytics_snapshot.py tests/component/test_audit_planner.py \
  tests/component/test_audit_queue.py tests/component/test_audit_worker.py \
  tests/component/test_analysis_api.py tests/component/test_analysis_http.py \
  tests/component/test_health.py -q
# full backend suite is affordable and recommended before finalizing:
uv run pytest tests/unit tests/component -q
# lint
uv run ruff check app/ tests/
# schema round-trip (disposable DB only)
uv run alembic upgrade head && uv run alembic downgrade base
# frontend
cd ../frontend && pnpm test && pnpm lint && pnpm check:policy && pnpm build
```

## 8. Latest verified test state on this branch

- Backend full suite: **1538 passed** (`tests/unit` + `tests/component`) at the
  WS-B Tasks 2–3 commit; post-merge smoke (`test_health.py`, ruff) green.
- Frontend: **975 passed / 6 skipped** across 102 files; `pnpm lint`,
  `pnpm check:policy`, and `pnpm build` all clean (verified on the WS-C commit;
  content is byte-identical after the merge).
- Alembic `upgrade head` → `downgrade base` → `upgrade head` on a disposable DB:
  clean; confirmed `merchant_mentions`, `attribution_snapshots`, `order_facts`,
  `feed_issues`, `audit_tasks.shopping_surface` all create.
- Known pre-existing issue (not from this branch): one lint warning in
  `frontend/components/onboarding/onboarding-screen.tsx`.

## 9. Process notes for the next agent

- Branch `vorflux/commerce-suite` is pushed to origin and tracked by **draft PR #25**
  (its title/body describe the current done/pending split — keep them updated; do not
  open a second PR). The branch was rebased onto `6ecae2f`; if you rewrite history
  again, force-push with lease.
- The PR base is current main as of the rebase; if main advances, rebase again before
  finalizing.
- Two stale local-only branches (`vorflux/commerce-suite-frontend`,
  `vorflux/commerce-suite-wsa-tests`) may exist in this worktree; their useful work is
  already merged (frontend) or empty (wsa-tests), so they are safe to delete or ignore.
  They are not on the remote.
- For parallel backend/frontend work, use a git worktree (a second checkout on a temp
  branch at the same commit, then merge back) — the slices here were built that way
  and integrated cleanly.
