# M2a — Analyzer v2 and quiet-path shopping-surface slot

## Scope and acceptance

**Goal.** Deliver §5 Analyzer v2 metrics for own and competitor SKUs, preserve v1 reads, and land the §7.1 slot/schema boundary while shopping probes remain disabled.

**In scope.** Analyzer/scoring versions, frozen product attributes/category, price relation, attributes, merchant destinations, competitor co-placement, win rate, versioned product rows/snapshots, product API/export additions, `AuditTask.shopping_surface`, measurement-only brand isolation, empty surface gate.

**Out of scope.** M2b fanout, M2c connectors/provider routes, M3–M5, frontend work, live provider calls.

**Acceptance.** A persisted `RawResponseArtifact` can be re-scored into v2 rows without mutating v1 rows; v2 snapshots expose §5.6 metrics for own and competitor SKUs; v1 evidence falls back to `match | mismatch | null` and carries `product_analyzer_version`; measurement brand metrics/counts remain unchanged when fixture probe rows exist; the surface gate is empty.

## 1. Commerce config and version ownership [prerequisite]

### Files

- `backend/app/core/config/commerce.py` — new deterministic commerce vocabulary and gates.
- `backend/app/core/config/products.py` — bump only the existing product provenance constants.

### Changes

Add `commerce.py` with a module docstring citing invariant 1 and module-level `Final` values. Use the same declarative style as `config/products.py`; domain/scoring code must not inline these strings or limits.

Exact public declarations:

- `PRODUCT_WIN_REQUIRES_ENUMERATION: Final = True`
- `@dataclass(frozen=True) class AttributeDimension: key: str; group: str; phrases: tuple[str, ...]`
- `ATTRIBUTE_DIMENSION_GROUPS: Final[frozenset[str]] = frozenset({"characteristics", "facts", "ratings"})`
- `PRODUCT_ATTRIBUTE_WINDOW_CHARS: Final = 200`
- `CO_PLACEMENT_MAX_PAIRS: Final = 1000`
- `PRICE_RELATION_MATCH: Final = "match"`
- `PRICE_RELATION_HIGHER: Final = "higher"`
- `PRICE_RELATION_LOWER: Final = "lower"`
- `PRICE_RELATIONS: Final[frozenset[str]] = frozenset({PRICE_RELATION_MATCH, PRICE_RELATION_HIGHER, PRICE_RELATION_LOWER})`
- `MERCHANT_KIND_MARKETPLACE: Final = "marketplace"`
- `MERCHANT_KIND_RETAILER: Final = "retailer"`
- `MERCHANT_KIND_BRAND_SITE: Final = "brand_site"`
- `MERCHANT_KIND_OTHER: Final = "other"`
- `MERCHANT_KINDS: Final[frozenset[str]] = frozenset({MERCHANT_KIND_MARKETPLACE, MERCHANT_KIND_RETAILER, MERCHANT_KIND_BRAND_SITE, MERCHANT_KIND_OTHER})`
- `MERCHANT_DOMAINS: Final[dict[str, tuple[str, str]]]`, where each value is `(merchant_name, merchant_kind)`:
  - `"amazon.com": ("Amazon", "marketplace")`
  - `"ebay.com": ("eBay", "marketplace")`
  - `"etsy.com": ("Etsy", "marketplace")`
  - `"walmart.com": ("Walmart", "retailer")`
  - `"target.com": ("Target", "retailer")`
  - `"bestbuy.com": ("Best Buy", "retailer")`
- `SHOPPING_SURFACE_MEASUREMENT: Final = ""` — canonical measurement identity used by models, filters, DTO defaults, and idempotency keys.
- `SHOPPING_SURFACES: Final[dict[str, dict[str, str]]] = {}` — the disabled gate. Document the future record keys (`logical_engine`, `transport_provider`, `transport_model`) but add no entries and do not change `APPROVED_ROUTES`.
- `PRODUCT_ATTRIBUTE_EVIDENCE_NAMESPACE: Final[uuid.UUID] = uuid.UUID("73a01bbd-f974-58d4-a213-a178455bc018")` — fixed UUID5 namespace for projected attribute-evidence row identity; import `uuid` in this config module rather than embedding a namespace literal in projection code.

Seed `ATTRIBUTE_DIMENSIONS: Final[dict[str, tuple[AttributeDimension, ...]]]` with exactly `DEFAULT`, `footwear`, `outerwear`, and `accessories`. The scorer always evaluates `DEFAULT` plus the category-specific tuple; unknown/empty categories evaluate `DEFAULT` only.

