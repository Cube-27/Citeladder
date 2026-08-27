# CiteLadder — Internal Link Graph + Page Type Reliability Plan
Generated: 2026-08-27

## Scope

Implement only:

1. **Internal Link Graph**
2. **Crawl-relative Internal Page Authority (Internal PageRank)**
3. **Page-type classifier reliability fixes required to stop false/missed Site Health issues**

No external data. No Common Crawl, CrUX, GSC, Moz, Ahrefs, DataForSEO or LLM classifier.

This plan is intentionally grounded in the current CiteLadder architecture. It does **not** create a second crawler, a second URL model, a second SEO analysis pipeline, or a new page-analysis owner.

---

## 1. What the current repo already owns

### Acquisition / evidence
- `backend/app/models/site_health/acquisition.py`
  - `SiteFetchArtifact.normalized_facts` is immutable normalized page evidence.
  - raw HTML is intentionally not persisted.
- `backend/app/analysis/site_health/parser.py`
  - deterministic page facts.
- `backend/app/analysis/site_health/fact_links.py`
  - already extracts normalized internal/external links and relation flags.

### URL / crawl identity
- `backend/app/models/site_health/urls.py`
  - `SiteUrl`: stable normalized URL identity.
  - `SiteUrlObservation`: immutable per-crawl discovery provenance, final URL and depth.

### Page understanding
- `backend/app/models/site_health/analysis.py`
  - `SitePageAnalysis` is explicitly the single page-understanding owner.
  - page kind, classifier version and evidence are already persisted append-only.

### Crawl aggregate
- `backend/app/models/site_health/snapshot.py`
  - `SiteHealthSnapshot` is the immutable crawl-level aggregate.

### Current classifier
- `backend/app/analysis/site_health/page_kinds.py`
- `backend/app/analysis/site_health/content_heuristics.py`
- `backend/app/core/config/site_health_taxonomy.py`

### Current frontend
- `frontend/lib/site-health/page-kinds.ts` owns page-kind labels/evidence parsing.
- `frontend/components/site-health/url-detail.tsx` already has a Links tab.
- Site Health crawl pages already have overview/pages/detail routing.

**Architectural rule:** preserve these ownership boundaries.

---

# 2. Audit result: current page-type classifier has real failure modes

## A. Best&Less legacy PDP route is hydration-dependent

Best&Less PDPs live under paths like:

`/Categories/.../Product-Name/SKU`

Current classifier:
- `/Categories/` => `category` path signal, weight 0.8.
- Product content => only when body contains both price and a configured cart marker.
- A category-path winner can be overridden only by that visible product content signal.
- Product structured data is recorded but deliberately cannot override the path winner.

Two live pages from the same PDP family behaved differently:

### PDP with hydrated commerce controls
`.../Boys-Zip-Hoodie/W25YB695_1626156_BLACK_SOLID`

Observed:
- `$18.00`
- sizes
- `Add to bag`
- product H1

Current logic can recover `product`.

### PDP with incomplete commerce rendering
`.../Womens-Tiered-Gathered-Maxi-Dress/WR2560_1845748_DARK_RED_TIBETAN_RED_SOLID`

Observed:
- `Product Description`
- `Select size`
- `Home delivery`
- `Click & Collect`
- no visible price in the captured primary body
- no configured cart marker in the captured primary body

Current logic therefore has only the `/Categories/` path winner and can classify a real PDP as `category`.

**Conclusion:** page kind is partly determined by transient rendering state instead of stable primary-entity evidence.

---

## B. Best&Less flat category pages can become `other`

Representative:
`https://www.bestandless.com.au/womens-dresses`

Observed:
- Filters
- 56 results
- Sort by
- dozens of product prices
- dozens of product links
- category H1
- long category copy

The route has no `/category/`, `/categories/`, `/collection/` or `/catalog/` segment. A flat ecommerce category therefore depends on optional schema/other evidence and can fall to `other`.

**Conclusion:** category classification is too URL-centric and lacks a true listing-structure signal.

---

## C. Product recommendation modules can convert policy pages into products

