# Commerce improvement plan

**Status:** implemented 2026-10-09 in one PR (four phases). Shipped behaviour
is owned by [Commerce Intelligence](../commerce-intelligence.md). Items 2.2 and
the locale half of 2.9 were declined after verification; reasons are below.

Feature 10 of the [feature review tracker](feature-review-tracker.md): the
catalog (Site Health projection, CSV import), competitor discovery, buyer
prompts, AI Shelf measurement and the `/products` screen. Shipped behaviour is
owned by [Commerce Intelligence](../commerce-intelligence.md), not by this plan.
Constraints: [invariants](../invariants.md), especially workspace authorization,
commit-before-network-I/O, models never becoming raw truth, distinct
unknown / zero / unavailable states, and the single migration baseline (no
schema change here).

## Why

A read-only audit of the catalog runtime, discovery, buyer prompts, AI Shelf,
the screen and the tests (2026-10-09) found, after verification:

- **A failed target reads as an observed zero, and raises an Action.** A target
  whose executions all failed gets a snapshot with `product_visibility = 0`
  (`commerce/shelf-metrics.ts`), the band shows "0.0%", and the
  `product_not_mentioned` rule (`opportunities/refresh-hits.ts`) opens an Action
  for a product that was never measured.
- **Owned matches are too loose.** Matching is a normalized substring test with
  no token boundary, owned products are tried before competitors, and brand plus
  *any* attribute value ("black", "10") is an owned match at 0.9. "Competitor Y,
  a cheaper alternative to OwnedName" is owned; the same owned product named in
  three prose sentences is three owned slots (`commerce/shelf-parsing.ts`).
- **AI-observed competitors come from unchecked model output.** A resolver
  `product_url` that appears nowhere in the answer, or one on the business's own
  host, becomes a pending competitor (`commerce/shelf.ts`).
- **Shelf resolution spend is hidden and unbounded by quota.** Prose answers
  split into sentences; every unmatched sentence is one sequential model call
  (up to 12 per execution), outside the workspace model quota and the audit
  estimate.
- **Audit freeze duplicates targets.** The freeze loops over approved
  prompt-target rows, so ten prompts on one 2,000-product category copy that
  category ten times into `audits.configuration` with about 30 queries.
- **Category prompt generation fails as a whole.** The category's own name is
  not in the admission vocabulary; any target that admits fewer than `count`
  prompts turns the whole request into a 503 after every model call and quota
  unit was spent. Archived products also feed the prompt context.
- **Catalog writes block the project.** `lockCatalog` takes `FOR UPDATE` on the
  `projects` row, which conflicts with the key-share lock of every foreign-key
  insert into the 69 tables that reference it; a large CSV import stalls audits,
  crawls and queue writes for that project.
- **Projection and import cost.** Each projected product reloads and parses
  every category's facts to find its shelves; each CSV row runs unindexed
  `sku`/`gtin` lookups and about five more statements.
- **Projection failures retry forever-ish.** Permanent failures (no usable URL,
  missing analysis, malformed facts) throw plain errors, so each burns every
  retry before `max_attempts_error`.
- **An unidentified product page hijacks a shelf.** A PDP without SKU, GTIN,
  MPN or price is projected as a category and can take over the real category
  of the same breadcrumb name (`commerce/projection.ts`).
- **"Uncategorized" is both persisted and derived.** The backend keeps a real
  "Uncategorized" category that is not removed when a breadcrumb or CSV category
  is added; the screen also groups category-less products under its own
  "Uncategorized". Products show twice and "Uncategorized" is selectable as a
  discovery or prompt target.
- **The screen.** Commerce Suite is in everyone's navigation, though only
  catalog-selling businesses get a catalog, and a services business is told to
  run a crawl that will never produce one. "N projecting" counts failed and
  cancelled tasks forever. Bulk discovery over ten targets (a category checks
  all its products) returns 400 and nothing is shown; a second discovery drops
  the first one's progress. Shelf numbers do not refresh after an audit. Typed
  prompt text carries to the next target. Raw states and error codes reach
  users, competitors show only a domain, "Review and launch" is disabled with
  no reason, a malformed `?target=` reaches the API and a deep-linked product
  inside a collapsed category is hidden.