| Category | Dimension | Group | Exact casefolded phrases |
|---|---|---|---|
| `DEFAULT` | `price` | `facts` | `("price", "cost", "priced at", "sale price")` |
| `DEFAULT` | `warranty` | `facts` | `("warranty", "guarantee", "coverage")` |
| `DEFAULT` | `shipping` | `facts` | `("shipping", "delivery", "ships", "free shipping")` |
| `DEFAULT` | `returns` | `facts` | `("returns", "return policy", "refund", "exchange")` |
| `DEFAULT` | `materials` | `characteristics` | `("material", "materials", "made from", "made of", "fabric")` |
| `DEFAULT` | `sizing` | `facts` | `("size", "sizes", "sizing", "size guide")` |
| `footwear` | `fit` | `ratings` | `("fit", "fits", "true to size", "runs small", "runs large")` |
| `footwear` | `comfort` | `ratings` | `("comfort", "comfortable", "cushioning", "cushioned")` |
| `footwear` | `support` | `characteristics` | `("arch support", "ankle support", "stability")` |
| `footwear` | `traction` | `characteristics` | `("traction", "grip", "outsole")` |
| `footwear` | `waterproofing` | `characteristics` | `("waterproof", "water resistant", "water-resistant")` |
| `outerwear` | `warmth` | `ratings` | `("warmth", "warm", "temperature rating")` |
| `outerwear` | `insulation` | `characteristics` | `("insulation", "insulated", "down fill", "synthetic fill")` |
| `outerwear` | `weather_protection` | `characteristics` | `("waterproof", "water resistant", "water-resistant", "windproof", "wind resistant")` |
| `outerwear` | `breathability` | `ratings` | `("breathability", "breathable", "ventilation")` |
| `outerwear` | `layering` | `facts` | `("layering", "layer", "midlayer", "shell")` |
| `accessories` | `compatibility` | `facts` | `("compatibility", "compatible with", "works with", "fits")` |
| `accessories` | `capacity` | `facts` | `("capacity", "volume", "litre", "liter")` |
| `accessories` | `dimensions` | `facts` | `("dimensions", "height", "width", "depth")` |
| `accessories` | `durability` | `ratings` | `("durability", "durable", "wear resistance")` |
| `accessories` | `weight` | `facts` | `("weight", "lightweight", "weighs")` |

In `config/products.py`, set:

- `PRODUCT_ANALYZER_VERSION: Final = "product-analysis-2"`
- `PRODUCT_SCORING_RULE_VERSION: Final = "product-scoring-v2"`

### Existing tests affected

- `backend/tests/unit/test_product_scoring.py` imports product constants and asserts exact score dictionaries; retain its v1 matching/rank coverage but add the new keys to exact expectations.
- `backend/tests/component/test_product_visibility_api.py` currently asserts only a non-empty `product_analyzer_version`; change it to the exact v2 string. `backend/tests/component/test_product_analysis_worker.py` already asserts equality with the config constants, so it follows the bump automatically — pin it to the exact v2 literals as hardening (note: it does not break on the bump; this is deliberate version-locking, not a fix for existing breakage).

## 2. Freeze attributes/category before scoring [after 1]

### Files

- `backend/app/domain/products/shim.py`
- `backend/app/analysis/product_scoring.py`
- `backend/app/domain/audits/planner.py`

### Changes

Widen `project_product_identity(project: Project) -> dict[str, Any]` before adding category-keyed extraction. Freeze each own product with exactly these keys:

`id`, `sku`, `name`, `aliases`, `variants`, `price`, `currency`, `url`, `attributes`.

Copy the complete JSON-safe `Product.attributes` bag with `dict(product.attributes or {})`; do not freeze only `category`, because the bag is already the catalog completeness identity and future deterministic dimensions must continue to read the audit-frozen value. Competitor product keys stay unchanged: `id`, `competitor_id`, `competitor_name`, `name`, `aliases`, `price`, `currency`.

Extend the frozen scorer entry to:

- `ProductEntry(..., attributes: dict[str, Any], category: str)`
- `CompetitorProductEntry(..., category: str = "")`

`ProductScoringConfig.from_project(config)` derives own `category` from `item["attributes"]["category"]`, stripped and casefolded. Competitor products use `DEFAULT` dimensions because their M1 model has no attribute bag. Also carry `owned_domains: tuple[str, ...]` from the already-frozen `project_scoring_identity()` data so merchant classification never reads live `OwnedDomain` rows.

`create_audit()` continues merging `project_scoring_identity(project)` and `project_product_identity(project)`. Add `configuration["shopping_surfaces"] = list(SHOPPING_SURFACES)`; with the locked gate this is `[]`. Do not multiply `total`, alter slot generation for probes, or create probe tasks.

### Existing tests affected

- `backend/tests/unit/test_product_shim.py` breaks on the exact own-product dict. Seed `attributes={"category": "footwear", ...}` and assert the full bag is frozen without alias folding or mutation.
- `backend/tests/unit/test_product_scoring.py` constructors and `from_project` assertions gain `attributes/category/owned_domains` expectations.
- `backend/tests/component/test_audit_planner.py` must assert `audit.configuration["shopping_surfaces"] == []` and the frozen product `attributes` bag when a catalog is present.

## 3. Versioned schema delta and model registry [after 1]

### Files

- `backend/app/models/product.py`
- `backend/app/models/analysis.py`
- `backend/app/models/audit.py`
- `backend/app/models/__init__.py`
- `backend/app/domain/audits/schemas.py`

### Changes

Apply §5.6 directly to ORM models; do not add an Alembic revision.

**`ProductResponseAnalysis`**

- Add `shopping_surface: Mapped[str] = mapped_column(String(32), default=SHOPPING_SURFACE_MEASUREMENT)`.
- Replace `uq_product_response_analysis_task(task_id)` with `uq_product_response_analysis_task_version(task_id, product_analyzer_version, product_scoring_rule_version)`. This is required by D1: a persisted v1 analysis and a new v2 re-score must coexist.
- Add `merchant_mentions` relationship with delete-orphan cascade/passive deletes, parallel to `product_mentions`.

**`ProductMention`**

- Add `price_relation: Mapped[str | None] = mapped_column(String(16), nullable=True)`.
- Add `attribute_mentions: Mapped[list] = mapped_column(JSONB, default=list)` containing only `{dimension, group, text, offset}` objects.

**`MerchantMention`** — new `merchant_mentions` table, no unique/check constraint:

- `id UUID`, primary key, `default=uuid.uuid4`
- `workspace_id UUID`, FK `workspaces.id`, `ondelete="CASCADE"`, indexed
- `audit_id UUID`, FK `audits.id`, `ondelete="CASCADE"`, indexed
- `analysis_id UUID`, FK `product_response_analyses.id`, `ondelete="CASCADE"`, indexed
- `artifact_id UUID | None`, FK `raw_response_artifacts.id`, `ondelete="SET NULL"`, nullable
- `product_id UUID | None`, FK `products.id`, `ondelete="SET NULL"`, nullable
- `competitor_product_id UUID | None`, FK `competitor_products.id`, `ondelete="SET NULL"`, nullable
- `merchant_name String(255)`
- `merchant_domain String(255)`
- `merchant_kind String(16)`
- `destination_url Text`
- `price_text String(64)`, default `""`
- `price_value Numeric(12, 2) | None`, nullable
- `price_currency String(3)`, default `""`
- `product_analyzer_version String(32)`
- `created_at DateTime(timezone=True)`

Exactly one target FK is set when written, but omit a CHECK because catalog deletion can legitimately set both to null (§5.6/D3).

**`ProductMetricSnapshot`**

- Add `win_rate: Mapped[float | None]`, nullable.
- Add `price_mismatch_rate: Mapped[float | None]`, nullable.
- Keep historical snapshots immutable. Widen both partial unique indexes so v1 and v2 snapshots coexist:
  - `uq_product_metric_snapshot_product(audit_id, product_id, product_analyzer_version, product_scoring_rule_version) WHERE product_id IS NOT NULL`
  - `uq_product_metric_snapshot_competitor_product(audit_id, competitor_product_id, product_analyzer_version, product_scoring_rule_version) WHERE competitor_product_id IS NOT NULL`
- `metrics` gains `win_rate`, `price_relation_counts`, `attribute_dimension_frequency`, `buyer_destination_mix`, `competitor_co_placement`, `per_engine`, and `per_surface`. `per_surface[surface]` contains the same aggregate shape plus nested `per_engine`; no additional snapshot row is needed per surface.
- Pin these JSONB values to the same strict shapes exposed by both visibility-entry DTOs:
  - `attribute_dimension_frequency`: `{group: {dimension: count}}`, concretely `dict[str, dict[str, int]]`; group and dimension keys are config-owned strings, counts are integers `>= 0`, an entry with no observations is `{}`, and CSV JSON serialization sorts both key levels.
  - `buyer_destination_mix`: `{"total": int >= 0, "by_kind": [{"merchant_kind": str, "count": int >= 0}], "by_domain": [{"merchant_domain": str, "merchant_name": str, "merchant_kind": str, "count": int >= 0}]}`. Sort `by_kind` by descending `count`, then `merchant_kind` ascending; sort `by_domain` by descending `count`, then `merchant_domain`, `merchant_name`, and `merchant_kind` ascending.
  - `competitor_co_placement`: `{"items": [{"competitor_product_id": UUID | null, "competitor_name": str, "product_name": str, "count": int >= 0}], "truncated": bool}`. Sort `items` by descending `count`, then casefolded `competitor_name`, casefolded `product_name`, and `str(competitor_product_id or "")` ascending. `truncated` is always present, including `false` for empty/uncapped results.

**Brand isolation model**

- Add `ResponseAnalysis.shopping_surface: String(32), default=SHOPPING_SURFACE_MEASUREMENT`. Choose this over relying only on the worker skip: `_execution_dicts()` builds per-engine denominators from `ResponseAnalysis`, and direct/retry/legacy write paths could otherwise contaminate brand metrics even when `AuditTask` queries are filtered.

**Audit slot models**

- Add `AuditTask.shopping_surface: String(32), default=SHOPPING_SURFACE_MEASUREMENT`.
- Widen `uq_audit_task_slot` to `(audit_id, prompt_index, repetition, logical_engine, shopping_surface)`.
- Add sibling `AuditShoppingSurfaceSnapshot`; do not widen `AuditEngineSnapshot`. Columns: `id UUID PK`, `audit_id UUID FK audits CASCADE/index`, `shopping_surface String(32)`, `logical_engine String(32)`, `transport_provider String(32)`, `transport_model String(255)`, `connection_id UUID | None FK provider_connections SET NULL`, `base_url String(1024) default ""`, `created_at`; unique `uq_audit_shopping_surface_snapshot_surface(audit_id, shopping_surface)`.
- Add `Audit.shopping_surface_snapshots` relationship and register/export `AuditShoppingSurfaceSnapshot` and `MerchantMention` in `models/__init__.py`. The empty gate means the planner creates no surface snapshot rows in M2a.

**DTOs**

- Add `shopping_surface: str = SHOPPING_SURFACE_MEASUREMENT` to `AuditTaskResponse`.
- Add `AuditShoppingSurfaceSnapshotResponse` and `AuditResponse.shopping_surface_snapshots` so the frozen identity has a response contract even though the default list is empty.

### Greenfield DB recreation

Use the existing bootstrap migration against a disposable DB: `cd backend && uv run alembic downgrade base && uv run alembic upgrade head` (or drop/create the disposable DB, then `upgrade head`). The test suite rebuilds `Base.metadata` in its throwaway session DB. Do not create `migrations/versions/0002_*.py` and never downgrade the developer’s non-disposable DB.

### Existing tests affected