Representative:
`https://www.ilovedooney.com/pages/refund-policy`

Primary content is clearly:
- Returns policy
- return window
- Returns FAQ
- Repair Program

But the same page contains a secondary “You May Also Like” module with:
- multiple prices
- multiple `Add To Bag` CTAs

Current whole-body product heuristic is:
`price exists anywhere in body` + `cart marker exists anywhere in body`

The route `/pages/refund-policy` does not match a recognized path family, so the recommendation carousel can become the winning `product` signal.

**Conclusion:** commerce classification must reason about the **primary entity**, not global page text.

---

## D. Generic route tokens create wrong semantic types

Examples:
- Best&Less `/help/how-to-shop-online`
  - current path family: FAQ because `/help/`
  - actual: guide/how-to
- Best&Less `/company/privacypolicy`
  - current: no exact privacy segment => likely `other`
  - actual: trust/policy
- I Love Dooney `/pages/care-cleaning`
  - current: `other`
  - actual: guide
- I Love Dooney `/pages/shipping`
  - current: `other`
  - actual: service/support
- I Love Dooney `/pages/store-locator`
  - current: `other`
  - actual: locator/service, not one local business page

---

# 3. Report-quality problem caused by incorrect page kind

Current rule applicability is page-kind scoped. This is good in principle, but a wrong type means the wrong report.

Example: real Best&Less PDP classified as `category`:
- true product-only rules can become **not applicable** -> missed product issues.
- category schema rules become applicable -> false category issues.

There is a second independent problem:
`aeo.schema_expected_for_type` is currently HIGH severity, weight 3.0 and defaults to finding class `defect` for every non-`other` page type.

That makes optional schema recommendations capable of materially lowering Site Health scores.

Examples that should not automatically be HIGH defects:
- generic service page lacking `Service`
- trust/policy page lacking `WebPage`
- a store locator index lacking one `LocalBusiness`
- category page choosing useful BreadcrumbList markup but not a particular preferred type

## Required reporting change

Separate:

### Defect
Evidence says the page is technically wrong/broken/inconsistent.

### Advisory
Valid enhancement that may improve machine understanding but is not required for correctness.

At minimum:
- `aeo.schema_expected_for_type` -> advisory / zero or low score weight unless the type has a genuinely required contract.
- `aeo.schema_recommended_present` stays advisory.
- `aeo.schema_required_valid` may remain a defect **only when an expected schema object actually exists and required properties for that chosen schema type are malformed/missing**.
- Product offer/schema parity rules can stay stricter when the page is independently identified as a PDP.

Do not make classification success itself depend on satisfying the same rule being scored.

---

# 4. Page classifier v3 — minimal structural fix

Do **not** replace the deterministic classifier with an LLM.

Keep current:
- path signal
- confidence/evidence
- alternatives
- conflicts
- classifier versioning
- fail-closed `other`

Add deterministic **primary-entity structural signals**.

## 4.1 Extract bounded primary-entity commerce facts

Add a small extractor module, e.g.:

`backend/app/analysis/site_health/page_entity_signals.py`

It should read the already-fetched soup/facts once and emit bounded facts such as:

```json
{
  "primary_entity": {
    "product": {
      "top_level_product_schema_count": 1,
      "has_offer": true,
      "has_product_og_type": true,
      "has_product_price_meta": true,
      "has_primary_price": true,
      "has_primary_purchase_control": true,
      "has_variant_control": true,
      "has_sku_or_product_id": true
    },
    "listing": {
      "has_result_count": true,
      "has_sort_control": true,
      "has_filter_controls": true,
      "repeated_product_candidate_count": 56,
      "distinct_visible_price_count": 20
    },
    "location": {
      "local_business_entity_count": 1,
      "has_address": true,
      "has_phone": true,
      "has_hours": true
    }
  }
}
```

The exact DOM selectors must be generic structural logic, not site/domain constants.

### Important
Do not scan global body text for product identity.

Recommendation carousels, nav carts, footer promos and related-product widgets are secondary modules.

A product signal must describe the page's **primary product entity**.

---

