# Commerce Suite — Implementation Handoff

> **For the next agent picking up this work.** Everything you need is in this repo —
> no external/environment context required. Read this file first, then the plan it
> points to. Branch: **`vorflux/commerce-suite`**.

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
| Design mockups | `docs/plans/commerce-suite/designs/*.html` + `design-plan.json` | Approved UI (nested sub-tabs). Pass these to any frontend build/testing agent. |
| Repo rules | `Agents.md`, `docs/invariants.md` | Always-on invariants. **Read before writing code.** |
| Source spec | `docs/plans/v4-commerce-suite-m2-m5.md` | Original milestone doc (reference only; the plan above is authoritative). |

## 3. Current state — what's DONE and committed

Branch `vorflux/commerce-suite` is **2 commits ahead of `main`** (`9b34bc7`):

1. `3336e8f` — **WS-A M2a (partial)** — Analyzer v2 + shopping-surface slot.
2. `83847f4` — **WS-B Task 1** — GA4 A1 attribution slice.

These two slices are **fully integrated and green together** on the branch.

### WS-A M2a — DONE (committed)
All production code + tests for tasks A1–A7: `config/commerce.py` (vocab, versions,
`ATTRIBUTE_DIMENSIONS`, `MERCHANT_DOMAINS`, gates, `PRODUCT_ATTRIBUTE_EVIDENCE_NAMESPACE`),
frozen `attributes` in `project_product_identity`, versioned schema delta
(`ProductResponseAnalysis.shopping_surface` + widened unique, `ProductMention.price_relation`
/`attribute_mentions`, `MerchantMention`, snapshot win/mismatch rates + widened partial
unique indexes, `ResponseAnalysis.shopping_surface`, `AuditTask.shopping_surface` + widened
`uq_audit_task_slot`, `AuditShoppingSurfaceSnapshot`), v2 pure scoring (price relation,
attribute/destination extraction, `classify_destination`, co-placement, win_rate),
v2 persistence + mixed-version aggregation, all 13 query-site filters, product projections
(`available_surfaces`, exact destination/co-placement shapes, stable `evidence_id`),
`?surface=` routes, CSV columns.

### WS-B Task 1 (GA4 A1) — DONE (committed)
Three GA4 ecommerce templates + capability gating (exactly one item template runs),
`currency_code` persisted on page payload, `Ga4DimensionCompatibilityError` narrow
fallback, `AttributionSnapshot` model, `build_a1_projection` (currency-partitioned),
`refresh_attribution_snapshot` upsert, additive dataset-aware
`enqueue_post_sync_projections` (preserves `ga4_source_medium_daily` → BOTH referral +
traffic), `api/commerce.py` `GET …/commerce/attribution` route.

## 4. What's LEFT to build

### Backend (WS-B remaining)
- **Task 2** — Shopify GraphQL OAuth + durable cursor transport. Locked: GraphQL Admin
  API `2026-07` only (no REST), offline token, `read_products`+`read_orders` only,
  shop-domain validation (`is_shopify_shop_domain`), `pageInfo{hasNextPage,endCursor}`
  resume from durable artifacts. **Sanitization runs in the WORKER, not the connector**
  (connector returns structurally-normalized RAW order nodes; worker runs
  `sanitize_order_payload` before the immutable write — preserves worker→domain import
  direction).
- **Task 3** — Shopify catalog/feed/order derivation: catalog merge
  (adopt/update/never-delete, preserve aliases + absent attributes), `FeedIssue`,
  immutable sanitized `OrderFact` revisions (per-order monotonic `resync_seq`),
  order-retention sweep. **MANDATORY:** extend `ProductResponse`/`product_to_response`
  with `connection_id`/`external_item_ref`/`last_seen_sync_run_id` (required-nullable)
  and narrow `origin` to `manual|imported|synced` — frontend strict schema needs these.
- **Task 4** — A2 links + combined snapshots + unattributed + order drill-down.
  A1/A2 cross-checks, **never summed**; per-currency `delta`; keyset cursor via shared
  `encode_keyset_cursor`/`decode_keyset_cursor` (`domain/traffic/service.py`).
- **Task 5** — `GET …/commerce/catalog-health`, `POST …/commerce/attribution/recompute`,
  `GET …/commerce/attribution/recompute/{task_id}`. Recompute allocates a fresh manual
  `resync_seq` scoped `(project_id, window)` over the project's attribution-snapshot
  **task rows** under the project row lock; dedupe-loss falls back to returning the
  pre-existing task UUID. All routes use `require_active_workspace` + `get_project(..., workspace_id)`.