- `backend/tests/component/test_audit_planner.py` exact slot shape and response snapshots.
- `backend/tests/component/test_audit_queue.py` queue-row fixtures/constraint expectations; set/assert measurement surface explicitly while preserving whole-queue behavior.
- `backend/tests/component/test_analysis_api.py`, `test_analysis_http.py`, and `analytics_helpers.py` direct `AuditTask`/`ResponseAnalysis` fixtures; stamp `shopping_surface=""` and update idempotency keys.
- `backend/tests/component/test_product_analysis_worker.py` snapshot uniqueness/idempotency assertions must key by entry plus current analyzer/rule version and assert v1 rows survive v2 re-score.

## 4. Analyzer v2 pure scoring [after 1, 2]

### File

- `backend/app/analysis/product_scoring.py`

### Changes

Factor the existing lines 223–234 window logic into one shared helper:

- `_line_clipped_window(text: str, offset: int, window: int) -> tuple[int, str]`

It returns the original-text absolute segment start plus the centered window clipped to the mention’s current line. `extract_price_mentions`, attribute extraction, and destination extraction all call it. Keep `_original_text_offset()` as the source mention coordinate; never use normalized offsets for context extraction.

Add these pure signatures:

- `price_relation(mentioned_value: float, mentioned_currency: str, entry: ProductEntry | CompetitorProductEntry, *, tolerance_pct: float = PRODUCT_PRICE_TOLERANCE_PCT, tolerance_abs: float = PRODUCT_PRICE_TOLERANCE_ABS) -> str | None`
- `extract_attribute_mentions(text: str, offset: int, dimensions: tuple[AttributeDimension, ...], window: int = PRODUCT_ATTRIBUTE_WINDOW_CHARS) -> list[dict[str, Any]]`
- `extract_destination_urls(text: str, offset: int, window: int = PRODUCT_ATTRIBUTE_WINDOW_CHARS) -> list[dict[str, Any]]`
- `classify_destination(url: str, *, owned_domains: tuple[str, ...]) -> dict[str, str]`

**Price direction.** Call `price_matches_catalog()` first. Return null in exactly its two unverifiable cases: absent catalog price, or both currencies present and unequal. Return `match` when its tolerance comparison is true. Otherwise return `higher` when mentioned price is above catalog and `lower` when below. Continue writing `price_matches_catalog` for compatibility.

**Attributes.** Select `ATTRIBUTE_DIMENSIONS["DEFAULT"] + ATTRIBUTE_DIMENSIONS.get(category, ())`, dedupe by dimension/group/absolute offset, match casefolded whole phrases in the original-text line-clipped window, and persist the exact matched substring plus original absolute offset. Frequency has no valence.

**Destinations.** Recognize absolute `http://`/`https://` URLs and markdown-link targets in the same line-clipped window. Sanitize every candidate with `sanitize_referral_url()` before returning it. Normalize its host, then classify in this order:

1. Any frozen `owned_domains` match via suffix-safe `domain_matches()` → `brand_site`.
2. Any `MERCHANT_DOMAINS` key match via `domain_matches()` → configured `marketplace`/`retailer` and configured display name.
3. Otherwise → `other`, with normalized host as `merchant_name`.

Deduplicate by sanitized URL. `notamazon.com` must remain `other`; a subdomain of `amazon.com` is Amazon marketplace. Reuse the first same-line price extraction as optional merchant price evidence.

**Execution score.** Extend each own/competitor signal with `price_relation`, `attribute_mentions`, and `merchant_mentions`. Keep the original `price_matches_catalog` field. Add deterministic co-placement input as the set of mentioned entry IDs per execution.

**Aggregation.** Extend `aggregate_product_run(scores, config)`:

- `win_rate`: when `PRODUCT_WIN_REQUIRES_ENUMERATION` is true, denominator is only this SKU’s mention rows with non-null `rank_position`; null when denominator is zero, `0.0` when denominator is positive and no rank is 1, otherwise rounded wins/denominator. Competitor SKUs use the same rule.
- `price_relation_counts`: count `match`, `higher`, `lower`; legacy false booleans count as `mismatch` only in mixed-version aggregation.
- `price_mismatch_rate`: `(higher + lower + legacy mismatch) / all verifiable relations`; null when no verifiable relation.
- `attribute_dimension_frequency`: exact `{group: {dimension: count}}` mapping with integer counts `>= 0`; use `{}` when no attributes are observed and stable key ordering when serialized.
- `buyer_destination_mix`: exact `{"total", "by_kind", "by_domain"}` shape from task 3. `total` counts all persisted destination observations; aggregate by kind and normalized domain, then sort `by_kind` by `(-count, merchant_kind)` and `by_domain` by `(-count, merchant_domain, merchant_name, merchant_kind)`.
- `competitor_co_placement`: for each mentioned entry, count co-occurring competitor-product IDs (exclude self), materialize the exact `{"items": [...], "truncated": bool}` shape from task 3, sort by `(-count, competitor_name.casefold(), product_name.casefold(), str(competitor_product_id or ""))`, retain at most `CO_PLACEMENT_MAX_PAIRS` items, and set `truncated` to whether additional candidate pairs were omitted. The old standalone `{"truncated": true}` sentinel is not valid.

### Existing tests affected

- `backend/tests/unit/test_product_scoring.py` exact signal/aggregate dictionaries gain fields; retain all existing v1 matching, price, rank, SOV, and determinism assertions.
- `backend/tests/component/test_product_analysis_worker.py` mention/snapshot assertions gain relation, attributes, destinations, win rate, mismatch rate, and co-placement.

## 5. Persist v2 rows and aggregate mixed versions [after 3, 4]

### Files