## 4.2 Product decision

Strong product evidence can override a category ancestor path when one of these is true:

- exactly one top-level Product entity + Offer/product metadata; OR
- primary product region has price + purchase control + at least one corroborator:
  variant control / SKU-product-id / product-specific OG/meta / product H1 context.

A list page with 30 product cards must not become one product.

Do not use a Best&Less SKU regex.

---

## 4.3 Category/listing decision

Add a listing signal independent of URL:

Strong category evidence requires a combination such as:
- result count or product-grid cardinality
- sort/filter controls
- repeated product candidates / repeated product links
- multiple distinct prices
- CollectionPage/ItemList may corroborate

BreadcrumbList alone is not a category signal.

This catches flat slugs such as `/womens-dresses`.

---

## 4.4 Semantic fallback for informational pages

Add title/H1 semantic signals with bounded config-owned vocabulary.

Examples:
- trust/policy: privacy, accessibility, returns policy, terms, data/privacy choices, guarantee
- guide: how to, care & cleaning, guide
- about/contact
- service/support: shipping, payments, repair, registration, returns portal

These are fallback signals, weaker than strong primary-entity evidence.

Do not put domain-specific page names in code.

---

## 4.5 Single local page vs locator index

Current route family treats `/store/...` as local.

Keep `/store/<specific location>` local when primary page contains a single address/phone/hours entity.

A store finder/locator containing many locations must not be treated as one LocalBusiness page.

Do not add a new page kind unless necessary for the product UX. A locator can remain `service`/`other`; the key is preventing LocalBusiness false defects.

---

## 4.6 Conflict handling

Current classifier already persists conflicts. Use them.

For type-specific scoring:
- if a weak path signal conflicts with a strong primary-entity signal, primary entity wins.
- if evidence remains materially ambiguous, lower confidence or return `other`.
- never run a high-impact type-specific defect solely because an ancestor path token won while strong conflicting evidence exists.

---

# 5. Internal Link Graph architecture

## 5.1 Do not change the crawler

`fact_links.py` already emits internal links from the fetched page.

No second crawl.
No external API.
No new HTTP requests.
No LLM.

## 5.2 Do not put graph metrics in `SitePageAnalysis`

`SitePageAnalysis` is append-only page understanding from one page artifact.

PageRank is **crawl-global**: a page's value depends on every other page.

Mutating page-analysis rows after crawl completion would violate their current ownership/provenance model.

## 5.3 Add two derived crawl-scoped persistence projections

### `SiteLinkEdge`

New model under `backend/app/models/site_health/links.py`.

Suggested columns:

- `id`
- `workspace_id`
- `project_id`
- `crawl_id`
- `source_site_url_id`
- `target_site_url_id` nullable if target is internal but outside admitted crawl
- `resolved_target_site_url_id` nullable
- `target_normalized_url`
- `anchor_text` bounded
- `is_nofollow`
- `is_sponsored`
- `is_followable`
- `created_at`

Constraints/indexes:
- unique `(crawl_id, source_site_url_id, target_normalized_url)`
- index `(crawl_id, source_site_url_id)`
- index `(crawl_id, resolved_target_site_url_id)`
- tenant-consistent composite FKs following current Site Health model pattern.

Preserve the raw link destination for diagnostics.
Resolve redirects only for the authority graph.

### `SitePageLinkMetric`

New immutable row per `(crawl_id, site_url_id)`:

- `workspace_id`
- `project_id`
- `crawl_id`
- `site_url_id`
- `internal_inbound_count`
- `internal_outbound_count`
- `followable_inbound_count`
- `followable_outbound_count`
- `pagerank_raw`
- `authority_rank`
- `authority_percentile`
- `crawl_depth`
- `algorithm_version`
- `source_edge_count`
- `created_at`

Unique `(crawl_id, site_url_id)`.

Do not call the numeric field `page_authority` in storage; that term is overloaded with external vendor metrics.

---

# 6. Graph building stage

Add a pure module:

`backend/app/analysis/site_health/link_graph.py`

Inputs:
- crawl URL identities / observations
- persisted normalized internal-link facts

