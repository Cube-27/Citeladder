# Commerce workspace frontend

## Product specification

### Goals and success criteria

Grow `/products` into one Commerce workspace with three URL-addressable tabs: Catalog, Visibility, and Attribution. Keep the existing route and product drill-down, consume persisted projections only, and preserve null as unavailable (`—`) rather than coercing it to zero.

Success means:

- Catalog labels manual/imported/synced origin, shows feed health per SKU, and shows the bound Shopify connection’s current or latest sync state.
- Visibility adds win rate, v2 price direction, attribute frequency, buyer destinations, competitor co-placement, and engine × surface slicing.
- Mixed-version evidence never infers direction from v1 data; a v1 mismatch reads `Direction unavailable`.
- `/products/[productId]` displays product mentions, attribute mentions, and sanitized buyer destinations in the existing bounded evidence explorer.
- Attribution compares A1 and A2 without summing them, shows `A1 − A2`, unattributed orders/share, source and SKU metrics, and the GA4 fallback state.
- Navigation says Commerce while the href remains `/products`.

### Users and workflow

Commerce operators use Catalog to inspect catalog/feed state, Visibility to inspect AI answer evidence, and Attribution to compare platform-attributed and order-referrer revenue. Product names continue linking to the evidence drill-down. Date range, granularity, and recompute stay local to Attribution; run, engine, surface, and export stay local to Visibility.

### User-visible labels

- A1 method: `A1 · GA4 platform-attributed`
- A2 method: `A2 · Shopify order referrer`
- Delta: `Delta · A1 − A2`
- Statistical namespace badge/card title: `Statistical estimate`
- Reduced GA4 item fallback: `Reduced GA4 granularity · item revenue is grouped by default channel instead of AI source.`
- Insufficient statistical sample: `Insufficient data · no estimate is available for this window.` and metric value `—`
- Unattributed summary: `Unattributed · {orders} orders ({share}) have no referrer evidence.`
- v1 price mismatch: `Direction unavailable`
- Null metric: `—`

### Non-goals

No Opportunities tab, M2b/M2c controls, BigCommerce/GMC UI, checkout/feed write-back, or M5 Layer C lift panel. Do not add a shared Commerce-wide toolbar, new visual primitives, or new design tokens.

### Constraints and edge cases

- A1 and A2 are cross-checks. Never add their revenue, orders, AOV, or conversion values.
- Unattributed orders stay unattributed because no session join key exists.
- Attribution is partitioned by ISO currency. Never convert currencies, never sum unlike currencies, and render one complete block per currency; this repository has no FX-rate source.
- `insufficient_data` requires null estimate values.
- Unknown or absent `?tab=` still selects Catalog.
- Only the active tab’s queries run.
- Evidence remains newest-first with default limit 100 and backend maximum 500.
- A selected run with no product metrics keeps its run selector reachable.
- Surface and engine filters intersect; export receives both.
- Matrix and breakdown meaning cannot depend on color.
- Deliver all approved backend and frontend scope in one combined PR; do not split this frontend slice into a separate PR.

## Architecture decisions

- Keep local panel toolbars. Catalog has no analytical filters; Visibility and Attribution have unrelated filter state. The shared `visibility-toolbar.tsx` pattern is not useful here because hidden tabs do not share controls.
- Keep `lib/products/use-products-screen.ts` as the screen orchestration owner and move Catalog query ownership there so every tab has explicit `enabled` behavior.
- Keep product v2 contracts in `lib/api/products.ts`; add domain owners `lib/api/commerce.ts` and `lib/api/attribution.ts` as required by §11. `lib/api/index.ts` remains a transport-free compatibility facade.
- Reuse `Table`, `TablePagination`, `Badge`, `Donut`, `TrendChart`, cards, alerts, dropdowns, skeletons, and existing semantic token classes.
- Deterministic metrics use standard cards plus explicit A1/A2 method badges. `metrics.statistical.allocations`, when `state=available`, uses a separate warning-treated card titled `Statistical estimate`; it is excluded from deterministic totals, delta, and headline trends.

## Locked cross-workstream contracts

These frontend-driven backend additions land in the same combined PR and are owned by the corresponding backend workstream:

- Add `GET /projects/{project_id}/commerce/catalog-health`, `POST /projects/{project_id}/commerce/attribution/recompute`, and `GET /projects/{project_id}/commerce/attribution/recompute/{task_id}` in `backend/app/api/commerce.py`, with DTO/service support in `backend/app/domain/commerce/{schemas,service}.py` and `backend/app/domain/attribution/{schemas,service}.py`. Every route uses `require_active_workspace` (the flat header-resolved dependency used by `app/api/products.py`, NOT the path-scoped `require_workspace_member`), authorizes the project within that resolved workspace via `get_project(..., workspace_id)`, and returns cross-workspace 403/404 per invariant 5. Do not add a generic cross-domain `/analytics-tasks/{task_id}` route.
- Add `ProductVisibilityResponse.available_surfaces: list[str]` in `backend/app/domain/products/schemas.py` and populate it from persisted projection identities in `backend/app/domain/products/visibility.py`. Include `""` for measurement and persisted configured surface ids; the frontend does not read `Audit.configuration`.
- Replace open-ended M2a `buyer_destination_mix` and `competitor_co_placement` DTO dictionaries with the exact shapes below. Add stable `evidence_id` to every projected evidence item.
- Return AttributionSnapshot currency partitions under `metrics.deterministic.a1`, `metrics.deterministic.a2`, `metrics.deterministic.delta`, and `metrics.deterministic.unattributed`. Every revenue/AOV-bearing row carries its ISO currency. The backend never converts or aggregates unlike currencies.

## Contract inventory

All response objects below are `.strict()`. All `id`, `*_id`, and ID arrays use the local `uuid()` helper. Dates/timestamps remain strings, matching current API conventions. No token, customer name/email/address, merchant order number, raw order payload, or unsanitized URL is accepted.

### Existing product contract additions

Change `productSchema.origin` from an open string to `productOriginSchema` (`manual | imported | synced`) and add:

| Field | Shape | Nullability |
|---|---|---|
| `connection_id` | UUID | nullable; null for unbound manual/imported products |
| `external_item_ref` | string | nullable |
| `last_seen_sync_run_id` | UUID | nullable |

`productVisibilityEntrySchema` and `competitorProductVisibilityEntrySchema` each add:

| Field | Shape | Nullability |
|---|---|---|
| `product_analyzer_version` | string | required |
| `win_rate` | number | nullable |
| `price_mismatch_rate` | number | nullable |
| `price_relation_counts` | strict partial object `{ match: int, higher: int, lower: int, mismatch: int }` | required; `{}` is valid for v1 |
| `attribute_dimension_frequency` | record(group, record(dimension, non-negative int)) | required |
| `buyer_destination_mix` | `buyerDestinationMixSchema` | required |
| `competitor_co_placement` | `competitorCoPlacementSchema` | required |

Exact nested schemas:

- `buyerDestinationKindSchema`: `marketplace | retailer | brand_site | other`.
- `buyerDestinationMixSchema`: `{ total: non-negative int, by_kind: [{ merchant_kind, count }], by_domain: [{ merchant_domain: string, merchant_name: string, merchant_kind, count }] }`.
- `competitorCoPlacementSchema`: `{ items: [{ competitor_product_id: UUID | null, competitor_name: string, product_name: string, count: non-negative int }], truncated: boolean }`.
- `productVisibilitySchema` adds required `available_surfaces: string[]`. The measurement surface is represented by `""`; the UI labels it `Answer-engine APIs`. Do not offer `All surfaces`: the M2a route defines omission as the measurement slice, not an all-surface aggregate. This field is a frontend-driven backend addition owned by the M2a workstream.

`ProductEvidenceParams`, `getProductVisibility`, and `exportCsvUrl` add `surface?: string`; the products visibility query key normalizes `surface || 'measurement'` so omitted and explicit-empty measurement requests share one cache entry.

Generalize `productEvidenceItemSchema` with:

- Required common fields: `evidence_id: UUID`, `analysis_id: UUID`, `evidence_kind: product_mention | attribute_mention | buyer_destination`, existing audit/task/artifact/engine/prompt coordinates, `product_analyzer_version: string`, `shopping_surface: string`, `matched_name`, `matched_sku`, and `created_at`.
- Product-mention fields: `first_offset`, `rank_position`, `price_value`, `price_matches_catalog`, and `price_relation` are nullable; `price_text` and `price_currency` are strings.
- Attribute fields: `attribute_dimension`, `attribute_group`, `attribute_text`, and `attribute_offset` are nullable.
- Destination fields: `merchant_name`, `merchant_domain`, `merchant_kind`, and `destination_url` are nullable.
- Backend returns one stable UUID `evidence_id` per projected row: use `ProductMention.id` for `product_mention`, `MerchantMention.id` for `buyer_destination`, and derive JSONB-backed `attribute_mention` ids with UUIDv5 from the canonical tuple `(analysis_id, mention_id, dimension, offset)` under one fixed config-owned namespace. The same persisted evidence therefore produces the same id across reads without adding an attribute table. React keys use `evidence_id` and must never fall back to array index.