- `backend/app/analysis/product_service.py`
- `backend/app/workers/audit_worker.py`

### Changes

Change `analyze_task_products(session, *, task, config) -> ProductResponseAnalysis | None` idempotency to query by `(task.id, PRODUCT_ANALYZER_VERSION, PRODUCT_SCORING_RULE_VERSION)`. A v1 row no longer blocks a v2 write. Load the linked persisted `RawResponseArtifact` and score its `answer_text`; use `task.answer_text` only for legacy fixture rows with no artifact. Never call a provider.

Stamp `ProductResponseAnalysis.shopping_surface = task.shopping_surface`. Extend `_mention_row(...)` to write `price_relation` and `attribute_mentions`. Add `_merchant_rows(...) -> list[MerchantMention]` to persist one sanitized observed destination per product/competitor signal with the same analysis/artifact/version provenance and nullable live catalog FK behavior as `ProductMention`.

Change `finalize_audit_product_analysis()` to:

1. Keep the succeeded-task query unfiltered by surface; product analysis must cover measurement and future probe rows.
2. Ensure the current v2 row exists for each succeeded task.
3. Select one analysis per task for the v2 aggregate: prefer the exact current analyzer/rule pair, otherwise use the task’s v1 row. This is the mixed-version input rule; preserve all rows.
4. Build overall, per-engine, and per-surface aggregates from that selected persisted set. Surface aggregates come from `ProductResponseAnalysis.shopping_surface`; nested engine slices use both dimensions.
5. Find/update only the current-version snapshot keyed by `(entry_id, PRODUCT_ANALYZER_VERSION, PRODUCT_SCORING_RULE_VERSION)`. Never mutate a v1 snapshot.
6. Write exact selected `source_analysis_ids`/`source_artifact_ids` and the new scalar/JSON metrics.

In `_persist_success()`:

- Skip `build_scoring_config()` / `analyze_task()` and `task.score` assignment when `task.shopping_surface != SHOPPING_SURFACE_MEASUREMENT`.
- Keep `build_product_scoring_config()` / `analyze_task_products()` outside that branch so product probe evidence remains eligible.
- Keep the single commit after artifact, current analysis rows, attempts, and event.

### Existing tests affected

- `backend/tests/component/test_product_analysis_worker.py` currently drains a mocked-provider audit. Replace its M2a verification path with direct fixture `AuditTask` + persisted `RawResponseArtifact` rows and calls to `analyze_task_products()` / `finalize_audit_product_analysis()`; verify v1 row IDs remain and v2 rows/snapshots are new.
- `backend/tests/component/test_audit_worker.py` assumes every succeeded task writes brand analysis. Add explicit measurement/probe fixture assertions: probe success writes product analysis only; measurement row counts, `MetricSnapshot`, and brand `ResponseAnalysis` counts remain unchanged.

## 6. Slot identity, brand isolation, and all 13 query sites [after 3]

### Files

- `backend/app/domain/audits/planner.py`
- `backend/app/workers/audit_worker.py`
- `backend/app/analysis/service.py`
- `backend/app/domain/analysis/service.py`
- `backend/app/domain/products/visibility.py`
- `backend/app/orchestration/postgres_task_queue.py` — review-only; no filter change.

### Planner changes

Measurement slots remain `(prompt_index, engine, repetition)` because fanout/probes are excluded, but every constructed task explicitly sets `shopping_surface=SHOPPING_SURFACE_MEASUREMENT`.

Change the key to:

`f"{audit.id}:{prompt_index}:{repetition}:{engine}:{SHOPPING_SURFACE_MEASUREMENT}"`

The trailing empty segment is intentional and reserves the surface identity. `requested_count` and the max-task guard remain `len(prompts) * len(engine_list) * reps`; `SHOPPING_SURFACES` does not multiply tasks in M2a.

Eager-load `Audit.shopping_surface_snapshots` beside engine snapshots in `get_audit()`/`list_audits()`; the list is empty under the disabled gate.

### Exact 13-site audit

1. `workers/audit_worker.py:915-923` remaining non-terminal count — add `AuditTask.shopping_surface == SHOPPING_SURFACE_MEASUREMENT`.
2. `workers/audit_worker.py:924-929` succeeded count — add the same filter before writing `audit.completed_count`.
3. `workers/audit_worker.py:930-934` total count — add the same filter before deriving `failed_count`.
4. `analysis/service.py:232-235` provider-metadata map — add the measurement filter so brand cost/token input excludes probes.
5. `analysis/service.py:277-280` defensive succeeded-task loop — add the measurement filter so finalize cannot recreate skipped brand rows.
6. `domain/analysis/service.py:245-268` brand evidence join — filter both `AuditTask.shopping_surface` and `ResponseAnalysis.shopping_surface` to measurement.
7. `domain/analysis/service.py:391-410` brand export task list — hard-filter measurement rows; default brand exports remain unchanged.
8. `domain/audits/planner.py:488-497` `list_tasks()` — change signature to `list_tasks(..., surface: str = SHOPPING_SURFACE_MEASUREMENT) -> list[AuditTask]` and filter exact surface. This powers the executions listing default; it is not a hard-coded brand-only query because callers can request a configured surface.
9. `orchestration/postgres_task_queue.py:101-124, 142/153/167/216/240/256, 290-300` claim, row transitions, and sweeper — do **not** add a surface filter. The ordinary queue must lease/heartbeat/finalize/reclaim every task identity.
10. `workers/audit_worker.py:367-370, 448-453, 598-610` task load/lock by primary key — do **not** filter; a claimed probe task must still resolve and transition.
11. `domain/audits/planner.py:524-535` whole-audit cancel — do **not** filter; cancellation terminalizes all surface tasks.
12. `analysis/product_service.py:232-243` succeeded-task product pass — do **not** hard-filter; group persisted analyses by `shopping_surface` later.
13. `domain/products/visibility.py:207-228` product evidence join — do **not** hard-filter measurement. Add an exact `surface` predicate supplied by the product endpoint, defaulting to measurement in M2a.

