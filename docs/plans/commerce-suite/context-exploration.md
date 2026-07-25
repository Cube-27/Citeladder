# Exploration findings — Searchify Commerce Suite (shared context for plan/design/build agents)

Repo: `/code/abhij1306/Searchify`, branch `main`, clean. Source plan doc:
`docs/plans/v4-commerce-suite-m2-m5.md` (read it — this file only records what the
codebase actually looks like today, plus decisions already taken).

## Approved scope (user decisions, 2026-07-25)

- **Scope = the doc's "fastest path to user-visible value" (§1):** M2a → M5 Layer A1 →
  M4 Shopify (catalog + orders) → M5 Layer A2, plus the frontend for exactly those.
  **Out of scope for this pass:** M2b (shopping-intent fanout), M2c probe connectors,
  all of M3 (Opportunities engine), BigCommerce, GMC, M5 Layer C (lift).
  M2a still lands the `AuditTask.shopping_surface` column + widened slot constraint
  (the doc requires the constraint change to land on the quiet path while probes stay
  disabled), and the config gate for surfaces — but **no probe connectors**.
- **`ATTRIBUTE_DIMENSIONS` seed categories:** `footwear`, `outerwear`, `accessories`,
  plus a `DEFAULT` set (price, warranty, shipping, returns, materials, sizing). Chosen to
  match the existing demo catalog in `/memory/testing/Searchify/seed_data.py:454-476`.
- **Delivery:** single combined PR on one branch.

## §16 build-time verifications — resolved

1. **Nested `Offer` / `AggregateRating` inside `Product` (§8.2) — NOT a risk.**
   `_iter_jsonld_objects` (`backend/app/analysis/site_health/structured_data.py:51-68`)
   recurses into every nested dict/list to depth 12 and yields each node;
   `_validate_object` (`:80-100`) records any node whose `@type` is a key of
   `STRUCTURED_DATA_REQUIRED_PROPERTIES`. So nested Offer/AggregateRating WILL be
   extracted once those types are added to the config map. Two real caveats: only
   objects with an explicit `@type` are recognized (a bare nested `offers` dict without
   `@type` is invisible), and total facts are capped by
   `site_health settings.max_structured_data_blocks` (default 100,
   `config/site_health.py:767`). *This mattered only to M3, which is out of scope now —
   recorded so the M3 plan does not re-derive it.*
2. **Attribute-dimension seed catalog (§5.3) — blocked by a real gap.**
   `project_product_identity` (`backend/app/domain/products/shim.py:42-63`) serializes own
   products only through `url` and **drops `Product.attributes` entirely**. So the frozen
   `Audit.configuration` carries no `category`, and `ProductScoringConfig.from_project`
   cannot see it. M2a must widen the frozen own-product identity to include the
   completeness attribute bag (or at least `category`) BEFORE category-keyed dimensions
   can work. This changes `Audit.configuration` shape and breaks
   `backend/tests/unit/test_product_shim.py`.
3. **GA4 `itemId × sessionSource` (§10.1) — cannot verify in this sandbox** (no GA4
   credentials). The connector imposes no local compatibility matrix: `_resolve_template`
   (`backend/app/connectors/integrations/ga4.py:96-114`) matches a template purely by exact
   dimension tuple and sends whatever config declares, so an incompatible combination
   surfaces as a provider HTTP error at runtime. The fallback template
   (`itemId × sessionDefaultChannelGroup`) and the DTO granularity label must therefore be
   built up-front, not added reactively.
4. **Shopify order referrer coverage (§10.2) — cannot verify** (no Shopify shop). Treat
   Layer A2 coverage as unknown; the DTO must state coverage explicitly rather than imply
   completeness.

## Environment constraints (from /memory/testing/Searchify/)

- **No LLM provider credentials** (`known-issues.md`): any audit run through the real
  pipeline fails with `auth_failure`/`parse_error`. All M2a verification must go through
  seeded/persisted `RawResponseArtifact` rows and re-scoring, or unit-level scoring of
  fixture answer text — **not** live audit runs.