### Frontend (WS-C — not started)
All of it. Tasks C1–C5 in `parts/frontend.md`. Contracts first, then the 3-tab shell
(Catalog | Visibility | **Attribution**), nested sub-tabs (Visibility:
overview/attributes/destinations/co-placement; Attribution: overview/by-source/by-product;
drill-down: mentions/attributes/destinations — local React state, reuse
`components/ui/segmented.tsx`, NOT in URL). **Follow the mockups in
`docs/plans/commerce-suite/designs/`.** Nav label Products→Commerce (href stays
`/products`). MSW/fetch-stub tests only.

### WS-A test gaps (small, mechanical)
- `tests/component/test_audit_task_slot_surface.py` — **not yet written** (see plan §8 case list).
- `tests/component/test_products_visibility_api.py` — **not yet written** (plural; mixed-version/surface cases).

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

## 6. Environment / verification constraints (this sandbox)

- **No LLM, GA4, Shopify, or OAuth credentials.** Never run a live audit/sync.
  - M2a verification: fixture answer text + persisted `RawResponseArtifact` re-scoring.
  - Connector verification: `httpx.MockTransport` via the injected
    `httpx.AsyncBaseTransport` seam (pattern: `tests/component/test_integration_ga4.py`).
  - Frontend: global-fetch stubs (`lib/api/products.test.ts`) + MSW (`test/msw-server.ts`).
- **Database:** the test suite needs a running Postgres. Docker Postgres is on port 5432
  with password `searchify_dev_password` (NOT the code-default `postgres`). The suite
  auto-creates/drops a throwaway `searchify_tests_<runid>` DB from
  `settings.database_url`. **`backend/.env` must contain**
  `DATABASE_URL=postgresql+asyncpg://postgres:searchify_dev_password@localhost:5432/searchify`
  or component tests fail with `InvalidPasswordError`. (A `.env` with this exact line
  exists in this worktree but is gitignored — recreate it if missing.)
- Start DB: `cd infra/docker && docker compose up -d db`.

## 7. Verify commands (from `backend/`)

```bash
# unit
uv run pytest tests/unit/test_product_scoring.py tests/unit/test_product_scoring_v2.py \
  tests/unit/test_product_shim.py tests/unit/test_attribution_config.py \
  tests/unit/test_attribution_snapshot.py tests/unit/test_integrations_config.py \
  tests/unit/test_analytics_config.py -q
# component (focused, both slices)
uv run pytest tests/component/test_product_analysis_worker.py \
  tests/component/test_product_visibility_api.py tests/component/test_attribution_api.py \
  tests/component/test_integration_ga4.py tests/component/test_analytics_queue.py \
  tests/component/test_post_sync_chain.py tests/component/test_analytics_snapshot.py \
  tests/component/test_audit_planner.py tests/component/test_audit_queue.py \
  tests/component/test_audit_worker.py tests/component/test_analysis_api.py \
  tests/component/test_analysis_http.py -q
# lint
uv run ruff check app/ tests/
# schema round-trip (disposable DB only)
uv run alembic upgrade head && uv run alembic downgrade base
# frontend
cd ../frontend && pnpm test && pnpm lint && pnpm check:policy && pnpm build
```

## 8. Latest verified test state on this branch

- Combined unit: **132 passed** (WS-A scoring/shim + WS-B attribution/integrations/analytics).
- Combined component (focused): **59 passed** (product analysis/visibility, attribution API,
  GA4, analytics queue/snapshot, post-sync chain, audit planner/queue).
- WS-B's own full component run: **490/490**.
- `uv run ruff check app/ tests/`: **clean** on both slices.
- Alembic `upgrade head` + `downgrade base` on a disposable DB: **success**; confirmed
  `merchant_mentions`, `attribution_snapshots`, `audit_tasks.shopping_surface` all create.

## 9. Process notes for the next agent

- Branch `vorflux/commerce-suite` is pushed to origin (tracking ref confirmed at
  `3241e37`). Keep committing on it. A **draft PR #25** tracks this branch.
- **`origin/main` advanced to `c9da2de`** (a CodeQL-comment doc change, PR #24) after
  this branch was cut. The two new commits here are disjoint from that change, so a
  rebase should be clean — but rebase `vorflux/commerce-suite` onto the current
  `origin/main` before finalizing the PR.
- A leftover local branch `wsb-workspace` (at the old base `9b34bc7`) may still exist;
  its work is already cherry-picked onto the feature branch as `83847f4`, so it is safe
  to delete (or ignore) — it is not on the remote.
- For parallel backend/frontend work, use a git worktree (a second checkout on a temp
  branch at the same commit, then cherry-pick back) — the two slices here were built that
  way and integrated cleanly.
- After implementation: run the `simplify` and `review` subagents on the diff, then the
  `testing` subagent for verification, before opening the PR. Read
  `/code/.skills/system/git-pr-workflow.md` and `pr-description.md` before the PR.
- Frontend is in scope → read `/code/.skills/system/web-preview.md` and wire the preview.
- `docs/roadmap/README.md` still needs a Commerce Suite row (per source doc line 809).