Also filter the initial `ResponseAnalysis` load in `analysis/service.py::_execution_dicts()` by `ResponseAnalysis.shopping_surface == SHOPPING_SURFACE_MEASUREMENT`. This is the chosen fix for the denominator question: task-only filtering does not constrain the rows used to build `per_engine`.

### Existing tests affected

- `backend/tests/component/test_audit_planner.py`: idempotency strings now end in `:`, deterministic slot tuples become `(prompt_index, repetition, logical_engine, shopping_surface)`, and default `list_tasks()` returns measurement rows.
- `backend/tests/component/test_audit_queue.py`: verify queue claim/transition/sweeper still process non-empty surfaces.
- `backend/tests/component/test_audit_worker.py`: progress/completion and brand per-engine metrics must be numerically identical with an additional terminal probe row.
- `backend/tests/component/test_analysis_api.py`: direct evidence fixtures set surface; add a probe `ResponseAnalysis` and assert it is excluded from brand evidence/denominators.
- `backend/tests/component/test_analysis_http.py`: update exact keys and assert `/audits/{id}/executions` defaults to measurement.
- `backend/tests/component/analytics_helpers.py`: stamp measurement surface on helper-created tasks/analyses so analytics fixtures remain explicit and deterministic.

## 7. Product projections and existing API routes [after 5, 6]

### Files

- `backend/app/domain/products/schemas.py`
- `backend/app/domain/products/visibility.py`
- `backend/app/api/products.py`
- `backend/app/api/audits.py`
- `backend/app/api/executions.py` — no route change; retain single-execution evidence ownership.

### Product DTOs

Add `product_analyzer_version` to every row-level derived response DTO:

- `ProductVisibilityEntry.product_analyzer_version: str`
- `CompetitorProductVisibilityEntry.product_analyzer_version: str`
- retain `ProductVisibilityResponse.product_analyzer_version`
- `ProductEvidenceItem.product_analyzer_version: str`

This avoids using only `snapshots[0]` to label potentially mixed evidence. Historical v1 responses carry their actual v1 string; v2 snapshot responses carry `product-analysis-2`.

Add visibility fields to both own and competitor entries:

- `win_rate: float | None`
- `price_mismatch_rate: float | None`
- `price_relation_counts: dict[str, int]`
- `attribute_dimension_frequency: dict[str, dict[str, int]]`, exactly `{group: {dimension: count >= 0}}`, with `{}` for no observations.
- `buyer_destination_mix: BuyerDestinationMix`, where `BuyerDestinationMix(total: int >= 0, by_kind: list[BuyerDestinationKindCount], by_domain: list[BuyerDestinationDomainCount])`, `BuyerDestinationKindCount(merchant_kind: str, count: int >= 0)`, and `BuyerDestinationDomainCount(merchant_domain: str, merchant_name: str, merchant_kind: str, count: int >= 0)` map exactly to the task 3 JSONB shape and ordering.
- `competitor_co_placement: CompetitorCoPlacement`, where `CompetitorCoPlacement(items: list[CompetitorCoPlacementItem], truncated: bool)` and `CompetitorCoPlacementItem(competitor_product_id: uuid.UUID | None, competitor_name: str, product_name: str, count: int >= 0)` map exactly to the task 3 JSONB shape and ordering.

Generalize evidence items with `evidence_kind: str` using config-owned values `product_mention`, `attribute_mention`, and `buyer_destination` (add these three constants and their frozenset to `commerce.py`). **Pin the exact projected key set** (the frontend schema is `.strict()`, so every key emitted must be declared and no undeclared key may be emitted; and every declared key must be emitted). Build on the CURRENT `ProductEvidenceItem` coordinate baseline (`domain/products/schemas.py:223-243`) so nothing the frontend already renders is dropped.

Common fields on every row (all kinds): `evidence_id`, `analysis_id`, `evidence_kind`, `audit_id`, `task_id`, `artifact_id`, `logical_engine`, `transport_model`, `prompt_text`, `prompt_index`, `repetition`, `product_analyzer_version`, `shopping_surface`, `matched_name`, `matched_sku`, `created_at`.

Product-mention fields (nullable unless noted; present on every row, null for non-`product_mention` kinds): `first_offset`, `rank_position`, `price_value`, `price_matches_catalog`, `price_relation`; `price_text` and `price_currency` (strings, `""` when absent). These are populated for `product_mention` rows from the persisted `ProductMention`.

Attribute-mention fields (nullable; null for non-`attribute_mention` kinds): `attribute_dimension`, `attribute_group`, `attribute_text`, `attribute_offset`.

Buyer-destination fields (nullable; null for non-`buyer_destination` kinds): `merchant_name`, `merchant_domain`, `merchant_kind`, `destination_url`.

Do NOT emit a top-level `mention_id` key: `ProductMention.id` already surfaces as `evidence_id` for `product_mention` rows, and `analysis_id` is present on all rows (it is also an input to the UUIDv5 tuple), so a separate `mention_id` would be an undeclared strict-schema key. Emit one base product mention item, one item per persisted `attribute_mentions` object, and one item per `MerchantMention` row.