- No GA4 / Shopify / OAuth credentials either; M4 and M5 connector paths must be verified
  with the existing injected-`httpx.AsyncBaseTransport` test seam pattern
  (see `tests/component/test_integration_ga4.py`).
- Full stack bring-up playbook: `/memory/testing/Searchify/setup-instructions.md`;
  idempotent seed: `seed.sh` + `seed_data.py`. `_seed_site_health()` has an early-return
  "already seeded" guard, so seed changes need a fresh DB.

## M1 product slice — what exists (backend/app)

| Concern | Location | Notes |
|---|---|---|
| `Product` | `models/product.py:44-89` | `uq_product_project_sku`; `attributes` JSONB; `origin` from `PRODUCT_ORIGINS` |
| `CompetitorProduct` | `models/product.py:91-138` | identity + price only, no attributes/variants |
| `ProductResponseAnalysis` | `models/product.py:140-209` | `uq_product_response_analysis_task` (one per execution) |
| `ProductMention` | `models/product.py:211-276` | no unique constraint, no CHECK on exactly-one-target (catalog delete SET NULLs) |
| `ProductMetricSnapshot` | `models/product.py:278-351` | two partial unique indexes, `uq_product_metric_snapshot_product` (`product_id IS NOT NULL`) and `uq_product_metric_snapshot_competitor_product` |
| Config | `core/config/products.py` (91 lines) | module-level `Final` constants only, no dataclasses. `PRODUCT_ANALYZER_VERSION="product-analysis-1"`, `PRODUCT_SCORING_RULE_VERSION="product-scoring-v1"` |
| Scorer | `analysis/product_scoring.py` | frozen dataclasses `ProductEntry`/`CompetitorProductEntry`/`ProductScoringConfig` |
| Persistence | `analysis/product_service.py` | `analyze_task_products` (:101), `finalize_audit_product_analysis` (:217); neither commits — caller owns commit |
| Freeze | `domain/products/shim.py:36-80` | `project_product_identity`; **drops `attributes`** |
| Projections | `domain/products/visibility.py` | `get_product_visibility` (:68), `get_product_evidence` (:162), `product_visibility_csv` (:297) |
| DTOs | `domain/products/schemas.py:176-248` | `ProductVisibilityEntry`, `CompetitorProductVisibilityEntry`, `ProductVisibilityResponse`, `ProductEvidenceItem/Response` |
| API | `api/products.py` | uses `require_active_workspace` (not `require_workspace_member`); visibility routes at :341-425 |

Key scorer details M2a must reuse:
- `extract_price_mentions(text, offset, window=PRODUCT_PRICE_WINDOW_CHARS)`
  (`product_scoring.py:209`): centers a character window on the **original-text** offset,
  then **clips to the line containing the mention** (`text.rfind("\n",0,offset)+1` …
  `text.find("\n",offset)`) so a neighbouring list item's value is never attributed to this
  product. Returns `{"text","value","currency","offset"}` sorted by offset with overlap
  suppression. **This is the exact pattern attribute extraction must copy.**
- `price_matches_catalog(...)` (`:266`) returns `None` when the catalog price is absent OR
  both currencies exist and differ; else `abs(diff) <= max(price*pct, abs)+1e-9`.
  → `price_relation` must return `None` in exactly the same two cases.
- `detect_product_rank(answer_text, match_offset)` (`:354`) recognizes numbered / bullet /
  markdown-table enumerations and returns a 1-based ordinal, `None` for prose. Note
  `_entry_signals` (`:409-446`) computes `first_offset` from *normalized* text but rank from
  an *original-text* offset via `_original_text_offset` — attribute extraction must use the
  original-text offset too.
- `aggregate_product_run` (`:511`) returns an entry for every frozen catalog item including
  zero-filled unmentioned ones; `price_accuracy_rate` denominator excludes unverifiable
  (`None`) mentions; `_rate` rounds to 4dp.
- `finalize_audit_product_analysis` keys existing snapshots by frozen
  `metrics["entry_id"]` falling back to live FK ids (`product_service.py:272-290`), and
  writes exact `source_analysis_ids` / `source_artifact_ids`.