- **AI Shelf is a dead end.** The read returns the observations behind the
  numbers, and the business already has commerce Actions
  (`product_not_mentioned`, `catalog_fields_missing`,
  `cited_alternatives_without_uploaded_presence`), but the screen shows four
  percentages with no date, no sample size, no definitions, no evidence and no
  link to anything that would raise them.

File references are to `frontend/services/api/src/` or `frontend/` as noted.

## Decisions (owner, 2026-10-09)

1. **UX addition: shelf evidence and actions** in the target detail: "as of" date and sample size on the band, one-line metric
   definitions, the ranked list of who held the shelf in the latest audit (you,
   an approved competitor, an AI-observed one), the open Actions for that target
   and one guided next step (find competitors → approve → generate prompts →
   launch → open Actions).
2. **Commerce stays in everyone's navigation.** The empty catalog explains
   that crawl projection applies only to catalog-selling business models and
   offers CSV import instead of telling every business to run a crawl.
3. **Shelf resolver spend: one metered call per answer** over its
   unmatched spans that carry a product signal (a list item, a URL, a price or a
   capitalized name), charged to the workspace model quota; an exhausted quota
   leaves spans unresolved rather than failing the execution.

## Phase 1: measurement correctness

| # | Finding | Change | Where |
|---|---|---|---|
| 1.1 | Zero executions read as zero. | A snapshot with no successful executions reads `product_visibility: null` (derived from `successful_execution_count`; no schema change); `product_not_mentioned` and `cited_alternatives…` require at least one successful execution. | `commerce/reads.ts`, `opportunities/refresh-hits.ts`, contract |
| 1.2 | Loose owned matching. | Token-boundary matching with a minimum identifier length; brand plus attribute needs a non-trivial attribute; when a span names both an owned product and an approved competitor, the first named wins; each product counts once per execution. Matcher version bumps. | `commerce/shelf-parsing.ts`, `audits/config` |
| 1.3 | Hallucinated or owned AI-observed competitors. | The resolved URL must appear in the answer text and must not be on an owned host. | `commerce/shelf.ts`, `shelf-parsing.ts` |
| 1.4 | Hidden resolver spend. | Per decision 3. | `commerce/shelf.ts`, `shelf-parsing.ts` |
| 1.5 | Freeze duplicates. | Freeze each distinct target once; prompt-target IDs keep every row. | `commerce/audit-context.ts` |

## Phase 2: catalog runtime

| # | Finding | Change | Where |
|---|---|---|---|
| 2.1 | Project row lock. | Catalog writers lock the project row `FOR NO KEY UPDATE`, which still serializes them and excludes a project delete but no longer conflicts with foreign-key inserts; AI-observed candidate creation uses the same lock. | `commerce/catalog-store.ts`, `shelf.ts` |
| 2.2 | Projection reloads every shelf. | **Declined.** Site Health analyzes a 20-page sample per crawl, so a projection reloads at most 20 shelves; the 2,000-page scenario cannot occur. | — |
| 2.3 | Import cost. | Preload the project's URL/SKU/GTIN identifiers into maps once per import; batch category memberships. | `commerce/import.ts` |
| 2.4 | Permanent projection failures retry. | `TerminalExecutorError` with a specific code. | `commerce/projection.ts`, `catalog-store.ts` |
| 2.5 | Unidentified PDP hijacks a shelf. | A product page that is not identifiable is skipped, never projected as a category. | `commerce/projection.ts` |
| 2.6 | Persisted "Uncategorized". | Stop persisting the sentinel category; the read derives "Uncategorized" from products with no membership. | `commerce/projection.ts`, `import.ts`, `reads.ts` |
| 2.7 | Prompt generation fails as a whole. | Category name joins the vocabulary; archived products leave the context; targets that admit fewer prompts keep what they admitted, and the response reports short targets instead of a 503. | `commerce/buyer-prompts.ts` |
| 2.8 | Projection status. | The catalog read reports in-flight and failed projection counts separately; failures since the latest crawl only. | `commerce/reads.ts`, contract |
| 2.9 | Discovery over-fetches. | Verification stops once the accept limit is reached; unfetched results are `excluded_limit`. The dead `target_name` fallback is removed and `target_context` is required. The locale stays in the query: mapping it to the provider's country parameter is unverified against the live provider and would trade a known weak signal for an unknown failure. | `commerce/discovery.ts` |