Set stable evidence identity as follows:

- `product_mention`: `evidence_id = ProductMention.id`.
- `buyer_destination`: `evidence_id = MerchantMention.id`.
- `attribute_mention`: `evidence_id = uuid.uuid5(PRODUCT_ATTRIBUTE_EVIDENCE_NAMESPACE, f"{analysis_id}:{mention_id}:{dimension}:{offset}")`, using canonical UUID strings, the persisted config-owned dimension string, and the persisted original-text integer offset. This requires no table and returns the same UUID across repeated reads of the same persisted JSONB item.

`evidence_id` exists only for stable row identity, pagination keys, and frontend rendering keys. It never replaces `artifact_id`, `analysis_id`, or `product_analyzer_version`; provenance fields remain on every projected row under invariants 4 and 7. (`mention_id` is used only internally as an input to the UUIDv5 tuple for `attribute_mention` rows; it is not emitted as a top-level DTO key — `ProductMention.id` is already exposed as `evidence_id`.)

Add `ProductVisibilityResponse.available_surfaces: list[str]`. Build it from distinct `ProductResponseAnalysis.shopping_surface` values persisted for the selected audit, union `SHOPPING_SURFACE_MEASUREMENT`, and order measurement first followed by non-empty values ascending. Under the disabled gate it is exactly `[""]`. The client labels `""` as “Answer-engine APIs”; there is no synthetic “all surfaces” value, and omitting `?surface=` continues to select measurement rather than aggregate surfaces.

### Mixed-version projection rule

Put the read fallback in `domain/products/visibility.py`, not in ORM mutation:

- `_project_price_relation(price_relation: str | None, price_matches_catalog: bool | None) -> str | None`
- Return persisted `price_relation` when non-null.
- Otherwise return `match` for `True`, `mismatch` for `False`, and null for `None`.

For a v1 snapshot with no v2 relation counts, return an empty `price_relation_counts` and derive `price_mismatch_rate` as null when `price_accuracy_rate` is null, otherwise `round(1 - price_accuracy_rate, 4)`. The v1 `product_analyzer_version` tells clients that mismatch direction is unavailable; never infer higher/lower.

Change `_entry_metrics(snapshot, engine, surface)` to read only persisted columns/`metrics`. Default `surface` is `SHOPPING_SURFACE_MEASUREMENT`; non-empty configured surfaces read `metrics["per_surface"][surface]`, then the optional nested engine aggregate. Count `total_analyses` with the same exact `ProductResponseAnalysis.shopping_surface` filter.

### Route extensions only

- `GET /projects/{project_id}/products/visibility`: add `surface: Query(str) = SHOPPING_SURFACE_MEASUREMENT` beside `engine`.
- `GET /products/{product_id}/visibility/evidence`: add the same `surface` parameter and project the three evidence kinds.
- `GET /projects/{project_id}/products/visibility/export.csv`: add `surface`, pass it through bundle/rendering, and do not add a route.
- `GET /audits/{audit_id}/executions` in `api/audits.py`: add `surface: Query(str) = SHOPPING_SURFACE_MEASUREMENT`, pass to `list_tasks()`, and serialize `AuditTaskResponse.shopping_surface`.
- `api/executions.py` remains the single execution-detail route; no listing is added there. A probe execution ID can still be loaded by ID because site 10 is intentionally unfiltered.

Validate a requested surface against `{SHOPPING_SURFACE_MEASUREMENT, *SHOPPING_SURFACES}` and return 422 for unknown values. Tests may monkeypatch the gate with a fixture surface; shipped config stays empty.

### CSV columns

Keep existing columns and append in this exact order:

`product_analyzer_version`, `surface`, `win_rate`, `price_mismatch_rate`, `price_relation_match_count`, `price_relation_higher_count`, `price_relation_lower_count`, `price_relation_mismatch_count`, `attribute_dimension_frequency`, `buyer_destination_mix`, `competitor_co_placement`.

Serialize the three structured cells as stable JSON (`sort_keys=True`, compact separators) after applying the pinned list ordering above, so repeated reads and CSV exports are byte-stable. Keep `csv_cell()` protection for user-controlled product/SKU text and blank cells for null rates.

### Existing tests affected

- `backend/tests/component/test_product_visibility_api.py`: response exact fields, evidence shape/kinds, surface default/filter, analyzer version per item, and CSV header/order all change.
- `backend/tests/component/test_analysis_http.py`: executions list response gains `shopping_surface` and defaults to measurement.
- No new endpoint tests belong in `api/executions.py`; update only single-ID behavior to confirm a directly selected probe ID remains retrievable if it has brand evidence.

## 8. Focused test plan and fixture-only verification [after 1–7]

### New tests required by §14

1. `backend/tests/unit/test_product_scoring_v2.py`
   - Win rate: rank-1 win; ranked non-win gives `0.0`; no ranked mention gives null; a competitor-only enumeration where the SKU is absent does not enter the denominator; competitor SKU parity.
   - Price relation: exact/tolerance match, higher, lower, absent catalog price null, currency mismatch null, and compatibility bool still written.
   - Shared window: price/attribute/URL extraction use original offsets, stay on the mention line, and do not steal a neighboring list item’s evidence.
   - Attributes: each approved category plus unknown/empty category fallback; DEFAULT dimensions always included; dedupe and original absolute offsets; no sentiment/valence.
   - Destinations: owned domain, marketplace, retailer, other, sanitized credentials/fragments/query params, Amazon subdomain match, and `notamazon.com` non-match.
   - Destination mix: exact strict shape, `total`, deterministic `by_kind` and `by_domain` ordering, and byte-equal repeated aggregation.
   - Co-placement: exact `items`/always-present `truncated` shape, own/competitor counts, deterministic `(-count, name, product, id)` ordering, exact cap boundary, and over-cap `truncated=true`.
   - Determinism: repeated scoring/aggregation of identical fixture text is byte-equal.