### Commerce health contract

Add these schemas and inferred types:

- `feedHealthStatusSchema`: `healthy | warning | error | unavailable`.
- `feedIssueSeveritySchema`: `info | warning | error`.
- `commerceSyncSummarySchema`: `{ sync_run_id: UUID, connection_id: UUID, status: integrationSyncRunStatusSchema, window_start: string, window_end: string, row_count: int, error_code: string, completed_at: string | null }`.
- `commerceConnectionSummarySchema`: `{ connection_id: UUID, provider: "shopify", label: string, account_ref: string, grant_status: integrationGrantStatusSchema, last_synced_at: string | null, latest_sync: commerceSyncSummarySchema | null }`.
- `productFeedHealthSchema`: `{ product_id: UUID | null, connection_id: UUID, external_item_ref: string, sync_run_id: UUID, status: feedHealthStatusSchema, highest_severity: feedIssueSeveritySchema | null, issue_count: non-negative int, rule_ids: string[], last_seen_in_feed: boolean }`.
- `commerceCatalogHealthSchema`: `{ project_id: UUID, connections: commerceConnectionSummarySchema[], products: productFeedHealthSchema[], generated_at: string | null }`; use an array because catalog rows can be bound to different connection IDs.

`commerceApi.getCatalogHealth(projectId, options?)` reads `GET /projects/{id}/commerce/catalog-health` and validates this schema. `commerceKeys.catalogHealth(projectId)` is `['commerce','catalog-health',projectId]`.

This route and DTO are a frontend-driven backend addition. The commerce backend workstream adds the project-scoped route and persisted projection using `require_active_workspace`; the frontend does not compose health by fetching unscoped task resources.

### Attribution contract

Reuse `snapshotGranularitySchema` (`day | week | month`) and the existing AI-source string vocabulary. Add:

- `attributionMethodSchema`: `ga4_platform_attributed | order_referrer`.
- `attributionDataStateSchema`: `available | no_data | not_connected`.
- `attributionSourceGranularitySchema`: `session_source_medium | default_channel_group` — mirrors the backend `ATTRIBUTION_SOURCE_GRANULARITY_*` vocabulary exactly. `default_channel_group` is the reduced GA4 item fallback. Do NOT define a separate `source_medium | channel_group | order_referrer` enum: granularity describes only A1's GA4 source dimension; A2's `order_referrer` identity is already carried by `attributionMethodSchema`, not by this field.
- `attributionMetricSetSchema`: `{ currency: three-character string | null, revenue: number | null, orders: int | null, average_order_value: number | null, sessions: int | null, conversion_rate: number | null }`; refine it so non-null revenue or AOV requires non-null currency.
- `attributionSourceRowSchema`: `{ ai_source: string, currency: three-character string, metrics: attributionMetricSetSchema }`.
- `attributionProductRowSchema`: `{ product_id: UUID | null, sku: string, name: string, ai_source: string | null, source_label: string, currency: three-character string, revenue: number | null, orders: int | null }`; `ai_source` is null and `source_label` carries the default-channel label when GA4 item granularity is reduced.
- `attributionMethodMetricsSchema`: `{ method, state, source_granularity: attributionSourceGranularitySchema | null, reduced_granularity: boolean, currency: three-character string | null, coverage_rate: number | null, totals: attributionMetricSetSchema, by_ai_source: attributionSourceRowSchema[], by_product: attributionProductRowSchema[] }`. `source_granularity` is non-null (`session_source_medium | default_channel_group`) on available A1 rows and **null** on A2 rows and on any row whose `state` is not `available` — the backend producer contract agrees (it is only meaningful for A1's GA4 source dimension). Refine: when `method=ga4_platform_attributed` and `state=available`, `source_granularity` must be non-null. `currency` is non-null on every `state=available` row (every available revenue-bearing row carries its ISO currency) and **null** on rows whose `state` is `no_data`/`not_connected` when no response ever yielded `metadata.currencyCode`; refine to require non-null `currency` when `state=available`, mirroring the `attributionMetricSetSchema` refine precedent. The backend emits null `currency` on unavailable rows when no currency is known. Each element is one method/currency partition. For every represented currency the backend returns one A1 and one A2 row; an unavailable method uses `no_data` or `not_connected` with null metrics rather than a fabricated zero.
- `attributionDeltaStateSchema`: `comparable | method_unavailable | currency_unavailable`.
- `attributionDeltaSchema`: `{ currency: three-character string, state: attributionDeltaStateSchema, revenue: number | null, orders: int | null, average_order_value: number | null, conversion_rate: number | null }`; values are backend-projected A1 minus A2 and may be negative. Non-`comparable` rows carry null metric values.
- `unattributedMetricsSchema`: `{ currency: three-character string, orders: int, order_share: number | null, revenue: number | null }`.
- `statisticalAllocationRowSchema`: `{ ai_source: string, currency: three-character string, estimated_revenue: number | null, estimated_orders: number | null, estimated_share: number | null }`.
- `attributionStatisticalSchema`: `{ state: not_offered | available | insufficient_data, sample_size: int | null, allocations: statisticalAllocationRowSchema[] }`; require empty allocations for `not_offered`, and require every estimate field to be null for `insufficient_data`.
- `attributionDeterministicSchema`: `{ a1: attributionMethodMetricsSchema[], a2: attributionMethodMetricsSchema[], delta: attributionDeltaSchema[], unattributed: unattributedMetricsSchema[] }`.
- `attributionMetricsSchema`: `{ deterministic: attributionDeterministicSchema, statistical: attributionStatisticalSchema }`.
- `attributionSnapshotSchema`: `{ project_id: UUID, window_start: string, window_end: string, granularity, metrics: attributionMetricsSchema, source_link_ids: UUID[], source_order_fact_ids: UUID[], source_metric_row_ids: UUID[], source_snapshot_ids: UUID[], formula_version: string, analyzer_version: string, created_at: string | null }`.

The UI builds the currency selector/order from the union of ISO codes in `metrics.deterministic.a1`, `a2`, `delta`, and `unattributed`, then renders one complete block per currency. It pairs A1/A2 only within the same code, never derives a cross-currency total, and never computes delta in the browser. Unavailable method rows render their backend `no_data`/`not_connected` state, not a zero value. GA4 channel-group fallback product rows retain `ai_source=null` and their persisted `source_label`.

Add recompute schemas:

- `attributionTaskStatusSchema`: `queued | leased | running | retry_wait | succeeded | failed | cancelled`.
- `attributionRecomputeSchema`: `{ task_id: UUID, project_id: UUID, status: attributionTaskStatusSchema, error_code: string, updated_at: string, completed_at: string | null }`.

`attributionApi.getSnapshot(projectId, { from?, to?, granularity? }, options?)` reads the §10.6 attribution route with `withQuery/definedQuery`. `recompute(projectId)` posts to `/projects/{id}/commerce/attribution/recompute`, and `getRecompute(projectId, taskId)` reads `/projects/{id}/commerce/attribution/recompute/{taskId}`. The two recompute routes are frontend-driven backend additions owned by the attribution backend workstream and use the same project/workspace authorization as the snapshot read.

`attributionKeys` contains:

- `all: ['attribution']`
- `snapshot(projectId, filters): ['attribution','snapshot',projectId,filters]`
- `recompute(projectId, taskId): ['attribution','recompute',projectId,taskId]`

## File structure map

### Frontend-driven backend additions

- `backend/app/api/commerce.py` — add project-scoped catalog-health and attribution recompute/status routes with `require_active_workspace`.
- `backend/app/domain/commerce/{schemas,service}.py` — add the persisted catalog-health projection and exact response DTO.
- `backend/app/domain/attribution/{schemas,service}.py` — add recompute enqueue/status DTOs and per-currency attribution response rows.
- `backend/app/domain/products/{schemas,visibility}.py` — add `available_surfaces`, exact destination/co-placement DTO shapes, and stable evidence ids.
- `backend/tests/component/test_attribution_api.py`, `backend/tests/component/test_product_visibility_api.py`, and the commerce-health API component test owned by the M4 backend slice — cover project/workspace authorization, exact DTOs, per-currency rows, surface metadata, deterministic UUIDv5 evidence identity, and no provider call on reads.

### Modified

- `frontend/lib/api/schemas.ts` — product v2, commerce health, attribution, and task schemas.
- `frontend/lib/api/products.ts` — surface query/export and generalized evidence contracts.
- `frontend/lib/api/types.ts` — inferred product/commerce/attribution types.
- `frontend/lib/api/query-keys/products.ts` — surface-aware visibility key.
- `frontend/lib/api/query-keys.ts` — Commerce and Attribution namespace re-exports.
- `frontend/lib/api/index.ts` — transport-free exports/spreads for new domain modules.
- `frontend/lib/products/catalog.ts` — three-tab model, labels, and null-safe commerce formatters.
- `frontend/lib/products/use-products-screen.ts` — active-tab query enablement, surface state, and attribution orchestration.
- `frontend/components/products/products-screen.tsx` — three-panel composition.
- `frontend/components/products/products-tabs.tsx` — three-tab comments/ARIA label while preserving keyboard behavior.
- `frontend/components/products/catalog-panel.tsx` — receives active Catalog queries and combines product/health rows.
- `frontend/components/products/catalog-table.tsx` — origin, feed-health, and sync-state cells.
- `frontend/components/products/product-visibility-panel.tsx` — surface control and v2 panels.
- `frontend/components/products/product-evidence-table.tsx` — evidence-kind rendering.
- `frontend/components/layout/nav-items.ts` — Products label to Commerce; href unchanged.

### New

- `frontend/lib/api/commerce.ts` — catalog-health transport owner.
- `frontend/lib/api/attribution.ts` — attribution snapshot/recompute transport owner.
- `frontend/lib/api/query-keys/commerce.ts` — catalog-health key namespace.
- `frontend/lib/api/query-keys/attribution.ts` — snapshot/task key namespace.
- `frontend/lib/products/attribution.ts` — range options, display-only method labels, metric formatting, and no-sum view projection.
- `frontend/components/products/surface-filter-dropdown.tsx` — measurement/configured surface selector.
- `frontend/components/products/attribute-frequency-panel.tsx` — grouped frequency table.
- `frontend/components/products/buyer-destination-breakdown.tsx` — donut plus complete text legend/table.
- `frontend/components/products/competitor-co-placement-matrix.tsx` — semantic matrix table.
- `frontend/components/products/attribution-panel.tsx` — Attribution toolbar, states, and composition.
- `frontend/components/products/attribution-method-comparison.tsx` — A1/A2/delta/unattributed cards.
- `frontend/components/products/attribution-source-table.tsx` — per-source deterministic metrics.
- `frontend/components/products/attribution-product-table.tsx` — paged per-SKU revenue.
- `frontend/components/products/statistical-allocation-card.tsx` — optional Layer B treatment only; no lift UI.

## Implementation tasks

### 1. Contract owners and strict schemas [parallel]

Update `frontend/lib/api/schemas.ts`, `frontend/lib/api/products.ts`, `frontend/lib/api/types.ts`, `frontend/lib/api/query-keys/products.ts`, `frontend/lib/api/query-keys.ts`, and `frontend/lib/api/index.ts`; add `frontend/lib/api/commerce.ts`, `frontend/lib/api/attribution.ts`, `frontend/lib/api/query-keys/commerce.ts`, and `frontend/lib/api/query-keys/attribution.ts`.

- Add the exact schema inventory above, all `.strict()`, and infer all exported response types from zod.
- Extend product visibility/evidence/export query parameters with `surface` and include it in cache keys and CSV URL generation.
- Add same-origin Commerce health and Attribution transports using `apiClient`, `strictValidate`, `withQuery`, and `definedQuery`; keep the facade transport-free.
- Coordinate the project-scoped catalog-health/recompute routes, `available_surfaces`, exact M2a nested DTOs, UUIDv5 attribute evidence ids, and per-currency attribution rows with the named backend owners in the same combined PR.
- Reject PII/secret drift through strict schemas. Do not add catch-and-ignore validation paths.
- Keep nullability exactly as specified so absent metrics remain unavailable.

Existing tests that break: `frontend/lib/api/products.test.ts`, `frontend/lib/api/schemas.test.ts`, `frontend/lib/products/products-lib.test.ts`, and every strict product fixture in component tests. Add `frontend/lib/api/commerce.test.ts` and `frontend/lib/api/attribution.test.ts` using global fetch stubs, matching existing `products.test.ts`.

Test expectations:

- Paths and optional query strings are exact; surface participates in visibility/evidence/export requests.
- Numeric IDs, extra token/PII keys, absent required metric namespaces, and wrong nullability fail loud.
- v1 `{}` relation counts parse; null rates remain null.
- Attribution parses per-currency A1, A2, delta, unattributed, reduced granularity, `not_offered`, and `insufficient_data` without constructing a combined or cross-currency metric.
- Generalized evidence parses stable UUID ids; attribute fixtures use the backend’s deterministic UUIDv5 output and UI tests key rows only by `evidence_id`.

### 2. Three-tab shell and query orchestration [after 1]

Update `frontend/lib/products/catalog.ts`, `frontend/lib/products/use-products-screen.ts`, `frontend/components/products/products-screen.tsx`, `frontend/components/products/products-tabs.tsx`, and `frontend/components/products/catalog-panel.tsx`; add `frontend/lib/products/attribution.ts`.

- Change `ProductsTab` to `catalog | visibility | attribution`; append Attribution to `PRODUCTS_TABS`; retain Catalog default for missing/invalid query values.
- **Nested sub-tabs (approved design — see `designs/design-plan.json`).** Visibility and Attribution each get a second-level segmented tablist rendered directly under their local toolbar, reusing the existing `components/ui/segmented.tsx` primitive (the same control `products-tabs.tsx` uses for the top-level tabs) — no new primitive. Only ONE nested panel renders at a time. Nested sub-tab state is local React state per parent tab (defaulting to the first sub-tab); it is NOT mirrored in the URL (only the top-level `?tab=` is). Define the sub-tab id vocabularies in `lib/products/catalog.ts` / `lib/products/attribution.ts`:
  - Visibility: `overview | attributes | destinations | co-placement` (default `overview`).
  - Attribution: `overview | by-source | by-product` (default `overview`).
- In `ProductsScreen`, instantiate Catalog, Visibility, and Attribution query hooks with `enabled` flags based on the active tab, then render only one panel.
- Move `useCatalogQueries` invocation out of `CatalogPanel` so `productsApi.list` and `commerceApi.getCatalogHealth` are disabled when Catalog is inactive.
- Extend `useProductVisibilityQueries` with `surface`; pass engine and surface to the request/key/export. Preserve selected-run fallback behavior.
- Add `useAttributionQueries` with range/granularity state, snapshot query, recompute mutation, and task query. Reuse the existing shared analytics range/granularity module `frontend/lib/analytics/options.ts` (`AnalyticsRange`, `RANGE_OPTIONS`, `rangeToWindow`, `AnalyticsGranularity`, `GRANULARITY_OPTIONS`) — the same framework-free options the `/analytics` and `/traffic` surfaces already use — rather than duplicating date math or the visibility trend's `run|week|month` vocabulary.
- Preserve one rendered `tabpanel` (top-level AND nested), roving tab index, automatic activation, focus transfer, arrow wraparound, Home/End, visible focus, and horizontal scrolling on both tablist levels.

Existing tests that break: `frontend/components/products/products-screen.test.tsx` and `frontend/lib/products/products-lib.test.ts`.

Test expectations:

- `?tab=attribution` renders Attribution; invalid values render Catalog.
- ArrowRight from Visibility reaches Attribution; End reaches Attribution; ArrowRight from Attribution wraps to Catalog.
- Exactly one top-level tab/panel is active and mounted.
- Only the active tab’s query functions are enabled; tab changes preserve URL sync.
- The Visibility and Attribution sub-tablists render under their toolbars; exactly one nested panel is mounted per parent tab; nested keyboard navigation (Arrow/Home/End, roving tabindex) works; nested selection is local state and does not change the URL.

### 3. Catalog health and navigation slice [after 2]

Update `frontend/components/products/catalog-panel.tsx`, `frontend/components/products/catalog-table.tsx`, and `frontend/components/layout/nav-items.ts`.

- Join `commerceCatalogHealth.products` to catalog rows by `product_id`; never match by mutable display name. A synced product with no health row displays `Feed health unavailable`; unbound products display `Not feed-bound`.
- Replace raw origin text with explicit neutral/status badges: `Manual`, `CSV import`, `Synced feed`.
- Add Feed health and Sync columns. Health badges include text (`Healthy`, `N warnings`, `N errors`, `Unavailable`) and may expose rule IDs in a tooltip. Sync renders the existing run-status badge vocabulary plus last-synced/completed timestamp; failed state includes non-secret `error_code`.
- For every connection whose `latest_sync` is active, use `useQueries` to poll its existing integration sync detail every 3,000 ms with `isActiveSyncRun`/`SYNC_RUN_POLL_MS`. Stop each query on terminal state, then invalidate `queryKeys.commerce.catalogHealth(projectId)`, `queryKeys.products.list(projectId)`, and the relevant integration namespace. Do not poll terminal rows.
- Change only the nav label from Products to Commerce; keep `/products` and product drill-down paths.

Existing tests that break: `frontend/components/products/catalog-table.test.tsx`, `frontend/components/layout/sidebar-nav.test.tsx`, `frontend/lib/api/products.test.ts`, and strict product fixtures in `frontend/lib/api/schemas.test.ts`.

Test expectations:

- Manual, imported, synced, healthy, warning/error, unavailable, and unbound rows have explicit text.
- Active sync polls at 3,000 ms; terminal status stops polling and invalidates product/health keys.
- Null connection/provenance does not crash or imply a feed error.
- Sidebar expects Commerce at href `/products`.

### 4. Visibility v2 and evidence slice [after 2]

Update `frontend/components/products/product-visibility-panel.tsx`, `frontend/components/products/product-evidence-table.tsx`, and `frontend/lib/products/catalog.ts`; add `frontend/components/products/surface-filter-dropdown.tsx`, `attribute-frequency-panel.tsx`, `buyer-destination-breakdown.tsx`, and `competitor-co-placement-matrix.tsx`.

- Add Surface beside Run and Engine. Label `""` as `Answer-engine APIs`; use backend-provided configured labels/ids verbatim. Keep export on the right and include both engine and surface. The Run/Engine/Surface/Export toolbar stays ABOVE the nested sub-tablist and slices all four sub-panels.
- Distribute the Visibility content across the nested sub-tabs (see Task 2); do NOT stack all panels vertically:
  - `overview` (default): summary cards + own Product rankings table + Competitor products table.
  - `attributes`: `AttributeFrequencyPanel` (full width).
  - `destinations`: `BuyerDestinationBreakdown` (donut + full merchant table).
  - `co-placement`: `CompetitorCoPlacementMatrix` (full width) + truncation notice.
- Add Win rate and Price relation columns to own and competitor tables (in the `overview` sub-tab). Render win-rate null as `—`. Render relation-count badges for `Match`, `Higher`, `Lower`; for an analyzer-v1 row with `mismatch > 0`, render `Direction unavailable`, never Higher/Lower.
- Aggregate the selected projection’s row-level `attribute_dimension_frequency`, `buyer_destination_mix`, and `competitor_co_placement` for display only by adding persisted counts; do not re-score evidence. Put pure projection helpers in `lib/products/catalog.ts` and preserve backend `truncated` if any row is truncated.
- `AttributeFrequencyPanel` uses a semantic table grouped by group/dimension and integer frequency.
- `BuyerDestinationBreakdown` uses `Donut` for kind shares and a visible domain legend/table with name, kind, count, and share. Its `aria-label` names every segment and percentage.
- `CompetitorCoPlacementMatrix` uses `Table` with explicit row and column headers and visible numeric cells; add a truncation notice when `truncated=true`. Color may reinforce values but never carry them alone.
- Generalize evidence rows by `evidence_kind`: product mention retains rank/price/relation; attribute mention displays dimension, group, exact text, and offset; buyer destination displays merchant, kind, sanitized URL, and optional price. Add surface to the evidence query key/request. Keep limit 100 and truncation notice.
- **Product drill-down (`/products/[productId]`) evidence sub-tabs.** Replace the single unified evidence table with a nested segmented tablist (same `segmented.tsx` primitive, local state defaulting to `mentions`, not in the URL): `mentions | attributes | destinations`. Only one evidence panel renders at a time. `mentions` keeps the existing columns (Engine, Prompt, Rank, Price mentioned, vs catalog, Offset, Execution link); `attributes` shows Engine, Prompt, Dimension, Group, exact matched Text, Offset; `destinations` shows Engine, Prompt, Merchant, Kind badge, sanitized destination URL, optional price. Each panel keeps the 100-row limit and truncation notice; nulls render `—`.

Existing tests that break: `frontend/components/products/product-visibility-panel.test.tsx`, `frontend/lib/products/products-lib.test.ts`, `frontend/lib/api/products.test.ts`, and `frontend/lib/api/schemas.test.ts`. Add `frontend/components/products/product-evidence-table.test.tsx`; add focused tests beside each new panel or cover them through `product-visibility-panel.test.tsx` if kept as pure children.

Test expectations:

- Surface and engine both participate in key/request/export.
- v1 mismatch reads `Direction unavailable`; v2 Higher/Lower render only from persisted counts.
- Null win/mismatch metrics render `—`, not `0`.
- Matrix has row/column header semantics and numeric accessible names.
- Donut legend and ARIA summary state segment names and percentages.
- Every evidence kind renders only its applicable fields; destination URL is already sanitized and opens safely; truncation remains visible.

### 5. Attribution vertical slice [after 2]

Add `frontend/components/products/attribution-panel.tsx`, `attribution-method-comparison.tsx`, `attribution-source-table.tsx`, `attribution-product-table.tsx`, and `statistical-allocation-card.tsx`.

- `AttributionPanel` owns a local Range dropdown, day/week/month segmented control, and Recompute button — all ABOVE the nested sub-tablist, slicing every sub-panel. Reuse the analytics/traffic toolbar empty/error/skeleton patterns and the shared `lib/analytics/options.ts` range/granularity options (see Task 2).
- Distribute the Attribution content across the nested sub-tabs (see Task 2); do NOT stack everything vertically:
  - `overview` (default): A1 and A2 method cards side by side (never merged), the Delta card, the Unattributed card, the reduced-granularity alert (when applicable), and — only when `metrics.statistical.state=available` — the `Statistical estimate` card with its warning treatment.
  - `by-source`: the per-`ai_source` deterministic table (full width).
  - `by-product`: the per-SKU product table + `TablePagination` (full width).
- For each ISO code discovered in `metrics.deterministic.*`, render A1 and A2 method cards side by side with the exact labels above. Each card shows revenue, orders, AOV, and conversion; null values use `—`. Method `state` drives no-data/not-connected copy.
- Render the backend delta in its own card labelled `Delta · A1 − A2`. Do not calculate or render `A1 + A2`; no helper, summary card, chart series, or table footer may combine methods.
- Show unattributed copy directly under A2 using persisted order count/share. A null share is `—`, not `0%`.
- Render `by_ai_source` (in `by-source`) as a deterministic table and `by_product` (in `by-product`) with `TablePagination`; preserve unresolved `product_id=null` rows as plain SKU/name rows. Do not use `TrendChart` in this scope because the exact DTO has no persisted time buckets; never synthesize a trend from totals. If the backend later adds nullable persisted buckets, use `TrendChart` so null remains a visible/announced gap.
- When A1 `reduced_granularity=true`, show the exact reduced-granularity alert. Item rows grouped by `item_default_channel_group` must not be relabelled as per-AI-source data.
- If `metrics.statistical.state=available`, render its allocations only in `StatisticalAllocationCard` with existing warning semantic classes and title `Statistical estimate`. For `state=insufficient_data`, render the exact insufficient-data copy and all estimates as `—`; for `state=not_offered`, render no statistical card. Never merge this namespace into deterministic cards, delta, or tables.
- Recompute posts once, stores the returned task id, and polls only that task every 3,000 ms while status is queued/leased/running/retry_wait. Terminal status stops polling and invalidates `queryKeys.attribution.snapshot(projectId, currentFilters)`; failed/cancelled remains explicit and retains the current snapshot.

Add `frontend/components/products/attribution-panel.test.tsx` with `renderWithProviders`, shared `mswServer`, and per-test handlers. Add pure formatter/projection tests in `frontend/lib/products/attribution.test.ts`.

Test expectations:

- A1/A2 labels and backend delta render; no A1+A2 value or combined total exists.
- Revenue, orders, AOV, conversion, source rows, SKU rows, and unattributed copy use persisted values.
- ISO currency blocks remain separate; fixtures with USD and EUR prove there is no cross-currency total, conversion, or delta.
- Reduced-granularity alert appears only for the fallback state.
- Null metrics and insufficient estimates render `—`; statistical values never appear in deterministic totals.
- Recompute polls at 3,000 ms, stops at terminal status, and invalidates only the relevant Attribution namespace/filter.

## Testing and final verification

No GA4, Shopify, OAuth, or LLM credentials are configured in this environment. Automated frontend verification uses only global `fetch` stubs for API-contract tests, following `frontend/lib/api/products.test.ts`, and per-test MSW handlers through `frontend/test/msw-server.ts` for component/query tests. Do not call live providers or execute a live audit/sync. Manual UI verification, if performed, uses seeded or fixture-backed persisted responses only.

Run from `frontend/`:

1. `pnpm test -- lib/api/products.test.ts lib/api/commerce.test.ts lib/api/attribution.test.ts lib/api/schemas.test.ts`
2. `pnpm test -- lib/products/products-lib.test.ts lib/products/attribution.test.ts components/products/products-screen.test.tsx components/products/catalog-table.test.tsx components/products/product-visibility-panel.test.tsx components/products/product-evidence-table.test.tsx components/products/attribution-panel.test.tsx components/layout/sidebar-nav.test.tsx`
3. `pnpm lint`
4. `pnpm check:policy`
5. `pnpm build`

Final integration verification:

- Open `/products`, `/products?tab=visibility`, `/products?tab=attribution`, and `/products/[productId]`; verify back/forward URL tab state and keyboard navigation.
- Verify narrow-width horizontal tab scrolling, table overflow, visible focus, and no color-only status/matrix/donut meaning.
- Verify one active tab produces only its own network requests.
- Verify no request bypasses same-origin `/api/v1`, no response schema accepts PII/secrets, and no frontend helper recomputes backend attribution/scoring.

## Acceptance mapping

- Catalog feed origin/health/sync: Tasks 1 and 3.
- Three tabs, URL state, active-query isolation, Commerce nav: Tasks 2 and 3.
- Visibility v2, mixed-version label, surface slicing, evidence kinds: Tasks 1, 2, and 4.
- A1/A2/delta/source/SKU/unattributed/reduced-granularity behavior: Tasks 1, 2, and 5.
- Deterministic/statistical separation and insufficient-data behavior: Tasks 1 and 5.
- Polling and accessibility: Tasks 2–5 plus final verification.