- Worker hook: `workers/audit_worker.py:734-739` runs the product sibling pass right after
  the brand pass; single commit at `:725-759`. Finalization locks the audit row
  `with_for_update=True` at `:972-983` (product finalize first, then brand, one commit).

Reusables for §5.4: `OwnedDomain` at `models/brand.py:234`; `domain_matches(candidate,target)`
at `analysis/normalization.py:86-95` (true iff `candidate == target or
candidate.endswith("."+target)` after `normalize_domain` → `notamazon.com` never matches
`amazon.com`); URL sanitizer `sanitize_referral_url` at
`domain/analytics/sanitize.py:46-76` (drops fragments + credentials, allowlists query
params via `REFERRAL_URL_PARAM_ALLOWLIST`).

## §7.1 slot-change blast radius — concrete call sites

`AuditTask` model `models/audit.py:219-330`. Constraints at `:230-240`:
`uq_audit_task_idempotency_key` (unique `idempotency_key`) and `uq_audit_task_slot`
`(audit_id, prompt_index, repetition, logical_engine)`.

Idempotency key is built in ONE place — `domain/audits/planner.py:386`:
`f"{audit.id}:{prompt_index}:{repetition}:{engine}"` → must gain the surface segment.
Slot enumeration at `planner.py:372-381`; the single `AuditTask(...)` construction at
`:383-411`; count guard `total = len(prompts)*len(engine_list)*reps` at `:279-285`;
frozen `configuration` dict built at `:303-327` (this is where `shopping_surfaces[]` goes).

### Needs a measurement-only (`shopping_surface == ""`) filter — 7 sites

| # | Site | Why |
|---|---|---|
| 1 | `workers/audit_worker.py:915-923` remaining non-terminal count | progress/completion |
| 2 | `workers/audit_worker.py:924-929` succeeded count → `audit.completed_count` | progress |
| 3 | `workers/audit_worker.py:930-934` total count → `failed_count = total - succeeded` | progress |
| 4 | `analysis/service.py:232-235` provider-metadata map over all audit tasks | brand aggregation input |
| 5 | `analysis/service.py:277-280` defensive succeeded-task brand analyze pass | **would recreate brand rows the worker skipped** |
| 6 | `domain/analysis/service.py:245-268` brand evidence join on `AuditTask` | brand evidence projection |
| 7 | `domain/analysis/service.py:391-410` export task list | export default |