2. `backend/tests/component/test_products_visibility_api.py`
   - Seed audit/task/artifact/product rows directly; call product analyzer/finalizer without a provider.
   - Re-score a task with a persisted v1 product analysis: v1 analysis/mention/snapshot IDs remain; v2 rows are added; current projection chooses v2.
   - Mixed selected analyses: a v1-only task plus v2 task renders `match | mismatch` fallback for legacy evidence and actual direction for v2, each with its analyzer version.
   - `?surface=` measurement default and fixture-surface slicing for visibility, evidence, totals, and export; optional `engine` intersects the selected surface; `available_surfaces == [""]` with the disabled gate and becomes measurement-first plus persisted fixture surfaces when seeded.
   - Evidence kinds include base mention, each attribute mention, and each sanitized buyer destination; assert PK-backed IDs for product/destination rows and the same UUID5 `evidence_id` for an attribute row across two projection reads.
   - Visibility entries and persisted snapshot metrics use the exact strict aggregate shapes; both aggregate lists retain deterministic ordering and `competitor_co_placement.truncated` is always present.
   - Exact CSV columns/order, null-vs-zero cells, byte-stable structured JSON cells, and formula neutralization.
   - Workspace isolation and projection-only behavior.

3. `backend/tests/component/test_audit_task_slot_surface.py`
   - Introspect `uq_audit_task_slot` columns in exact order.
   - Same audit/prompt/repetition/engine can persist measurement and fixture surface tasks; duplicate same-surface slot fails.
   - Idempotency key includes the surface segment and remains unique.
   - Planner freezes `shopping_surfaces=[]`, creates only measurement tasks/snapshots, and keeps requested count unchanged.
   - Fixture probe success produces product analysis but no brand analysis.
   - Add a probe task/analysis sharing a logical engine and prove brand overall/per-engine denominators, progress counts, evidence, and export are identical to the measurement-only baseline.
   - Executions listing defaults to measurement; explicit fixture surface lists only probe rows; queue/cancel/by-ID paths still include probes.

### Existing test updates

- `backend/tests/unit/test_product_shim.py` — exact frozen `attributes` bag/category.
- `backend/tests/unit/test_product_scoring.py` — new dataclass fields and expanded exact score dictionaries while preserving M1 cases.
- `backend/tests/component/test_audit_planner.py` — trailing surface key segment, four-part visible slot tuple, empty gate/config/snapshot list.
- `backend/tests/component/test_audit_queue.py` — explicit surface fixtures and proof that claim/transition/sweeper are not filtered.
- `backend/tests/component/test_audit_worker.py` — brand skip/progress denominator regression with fixture probe row.
- `backend/tests/component/test_analysis_api.py` — explicit measurement fixtures and brand evidence/per-engine exclusion.
- `backend/tests/component/test_analysis_http.py` — idempotency fixtures, execution surface field/default filter.
- `backend/tests/component/test_product_analysis_worker.py` — replace provider-drain M2a setup with persisted artifacts and direct re-score/finalize; assert all new rows/metrics/provenance and immutable v1 coexistence.
- `backend/tests/component/test_product_visibility_api.py` — update existing M1 projection expectations for added fields/evidence/CSV contract; leave the new plural v2 file focused on §14 mixed-version/surface cases.
- `backend/tests/component/analytics_helpers.py` — explicit measurement surfaces on direct audit/task/analysis fixtures.

### Verification constraints and commands

There are no usable LLM provider credentials in this sandbox. Do not create or drain a live audit and do not depend on `build_adapter`. All M2a scoring verification must use fixture answer text and persisted `RawResponseArtifact` rows, then call deterministic re-scoring/finalization. Planner/queue tests may create tasks but must not execute provider calls.

From `backend/`:

- `uv run pytest tests/unit/test_product_scoring.py tests/unit/test_product_scoring_v2.py tests/unit/test_product_shim.py -q`
- `uv run pytest tests/component/test_audit_task_slot_surface.py tests/component/test_product_analysis_worker.py tests/component/test_product_visibility_api.py tests/component/test_products_visibility_api.py -q`
- `uv run pytest tests/component/test_audit_planner.py tests/component/test_audit_queue.py tests/component/test_audit_worker.py tests/component/test_analysis_api.py tests/component/test_analysis_http.py -q`
- `uv run ruff check app/core/config/commerce.py app/core/config/products.py app/models/product.py app/models/analysis.py app/models/audit.py app/analysis/product_scoring.py app/analysis/product_service.py app/domain/products app/domain/audits app/workers/audit_worker.py app/analysis/service.py app/domain/analysis/service.py app/api/products.py app/api/audits.py tests/unit/test_product_scoring_v2.py tests/component/test_audit_task_slot_surface.py tests/component/test_products_visibility_api.py`
- Against a disposable DB only: `uv run alembic downgrade base && uv run alembic upgrade head`.

## Questions not answerable from the current code

None. The source doc’s executions-listing location is stale; the current owner is `api/audits.py` (`GET /audits/{audit_id}/executions`), while `api/executions.py` owns only single-ID evidence. The plan follows the verified context.