Outputs:
- canonicalized edge DTOs
- per-node metrics
- crawl-level graph summary

The worker runs it **once after page analysis/reconciliation and before final SiteHealthSnapshot is written**.

Do not calculate PageRank per page worker.

## URL handling

Reuse existing Site URL normalization and identities.

Do not implement a graph-specific URL normalizer.

### Redirects
For authority flow:
- preserve original edge for diagnostics
- resolve destination through crawl-known redirect/final-URL evidence
- PageRank flows to the resolved final crawl node
- collapse duplicate resolved source->target edges for authority math

### Canonicals
Do not collapse canonical URLs in v1.
Canonical is advisory; collapsing would hide internal links to duplicate/noncanonical pages.

### Off-crawl internal URLs
Keep them as diagnostic internal targets, but they are not authority nodes unless they are part of the admitted crawl.

The UI must say authority is based on the current crawl corpus.

---

# 7. Internal PageRank algorithm

Deterministic standard PageRank:

- damping = `0.85`
- max iterations = `100`
- convergence tolerance = `1e-10`
- initialize uniformly
- dangling mass redistributed uniformly
- graph uses unique **followable** internal resolved edges
- nofollow/sponsored edges remain visible in graph diagnostics but do not pass default authority
- deterministic sorted node order
- tie-break rank by normalized URL/site_url_id

Store:
- raw PageRank (sum approximately 1)
- authority rank: 1..N
- percentile for UI convenience

## Product language

UI label: **Internal Authority**

Tooltip:

> Crawl-relative internal link equity calculated from this crawl's internal link graph. It is not Google PageRank, Moz Page Authority, or an external domain-authority metric.

Never market a 500-page capped crawl as whole-site authority.

---

# 8. Crawl-level graph summary

Extend the existing crawl snapshot DTO/API with a bounded graph summary, e.g.:

```json
{
  "link_graph": {
    "node_count": 500,
    "edge_count": 18420,
    "followable_edge_count": 17901,
    "authority_algorithm": "internal_pagerank_v1",
    "coverage_label": "500 crawled HTML pages",
    "top_authority_pages": [
      {"site_url_id": "...", "rank": 1, "pagerank": 0.0412}
    ]
  }
}
```

The relational metric table is the page-level source of truth; summary is only the bounded crawl projection.

---

# 9. Backend API

Extend existing Site Health routes/DTOs rather than making a parallel SEO API.

Needed surfaces:

## Pages list
Add optional fields:
- `internal_authority_rank`
- `internal_authority_percentile`
- `internal_inbound_count`
- `internal_outbound_count`

Add sort keys:
- authority
- inbound
- outbound

## URL detail
Add:
```json
"link_graph": {
  "pagerank_raw": 0.0,
  "authority_rank": 0,
  "authority_percentile": 0.0,
  "internal_inbound_count": 0,
  "internal_outbound_count": 0,
  "crawl_depth": 0,
  "top_inbound": [],
  "top_outbound": []
}
```

Top neighbors should be bounded/paginated.

## Crawl graph
Add one bounded endpoint for visualization:
- nodes: default top authority subset, max hard cap
- edges only among returned nodes unless explicitly paginated
- filters: page kind, depth, issue presence
- never return tens of thousands of edges into the browser by default

---

# 10. Frontend

Do not create a new top-level product/module.

## Existing Pages table
Add columns:
- Internal Authority (rank or percentile)
- Inbound
- Outbound

Sortable.

## Existing per-URL Links tab
Extend it instead of creating another page:
- Internal Authority
- crawl rank, e.g. `12 / 500`
- inbound links
- outbound links
- crawl depth
- top linking pages
- top linked pages
- nofollow/sponsored counts

## Crawl view
Add a **Link Graph** secondary view near Pages/Overview.

Graph behavior:
- render a bounded subset by default
- prioritize high-authority nodes
- search URL
- filter by page type/depth
- click node -> existing URL detail route
- no force-directed 500-node hairball on initial load

A useful first visual can be a ranked/network table plus graph subset. Do not let visualization complexity block the backend metric.