Plus `domain/audits/planner.py:488-497` `list_tasks` (executions listing) — needs a
surface parameter defaulting to measurement-only. Note the listing endpoint is
`api/audits.py:131-141` (`GET /audits/{audit_id}/executions`), **not** `api/executions.py`
(which only serves one execution's evidence at `:29-45`).

Brand per-engine denominators are actually built from `ResponseAnalysis`, not `AuditTask`
(`analysis/service.py:192-197` load, `:239-254` `per_engine.setdefault(...)`). Filtering
`AuditTask` alone is insufficient — either add `shopping_surface` to `ResponseAnalysis`
and filter it, or guarantee no probe task can ever produce a `ResponseAnalysis`.
`MetricSnapshot` write is at `analysis/service.py:299-321`.

### Must NOT be filtered — 6 sites

`orchestration/postgres_task_queue.py:101-124` (claim), `:142/153/167/216/240/256`
(single-row transitions), `:290-300` (lease sweeper); `workers/audit_worker.py:367-370`,
`:448-453`, `:598-610` (load/lock by id); `planner.py:524-535` (whole-audit cancel).
`analysis/product_service.py:232-243` (product succeeded-task pass) must **not** be
filtered — it should process probe tasks too and slice by surface later.
`domain/products/visibility.py:207-228` product evidence join needs a `?surface=` filter,
not a hard measurement-only filter.

### Brand skip location

`workers/audit_worker.py:725-733` — the `build_scoring_config` + `analyze_task` call. Skip
when `task.shopping_surface != ""`. The product pass at `:734-739` stays outside the skip.

### Engine snapshot

`AuditEngineSnapshot` `models/audit.py:178-216`, unique `(audit_id, logical_engine)` at
`:186-190`. Written only at `planner.py:357-370`; read at `planner.py:455-457`/`:476-479`
(`selectinload`) and `audit_worker.py:453-465` (`session.get` by
`task.engine_snapshot_id`). DTO `AuditEngineSnapshotResponse`
`domain/audits/schemas.py:64-70`, exposed on `AuditResponse` at `:72-92`.
Do **not** widen it — add a sibling keyed `(audit_id, shopping_surface)`.

`AuditTaskResponse` (`domain/audits/schemas.py:39-62`) has no `shopping_surface` field.

### Tests that will break

`tests/component/test_audit_planner.py:68-71` asserts the exact idempotency-key string;
`:93-130` asserts the `(prompt_index, repetition, logical_engine)` slot tuple and shuffle
determinism. `tests/component/test_audit_worker.py` (whole file) assumes every succeeded
task yields a brand analysis and feeds the single brand `MetricSnapshot`. Also touched:
`test_audit_queue.py`, `test_analysis_api.py`, `test_analysis_http.py`,
`test_product_analysis_worker.py`, `test_product_visibility_api.py`,
`tests/component/analytics_helpers.py`, `tests/unit/test_product_shim.py`.

## Integrations framework (M4)

Config `core/config/integrations.py`: providers/transports at `:35-56`
(`{"gsc","ga4","bing"}`, `{"google_oauth","microsoft_oauth"}`); integration OAuth
authorize/token/revoke URLs + **scopes** at `:58-102` (NOT in `config/oauth.py`, which is
user sign-in only); `IntegrationDatasetTemplate` frozen dataclass at `:297-311`
(`dataset, provider, api_method, dimensions, metrics`); `INTEGRATION_DATASET_TEMPLATES` from
`:316`; `pack_dimension_key`/`unpack_dimension_key` at `:382-389`/`:557-577`;
`INTEGRATION_CLIENT_BUILDERS` at `:519-554`; `INTEGRATION_QUEUE_SPEC` at `:507-516`;
`sync_cadence_seconds` at `:403-410`. `_GA4_SESSION_METRICS` at `:289-290`.

Models `models/integrations.py`: the grant class is actually named **`IntegrationOAuthGrant`**
(`:88-139`, unique `(workspace_id, transport)`, Fernet ciphertext columns) — the plan doc
calls it `IntegrationGrant`. `IntegrationConnection` `:142-191` (unique `(grant_id,
provider)`, `account_ref` holds the provider property/shop identity).
`IntegrationSyncRun` `:194-301` — unique `(connection_id, sync_kind, window_start,
window_end, resync_seq)` at `:218-227`, plus a partial index allowing one active run per
window at `:236-246`; full queue/lease columns. `IntegrationImportArtifact` `:304-363`
(immutable, page-granular, `payload_hash`, `query_snapshot` credential-free).
`IntegrationPropertyMapping` `:365-419` — partial unique active owner for
`(workspace_id, provider, property_ref)`; **project binding resolves here, never from
client input** (`domain/integrations/derive.py:85-117` fails rather than guessing).
`IntegrationMetricRow` `:422-489` — identity includes `resync_seq` at `:433-447`.

`resync_seq` allocation: `domain/integrations/sync.py:181-222` locks the connection
`FOR UPDATE` then takes `coalesce(max(resync_seq),-1)+1`.
**Latest-revision read pattern to copy verbatim** —
`domain/analytics/ingest.py:206-235` builds a `NOT EXISTS` over an aliased
`IntegrationMetricRow` with `newer.resync_seq > outer.resync_seq`;
`domain/traffic/projection.py:202-227` is the in-memory equivalent.

Connector seam: worker protocol `workers/integration_worker.py:106-136` — every connector
exposes `async query_search_analytics(*, access_token, property_ref, dimensions,
start_date, end_date, start_row) -> page` where page has `payload`, `rows`,
`raw_row_count`. Smallest reference connector: `connectors/integrations/gsc.py:57-174`
(`GscQueryPage` frozen dataclass, injected `httpx.AsyncBaseTransport`, `RequestPacer`,
config-owned endpoints + approved-host validation, `build_gsc_client`). GA4:
`connectors/integrations/ga4.py:78-94`, `:170-289`, `_resolve_template` `:96-114`,
request body `:202-220`. Unregistered provider fails terminally at
`integration_worker.py:377-381`.

Worker: claim → `mark_running` before I/O (`:228-245`) → heartbeat (`:336-337`, impl
`:788-805`) → page each dataset writing immutable artifacts (`:527-562`) → derive +
enqueue post-sync projections (`:708-786`); lease-loss guards `_still_owned` `:602-609`,
`_claim_run_if_owned` `:611-628`. Derivation lives in `domain/integrations/derive.py`
(`:132-181` row build, `:184-237` run derivation, `ON CONFLICT DO NOTHING`). Cadence
dispatcher `workers/integration_dispatcher.py:107-125` (all connected grants),
`:168-200` (trailing window + late-data revision window), `_try_enqueue` `:133-166`.

OAuth: routes `api/integrations.py:118-140` (start) / `:143-179` (callback); domain flow
`domain/integrations/service.py:107-153` (start) and `:156-356` (callback: state consumed
atomically before exchange, one grant per workspace/transport, tokens encrypted at
`:327-338`, all logical providers for the transport attached at `:262-292`). Generic OAuth
client `connectors/integrations/oauth.py:119-138` validates any configured transport but
`:64-78` only has Google/Microsoft credential branches — **`shopify_oauth` needs a new
credential branch + settings fields**, and Shopify's per-shop authorize host means the
host allowlist / URL builder must accept a shop-scoped domain. Fernet primitive
`core/security.py:161-176`. No token appears in any DTO (`domain/integrations/schemas.py`).

## Analytics / attribution machinery (M5)

`classify_referral_signals(referrer_host, utm_source, utm_medium, user_agent) -> RuleMatch | None`
at `domain/analytics/classification.py:113-118`; `RuleMatch` frozen dataclass `:33-49`
(`ai_source, logical_engine, matched_rule_id, match_signal, confidence`); priority
referrer → UTM → user-agent (`:119-130`); unmatched returns `None` and callers write
`ai_source="other"`.

Sanitize: `domain/analytics/sanitize.py` — `sanitize_referral_url` `:46-76`,
`user_agent_family_token` `:79-90`, `hash_session_id` `:93-110`, `sanitize_raw_payload`
`:113-130`, `sanitize_referral` `:145-162`, `SanitizedReferral` `:133-142`.
**D5 confirmed:** `domain/analytics/ingest.py:116-121` passes `session_id=None`, so every
`ReferralEvent.session_id_hash` is empty — no session join is possible.

Snapshot upsert to mirror: `domain/analytics/snapshot.py:689-737` `_upsert_snapshot`
(`on_conflict_do_update` on `[project_id, window_start, window_end, granularity]`);
executor entry `refresh_analytics_snapshot` at `:740`. Traffic equivalent
`domain/traffic/service.py:161-213`. `TrafficSnapshot` model `models/traffic.py:64-126`
(unique tuple `:76-85`, provenance id lists + `formula_version`/`normalization_version`).
`ReferralEvent` `models/analytics.py:152-244` (unique `(import_id, content_hash)` `:174-179`,
`sanitize_version` `:237-240`) — the model to mirror for `OrderFact`'s
sanitize-before-immutable-write contract.

Config `core/config/analytics.py`: `AI_REFERRAL_RULE_VERSION` `:46-54`, `AI_SOURCES`
`:56-75`, source→logical-engine `:77-84`, `CONFIDENCE_EXACT/HEURISTIC/BUCKETS` `:86-103`,
`AI_REFERRAL_HOST_RULES` `:157-168`, UTM rules `:170-209`, UA rules `:211-216`,
granularities `:218-240`, allowlists + retention `:242-275`, task kinds `:277-296`.

Worker dispatch to extend — `workers/analytics_worker.py:74-90`:
`type AnalyticsExecutor = Callable[[async_sessionmaker[AsyncSession], AnalyticsTask], Awaitable[None]]`
and the `EXECUTORS: dict[str, AnalyticsExecutor]` mapping five kind constants to
executors. Add `attribution_link` / `attribution_snapshot` beside
`ANALYTICS_TASK_KIND_CLASSIFY_REFERRALS`.

Content handoff (M3 only, out of scope): `POST /content/generations`
`api/content.py:84-122`, body schema `domain/content/schemas.py:23-47`
(`project_id, prompt, output_type, website_context_enabled`), accepts `Idempotency-Key`.

## Frontend (frontend/)

- `/products` route: `app/(app)/products/page.tsx`, drill-down
  `app/(app)/products/[productId]/page.tsx`. Workspace container
  `components/products/products-screen.tsx:27-60`; tab state
  `lib/products/use-products-screen.ts:27-47` (`router.replace` with `?tab=`);
  tab ids `lib/products/catalog.ts:16-31` (`'catalog' | 'visibility'`, default catalog);
  WAI-ARIA tablist `components/products/products-tabs.tsx` (roving tabIndex, arrows/Home/End,
  only active panel rendered, reuses `components/ui/segmented.tsx`).
  Panels: `catalog-panel.tsx`, `catalog-table.tsx`, `product-visibility-panel.tsx:51-185`
  (local filter row: run selector + `engine-filter-dropdown.tsx` + CSV export),
  `product-evidence-table.tsx:40-195`.
- Four-tab reference: `components/visibility/visibility-dashboard.tsx:22-133`,
  `visibility-tabs.tsx:12-121`, shared filter bar `visibility-toolbar.tsx:48-281`,
  per-tab query enablement `lib/visibility/use-visibility-dashboard.ts:209-282`.
- Primitives: `ui/table.tsx`, `ui/table-pagination.tsx` (+`useTablePage`), `ui/badge.tsx` +
  `ui/badge-variants.ts` (families status / classification / run-status / sentiment /
  neutral; always text, never colour-only), `ui/card.tsx`, `ui/skeleton.tsx`, `ui/alert.tsx`,
  `visibility/empty-state.tsx`, `visibility/evidence-states.tsx`, `ui/trend-chart.tsx`
  (`TrendChart`/`MultiTrendChart`, nulls are true gaps with "unavailable" ARIA, never 0),
  `ui/donut.tsx`, `ui/sparkline.tsx`, `ui/score-ring.tsx`, `ui/series-palette.ts`.
- Contracts: `lib/api/products.ts` (every response through
  `strictValidate(schema, res, 'context')`; `withQuery`/`definedQuery` for optional params);
  schemas `lib/api/schemas.ts:1605-1717` (all `.strict()`, UUID ids), `strictValidate`
  `:1723-1734`. Query keys `lib/api/query-keys/products.ts:1-20` re-exported from
  `lib/api/query-keys.ts:1-48`. Client `lib/api/client.ts` — `API_BASE_URL = '/api/v1'`
  (relative only), adds `X-Request-ID` / `Idempotency-Key` / `X-Workspace-Id`, retries GETs
  only. Rewrites `next.config.ts:20-38` (`/api/:path*` → server-only `BACKEND_ORIGIN`).
  Query client policy `lib/api/query-client.ts:13-33` (staleTime 15s, ≤2 retries).
  Polling pattern `lib/visibility/use-visibility-dashboard.ts:100-119` +
  `lib/runs/status.ts:39-43` (`ACTIVE_RUN_POLL_MS = 3000`, conditional on status).
- Nav: `components/layout/nav-items.ts:35` is the single "Products" label (route stays
  `/products`).
- Tests: `vitest.config.ts` (jsdom, setup `test/setup.ts`), `test/render.tsx`
  `renderWithProviders`, `test/msw-server.ts` shared `mswServer` (handlers per test).
  Existing: `lib/api/products.test.ts` (global-fetch stubs),
  `components/products/products-screen.test.tsx`, `product-visibility-panel.test.tsx`,
  `catalog-table.test.tsx`.
- Null convention: `—` everywhere (`lib/products/catalog.ts:43-65` `formatPrice`/
  `formatPercent`/`formatAvgRank`, `product-evidence-table.tsx:157-185`,
  `lib/runs/status.ts:124-135`). Never render `0` for a null metric. There is **no existing
  "statistical" UI treatment** — M5 must introduce one explicitly.