## Phase 3: screen (UX addition)

| # | Change | Where |
|---|---|---|
| 3.1 | Decision 1: as-of date and sample size, metric definitions, ranked shelf evidence, target Actions and the guided next step. | `components/products/target-shelf-band.tsx`, new `target-shelf-evidence.tsx`, `target-detail.tsx` |
| 3.2 | Decision 2: the empty catalog says whether crawl projection applies to this business model. | `catalog-list.tsx`, `commerce/reads.ts` |
| 3.3 | Projection badge from in-flight counts; failures shown as such. | `catalog-header.tsx` |
| 3.4 | Bulk discovery: cap stated before sending, errors rendered; concurrent discoveries tracked together. | `commerce-workspace.tsx`, `lib/products/competitor-discovery.ts`, `target-competitors.tsx` |
| 3.5 | Shelf and Actions refresh when a Commerce audit completes. | `lib/products/use-products-screen.ts` |
| 3.6 | Prompt form resets per target; launch explains why it is disabled. | `target-detail.tsx`, `target-prompts.tsx` |
| 3.7 | Readable labels for candidate states and discovery outcomes; competitor rows show product and brand. | `commerce-format.ts`, `target-competitors.tsx` |
| 3.8 | `?target=` validated; a deep-linked product's category opens; the legacy `tab` deletion goes. | `lib/products/use-commerce-target.ts`, `catalog-list.tsx` |
| 3.9 | Dead code: always-true `hasCheckedKeys`, pass-through route wrapper, unused contract fields and the unused `audit_id` shelf parameter. | `commerce-workspace.tsx`, `products-route-content.tsx`, contract, route |

## Phase 4: tests and documents

Tests for credible regressions: a target with no successful executions reads
unavailable and raises no Action; a competitor sentence naming the owned brand;
repeated owned mentions in one answer; a resolver URL absent from the answer or
on an owned host; a duplicate prompt-target freeze; category prompt admission
with partial results; terminal projection failures; an unidentified PDP; no
persisted "Uncategorized"; the projection badge after a failure; the bulk cap
error; the prompt form on target switch. Tests that pin copy, markup, removed
copy or a restated `targetKey` are rewritten or removed.
[Commerce Intelligence](../commerce-intelligence.md) is rewritten from the
shipped behaviour.

## Test debt

Removed: the literal-copy and removed-copy assertions in the catalog header
test, the DOM-order "sticky" test and its test-only `data-testid`, the
restated `targetKey` and empty-loading `catalogEntries` tests, a schema parse
test in the API client, the unreachable `hasCheckedKeys=false` case, the
`.skeleton` class query and the `tagName` pin, and the catalog polling unit
test (the in-flight count is now computed on the server). Rewritten: the
projection failure test asserts the terminal code, not a message. Added:
the regressions listed in Phase 4, each failing on the previous code.

## Deferred to the backlog

- A slim catalog list read with per-target product detail; today the whole
  catalog is returned and polled during a crawl.
- Rejected import rows first in `row_outcomes` and an import outcome view
  (an identifier conflict now names its row).
- Cross-identifier merge in projection (a CSV product at URL A and a crawled
  canonical URL B with the same SKU); needs a merge policy.
- Product edit and archive flows; `edit_version`, `lifecycle_state` and
  `observed_external_id` stay unused until then.
- Snapshot trend per target.
- Tavily country targeting instead of the locale in the query text, verified
  against the live provider.