---

# 11. Tests / eval gates

Use `citeladder_page_type_link_graph_eval.json`.

## Page-type gates

Must-pass exact regressions:
1. Best&Less category-nested PDP with missing price/CTA capture -> product
2. Same family with hydrated Add-to-bag -> product
3. Best&Less flat `/womens-dresses` -> category
4. I Love Dooney Returns page with recommendation carousel -> trust_policy, never product
5. `/help/how-to-shop-online` -> guide, not FAQ
6. Best&Less `/company/privacypolicy` -> trust_policy
7. I Love Dooney care & cleaning -> guide
8. I Love Dooney store locator -> service/locator behavior, never one LocalBusiness page

No regressions:
- I Love Dooney `/products/*` product
- I Love Dooney `/collections/*` category
- `/blogs/*` article
- homepage homepage
- Best&Less `/store/<location>` local

## Anti-gaming
A change fails if it:
- hardcodes either benchmark domain
- adds benchmark URL/slug exceptions
- matches Best&Less SKU formats
- checks Shopify platform/domain to choose a type
- uses LLM/web/external API for page kind
- makes Product schema the only independent method of identifying a product
- uses whole-body price/cart text without primary-entity scoping

## Report gates
For every eval case:
- correct page kind
- expected type-specific rules applicable
- unrelated type-specific rules N/A
- recommendation schema findings are advisory where optional
- no product finding caused solely by recommendation widgets

---

# 12. Link graph tests

Unit fixtures:

### Simple chain
A -> B -> C
- C authority > B > A
- inbound counts exact

### Star
A -> B,C,D,E and B,C,D,E -> A
- A highest authority

### Dangling node
A -> B; B -> none
- convergence and mass conservation

### Redirect
A -> /old; /old -> /new
- diagnostic edge preserves /old
- authority edge resolves to /new

### Nofollow
A -> B nofollow
- visible in edge inventory
- excluded from default followable authority adjacency

### Duplicate links
A links B five times
- one authority edge
- no five-times PageRank amplification

### Off-crawl internal
A -> internal URL not in crawl
- diagnostic target retained
- not silently made an authority node

### Determinism
Random DB/input order must produce identical metrics/ranks.

### Scale
500 nodes / realistic ecommerce edge count:
- graph build is CPU/local DB only
- no network calls
- bounded completion before crawl snapshot finalize
- no N+1 per-edge DB lookups

---

# 13. Implementation order for Codex

## PR 1 — Page-type reliability
1. Add primary-entity/listing structural facts.
2. Classifier v3.
3. Report semantics change for optional schema.
4. Backend unit tests + 200-case eval runner.
5. Existing frontend evidence UI should continue working; only adjust labels/evidence rendering if new signal names appear.

Do this **before** link authority, because graph UI will use page-kind filters and incorrect page types would immediately contaminate the new feature.

## PR 2 — Graph computation + persistence
1. `SiteLinkEdge`
2. `SitePageLinkMetric`
3. pure graph builder/PageRank
4. finalization wiring
5. migrations
6. backend tests

## PR 3 — API + frontend
1. page list metrics/sorts
2. URL-detail Links enrichment
3. bounded crawl Link Graph endpoint/view
4. frontend tests

Do not combine all three into one giant PR.

---

# 14. Definition of done

The implementation is complete only when:

- existing crawler performs **zero additional network requests** for graph/authority
- existing parser remains the page fact owner
- graph computation occurs once per completed crawl
- 200 benchmark URLs are loaded by an eval runner
- all 8 confirmed regression cases pass
- recommendation carousels cannot classify a policy/guide page as product
- flat ecommerce collections can classify as category without route-specific paths
- PDP classification survives missing JS-hydrated CTA/price when other primary-product evidence exists
- type-specific false issue applicability is corrected
- PageRank is deterministic and covered by graph math tests
- UI clearly says Internal Authority is crawl-relative
- existing Site Health routes and URL detail are extended, not duplicated
- no external service/API/LLM is introduced
- no domain/platform/SKU hardcoding is introduced
